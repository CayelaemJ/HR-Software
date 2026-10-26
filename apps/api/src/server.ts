import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { trustedProxyHops } from './proxy.js';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z, ZodError } from 'zod';
import { randomUUID,createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pool, inTenant, forUser } from './db.js';
import { draftInterviewQuestions } from './ai.js';
import { makeRecruitmentRouter } from './recruitment.js';
import { seedDemoWorkspace } from './demo.js';
import { makePrivacyRouter } from './privacy.js';
import { makePublicCareersRouter } from './careers.js';
import { makeCvRouter } from './documents.js';
import { makeCvAiRouter } from './cv-ai-router.js';
import {startDocumentRetentionScheduler} from './retention.js';
import { makeMfaRouter,verifyLoginSecondFactor } from './mfa.js';
import { makePlatformRouter } from './platform.js';
import { makeProgressionRouter } from './progression.js';
import { makeFairnessRouter } from './fairness.js';
import { makeEmployeeRouter } from './employee.js';
import { makeFeedbackRouter } from './feedback.js';
import { makeHrRouter } from './hr.js';
import {makeAiGovernanceRouter} from './ai-governance.js';
import {makePayrollRouter} from './payroll.js';
import { createSession, verifySession, constantTimeEqual, ensureSecurityConfigured } from './security.js';
import {unsafeBrowserRequest,browserRequestMetadata,protectedApiResponse} from './http-guards.js';

ensureSecurityConfigured();
const app = express();
app.disable('x-powered-by');
// Configure TRUST_PROXY_HOPS=1 only when ingress is a single trusted, append-style reverse proxy.
app.set('trust proxy', trustedProxyHops(process.env.TRUST_PROXY_HOPS));
app.use(helmet());
app.use('/api/v1/cvs', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use('/api/',(req,res,next)=>{
  if(protectedApiResponse(req.path.startsWith('/api')?req.path:'/api'+req.path)){
   res.setHeader('Cache-Control','private, no-store');
   res.setHeader('Pragma','no-cache');
   res.setHeader('X-Robots-Tag','noindex, nofollow');
  }
  next();
});
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/v1/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false }));
// Browser write guard: reject cross-site/sibling-domain requests and mismatched
// Origin/Referer, without breaking non-browser clients using signed sessions.
app.use((req,res,next)=>{
  const expected=process.env.CABO_PUBLIC_ORIGIN ||
    (process.env.NODE_ENV==='production'?'https://cabo-human-capital.onrender.com':undefined);
  const problem=unsafeBrowserRequest(browserRequestMetadata(req),expected);
  if(problem)return res.status(403).json({error:'Cross-origin write rejected'});
  next();
});

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next); };

type Role = 'owner'|'hr_admin'|'recruiter'|'viewer';
type Actor = { userId: string; tenantId: string; role: Role };
declare global {
  namespace Express { interface Request { actor?: Actor } }
}
const email = z.string().email().max(254).transform(s => s.trim().toLowerCase());
const uid = z.string().uuid();
const loginSchema = z.object({ email: z.string().trim().min(3).max(254), password: z.string().min(1).max(200), otpCode:z.string().max(40).optional(), tenantId: uid.optional() });
const jobSchema = z.object({
  title: z.string().trim().min(3).max(150),
  department: z.string().trim().max(100).default(''),
  location: z.string().trim().max(100).default(''),
  employmentType: z.enum(['full-time','part-time','fixed-term','internship','contract']).default('full-time'),
  description: z.string().trim().min(20).max(15000),
  criteria: z.string().trim().min(12).max(8000)
});
const candidateSchema = z.object({
  fullName: z.string().trim().min(2).max(160), email,
  headline: z.string().trim().max(200).default(''),
  notes: z.string().trim().max(3000).default('')
});
const applicationSchema = z.object({ jobId: uid, candidateId: uid });
const stageSchema = z.object({
  stage: z.enum(['human_review','interview','offer','hired','declined','withdrawn']),
  reason: z.string().trim().max(2000).optional()
});
const cookieName = 'cabo_session';
const cookieSettings = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

