import {Router,type Request,type Response,type RequestHandler} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
import {draftCvEvidence} from './cv-ai.js';
type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const id=z.string().uuid();
const form=z.object({jobId:id,documentId:id,
 redactedText:z.string().trim().min(80).max(12000),
 confirmExternalProcessing:z.literal(true)
});
export function makeCvAiRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{if(!['owner','hr_admin','recruiter'].includes(actor(req).role))return res.status(403).json({error:'Authorized recruiter required'});next();});
 router.post('/evidence',rateLimit({windowMs:300000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const a=actor(req),input=form.parse(req.body);
  const role=await inTenant(a.tenantId,a.userId,async db=>{
   const found=await db.query(
    'SELECT j.title,j.criteria,j.description FROM jobs j JOIN applications a ON a.tenant_id=j.tenant_id AND a.job_id=j.id JOIN candidate_documents d ON d.tenant_id=a.tenant_id AND d.candidate_id=a.candidate_id WHERE j.id=$1 AND d.id=$2 AND d.expires_at>now() LIMIT 1',
    [input.jobId,input.documentId]);
   return found.rows[0] as {title:string;criteria:string;description:string}|undefined;
  });
  if(!role)return res.status(404).json({error:'Document does not belong to an applicant for the selected role'});
  try{
   const result=await draftCvEvidence(role,input.redactedText);
   await inTenant(a.tenantId,a.userId,db=>audit(db,a,'candidate_document.ai_evidence_drafted','candidate_document',input.documentId,{jobId:input.jobId,model:result.model,externalProcessingConfirmed:true}));
   res.setHeader('Cache-Control','private, no-store');
   res.json({...result,notice:'This is an unverified evidence draft, not a candidate ranking or employment decision.'});
  }catch(e){
   const unavailable=e instanceof Error&&e.message==='AI provider unavailable';
   res.status(unavailable?503:502).json({error:unavailable?'AI provider is not configured':'Could not produce an evidence draft. Manual hiring review remains available.'});
  }
 }));
 return router;
}
