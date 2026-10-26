import pg from 'pg';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Payroll integration tests must target disposable cabo_ci');
const tenant='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const viewer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const port=34877;
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port),PUBLIC_APPLICATIONS_ENABLED:'false'},
 stdio:['ignore','pipe','pipe']
});
let stderr='';
child.stderr.on('data',chunk=>stderr+=String(chunk).slice(0,700));
const base='http://127.0.0.1:'+port;
const cookie='cabo_session='+createSession(user,tenant);
const viewCookie='cabo_session='+createSession(viewer,tenant);
async function send(path,opts={},session=cookie){
 const response=await fetch(base+path,{credentials:'omit',...opts,headers:{
  cookie:session,'content-type':'application/json',...(opts.method&&!['GET','HEAD'].includes(opts.method)?{origin:base}:{}),...opts.headers
 }});
 return {response,body:await response.text()};
}
try{
 for(let i=0;i<40;i++){
  if(child.exitCode!==null)throw Error('API exited: '+stderr);
  try{const healthy=await fetch(base+'/health');if(healthy.ok)break;}catch{}
  if(i===39)throw Error('API startup timed out '+stderr);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const status=await send('/api/v1/hr/integrations/payroll/status');
 assert.equal(status.response.status,200);
 assert.equal(JSON.parse(status.body).mfaEnabled,false);
 const forbidden=await send('/api/v1/hr/integrations/payroll/history');
 assert.equal(forbidden.response.status,403,'No payroll exports before MFA enrollment');
 const forbiddenViewer=await send('/api/v1/hr/integrations/payroll/status',{},viewCookie);
 assert.equal(forbiddenViewer.response.status,403,'Viewer cannot use payroll exports');
 await admin.query("UPDATE users SET mfa_enabled=true,mfa_secret_encrypted='ci-temporary-key-for-boolean-check' WHERE id=$1",[user]);
 await admin.query("UPDATE leave_requests SET status='approved',decided_by=$1,decided_at=now() WHERE tenant_id IN ($2,$3)",[user,tenant,other]);
 const scope={kind:'approved_leave',periodStart:'2026-10-01',periodEnd:'2026-11-01'};
 const preview=await send('/api/v1/hr/integrations/payroll/preview',{
  method:'POST',body:JSON.stringify(scope)
 });
 assert.equal(preview.response.status,200,preview.body);
 assert.equal(JSON.parse(preview.body).count,1,'Do not reveal other tenants approved leave');
 const noConfirmation=await send('/api/v1/hr/integrations/payroll/export',{
  method:'POST',body:JSON.stringify({...scope,confirmed:false})
 });
 assert.equal(noConfirmation.response.status,400,'Human confirmation is mandatory');
 const exported=await send('/api/v1/hr/integrations/payroll/export',{
  method:'POST',body:JSON.stringify({...scope,confirmed:true})
 });
 assert.equal(exported.response.status,200,exported.body);
 assert.ok(exported.response.headers.get('content-type')?.includes('text/csv'));
 assert.ok(exported.body.startsWith('"Employee Code","Employee Name"'), 'Decoded CSV begins with expected columns');
 assert.ok(exported.body.includes('Test Employee A'));
 assert.equal(exported.body.includes('Test Employee B'),false,'No cross-tenant staff in handoff');
 const list=await send('/api/v1/hr/integrations/payroll/history');
 assert.equal(list.response.status,200);
 const items=JSON.parse(list.body);
 assert.ok(items.some(x=>x.export_kind==='approved_leave'&&x.record_count===1));
 const logs=await admin.query("SELECT count(*)::int AS total FROM audit_events WHERE tenant_id=$1 AND action='payroll.generic_csv_exported'",[tenant]);
 assert.equal(logs.rows[0].total,1);
 console.log('PASS: HR MFA, confirmation, sensitive CSV minimization, cross-tenant isolation and export audit');
}finally{
 child.kill();
 await admin.query("UPDATE users SET mfa_enabled=false,mfa_secret_encrypted=NULL,mfa_pending_encrypted=NULL,mfa_last_step=-1 WHERE id=$1",[user]).catch(()=>{});
 await admin.end();
}
