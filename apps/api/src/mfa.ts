import {Router,type Request,type RequestHandler,type Response} from 'express';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {pool,inTenant} from './db.js';
import {decryptSecret,encryptSecret,newRecoveryCodes,newTotpSecret,recoveryIndex,verifyTotp} from './totp.js';

type Actor={userId:string;tenantId:string;role:'owner'|'hr_admin'|'recruiter'|'viewer'};
type Audit=(db:PoolClient,a:Actor,action:string,objectType:string,objectId:string,details?:object)=>Promise<void>;
type Deps={authenticated:RequestHandler;actor:(req:Request)=>Actor;audit:Audit};

export async function verifyLoginSecondFactor(userId:string,code:string):Promise<boolean>{
 if(code.length>40)return false;
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const row=(await client.query(`SELECT mfa_enabled,mfa_secret_encrypted,mfa_last_step,mfa_recovery_hashes
   FROM users WHERE id=$1 FOR UPDATE`,[userId])).rows[0];
  if(!row?.mfa_enabled||!row.mfa_secret_encrypted){await client.query('ROLLBACK');return false;}
  const step=verifyTotp(decryptSecret(row.mfa_secret_encrypted),code,Date.now(),Number(row.mfa_last_step));
  if(step!==null){
   await client.query('UPDATE users SET mfa_last_step=$1 WHERE id=$2',[step,userId]);
  }else{
   const recoveryHashes=(row.mfa_recovery_hashes||[]) as string[];
   const index=recoveryIndex(recoveryHashes,code);
   if(index<0){await client.query('ROLLBACK');return false;}
   const next=recoveryHashes.filter((_,i)=>i!==index);
   await client.query('UPDATE users SET mfa_recovery_hashes=$1 WHERE id=$2',[next,userId]);
  }
  await client.query('COMMIT');
  return true;
 }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}
export function makeMfaRouter({authenticated,actor,audit}:Deps){
 const router=Router();
 const route=(fn:(req:Request,res:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
 router.use(authenticated);
 router.get('/status',route(async(req,res)=>{
  const a=actor(req);
  const r=await inTenant(a.tenantId,a.userId,db=>db.query('SELECT mfa_enabled,mfa_pending_encrypted IS NOT NULL AS pending,cardinality(mfa_recovery_hashes)::int AS recovery_codes_remaining FROM users WHERE id=$1',[a.userId]));
  res.setHeader('Cache-Control','no-store');
  res.json({enabled:r.rows[0]?.mfa_enabled??false,pending:r.rows[0]?.pending??false,recoveryCodesRemaining:r.rows[0]?.recovery_codes_remaining??0});
 }));
 router.post('/setup',route(async(req,res)=>{
  const a=actor(req),{password}=z.object({password:z.string().min(1).max(200)}).parse(req.body);
  const user=await pool.query('SELECT password_hash,username,email,mfa_enabled FROM users WHERE id=$1',[a.userId]);
  if(!user.rowCount||!await bcrypt.compare(password,user.rows[0].password_hash))
   return res.status(403).json({error:'Your current password was not accepted'});
  if(user.rows[0].mfa_enabled)return res.status(409).json({error:'MFA is already enabled'});
  const secret=newTotpSecret();
  await inTenant(a.tenantId,a.userId,async db=>{
    await db.query('UPDATE users SET mfa_pending_encrypted=$1 WHERE id=$2 AND mfa_enabled=false',[encryptSecret(secret),a.userId]);
    await audit(db,a,'account.mfa_setup_started','user',a.userId);
  });
  const account=user.rows[0].username||user.rows[0].email;
  const issuer='CABO Human Capital';
  const uri='otpauth://totp/'+encodeURIComponent(issuer+':'+account)+
   '?secret='+secret+'&issuer='+encodeURIComponent(issuer)+'&algorithm=SHA1&digits=6&period=30';
  res.setHeader('Cache-Control','no-store');
  res.json({secret,uri,message:'Save the authenticator entry, then confirm with its six-digit code.'});
 }));
 router.post('/confirm',route(async(req,res)=>{
  const a=actor(req),{code}=z.object({code:z.string().regex(/^\d{6}$/)}).parse(req.body);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
   const r=await db.query('SELECT mfa_enabled,mfa_pending_encrypted,mfa_last_step FROM users WHERE id=$1 FOR UPDATE',[a.userId]);
   if(!r.rowCount||r.rows[0].mfa_enabled||!r.rows[0].mfa_pending_encrypted)return null;
   const step=verifyTotp(decryptSecret(r.rows[0].mfa_pending_encrypted),code);
   if(step===null)return null;
   const backup=newRecoveryCodes();
   await db.query(`UPDATE users SET mfa_enabled=true,mfa_secret_encrypted=mfa_pending_encrypted,mfa_pending_encrypted=NULL,
     mfa_last_step=$1,mfa_recovery_hashes=$2,session_version=session_version+1 WHERE id=$3`,
     [step,backup.hashes,a.userId]);
   await audit(db,a,'account.mfa_enabled','user',a.userId);
   return backup.codes;
  });
  if(!result)return res.status(400).json({error:'Incorrect or expired code; please retry'});
  res.setHeader('Cache-Control','no-store');
  res.json({enabled:true,recoveryCodes:result,message:'Save these recovery codes securely. Each can be used only once. Sign in again to continue.'});
 }));
 router.post('/disable',route(async(req,res)=>{
  const a=actor(req),{password,code}=z.object({password:z.string().min(1).max(200),code:z.string().min(6).max(40)}).parse(req.body);
  const result=await inTenant(a.tenantId,a.userId,async db=>{
    const r=await db.query('SELECT password_hash,mfa_enabled,mfa_secret_encrypted,mfa_last_step,mfa_recovery_hashes FROM users WHERE id=$1 FOR UPDATE',[a.userId]);
    if(!r.rowCount||!r.rows[0].mfa_enabled)return 'disabled';
    if(!await bcrypt.compare(password,r.rows[0].password_hash))return 'incorrect';
    const step=verifyTotp(decryptSecret(r.rows[0].mfa_secret_encrypted),code,Date.now(),Number(r.rows[0].mfa_last_step));
    const fallback=recoveryIndex(r.rows[0].mfa_recovery_hashes||[],code);
    if(step===null&&fallback<0)return 'incorrect';
    await db.query(`UPDATE users SET mfa_enabled=false,mfa_secret_encrypted=NULL,mfa_pending_encrypted=NULL,
      mfa_last_step=-1,mfa_recovery_hashes='{}'::text[],session_version=session_version+1 WHERE id=$1`,[a.userId]);
    await audit(db,a,'account.mfa_disabled','user',a.userId);
    return 'ok';
  });
  if(result==='disabled')return res.status(409).json({error:'MFA is not enabled'});
  if(result!=='ok')return res.status(403).json({error:'Invalid current password or authenticator code'});
  res.status(204).end();
 }));
 return router;
}
