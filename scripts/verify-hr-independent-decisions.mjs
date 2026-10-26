import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('This test requires disposable cabo_ci');
const tenant='11111111-1111-4111-8111-111111111111';
const root='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherEmployee='aaaabbbb-1111-4111-8111-111111111111';
const hrUser=randomUUID(),authorUser=randomUUID(),employeeId=randomUUID(),leaveId=randomUUID(),reviewId=randomUUID();
const port=36179,origin='http://127.0.0.1:'+port;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
let stderr='';
const child=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port)},
 stdio:['ignore','pipe','pipe']});
child.stderr.on('data',c=>stderr+=String(c).slice(0,750));
async function request(path,user,body){
 const response=await fetch(origin+path,{method:'PATCH',headers:{
  cookie:'cabo_session='+createSession(user,tenant),origin,'content-type':'application/json'},
  body:JSON.stringify(body)});
 return {status:response.status,data:await response.json().catch(()=>({}))};
}
try{
 await db.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)',
 [hrUser,'hr-reviewer-'+hrUser.slice(0,8)+'@example.test','Synthetic Internal Reviewer','synthetic-hash']);
 await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'hr_admin')",[tenant,hrUser]);
 await db.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)',
 [authorUser,'hr-author-'+authorUser.slice(0,8)+'@example.test','Synthetic Review Author','synthetic-hash']);
 await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'hr_admin')",[tenant,authorUser]);
 await db.query("INSERT INTO employees(id,tenant_id,employee_code,full_name,work_email,start_date,created_by) VALUES($1,$2,$3,$4,$5,'2026-01-01',$6)",
 [employeeId,tenant,'SELF-'+hrUser.slice(0,8),'Synthetic HR Review Subject','hr-reviewer-'+hrUser.slice(0,8)+'@example.test',root]);
 await db.query('INSERT INTO employee_accounts(tenant_id,employee_id,user_id,linked_by) VALUES($1,$2,$3,$4)',
 [tenant,employeeId,hrUser,root]);
 await db.query("INSERT INTO leave_requests(id,tenant_id,employee_id,leave_type,start_date,end_date,created_by) VALUES($1,$2,$3,'annual','2027-01-08','2027-01-09',$4)",
 [leaveId,tenant,employeeId,authorUser]);
 await db.query("INSERT INTO performance_reviews(id,tenant_id,employee_id,period_label,summary,status,reviewer_id) VALUES($1,$2,$3,'FY2026','Synthetic performance review prepared for independent signoff','submitted',$4)",
 [reviewId,tenant,employeeId,authorUser]);
 for(let i=0;i<45;i++){
  if(child.exitCode!==null)throw Error('API exited: '+stderr);
  try{if((await fetch(origin+'/health')).ok)break;}catch{}
  if(i===44)throw Error('API did not start: '+stderr);
  await new Promise(r=>setTimeout(r,200));
 }
 const leave='/api/v1/hr/leave/'+leaveId+'/status';
 const review='/api/v1/hr/reviews/'+reviewId+'/status';
 const leaveInput={status:'approved',reason:'Independently approved from available evidence'};
 const reviewInput={status:'finalized',reason:'Independent assessment of performance record'};
 assert.equal((await request(leave,hrUser,leaveInput)).status,409,'Employee must not approve own leave');
 assert.equal((await request(review,hrUser,reviewInput)).status,409,'Employee must not finalize own review');
 assert.equal((await request(leave,authorUser,leaveInput)).status,409,'Request creator cannot approve own leave');
 assert.equal((await request(review,authorUser,reviewInput)).status,409,'Review author cannot finalize own review');
 assert.equal((await request(leave,root,leaveInput)).status,200,'Independent HR can approve leave');
 assert.equal((await request(review,root,reviewInput)).status,200,'Independent HR can finalize review');
 const verified=await db.query('SELECT status,decided_by FROM leave_requests WHERE id=$1',[leaveId]);
 assert.equal(verified.rows[0].status,'approved');
 assert.equal(verified.rows[0].decided_by,root);
 const rev=await db.query('SELECT status,finalized_at FROM performance_reviews WHERE id=$1',[reviewId]);
 assert.equal(rev.rows[0].status,'finalized');
 assert.ok(rev.rows[0].finalized_at);
 const audits=await db.query("SELECT action FROM audit_events WHERE object_id=ANY($1::uuid[]) AND action IN ('leave.human_decision','review.human_status_changed')",[[leaveId,reviewId]]);
 assert.equal(audits.rowCount,2);
 console.log('PASS: employee HR cannot authorize own leave or finalize own review; independent decisions audited');
}finally{child.kill();await db.end();}
