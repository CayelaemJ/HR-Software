import pg from 'pg';
import assert from 'node:assert/strict';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Only disposable cabo_ci database may be tested');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const tenant='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const employee='aaaabbbb-1111-4111-8111-111111111111',foreign='aaaabbbb-2222-4222-8222-222222222222';
const user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',adminUser='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await admin.connect();
try {
 await admin.query("INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'staff-a@example.test','Portal Test Staff','synthetic-unused')",[user]);
 await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'viewer')",[tenant,user]);
 await admin.query('INSERT INTO employee_accounts(tenant_id,employee_id,user_id,linked_by) VALUES($1,$2,$3,$4)',[tenant,employee,user,adminUser]);
 const db=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});
 await db.connect();
 try {
  assert.equal((await db.query('SELECT count(*)::int n FROM employee_accounts')).rows[0].n,0);
  await db.query('BEGIN');
  await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[tenant,user]);
  assert.deepEqual((await db.query('SELECT employee_id FROM employee_accounts WHERE user_id=$1',[user])).rows.map(r=>r.employee_id),[employee]);
  assert.equal((await db.query('SELECT id FROM employees WHERE id=$1',[foreign])).rowCount,0);
  await db.query('SAVEPOINT forbidden');
  let denied=false;
  try {await db.query('INSERT INTO employee_accounts(tenant_id,employee_id,user_id,linked_by) VALUES($1,$2,$3,$4)',[tenant,foreign,adminUser,adminUser]);}
  catch(e){denied=true;assert.equal(e.code,'23503');}
  assert.equal(denied,true,'Cross-tenant employee FK must reject linking');
  await db.query('ROLLBACK TO SAVEPOINT forbidden');
  await db.query('ROLLBACK');
  await db.query('BEGIN');
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[other]);
  assert.equal((await db.query('SELECT employee_id FROM employee_accounts')).rowCount,0);
  await db.query('ROLLBACK');
  console.log('PASS: employee account RLS, tenant isolation and relationship integrity');
 } finally{await db.end();}
}finally{await admin.end();}
