import assert from 'node:assert/strict';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createSession} from '../apps/api/dist/security.js';
if(!process.env.DATABASE_URL?.includes('/cabo_ci'))throw Error('Disposable CI DB only');
const a='11111111-1111-4111-8111-111111111111',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',viewer='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reviewer=randomUUID(),port=36981,base='http://127.0.0.1:'+port;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
const server=spawn(process.execPath,['apps/api/dist/server.js'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
async function send(path,user,method='GET',body){
 const res=await fetch(base+'/api/v1/privacy'+path,{method,headers:{cookie:'cabo_session='+createSession(user,a),...(method==='GET'?{}:{origin:base}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,data:await res.json().catch(()=>({}))};
}
try{
 await db.query("INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,'Privacy HR Reviewer','synthetic-hash')",[reviewer,'reviewer-'+reviewer.slice(0,8)+'@example.test']);
 await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'hr_admin')",[a,reviewer]);
 for(let i=0;i<40;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===39)throw Error('API startup failure');await new Promise(r=>setTimeout(r,200));}
 const created=await send('/requests',owner,'POST',{requestType:'correction',details:'Correct a synthetic record for a worker'});
 assert.equal(created.status,201);
 const id=created.data.id,decision={status:'completed',responseNote:'HR investigated and documented independent evidence.'};
 assert.equal((await send('/admin/requests/'+id,viewer,'PATCH',decision)).status,403);
 assert.equal((await send('/admin/requests/'+id,owner,'PATCH',decision)).status,409);
 assert.equal((await send('/admin/requests/'+id,reviewer,'PATCH',decision)).status,200);
 assert.equal((await send('/admin/requests/'+id,reviewer,'PATCH',decision)).status,409);
 const row=await db.query('SELECT reviewed_by FROM privacy_requests WHERE id=$1',[id]);assert.equal(row.rows[0].reviewed_by,reviewer);
 console.log('PASS independent privacy request reviewer');
}finally{server.kill();await db.end();}
