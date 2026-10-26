import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Requires disposable cabo_ci database');
const tenant='11111111-1111-4111-8111-111111111111';
const author='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reviewer=randomUUID(),port=36651,base='http://127.0.0.1:'+port;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const server=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port)},
 stdio:['ignore','pipe','pipe']});
let errors='';server.stderr.on('data',chunk=>errors+=String(chunk).slice(0,500));
const send=async(path,user,method='GET',data)=>{
 const r=await fetch(base+'/api/v1/hr/integrations/payroll'+path,{
  method,headers:{cookie:'cabo_session='+createSession(user,tenant),
    ...(method==='GET'?{}:{origin:base}),'content-type':'application/json'},
  ...(data?{body:JSON.stringify(data)}:{})
 });
 return {status:r.status,headers:r.headers,text:await r.text()};
};
try{
 await db.query("INSERT INTO users(id,email,full_name,password_hash,mfa_enabled) VALUES($1,$2,'Independent Export Recipient','synthetic-hash',true)",
  [reviewer,'payroll-reconciler-'+reviewer.slice(0,8)+'@example.test']);
 await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'hr_admin')",[tenant,reviewer]);
 await db.query("UPDATE users SET mfa_enabled=true WHERE id=$1",[author]);
 for(let i=0;i<50;i++){
  if(server.exitCode!==null)throw Error('API crashed: '+errors);
  try{if((await fetch(base+'/health')).ok)break;}catch{}
  if(i===49)throw Error('API not ready: '+errors);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const payload={kind:'employee_roster',periodStart:'2026-10-01',periodEnd:'2026-10-31',confirmed:true};
 const exported=await send('/export',author,'POST',payload);
 assert.equal(exported.status,200,exported.text.slice(0,100));
 const exportId=exported.headers.get('x-cabo-export-id');
 assert.ok(exportId,'CSV response must declare export id');
 const fileSha=createHash('sha256').update(exported.text,'utf8').digest('hex');
 const history=await send('/history',reviewer);
 assert.equal(history.status,200);
 const row=JSON.parse(history.text).find(x=>x.id===exportId);
 assert.ok(row,'Separate reviewer can see tenant export');
 assert.equal(row.file_sha256,fileSha);
 assert.equal(row.reconciliation_status,'pending');
 const input={status:'accepted',fileSha256:fileSha,
  receiptReference:'Synthetic external receipt RECON-2026-001',
  receiptNote:'Independent test operator checked a matching export file fingerprint and receiving-system ticket.'};
 assert.equal((await send('/reconcile/'+exportId,author,'POST',input)).status,409,'Exporter cannot self-attest');
 assert.equal((await send('/reconcile/'+exportId,reviewer,'POST',{...input,fileSha256:'a'.repeat(64)})).status,409,'Wrong fingerprint denied');
 const confirmed=await send('/reconcile/'+exportId,reviewer,'POST',input);
 assert.equal(confirmed.status,200,confirmed.text);
 assert.equal(JSON.parse(confirmed.text).reconciliation_status,'accepted');
 assert.equal((await send('/reconcile/'+exportId,reviewer,'POST',input)).status,409,'Receipt is one-time');
 const record=await db.query('SELECT reconciliation_status,reconciled_by,receipt_reference FROM payroll_export_runs WHERE id=$1',[exportId]);
 assert.equal(record.rows[0].reconciled_by,reviewer);
 assert.equal(record.rows[0].reconciliation_status,'accepted');
 const audit=await db.query("SELECT count(*)::int n FROM audit_events WHERE object_id=$1 AND action='payroll.human_handoff_reconciled'",[exportId]);
 assert.equal(audit.rows[0].n,1);
 console.log('PASS: independent MFA-gated handoff reconciliation with exact CSV fingerprint and audit');
}finally{
 server.kill();
 await db.query("UPDATE users SET mfa_enabled=false WHERE id=$1",[author]).catch(()=>{});
 await db.end();
}
