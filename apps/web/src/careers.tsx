import {useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,BriefcaseBusiness,CheckCircle2,MapPin,ShieldCheck} from 'lucide-react';

type Vacancy={id:string;title:string;department:string;location:string;employment_type:string;description:string;criteria:string;published_at:string|null};
type Careers={organization:string;jobs:Vacancy[];acceptingApplications:boolean};

export function CareersPortal({tenantId}:{tenantId:string}){
 const [data,setData]=useState<Careers|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [selected,setSelected]=useState<string|null>(null),[name,setName]=useState(''),[email,setEmail]=useState(''),[note,setNote]=useState(''),[consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false),[complete,setComplete]=useState(false);
 useEffect(()=>{
  const signal=new AbortController();
  fetch('/api/v1/public/careers/'+tenantId,{signal:signal.signal,headers:{accept:'application/json'}})
   .then(async r=>{const json=await r.json();if(!r.ok)throw Error(json.error||'Careers unavailable');return json as Careers;})
   .then(setData).catch(err=>{if(err.name!=='AbortError')setError(err.message);}).finally(()=>setLoading(false));
  return ()=>signal.abort();
 },[tenantId]);
 async function apply(e:FormEvent){
  e.preventDefault();if(!selected||!consent)return;
  setBusy(true);setError('');
  try{
   const result=await fetch('/api/v1/public/careers/'+tenantId+'/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:name,email,applicantNote:note,jobId:selected,consent,website:''})});
   const body=await result.json().catch(()=>({error:'Unexpected response'}));
   if(!result.ok)throw new Error(body.error||'Unable to submit application');
   setComplete(true);setSelected(null);setName('');setEmail('');setNote('');setConsent(false);
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 const jobs=data?.jobs||[];
 return <div className="careers-shell"><header className="careers-header"><a href="/" className="careers-brand"><span className="brand-icon">C.</span><strong>CABO</strong><small>HUMAN CAPITAL</small></a><span>CAREERS · SOUTH AFRICA</span></header>
  <main className="careers-main">
   <div className="eyebrow"><span className="eyebrow-line"/> CABO / OPEN OPPORTUNITIES</div>
   <h1>Find your next<br/><em>opportunity.</em></h1>
   <p className="careers-intro">Explore published opportunities at {data?.organization||'our partner organizations'}. Real people evaluate applications. No automated hiring or rejection decisions.</p>
   {error&&<div className="notice error" role="alert">{error}</div>}
   {complete&&<div className="notice success"><CheckCircle2 size={17}/>Application received. Our recruitment team will review your information.</div>}
   {loading?<div className="hr-empty">Finding open opportunities…</div>:jobs.length===0?<div className="careers-empty"><BriefcaseBusiness size={30}/><h2>No vacancies currently published</h2><p>New opportunities will be listed here once the organization publishes them.</p></div>:
   <section className="careers-jobs" aria-label="Open vacancies">{jobs.map(job=><article key={job.id} className="careers-job">
     <div className="eyebrow small">{job.department||'GENERAL'} · {job.employment_type.replaceAll('-',' ').toUpperCase()}</div>
     <h2>{job.title}</h2><div className="careers-place"><MapPin size={14}/>{job.location||'Location to be confirmed'}</div>
     <p>{job.description}</p><strong>Role requirements</strong><p>{job.criteria}</p>
     {data?.acceptingApplications?<button className="primary-button" onClick={()=>{setSelected(job.id);setComplete(false);setError('');}}>Apply for this role <ArrowRight size={16}/></button>:
      <span className="careers-restricted"><ShieldCheck size={15}/> Applications are not yet open. Privacy launch checks are in progress.</span>}
   </article>)}</section>}
   <p className="careers-privacy"><ShieldCheck size={17}/> We do not automatically decide who is shortlisted, hired or rejected. Do not send ID numbers, medical information or sensitive documents through this page.</p>
  </main>
  {selected&&data?.acceptingApplications&&<div className="modal-shade" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="modal recruitment-dialog" role="dialog" aria-modal="true" aria-label="Apply for role"><h2>Application</h2><p className="careers-privacy">Your name, email and application note will be stored for human recruitment review. Do not submit sensitive or unnecessary information. An authorized HR team will handle access, correction or deletion requests.</p>
   <form className="modal-form" onSubmit={apply}>
     <label>Full name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label>Email<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label>Application note (optional)<textarea maxLength={2500} rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Briefly describe relevant experience and work-related qualifications"/></label>
     <label className="careers-consent"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I understand that CABO will process these details for recruitment evaluation by human reviewers, and I consent to submitting this application.</span></label>
     <div className="hr-row-actions"><button className="primary-button" disabled={busy||!consent}>{busy?'Submitting…':'Submit application'}</button><button type="button" className="outline-button" onClick={()=>setSelected(null)}>Cancel</button></div>
   </form>
  </section></div>}
  <footer className="careers-footer">CABO HUMAN CAPITAL <span>Fair opportunities. Human potential.</span></footer>
 </div>;
}
