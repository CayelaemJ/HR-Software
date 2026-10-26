import {useCallback,useEffect,useState} from 'react';
type Flag={id:string;kind:string;status:string;employee_name:string;days_waiting:number;concern:string};
type Overview={thresholds:{pendingDays:number;underReviewDays:number;submittedReviewDays:number};counts:{total:number;pending:number;under_review:number;not_approved:number};submittedReviewsOverdue:number;flagged:Flag[];disclaimer:string};
const description=(flag:Flag)=>flag.concern==='pending_more_than_30_days'?'No review started within 30 days':'Review remains in progress beyond 14 days';
export function FairnessWorkspace(){
 const [data,setData]=useState<Overview|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{const response=await fetch('/api/v1/hr/fairness/overview',{credentials:'same-origin',cache:'no-store'});
   const body=await response.json();if(!response.ok)throw Error(body.error||'Unable to load process review');
   setData(body as Overview);
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function followup(flag:Flag){
  const eventKind=window.prompt('Action type: review_started, evidence_requested, escalated, next_action_set','escalated');
  if(!eventKind||!['review_started','evidence_requested','escalated','next_action_set'].includes(eventKind))return;
  const reason=window.prompt('Record the internal reason for this follow-up (20–2000 characters):');
  if(!reason||reason.trim().length<20)return;
  const publicSummary=window.prompt('Optional employee-visible progress note (max 800 characters; exclude private reviewer details):','')??'';
  if(publicSummary.length>800){setError('Employee-visible note is too long');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const res=await fetch('/api/v1/hr/fairness/cases/'+encodeURIComponent(flag.id)+'/followups',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({eventKind,reason:reason.trim(),publicSummary:publicSummary.trim()})});
   const data=await res.json().catch(()=>({error:'Follow-up service unavailable'}));
   if(!res.ok)throw Error(data.error||'Follow-up was not recorded');
   setNotice('Documented follow-up added without making an employment decision.');
   await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="hr-workspace">
 <p className="hr-footnote">Transparent workflow thresholds highlight delays requiring investigation. They are not proof of unfairness or manager wrongdoing.</p>
 <button className="table-action" type="button" onClick={()=>void refresh()}>Refresh monitoring</button>
 {notice&&<p role="status" className="notice success">{notice}</p>}
 {error&&<p role="alert" className="notice error">{error}</p>}
 {loading?<p role="status">Loading HR process signals…</p>:data&&<>
 <div className="hr-metrics">
 <div><small>PROGRESSION CASES</small><strong>{data.counts.total}</strong></div>
 <div><small>AWAITING REVIEW</small><strong>{data.counts.pending}</strong></div>
 <div><small>IN HUMAN REVIEW</small><strong>{data.counts.under_review}</strong></div>
 <div><small>DELAYED FINAL REVIEWS</small><strong>{data.submittedReviewsOverdue}</strong></div>
 </div>
 <p className="hr-footnote">Default monitoring thresholds: pending beyond {data.thresholds.pendingDays} days; open reviews beyond {data.thresholds.underReviewDays} days; submitted performance reviews beyond {data.thresholds.submittedReviewDays} days.</p>
 <h3>Cases warranting follow-up</h3>
 {data.flagged.length===0?<div className="hr-empty">No cases exceed the configured monitoring thresholds.</div>:
 <div className="hr-cards">{data.flagged.map(f=><article className="hr-card" key={f.id}>
 <div className="eyebrow small">{f.kind.replaceAll('_',' ')} · {f.status.replaceAll('_',' ')}</div>
 <h3>{f.employee_name}</h3><p>{description(f)} · {f.days_waiting} days since submission.</p>
 <p className="hr-footnote">Investigate context, document any reason for delay, and follow your organization's escalation procedures.</p>
 <button className="table-action" disabled={busy} onClick={()=>void followup(f)}>Record follow-up</button></article>)}</div>}
 <p className="hr-footnote">{data.disclaimer}</p>
 </>}
 </div>;
}
