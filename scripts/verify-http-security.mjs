import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';

if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('HTTP hardening tests must use disposable cabo_ci');
const port=35082;
const origin='http://127.0.0.1:'+port;
const cookie='cabo_session='+createSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port),PUBLIC_APPLICATIONS_ENABLED:'false',NODE_ENV:'test'},
 stdio:['ignore','pipe','pipe']
});
let stderr='';child.stderr.on('data',x=>stderr+=String(x).slice(0,500));
try{
 for(let i=0;i<40;i++){
  if(child.exitCode!==null)throw Error('API exited '+stderr);
  try{if((await fetch(origin+'/health')).ok)break;}catch{}
  if(i===39)throw Error('API startup failure '+stderr);
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const profile=await fetch(origin+'/api/v1/auth/me',{headers:{cookie}});
 assert.equal(profile.status,200);
 assert.match(profile.headers.get('cache-control')??'',/no-store/);
 assert.equal(profile.headers.get('x-robots-tag'),'noindex, nofollow');
 assert.equal(profile.headers.get('x-content-type-options'),'nosniff');
 const protectedRequest={
  method:'POST',
  headers:{cookie,'content-type':'application/json','origin':'https://unrelated.invalid'},
  body:JSON.stringify({fullName:'Bad Cross-Origin Candidate',email:'forbidden@example.test'})
 };
 const blocked=await fetch(origin+'/api/v1/candidates',protectedRequest);
 assert.equal(blocked.status,403,'Cross-origin write must be rejected');
 const sibling=await fetch(origin+'/api/v1/candidates',{
  ...protectedRequest,headers:{...protectedRequest.headers,origin,'sec-fetch-site':'same-site'}
 });
 assert.equal(sibling.status,403,'Browser sibling-origin writes are not trusted');
 const referer=await fetch(origin+'/api/v1/candidates',{
  ...protectedRequest,headers:{cookie,'content-type':'application/json',referer:'https://wrong-origin.invalid/'}
 });
 assert.equal(referer.status,403,'Mismatched referer must be rejected');
 const native=await fetch(origin+'/api/v1/candidates',{
  method:'POST',headers:{cookie,'content-type':'application/json'},
  body:JSON.stringify({fullName:'Synthetic Mobile Candidate',email:'native-client@example.test'})
 });
 assert.equal(native.status,403,'Cookie-backed native request without origin proof is rejected');
 const nativeAllowed=await fetch(origin+'/api/v1/candidates',{
  method:'POST',headers:{cookie,'content-type':'application/json',origin},
  body:JSON.stringify({fullName:'Synthetic Mobile Candidate',email:'native-client@example.test'})
 });
 assert.equal(nativeAllowed.status,201,'Native client with explicit same-origin evidence succeeds');
 assert.match(nativeAllowed.headers.get('cache-control')??'',/no-store/);
 console.log('PASS: cross-site/Referer/Sec-Fetch guard, sensitive no-store, Helmet and native access');
}finally{child.kill();}