async function authenticated(req: Request, res: Response, next: NextFunction) {
  try {
    const session = verifySession(req.cookies?.[cookieName]);
    if (!session) return res.status(401).json({ error: 'Please sign in' });
    const membership = await forUser(session.userId, async db =>
      db.query('SELECT m.role,u.session_version FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2', [session.tenantId, session.userId]));
    if (!membership.rowCount || membership.rows[0].session_version !== session.version) return res.status(403).json({ error: 'Access revoked. Please sign in again.' });
    req.actor = { userId: session.userId, tenantId: session.tenantId, role: membership.rows[0].role as Role };
    next();
  } catch (err) { next(err); }
}
function editable(req: Request, res: Response): boolean {
  if (!req.actor || !['owner','hr_admin','recruiter'].includes(req.actor.role)) {
    res.status(403).json({ error: 'Role cannot modify recruitment records' });
    return false;
  }
  return true;
}
function actor(req: Request): Actor { if (!req.actor) throw new Error('Missing authenticated actor'); return req.actor; }
async function audit(db: import('pg').PoolClient, a: Actor, action: string, objectType: string, objectId: string, details: object = {}) {
  await db.query('INSERT INTO audit_events (tenant_id,actor_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5,$6)',
    [a.tenantId,a.userId,action,objectType,objectId,JSON.stringify(details)]);
}
app.get('/health', wrap(async (_req, res) => {
  // Probe as the restricted runtime role, not just the privileged migration owner.
  await inTenant('00000000-0000-4000-8000-000000000000','00000000-0000-4000-8000-000000000000',db=>db.query('SELECT 1'));
  res.json({ status: 'ok', database: 'connected', tenantIsolation: 'runtime-role-enforced', service: 'cabo-human-capital' });
}));
app.post('/api/v1/setup', wrap(async (req,res) => {
  const setupSecret = process.env.BOOTSTRAP_TOKEN ?? '';
  const supplied = req.get('x-setup-token') ?? '';
  if (setupSecret.length < 24 || !constantTimeEqual(supplied, setupSecret)) return res.status(404).json({ error: 'Not found' });
  const data = z.object({
    organization: z.string().trim().min(2).max(160),
    name: z.string().trim().min(2).max(160),
    email, password: z.string().min(12).max(200)
  }).parse(req.body);
  const id = randomUUID(), userId = randomUUID();
  const hash = await bcrypt.hash(data.password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const slot = await client.query('INSERT INTO bootstrap_lock(id) VALUES (1) ON CONFLICT DO NOTHING RETURNING id');
    if (!slot.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Initial setup already completed' }); }
    await client.query('SELECT set_config($1,$2,true),set_config($3,$4,true)',
      ['app.tenant_id',id,'app.user_id',userId]);
    await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[id,data.organization]);
    await client.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)',[userId,data.email,data.name,hash]);
    await client.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",[id,userId]);
    await client.query('COMMIT');
    res.status(201).json({ created: true, message: 'Owner created; remove BOOTSTRAP_TOKEN from Render now.' });
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}));
app.post('/api/v1/auth/login', wrap(async (req,res) => {
  const data = loginSchema.parse(req.body);
  const identifier = data.email.trim().toLowerCase();
  const found = await pool.query('SELECT id,email,full_name,password_hash,session_version,mfa_enabled FROM users WHERE email=$1 OR username=$1 LIMIT 1',[identifier]);
  const u = found.rows[0];
  if (!u || !(await bcrypt.compare(data.password,u.password_hash))) return res.status(401).json({error:'Invalid email or password'});
  if (u.mfa_enabled && (!data.otpCode || !await verifyLoginSecondFactor(u.id,data.otpCode)))
    return res.status(401).json({error:'Valid authenticator or recovery code required'});
  const memberships = await forUser(u.id, db => db.query('SELECT tenant_id,role FROM memberships WHERE user_id=$1 ORDER BY created_at',[u.id]));
  const membership = memberships.rows.find(x => !data.tenantId || x.tenant_id === data.tenantId);
  if (!membership) return res.status(403).json({ error: 'No authorized organization' });
  res.cookie(cookieName,createSession(u.id,membership.tenant_id,Date.now(),u.session_version),{...cookieSettings,maxAge:8*60*60*1000});
  res.json({ user:{id:u.id,name:u.full_name,email:u.email}, tenantId:membership.tenant_id, role:membership.role });
}));
app.post('/api/v1/auth/logout', (_req,res) => { res.clearCookie(cookieName,cookieSettings); res.status(204).end(); });
app.post('/api/v1/auth/change-password',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  const d=z.object({currentPassword:z.string().min(1).max(200),newPassword:z.string().min(12).max(200)}).parse(req.body);
  const u=await pool.query('SELECT password_hash FROM users WHERE id=$1',[a.userId]);
  if(!u.rowCount || !await bcrypt.compare(d.currentPassword,u.rows[0].password_hash))
    return res.status(403).json({error:'Current password is incorrect'});
  if(d.currentPassword===d.newPassword)return res.status(400).json({error:'Choose a new, different password'});
  const hash=await bcrypt.hash(d.newPassword,12);
  await inTenant(a.tenantId,a.userId,async db=>{
    await db.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2',[hash,a.userId]);
    await audit(db,a,'account.password_changed','user',a.userId);
  });
  res.clearCookie(cookieName,cookieSettings);res.status(204).end();
}));
app.get('/api/v1/auth/me', authenticated, wrap(async (req,res) => {
  const a=actor(req);
  const data=await inTenant(a.tenantId,a.userId,async db => {
    const u=await db.query('SELECT id,email,full_name FROM users WHERE id=$1',[a.userId]);
    const org=await db.query('SELECT name FROM organizations WHERE id=$1',[a.tenantId]);
    const platform=await db.query('SELECT 1 FROM platform_administrators WHERE user_id=$1',[a.userId]);
    return {user:u.rows[0], organization:org.rows[0]?.name,tenantId:a.tenantId,role:a.role,platformAdmin:!!platform.rowCount};
  });
  res.json(data);
}));
app.get('/api/v1/overview',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db => {
    const jobs=await db.query("SELECT count(*)::int AS total, count(*) FILTER(WHERE status='published')::int AS published FROM jobs");
    const candidates=await db.query('SELECT count(*)::int AS total FROM candidates');
    const applications=await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE stage='interview')::int AS interviews FROM applications");
    const demo=await db.query('SELECT 1 FROM demo_seed_runs WHERE tenant_id=$1',[a.tenantId]);
    return {jobs:jobs.rows[0],candidates:candidates.rows[0].total,applications:applications.rows[0],demoSeeded:!!demo.rowCount};
  });
  res.json(result);
}));
app.get('/api/v1/jobs',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  const search=typeof req.query.q==='string'?req.query.q.slice(0,100):'';
  const results=await inTenant(a.tenantId,a.userId,db=>db.query(
    'SELECT id,title,department,location,employment_type,description,criteria,status,is_demo,created_at,published_at FROM jobs WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT 100',['%'+search+'%']));
  res.json(results.rows);
}));
app.post('/api/v1/jobs',authenticated,wrap(async(req,res)=>{
  if(!editable(req,res)) return;
  const data=jobSchema.parse(req.body),a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query("INSERT INTO jobs(tenant_id,title,department,location,employment_type,description,criteria,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [a.tenantId,data.title,data.department,data.location,data.employmentType,data.description,data.criteria,a.userId]);
    await audit(db,a,'job.created','job',r.rows[0].id);
    return r.rows[0];
  });
  res.status(201).json(result);
}));
app.patch('/api/v1/jobs/:id/status',authenticated,wrap(async(req,res)=>{
  if(!editable(req,res)) return;
  const id=uid.parse(req.params.id), {status}=z.object({status:z.enum(['published','closed','draft'])}).parse(req.body),a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query("UPDATE jobs SET status=$1,published_at=CASE WHEN $1='published' THEN COALESCE(published_at,now()) ELSE published_at END WHERE id=$2 RETURNING *",[status,id]);
    if(r.rowCount) await audit(db,a,'job.status_changed','job',id,{status});
    return r.rows[0];
  });
  if(!result)return res.status(404).json({error:'Vacancy not found'});
  res.json(result);
}));
app.get('/api/v1/candidates',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  const r=await inTenant(a.tenantId,a.userId,db=>db.query('SELECT id,full_name,email,headline,notes,is_demo,created_at FROM candidates ORDER BY created_at DESC LIMIT 100'));
  res.json(r.rows);
}));
app.post('/api/v1/candidates',authenticated,wrap(async(req,res)=>{
  if(!editable(req,res))return;
  const d=candidateSchema.parse(req.body),a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query('INSERT INTO candidates(tenant_id,full_name,email,headline,notes) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [a.tenantId,d.fullName,d.email,d.headline,d.notes]);
    await audit(db,a,'candidate.created','candidate',r.rows[0].id);
    return r.rows[0];
  });
  res.status(201).json(result);
}));
app.get('/api/v1/applications',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  const r=await inTenant(a.tenantId,a.userId,db=>db.query(
    'SELECT a.id,a.stage,a.is_demo,a.decision_reason,a.created_at,a.updated_at,j.title AS job_title,c.full_name AS candidate_name FROM applications a JOIN jobs j ON j.id=a.job_id JOIN candidates c ON c.id=a.candidate_id ORDER BY a.updated_at DESC LIMIT 100'));
  res.json(r.rows);
}));
app.post('/api/v1/applications',authenticated,wrap(async(req,res)=>{
  if(!editable(req,res))return;
  const d=applicationSchema.parse(req.body),a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query("INSERT INTO applications(tenant_id,job_id,candidate_id) SELECT $1,j.id,$3 FROM jobs j WHERE j.id=$2 AND j.status='published' RETURNING *",
      [a.tenantId,d.jobId,d.candidateId]);
    if(!r.rowCount)return null;
    await audit(db,a,'application.created','application',r.rows[0].id);
    return r.rows[0];
  });
  if(!result)return res.status(400).json({error:'Choose a published vacancy in your organization'});
  res.status(201).json(result);
}));
app.patch('/api/v1/applications/:id/stage',authenticated,wrap(async(req,res)=>{
  if(!editable(req,res))return;
  const id=uid.parse(req.params.id),d=stageSchema.parse(req.body),a=actor(req);
  if(['hired','declined'].includes(d.stage) && (!d.reason || d.reason.length<12))
    return res.status(400).json({error:'A documented human decision reason of at least 12 characters is required'});
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query('UPDATE applications SET stage=$1,decision_reason=$2,human_decision_by=$3,updated_at=now() WHERE id=$4 RETURNING *',
      [d.stage,d.reason??null,a.userId,id]);
    if(r.rowCount)await audit(db,a,'application.human_stage_changed','application',id,{stage:d.stage,reason:d.reason??null});
    return r.rows[0];
  });
  if(!result)return res.status(404).json({error:'Application not found'});
  res.json(result);
}));

