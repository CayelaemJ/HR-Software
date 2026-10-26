import {Router,type Request,type Response,type RequestHandler} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Dependencies={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const uid=z.string().uuid();
const input=z.object({
 eventKind:z.enum(['review_started','evidence_requested','escalated','next_action_set']),
 reason:z.string().trim().min(20).max(2000),
 publicSummary:z.string().trim().max(800).default(''),
 nextActionDate:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional()
});
export function makeFairnessRouter({authenticated,actor,audit}:Dependencies){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{if(!['owner','hr_admin'].includes(actor(req).role))return res.status(403).json({error:'HR administrator required'});next();});
 router.get('/cases/:id/followups',wrap(async(req,res)=>{
  const a=actor(req),caseId=uid.parse(req.params.id);
  const events=await inTenant(a.tenantId,a.userId,async db=>{
   const found=await db.query('SELECT id FROM progression_cases WHERE id=$1',[caseId]);
   if(!found.rowCount)return null;
   return db.query('SELECT id,event_kind,reason,public_summary,next_action_date,recorded_by,created_at FROM progression_followups WHERE case_id=$1 ORDER BY created_at ASC LIMIT 200',[caseId]);
  });
  if(!events)return res.status(404).json({error:'Progression case unavailable'});
  res.setHeader('Cache-Control','private, no-store');res.json(events.rows);
 }));
 router.post('/cases/:id/followups',
  rateLimit({windowMs:60_000,limit:12,standardHeaders:'draft-7',legacyHeaders:false}),
  wrap(async(req,res)=>{
   const a=actor(req),caseId=uid.parse(req.params.id),v=input.parse(req.body);
   const followup=await inTenant(a.tenantId,a.userId,async db=>{
    const eligible=await db.query(`SELECT p.id FROM progression_cases p
      WHERE p.id=$1 AND p.status IN ('pending','under_review') AND p.created_by<>$2
        AND NOT EXISTS (SELECT 1 FROM employee_accounts ea
           WHERE ea.tenant_id=p.tenant_id AND ea.employee_id=p.employee_id AND ea.user_id=$2)
        AND NOT EXISTS (SELECT 1 FROM employees e JOIN users u ON u.id=$2
           WHERE e.tenant_id=p.tenant_id AND e.id=p.employee_id
             AND lower(e.work_email)=lower(u.email))`,[caseId,a.userId]);
    if(!eligible.rowCount)return null;
    const row=await db.query(`INSERT INTO progression_followups
      (tenant_id,case_id,event_kind,reason,public_summary,next_action_date,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING id,case_id,event_kind,public_summary,next_action_date,created_at`,
      [a.tenantId,caseId,v.eventKind,v.reason,v.publicSummary,v.nextActionDate??null,a.userId]);
    await audit(db,a,'progression.human_followup_recorded','progression_case',caseId,
      {eventKind:v.eventKind,followupId:row.rows[0].id,hasPublicSummary:v.publicSummary.length>0});
    return row.rows[0];
   });
   if(!followup)return res.status(409).json({error:'Case is unavailable, finalized, or independent HR reviewer required'});
   res.status(201).json(followup);
 }));
 router.get('/overview',wrap(async(req,res)=>{
  const a=actor(req);
  const data=await inTenant(a.tenantId,a.userId,async db=>{
   const cases=await db.query(
    "SELECT p.id,p.kind,p.status,p.created_at,e.full_name AS employee_name, "+
    "date_part('day',now()-p.created_at)::int AS days_waiting, "+
    "CASE WHEN p.status='pending' AND p.created_at < now()-interval '30 days' THEN 'pending_more_than_30_days' "+
    "WHEN p.status='under_review' AND p.created_at < now()-interval '14 days' THEN 'review_open_more_than_14_days' ELSE NULL END AS concern "+
    "FROM progression_cases p JOIN employees e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id "+
    "WHERE (p.status='pending' AND p.created_at < now()-interval '30 days') "+
    "OR (p.status='under_review' AND p.created_at < now()-interval '14 days') "+
    "ORDER BY p.created_at ASC LIMIT 100"
   );
   const totals=await db.query(
    "SELECT count(*)::int AS total, "+
    "count(*) FILTER(WHERE status='pending')::int AS pending, "+
    "count(*) FILTER(WHERE status='under_review')::int AS under_review, "+
    "count(*) FILTER(WHERE status='not_approved')::int AS not_approved "+
    "FROM progression_cases"
   );
   const reviews=await db.query(
    "SELECT count(*)::int AS submitted_over_30_days "+
    "FROM performance_reviews WHERE status='submitted' AND updated_at < now()-interval '30 days'"
   );
   return {thresholds:{pendingDays:30,underReviewDays:14,submittedReviewDays:30},counts:totals.rows[0],submittedReviewsOverdue:reviews.rows[0].submitted_over_30_days,flagged:cases.rows};
  });
  res.setHeader('Cache-Control','private, no-store');
  res.json({...data,disclaimer:'These are workflow-delay signals only. They are not evidence of misconduct, discrimination or promotion entitlement.'});
 }));
 return router;
}
