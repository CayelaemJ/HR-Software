import {Router,type Request,type Response,type RequestHandler} from 'express';
import {inTenant} from './db.js';
type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Dependencies={authenticated:RequestHandler;actor:(req:Request)=>Actor};
export function makeFairnessRouter({authenticated,actor}:Dependencies){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{if(!['owner','hr_admin'].includes(actor(req).role))return res.status(403).json({error:'HR administrator required'});next();});
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
