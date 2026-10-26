import {useCallback,useEffect,useState,type FormEvent} from 'react';
type Employee={id:string;employee_code:string;full_name:string;job_title:string;department:string;start_date:string;employment_status:string;work_email?:string};
type Review={id:string;period_label:string;summary:string;employee_acknowledged_at:string|null};
type Plan={id:string;goal:string;status:string};
type Case={id:string;kind:string;related_review_id:string|null;status:string;requested_outcome:string;decision_reason:string|null};
type Leave={id:string;leave_type:string;start_date:string;end_date:string;status:string};
type Task={id:string;title:string;category:string;due_date:string|null;status:string};
type Data={linked:false}|{linked:true;employee:Employee;reviews:Review[];plans:Plan[];cases:Case[];leaves:Leave[];tasks:Task[]};
async function request<T>(path:string,init?:RequestInit):Promise<T>{
 const res=await fetch('/api/v1/employee'+path,{credentials:'same-origin',...init,headers:{'Content-Type':'application/json',...init?.headers}});
 const data=await res.json().catch(()=>({error:'Service unavailable'}));
 if(!res.ok)throw Error(data.error||'Request failed');
 return data as T;
}
export function EmployeeLinkPanel({employees}:{employees:Employee[]}){
 const [employeeId,setEmployeeId]=useState(''),[notice,setNotice]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!confirm('Link only if the existing organization member login email matches this employee work email?'))return;
  try{await request('/admin/link',{method:'POST',body:JSON.stringify({employeeId})});setNotice('Account linked.');setEmployeeId('');}
  catch(e){setNotice((e as Error).message);}
 }
 return <form className="modal-form hr-form" onSubmit={e=>void submit(e)}><h3>Employee portal access</h3>
 <p className="hr-footnote">Link an existing organization user. The work email must match their login email. This does not create a user invitation.</p>
 <label>Employee<select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
 <option value="">Choose employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.full_name} · {x.employee_code}</option>)}
 </select></label><button className="primary-button" disabled={!employeeId}>Link existing account</button>
 {notice&&<p role="status">{notice}</p>}</form>;
}
export function EmployeeWorkspace(){
 const [appealReviewId,setAppealReviewId]=useState<string|null>(null);
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{setLoading(true);try{setData(await request<Data>('/me'));setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void reload();},[reload]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget;setBusy(true);setError('');
  try{await request('/progression',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});form.reset();setNotice('Request recorded for human review.');await reload();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function submitLeave(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget;setBusy(true);setError('');
  try{await request('/leave',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});form.reset();setNotice('Leave request submitted for human HR approval.');await reload();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function submitAppeal(e:FormEvent<HTMLFormElement>,reviewId:string){
  e.preventDefault();
  const form=e.currentTarget;setBusy(true);setError('');setNotice('');
  try{
   await request('/reviews/'+reviewId+'/appeal',{method:'POST',
    body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});
   setAppealReviewId(null);setNotice('Your review appeal was submitted for independent HR consideration.');
   await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function acknowledge(id:string){
  if(!confirm('Acknowledge receipt of this review? This does not mean agreement.'))return;
  setBusy(true);setError('');try{await request('/reviews/'+id+'/acknowledge',{method:'PATCH',body:'{}'});setNotice('Receipt acknowledged.');await reload();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(loading)return <section className="panel records-panel">Loading your employment details…</section>;
 if(!data?.linked)return <section className="panel records-panel"><h2>My employment</h2><p>No employee record is linked to your account. Contact HR to connect your existing work account.</p>{error&&<p role="alert">{error}</p>}</section>;
 return <div className="hr-workspace">
 <section className="panel records-panel"><h2>My employment</h2><p><strong>{data.employee.full_name}</strong> · {data.employee.job_title} · {data.employee.department}</p><p>{data.employee.employee_code} · {data.employee.employment_status}</p>
 {notice&&<p role="status" className="notice success">{notice}</p>}{error&&<p role="alert" className="notice error">{error}</p>}</section>
 <section className="panel records-panel"><h2>Request a fair career review</h2>
 <p className="hr-footnote">Requests are evidence submissions, not automatic eligibility decisions. Independent HR review is required.</p>
 <form className="modal-form hr-form" onSubmit={e=>void submit(e)}><label>Review type<select name="kind" required>
 <option value="promotion">Promotion</option><option value="salary_review">Salary review</option><option value="career_development">Development</option><option value="performance_appeal">Performance appeal</option>
 </select></label><label>Supporting evidence<textarea name="evidenceSummary" minLength={20} maxLength={6000} required rows={3}/></label>
 <label>Requested outcome<textarea name="requestedOutcome" minLength={10} maxLength={2000} required rows={2}/></label>
 <button className="primary-button" disabled={busy}>Submit for human review</button></form>
 {data.cases.map(x=><article className="hr-card" key={x.id}><h3>{x.kind.replaceAll('_',' ')} · {x.status.replaceAll('_',' ')}</h3><p>{x.requested_outcome}</p>{x.decision_reason&&<p>Decision rationale: {x.decision_reason}</p>}</article>)}</section>
 <section className="panel records-panel"><h2>Finalized performance reviews</h2>
 {data.reviews.length===0?<p>No finalized reviews yet.</p>:data.reviews.map(r=><article className="hr-card" key={r.id}><h3>{r.period_label}</h3><p>{r.summary}</p>
 {r.employee_acknowledged_at?<small>Receipt acknowledged</small>:<button className="table-action" disabled={busy} onClick={()=>void acknowledge(r.id)}>Acknowledge receipt (not agreement)</button>}
 {data.cases.some(c=>c.related_review_id===r.id&&c.kind==='performance_appeal'&&['pending','under_review'].includes(c.status))?
  <p className="hr-footnote">An independent appeal is in progress for this review.</p>:
  <><button type="button" className="table-action" disabled={busy} onClick={()=>setAppealReviewId(x=>x===r.id?null:r.id)}>
    {appealReviewId===r.id?'Close appeal form':'Challenge this review'}
   </button>
   {appealReviewId===r.id&&<form className="modal-form hr-form" onSubmit={e=>void submitAppeal(e,r.id)}>
    <p className="hr-footnote">Present specific evidence or inaccuracies. Receipt acknowledgement never means agreement.</p>
    <label>Reason and supporting evidence<textarea name="evidenceSummary" rows={4} required minLength={20} maxLength={6000}/></label>
    <label>Requested independent review outcome<textarea name="requestedOutcome" rows={2} required minLength={10} maxLength={2000}/></label>
    <button className="primary-button" disabled={busy}>Submit independent appeal</button>
   </form>}</>}</article>)}</section>
 <section className="panel records-panel"><h2>My leave</h2>
 <form className="modal-form hr-form" onSubmit={e=>void submitLeave(e)}>
 <label>Leave category<select name="leaveType" required>
 <option value="annual">Annual</option><option value="sick">Sick</option><option value="family_responsibility">Family responsibility</option><option value="study">Study</option><option value="unpaid">Unpaid</option><option value="other">Other</option>
 </select></label><label>Start date<input type="date" name="startDate" required/></label><label>End date<input type="date" name="endDate" required/></label>
 <label>Optional note (avoid medical details)<textarea name="employeeNote" rows={2} maxLength={1000}/></label><button className="primary-button" disabled={busy}>Submit leave request</button>
 </form>{data.leaves.map(l=><article className="hr-card" key={l.id}><h3>{l.leave_type.replaceAll('_',' ')} · {l.status}</h3><p>{l.start_date.slice(0,10)} to {l.end_date.slice(0,10)}</p></article>)}</section>
 <section className="panel records-panel"><h2>My onboarding tasks</h2>
 {data.tasks.length===0?<p>No onboarding tasks are assigned.</p>:data.tasks.map(t=><article className="hr-card" key={t.id}><h3>{t.title}</h3><p>{t.category} · {t.status}{t.due_date?' · due '+t.due_date.slice(0,10):''}</p></article>)}</section>
 <section className="panel records-panel"><h2>Development plans</h2>{data.plans.map(p=><article className="hr-card" key={p.id}><h3>{p.goal}</h3><small>{p.status}</small></article>)}</section>
 </div>;
}
