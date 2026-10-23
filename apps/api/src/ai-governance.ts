import {Router,type Request,type Response,type RequestHandler} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const uuid=z.string().uuid();
const review=z.object({
 status:z.enum(['approved','rejected']),
 reason:z.string().trim().min(12).max(2000)
});
export function makeAiGovernanceRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>
  (req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{
  if(!['owner','hr_admin','recruiter'].includes(actor(req).role))
   return res.status(403).json({error:'Recruitment reviewer permissions required'});
  next();
 });
 router.get('/',wrap(async(req,res)=>{
  const a=actor(req),jobId=req.query.jobId?uuid.parse(req.query.jobId):null;
  const r=await inTenant(a.tenantId,a.userId,db=>db.query(`
   SELECT id,job_id,model_provider,model_name,input_sha256,questions,status,
          generated_by,reviewed_by,reviewer_independent,review_reason,created_at,reviewed_at
   FROM ai_question_drafts
   WHERE tenant_id=$1 AND ($2::uuid IS NULL OR job_id=$2)
   ORDER BY created_at DESC LIMIT 100`,[a.tenantId,jobId]));
  res.setHeader('Cache-Control','private, no-store');
  res.json(r.rows);
 }));
 router.post('/:id/review',
  rateLimit({windowMs:60_000,limit:20,standardHeaders:'draft-7',legacyHeaders:false}),
  wrap(async(req,res)=>{
   const a=actor(req),id=uuid.parse(req.params.id),input=review.parse(req.body);
   const r=await inTenant(a.tenantId,a.userId,async db=>{
    const updated=await db.query(`
     UPDATE ai_question_drafts
     SET status=$1,review_reason=$2,reviewed_by=$3,reviewed_at=now(),
         reviewer_independent=(generated_by<>$3)
     WHERE id=$4 AND tenant_id=$5 AND status='pending_review'
     RETURNING id,status,job_id,reviewed_by,reviewer_independent,reviewed_at`,
     [input.status,input.reason,a.userId,id,a.tenantId]);
    if(!updated.rowCount)return null;
    await audit(db,a,'ai.draft_human_reviewed','ai_question_draft',id,{
      status:input.status,reason:input.reason,
      independent:updated.rows[0].reviewer_independent,
      noAutomatedDecision:true
    });
    return updated.rows[0];
   });
   if(!r)return res.status(409).json({error:'Draft missing or already reviewed'});
   res.setHeader('Cache-Control','no-store');
   res.json({...r,notice:'Human review recorded. No candidate score, rejection or hiring decision has been made.'});
 }));
 return router;
}
