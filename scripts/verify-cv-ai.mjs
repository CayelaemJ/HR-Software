import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Use only disposable cabo_ci');
const tenantA='11111111-1111-4111-8111-111111111111';
const tenantB='22222222-2222-4222-8222-222222222222';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const viewer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const jobA='33333333-3333-4333-8333-333333333333',jobB='44444444-4444-4444-8444-444444444444';
const docA='aaaaaaaa-1111-4111-8111-111111111111';
const port=35317,origin='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port),GROQ_API_KEY:'',CLAMAV_HOST:'',HR_CV_AI_EXTERNAL_ENABLED:'true'},
 stdio:['ignore','pipe','pipe']
});
let stderr='';child.stderr.on('data',x=>stderr+=String(x).slice(0,600));
const session=(user,tenant)=>'cabo_session='+createSession(user,tenant);
async function post(user,tenant,body){
 const response=await fetch(origin+'/api/v1/ai/cv/evidence',{method:'POST',headers:{
  cookie:session(user,tenant),'content-type':'application/json',origin},body:JSON.stringify(body)});
 return {status:response.status,body:await response.json().catch(()=>({}))};
}
try{
 for(let n=0;n<35;n++){
  if(child.exitCode!==null)throw Error('API terminated: '+stderr);
  try{if((await fetch(origin+'/health')).ok)break;}catch{}
  if(n===34)throw Error('API did not start: '+stderr);
  await new Promise(r=>setTimeout(r,200));
 }
 const input={jobId:jobA,documentId:docA,confirmExternalProcessing:true};
 assert.equal((await post(viewer,tenantA,input)).status,403,'viewer cannot request AI analysis');
 assert.equal((await post(owner,tenantB,input)).status,403,'tenant B viewer cannot access any recruitment CV');
 assert.equal((await post(owner,tenantA,{...input,jobId:jobB})).status,404,'role document pair must match an actual application');
 assert.equal((await post(owner,tenantA,input)).status,423,'quarantined documents never reach AI provider');
 assert.equal((await post(owner,tenantA,{jobId:jobA,documentId:docA})).status,400,'explicit external processing approval required');
 console.log('PASS: CV AI enforces staff permissions, document/role boundaries, quarantine and explicit opt-in.');
}finally{child.kill();}
