import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Public careers smoke test requires CI database');
const port=34589;
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port),PUBLIC_APPLICATIONS_ENABLED:'false'},
 stdio:['ignore','pipe','pipe']
});
let output='';
child.stderr.on('data',d=>{output+=String(d).slice(0,1000);});
const base='http://127.0.0.1:'+port;
async function ready(){
 for(let i=0;i<30;i++){
  if(child.exitCode!==null)throw Error('API process exited early: '+output.slice(0,350));
  try{const response=await fetch(base+'/health');if(response.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw Error('API did not start');
}
try{
 await ready();
 const tenant='11111111-1111-4111-8111-111111111111';
 const listing=await fetch(base+'/api/v1/public/careers/'+tenant);
 assert.equal(listing.status,200);
 const content=await listing.json();
 assert.equal(content.acceptingApplications,false);
 assert.equal(content.jobs.length,0,'synthetic demo vacancies must not be publicly advertised');
 const gated=await fetch(base+'/api/v1/public/careers/'+tenant+'/apply',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({fullName:'Synthetic Applicant',email:'test@example.test',jobId:'33333333-3333-4333-8333-333333333333',consent:true})
 });
 assert.equal(gated.status,503,'applications must be disabled without privacy launch approval');
 const privateRoute=await fetch(base+'/api/v1/hr/employees');
 assert.equal(privateRoute.status,401,'employee records must require a session');
 console.log('PASS: public careers only, synthetic exclusions, consent collection gated, private HR protected.');
}finally{child.kill();}
