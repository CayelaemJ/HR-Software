import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
type Role='owner'|'hr_admin'|'recruiter'|'viewer';
type Actor={userId:string;tenantId:string;role:Role};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Dependencies={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const uuid=z.string().uuid();
const submit=z.object({
 employeeId:uuid,reviewId:uuid.optional(),
 kind:z.enum(['promotion','salary_review','career_development','performance_appeal']),
 evidenceSummary:z.string().trim().min(20).max(6000),
 requestedOutcome:z.string().trim().min(10).max(2000)
});
const decide=z.object({
 status:z.enum(['under_review','approved','not_approved','closed']),
 reason:z.string().trim().min(20).max(3000)
});
export function makeProgressionRouter({authenticated,actor,audit}:Dependencies) {
 const router=Router();
 const route=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{
  if(!['owner','hr_admin'].includes(actor(req).role))return res.status(403).json({error:'Authorized Human Capital reviewer required'});
  next();
 });
 router.get('/',route(async(req,res)=>{
  const a=actor(req);
  const data=await inTenant(a.tenantId,a.userId,db=>db.query(
   `SELECT p.id,p.employee_id,e.full_name AS employee_name,p.related_review_id,p.kind,p.evidence_summary,
       p.requested_outcome,p.status,p.decision_reason,p.decided_at,p.created_at,p.created_by,p.decided_by
     FROM progression_cases p JOIN employees e ON e.id=p.employee_id
     ORDER BY p.created_at DESC LIMIT 200`));
  res.json(data.rows);
 }));
 router.post('/',route(async(req,res)=>{
  const a=actor(req),v=submit.parse(req.body);
  const data=await inTenant(a.tenantId,a.userId,async db=>{
   if(v.reviewId) {
    const review=await db.query('SELECT 1 FROM performance_reviews WHERE id=$1 AND employee_id=$2',[v.reviewId,v.employeeId]);
    if(!review.rowCount)return null;
   }
   const row=await db.query(
    `INSERT INTO progression_cases(tenant_id,employee_id,related_review_id,kind,evidence_summary,requested_outcome,created_by)
     SELECT $1,id,$3,$4,$5,$6,$7 FROM employees WHERE id=$2 RETURNING *`,
    [a.tenantId,v.employeeId,v.reviewId??null,v.kind,v.evidenceSummary,v.requestedOutcome,a.userId]);
   if(!row.rowCount)return null;
   await audit(db,a,'progression.case_created','progression_case',row.rows[0].id,{kind:v.kind});
   return row.rows[0];
  });
  if(!data)return res.status(404).json({error:'Employee or referenced review not found'});
  res.status(201).json(data);
 }));
 router.get('/:id/history',route(async(req,res)=>{
  const a=actor(req),id=uuid.parse(req.params.id);
  const events=await inTenant(a.tenantId,a.userId,async db=>{
   const c=await db.query('SELECT id FROM progression_cases WHERE id=$1',[id]);
   if(!c.rowCount)return null;
   return db.query(`SELECT action,actor_id,details,created_at FROM audit_events
     WHERE object_type='progression_case' AND object_id=$1 ORDER BY created_at ASC LIMIT 200`,[id]);
  });
  if(!events)return res.status(404).json({error:'Case not found'});
  res.json(events.rows);
 }));
 router.patch('/:id/decision',route(async(req,res)=>{
  const a=actor(req),id=uuid.parse(req.params.id),v=decide.parse(req.body);
  const record=await inTenant(a.tenantId,a.userId,async db=>{
   const row=await db.query(
    `UPDATE progression_cases SET status=$1,decision_reason=$2,decided_by=$3,decided_at=now()
     WHERE id=$4 AND status IN ('pending','under_review') AND created_by <> $3
     RETURNING *`,[v.status,v.reason,a.userId,id]);
   if(!row.rowCount)return null;
   await audit(db,a,'progression.human_decision','progression_case',id,{status:v.status,reason:v.reason});
   return row.rows[0];
  });
  if(!record)return res.status(409).json({error:'Case missing, already decided, or independent reviewer required'});
  res.json(record);
 }));
 return router;
}
