import pg from 'pg';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createSession} from '../apps/api/dist/security.js';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Platform smoke checks run only in disposable cabo_ci');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenant='11111111-1111-4111-8111-111111111111';
const port=34590;
const child=spawn(process.execPath,['apps/api/dist/server.js'],{
 env:{...process.env,PORT:String(port),PUBLIC_APPLICATIONS_ENABLED:'false'},stdio:['ignore','pipe','pipe']
});
let stderr='';child.stderr.on('data',d=>stderr+=String(d).slice(0,500));
const base='http://127.0.0.1:'+port,cookie='cabo_session='+createSession(user,tenant);
const request=async(path,body,cookieHeader=cookie)=>{
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:cookieHeader,'content-type':'application/json',...(body?{origin:base}:{})},body:body?JSON.stringify(body):undefined});
 return {status:r.status,headers:r.headers,data:await r.json().catch(()=>null)};
};
try{
 await admin.query("INSERT INTO platform_administrators(user_id,reason) VALUES($1,'Synthetic test superadmin')",[user]);
 for(let i=0;i<35;i++){
  try{if((await fetch(base+'/health')).ok)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
  if(i===34)throw Error('API not ready '+stderr);
 }
 const denied=await request('/api/v1/platform/overview');
 assert.equal(denied.status,403,'MFA must gate platform administration');
 await admin.query("UPDATE users SET mfa_enabled=true,mfa_secret_encrypted='ci-placeholder' WHERE id=$1",[user]);
 const overview=await request('/api/v1/platform/overview');
 assert.equal(overview.status,200);
 assert.ok(overview.data.organizations.length>=2);
 const result=await request('/api/v1/platform/organizations',{name:'Synthetic Isolated Tenant'});
 assert.equal(result.status,201);
 const newTenant=result.data.id;
 assert.ok(newTenant);
 const member=await admin.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2',[newTenant,user]);
 assert.equal(member.rows[0].role,'owner');
 const switchResponse=await request('/api/v1/platform/switch-tenant',{tenantId:newTenant});
 assert.equal(switchResponse.status,200);
 const cookieValue=switchResponse.headers.get('set-cookie')?.split(';')[0];
 assert.ok(cookieValue?.startsWith('cabo_session='));
 const switched=await request('/api/v1/auth/me',undefined,cookieValue);
 assert.equal(switched.status,200);
 assert.equal(switched.data.tenantId,newTenant);
 assert.equal(switched.data.organization,'Synthetic Isolated Tenant');
 const data=await request('/api/v1/jobs',undefined,cookieValue);
 assert.equal(data.status,200);
 assert.deepEqual(data.data,[],'new tenant must have no records from existing organizations');
 console.log('PASS: MFA-gated platform overview, new tenant onboarding, owner scope and safe switching.');
}finally{child.kill();await admin.end();}
