// Real PostgreSQL checks: verify evidence, interviews and scorecards cannot cross tenants.
// Runs after verify-rls.mjs in disposable CI PostgreSQL, with synthetic records only.
import pg from 'pg';
import assert from 'node:assert/strict';
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jobA='33333333-3333-4333-8333-333333333333';
const jobB='44444444-4444-4444-8444-444444444444';
const candidateA='55555555-5555-4555-8555-555555555555';
const candidateB='66666666-6666-4666-8666-666666666666';
const appA='77777777-7777-4777-8777-777777777777';
const appB='88888888-8888-4888-8888-888888888888';
const interviewA='99999999-9999-4999-8999-999999999999';
const interviewB='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
await admin.connect();
try{
 await admin.query('INSERT INTO candidates(id,tenant_id,full_name,email) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',[candidateA,a,'Synthetic A','a@example.test',candidateB,b,'Synthetic B','b@example.test']);
 await admin.query('INSERT INTO applications(id,tenant_id,job_id,candidate_id,stage) VALUES($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)',[appA,a,jobA,candidateA,'interview',appB,b,jobB,candidateB,'interview']);
 await admin.query("INSERT INTO candidate_evidence(tenant_id,candidate_id,claim_type,claim_text,created_by) VALUES($1,$2,'skill','Synthetic first capability',$5),($3,$4,'skill','Synthetic second capability',$5)",[a,candidateA,b,candidateB,user]);
 await admin.query("INSERT INTO interviews(id,tenant_id,application_id,scheduled_at,interviewer_id,created_by) VALUES($1,$2,$3,now(),$7,$7),($4,$5,$6,now(),$7,$7)",[interviewA,a,appA,interviewB,b,appB,user]);
 await admin.query("INSERT INTO interview_scorecards(tenant_id,interview_id,criterion,observation,finding,reviewer_id) VALUES($1,$2,'Technical skill','Candidate described relevant project', 'evidence_observed',$5),($3,$4,'Technical skill','Candidate described another project','evidence_observed',$5)",[a,interviewA,b,interviewB,user]);
 const runtime=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});
 await runtime.connect();
 try{
   await runtime.query('BEGIN');
   await runtime.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[a,user]);
   for(const table of ['candidate_evidence','interviews','interview_scorecards']){
     const rows=await runtime.query('SELECT tenant_id FROM '+table);
     assert.equal(rows.rows.length,1,table+' must expose one tenant A record');
     assert.equal(rows.rows[0].tenant_id,a);
   }
   await runtime.query('SAVEPOINT invalid_evidence');
   let failed=false;
   try{await runtime.query("UPDATE candidate_evidence SET review_status='verified' WHERE candidate_id=$1",[candidateA]);}
   catch(err){failed=true;assert.equal(err.code,'23514');}
   assert.equal(failed,true,'Unreferenced evidence must not be independently verified');
   await runtime.query('ROLLBACK TO SAVEPOINT invalid_evidence');
   await runtime.query('SAVEPOINT invalid_tenant');
   failed=false;
   try{await runtime.query("INSERT INTO candidate_evidence(tenant_id,candidate_id,claim_type,claim_text,created_by) VALUES($1,$2,'skill','Attempted cross-tenant claim',$3)",[b,candidateB,user]);}
   catch(err){failed=true;assert.equal(err.code,'42501');}
   assert.equal(failed,true,'Cross-tenant evidence write must fail');
   await runtime.query('ROLLBACK TO SAVEPOINT invalid_tenant');
   await runtime.query('SAVEPOINT invalid_link');
   failed=false;
   try{await runtime.query("INSERT INTO candidate_evidence(tenant_id,candidate_id,claim_type,claim_text,created_by) VALUES($1,$2,'skill','Cross tenant parent record',$3)",[a,candidateB,user]);}
   catch(err){failed=true;assert.equal(err.code,'23503');}
   assert.equal(failed,true,'Candidate evidence must use a same-tenant candidate');
   await runtime.query('ROLLBACK TO SAVEPOINT invalid_link');
   await runtime.query('ROLLBACK');
   console.log('PASS: Evidence, interviews, scorecards tenant isolation and verification provenance.');
 } finally {await runtime.end();}
}finally{await admin.end();}
