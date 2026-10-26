import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Use disposable cabo_ci only');
const tenant='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const staff='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const employeeB='aaaabbbb-2222-4222-8222-222222222222',outsideLeave=randomUUID();
const port=36471,origin='http://127.0.0.1:'+port;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
let stderr='';
const child=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port)},
 stdio:['ignore','pipe','pipe']});
child.stderr.on('data',x=>stderr+=String(x).slice(0,600));
async function request(path,method='GET',body){
 const res=await fetch(origin+'/api/v1/employee'+path,{method,headers:{
  cookie:'cabo_session='+createSession(staff,tenant),
  ...(method==='GET'?{}:{origin}),'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:method==='GET'?{}:{body:'{}'})});
 return {status:res.status,data:await res.json().catch(()=>({}))};
}
try {
 await db.query("INSERT INTO leave_requests(id,tenant_id,employee_id,leave_type,start_date,end_date,created_by) VALUES($1,$2,$3,'annual','2027-03-01','2027-03-02',$4)",
 [outsideLeave,other,employeeB,owner]);
 for(let i=0;i<45;i++){
  if(child.exitCode!==null)throw Error('API terminated unexpectedly: '+stderr);
  try{if((await fetch(origin+'/health')).ok)break;}catch{}
  if(i===44)throw Error('API not ready: '+stderr);
  await new Promise(r=>setTimeout(r,200));
 }
 const created=await request('/leave','POST',{leaveType:'annual',startDate:'2027-04-03',endDate:'2027-04-04',employeeNote:'Synthetic staff absence'});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const leaveId=created.data.id;
 assert.equal((await request('/leave/'+outsideLeave+'/withdraw','PATCH')).status,409,'Cannot withdraw another tenant leave');
 const changed=await request('/leave/'+leaveId+'/withdraw','PATCH');
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 assert.equal(changed.data.status,'cancelled');
 assert.equal((await request('/leave/'+leaveId+'/withdraw','PATCH')).status,409,'Already withdrawn leave cannot be withdrawn again');
 const row=await db.query('SELECT status,decided_by FROM leave_requests WHERE id=$1',[leaveId]);
 assert.equal(row.rows[0].status,'cancelled');
 assert.equal(row.rows[0].decided_by,staff);
 const log=await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action='employee.leave_withdrawn' AND object_id=$1",[leaveId]);
 assert.equal(log.rows[0].n,1);
 console.log('PASS: employee withdraws own pending leave, blocks cross-tenant and repeat attempts, audits change.');
}finally{child.kill();await db.end();}
