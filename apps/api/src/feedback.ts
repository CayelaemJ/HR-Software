import {Router,type Request,type Response,type RequestHandler} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const id=z.string().uuid();
const input=z.object({
 category:z.enum(['review_comment','development_feedback','profile_correction']),
 message:z.string().trim().min(12).max(2500)
});
export function makeFeedbackRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>
  (req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 async function ownEmployee(db:PoolClient,a:Actor):Promise<string|null>{
  const r=await db.query('SELECT employee_id FROM employee_accounts WHERE tenant_id=$1 AND user_id=$2',[a.tenantId,a.userId]);
  return (r.rows[0]?.employee_id as string|undefined)??null;
 }
 router.get('/mine',wrap(async(req,res)=>{
  const a=actor(req);
  const feedback=await inTenant(a.tenantId,a.userId,async db=>{
   const employeeId=await ownEmployee(db,a);
   if(!employeeId)return null;
   const records=await db.query(
    'SELECT id,category,message,status,acknowledged_at,created_at FROM employee_feedback WHERE employee_id=$1 AND submitted_by=$2 ORDER BY created_at DESC LIMIT 100',
    [employeeId,a.userId]);
   return records.rows;
  });
  res.setHeader('Cache-Control','private, no-store');
  if(feedback===null)return res.status(403).json({error:'A linked employee account is required'});
  res.json(feedback);
 }));
 router.post('/mine',rateLimit({windowMs:60*60*1000,limit:6,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const a=actor(req),v=input.parse(req.body);
  const record=await inTenant(a.tenantId,a.userId,async db=>{
   const employeeId=await ownEmployee(db,a);
   if(!employeeId)return null;
   const r=await db.query(
    'INSERT INTO employee_feedback(tenant_id,employee_id,submitted_by,category,message) VALUES($1,$2,$3,$4,$5) RETURNING id,category,message,status,created_at',
    [a.tenantId,employeeId,a.userId,v.category,v.message]);
   await audit(db,a,'employee.feedback_submitted','employee_feedback',r.rows[0].id,{category:v.category});
   return r.rows[0];
  });
  if(!record)return res.status(403).json({error:'A linked employee account is required'});
  res.status(201).json(record);
 }));
 router.use('/hr',(req,res,next)=>{
  if(!['owner','hr_admin'].includes(actor(req).role))return res.status(403).json({error:'Independent HR administrator required'});
  next();
 });
 router.get('/hr',wrap(async(req,res)=>{
  const a=actor(req);
  const records=await inTenant(a.tenantId,a.userId,db=>db.query(
   `SELECT f.id,f.employee_id,e.full_name AS employee_name,f.category,f.message,
      f.status,f.acknowledged_at,f.created_at
     FROM employee_feedback f JOIN employees e ON e.tenant_id=f.tenant_id AND e.id=f.employee_id
     ORDER BY f.created_at DESC LIMIT 200`));
  res.setHeader('Cache-Control','private, no-store');res.json(records.rows);
 }));
 router.patch('/hr/:id/acknowledge',wrap(async(req,res)=>{
  const a=actor(req),feedbackId=id.parse(req.params.id);
  const record=await inTenant(a.tenantId,a.userId,async db=>{
   const r=await db.query(
    `UPDATE employee_feedback AS f SET status='acknowledged',acknowledged_by=$1,acknowledged_at=now()
     WHERE f.id=$2 AND f.status='submitted' AND f.submitted_by<>$1
      AND NOT EXISTS (SELECT 1 FROM employee_accounts ea WHERE ea.tenant_id=f.tenant_id
                      AND ea.employee_id=f.employee_id AND ea.user_id=$1)
     RETURNING id,status,acknowledged_at`,[a.userId,feedbackId]);
   if(!r.rowCount)return null;
   await audit(db,a,'employee.feedback_receipt_acknowledged','employee_feedback',feedbackId,
    {receiptOnly:true,noResolutionImplied:true});
   return r.rows[0];
  });
  if(!record)return res.status(409).json({error:'Feedback unavailable, already acknowledged, or independent HR reviewer required'});
  res.json(record);
 }));
 return router;
}
