import {Router,type Request,type Response,type RequestHandler} from 'express';
import {inTenant} from './db.js';
type A={userId:string;tenantId:string;role:string};
export function employeePortal(authenticated:RequestHandler,actor:(req:Request)=>A){
 const router=Router();
 router.use(authenticated);
 router.get('/me',async(req,res,next)=>{
  try{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,db=>db.query(
    'SELECT e.id,e.employee_code,e.full_name,e.work_email,e.job_title,e.department,e.employment_status FROM employee_accounts link JOIN employees e ON e.id=link.employee_id AND e.tenant_id=link.tenant_id WHERE link.user_id=$1',[a.userId]));
   res.set('Cache-Control','no-store').json({linked:!!r.rowCount,employee:r.rows[0]??null});
  }catch(e){next(e);}
 });
 return router;
}
