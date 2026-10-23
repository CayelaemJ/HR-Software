import {useEffect,useState,type FormEvent} from 'react';
import {Copy,KeyRound,LockKeyhole,ShieldCheck} from 'lucide-react';
type Status={enabled:boolean;pending:boolean;recoveryCodesRemaining:number};
type Setup={secret:string;uri:string;message:string};
async function api<T>(path:string,body?:object):Promise<T>{
 const r=await fetch('/api/v1/mfa/'+path,{credentials:'same-origin',method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(r.status===204)return undefined as T;
 const json=await r.json().catch(()=>({error:'MFA service unavailable'}));
 if(!r.ok)throw Error(json.error||'MFA operation failed');
 return json as T;
}
export function MfaPanel({onSessionRevoked}:{onSessionRevoked:()=>void}){
 const [status,setStatus]=useState<Status|null>(null),[setup,setSetup]=useState<Setup|null>(null),[codes,setCodes]=useState<string[]|null>(null);
 const [password,setPassword]=useState(''),[otp,setOtp]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){try{setStatus(await api<Status>('status'));}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void refresh();},[]);
 async function enroll(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{setSetup(await api<Setup>('setup',{password}));setPassword('');setOtp('');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function confirm(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{
   const result=await api<{enabled:boolean;recoveryCodes:string[]}>('confirm',{code:otp});
   setCodes(result.recoveryCodes);setSetup(null);setOtp('');setStatus({enabled:true,pending:false,recoveryCodesRemaining:result.recoveryCodes.length});
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function disable(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{await api('disable',{password,code:otp});onSessionRevoked();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const copy=(value:string)=>{void navigator.clipboard?.writeText(value).catch(()=>setError('Clipboard not available; copy the value manually.'));};
 return <section className="panel privacy-card mfa-panel">
  <div className="eyebrow small">TWO-FACTOR SECURITY</div><h3><ShieldCheck size={18}/> Authenticator app</h3>
  <p className="hr-footnote">Adds time-based verification to password sign-in. You can use an authenticator app that supports TOTP. No SMS provider required.</p>
  {error&&<div className="notice error" role="alert">{error}</div>}
  {status?.enabled&&<p className="mfa-success"><LockKeyhole size={17}/> MFA enabled · {status.recoveryCodesRemaining} recovery codes left</p>}
  {codes?<div className="mfa-setup">
     <strong>Save your one-time recovery codes now</strong>
     <p>Each code can be used once if you lose your authenticator. Keep them somewhere private. These will not be shown again.</p>
     <div className="mfa-codes">{codes.map(c=><code key={c}>{c}</code>)}</div>
     <button className="outline-button" onClick={()=>copy(codes.join('\n'))}><Copy size={15}/> Copy recovery codes</button>
     <button className="primary-button" onClick={onSessionRevoked}>I've saved these — sign out</button>
    </div>:setup?<div className="mfa-setup">
      <strong>Add CABO Human Capital to your authenticator</strong>
      <p>Choose manual setup and enter the secret below. Use a 30-second, six-digit SHA-1 TOTP entry.</p>
      <div className="mfa-secret"><code>{setup.secret}</code><button className="table-action" onClick={()=>copy(setup.secret)}><Copy size={15}/></button></div>
      <form className="modal-form" onSubmit={confirm}><label>6-digit authenticator code<input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value)}/></label><button className="primary-button" disabled={busy}>Confirm and generate backup codes</button></form>
    </div>:status&&!status.enabled?<form className="modal-form" onSubmit={enroll}><label>Current password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary-button" disabled={busy}><KeyRound size={16}/> Set up authenticator</button></form>:status?.enabled?<form className="modal-form" onSubmit={disable}>
     <p className="hr-footnote">Disabling MFA requires your current password and a valid authenticator or recovery code. You will be signed out.</p>
     <label>Current password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
     <label>Authenticator or recovery code<input required value={otp} onChange={e=>setOtp(e.target.value.trim())}/></label>
     <button className="outline-button" disabled={busy}>Disable MFA</button>
    </form>:<p className="hr-footnote">Loading security settings…</p>}
 </section>;
}
