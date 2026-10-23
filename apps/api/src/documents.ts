import {Router,type Request,type RequestHandler,type Response} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
import {extractTextSafely} from './extract.js';
import rateLimit from 'express-rate-limit';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const uid=z.string().uuid();
const MAX_FILE=1_048_576;
const MAX_CANDIDATE_DOCUMENTS=5;
const MAX_TENANT_BYTES=20*MAX_FILE;
const body=z.object({
 candidateId:uid,
 originalName:z.string().min(1).max(160).refine(x=>!/[/\\\x00-\x1f]/.test(x)),
 mediaType:z.enum(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
 base64:z.string().min(48).max(1_398_104),
 consentConfirmed:z.literal(true)
});
const allowed=(a:Actor)=>a.role==='owner'||a.role==='hr_admin'||a.role==='recruiter';
export function validateDocument(input:z.infer<typeof body>){
 const bytes=Buffer.from(input.base64,'base64');
 if(bytes.byteLength>MAX_FILE||bytes.byteLength<32||bytes.toString('base64')!==input.base64)
   throw new Error('Invalid document encoding or file exceeds 1 MiB');
 const isPdf=bytes.subarray(0,5).toString('ascii')==='%PDF-';
 const isZip=bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04;
 if((input.mediaType==='application/pdf'&&!isPdf) ||
    (input.mediaType!=='application/pdf'&&!isZip) ||
    (input.mediaType==='application/pdf'&&!input.originalName.toLowerCase().endsWith('.pdf')) ||
    (input.mediaType!=='application/pdf'&&!input.originalName.toLowerCase().endsWith('.docx')))
   throw new Error('File signature, extension and declared type must match PDF or DOCX');
 return {bytes,sha:createHash('sha256').update(bytes).digest('hex')};
}
export function makeCvRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{
  Promise.resolve(fn(req,res)).catch(next);
 };
 router.use(authenticated);
 router.use((req,res,next)=>{
  if(!allowed(actor(req)))return res.status(403).json({error:'Recruitment document access is restricted'});
  next();
 });
 router.get('/candidates/:id',wrap(async(req,res)=>{
  const id=uid.parse(req.params.id),a=actor(req);
  const items=await inTenant(a.tenantId,a.userId,async db=>{
   if(!(await db.query('SELECT 1 FROM candidates WHERE id=$1',[id])).rowCount)return null;
   return (await db.query(`SELECT id,candidate_id,original_name,media_type,byte_length,sha256_hex,created_at,expires_at
    FROM candidate_documents WHERE candidate_id=$1 AND expires_at>now()
    ORDER BY created_at DESC LIMIT 50`,[id])).rows;
  });
  if(items===null)return res.status(404).json({error:'Candidate not found'});
  res.setHeader('Cache-Control','no-store');res.json(items);
 }));
 router.post('/upload',wrap(async(req,res)=>{
  const a=actor(req),input=body.parse(req.body);
  let data:{bytes:Buffer;sha:string};
  try{data=validateDocument(input);}catch(err){
   return res.status(400).json({error:err instanceof Error?err.message:'Unsupported CV document'});
  }
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    if(!(await db.query('SELECT 1 FROM candidates WHERE id=$1',[input.candidateId])).rowCount)return {error:'Candidate not found',status:404};
    const used=await db.query('SELECT count(*)::int AS files,coalesce(sum(byte_length),0)::int AS bytes FROM candidate_documents WHERE candidate_id=$1 AND expires_at>now()',[input.candidateId]);
    const total=await db.query('SELECT coalesce(sum(byte_length),0)::int AS bytes FROM candidate_documents WHERE expires_at>now()');
    if(used.rows[0].files>=MAX_CANDIDATE_DOCUMENTS || total.rows[0].bytes+data.bytes.length>MAX_TENANT_BYTES)
      return {error:'Pilot document storage quota reached',status:409};
    const r=await db.query(`INSERT INTO candidate_documents(tenant_id,candidate_id,original_name,media_type,byte_length,sha256_hex,content,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id,candidate_id,original_name,media_type,byte_length,sha256_hex,created_at,expires_at`,
      [a.tenantId,input.candidateId,input.originalName,input.mediaType,data.bytes.length,data.sha,data.bytes,a.userId]);
    await audit(db,a,'candidate_document.uploaded','candidate_document',r.rows[0].id,{type:input.mediaType,bytes:data.bytes.length,consentAttested:true});
    return r.rows[0];
  });
  if('error' in result)return res.status(result.status).json({error:result.error});
  res.status(201).json(result);
 }));
 router.post('/:id/extract',rateLimit({windowMs:60_000,limit:8,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const id=uid.parse(req.params.id),a=actor(req);
  const document=await inTenant(a.tenantId,a.userId,async db=>{
   const r=await db.query('SELECT id,content,media_type,sha256_hex FROM candidate_documents WHERE id=$1 AND expires_at>now()',[id]);
   return r.rows[0] as {id:string;content:Buffer;media_type:string;sha256_hex:string}|undefined;
  });
  if(!document)return res.status(404).json({error:'CV document not found or expired'});
  if(createHash('sha256').update(document.content).digest('hex')!==document.sha256_hex)
   return res.status(500).json({error:'Document integrity check failed'});
  try{
   const result=await extractTextSafely(document.content,document.media_type);
   await inTenant(a.tenantId,a.userId,db=>audit(db,a,'candidate_document.text_extracted','candidate_document',id,{status:result.status,truncated:result.truncated}));
   res.setHeader('Cache-Control','private, no-store');
   res.json({...result,verified:false,notice:'Extracted document text is unverified candidate-supplied content. Human review is mandatory.'});
  }catch{
   res.status(422).json({error:'Unable to safely extract text. Request an accessible or OCR-processed copy; do not reject this applicant on formatting.'});
  }
 }));
 router.get('/:id/download',wrap(async(req,res)=>{
  const id=uid.parse(req.params.id),a=actor(req);
  const document=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query(`SELECT id,original_name,content,media_type,sha256_hex FROM candidate_documents
     WHERE id=$1 AND expires_at>now()`,[id]);
    if(!r.rowCount)return null;
    await audit(db,a,'candidate_document.downloaded','candidate_document',id);
    return r.rows[0] as {original_name:string;content:Buffer;media_type:string;sha256_hex:string};
  });
  if(!document)return res.status(404).json({error:'Document unavailable or expired'});
  if(createHash('sha256').update(document.content).digest('hex')!==document.sha256_hex)
   return res.status(500).json({error:'Document integrity check failed'});
  res.setHeader('Content-Type','application/octet-stream');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Disposition',`attachment; filename="candidate-document"; filename*=UTF-8''${encodeURIComponent(document.original_name)}`);
  res.end(document.content);
 }));
 router.delete('/:id',wrap(async(req,res)=>{
  const id=uid.parse(req.params.id),a=actor(req);
  const removed=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query('DELETE FROM candidate_documents WHERE id=$1 RETURNING id,candidate_id',[id]);
    if(r.rowCount)await audit(db,a,'candidate_document.deleted','candidate_document',id);
    return r.rowCount;
  });
  if(!removed)return res.status(404).json({error:'Document not found'});
  res.status(204).end();
 }));
 return router;
}
