import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import rateLimit from 'express-rate-limit';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const uid=z.string().uuid();
const iso=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;},{message:'Invalid date'});
const leaveRequest=z.object({leaveType:z.enum(['annual','sick','family_responsibility','study','unpaid','other']),startDate:iso,endDate:iso,employeeNote:z.string().trim().max(1000).default('')}).refine(x=>x.endDate>=x.startDate,{message:'End date must not precede start date'});
const appealInput=z.object({evidenceSummary:z.string().trim().min(20).max(6000),requestedOutcome:z.string().trim().min(10).max(2000)});
const request=z.object({kind:z.enum(['promotion','salary_review','career_development','performance_appeal']),evidenceSummary:z.string().trim().min(20).max(6000),requestedOutcome:z.string().trim().min(10).max(2000)});
export function makeEmployeeRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 async function self(db:PoolClient,a:Actor){
  const found=await db.query('SELECT e.id,e.employee_code,e.full_name,e.department,e.job_title,e.start_date,e.employment_status FROM employee_accounts x JOIN employees e ON e.id=x.employee_id AND e.tenant_id=x.tenant_id WHERE x.tenant_id=$1 AND x.user_id=$2',[a.tenantId,a.userId]);
  return found.rows[0] as {id:string}|undefined;
 }
 router.post('/admin/link',wrap(async(req,res)=>{
  const a=actor(req);if(!['owner','hr_admin'].includes(a.role))return res.status(403).json({error:'HR administrator required'});
  const input=z.object({employeeId:uid}).parse(req.body);
  const linked=await inTenant(a.tenantId,a.userId,async db=>{
   const match=await db.query('SELECT u.id FROM employees e JOIN users u ON lower(u.email)=lower(e.work_email) JOIN memberships m ON m.user_id=u.id AND m.tenant_id=e.tenant_id WHERE e.id=$1 AND e.tenant_id=$2',[input.employeeId,a.tenantId]);
   if(match.rowCount!==1)return null;
   const result=await db.query('INSERT INTO employee_accounts(tenant_id,employee_id,user_id,linked_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING employee_id,linked_at',[a.tenantId,input.employeeId,match.rows[0].id,a.userId]);
   if(!result.rowCount)return {conflict:true};
   await audit(db,a,'employee.account_linked','employee',input.employeeId);
   return result.rows[0];
  });
  if(!linked)return res.status(404).json({error:'Matching organization member not found'});
  if('conflict' in linked)return res.status(409).json({error:'Employee or user already linked'});
  res.status(201).json(linked);
 }));
 router.get('/me',wrap(async(req,res)=>{
  const a=actor(req);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
   const employee=await self(db,a);if(!employee)return {linked:false};
   const [reviews,plans,leaves,cases,tasks]=await Promise.all([
    db.query("SELECT id,period_label,summary,achievements,development_areas,employee_acknowledged_at FROM performance_reviews WHERE employee_id=$1 AND status='finalized' ORDER BY finalized_at DESC LIMIT 40",[employee.id]),
    db.query('SELECT id,goal,actions,success_measure,status,target_date FROM development_plans WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 40',[employee.id]),
    db.query('SELECT id,leave_type,start_date,end_date,status FROM leave_requests WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 40',[employee.id]),
    db.query('SELECT id,kind,related_review_id,requested_outcome,status,decision_reason FROM progression_cases WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 40',[employee.id]),
    db.query('SELECT id,title,category,due_date,status,employee_acknowledged_at FROM onboarding_tasks WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 40',[employee.id])
   ]);
   return {linked:true,employee,reviews:reviews.rows,plans:plans.rows,leaves:leaves.rows,cases:cases.rows,tasks:tasks.rows};
  });
  res.setHeader('Cache-Control','private, no-store');res.json(result);
 }));

 router.patch('/onboarding/:id/acknowledge',wrap(async(req,res)=>{
  const a=actor(req),taskId=uid.parse(req.params.id);
  const record=await inTenant(a.tenantId,a.userId,async db=>{
   const employee=await self(db,a);
   if(!employee)return null;
   const row=await db.query(
    `UPDATE onboarding_tasks SET employee_acknowledged_at=now(),employee_acknowledged_by=$1
     WHERE id=$2 AND employee_id=$3 AND employee_acknowledged_at IS NULL
     RETURNING id,employee_id,status,employee_acknowledged_at`,
    [a.userId,taskId,employee.id]);
   if(!row.rowCount)return null;
   await audit(db,a,'onboarding.employee_receipt_acknowledged','onboarding_task',taskId,
    {receiptDoesNotImplyAgreement:true,hrTaskStatusUnchanged:true});
   return row.rows[0];
  });
  if(!record)return res.status(409).json({error:'Onboarding task unavailable, not yours, or already acknowledged'});
  res.setHeader('Cache-Control','private, no-store');
  res.json(record);
 }));
 router.post('/leave',wrap(async(req,res)=>{
  const a=actor(req),input=leaveRequest.parse(req.body);
  const record=await inTenant(a.tenantId,a.userId,async db=>{
   const employee=await self(db,a);
   if(!employee)return null;
   const created=await db.query("INSERT INTO leave_requests(tenant_id,employee_id,leave_type,start_date,end_date,employee_note,created_by) SELECT $1,id,$3,$4,$5,$6,$7 FROM employees WHERE id=$2 AND employment_status<>'exited' RETURNING id,leave_type,start_date,end_date,status",[a.tenantId,employee.id,input.leaveType,input.startDate,input.endDate,input.employeeNote,a.userId]);
   if(!created.rowCount)return null;
   await audit(db,a,'employee.leave_requested','leave',created.rows[0].id,{decision:'pending_human_approval'});
   return created.rows[0];
  });
  if(!record)return res.status(403).json({error:'Active linked employee account required'});
  res.status(201).json(record);
 }));
 router.post('/progression',wrap(async(req,res)=>{
  const a=actor(req),input=request.parse(req.body);
  const created=await inTenant(a.tenantId,a.userId,async db=>{
   const employee=await self(db,a);if(!employee)return null;
   const row=await db.query('INSERT INTO progression_cases(tenant_id,employee_id,kind,evidence_summary,requested_outcome,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,kind,status',[a.tenantId,employee.id,input.kind,input.evidenceSummary,input.requestedOutcome,a.userId]);
   await audit(db,a,'employee.progression_requested','progression_case',row.rows[0].id,{employeeSubmittedEvidenceNotIndependentlyVerified:true});
   return row.rows[0];
  });
  if(!created)return res.status(403).json({error:'Employee account not linked'});
  res.status(201).json(created);
 }));
 router.post('/reviews/:id/appeal',rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const a=actor(req),reviewId=uid.parse(req.params.id),input=appealInput.parse(req.body);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
   const employee=await self(db,a);if(!employee)return {state:'not_linked'} as const;
   const review=await db.query(
    "SELECT id FROM performance_reviews WHERE id=$1 AND employee_id=$2 AND status='finalized'",
    [reviewId,employee.id]
   );
   if(!review.rowCount)return {state:'not_found'} as const;
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    [a.tenantId+':'+a.userId+':'+reviewId]);
   const open=await db.query(
    "SELECT id FROM progression_cases WHERE employee_id=$1 AND related_review_id=$2 AND created_by=$3 AND kind='performance_appeal' AND status IN ('pending','under_review') LIMIT 1",
    [employee.id,reviewId,a.userId]
   );
   if(open.rowCount)return {state:'already_open'} as const;
   const row=await db.query(
    "INSERT INTO progression_cases(tenant_id,employee_id,related_review_id,kind,evidence_summary,requested_outcome,created_by) VALUES($1,$2,$3,'performance_appeal',$4,$5,$6) RETURNING id,kind,status,related_review_id,created_at",
    [a.tenantId,employee.id,reviewId,input.evidenceSummary,input.requestedOutcome,a.userId]
   );
   await audit(db,a,'employee.performance_appeal_requested','progression_case',row.rows[0].id,{reviewId,source:'employee_evidence_unverified'});
   return {state:'created',record:row.rows[0]} as const;
  });
  if(result.state==='not_linked')return res.status(403).json({error:'Employee profile not linked'});
  if(result.state==='not_found')return res.status(404).json({error:'Finalized review not available for this employee'});
  if(result.state==='already_open')return res.status(409).json({error:'An active appeal is already being reviewed'});
  res.status(201).json(result.record);
 }));
 router.patch('/reviews/:id/acknowledge',wrap(async(req,res)=>{
  const a=actor(req),id=uid.parse(req.params.id);
  const changed=await inTenant(a.tenantId,a.userId,async db=>{
   const employee=await self(db,a);if(!employee)return null;
   const r=await db.query("UPDATE performance_reviews SET employee_acknowledged_at=now(),updated_at=now() WHERE id=$1 AND employee_id=$2 AND status='finalized' AND employee_acknowledged_at IS NULL RETURNING id,employee_acknowledged_at",[id,employee.id]);
   if(!r.rowCount)return null;
   await audit(db,a,'employee.review_received','performance_review',id,{acknowledgementIsNotAgreement:true});
   return r.rows[0];
  });
  if(!changed)return res.status(409).json({error:'Review not available or already acknowledged'});
  res.json(changed);
 }));
 return router;
}
