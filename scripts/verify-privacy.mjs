import pg from 'pg';
import assert from 'node:assert/strict';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Privacy RLS test only runs in cabo_ci');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reqA='acacaaaa-1111-4111-8111-111111111111';
const reqB='acacaaaa-2222-4222-8222-222222222222';
await admin.connect();
try{
 await admin.query("INSERT INTO privacy_requests(id,tenant_id,subject_user_id,request_type) VALUES($1,$2,$3,'access'),($4,$5,$6,'erasure')",[reqA,a,user,reqB,b,user]);
 const client=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});
 await client.connect();
 try{
  assert.equal((await client.query('SELECT count(*)::int AS n FROM privacy_requests')).rows[0].n,0,'No tenant context may expose requests');
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[a,user]);
  assert.deepEqual((await client.query('SELECT id FROM privacy_requests')).rows.map(x=>x.id),[reqA]);
  await client.query('SAVEPOINT forbidden');
  let failed=false;
  try{
   await client.query("INSERT INTO privacy_requests(tenant_id,subject_user_id,request_type) VALUES($1,$2,'access')",[b,user]);
  }catch(error){failed=true;assert.equal(error.code,'42501');}
  assert.equal(failed,true);
  await client.query('ROLLBACK TO SAVEPOINT forbidden');
  const modified=await client.query("UPDATE privacy_requests SET status='in_review',response_note='Request acknowledged' WHERE id=$1 RETURNING id",[reqB]);
  assert.equal(modified.rowCount,0,'Cross tenant request cannot be modified');
  await client.query('ROLLBACK');
  console.log('PASS: privacy request tenant isolation, secret account data not exposed.');
 }finally{await client.end();}
}finally{await admin.end();}
