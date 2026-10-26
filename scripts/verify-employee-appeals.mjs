import assert from 'node:assert/strict';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createSession} from '../apps/api/dist/security.js';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Only disposable cabo_ci database is allowed');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const staff='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const employeeA='aaaabbbb-1111-4111-8111-111111111111',employeeB='aaaabbbb-2222-4222-8222-222222222222';
const ownReview=randomUUID(),otherReview=randomUUID(),port=35581,origin='http://127.0.0.1:'+port;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
let stderr='';
const child=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port),CLAMAV_HOST:''},stdio:['ignore','pipe','pipe']});
child.stderr.on('data',c=>stderr+=String(c).slice(0,700));
async function appeal(reviewId,body){
 const r=await fetch(origin+'/api/v1/employee/reviews/'+reviewId+'/appeal',{method:'POST',
  headers:{cookie:'cabo_session='+createSession(staff,A),origin,'content-type':'application/json'},
  body:JSON.stringify(body)});
 return {status:r.status,payload:await r.json().catch(()=>({}))};
}
try{
 await db.query("INSERT INTO performance_reviews(id,tenant_id,employee_id,period_label,summary,status,finalized_at,reviewer_id) VALUES($1,$2,$3,'2026 Q4','Synthetic finalized review summarizing verifiable achievements','finalized',now(),$7),($4,$5,$6,'2026 Q4','Another tenant synthetic finalized review data','finalized',now(),$7)",[ownReview,A,employeeA,otherReview,B,employeeB,adminId]);
 for(let i=0;i<35;i++){
  if(child.exitCode!==null)throw Error('API exited unexpectedly: '+stderr);
  try{if((await fetch(origin+'/health')).ok)break;}catch{}
  if(i===34)throw Error('API not ready: '+stderr);
  await new Promise(r=>setTimeout(r,200));
 }
 const body={evidenceSummary:'My documented project results were omitted from this review.',requestedOutcome:'Request independent reassessment using project evidence.'};
 assert.equal((await appeal(otherReview,body)).status,404,'Cross-tenant review must not be appealable');
 const first=await appeal(ownReview,body);
 assert.equal(first.status,201,JSON.stringify(first.payload));
 assert.equal(first.payload.related_review_id,ownReview);
 assert.equal(first.payload.status,'pending');
 assert.equal((await appeal(ownReview,body)).status,409,'Duplicate unresolved appeals must be prevented');
 const c=await db.query("SELECT p.employee_id,p.created_by,a.action FROM progression_cases p JOIN audit_events a ON a.object_id=p.id WHERE p.related_review_id=$1 AND p.kind='performance_appeal'",[ownReview]);
 assert.equal(c.rowCount,1);
 assert.equal(c.rows[0].employee_id,employeeA);
 assert.equal(c.rows[0].created_by,staff);
 assert.equal(c.rows[0].action,'employee.performance_appeal_requested');
 console.log('PASS: only linked employee can appeal own final review, once per open case, with an audit trail.');
}finally{child.kill();await db.end();}
