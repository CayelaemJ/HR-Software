import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Use only the disposable cabo_ci database');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const employeeA='aaaabbbb-1111-4111-8111-111111111111';
const author='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',staff='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reviewer=randomUUID(),port=36571,base='http://127.0.0.1:'+port;
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
let stderr='';
const server=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port)},
 stdio:['ignore','pipe','pipe']});
server.stderr.on('data',x=>stderr+=String(x).slice(0,700));
async function call(path,user=reviewer,method='GET',payload){
 const r=await fetch(base+path,{method,headers:{
  cookie:'cabo_session='+createSession(user,A),
  ...(method==='GET'?{}:{origin:base}),'content-type':'application/json'},
  ...(payload?{body:JSON.stringify(payload)}:method==='GET'?{}:{body:'{}'})});
 return {status:r.status,data:await r.json().catch(()=>({}))};
}
try{
 await admin.query("INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,'Independent HR Follow-up Reviewer','synthetic-unused')",[reviewer,'followup-'+reviewer.slice(0,8)+'@example.test']);
 await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'hr_admin')",[A,reviewer]);
 const candidates=await admin.query("SELECT id,tenant_id FROM progression_cases WHERE kind='promotion' AND evidence_summary='Synthetic documented professional accomplishments' AND status='pending' ORDER BY created_at DESC");
 const own=candidates.rows.find(x=>x.tenant_id===A)?.id,foreign=candidates.rows.find(x=>x.tenant_id===B)?.id;
 assert.ok(own&&foreign,'Synthetic tenant cases were not seeded');
 for(let n=0;n<45;n++){
  if(server.exitCode!==null)throw Error('API died: '+stderr);
  try{if((await fetch(base+'/health')).ok)break;}catch{}
  if(n===44)throw Error('API not ready: '+stderr);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const body={
  eventKind:'evidence_requested',
  reason:'A separate HR reviewer requested evidence to verify the employee documentation.',
  publicSummary:'An independent HR reviewer has requested additional supporting evidence.'
 };
 const path='/api/v1/hr/fairness/cases/'+own+'/followups';
 assert.equal((await call(path,staff,'POST',body)).status,403,'Employee viewer cannot record HR follow-up');
 assert.equal((await call(path,author,'POST',body)).status,409,'Original case author cannot self-record follow-up');
 assert.equal((await call('/api/v1/hr/fairness/cases/'+foreign+'/followups',reviewer,'POST',body)).status,409,'Cannot follow up on another tenant case');
 const created=await call(path,reviewer,'POST',body);
 assert.equal(created.status,201,JSON.stringify(created.data));
 assert.equal(created.data.event_kind,'evidence_requested');
 const events=await call('/api/v1/hr/fairness/cases/'+own+'/followups');
 assert.equal(events.status,200);
 assert.ok(events.data.some(x=>x.id===created.data.id));
 const self=await call('/api/v1/employee/me',staff);
 assert.equal(self.status,200);
 assert.ok(self.data.followups.some(x=>x.case_id===own&&x.public_summary===body.publicSummary));
 assert.equal(JSON.stringify(self.data.followups).includes(body.reason),false,'Internal HR notes never exposed to employee');
 const status=await admin.query('SELECT status FROM progression_cases WHERE id=$1',[own]);
 assert.equal(status.rows[0].status,'pending','Follow-up must not decide an employment matter');
 const audit=await admin.query("SELECT count(*)::int n FROM audit_events WHERE object_id=$1 AND action='progression.human_followup_recorded'",[own]);
 assert.equal(audit.rows[0].n,1);
 console.log('PASS: independently reviewed HR follow-ups, public employee status, tenant isolation and audit');
}finally{server.kill();await admin.end();}
