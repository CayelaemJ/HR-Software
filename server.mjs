import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {hashPassword,checkPassword,normalizeEmail,validateEmail,token,digest,isUuid} from './lib/security.mjs';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL, max:10, connectionTimeoutMillis:5000});
const port = Number(process.env.PORT||3000);
const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
const prod = process.env.NODE_ENV === 'production';
if(!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
if(prod && !process.env.APP_ORIGIN?.startsWith('https://')) throw Error('HTTPS APP_ORIGIN required in production');
const send=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));};
const error=(res,status,message)=>send(res,status,{error:message});
const limited=new Map();
function throttle(req,res) {
 const ip=(req.socket.remoteAddress||'unknown');
 const now=Date.now(), item=limited.get(ip)||{n:0,t:now};
 if(now-item.t>60000){item.n=0;item.t=now;}
 item.n++;limited.set(ip,item);
 if(item.n>120){error(res,429,'Too many requests');return true;}
 if(limited.size>10000) for(const [k,v] of limited){if(now-v.t>60000)limited.delete(k);}
 return false;
}
async function body(req) {
 let size=0,chunks=[];
 for await(const b of req){size+=b.length;if(size>65536){const e=Error('Body too large');e.status=413;throw e;}chunks.push(b);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{const e=Error('Invalid JSON');e.status=400;throw e;}
}
async function scope(tenant,fn){
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT set_config($1,$2,true)',['app.tenant_id',tenant]);const result=await fn(c);await c.query('COMMIT');return result;}
 catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
function cookie(req) {
 const m=/(?:^|; )cabo_session=([0-9a-f-]{36})\.([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'');
 return m&&isUuid(m[1])?{tenant:m[1],raw:m[2]}:null;
}
async function auth(req){
 const session=cookie(req);if(!session)return null;
 const {tenant,raw}=session;
 return scope(tenant,async c=>{
  const r=await c.query(`SELECT m.id,m.full_name,m.email,m.role,m.tenant_id,t.name AS tenant_name
   FROM sessions s JOIN members m ON m.id=s.member_id AND m.tenant_id=s.tenant_id
   JOIN tenants t ON t.id=s.tenant_id
   WHERE s.token_hash=$1 AND s.expires_at>now()`,[digest(raw)]);
  return r.rows[0]||null;
 });
}
const setCookie=(res,value,age)=>res.setHeader('Set-Cookie',`cabo_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${prod?'; Secure':''}`);
const validText=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max;
async function api(req,res,url){
 if(throttle(req,res))return;
 if(!['GET','POST'].includes(req.method))return error(res,405,'Method not allowed');
 if(req.method==='POST' && req.headers.origin!==origin)return error(res,403,'Invalid origin');
 if(req.method==='GET'&&url.pathname==='/api/health'){await pool.query('SELECT 1');return send(res,200,{status:'ok'});}
 if(req.method==='POST'&&url.pathname==='/api/register'){
  const b=await body(req),email=normalizeEmail(b.email);
  if(!validText(b.company,2,180)||!validText(b.name,2,120)||!validateEmail(email)||!validText(b.slug,3,48)||!(/^[a-z0-9-]{3,48}$/.test(b.slug))||typeof b.password!=='string')return error(res,400,'Invalid registration');
  const hash=await hashPassword(b.password),c=await pool.connect();
  try{
   await c.query('BEGIN');
   const t=await c.query('INSERT INTO tenants(slug,name) VALUES($1,$2) RETURNING id',[b.slug,b.company.trim()]);
   await c.query('SELECT set_config($1,$2,true)',['app.tenant_id',t.rows[0].id]);
   await c.query('INSERT INTO members(tenant_id,email,full_name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[t.rows[0].id,email,b.name.trim(),hash,'owner']);
   await c.query('COMMIT');return send(res,201,{ok:true,message:'Organization created. Sign in to continue.'});
  }catch(e){await c.query('ROLLBACK');if(e.code==='23505')return error(res,409,'Organization slug unavailable');throw e}finally{c.release();}
 }
 if(req.method==='POST'&&url.pathname==='/api/login'){
  const b=await body(req),email=normalizeEmail(b.email),slug=String(b.slug||'');
  if(!validateEmail(email)||!(/^[a-z0-9-]{3,48}$/.test(slug))||typeof b.password!=='string')return error(res,400,'Invalid credentials');
  const tenant=await pool.query('SELECT id FROM tenants WHERE slug=$1',[slug]);
  if(!tenant.rowCount)return error(res,401,'Invalid credentials');
  const member=await scope(tenant.rows[0].id,c=>c.query('SELECT id,password_hash FROM members WHERE email=$1',[email]));
  if(!member.rowCount||!(await checkPassword(b.password,member.rows[0].password_hash)))return error(res,401,'Invalid credentials');
  const raw=token();
  await scope(tenant.rows[0].id,c=>c.query(`INSERT INTO sessions(token_hash,tenant_id,member_id,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')`,[digest(raw),tenant.rows[0].id,member.rows[0].id]));
  setCookie(res,tenant.rows[0].id+'.'+raw,43200);return send(res,200,{ok:true});
 }
 const member=await auth(req);if(!member)return error(res,401,'Sign in required');
 if(req.method==='POST'&&url.pathname==='/api/logout'){const session=cookie(req);if(session)await scope(member.tenant_id,c=>c.query('DELETE FROM sessions WHERE token_hash=$1',[digest(session.raw)]));setCookie(res,'',0);return send(res,200,{ok:true});}
 if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{member});
 if(req.method==='GET'&&url.pathname==='/api/vacancies'){
  const r=await scope(member.tenant_id,c=>c.query('SELECT id,title,description,status,created_at FROM vacancies ORDER BY created_at DESC LIMIT 100'));return send(res,200,{vacancies:r.rows});
 }
 if(req.method==='POST'&&url.pathname==='/api/vacancies'){
  if(!['owner','hr','recruiter'].includes(member.role))return error(res,403,'Forbidden');
  const b=await body(req);if(!validText(b.title,3,180)||!validText(b.description,10,10000)||!['draft','open','closed'].includes(b.status))return error(res,400,'Invalid vacancy');
  const r=await scope(member.tenant_id,c=>c.query('INSERT INTO vacancies(tenant_id,title,description,status,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,title,description,status,created_at',[member.tenant_id,b.title.trim(),b.description.trim(),b.status,member.id]));
  return send(res,201,{vacancy:r.rows[0]});
 }
 if(req.method==='GET'&&url.pathname==='/api/applications'){
  if(!['owner','hr','recruiter'].includes(member.role))return error(res,403,'Forbidden');
  const r=await scope(member.tenant_id,c=>c.query('SELECT id,vacancy_id,candidate_name,candidate_email,stage,created_at FROM applications ORDER BY created_at DESC LIMIT 100'));return send(res,200,{applications:r.rows});
 }
 if(req.method==='POST'&&url.pathname==='/api/applications'){
  if(!['owner','hr','recruiter'].includes(member.role))return error(res,403,'Forbidden');
  const b=await body(req),email=normalizeEmail(b.candidate_email);
  if(!isUuid(b.vacancy_id)||!validText(b.candidate_name,2,120)||!validateEmail(email))return error(res,400,'Invalid application');
  const r=await scope(member.tenant_id,async c=>{
   const vacancy=await c.query('SELECT 1 FROM vacancies WHERE id=$1',[b.vacancy_id]);
   if(!vacancy.rowCount)return null;
   return c.query('INSERT INTO applications(tenant_id,vacancy_id,candidate_name,candidate_email) VALUES($1,$2,$3,$4) RETURNING id',[member.tenant_id,b.vacancy_id,b.candidate_name.trim(),email]);
  });if(!r)return error(res,404,'Vacancy not found');
  return send(res,201,{id:r.rows[0].id});
 }
 return error(res,404,'Not found');
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  if(req.method!=='GET')return error(res,405,'Method not allowed');
  const files={'/':['public/index.html','text/html'],'/app.js':['public/app.js','text/javascript'],'/style.css':['public/style.css','text/css']};
  const f=files[url.pathname];if(!f)return error(res,404,'Not found');
  const contents=await readFile(resolve(f[0]));res.writeHead(200,{'Content-Type':f[1]+'; charset=utf-8'});res.end(contents);
 }catch(e){console.error('Request failed',e.code||e.message);if(!res.headersSent)error(res,e.status|| (e.code==='23505'?409:500),e.status?e.message:'Request failed');}
});
server.listen(port,()=>console.log('CABO Human Capital listening on',port));
process.on('SIGTERM',()=>server.close(()=>pool.end()));
