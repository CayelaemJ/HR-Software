import {Router,type Request,type Response,type RequestHandler} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {inTenant} from './db.js';
import {EXPORT_MAX_ROWS,makePayrollCsv,payrollRequest,type PayrollKind} from './payroll-csv.js';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};
const MAX=EXPORT_MAX_ROWS+1;
const uuid=z.string().uuid();
const reconciliation=z.object({
  status:z.enum(['accepted','rejected']),
  fileSha256:z.string().regex(/^[0-9a-f]{64}$/),
  receiptReference:z.string().trim().min(12).max(250),
  receiptNote:z.string().trim().min(15).max(1500)
});

async function rowsForExport(
 db:PoolClient,tenantId:string,kind:PayrollKind,start:string,end:string
):Promise<Record<string,unknown>[]>{
 if(kind==='employee_roster'){
  const result=await db.query(`
   SELECT employee_code,full_name,department,job_title,employment_status,start_date::text AS start_date
   FROM employees
   WHERE tenant_id=$1 AND start_date<=$2::date AND (exit_date IS NULL OR exit_date >= $2::date)
   ORDER BY employee_code,id LIMIT $3`,[tenantId,end,MAX]);
  return result.rows;
 }
 const result=await db.query(`
   SELECT e.employee_code,e.full_name,l.leave_type,l.start_date::text AS start_date,
          l.end_date::text AS end_date,
          to_char(l.decided_at AT TIME ZONE 'Africa/Johannesburg','YYYY-MM-DD') AS decided_at
   FROM leave_requests l
   JOIN employees e ON e.id=l.employee_id AND e.tenant_id=l.tenant_id
   WHERE l.tenant_id=$1 AND l.status='approved'
     AND l.start_date<=$3::date AND l.end_date>=$2::date
   ORDER BY e.employee_code,l.start_date,l.id LIMIT $4`,[tenantId,start,end,MAX]);
 return result.rows;
}

export function makePayrollRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>
  (req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.use((req,res,next)=>{
  if(!['owner','hr_admin'].includes(actor(req).role))
   return res.status(403).json({error:'Authorized HR administrator required for payroll exports'});
  next();
 });

 async function mfaRequired(a:Actor){
  const r=await inTenant(a.tenantId,a.userId,db=>db.query(
   'SELECT mfa_enabled FROM users WHERE id=$1',[a.userId]));
  return r.rows[0]?.mfa_enabled===true;
 }
 router.get('/status',wrap(async(req,res)=>{
  const a=actor(req);
  const mfaEnabled=await mfaRequired(a);
  res.setHeader('Cache-Control','no-store');
  res.json({mfaEnabled,kind:'generic_csv',salaryCalculations:false,
   vendorCertified:false,requiresHumanConfirmation:true});
 }));
 router.use((req,res,next)=>{
  mfaRequired(actor(req)).then(ok=>{
   if(ok)next();
   else res.status(403).json({error:'Enable authenticator MFA before accessing payroll handoff records'});
  }).catch(next);
 });
 router.get('/history',wrap(async(req,res)=>{
  const a=actor(req);
  const records=await inTenant(a.tenantId,a.userId,db=>db.query(`
    SELECT id,export_kind,period_start::text AS period_start,
           period_end::text AS period_end,record_count,file_sha256,created_at,
      reconciliation_status,receipt_reference,receipt_note,reconciled_at
    FROM payroll_export_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100`,[a.tenantId]));
  res.setHeader('Cache-Control','no-store');res.json(records.rows);
 }));
 router.post('/reconcile/:id',rateLimit({windowMs:5*60_000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const a=actor(req),id=uuid.parse(req.params.id),v=reconciliation.parse(req.body);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query(`UPDATE payroll_export_runs SET
      reconciliation_status=$1,receipt_reference=$2,receipt_note=$3,
      reconciled_by=$4,reconciled_at=now()
      WHERE id=$5 AND tenant_id=$6 AND reconciliation_status='pending'
      AND generated_by<>$4 AND file_sha256=$7
      RETURNING id,export_kind,reconciliation_status,receipt_reference,reconciled_at`,
      [v.status,v.receiptReference,v.receiptNote,a.userId,id,a.tenantId,v.fileSha256]);
    if(!r.rowCount)return null;
    await audit(db,a,'payroll.human_handoff_reconciled','payroll_export_run',id,{
      status:v.status,verifiedFileFingerprint:v.fileSha256,
      vendorCertified:false,externalReceiptIsHumanAttestation:true
    });
    return r.rows[0];
  });
  if(!result)return res.status(409).json({error:'Export is unavailable, already reconciled, fingerprint mismatch, or independent HR reviewer required'});
  res.setHeader('Cache-Control','private, no-store');
  res.json({...result,notice:'A human-attested acknowledgement only; no Sage or external payroll system validation occurred.'});
 }));
 router.post('/preview',rateLimit({windowMs:60_000,limit:15,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const a=actor(req),input=payrollRequest.parse({...req.body,confirmed:true});
  const records=await inTenant(a.tenantId,a.userId,db=>
   rowsForExport(db,a.tenantId,input.kind,input.periodStart,input.periodEnd));
  if(records.length>EXPORT_MAX_ROWS)return res.status(413).json({error:'Export exceeds 10,000 records; shorten the period'});
  res.setHeader('Cache-Control','no-store');
  res.json({kind:input.kind,count:records.length,periodStart:input.periodStart,periodEnd:input.periodEnd,
   columns:input.kind==='employee_roster'?6:6,
   warning:'Human-reviewed generic CSV only. No salaries, deductions, leave accruals, or vendor-certified payroll instructions.'});
 }));
 router.post('/export',rateLimit({windowMs:5*60_000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),wrap(async(req,res)=>{
  const a=actor(req),input=payrollRequest.parse(req.body);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
   const records=await rowsForExport(db,a.tenantId,input.kind,input.periodStart,input.periodEnd);
   if(records.length>EXPORT_MAX_ROWS)return null;
   const csv=makePayrollCsv(input.kind,records);
   const inserted=await db.query(`INSERT INTO payroll_export_runs
     (tenant_id,export_kind,period_start,period_end,record_count,file_sha256,generated_by)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [a.tenantId,input.kind,input.periodStart,input.periodEnd,csv.recordCount,csv.sha256,a.userId]);
   await audit(db,a,'payroll.generic_csv_exported','payroll_export_run',inserted.rows[0].id,{
    kind:input.kind,from:input.periodStart,to:input.periodEnd,count:csv.recordCount,
    sha256:csv.sha256,confirmed:true,vendorCertified:false
   });
   return {...csv,id:inserted.rows[0].id};
  });
  if(!result)return res.status(413).json({error:'Export exceeds 10,000 records; shorten the period'});
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
   `attachment; filename="cabo-${input.kind}-${input.periodEnd}.csv"`);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-CABO-Export-Id',result.id);
  res.send(result.bytes);
 }));
 return router;
}
