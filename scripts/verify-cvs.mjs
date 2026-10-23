import pg from 'pg';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateDocument} from '../apps/api/dist/documents.js';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('CV checks must use disposable cabo_ci database');
const tenantA='11111111-1111-4111-8111-111111111111',tenantB='22222222-2222-4222-8222-222222222222';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',candidateA='55555555-5555-4555-8555-555555555555',candidateB='66666666-6666-4666-8666-666666666666';
const content=Buffer.from('%PDF-1.7\n% Demo document only\n1 0 obj << /Type /Catalog >>\nendobj\n%%EOF\n');
const base64=content.toString('base64');
const v={candidateId:candidateA,originalName:'demonstration.pdf',mediaType:'application/pdf',base64,consentConfirmed:true};
const validated=validateDocument(v);
assert.equal(validated.sha,createHash('sha256').update(content).digest('hex'));
assert.deepEqual(validated.bytes,content);
assert.throws(()=>validateDocument({...v,originalName:'forged.docx'}),/File signature/);
assert.throws(()=>validateDocument({...v,base64:'not-base64'}),/Invalid document/);
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
try{
 const docA='aaaaaaaa-1111-4111-8111-111111111111',docB='bbbbbbbb-2222-4222-8222-222222222222';
 await admin.query(`INSERT INTO candidate_documents(id,tenant_id,candidate_id,original_name,media_type,byte_length,sha256_hex,content,uploaded_by)
  VALUES($1,$2,$3,'demo-a.pdf','application/pdf',$7,$8,$9,$10),($4,$5,$6,'demo-b.pdf','application/pdf',$7,$8,$9,$10)`,
  [docA,tenantA,candidateA,docB,tenantB,candidateB,content.length,validated.sha,content,user]);
 const runtime=new pg.Client({connectionString:'postgresql://cabo_runtime:local-test-password@127.0.0.1:5432/cabo_ci'});
 await runtime.connect();
 try{
  assert.equal((await runtime.query('SELECT count(*)::int AS n FROM candidate_documents')).rows[0].n,0);
  await runtime.query('BEGIN');
  await runtime.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)",[tenantA,user]);
  const shown=await runtime.query('SELECT id,tenant_id,content FROM candidate_documents');
  assert.equal(shown.rowCount,1);
  assert.equal(shown.rows[0].id,docA);
  assert.deepEqual(shown.rows[0].content,content);
  await runtime.query('SAVEPOINT cross_tenant');
  let forbidden=false;
  try{
   await runtime.query(`INSERT INTO candidate_documents(tenant_id,candidate_id,original_name,media_type,byte_length,sha256_hex,content,uploaded_by)
    VALUES($1,$2,'cross.pdf','application/pdf',$4,$5,$6,$3)`,[tenantB,candidateB,user,content.length,validated.sha,content]);
  }catch(e){forbidden=true;assert.equal(e.code,'42501');}
  assert.equal(forbidden,true,'tenant B document insertion denied');
  await runtime.query('ROLLBACK TO SAVEPOINT cross_tenant');
  await runtime.query('ROLLBACK');
  console.log('PASS: CV file validation, private storage integrity, cross-tenant access isolation.');
 }finally{await runtime.end();}
}finally{await admin.end();}
