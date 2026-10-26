import {useCallback,useEffect,useState,type FormEvent} from 'react';

type Feedback={
 id:string;category:string;message:string;status:string;created_at:string;
 acknowledged_at:string|null;employee_name?:string
};
const human=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
async function request<T>(path:string,init?:RequestInit):Promise<T>{
 const res=await fetch('/api/v1/feedback'+path,{credentials:'same-origin',cache:'no-store',...init,
  headers:{'Content-Type':'application/json',...init?.headers}});
 const body=await res.json().catch(()=>({error:'Feedback service unavailable'}));
 if(!res.ok)throw Error(body.error||'Feedback request failed');
 return body as T;
}
export function EmployeeFeedbackPanel(){
 const [items,setItems]=useState<Feedback[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{setItems(await request<Feedback[]>('/mine'));}
  catch(e){setError((e as Error).message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function send(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=event.currentTarget;
  setBusy(true);setNotice('');setError('');
  try{
   await request('/mine',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});
   form.reset();setNotice('Your feedback was recorded for independent HR attention.');await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel records-panel" aria-label="Employee feedback and corrections">
 <h2>Feedback, corrections and accountability</h2>
 <p className="hr-footnote">Add missing evidence, dispute an inaccuracy, or request development assistance. Submissions stay attached to your employee account. Acknowledgement by HR confirms receipt, not resolution or agreement.</p>
 {notice&&<p role="status" className="notice success">{notice}</p>}
 {error&&<p role="alert" className="notice error">{error}</p>}
 <form className="modal-form hr-form" onSubmit={e=>void send(e)}>
 <label>Feedback purpose<select name="category" required>
 <option value="review_comment">Comment on an assessment</option>
 <option value="development_feedback">Development guidance</option>
 <option value="profile_correction">Correct inaccurate records</option>
 </select></label>
 <label>Evidence or correction<textarea name="message" rows={3} required minLength={12} maxLength={2500}/></label>
 <button type="submit" className="primary-button" disabled={busy}>{busy?'Submitting…':'Submit feedback'}</button>
 </form>
 <h3>My previous submissions</h3>
 {loading?<p role="status">Loading…</p>:items.length===0?<p className="hr-empty">No feedback submitted yet.</p>:
 <div className="hr-cards">{items.map(item=><article key={item.id} className="hr-card">
 <h3>{human(item.category)} · {human(item.status)}</h3>
 <p>{item.message}</p><small>Submitted {item.created_at.slice(0,10)}
 {item.acknowledged_at?' · HR acknowledged '+item.acknowledged_at.slice(0,10):''}</small>
 </article>)}</div>}
 </section>;
}
export function HrFeedbackPanel(){
 const [items,setItems]=useState<Feedback[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{setItems(await request<Feedback[]>('/hr'));}catch(e){setError((e as Error).message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function acknowledge(id:string){
  if(!window.confirm('Record receipt only? This does not resolve the employee concern.'))return;
  setBusy(true);setNotice('');setError('');
  try{await request('/hr/'+id+'/acknowledge',{method:'PATCH',body:'{}'});
   setNotice('Receipt acknowledged; independently investigate and resolve any outstanding concern.');await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="hr-workspace" aria-label="Employee feedback review queue">
 <p className="hr-footnote">Employees can correct records and document concerns. Receipt acknowledgement is separate from resolving an appeal or changing an employment decision.</p>
 <button type="button" className="table-action" disabled={loading||busy} onClick={()=>void refresh()}>Refresh queue</button>
 {notice&&<p className="notice success" role="status">{notice}</p>}
 {error&&<p className="notice error" role="alert">{error}</p>}
 {loading?<p role="status">Loading employee feedback…</p>:items.length===0?<p className="hr-empty">No feedback submissions yet.</p>:
 <div className="hr-cards">{items.map(f=><article key={f.id} className="hr-card">
 <h3>{f.employee_name} · {human(f.category)}</h3>
 <p>{f.message}</p><p className="hr-footnote">Submitted {f.created_at.slice(0,10)} · {human(f.status)}</p>
 {f.status==='submitted'&&<button disabled={busy} className="table-action" onClick={()=>void acknowledge(f.id)}>Acknowledge receipt</button>}
 </article>)}</div>}
 </div>;
}
