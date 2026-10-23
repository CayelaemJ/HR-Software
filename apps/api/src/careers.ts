import {Router,type RequestHandler} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {inTenant} from './db.js';

const publicUser='00000000-0000-4000-8000-000000000000';
const uid=z.string().uuid();
const application=z.object({
  fullName:z.string().trim().min(2).max(160),
  email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),
  jobId:uid,
  applicantNote:z.string().trim().max(2500).default(''),
  consent:z.literal(true),
  website:z.string().max(0).default('') // Hidden honeypot for basic bot filtering
});
export function makePublicCareersRouter(){
 const router=Router();
 const wrap=(fn:RequestHandler):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res,next)).catch(next);};
 router.get('/careers/:tenantId',wrap(async(req,res)=>{
  const tenantId=uid.parse(req.params.tenantId);
  const data=await inTenant(tenantId,publicUser,async db=>{
   const org=await db.query('SELECT name FROM organizations WHERE id=$1',[tenantId]);
   if(!org.rowCount)return null;
   const jobs=await db.query(`SELECT id,title,department,location,employment_type,description,criteria,published_at
      FROM jobs WHERE status='published' AND is_demo=false ORDER BY published_at DESC LIMIT 100`);
   return {organization:org.rows[0].name,jobs:jobs.rows,acceptingApplications:process.env.PUBLIC_APPLICATIONS_ENABLED==='true'};
  });
  if(!data)return res.status(404).json({error:'Organization not found'});
  res.setHeader('Cache-Control','no-store');res.json(data);
 }));
 router.post('/careers/:tenantId/apply',
  rateLimit({windowMs:30*60_000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),
  wrap(async(req,res)=>{
   // Gate real applicant collection until the organization has approved its public privacy notices.
   if(process.env.PUBLIC_APPLICATIONS_ENABLED!=='true')
     return res.status(503).json({error:'Applications are not yet open; the privacy launch checklist is outstanding'});
   const tenantId=uid.parse(req.params.tenantId);
   const v=application.parse(req.body);
   const result=await inTenant(tenantId,publicUser,async db=>{
     const job=await db.query("SELECT id FROM jobs WHERE id=$1 AND status='published' AND is_demo=false",[v.jobId]);
     if(!job.rowCount)return null;
     const inserted=await db.query(`INSERT INTO candidates(tenant_id,full_name,email)
       VALUES($1,$2,$3) ON CONFLICT (tenant_id,email) DO NOTHING RETURNING id`,[tenantId,v.fullName,v.email]);
     const candidate=inserted.rows[0]??(await db.query('SELECT id FROM candidates WHERE email=$1',[v.email])).rows[0];
     if(!candidate)return null;
     const app=await db.query(`INSERT INTO applications(tenant_id,job_id,candidate_id,applicant_note,public_consent_at,consent_version)
      VALUES($1,$2,$3,$4,now(),'cabo-applicant-notice-2026-10') ON CONFLICT (tenant_id,job_id,candidate_id) DO NOTHING RETURNING id`,
      [tenantId,v.jobId,candidate.id,v.applicantNote]);
     if(!app.rowCount)return {duplicate:true};
     await db.query("INSERT INTO public_application_events(tenant_id,application_id,event_type) VALUES($1,$2,'application_received')",[tenantId,app.rows[0].id]);
     return {duplicate:false};
   });
   if(!result)return res.status(404).json({error:'Vacancy not open'});
   if(result.duplicate)return res.status(409).json({error:'An application for this role already exists'});
   res.status(201).json({submitted:true,message:'Your application has been received. A human recruitment team will review it.'});
  }));
 return router;
}
