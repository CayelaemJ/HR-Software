import {Router,type Request,type Response,type RequestHandler} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {pool,inTenant,forUser} from './db.js';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={
 authenticated:RequestHandler;
 actor:(req:Request)=>Actor;
 audit:Audit;
 setSession:(res:Response,userId:string,tenantId:string,version:number)=>void;
};
const uuid=z.string().uuid();
const tenantInput=z.object({name:z.string().trim().min(2).max(160)});
export function makePlatformRouter({authenticated,actor,audit,setSession}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>
   (req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 async function platformAccess(a:Actor){
   const r=await pool.query(`SELECT u.mfa_enabled FROM platform_administrators p
     JOIN users u ON u.id=p.user_id WHERE p.user_id=$1`,[a.userId]);
   if(!r.rowCount)return 'denied';
   if(!r.rows[0].mfa_enabled)return 'mfa_required';
   return 'allowed';
 }
 router.get('/overview',wrap(async(req,res)=>{
   const a=actor(req),access=await platformAccess(a);
   if(access!=='allowed')return res.status(403).json({error:access==='mfa_required'?
     'Enable authenticator MFA from Privacy & access to use CABO platform administration':
     'CABO platform administrator required'});
   const r=await pool.query(`SELECT o.id,o.name,o.created_at,
    (SELECT count(*)::int FROM memberships m WHERE m.tenant_id=o.id) AS members,
    (SELECT count(*)::int FROM jobs j WHERE j.tenant_id=o.id) AS vacancies,
    (SELECT count(*)::int FROM candidates c WHERE c.tenant_id=o.id) AS candidates,
    (SELECT count(*)::int FROM employees e WHERE e.tenant_id=o.id) AS employees,
    EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=o.id AND m.user_id=$1) AS can_switch
    FROM organizations o ORDER BY o.created_at DESC LIMIT 100`,[a.userId]);
   res.setHeader('Cache-Control','private, no-store');
   res.json({organizations:r.rows});
 }));
 router.post('/organizations',wrap(async(req,res)=>{
   const a=actor(req),access=await platformAccess(a);
   if(access!=='allowed')return res.status(403).json({error:'CABO platform administrator with MFA required'});
   const input=tenantInput.parse(req.body),id=randomUUID();
   const created=await inTenant(id,a.userId,async db=>{
     const org=await db.query('INSERT INTO organizations(id,name) VALUES($1,$2) RETURNING id,name,created_at',[id,input.name]);
     await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",[id,a.userId]);
     await audit(db,{...a,tenantId:id},'platform.organization_created','organization',id,{selfProvisionedBy:a.userId});
     return org.rows[0];
   });
   res.status(201).json({...created,message:'Organization created. Access is limited to its designated owner until staff are explicitly invited.'});
 }));
 router.post('/switch-tenant',wrap(async(req,res)=>{
   const a=actor(req),{tenantId}=z.object({tenantId:uuid}).parse(req.body);
   const membership=await forUser(a.userId,db=>db.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2',[tenantId,a.userId]));
   if(!membership.rowCount)return res.status(403).json({error:'You are not a member of this organization'});
   const version=await pool.query('SELECT session_version FROM users WHERE id=$1',[a.userId]);
   if(!version.rowCount)return res.status(403).json({error:'User account unavailable'});
   await inTenant(a.tenantId,a.userId,db=>audit(db,a,'account.organization_switched','organization',tenantId));
   setSession(res,a.userId,tenantId,version.rows[0].session_version);
   res.json({tenantId,role:membership.rows[0].role});
 }));
 return router;
}
