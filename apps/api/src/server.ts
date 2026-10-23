import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pool, inTenant, forUser } from './db.js';
import { createSession, verifySession, constantTimeEqual, ensureSecurityConfigured } from './security.js';

ensureSecurityConfigured();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/v1/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false }));
// Same-origin write protection for browser cookie sessions. Never accept arbitrary origins.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !['GET','HEAD','OPTIONS'].includes(req.method)) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origin rejected' });
    } catch { return res.status(403).json({ error: 'Invalid origin' }); }
  }
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
const loginSchema = z.object({ email, password: z.string().min(1).max(200), tenantId: uid.optional() });
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
      db.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2', [session.tenantId, session.userId]));
    if (!membership.rowCount) return res.status(403).json({ error: 'Access revoked' });
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
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected', service: 'cabo-human-capital' });
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
  const found = await pool.query('SELECT id,email,full_name,password_hash FROM users WHERE email=$1',[data.email]);
  const u = found.rows[0];
  if (!u || !(await bcrypt.compare(data.password,u.password_hash))) return res.status(401).json({error:'Invalid email or password'});
  const memberships = await forUser(u.id, db => db.query('SELECT tenant_id,role FROM memberships WHERE user_id=$1 ORDER BY created_at',[u.id]));
  const membership = memberships.rows.find(x => !data.tenantId || x.tenant_id === data.tenantId);
  if (!membership) return res.status(403).json({ error: 'No authorized organization' });
  res.cookie(cookieName,createSession(u.id,membership.tenant_id),{...cookieSettings,maxAge:8*60*60*1000});
  res.json({ user:{id:u.id,name:u.full_name,email:u.email}, tenantId:membership.tenant_id, role:membership.role });
}));
app.post('/api/v1/auth/logout', (_req,res) => { res.clearCookie(cookieName,cookieSettings); res.status(204).end(); });
app.get('/api/v1/auth/me', authenticated, wrap(async (req,res) => {
  const a=actor(req);
  const data=await inTenant(a.tenantId,a.userId,async db => {
    const u=await db.query('SELECT id,email,full_name FROM users WHERE id=$1',[a.userId]);
    const org=await db.query('SELECT name FROM organizations WHERE id=$1',[a.tenantId]);
    return {user:u.rows[0], organization:org.rows[0]?.name,tenantId:a.tenantId,role:a.role};
  });
  res.json(data);
}));
app.get('/api/v1/overview',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db => {
    const jobs=await db.query("SELECT count(*)::int AS total, count(*) FILTER(WHERE status='published')::int AS published FROM jobs");
    const candidates=await db.query('SELECT count(*)::int AS total FROM candidates');
    const applications=await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE stage='interview')::int AS interviews FROM applications");
    return {jobs:jobs.rows[0],candidates:candidates.rows[0].total,applications:applications.rows[0]};
  });
  res.json(result);
}));
app.get('/api/v1/jobs',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  const search=typeof req.query.q==='string'?req.query.q.slice(0,100):'';
  const results=await inTenant(a.tenantId,a.userId,db=>db.query(
    'SELECT id,title,department,location,employment_type,description,criteria,status,created_at,published_at FROM jobs WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT 100',['%'+search+'%']));
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
  const r=await inTenant(a.tenantId,a.userId,db=>db.query('SELECT id,full_name,email,headline,notes,created_at FROM candidates ORDER BY created_at DESC LIMIT 100'));
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
    'SELECT a.id,a.stage,a.decision_reason,a.created_at,a.updated_at,j.title AS job_title,c.full_name AS candidate_name FROM applications a JOIN jobs j ON j.id=a.job_id JOIN candidates c ON c.id=a.candidate_id ORDER BY a.updated_at DESC LIMIT 100'));
  res.json(r.rows);
}));
app.post('/api/v1/applications',authenticated,wrap(async(req,res)=>{
  if(!editable(req,res))return;
  const d=applicationSchema.parse(req.body),a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query('INSERT INTO applications(tenant_id,job_id,candidate_id) VALUES($1,$2,$3) RETURNING *',
      [a.tenantId,d.jobId,d.candidateId]);
    await audit(db,a,'application.created','application',r.rows[0].id);
    return r.rows[0];
  });
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
app.get('/api/v1/audit',authenticated,wrap(async(req,res)=>{
  const a=actor(req);
  if(!['owner','hr_admin'].includes(a.role))return res.status(403).json({error:'HR admin required'});
  const r=await inTenant(a.tenantId,a.userId,db=>db.query('SELECT action,object_type,object_id,details,created_at FROM audit_events ORDER BY created_at DESC LIMIT 100'));
  res.json(r.rows);
}));
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
app.listen(port,'0.0.0.0',()=>console.info('CABO Human Capital listening on',port));
