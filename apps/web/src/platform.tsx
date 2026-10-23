import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,Building2,LockKeyhole,Plus,RefreshCw,ShieldCheck} from 'lucide-react';
type Organization={id:string;name:string;created_at:string;members:number;vacancies:number;candidates:number;employees:number;can_switch:boolean};
async function request<T>(path:string,body?:object):Promise<T>{
 const r=await fetch('/api/v1/platform'+path,{credentials:'same-origin',method:body?'POST':'GET',
   headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const value=await r.json().catch(()=>({error:'Platform service unavailable'}));
 if(!r.ok)throw Error(value.error||'Platform action failed');
 return value as T;
}
export function PlatformWorkspace({onOpenPrivacy}:{onOpenPrivacy:()=>void}){
 const [organizations,setOrganizations]=useState<Organization[]>([]);
 const [name,setName]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const reload=useCallback(async()=>{
   setLoading(true);
   try{const data=await request<{organizations:Organization[]}>('/overview');setOrganizations(data.organizations);setError('');}
   catch(e){setError((e as Error).message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void reload();},[reload]);
 async function create(e:FormEvent){
  e.preventDefault();
  if(!window.confirm('Create a new, isolated CABO Human Capital organization that only you can access initially?'))return;
  setBusy(true);setError('');setNotice('');
  try{const result=await request<{name:string}>('/organizations',{name});
    setName('');setNotice(result.name+' created. You may switch to it below.');await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function switchTo(o:Organization){
  setBusy(true);setError('');
  try{await request('/switch-tenant',{tenantId:o.id});window.location.reload();}
  catch(e){setError((e as Error).message);setBusy(false);}
 }
 const locked=error.includes('MFA')||error.includes('authenticator');
 return <div className="platform-workspace">
   <section className="panel platform-intro">
     <ShieldCheck size={27}/><div><div className="eyebrow small">CABO SOLUTIONS · PLATFORM OWNER</div><h2>Organization administration</h2>
       <p>Manage organization provisioning while preserving separate tenant records. This console shows aggregate counts only, never CV contents or employee details.</p>
     </div>
   </section>
   {error&&<div className="notice error" role="alert">{error}{locked&&<button className="table-action" onClick={onOpenPrivacy}><LockKeyhole size={14}/> Enable authenticator</button>}</div>}
   {notice&&<div className="notice success">{notice}</div>}
   {!locked&&<section className="panel platform-create">
    <div className="eyebrow small">NEW ISOLATED ORGANIZATION</div>
    <form onSubmit={create}><label>Organization name<input value={name} minLength={2} maxLength={160} onChange={e=>setName(e.target.value)} placeholder="Organization / demonstration workspace" required/></label>
    <button className="primary-button" disabled={busy||loading}><Plus size={16}/> Create organization</button></form>
    <p className="hr-footnote">Creation grants your current account owner access to the new tenant only. Access to existing client tenants is never granted automatically.</p>
   </section>}
   {!locked&&<section className="panel records-panel">
     <div className="panel-heading"><div><div className="eyebrow small">TENANT DIRECTORY</div><h2>Registered organizations</h2></div><button className="table-action" onClick={()=>void reload()} title="Refresh" disabled={busy}><RefreshCw size={16}/></button></div>
     {loading?<div className="hr-empty">Loading organization summary…</div>:organizations.length?<div className="table-wrap"><table><thead><tr><th>ORGANIZATION</th><th>MEMBERS</th><th>VACANCIES</th><th>CANDIDATES</th><th>EMPLOYEES</th><th>ACCESS</th></tr></thead><tbody>
       {organizations.map(o=><tr key={o.id}><td><strong><Building2 size={15}/> {o.name}</strong><small>Created {new Date(o.created_at).toLocaleDateString('en-ZA')}</small></td><td>{o.members}</td><td>{o.vacancies}</td><td>{o.candidates}</td><td>{o.employees}</td><td>{o.can_switch?<button className="table-action" disabled={busy} onClick={()=>void switchTo(o)}>Switch <ArrowRight size={14}/></button>:<span className="evidence-tag">Not a member</span>}</td></tr>)}
       </tbody></table></div>:<div className="hr-empty">No organizations found.</div>}
   </section>}
 </div>;
}
