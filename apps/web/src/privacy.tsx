import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {CheckCircle2,FileCheck2,LockKeyhole,ShieldCheck} from 'lucide-react';
import { MfaPanel } from './mfa';

type Profile={profile:{id:string;username:string|null;full_name:string;email:string;created_at:string};membership:{role:string};organization:string};
type DataRequest={id:string;request_type:string;details:string;status:string;response_note:string;created_at:string;subject_name?:string;subject_email?:string};
async function api<T>(path:string,options?:RequestInit):Promise<T>{
 const response=await fetch('/api/v1/'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options?.headers}});
 if(response.status===204)return undefined as T;
 const json=await response.json().catch(()=>({error:'Service temporarily unavailable'}));
 if(!response.ok)throw new Error(json.error||'Request could not be completed');
 return json as T;
}
const title=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function PrivacyWorkspace({role,onPasswordChanged}:{role:string;onPasswordChanged:()=>void}){
 const [data,setData]=useState<Profile|null>(null),[mine,setMine]=useState<DataRequest[]>([]),[all,setAll]=useState<DataRequest[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [kind,setKind]=useState('access'),[details,setDetails]=useState(''),[password,setPassword]=useState(''),[nextPassword,setNextPassword]=useState('');
 const admin=['owner','hr_admin'].includes(role);
 const reload=useCallback(async()=>{
  try{
    const [profile,requests,adminRequests]=await Promise.all([
      api<Profile>('privacy/me'),api<DataRequest[]>('privacy/requests'),
      admin?api<DataRequest[]>('privacy/admin/requests'):Promise.resolve([] as DataRequest[])
    ]);
    setData(profile);setMine(requests);setAll(adminRequests);setError('');
  }catch(err){setError((err as Error).message);}finally{setLoading(false);}
 },[admin]);
 useEffect(()=>{void reload();},[reload]);
 async function submitRequest(e:FormEvent){
   e.preventDefault();setBusy(true);setError('');
   try{await api('privacy/requests',{method:'POST',body:JSON.stringify({requestType:kind,details})});setDetails('');setNotice('Request received. Your HR team must review and respond.');await reload();}
   catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 async function review(item:DataRequest){
   const status=window.prompt('Set request status: in_review, completed or declined:',item.status);
   if(!status||!['in_review','completed','declined'].includes(status))return;
   const responseNote=window.prompt('Record a documented response (at least 12 characters):');
   if(!responseNote||responseNote.trim().length<12)return;
   setBusy(true);setError('');
   try{await api('privacy/admin/requests/'+item.id,{method:'PATCH',body:JSON.stringify({status,responseNote})});setNotice('Recorded the human request-handling decision.');await reload();}
   catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 async function downloadVerifiedData(){
   setBusy(true);setError('');setNotice('');
   try{
     const response=await fetch('/api/v1/privacy/export',{credentials:'same-origin'});
     if(!response.ok){
       const body=await response.json().catch(()=>({error:'Your verified export is unavailable'}));
       throw Error(body.error||'Personal data export failed');
     }
     const blob=await response.blob();
     const url=URL.createObjectURL(blob);
     const anchor=document.createElement('a');
     anchor.href=url;anchor.download='cabo-my-data-'+new Date().toISOString().slice(0,10)+'.json';
     document.body.append(anchor);anchor.click();anchor.remove();
     window.setTimeout(()=>URL.revokeObjectURL(url),30000);
     setNotice('Your own verified account and linked staff data was exported. A wider access or erasure request still needs human review.');
   }catch(err){setError((err as Error).message);}
   finally{setBusy(false);}
 }
 async function changePassword(e:FormEvent){
   e.preventDefault();setBusy(true);setError('');
   try{
     await api('auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:password,newPassword:nextPassword})});
     setPassword('');setNextPassword('');onPasswordChanged();
   }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 return <div className="privacy-workspace">
  <div className="privacy-heading"><ShieldCheck size={22}/><div><h2>Personal information & access</h2><p>Check the profile attached to your CABO account, submit a privacy request, or update your login password.</p></div></div>
  {notice&&<div className="notice success"><CheckCircle2 size={16}/>{notice}</div>}
  {error&&<div className="notice error" role="alert">{error}</div>}
  {loading?<div className="hr-empty">Loading secure profile…</div>:<div className="privacy-grid">
   <section className="panel privacy-card"><div className="eyebrow small">YOUR ACCOUNT</div><h3>{data?.profile.full_name}</h3>
    <dl><dt>Username</dt><dd>{data?.profile.username||'Not configured'}</dd><dt>Email</dt><dd>{data?.profile.email}</dd><dt>Organization</dt><dd>{data?.organization}</dd><dt>Access</dt><dd>{title(data?.membership.role||'')}</dd></dl>
    <p className="hr-footnote">This view exports only your account profile, not employee or candidate records. The HR team must review broader access or erasure requests.</p>
    <button className="table-action" onClick={()=>{if(data)navigator.clipboard?.writeText(JSON.stringify(data,null,2)).then(()=>setNotice('Your profile JSON copied to clipboard.'),()=>setError('Clipboard unavailable'));}}>Copy my account data</button>
    <button className="outline-button" disabled={busy} onClick={()=>void downloadVerifiedData()}>Download my verified data (JSON)</button>
   </section>
   <section className="panel privacy-card"><div className="eyebrow small">DATA RIGHTS REQUEST</div><h3>Ask for a human review</h3>
    <form className="modal-form" onSubmit={submitRequest}>
      <label>Request type<select value={kind} onChange={e=>setKind(e.target.value)}>{['access','export','correction','erasure','objection'].map(x=><option key={x} value={x}>{title(x)}</option>)}</select></label>
      <label>Details (avoid sharing secrets)<textarea rows={3} value={details} onChange={e=>setDetails(e.target.value)} maxLength={3000}/></label>
      <button className="primary-button" disabled={busy}>Submit request</button>
    </form>
   </section>
   <section className="panel privacy-card"><div className="eyebrow small">SECURE ACCOUNT</div><h3>Change password</h3>
    <p className="hr-footnote">Changing your password revokes other login sessions and signs you out.</p>
    <form className="modal-form" onSubmit={changePassword}>
     <label>Current password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
     <label>New password (12+ characters)<input type="password" autoComplete="new-password" value={nextPassword} onChange={e=>setNextPassword(e.target.value)} minLength={12} required/></label>
     <button className="primary-button" disabled={busy}><LockKeyhole size={16}/> Update password</button>
    </form>
   </section>
   <MfaPanel onSessionRevoked={onPasswordChanged}/>
   <section className="panel privacy-card"><div className="eyebrow small">YOUR REQUEST HISTORY</div><h3>Submitted requests</h3>
    {mine.length?mine.map(x=><div className="privacy-item" key={x.id}><div><strong>{title(x.request_type)}</strong><small>{new Date(x.created_at).toLocaleDateString('en-ZA')}</small></div><span className="evidence-tag">{title(x.status)}</span>{x.response_note&&<p>{x.response_note}</p>}</div>):<div className="hr-empty">No requests submitted yet.</div>}
   </section>
  </div>}
  {admin&&<section className="panel privacy-admin"><div className="eyebrow small">HUMAN OVERSIGHT</div><h2>Organization privacy requests</h2>
   <p className="hr-footnote"><FileCheck2 size={15}/> Human review is mandatory. Marking a request complete does not delete records automatically.</p>
   {all.length?<div className="table-wrap"><table><thead><tr><th>REQUESTER</th><th>REQUEST</th><th>STATUS</th><th>REVIEW</th></tr></thead><tbody>{all.map(x=><tr key={x.id}><td><strong>{x.subject_name}</strong><small>{x.subject_email}</small></td><td>{title(x.request_type)}<small>{x.details.slice(0,140)}</small></td><td>{title(x.status)}</td><td><button className="table-action" disabled={busy||x.status==='completed'} onClick={()=>review(x)}>Review</button></td></tr>)}</tbody></table></div>:<div className="hr-empty">No requests to review.</div>}
  </section>}
 </div>;
}
