import pg from 'pg';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('AI human review test requires disposable cabo_ci');
const tenantA='11111111-1111-4111-8111-111111111111',tenantB='22222222-2222-4222-8222-222222222222';
const userA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const viewer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const jobA='33333333-3333-4333-8333-333333333333',jobB='44444444-4444-4444-8444-444444444444';
const draftA='20202020-2020-4020-8020-202020202020',draftB='30303030-3030-4030-8030-303030303030';
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
const questions=JSON.stringify([
 {question:'How would you validate the key requirements?',criterion:'Technical ability',guidance:'Ask for practical evidence.'},
 {question:'Explain your approach to a common problem.',criterion:'Problem solving',guidance:'Compare observed work evidence.'},
 {question:'How would you communicate this decision?',criterion:'Communication',guidance:'Check concrete role examples.'}
]);
const servicePort=34991;
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(servicePort)},stdio:['ignore','pipe','pipe']
});
let stderr='';child.stderr.on('data',d=>stderr+=String(d).slice(0,500));
const base='http://127.0.0.1:'+servicePort;
const cookie='cabo_session='+createSession(userA,tenantA);
const viewCookie='cabo_session='+createSession(viewer,tenantA);
async function call(path,options={},session=cookie){
 const response=await fetch(base+path,{...options,headers:{cookie:session,'content-type':'application/json',...(options.method&&!['GET','HEAD'].includes(options.method)?{origin:base}:{}),...options.headers}});
 const body=await response.json().catch(()=>({}));
 return {response,body};
}
try{
 for(let i=0;i<40;i++){
  if(child.exitCode!==null)throw Error('API exited early '+stderr);
  try{if((await fetch(base+'/health')).ok)break;}catch{}
  if(i===39)throw Error('API not ready '+stderr);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 await admin.query(`INSERT INTO ai_question_drafts
  (id,tenant_id,job_id,model_provider,model_name,input_sha256,questions,generated_by)
  VALUES($1,$2,$3,'groq','synthetic-ci-model',$7,$8::jsonb,$9),
        ($4,$5,$6,'groq','synthetic-ci-model',$7,$8::jsonb,$9)`,
  [draftA,tenantA,jobA,draftB,tenantB,jobB,'a'.repeat(64),questions,userA]);
 const list=await call('/api/v1/ai/drafts?jobId='+jobA);
 assert.equal(list.response.status,200);
 assert.deepEqual(list.body.map(x=>x.id),[draftA],'Only the current tenant draft should be visible');
 const denied=await call('/api/v1/ai/drafts',{},viewCookie);
 assert.equal(denied.response.status,403,'Viewer role cannot access AI drafts');
 const invalid=await call('/api/v1/ai/drafts/'+draftA+'/review',{
  method:'POST',body:JSON.stringify({status:'approved',reason:'too short'})
 });
 assert.equal(invalid.response.status,400,'Human review reason must be documented');
 const foreign=await call('/api/v1/ai/drafts/'+draftB+'/review',{
  method:'POST',body:JSON.stringify({status:'rejected',reason:'Tenant boundaries must be protected'})
 });
 assert.equal(foreign.response.status,409,'Cannot review another tenant draft');
 const accepted=await call('/api/v1/ai/drafts/'+draftA+'/review',{
  method:'POST',body:JSON.stringify({status:'approved',reason:'Reviewed against the published role criteria'})
 });
 assert.equal(accepted.response.status,200,JSON.stringify(accepted.body));
 assert.equal(accepted.body.status,'approved');
 assert.equal(accepted.body.reviewer_independent,false,'Self review must be labeled');
 const twice=await call('/api/v1/ai/drafts/'+draftA+'/review',{
  method:'POST',body:JSON.stringify({status:'rejected',reason:'Reversing without policy is prohibited'})
 });
 assert.equal(twice.response.status,409,'Final review cannot be silently reversed');
 const audit=await admin.query("SELECT count(*)::int AS n FROM audit_events WHERE tenant_id=$1 AND action='ai.draft_human_reviewed'",[tenantA]);
 assert.equal(audit.rows[0].n,1);
 const other=await admin.query('SELECT status FROM ai_question_drafts WHERE id=$1',[draftB]);
 assert.equal(other.rows[0].status,'pending_review');
 console.log('PASS: tenant-isolated AI drafts, role guard, human reason, explicit self-review and audit');
}finally{child.kill();await admin.end();}
