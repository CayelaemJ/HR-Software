import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';

type Role='owner'|'hr_admin'|'recruiter'|'viewer';
type Actor={userId:string;tenantId:string;role:Role};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Dependencies={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const uid=z.string().uuid();
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const safeText=(max:number)=>z.string().trim().max(max);
const employeeInput=z.object({
 employeeCode:z.string().trim().min(2).max(50),
 fullName:z.string().trim().min(2).max(160),
 workEmail:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),
 department:safeText(100).default(''),jobTitle:safeText(150).default(''),startDate:isoDate
});
const onboardingInput=z.object({
 employeeId:uid,title:z.string().trim().min(4).max(200),
 category:z.enum(['documents','it','orientation','training','other']),dueDate:isoDate.optional()
});
const leaveInput=z.object({
 employeeId:uid,leaveType:z.enum(['annual','sick','family_responsibility','study','unpaid','other']),
 startDate:isoDate,endDate:isoDate,employeeNote:safeText(2000).default('')
}).refine(v=>v.endDate>=v.startDate,{message:'End date must follow start date',path:['endDate']});
const reviewInput=z.object({
 employeeId:uid,periodLabel:z.string().trim().min(3).max(80),
 summary:z.string().trim().min(20).max(6000),achievements:safeText(5000).default(''),developmentAreas:safeText(5000).default('')
});
const planInput=z.object({
 employeeId:uid,reviewId:uid.optional(),
 goal:z.string().trim().min(12).max(1200),actions:z.string().trim().min(12).max(4000),
 successMeasure:z.string().trim().min(8).max(1500),targetDate:isoDate.optional()
});
function writer(a:Actor){return a.role==='owner'||a.role==='hr_admin';}
function access(req:Request,res:Response,actor:(req:Request)=>Actor,writable=false){
 const a=actor(req);
 if((writable&&!writer(a))||(!writable&&!writer(a))){res.status(403).json({error:'Human Capital HR administrator access required'});return false;}
 return true;
}
function csvField(value:unknown){
 const valueText=String(value??'');
 // Spreadsheet formula injection prevention, even when exporting innocuous HR text.
 const neutral=/^[\s]*[=+\-@\t\r]/.test(valueText)?"'"+valueText:valueText;
 return '"'+neutral.replace(/"/g,'""')+'"';
}
export function makeHrRouter({authenticated,actor,audit}:Dependencies){
 const router=Router();
 const route=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{if(!access(req,res,actor))return;next();});

 router.get('/employees',route(async(req,res)=>{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,db=>db.query(
    'SELECT id,employee_code,full_name,work_email,department,job_title,employment_status,start_date,exit_date,created_at FROM employees ORDER BY created_at DESC LIMIT 250'));
   res.json(r.rows);
 }));
 router.post('/employees',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const v=employeeInput.parse(req.body);
   const employee=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`INSERT INTO employees(tenant_id,employee_code,full_name,work_email,department,job_title,start_date,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,employee_code,full_name,work_email,department,job_title,employment_status,start_date`,
      [a.tenantId,v.employeeCode,v.fullName,v.workEmail,v.department,v.jobTitle,v.startDate,a.userId]);
     await audit(db,a,'employee.created','employee',r.rows[0].id);
     return r.rows[0];
   });res.status(201).json(employee);
 }));
 router.patch('/employees/:id/status',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const id=uid.parse(req.params.id);
   const v=z.object({status:z.enum(['active','on_leave','exited']),exitDate:isoDate.optional(),reason:z.string().trim().min(12).max(2000)}).parse(req.body);
   if(v.status==='exited'&&!v.exitDate)return res.status(400).json({error:'Exit date is mandatory when ending employment'});
   const record=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`UPDATE employees SET employment_status=$1,exit_date=$2,updated_at=now()
       WHERE id=$3 AND ($2::date IS NULL OR $2::date>=start_date) RETURNING *`,[v.status,v.status==='exited'?v.exitDate:null,id]);
     if(r.rowCount)await audit(db,a,'employee.human_status_changed','employee',id,{status:v.status,exitDate:v.exitDate??null,reason:v.reason});
     return r.rows[0];
   });if(!record)return res.status(404).json({error:'Employee missing or invalid employment dates'});
   res.json(record);
 }));

 router.get('/onboarding',route(async(req,res)=>{
   const a=actor(req),employeeId=req.query.employeeId?uid.parse(req.query.employeeId):null;
   const r=await inTenant(a.tenantId,a.userId,db=>db.query(`SELECT t.id,t.employee_id,e.full_name AS employee_name,t.title,t.category,t.due_date,t.status,t.completion_note,t.completed_at
     FROM onboarding_tasks t JOIN employees e ON e.id=t.employee_id
     WHERE ($1::uuid IS NULL OR t.employee_id=$1) ORDER BY t.created_at DESC LIMIT 200`,[employeeId]));
   res.json(r.rows);
 }));
 router.post('/onboarding',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const v=onboardingInput.parse(req.body);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`INSERT INTO onboarding_tasks(tenant_id,employee_id,title,category,due_date,created_by)
       SELECT $1,id,$3,$4,$5,$6 FROM employees WHERE id=$2 RETURNING *`,
       [a.tenantId,v.employeeId,v.title,v.category,v.dueDate??null,a.userId]);
     if(!r.rowCount)return null;
     await audit(db,a,'onboarding.task_created','onboarding_task',r.rows[0].id);
     return r.rows[0];
   });if(!data)return res.status(404).json({error:'Employee not found'});
   res.status(201).json(data);
 }));
 router.patch('/onboarding/:id',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const id=uid.parse(req.params.id),v=z.object({status:z.enum(['completed','waived']),completionNote:z.string().trim().min(8).max(2000)}).parse(req.body);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`UPDATE onboarding_tasks SET status=$1,completion_note=$2,completed_by=$3,completed_at=now()
       WHERE id=$4 AND status='pending' RETURNING *`,[v.status,v.completionNote,a.userId,id]);
     if(r.rowCount)await audit(db,a,'onboarding.task_resolved','onboarding_task',id,{status:v.status,note:v.completionNote});
     return r.rows[0];
   });if(!data)return res.status(409).json({error:'Task missing or already resolved'});
   res.json(data);
 }));

 router.get('/leave',route(async(req,res)=>{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,db=>db.query(`SELECT l.id,l.employee_id,e.full_name AS employee_name,l.leave_type,l.start_date,l.end_date,l.employee_note,l.status,l.decision_reason,l.created_at
      FROM leave_requests l JOIN employees e ON e.id=l.employee_id ORDER BY l.created_at DESC LIMIT 200`));
   res.json(r.rows);
 }));
 router.post('/leave',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const v=leaveInput.parse(req.body);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`INSERT INTO leave_requests(tenant_id,employee_id,leave_type,start_date,end_date,employee_note,created_by)
       SELECT $1,id,$3,$4,$5,$6,$7 FROM employees WHERE id=$2 AND employment_status <> 'exited' RETURNING *`,
       [a.tenantId,v.employeeId,v.leaveType,v.startDate,v.endDate,v.employeeNote,a.userId]);
     if(!r.rowCount)return null;
     await audit(db,a,'leave.request_recorded','leave',r.rows[0].id,{type:v.leaveType});
     return r.rows[0];
   });if(!data)return res.status(400).json({error:'Employee not active or missing'});
   res.status(201).json(data);
 }));
 router.patch('/leave/:id/status',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const id=uid.parse(req.params.id),v=z.object({
     status:z.enum(['approved','rejected','cancelled']),reason:z.string().trim().min(12).max(2000)
   }).parse(req.body);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`UPDATE leave_requests SET status=$1,decision_reason=$2,decided_by=$3,decided_at=now()
       WHERE id=$4 AND status='pending' RETURNING *`,[v.status,v.reason,a.userId,id]);
     if(r.rowCount)await audit(db,a,'leave.human_decision','leave',id,{status:v.status,reason:v.reason});
     return r.rows[0];
   });if(!data)return res.status(409).json({error:'Leave request not found or already decided'});
   res.json(data);
 }));

 router.get('/reviews',route(async(req,res)=>{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,db=>db.query(`SELECT r.id,r.employee_id,e.full_name AS employee_name,r.period_label,r.summary,r.achievements,r.development_areas,r.status,r.created_at,r.updated_at
     FROM performance_reviews r JOIN employees e ON e.id=r.employee_id ORDER BY r.created_at DESC LIMIT 200`));
   res.json(r.rows);
 }));
 router.post('/reviews',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const v=reviewInput.parse(req.body);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`INSERT INTO performance_reviews(tenant_id,employee_id,period_label,summary,achievements,development_areas,reviewer_id)
       SELECT $1,id,$3,$4,$5,$6,$7 FROM employees WHERE id=$2 RETURNING *`,
       [a.tenantId,v.employeeId,v.periodLabel,v.summary,v.achievements,v.developmentAreas,a.userId]);
     if(!r.rowCount)return null;
     await audit(db,a,'review.drafted','performance_review',r.rows[0].id);
     return r.rows[0];
   });if(!data)return res.status(404).json({error:'Employee not found'});
   res.status(201).json(data);
 }));
 router.patch('/reviews/:id/status',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const id=uid.parse(req.params.id),v=z.object({status:z.enum(['submitted','finalized']),reason:z.string().trim().min(12).max(2000)}).parse(req.body);
   const record=await inTenant(a.tenantId,a.userId,async db=>{
     const allowed=v.status==='submitted'?'draft':'submitted';
     const r=await db.query(`UPDATE performance_reviews SET status=$1,updated_at=now(),
        finalized_at=CASE WHEN $1='finalized' THEN now() ELSE finalized_at END
       WHERE id=$2 AND status=$3 RETURNING *`,[v.status,id,allowed]);
     if(r.rowCount)await audit(db,a,'review.human_status_changed','performance_review',id,{status:v.status,reason:v.reason});
     return r.rows[0];
   });if(!record)return res.status(409).json({error:'Review must move draft → submitted → finalized'});
   res.json(record);
 }));
 router.get('/development',route(async(req,res)=>{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,db=>db.query(`SELECT p.id,p.employee_id,e.full_name AS employee_name,p.review_id,p.goal,p.actions,p.success_measure,p.target_date,p.progress_note,p.status,p.created_at
    FROM development_plans p JOIN employees e ON e.id=p.employee_id ORDER BY p.created_at DESC LIMIT 200`));
   res.json(r.rows);
 }));
 router.post('/development',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const v=planInput.parse(req.body);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     if(v.reviewId){
       const review=await db.query('SELECT id FROM performance_reviews WHERE id=$1 AND employee_id=$2',[v.reviewId,v.employeeId]);
       if(!review.rowCount)return null;
     }
     const r=await db.query(`INSERT INTO development_plans(tenant_id,employee_id,review_id,goal,actions,success_measure,target_date,created_by)
       SELECT $1,id,$3,$4,$5,$6,$7,$8 FROM employees WHERE id=$2 RETURNING *`,
      [a.tenantId,v.employeeId,v.reviewId??null,v.goal,v.actions,v.successMeasure,v.targetDate??null,a.userId]);
     if(!r.rowCount)return null;
     await audit(db,a,'development.plan_created','development_plan',r.rows[0].id);
     return r.rows[0];
   });if(!data)return res.status(404).json({error:'Employee or related review not found'});
   res.status(201).json(data);
 }));
 router.patch('/development/:id',route(async(req,res)=>{
   const a=actor(req);if(!access(req,res,actor,true))return;
   const id=uid.parse(req.params.id),v=z.object({status:z.enum(['planned','in_progress','completed','paused']),progressNote:z.string().trim().min(12).max(2500)}).parse(req.body);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query(`UPDATE development_plans SET status=$1,progress_note=$2,updated_by=$3,updated_at=now()
       WHERE id=$4 RETURNING *`,[v.status,v.progressNote,a.userId,id]);
     if(r.rowCount)await audit(db,a,'development.human_progress_updated','development_plan',id,{status:v.status});
     return r.rows[0];
   });if(!data)return res.status(404).json({error:'Development plan not found'});
   res.json(data);
 }));

 router.get('/reports/overview',route(async(req,res)=>{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,async db=>{
     const headcount=await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE employment_status='active')::int AS active,count(*) FILTER(WHERE employment_status='on_leave')::int AS on_leave FROM employees");
     const leave=await db.query("SELECT status,count(*)::int AS count FROM leave_requests GROUP BY status ORDER BY status");
     const reviews=await db.query("SELECT status,count(*)::int AS count FROM performance_reviews GROUP BY status ORDER BY status");
     const development=await db.query("SELECT status,count(*)::int AS count FROM development_plans GROUP BY status ORDER BY status");
     const departments=await db.query("SELECT department,count(*)::int AS count FROM employees GROUP BY department ORDER BY count DESC LIMIT 30");
     const onboarding=await db.query("SELECT count(*) FILTER(WHERE status='pending')::int AS pending FROM onboarding_tasks");
     return {headcount:headcount.rows[0],leave:leave.rows,reviews:reviews.rows,development:development.rows,departments:departments.rows,onboarding:onboarding.rows[0]};
   });
   res.json(r);
 }));
 router.get('/reports/employees.csv',route(async(req,res)=>{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,db=>db.query('SELECT employee_code,full_name,work_email,department,job_title,employment_status,start_date FROM employees ORDER BY employee_code LIMIT 10000'));
   const headers=['Employee code','Full name','Work email','Department','Job title','Status','Start date'];
   const keys=['employee_code','full_name','work_email','department','job_title','employment_status','start_date'];
   const csv=[headers.map(csvField).join(','),...r.rows.map(row=>keys.map(k=>csvField(row[k] instanceof Date?row[k].toISOString().slice(0,10):row[k])).join(','))].join('\r\n');
   await inTenant(a.tenantId,a.userId,db=>audit(db,a,'report.employees_exported','organization',a.tenantId,{recordCount:r.rowCount}));
   res.setHeader('Content-Type','text/csv; charset=utf-8');
   res.setHeader('Content-Disposition','attachment; filename="cabo-hr-employees.csv"');
   res.setHeader('Cache-Control','no-store');
   res.send('\uFEFF'+csv);
 }));
 return router;
}
