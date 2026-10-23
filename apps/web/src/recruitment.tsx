import {useEffect,useState,type FormEvent} from 'react';
import {ClipboardCheck, CalendarDays, CircleHelp, FileCheck2, Plus, X} from 'lucide-react';

type Candidate={id:string;full_name:string};
type Evidence={
  id:string;is_demo?:boolean;claim_type:string;claim_text:string;source_kind:string;source_note:string;
  review_status:string;verification_reference:string|null;created_at:string;
};
type Application={id:string;candidate_name:string;job_title:string;stage:string};
type Interview={
 id:string;is_demo?:boolean;application_id:string;candidate_name:string;job_title:string;scheduled_at:string;
 timezone:string;location:string;status:string;scorecard_count:number;
};
type Scorecard={id:string;criterion:string;observation:string;finding:string;created_at:string};

async function request<T>(path:string,opts?:RequestInit):Promise<T>{
 const r=await fetch('/api/v1'+path,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...opts?.headers}});
 const body=await r.json().catch(()=>({error:'Unable to read service response'}));
 if(!r.ok)throw new Error(body.error||'Request failed');
 return body as T;
}
function Overlay({name,onClose,children}:{name:string;onClose:()=>void;children:React.ReactNode}){
 return <div className="modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}} role="presentation">
   <section className="modal recruitment-dialog" role="dialog" aria-modal="true" aria-label={name}>
    <div className="modal-top"><div><div className="eyebrow small">CABO / EVIDENCE-LED WORKFLOWS</div><h2>{name}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19}/></button></div>
    {children}
   </section>
 </div>;
}
function Alert({message}:{message:string}){return <div role="alert" className="notice error"><CircleHelp size={16}/>{message}</div>;}
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,s=>s.toUpperCase());
const dateTime=(iso:string)=>new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Johannesburg'}).format(new Date(iso));

