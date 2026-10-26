import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Disposable cabo_ci database required');
const tenant='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const employee='aaaabbbb-1111-4111-8111-111111111111',otherEmployee='aaaabbbb-2222-4222-8222-222222222222';
const staff='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',hr='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const taskId=randomUUID(),otherTask=randomUUID(),port=36119,base='http://127.0.0.1:'+port;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port),PUBLIC_APPLICATIONS_ENABLED:'false'},
 stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',part=>stderr+=String(part).slice(0,700));
async function call(path,method='GET'){
 const response=await fetch(base+path,{method,headers:{cookie:'cabo_session='+createSession(staff,tenant),
 ...(method==='GET'?{}:{origin:base}),'content-type':'application/json'},
 ...(method==='GET'?{}:{body:'{}'})});
 return {status:response.status,data:await response.json().catch(()=>({}))};
}
try{
 await db.query(`INSERT INTO onboarding_tasks(id,tenant_id,employee_id,title,category,created_by)
  VALUES($1,$2,$3,'Read security onboarding instructions','orientation',$7),
        ($4,$5,$6,'Other tenant internal onboarding task','it',$7)`,
  [taskId,tenant,employee,otherTask,other,otherEmployee,hr]);
 for(let i=0;i<45;i++){
  if(child.exitCode!==null)throw Error('API exited: '+stderr);
  try{if((await fetch(base+'/health')).ok)break;}catch{}
  if(i===44)throw Error('API not ready: '+stderr);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const own=await call('/api/v1/employee/onboarding/'+taskId+'/acknowledge','PATCH');
 assert.equal(own.status,200,JSON.stringify(own.data));
 assert.equal(own.data.status,'pending','Receipt cannot mark task complete');
 assert.equal((await call('/api/v1/employee/onboarding/'+taskId+'/acknowledge','PATCH')).status,409,'Repeat receipt denied');
 assert.equal((await call('/api/v1/employee/onboarding/'+otherTask+'/acknowledge','PATCH')).status,409,'Cross-tenant receipt denied');
 assert.equal((await call('/api/v1/hr/onboarding/'+taskId,'PATCH')).status,403,'Employee cannot bypass HR completion workflow');
 const row=await db.query('SELECT employee_acknowledged_at,employee_acknowledged_by,status FROM onboarding_tasks WHERE id=$1',[taskId]);
 assert.ok(row.rows[0].employee_acknowledged_at);
 assert.equal(row.rows[0].employee_acknowledged_by,staff);
 assert.equal(row.rows[0].status,'pending');
 const history=await db.query("SELECT count(*)::int n FROM audit_events WHERE object_id=$1 AND action='onboarding.employee_receipt_acknowledged'",[taskId]);
 assert.equal(history.rows[0].n,1);
 console.log('PASS: private employee receipt, HR status preservation and audit');
}finally{child.kill();await db.end();}
