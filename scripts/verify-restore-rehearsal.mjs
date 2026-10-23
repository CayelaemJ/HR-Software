import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Strict test-only restore rehearsal: never copy real applicant or employee data
// to a CI runner and never accept a production Neon connection string.
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
assert.equal(url.hostname,'127.0.0.1','DR rehearsal must run against loopback Postgres only');
assert.equal(url.pathname,'/cabo_ci','DR rehearsal requires the disposable cabo_ci');
assert.equal(url.username,'postgres','DR rehearsal expects disposable GitHub Actions owner');
const base=new URL(url);
base.pathname='/postgres';
const restore=new URL(url);
restore.pathname='/cabo_ci_restore';
const tmp=mkdtempSync(join(tmpdir(),'cabo-restore-ci-'));
const archive=join(tmp,'synthetic.dump');
const run=(binary,args)=>execFileSync(binary,args,{encoding:'utf8',timeout:120_000,stdio:['ignore','pipe','pipe']}).trim();
const sql=(connection,command)=>run('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','--dbname',connection.toString(),'-c',command]);
try{
 console.log('Starting CABO disposable database restore rehearsal');
 const primary=sql(url,'SELECT count(*)::int FROM schema_migrations');
 assert.ok(Number(primary)>=10,'Synthetic database should include applied migrations');
 const expected={};
 for(const table of ['organizations','memberships','jobs','employees','audit_events','candidate_documents','schema_migrations'])
  expected[table]=Number(sql(url,'SELECT count(*)::int FROM '+table));
 assert.ok(expected.organizations>=2,'Synthetic tenant fixtures are required');
 run('pg_dump',['--format=custom','--no-owner','--no-acl','--file',archive,url.toString()]);
 assert.ok(statSync(archive).size>=4096,'Database backup must contain real schema and fixtures');
 sql(base,'CREATE DATABASE cabo_ci_restore');
 run('pg_restore',['--no-owner','--no-privileges','--exit-on-error','--dbname',restore.toString(),archive]);
 for(const [table,value] of Object.entries(expected)){
  const restored=Number(sql(restore,'SELECT count(*)::int FROM '+table));
  assert.equal(restored,value,'Restored '+table+' row count must match backup');
 }
 const forced=Number(sql(restore,'SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\'public\' AND c.relkind=\'r\' AND c.relrowsecurity AND c.relforcerowsecurity'));
 assert.ok(forced>=10,'Restored tenant tables must retain forced RLS');
 // Role grants do not belong in portable data dumps. Reprovision test-only access.
 sql(restore,'GRANT USAGE ON SCHEMA public TO cabo_runtime');
 sql(restore,'GRANT SELECT ON ALL TABLES IN SCHEMA public TO cabo_runtime');
 const hidden=sql(restore,"BEGIN; SET LOCAL ROLE cabo_runtime; SELECT count(*)::int FROM employees; ROLLBACK");
 assert.ok(hidden.split('\n').includes('0'),'Restricted role must not see staff without tenant context');
 console.log('PASS: synthetic backup restored, row counts match, forced RLS and isolation persist');
}finally{
 try{sql(base,'DROP DATABASE IF EXISTS cabo_ci_restore WITH (FORCE)');}catch{}
 rmSync(tmp,{recursive:true,force:true});
}
