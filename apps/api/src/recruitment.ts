import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { inTenant } from './db.js';

type Role = 'owner'|'hr_admin'|'recruiter'|'viewer';
type Actor = {userId:string;tenantId:string;role:Role};
type Dependencies = {
  authenticated: RequestHandler;
  editable: (req:Request,res:Response)=>boolean;
  actor: (req:Request)=>Actor;
  audit: (db:PoolClient,actor:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
};
const uuid = z.string().uuid();
const claimSchema = z.object({
  claimType:z.enum(['skill','qualification','experience','project','registration','other']),
  claimText:z.string().trim().min(5).max(4000),
  sourceKind:z.enum(['candidate_statement','document_excerpt']).default('candidate_statement'),
  sourceNote:z.string().trim().max(2000).default('')
});
const evidenceReviewSchema=z.object({
  status:z.enum(['reviewed','verified','disputed']),
  verificationReference:z.string().trim().max(2000).optional()
});
const interviewSchema=z.object({
  applicationId:uuid,
  scheduledAt:z.string().datetime({offset:true}),
  location:z.string().trim().max(400).default(''),
  timezone:z.string().trim().max(80).default('Africa/Johannesburg')
});
const scorecardSchema=z.object({
  criterion:z.string().trim().min(4).max(200),
  observation:z.string().trim().min(12).max(4000),
  finding:z.enum(['evidence_observed','follow_up_required','not_observed'])
});

export function makeRecruitmentRouter({authenticated,editable,actor,audit}:Dependencies) {
  const router=Router();
  const safe=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>
    (req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
  router.use(authenticated);

  router.get('/candidates/:id/evidence',safe(async(req,res)=>{
    const id=uuid.parse(req.params.id),a=actor(req);
    const result=await inTenant(a.tenantId,a.userId,async db=>{
      const candidate=await db.query('SELECT id FROM candidates WHERE id=$1',[id]);
      if(!candidate.rowCount)return null;
      return (await db.query(`SELECT id,candidate_id,claim_type,claim_text,source_kind,source_note,review_status,
           verification_reference,is_demo,reviewed_at,created_at FROM candidate_evidence
           WHERE candidate_id=$1 ORDER BY created_at DESC LIMIT 150`,[id])).rows;
    });
    if(!result)return res.status(404).json({error:'Candidate not found'});
    res.json(result);
  }));

  router.post('/candidates/:id/evidence',safe(async(req,res)=>{
    if(!editable(req,res))return;
    const id=uuid.parse(req.params.id),input=claimSchema.parse(req.body),a=actor(req);
    const result=await inTenant(a.tenantId,a.userId,async db=>{
      const r=await db.query(`INSERT INTO candidate_evidence(tenant_id,candidate_id,claim_type,claim_text,source_kind,source_note,created_by)
       SELECT $1,id,$3,$4,$5,$6,$7 FROM candidates WHERE id=$2 RETURNING *`,
       [a.tenantId,id,input.claimType,input.claimText,input.sourceKind,input.sourceNote,a.userId]);
      if(!r.rowCount)return null;
      await audit(db,a,'evidence.recorded','candidate_evidence',r.rows[0].id,{claimType:input.claimType,sourceKind:input.sourceKind});
      return r.rows[0];
    });
    if(!result)return res.status(404).json({error:'Candidate not found'});
    res.status(201).json(result);
  }));

  router.patch('/evidence/:id/review',safe(async(req,res)=>{
    if(!editable(req,res))return;
    const id=uuid.parse(req.params.id),input=evidenceReviewSchema.parse(req.body),a=actor(req);
    if(input.status==='verified'&&(!input.verificationReference||input.verificationReference.length<12))
      return res.status(400).json({error:'Verification requires a documented independent reference (at least 12 characters)'});
    const result=await inTenant(a.tenantId,a.userId,async db=>{
      const r=await db.query(`UPDATE candidate_evidence SET review_status=$1,verification_reference=$2,reviewed_by=$3,reviewed_at=now()
        WHERE id=$4 RETURNING id,candidate_id,claim_type,review_status,verification_reference,reviewed_at`,
        [input.status,input.status==='verified'?input.verificationReference:null,a.userId,id]);
      if(!r.rowCount)return null;
      await audit(db,a,'evidence.human_reviewed','candidate_evidence',id,{status:input.status,reference:input.status==='verified'?input.verificationReference:undefined});
      return r.rows[0];
    });
    if(!result)return res.status(404).json({error:'Evidence not found'});
    res.json(result);
  }));

  router.get('/interviews',safe(async(req,res)=>{
    const a=actor(req);
    const result=await inTenant(a.tenantId,a.userId,db=>db.query(`
      SELECT i.id,i.is_demo,i.application_id,i.scheduled_at,i.timezone,i.location,i.status,i.created_at,
        c.full_name AS candidate_name,j.title AS job_title,
        (SELECT count(*)::int FROM interview_scorecards s WHERE s.interview_id=i.id) AS scorecard_count
      FROM interviews i JOIN applications ap ON ap.id=i.application_id
      JOIN candidates c ON c.id=ap.candidate_id JOIN jobs j ON j.id=ap.job_id
      ORDER BY i.scheduled_at DESC LIMIT 100`));
    res.json(result.rows);
  }));

  router.post('/interviews',safe(async(req,res)=>{
    if(!editable(req,res))return;
    const input=interviewSchema.parse(req.body),a=actor(req);
    const result=await inTenant(a.tenantId,a.userId,async db=>{
      const r=await db.query(`INSERT INTO interviews (tenant_id,application_id,scheduled_at,timezone,location,interviewer_id,created_by)
      SELECT $1,id,$3,$4,$5,$6,$6 FROM applications WHERE id=$2 AND stage='interview' RETURNING *`,
      [a.tenantId,input.applicationId,input.scheduledAt,input.timezone,input.location,a.userId]);
      if(!r.rowCount)return null;
      await audit(db,a,'interview.scheduled','interview',r.rows[0].id,{scheduledAt:input.scheduledAt});
      return r.rows[0];
    });
    if(!result)return res.status(400).json({error:'Application must be at interview stage'});
    res.status(201).json(result);
  }));

  router.patch('/interviews/:id/status',safe(async(req,res)=>{
    if(!editable(req,res))return;
    const id=uuid.parse(req.params.id),input=z.object({status:z.enum(['completed','cancelled'])}).parse(req.body),a=actor(req);
    const result=await inTenant(a.tenantId,a.userId,async db=>{
      const r=await db.query(`UPDATE interviews SET status=$1 WHERE id=$2 AND status='scheduled' RETURNING id,status`,[input.status,id]);
      if(!r.rowCount)return null;
      await audit(db,a,'interview.status_changed','interview',id,{status:input.status});
      return r.rows[0];
    });
    if(!result)return res.status(409).json({error:'Interview not found or already concluded'});
    res.json(result);
  }));

  router.get('/interviews/:id/scorecards',safe(async(req,res)=>{
    const id=uuid.parse(req.params.id),a=actor(req);
    const result=await inTenant(a.tenantId,a.userId,async db=>{
      const interview=await db.query('SELECT id FROM interviews WHERE id=$1',[id]);
      if(!interview.rowCount)return null;
      return (await db.query(`SELECT id,criterion,observation,finding,is_demo,created_at FROM interview_scorecards
        WHERE interview_id=$1 ORDER BY created_at DESC LIMIT 100`,[id])).rows;
    });
    if(!result)return res.status(404).json({error:'Interview not found'});
    res.json(result);
  }));

  router.post('/interviews/:id/scorecards',safe(async(req,res)=>{
    if(!editable(req,res))return;
    const id=uuid.parse(req.params.id),input=scorecardSchema.parse(req.body),a=actor(req);
    const result=await inTenant(a.tenantId,a.userId,async db=>{
      const r=await db.query(`INSERT INTO interview_scorecards(tenant_id,interview_id,criterion,observation,finding,reviewer_id)
        SELECT $1,id,$3,$4,$5,$6 FROM interviews WHERE id=$2 AND status IN ('scheduled','completed') RETURNING *`,
       [a.tenantId,id,input.criterion,input.observation,input.finding,a.userId]);
      if(!r.rowCount)return null;
      await audit(db,a,'interview.scorecard_added','interview_scorecard',r.rows[0].id,{interviewId:id,finding:input.finding});
      return r.rows[0];
    });
    if(!result)return res.status(409).json({error:'Interview not found or cancelled'});
    res.status(201).json(result);
  }));
  return router;
}
