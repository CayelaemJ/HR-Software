import {Router,type Request,type Response,type RequestHandler} from 'express';
import rateLimit from 'express-rate-limit';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
import {extractTextSafely} from './extract.js';
import {draftCvEvidence} from './cv-ai.js';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const uuid=z.string().uuid();
const inputSchema=z.object({jobId:uuid,documentId:uuid,confirmExternalProcessing:z.literal(true)});
type LinkedSource={
 title:string;criteria:string;description:string;
 content:Buffer;media_type:string;sha256_hex:string;scan_status:string;
};
export function makeCvAiRouter({authenticated,actor,audit}:Deps) {
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>
  (req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{
  if(!['owner','hr_admin','recruiter'].includes(actor(req).role))
   return res.status(403).json({error:'Recruitment staff required'});
  next();
 });
 router.post('/evidence',rateLimit({windowMs:300000,limit:8,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const a=actor(req),input=inputSchema.parse(req.body);
  const record=await inTenant(a.tenantId,a.userId,async db=>{
   const r=await db.query(
    'SELECT j.title,j.criteria,j.description,d.content,d.media_type,d.sha256_hex,d.scan_status '+
    'FROM candidate_documents d '+
    'JOIN applications a ON a.tenant_id=d.tenant_id AND a.candidate_id=d.candidate_id '+
    'JOIN jobs j ON j.tenant_id=a.tenant_id AND j.id=a.job_id '+
    'WHERE d.id=$1 AND j.id=$2 AND d.expires_at>now() LIMIT 1',
    [input.documentId,input.jobId]
   );
   return r.rows[0] as LinkedSource|undefined;
  });
  if(!record)return res.status(404).json({error:'Role-linked candidate document not available'});
  if(record.scan_status!=='clean')return res.status(423).json({error:'Document remains quarantined pending malware clearance'});
  if(createHash('sha256').update(record.content).digest('hex')!==record.sha256_hex)
   return res.status(500).json({error:'Document integrity check failed'});
  const parsed=await extractTextSafely(record.content,record.media_type);
  if(parsed.status!=='text_available')return res.status(422).json({error:'OCR or an accessible CV is needed. Do not penalize the applicant for document format.'});
  const text=parsed.pages.map(p=>p.text).join('\n').slice(0,12000);
  if(text.trim().length<80)return res.status(422).json({error:'Insufficient machine-readable text. Ask for a human-reviewed accessible CV.'});
  try{
   const result=await draftCvEvidence({title:record.title,criteria:record.criteria,description:record.description},text);
   await inTenant(a.tenantId,a.userId,db=>audit(db,a,'candidate_document.ai_evidence_drafted','candidate_document',input.documentId,
    {jobId:input.jobId,model:result.model,externalProcessingConfirmed:true,sourceTextTruncated:parsed.truncated||text.length>=12000}));
   res.setHeader('Cache-Control','private, no-store');
   res.json({...result,notice:'Unverified role-specific evidence only. No candidate ranking, automated rejection or hiring recommendation.',
    sourceTextTruncated:parsed.truncated||text.length>=12000});
  }catch(e){
   const unavailable=e instanceof Error&&e.message==='AI provider unavailable';
   res.status(unavailable?503:502).json({error:unavailable?'AI provider is not configured':
    'Unable to produce a source-grounded AI evidence summary. Continue with manual review.'});
  }
 }));
 return router;
}
