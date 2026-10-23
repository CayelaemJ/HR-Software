// Integration test: real PostgreSQL RLS using an ordinary, non-owner login role.
import pg from 'pg';
import assert from 'node:assert/strict';
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
const tenantA='11111111-1111-4111-8111-111111111111';
const tenantB='22222222-2222-4222-8222-222222222222';
const userA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jobA='33333333-3333-4333-8333-333333333333';
const jobB='44444444-4444-4444-8444-444444444444';
try {
  await admin.query("CREATE ROLE cabo_runtime LOGIN PASSWORD 'local-test-password'");
  await admin.query('GRANT USAGE ON SCHEMA public TO cabo_runtime');
  await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cabo_runtime');
  await admin.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cabo_runtime');
  await admin.query("INSERT INTO organizations(id,name) VALUES($1,'Tenant A'),($2,'Tenant B')",[tenantA,tenantB]);
  await admin.query("INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'synthetic@example.test','Synthetic User','not-a-password')",[userA]);
  await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$3,'owner'),($2,$3,'viewer')",[tenantA,tenantB,userA]);
  await admin.query("INSERT INTO jobs(id,tenant_id,title,description,criteria,created_by) VALUES($1,$2,'A role','Role description here','Measurable qualifications',$5),($3,$4,'B role','Role description here','Measurable qualifications',$5)",[jobA,tenantA,jobB,tenantB,userA]);
  const client=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});
  await client.connect();
  try{
    const role=await client.query('SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user');
    assert.equal(role.rows[0].rolbypassrls,false);
    assert.equal(Number((await client.query('SELECT count(*) AS count FROM jobs')).rows[0].count),0,'records leaked without tenant context');
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantA]);
    await client.query("SELECT set_config('app.user_id',$1,true)",[userA]);
    const a=await client.query('SELECT id FROM jobs ORDER BY id');
    assert.deepEqual(a.rows.map(x=>x.id),[jobA],'tenant A must see only A');
    const invisible=await client.query('UPDATE jobs SET status=$1 WHERE id=$2 RETURNING id',['closed',jobB]);
    assert.equal(invisible.rowCount,0,'cross-tenant writes must be invisible');
    let blocked=false;
    try {
      await client.query("INSERT INTO candidates(tenant_id,full_name,email) VALUES($1,'Intruder','no@example.test')",[tenantB]);
    }catch(error){blocked=true;assert.equal(error.code,'42501');}
    assert.equal(blocked,true,'RLS must reject writes to another tenant');
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantB]);
    const b=await client.query('SELECT id FROM jobs');
    assert.deepEqual(b.rows.map(x=>x.id),[jobB],'tenant B must see only B');
    await client.query('ROLLBACK');
    console.log('PASS: PostgreSQL row-level security isolates tenants for reads and writes.');
  }finally{await client.end();}
}finally{await admin.end();}