export function CandidateEvidence({candidate,editable,onClose}:{candidate:Candidate;editable:boolean;onClose:()=>void}){
 const [items,setItems]=useState<Evidence[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [claimType,setClaimType]=useState('skill'),[claimText,setClaimText]=useState(''),[sourceKind,setSourceKind]=useState('candidate_statement'),[sourceNote,setSourceNote]=useState('');
 async function reload(){setError('');try{setItems(await request<Evidence[]>('/candidates/'+candidate.id+'/evidence'));}catch(err){setError((err as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void reload();},[candidate.id]);
 async function add(e:FormEvent){
   e.preventDefault();setSaving(true);setError('');
   try{await request('/candidates/'+candidate.id+'/evidence',{method:'POST',body:JSON.stringify({claimType,claimText,sourceKind,sourceNote})});setClaimText('');setSourceNote('');await reload();}
   catch(err){setError((err as Error).message);}finally{setSaving(false);}
 }
 async function review(item:Evidence,status:'reviewed'|'verified'|'disputed'){
   let verificationReference:string|undefined;
   if(status==='verified'){
     const value=window.prompt('Enter the independent verification reference and what was checked (at least 12 characters):');
     if(value===null)return;
     verificationReference=value.trim();
     if(verificationReference.length<12){setError('Verification needs a documented independent reference.');return;}
   }
   setSaving(true);setError('');
   try{await request('/evidence/'+item.id+'/review',{method:'PATCH',body:JSON.stringify({status,verificationReference})});await reload();}
   catch(err){setError((err as Error).message);}finally{setSaving(false);}
 }
 return <Overlay name={'Evidence · '+candidate.full_name} onClose={onClose}>
   <p className="recruitment-help">Separate candidate statements and document excerpts from claims that a human reviewer has independently verified. No automated competency scoring.</p>
   {error&&<Alert message={error}/>}
   {editable&&<form className="modal-form" onSubmit={add}>
      <div className="form-two"><label>Claim type<select value={claimType} onChange={e=>setClaimType(e.target.value)}>{['skill','qualification','experience','project','registration','other'].map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
      <label>Evidence source<select value={sourceKind} onChange={e=>setSourceKind(e.target.value)}><option value="candidate_statement">Candidate statement</option><option value="document_excerpt">Document excerpt (manually reviewed)</option></select></label></div>
      <label>Candidate claim / evidence<textarea rows={3} required minLength={5} maxLength={4000} value={claimText} onChange={e=>setClaimText(e.target.value)} placeholder="Describe a demonstrated skill, qualification, work outcome or project without exaggerating it."/></label>
      <label>Source note (not independently verified)<input maxLength={2000} value={sourceNote} onChange={e=>setSourceNote(e.target.value)} placeholder="e.g. Stated in section 2 of a submitted CV"/></label>
      <button disabled={saving} className="primary-button"><Plus size={16}/>{saving?'Saving…':'Record evidence'}</button>
   </form>}
   <div className="recruitment-list-header"><strong>Recorded evidence</strong><small>{items.length} items</small></div>
   {loading?<p className="recruitment-help">Loading evidence…</p>:items.length===0?<div className="empty"><FileCheck2/><p>There are no evidence entries for this candidate.</p></div>:
    <div className="recruitment-items">{items.map(item=><article className="recruitment-record" key={item.id}>
       <div className="recruitment-row"><span className="evidence-tag">{label(item.claim_type)} · {label(item.source_kind)}</span><span className={'status status-'+item.review_status}>{label(item.review_status)}</span></div>
       <p>{item.claim_text}{item.is_demo&&<span className="demo-label"> DEMO</span>}</p>
       {item.source_note&&<small>Source: {item.source_note}</small>}
       {item.verification_reference&&<small>Independent verification reference: {item.verification_reference}</small>}
       {editable&&<div className="recruitment-controls"><button disabled={saving} onClick={()=>review(item,'reviewed')}>Mark reviewed</button><button disabled={saving} onClick={()=>review(item,'verified')}>Record verification</button><button disabled={saving} onClick={()=>review(item,'disputed')}>Dispute claim</button></div>}
     </article>)}</div>}
 </Overlay>;
}

export function InterviewWorkspace({applications,editable}:{applications:Application[];editable:boolean}){
 const [items,setItems]=useState<Interview[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [create,setCreate]=useState(false),[selected,setSelected]=useState<Interview|null>(null);
 const [applicationId,setApplicationId]=useState(''),[at,setAt]=useState(''),[location,setLocation]=useState('');
 const [scorecards,setScorecards]=useState<Scorecard[]>([]);
 const [criterion,setCriterion]=useState(''),[observation,setObservation]=useState(''),[finding,setFinding]=useState('evidence_observed');
 async function reload(){
   try{setItems(await request<Interview[]>('/interviews'));setError('');}
   catch(err){setError((err as Error).message);}finally{setLoading(false);}
 }
 useEffect(()=>{void reload();},[]);
 async function schedule(e:FormEvent){
   e.preventDefault();setBusy(true);setError('');
   try{
     const scheduledAt=new Date(at).toISOString();
     await request('/interviews',{method:'POST',body:JSON.stringify({applicationId,scheduledAt,location,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Africa/Johannesburg'})});
     setCreate(false);setAt('');setLocation('');setApplicationId('');await reload();
   }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 async function open(interview:Interview){
   setSelected(interview);setError('');
   try{setScorecards(await request<Scorecard[]>('/interviews/'+interview.id+'/scorecards'));}
   catch(err){setError((err as Error).message);}
 }
 async function addScorecard(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError('');
   try{
     await request('/interviews/'+selected.id+'/scorecards',{method:'POST',body:JSON.stringify({criterion,observation,finding})});
     setScorecards(await request<Scorecard[]>('/interviews/'+selected.id+'/scorecards'));
     setCriterion('');setObservation('');setFinding('evidence_observed');await reload();
   }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 async function complete(interview:Interview){
   setBusy(true);setError('');
   try{await request('/interviews/'+interview.id+'/status',{method:'PATCH',body:JSON.stringify({status:'completed'})});await reload();setSelected(null);}
   catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 const eligible=applications.filter(a=>a.stage==='interview');
 return <>
 <section className="panel records-panel">
  <div className="panel-heading"><div><div className="eyebrow small">HUMAN REVIEW</div><h2>Structured interviews</h2></div>
   {editable&&<button className="primary-button" onClick={()=>{setError('');setCreate(true);}}><Plus size={17}/>Schedule interview</button>}</div>
  {error&&!selected&&!create&&<Alert message={error}/>}
  {loading?<p className="recruitment-help">Loading interviews…</p>:items.length===0?<div className="empty"><CalendarDays size={28}/><p>No interviews yet. Move an application to the interview stage, then schedule a structured review.</p></div>:
   <div className="table-wrap"><table><thead><tr><th>CANDIDATE</th><th>VACANCY</th><th>SCHEDULE</th><th>STATUS</th><th>REVIEW</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td><strong>{i.candidate_name}{i.is_demo&&<span className="demo-label"> DEMO</span>}</strong><small>{i.location||'Location not specified'}</small></td><td>{i.job_title}</td><td>{dateTime(i.scheduled_at)} SAST</td><td><span className="status">{label(i.status)}</span></td><td><button className="table-action" onClick={()=>open(i)}>Scorecards ({i.scorecard_count})</button></td></tr>)}</tbody></table></div>}
 </section>
 {create&&<Overlay name="Schedule an interview" onClose={()=>setCreate(false)}>
   <p className="recruitment-help">This records a scheduled interview. Automated invitations are not yet enabled.</p>
   {error&&<Alert message={error}/>}
   <form className="modal-form" onSubmit={schedule}>
    <label>Application<select required value={applicationId} onChange={e=>setApplicationId(e.target.value)}><option value="">Choose an application at interview stage</option>{eligible.map(a=><option key={a.id} value={a.id}>{a.candidate_name} · {a.job_title}</option>)}</select></label>
    <label>Date and time (your device timezone)<input required type="datetime-local" value={at} onChange={e=>setAt(e.target.value)}/></label>
    <label>Location / meeting details<input maxLength={400} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Office, Sandton"/></label>
    <button className="primary-button" disabled={busy||!applicationId}>{busy?'Saving…':'Schedule review'}</button>
   </form>
 </Overlay>}
 {selected&&<Overlay name={'Interview scorecard · '+selected.candidate_name} onClose={()=>{setSelected(null);setError('');}}>
   <p className="recruitment-help">Use job-related criteria and record observations, not assumptions about personality or protected characteristics. A human remains responsible for employment decisions.</p>
   {error&&<Alert message={error}/>}
   <div className="recruitment-list-header"><strong>Recorded observations</strong><small>{scorecards.length} items</small></div>
   {scorecards.length===0?<p className="recruitment-help">No evidence-based observations recorded yet.</p>:<div className="recruitment-items">{scorecards.map(s=><article className="recruitment-record" key={s.id}><span className="evidence-tag">{label(s.finding)}</span><strong>{s.criterion}</strong><p>{s.observation}</p><small>{dateTime(s.created_at)} SAST</small></article>)}</div>}
   {editable&&<form className="modal-form" onSubmit={addScorecard}>
     <label>Job-related criterion<input required minLength={4} maxLength={200} value={criterion} onChange={e=>setCriterion(e.target.value)} placeholder="e.g. Data analysis and communication"/></label>
     <label>Observed evidence<textarea required rows={3} minLength={12} maxLength={4000} value={observation} onChange={e=>setObservation(e.target.value)} placeholder="What did the candidate demonstrate? Note specifics and missing information."/></label>
     <label>Finding<select value={finding} onChange={e=>setFinding(e.target.value)}><option value="evidence_observed">Evidence observed</option><option value="follow_up_required">Follow up required</option><option value="not_observed">Not observed</option></select></label>
     <button className="primary-button" disabled={busy}><ClipboardCheck size={16}/>{busy?'Saving…':'Save human observation'}</button>
   </form>}
   {editable&&selected.status==='scheduled'&&<div className="recruitment-list-header"><button className="outline-button recruitment-done" disabled={busy} onClick={()=>complete(selected)}>Mark interview completed</button></div>}
 </Overlay>}
 </>;
}
