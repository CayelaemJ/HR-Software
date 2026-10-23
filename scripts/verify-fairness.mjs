import pg from 'pg';
import assert from 'node:assert/strict';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Disposable cabo_ci database required');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const E='aaaabbbb-1111-4111-8111-111111111111',F='aaaabbbb-2222-4222-8222-222222222222';
const U='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await admin.connect();
try{
 await admin.query("INSERT INTO progression_cases(tenant_id,employee_id,kind,evidence_summary,requested_outcome,created_by,created_at) VALUES($1,$2,'promotion','Synthetic documented professional accomplishments','Request independent human review',$5,now()-interval '45 days'),($3,$4,'promotion','Synthetic documented professional accomplishments','Request independent human review',$5,now()-interval '45 days')",[A,E,B,F,U]);
 const db=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});await db.connect();
 try{
  assert.equal((await db.query("SELECT count(*)::int n FROM progression_cases WHERE status='pending'")).rows[0].n,0);
  for(const t of [A,B]){
   await db.query('BEGIN');
   await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[t,U]);
   const r=await db.query("SELECT tenant_id FROM progression_cases WHERE status='pending' AND created_at < now()-interval '30 days'");
   assert.deepEqual(r.rows.map(x=>x.tenant_id),[t]);
   await db.query('ROLLBACK');
  }
  console.log('PASS: overdue HR review case monitoring remains tenant isolated.');
 }finally{await db.end();}
}finally{await admin.end();}
