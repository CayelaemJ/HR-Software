// Synthetic demonstration seed smoke test (disposable CI database).
import assert from 'node:assert/strict';
import {seedDemoWorkspace} from '../apps/api/dist/demo.js';
import {inTenant,pool} from '../apps/api/dist/db.js';
const actor={tenantId:'11111111-1111-4111-8111-111111111111',userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'owner'};
const audit=async (db,a,action,objectType,objectId,details={})=>{
 await db.query('INSERT INTO audit_events(tenant_id,actor_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5,$6)',
 [a.tenantId,a.userId,action,objectType,objectId,JSON.stringify(details)]);
};
try{
 const first=await seedDemoWorkspace(actor,audit);
 assert.equal(first.alreadySeeded,false);
 assert.equal(first.jobs,3);
 assert.equal(first.candidates,4);
 assert.equal(first.applications,4);
 const again=await seedDemoWorkspace(actor,audit);
 assert.equal(again.alreadySeeded,true);
 const result=await inTenant(actor.tenantId,actor.userId,async db=>{
  const jobs=await db.query('SELECT count(*)::int AS n FROM jobs WHERE is_demo=true');
  const people=await db.query('SELECT count(*)::int AS n FROM candidates WHERE is_demo=true');
  const evidence=await db.query('SELECT count(*)::int AS n FROM candidate_evidence WHERE is_demo=true');
  const interviews=await db.query('SELECT count(*)::int AS n FROM interviews WHERE is_demo=true');
  const audit=await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action='demo.workspace_seeded'");
  return {jobs:jobs.rows[0].n,candidates:people.rows[0].n,evidence:evidence.rows[0].n,interviews:interviews.rows[0].n,audit:audit.rows[0].n};
 });
 assert.deepEqual(result,{jobs:3,candidates:4,evidence:4,interviews:1,audit:1});
 console.log('PASS: One-time synthetic demo records, accurate counts and audit.');
}finally{await pool.end();}
