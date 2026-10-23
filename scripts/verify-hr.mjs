import pg from 'pg';
import assert from 'node:assert/strict';
// Runs only against the disposable GitHub Actions PostgreSQL service.
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('HR integration tests must target disposable cabo_ci');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const ua='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ea='aaaabbbb-1111-4111-8111-111111111111',eb='aaaabbbb-2222-4222-8222-222222222222';
await admin.connect();
try{
 await admin.query(`INSERT INTO employees(id,tenant_id,employee_code,full_name,work_email,start_date,created_by)
 VALUES ($1,$2,'A-01','Test Employee A','staff-a@example.test','2026-01-01',$5),
 ($3,$4,'B-01','Test Employee B','staff-b@example.test','2026-01-01',$5)`,[ea,a,eb,b,ua]);
 await admin.query(`INSERT INTO leave_requests(tenant_id,employee_id,leave_type,start_date,end_date,created_by)
 VALUES($1,$2,'annual','2026-10-26','2026-10-28',$5),($3,$4,'annual','2026-10-26','2026-10-28',$5)`,[a,ea,b,eb,ua]);
 await admin.query(`INSERT INTO onboarding_tasks(tenant_id,employee_id,title,category,created_by)
 VALUES($1,$2,'Document check A','documents',$5),($3,$4,'Document check B','documents',$5)`,[a,ea,b,eb,ua]);
 await admin.query(`INSERT INTO performance_reviews(tenant_id,employee_id,period_label,summary,reviewer_id)
 VALUES($1,$2,'2026 Q4','Documented contributions reviewed by manager',$5),
 ($3,$4,'2026 Q4','Documented contributions reviewed by manager',$5)`,[a,ea,b,eb,ua]);
 await admin.query(`INSERT INTO development_plans(tenant_id,employee_id,goal,actions,success_measure,created_by)
 VALUES($1,$2,'Develop reporting skills','Complete approved job-related training','Submit an evidenced report',$5),
 ($3,$4,'Develop reporting skills','Complete approved job-related training','Submit an evidenced report',$5)`,[a,ea,b,eb,ua]);

 const db=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});
 await db.connect();
 try{
  let result=await db.query('SELECT count(*)::int AS count FROM employees');
  assert.equal(result.rows[0].count,0,'no tenant context must reveal no employee data');
  await db.query('BEGIN');
  await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[a,ua]);
  for(const table of ['employees','leave_requests','onboarding_tasks','performance_reviews','development_plans']){
    const rows=await db.query('SELECT tenant_id FROM '+table);
    assert.equal(rows.rows.length,1,table+' tenant A visibility must be limited to one');
    assert.equal(rows.rows[0].tenant_id,a);
  }
  let failed=false;
  await db.query('SAVEPOINT forbidden');
  try{
   await db.query(`INSERT INTO employees(tenant_id,employee_code,full_name,work_email,start_date,created_by)
    VALUES($1,'intruder','Cross tenant data','intruder@example.test','2026-01-01',$2)`,[b,ua]);
  }catch(e){failed=true;assert.equal(e.code,'42501');}
  assert.equal(failed,true,'tenant B insert must be prohibited');
  await db.query('ROLLBACK TO SAVEPOINT forbidden');
  failed=false;
  await db.query('SAVEPOINT wrong_employee');
  try{
   await db.query(`INSERT INTO leave_requests(tenant_id,employee_id,leave_type,start_date,end_date,created_by)
     VALUES($1,$2,'annual','2026-10-26','2026-10-28',$3)`,[a,eb,ua]);
  }catch(e){failed=true;assert.equal(e.code,'23503');}
  assert.equal(failed,true,'cross-tenant parent references must fail');
  await db.query('ROLLBACK TO SAVEPOINT wrong_employee');
  await db.query('ROLLBACK');
  await db.query('BEGIN');
  await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[b,ua]);
  assert.deepEqual((await db.query('SELECT id FROM employees')).rows.map(x=>x.id),[eb]);
  await db.query('ROLLBACK');
  console.log('PASS: HR tenant RLS, private records and composite FK boundaries.');
 }finally{await db.end();}
}finally{await admin.end();}
