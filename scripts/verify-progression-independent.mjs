import assert from 'node:assert/strict';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Use the isolated cabo_ci database only');
const tenant='11111111-1111-4111-8111-111111111111';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const author='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reviewer='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const linkedEmployee=randomUUID(),emailEmployee=randomUUID();
const linkedCase=randomUUID(),emailCase=randomUUID();
const port=35491,origin='http://127.0.0.1:'+port;
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
const child=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port),CLAMAV_HOST:''},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',chunk=>stderr+=String(chunk).slice(0,650));
async function decide(user,id) {
 const response=await fetch(origin+'/api/v1/hr/progression/'+id+'/decision',{
  method:'PATCH',headers:{cookie:'cabo_session='+createSession(user,tenant),
   origin,'content-type':'application/json'},
  body:JSON.stringify({status:'under_review',reason:'Independently reviewed against documented criteria.'})
 });
 return response.status;
}
try {
 await admin.query("INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'independent-hr@example.test','Independent HR Reviewer','synthetic-no-login')",[reviewer]);
 await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'hr_admin')",[tenant,reviewer]);
 await admin.query("INSERT INTO employees(id,tenant_id,employee_code,full_name,work_email,start_date,created_by) VALUES($1,$2,'OWN-PROG','Synthetic Owner Employee','synthetic@example.test','2026-01-01',$3),($4,$2,'EMAIL-PROG','Synthetic Email-Matched Employee','synthetic@example.test','2026-01-01',$3)",[linkedEmployee,tenant,owner,emailEmployee]);
 await admin.query('INSERT INTO employee_accounts(tenant_id,employee_id,user_id,linked_by) VALUES($1,$2,$3,$4)',[tenant,linkedEmployee,owner,reviewer]);
 await admin.query("INSERT INTO progression_cases(id,tenant_id,employee_id,kind,evidence_summary,requested_outcome,created_by) VALUES($1,$2,$3,'promotion','Verified synthetic case evidence for self-review checks','Request independent criteria review',$4),($5,$2,$6,'salary_review','Verified synthetic case evidence for self-review checks','Request independent compensation review',$4)",[linkedCase,tenant,linkedEmployee,author,emailCase,emailEmployee]);
 for(let n=0;n<40;n++){if(child.exitCode!==null)throw Error('API exited: '+stderr);try{if((await fetch(origin+'/health')).ok)break;}catch{}if(n===39)throw Error('API did not start: '+stderr);await new Promise(resolve=>setTimeout(resolve,200));}
 assert.equal(await decide(owner,linkedCase),409,'Linked employee must not decide own case');
 assert.equal(await decide(owner,emailCase),409,'Work email identity match must block self approval without linkage');
 assert.equal(await decide(reviewer,linkedCase),200,'Independent authorized HR reviewer can advance case');
 assert.equal(await decide(reviewer,emailCase),200,'Independent authorized HR reviewer can advance unlinked case');
 const log=await admin.query("SELECT count(*)::int AS count FROM audit_events WHERE tenant_id=$1 AND action='progression.human_decision' AND object_id=ANY($2::uuid[])",[tenant,[linkedCase,emailCase]]);
 assert.equal(log.rows[0].count,2);
 console.log('PASS: linked/unlinked employee self-review blocked and independent HR decisions audited');
}finally{child.kill();await admin.end();}
