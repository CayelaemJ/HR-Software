import pg from 'pg';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {purgeExpiredCandidateDocuments} from '../apps/api/dist/retention.js';
import {pool} from '../apps/api/dist/db.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Retention check only runs on disposable cabo_ci');
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ca='55555555-5555-4555-8555-555555555555';
const cb='66666666-6666-4666-8666-666666666666';
const idExpired='12121212-1212-4212-8212-121212121212';
const idFresh='34343434-3434-4434-8434-343434343434';
const body=Buffer.from('%PDF-1.4\nRetention fixture\n%%EOF\n');
const digest=createHash('sha256').update(body).digest('hex');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
try{
 const insert=`INSERT INTO candidate_documents(id,tenant_id,candidate_id,original_name,media_type,
 byte_length,sha256_hex,content,uploaded_by,expires_at)
 VALUES($1,$2,$3,'retention-test.pdf','application/pdf',$4,$5,$6,$7,$8)`;
 await admin.query(insert,[idExpired,a,ca,body.length,digest,body,user,new Date(Date.now()-60000)]);
 await admin.query(insert,[idFresh,b,cb,body.length,digest,body,user,new Date(Date.now()+86400000)]);
 const r=await purgeExpiredCandidateDocuments();
 assert.equal(r.locked,false);
 assert.equal(r.removed,1,'exactly one expired CV must be physically removed');
 const remaining=await admin.query('SELECT id,scan_status FROM candidate_documents WHERE id IN ($1,$2) ORDER BY id',[idExpired,idFresh]);
 assert.deepEqual(remaining.rows.map(x=>x.id),[idFresh]);
 assert.equal(remaining.rows[0].scan_status,'pending','unscanned docs must be quarantined by default');
 const audit=await admin.query('SELECT tenant_id,removed_count FROM document_retention_runs WHERE tenant_id=$1',[a]);
 assert.equal(audit.rows.reduce((n,x)=>n+x.removed_count,0),1);
 const repeat=await purgeExpiredCandidateDocuments();
 assert.equal(repeat.removed,0,'subsequent run is idempotent');
 const restricted=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});
 await restricted.connect();
 try{
  const unscoped=await restricted.query('SELECT count(*)::int AS n FROM document_retention_runs');
  assert.equal(unscoped.rows[0].n,0,'retention data must not leak without tenant scope');
  await restricted.query('BEGIN');
  await restricted.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[a,user]);
  assert.equal((await restricted.query('SELECT count(*)::int AS n FROM document_retention_runs')).rows[0].n,1);
  await restricted.query('ROLLBACK');
 }finally{await restricted.end();}
 console.log('PASS: expired CV bytes purged, fresh records retained, auditable tenant-bound retention.');
}finally{await admin.end();await pool.end();}
