import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Disposable database required');
const user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tenant='11111111-1111-4111-8111-111111111111';
const port=35218;
const host='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']
});
let stderr='';child.stderr.on('data',d=>stderr+=String(d).slice(0,400));
try{
 for(let i=0;i<40;i++){
  try{if((await fetch(host+'/health')).ok)break;}catch{}
  if(i===39)throw Error('API did not start '+stderr);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const unauth=await fetch(host+'/api/v1/privacy/export');
 assert.equal(unauth.status,401);
 const response=await fetch(host+'/api/v1/privacy/export',{
  headers:{cookie:'cabo_session='+createSession(user,tenant)}
 });
 assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control')??'',/no-store/);
 const data=await response.json();
 assert.equal(data.format,'CABO-SELF-DATA-v2');
 assert.equal(data.organization.id,tenant);
 assert.equal(data.account.email,'staff-a@example.test');
 assert.equal(data.verifiedEmployeeRecords.profile.full_name,'Test Employee A');
 for(const key of ['onboardingTasks','progressionCases','ownFeedback','publicProgressionUpdates']){
  assert.ok(Array.isArray(data.verifiedEmployeeRecords[key]),key+' must be included in export');
 }
 assert.equal(data.verifiedEmployeeRecords.resultLimitPerCollection,250);
 assert.ok(data.note.includes('250 records'),'Export must disclose its pagination limitation');
 assert.equal(JSON.stringify(data).includes('Test Employee B'),false);
 console.log('PASS: private account and verified employee export');
}finally{child.kill();}
