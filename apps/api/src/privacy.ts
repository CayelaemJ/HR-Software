import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const requestInput=z.object({requestType:z.enum(['access','export','correction','erasure','objection']),details:z.string().trim().max(3000).default('')});
const reviewInput=z.object({status:z.enum(['in_review','completed','declined']),responseNote:z.string().trim().min(12).max(3000)});
const uid=z.string().uuid();
export function makePrivacyRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.get('/me',wrap(async(req,res)=>{
   const a=actor(req);
   const data=await inTenant(a.tenantId,a.userId,async db=>{
     const profile=await db.query('SELECT id,username,email,full_name,created_at FROM users WHERE id=$1',[a.userId]);
     const membership=await db.query('SELECT role,created_at FROM memberships WHERE tenant_id=$1 AND user_id=$2',[a.tenantId,a.userId]);
     const organization=await db.query('SELECT name FROM organizations WHERE id=$1',[a.tenantId]);
     return {profile:profile.rows[0],membership:membership.rows[0],organization:organization.rows[0]?.name};
   });
   res.setHeader('Cache-Control','no-store');res.json(data);
 }));
 router.get('/requests',wrap(async(req,res)=>{
   const a=actor(req);
   const r=await inTenant(a.tenantId,a.userId,db=>db.query('SELECT id,request_type,details,status,response_note,created_at,reviewed_at FROM privacy_requests WHERE subject_user_id=$1 ORDER BY created_at DESC LIMIT 100',[a.userId]));
   res.json(r.rows);
 }));
 router.post('/requests',wrap(async(req,res)=>{
   const a=actor(req),v=requestInput.parse(req.body);
   const r=await inTenant(a.tenantId,a.userId,async db=>{
     const inserted=await db.query('INSERT INTO privacy_requests(tenant_id,subject_user_id,request_type,details) VALUES($1,$2,$3,$4) RETURNING id,request_type,status,created_at',[a.tenantId,a.userId,v.requestType,v.details]);
     await audit(db,a,'privacy.request_received','privacy_request',inserted.rows[0].id,{type:v.requestType});
     return inserted.rows[0];
   });res.status(201).json(r);
 }));
 router.get('/admin/requests',wrap(async(req,res)=>{
   const a=actor(req);if(!['owner','hr_admin'].includes(a.role))return res.status(403).json({error:'HR admin required'});
   const r=await inTenant(a.tenantId,a.userId,db=>db.query(`SELECT p.id,p.request_type,p.details,p.status,p.response_note,p.created_at,u.full_name AS subject_name,u.email AS subject_email
      FROM privacy_requests p JOIN users u ON u.id=p.subject_user_id ORDER BY p.created_at DESC LIMIT 250`));
   res.json(r.rows);
 }));
 router.patch('/admin/requests/:id',wrap(async(req,res)=>{
   const a=actor(req);if(!['owner','hr_admin'].includes(a.role))return res.status(403).json({error:'HR admin required'});
   const id=uid.parse(req.params.id),v=reviewInput.parse(req.body);
   const updated=await inTenant(a.tenantId,a.userId,async db=>{
     const r=await db.query('UPDATE privacy_requests SET status=$1,response_note=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 AND status<>\'completed\' RETURNING id,status,response_note',[v.status,v.responseNote,a.userId,id]);
     if(r.rowCount)await audit(db,a,'privacy.human_reviewed','privacy_request',id,{status:v.status});
     return r.rows[0];
   });
   if(!updated)return res.status(409).json({error:'Request missing or already completed'});
   res.json(updated);
 }));
 return router;
}