const aiDraftLimit = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders:'draft-7',legacyHeaders:false });
app.post('/api/v1/ai/interview-questions', authenticated, aiDraftLimit, wrap(async (req,res) => {
  if(!editable(req,res)) return;
  const { jobId }=z.object({jobId:uid}).parse(req.body);
  const a=actor(req);
  const result=await inTenant(a.tenantId,a.userId, async db=>
    db.query('SELECT id,title,description,criteria FROM jobs WHERE id=$1',[jobId]));
  if(!result.rowCount)return res.status(404).json({error:'Vacancy not found'});
  let draft:Awaited<ReturnType<typeof draftInterviewQuestions>>;
  try {
    draft=await draftInterviewQuestions(result.rows[0]);
  } catch(error) {
    const message=error instanceof Error?error.message:'AI provider unavailable';
    if(message==='AI is not configured')return res.status(503).json({error:'AI drafting is not configured'});
    console.warn('AI drafting failed (no candidate data sent):',message.slice(0,100));
    return res.status(503).json({error:'Groq drafting is temporarily unavailable. You can continue manual recruitment and retry later.'});
  }
  const fingerprint=createHash('sha256').update(JSON.stringify({
    title:result.rows[0].title,description:result.rows[0].description,
    criteria:result.rows[0].criteria
  })).digest('hex');
  const record=await inTenant(a.tenantId,a.userId,async db=>{
    const saved=await db.query(`INSERT INTO ai_question_drafts
      (tenant_id,job_id,model_provider,model_name,input_sha256,questions,generated_by)
      VALUES($1,$2,'groq',$3,$4,$5::jsonb,$6) RETURNING id,status`,
      [a.tenantId,jobId,draft.model,fingerprint,JSON.stringify(draft.questions),a.userId]);
    await audit(db,a,'ai.interview_questions_drafted','ai_question_draft',saved.rows[0].id,
      {provider:'groq',model:draft.model,questionCount:draft.questions.length,
       inputSha256:fingerprint,status:'pending_review',candidateDataSent:false});
    return saved.rows[0];
  });
  res.setHeader('Cache-Control','private, no-store');
  res.json({...draft,draftId:record.id,reviewStatus:record.status});
}));

