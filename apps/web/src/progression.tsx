import {useCallback,useEffect,useState,type FormEvent} from 'react';
type Employee={id:string;full_name:string;employee_code:string;employment_status:string};
type Case={id:string;employee_name:string;kind:string;status:string;evidence_summary:string;requested_outcome:string;decision_reason:string|null;created_at:string};
const kinds=['promotion','salary_review','career_development','performance_appeal'] as const;
async function request<T>(path:string,options?:RequestInit):Promise<T>{
 const res=await fetch('/api/v1/hr/progression'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options?.headers}});
 const data=await res.json().catch(()=>({error:'Unable to contact service'}));
 if(!res.ok)throw new Error(data.error||'Request failed');
 return data as T;
}
const label=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function ProgressionWorkspace({employees}:{employees:Employee[]}){
 const [cases,setCases]=useState<Case[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{setCases(await request<Case[]>('/'));}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  const form=e.currentTarget;
  const body=Object.fromEntries(new FormData(form).entries());
  try{await request('/',{method:'POST',body:JSON.stringify(body)});form.reset();setNotice('Review request saved with an auditable record.');await load();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function decide(entry:Case,status:'under_review'|'approved'|'not_approved'|'closed'){
  const reason=window.prompt('Explain the human decision (at least 20 characters). This will be recorded in the audit trail:');
  if(!reason||reason.trim().length<20)return;
  setBusy(true);setError('');setNotice('');
  try{await request('/'+encodeURIComponent(entry.id)+'/decision',{method:'PATCH',body:JSON.stringify({status,reason:reason.trim()})});setNotice('Decision recorded.');await load();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="progression-workspace">
 <p className="hr-footnote">Human-led decisions only. Flags and requests are not proof of bias or automatic entitlement to a promotion or salary increase.</p>
 {notice&&<div role="status" className="notice success">{notice}</div>}
 {error&&<div role="alert" className="notice error">{error}</div>}
 <form className="modal-form hr-form" onSubmit={e=>void create(e)}>
 <h3>Open a career progression case</h3>
 <label>Employee<select name="employeeId" required defaultValue=""><option value="">Choose employee</option>{employees.map(e=><option value={e.id} key={e.id}>{e.full_name} · {e.employee_code}</option>)}</select></label>
 <label>Review type<select name="kind">{kinds.map(k=><option value={k} key={k}>{label(k)}</option>)}</select></label>
 <label>Evidence and context<textarea name="evidenceSummary" required minLength={20} maxLength={6000} rows={4} placeholder="Document verified achievements, criteria and relevant context." /></label>
 <label>Requested outcome<textarea name="requestedOutcome" required minLength={10} maxLength={2000} rows={3} placeholder="State the requested independent review or development action." /></label>
 <button className="primary-button" disabled={busy||employees.length===0}>{busy?'Saving…':'Submit for human review'}</button>
 </form>
 <h3 style={{marginTop:24}}>Recorded progression cases</h3>
 <button type="button" className="table-action" onClick={()=>void load()} disabled={busy||loading}>Refresh cases</button>
 {loading?<p role="status">Loading cases…</p>:cases.length===0?<p className="hr-empty">No progression cases recorded yet.</p>:
 <div className="hr-cards">{cases.map(c=><article key={c.id} className="hr-card"><span className="eyebrow small">{label(c.kind)} · {label(c.status)}</span><h3>{c.employee_name}</h3><p><strong>Evidence:</strong> {c.evidence_summary}</p><p><strong>Requested:</strong> {c.requested_outcome}</p>{c.decision_reason&&<p><strong>Recorded decision:</strong> {c.decision_reason}</p>}
 {['pending','under_review'].includes(c.status)&&<div className="progression-actions">{(c.status==='pending'?(['under_review','approved','not_approved'] as const):(['approved','not_approved','closed'] as const)).map(status=><button type="button" className="table-action" key={status} disabled={busy} onClick={()=>void decide(c,status)}>{label(status)}</button>)}</div>}</article>)}</div>}
 </div>;
}
