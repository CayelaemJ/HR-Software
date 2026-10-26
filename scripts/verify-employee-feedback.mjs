import assert from 'node:assert/strict';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Only disposable cabo_ci may be tested');
const tenant='11111111-1111-4111-8111-111111111111';
const staff='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',hr='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const port=36371,origin='http://127.0.0.1:'+port;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const child=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port)},
 stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',x=>stderr+=String(x).slice(0,800));
async function call(path,user=staff,method='GET',body){
 const res=await fetch(origin+'/api/v1/feedback'+path,{method,headers:{
  cookie:'cabo_session='+createSession(user,tenant),
  ...(method==='GET'?{}:{origin}),'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:method==='GET'?{}:{body:'{}'})});
 return {status:res.status,data:await res.json().catch(()=>({}))};
}
try{
 for(let i=0;i<45;i++){
  if(child.exitCode!==null)throw Error('API exited: '+stderr);
  try{if((await fetch(origin+'/health')).ok)break;}catch{}
  if(i===44)throw Error('API did not start: '+stderr);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const created=await call('/mine',staff,'POST',{category:'profile_correction',message:'Please verify the department field against the original employment letter.'});
 assert.equal(created.status,201,JSON.stringify(created.data));
 assert.equal(created.data.status,'submitted');
 const id=created.data.id;
 const mine=await call('/mine');
 assert.equal(mine.status,200);
 assert.ok(mine.data.some(x=>x.id===id),'Employee can view own evidence submission');
 assert.equal((await call('/hr')).status,403,'Viewer cannot read other employees feedback');
 assert.equal((await call('/hr/'+id+'/acknowledge',staff,'PATCH')).status,403,'Viewer cannot acknowledge their own feedback');
 const inbox=await call('/hr',hr);
 assert.equal(inbox.status,200);
 assert.ok(inbox.data.some(x=>x.id===id),'HR can review organization feedback');
 assert.equal((await call('/hr/'+id+'/acknowledge',hr,'PATCH')).status,200);
 assert.equal((await call('/hr/'+id+'/acknowledge',hr,'PATCH')).status,409,'Feedback receipt cannot be duplicated');
 const result=await db.query('SELECT status,acknowledged_by FROM employee_feedback WHERE id=$1',[id]);
 assert.equal(result.rows[0].status,'acknowledged');
 assert.equal(result.rows[0].acknowledged_by,hr);
 const audit=await db.query("SELECT count(*)::int n FROM audit_events WHERE object_id=$1 AND action IN ('employee.feedback_submitted','employee.feedback_receipt_acknowledged')",[id]);
 assert.equal(audit.rows[0].n,2);
 console.log('PASS: employee-only feedback submissions, HR receipt, replay protection and audit');
}finally{child.kill();await db.end();}