app.get('/api/v1/audit',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  if(!['owner','hr_admin'].includes(a.role))return res.status(403).json({error:'HR admin required'});
  const r=await inTenant(a.tenantId,a.userId,db=>db.query('SELECT action,object_type,object_id,details,created_at FROM audit_events ORDER BY created_at DESC LIMIT 100'));
  res.json(r.rows);
}));
app.post('/api/v1/demo/seed',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  if(a.role!=='owner')return res.status(403).json({error:'Organization owner required'});
  const results=await seedDemoWorkspace(a,audit);
  res.status(results.alreadySeeded?200:201).json(results);
}));
app.use('/api/v1/ai/drafts',makeAiGovernanceRouter({authenticated,actor,audit}));
app.use('/api/v1/public',makePublicCareersRouter());
app.use('/api/v1/cvs',makeCvRouter({authenticated,actor,audit}));
app.use('/api/v1/ai/cv',makeCvAiRouter({authenticated,actor,audit}));
app.use('/api/v1/mfa',makeMfaRouter({authenticated,actor,audit}));
app.use('/api/v1/platform',makePlatformRouter({authenticated,actor,audit,setSession:(res,userId,tenantId,version)=>res.cookie(cookieName,createSession(userId,tenantId,Date.now(),version),{...cookieSettings,maxAge:8*60*60*1000})}));
app.use('/api/v1',makeRecruitmentRouter({authenticated,editable,actor,audit}));
app.use('/api/v1/hr/integrations/payroll',makePayrollRouter({authenticated,actor,audit}));
app.use('/api/v1/hr',makeHrRouter({authenticated,actor,audit}));
app.use('/api/v1/hr/progression',makeProgressionRouter({authenticated,actor,audit}));
app.use('/api/v1/employee',makeEmployeeRouter({authenticated,actor,audit}));
app.use('/api/v1/feedback',makeFeedbackRouter({authenticated,actor,audit}));
app.use('/api/v1/hr/fairness',makeFairnessRouter({authenticated,actor,audit}));
app.use('/api/v1/privacy',makePrivacyRouter({authenticated,actor,audit}));
app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
const staticRoot=resolve(process.cwd(),'apps/web/dist');
if(existsSync(staticRoot)) {
  app.use(express.static(staticRoot,{index:false,maxAge:'1h'}));
  app.get('*',(_req,res)=>res.sendFile(resolve(staticRoot,'index.html')));
}
app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  if(error instanceof ZodError)return res.status(400).json({error:'Invalid input',issues:error.issues.map(x=>({path:x.path,message:x.message}))});
  if(error&&typeof error==='object'&&'code' in error) {
    const code=(error as {code?:string}).code;
    if(code==='23505')return res.status(409).json({error:'Duplicate record'});
    if(code==='23503')return res.status(400).json({error:'Linked record missing or not accessible'});
  }
  console.error('Request failed:',error instanceof Error?error.message:'unknown error');
  res.status(500).json({error:'Unexpected server error'});
});
const port=Number(process.env.PORT||3000);
app.listen(port,'0.0.0.0',()=>{
  console.info('CABO Human Capital listening on',port);
  startDocumentRetentionScheduler();
});
