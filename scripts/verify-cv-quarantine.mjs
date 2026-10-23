import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Quarantine smoke test requires disposable cabo_ci');
const tenant='11111111-1111-4111-8111-111111111111';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const candidate='55555555-5555-4555-8555-555555555555';
const doc='aaaaaaaa-1111-4111-8111-111111111111';
const port=34711;
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port),CLAMAV_HOST:'',PUBLIC_APPLICATIONS_ENABLED:'false'},
 stdio:['ignore','pipe','pipe']
});
let errors='';child.stderr.on('data',x=>errors+=String(x).slice(0,900));
const host='http://127.0.0.1:'+port;
const cookie='cabo_session='+createSession(user,tenant);
async function call(path,method='GET',body){
 const r=await fetch(host+path,{method,headers:{cookie,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 const payload=await r.json().catch(()=>null);
 return {status:r.status,payload};
}
try{
 for(let i=0;i<35;i++){
  try{if((await fetch(host+'/health')).ok)break;}catch{}
  await new Promise(r=>setTimeout(r,200));
  if(i===34)throw Error('CABO API failed to start: '+errors);
 }
 const list=await call('/api/v1/cvs/candidates/'+candidate);
 assert.equal(list.status,200);
 const document=list.payload.find(x=>x.id===doc);
 assert.ok(document,'synthetic CV must exist');
 assert.equal(document.scan_status,'pending');
 const download=await call('/api/v1/cvs/'+doc+'/download');
 assert.equal(download.status,423,'quarantined CV download must be blocked');
 const extract=await call('/api/v1/cvs/'+doc+'/extract','POST');
 assert.equal(extract.status,423,'quarantined CV extraction must be blocked');
 const scan=await call('/api/v1/cvs/'+doc+'/scan','POST');
 assert.equal(scan.status,200);
 assert.equal(scan.payload.status,'pending','no configured scanner must not approve the file');
 const pdf=Buffer.from('%PDF-1.7\nCV smoke fixture for quarantined upload\n%%EOF\n');
 const upload=await call('/api/v1/cvs/upload','POST',{
  candidateId:candidate,originalName:'quarantine-smoke.pdf',mediaType:'application/pdf',
  base64:pdf.toString('base64'),consentConfirmed:true
 });
 assert.equal(upload.status,201,'upload may store file privately for quarantine');
 assert.equal(upload.payload.scan_status,'pending');
 assert.equal((await call('/api/v1/cvs/'+upload.payload.id+'/download')).status,423);
 console.log('PASS: unscanned PDF quarantined; download and extraction blocked, rescan fail-closed.');
}finally{child.kill();}
