import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CandidateEvidence, InterviewWorkspace } from './recruitment';
import { HrWorkspace } from './hr';
import { PrivacyWorkspace } from './privacy';
import { Activity, ArrowRight, BriefcaseBusiness, CheckCircle2, ChevronDown, CircleHelp, ClipboardList, FileText, LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, Sun, Moon, Users, X } from 'lucide-react';

type Page = 'overview' | 'jobs' | 'candidates' | 'applications' | 'interviews' | 'hr' | 'privacy' | 'audit';
type Auth = {user:{id:string;email:string;full_name?:string;name?:string};organization:string;tenantId:string;role:string};
type Job = {id:string;is_demo?:boolean;title:string;department:string;location:string;employment_type:string;description:string;criteria:string;status:string;created_at:string};
type Candidate = {id:string;is_demo?:boolean;full_name:string;email:string;headline:string;notes:string;created_at:string};
type Application = {id:string;is_demo?:boolean;stage:string;job_title:string;candidate_name:string;decision_reason:string|null;created_at:string};
type Overview = {demoSeeded?:boolean;jobs:{total:number;published:number};candidates:number;applications:{total:number;interviews:number}};
type Audit = {action:string;object_type:string;created_at:string;details:unknown};
type InterviewDraft = {model:string;questions:{question:string;criterion:string;guidance:string}[]};
const date = (iso:string) => new Intl.DateTimeFormat('en-ZA',{day:'numeric',month:'short',year:'numeric'}).format(new Date(iso));

async function api<T>(path:string, options?:RequestInit):Promise<T>{
  const response=await fetch('/api/v1'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options?.headers}});
  if(response.status===204)return undefined as T;
  const body=await response.json().catch(()=>({error:'Server unavailable'}));
  if(!response.ok)throw new Error(body.error||'Request could not be completed');
  return body as T;
}
const menuItems:{id:Page;name:string;icon:typeof LayoutDashboard}[]=[
  {id:'overview',name:'Overview',icon:LayoutDashboard},
  {id:'jobs',name:'Vacancies',icon:BriefcaseBusiness},
  {id:'candidates',name:'Talent pool',icon:Users},
  {id:'applications',name:'Applications',icon:ClipboardList},
  {id:'interviews',name:'Interviews',icon:ClipboardList},
  {id:'hr',name:'HR & performance',icon:Users},
  {id:'privacy',name:'Privacy & access',icon:ShieldCheck},
  {id:'audit',name:'Audit trail',icon:ShieldCheck}
];
function App(){
  const [auth,setAuth]=useState<Auth|null>(null);
  const [initializing,setInitializing]=useState(true);
  const [page,setPage]=useState<Page>('overview');
  const [jobs,setJobs]=useState<Job[]>([]);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [applications,setApplications]=useState<Application[]>([]);
  const [overview,setOverview]=useState<Overview|null>(null);
  const [events,setEvents]=useState<Audit[]>([]);
  const [aiJob,setAiJob]=useState<Job|null>(null);
  const [evidenceCandidate,setEvidenceCandidate]=useState<Candidate|null>(null);
  const [aiDraft,setAiDraft]=useState<InterviewDraft|null>(null);
  const [aiBusy,setAiBusy]=useState(false);
  const [aiError,setAiError]=useState('');
  const [dialog,setDialog]=useState<'job'|'candidate'|'application'|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [mobileMenu,setMobileMenu]=useState(false);
  const [light,setLight]=useState(false);
  const canEdit=!!auth&&['owner','hr_admin','recruiter'].includes(auth.role);
  const canAudit=!!auth&&['owner','hr_admin'].includes(auth.role);
  const refresh=useCallback(async()=>{
    try{
      const [summary,j,c,a]=await Promise.all([
        api<Overview>('/overview'),api<Job[]>('/jobs'),api<Candidate[]>('/candidates'),api<Application[]>('/applications')
      ]);
      setOverview(summary);setJobs(j);setCandidates(c);setApplications(a);
    }catch(e){setError((e as Error).message);}
  },[]);
  useEffect(()=>{
    api<Auth>('/auth/me').then(async a=>{setAuth(a);await refresh();}).catch(()=>setAuth(null)).finally(()=>setInitializing(false));
  },[refresh]);
  useEffect(()=>{document.documentElement.dataset.theme=light?'light':'dark';},[light]);
  useEffect(()=>{
    if(page==='audit'&&canAudit)api<Audit[]>('/audit').then(setEvents).catch(e=>setError(e.message));
  },[page,canAudit]);
  async function login(email:string,password:string){
    await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
    const a=await api<Auth>('/auth/me');
    setAuth(a);await refresh();
  }
  async function logout(){try{await api('/auth/logout',{method:'POST'});}finally{setAuth(null);setPage('overview');}}
  async function submit(path:string,method:string,data:unknown){
    setBusy(true);setError('');
    try{
      await api(path,{method,body:JSON.stringify(data)});
      setDialog(null);setNotice('Changes saved successfully.');await refresh();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function statusChange(job:Job){
    if(!confirm('Change this vacancy to '+(job.status==='draft'?'published':'closed')+'?'))return;
    await submit('/jobs/'+job.id+'/status','PATCH',{status:job.status==='draft'?'published':'closed'});
  }
  async function stageChange(item:Application,next:string){
    let reason: string|undefined;
    if(['hired','declined'].includes(next)){
      reason=prompt('Document your human decision (minimum 12 characters).')??undefined;
      if(!reason)return;
    }
    await submit('/applications/'+item.id+'/stage','PATCH',{stage:next,reason});
  }
  async function generateInterviewDraft(job:Job) {
    setAiJob(job);setAiDraft(null);setAiError('');setAiBusy(true);
    try { setAiDraft(await api<InterviewDraft>('/ai/interview-questions',{method:'POST',body:JSON.stringify({jobId:job.id})})); }
    catch(err) {setAiError((err as Error).message);}
    finally {setAiBusy(false);}
  }
  async function loadDemo(){
    if(!window.confirm('Load clearly labelled synthetic demonstration vacancies, candidates, applications and an interview into this workspace? This action is one-time per organization.'))return;
    setBusy(true);setError('');
    try{const result=await api<{alreadySeeded:boolean}>('/demo/seed',{method:'POST',body:'{}'});
      setNotice(result.alreadySeeded?'Demo data was already loaded.':'Synthetic demonstration records created in Neon.');
      await refresh();
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  const filteredJobs=jobs.filter(x=>(x.title+' '+x.department+' '+x.location).toLowerCase().includes(search.toLowerCase()));
  const filteredCandidates=candidates.filter(x=>(x.full_name+' '+x.email+' '+x.headline).toLowerCase().includes(search.toLowerCase()));
  const filteredApps=applications.filter(x=>(x.candidate_name+' '+x.job_title+' '+x.stage).toLowerCase().includes(search.toLowerCase()));
  if(initializing)return <div className="loading"><div className="brand-icon">C.</div><p>Loading CABO Human Capital</p></div>;
  if(!auth)return <Entry onLogin={login}/>;
  const current=menuItems.find(x=>x.id===page)!;
  return <div className="shell">
    <aside className={'sidebar '+(mobileMenu?'opened':'')}>
      <div className="brand"><div className="brand-icon">C.</div><div><strong>CABO</strong><small>HUMAN CAPITAL</small></div><button className="mobile-close ghost" onClick={()=>setMobileMenu(false)} aria-label="Close navigation"><X size={20}/></button></div>
      <div className="workspace"><small>WORKSPACE</small><div className="workspace-name"><div className="workspace-emblem">{auth.organization?.slice(0,1)||'C'}</div><span>{auth.organization}</span><ChevronDown size={14}/></div></div>
      <div className="nav-caption">MANAGEMENT</div>
      <nav aria-label="Main navigation">{menuItems.filter(item=>!['audit','hr'].includes(item.id)||canAudit).map(item=><button key={item.id} className={'nav-item '+(page===item.id?'selected':'')} onClick={()=>{setPage(item.id);setSearch('');setNotice('');setError('');setMobileMenu(false);}}><item.icon size={19}/><span>{item.name}</span>{page===item.id&&<span className="selected-dot"/>}</button>)}</nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-note"><ShieldCheck size={17}/><div><strong>Human-led decisions</strong><p>Every employment decision stays with your team.</p></div></div>
      <button className="nav-item" onClick={logout}><LogOut size={19}/> Sign out</button>
      <div className="sidebar-foot">© {new Date().getFullYear()} CABO SOLUTIONS</div>
    </aside>
    {mobileMenu&&<button aria-label="Close menu" className="scrim" onClick={()=>setMobileMenu(false)}/>}
    <main className="main">
      <header className="topbar">
        <div className="header-left"><button className="menu-toggle ghost" onClick={()=>setMobileMenu(true)} aria-label="Open navigation"><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{current.name}</strong></div></div>
        <div className="top-actions"><span className="live-chip"><span className="live-dot"/> LIVE DATA</span><button className="icon-button" onClick={()=>setLight(!light)} title="Toggle colour theme" aria-label="Toggle colour theme">{light?<Moon size={18}/>:<Sun size={18}/>}</button><div className="avatar" title={auth.user?.email}>{(auth.user?.full_name||auth.user?.name||'U').slice(0,1)}</div></div>
      </header>
      <div className="page-content">
        <div className="eyebrow"><span className="eyebrow-line"/> CABO / WORKFORCE INTELLIGENCE</div>
        <div className="page-heading"><div><h1>{page==='overview'?'People, potential & progress.':current.name}</h1><p>{page==='overview'?'Make confident people decisions with clearer evidence and full accountability.':page==='jobs'?'Manage role requirements and hiring opportunities.':page==='candidates'?'Get to know your talent through what they can do.':page==='applications'?'Track the journey. Keep decisions human.':page==='interviews'?'Schedule structured assessments and record human evidence.':page==='hr'?'Employee lifecycle, evidence-based growth, leave and reporting.':page==='privacy'?'Your data, account security, and transparent privacy requests.':'A clear record of consequential workforce actions.'}</p></div>
          {canEdit&&(page==='jobs'||page==='candidates'||page==='applications')&&<button className="primary-button" onClick={()=>setDialog(page==='jobs'?'job':page==='candidates'?'candidate':'application')}><Plus size={18}/>{page==='jobs'?'New vacancy':page==='candidates'?'Add candidate':'New application'}</button>}
        </div>
        {notice&&<div className="notice success"><CheckCircle2 size={17}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {error&&<div className="notice error"><CircleHelp size={17}/>{error}<button onClick={()=>setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {page==='overview'&&<>
          {overview?.demoSeeded?<div className="demo-notice"><strong>DEMO DATA ENABLED</strong><span>This workspace contains synthetic example records. They are not real candidates or vacancies.</span></div>:
            auth.role==='owner'&&<div className="demo-notice"><div><strong>DEMONSTRATION WORKSPACE</strong><span>Load synthetic vacancies, candidate evidence, applications and a sample interview to explore CABO with your team.</span></div><button className="table-action" disabled={busy} onClick={loadDemo}>{busy?'Loading…':'Load demo data'}</button></div>}

          <div className="stats-grid"><Stat icon={BriefcaseBusiness} label="TOTAL VACANCIES" value={overview?.jobs.total??'—'} note={String(overview?.jobs.published??0)+' published'} /><Stat icon={Users} label="TALENT PROFILES" value={overview?.candidates??'—'} note="Verified by your team" /><Stat icon={FileText} label="APPLICATIONS" value={overview?.applications.total??'—'} note="Across all vacancies" /><Stat icon={Activity} label="INTERVIEW STAGE" value={overview?.applications.interviews??'—'} note="Pending human review" /></div>
          <div className="dashboard-grid">
            <section className="panel"><div className="panel-heading"><div><div className="eyebrow small">RECRUITMENT</div><h2>Recent vacancies</h2></div><button className="text-button" onClick={()=>setPage('jobs')}>View all <ArrowRight size={16}/></button></div>
            {jobs.length?<div className="record-list">{jobs.slice(0,5).map(j=><div className="record" key={j.id}><div className="record-icon"><BriefcaseBusiness size={19}/></div><div className="record-content"><strong>{j.title}{j.is_demo&&<span className="demo-label"> DEMO</span>}</strong><small>{j.department||'General'} · {j.location||'Location not set'}</small></div><Status name={j.status}/></div>)}</div>:<Empty text="No vacancies yet. Create one to begin your recruitment journey."/>}</section>
            <section className="panel accent-panel"><div className="eyebrow small">THE CABO WAY</div><div className="abstract-orb"><ShieldCheck size={32}/></div><h2>Fairer decisions.<br/>Stronger teams.</h2><p>Build recruitment journeys anchored in job-related criteria, clear evidence and documented human decisions.</p><button className="outline-button" onClick={()=>setPage('jobs')}>Explore vacancies <ArrowRight size={16}/></button></section>
          </div>
          <div className="section-row"><span>YOUR WORKSPACE</span><span>South African locale · Privacy-first architecture</span></div>
        </>}
        {page==='interviews'&&<InterviewWorkspace applications={applications} editable={canEdit}/>}
        {page==='hr'&&canAudit&&<HrWorkspace/>}
        {page==='privacy'&&<PrivacyWorkspace role={auth.role} onPasswordChanged={()=>{setAuth(null);setPage('overview');}}/>}
        {page!=='overview'&&page!=='interviews'&&page!=='hr'&&page!=='privacy'&&<section className="panel records-panel">
          <div className="panel-heading"><div><div className="eyebrow small">WORKSPACE RECORDS</div><h2>{page==='jobs'?'Vacancy pipeline':page==='candidates'?'Candidate directory':page==='applications'?'Application tracking':'Activity log'}</h2></div>{page!=='audit'&&<div className="search-field"><Search size={17}/><input aria-label="Search records" placeholder="Search records…" value={search} onChange={e=>setSearch(e.target.value)}/></div>}</div>
          {page==='jobs'&&(filteredJobs.length?<div className="table-wrap"><table><thead><tr><th>VACANCY</th><th>DEPARTMENT</th><th>STATUS</th><th>CREATED</th><th>ACTION</th></tr></thead><tbody>{filteredJobs.map(j=><tr key={j.id}><td><strong>{j.title}{j.is_demo&&<span className="demo-label"> DEMO</span>}</strong><small>{j.employment_type} · {j.location||'—'}</small></td><td>{j.department||'—'}</td><td><Status name={j.status}/></td><td>{date(j.created_at)}</td><td><div className="table-actions">{canEdit&&j.status!=='closed'&&<button className="table-action" onClick={()=>statusChange(j)}>{j.status==='draft'?'Publish':'Close vacancy'}</button>}{canEdit&&<button className="table-action ai-action" onClick={()=>generateInterviewDraft(j)}>AI questions</button>}</div></td></tr>)}</tbody></table></div>:<Empty text="No vacancies match your search. Create the first role with clear evaluation criteria."/>)}
          {page==='candidates'&&(filteredCandidates.length?<div className="table-wrap"><table><thead><tr><th>CANDIDATE</th><th>PROFESSIONAL HEADLINE</th><th>ADDED</th><th>EVIDENCE</th></tr></thead><tbody>{filteredCandidates.map(c=><tr key={c.id}><td><strong>{c.full_name}{c.is_demo&&<span className="demo-label"> DEMO</span>}</strong><small>{c.email}</small></td><td>{c.headline||'Not recorded'}</td><td>{date(c.created_at)}</td><td><button className="table-action" onClick={()=>setEvidenceCandidate(c)}>View evidence</button></td></tr>)}</tbody></table></div>:<Empty text="No candidates yet. Add a candidate to your talent directory."/>)}
          {page==='applications'&&(filteredApps.length?<div className="table-wrap"><table><thead><tr><th>CANDIDATE</th><th>VACANCY</th><th>STAGE</th><th>HUMAN ACTION</th></tr></thead><tbody>{filteredApps.map(a=><tr key={a.id}><td><strong>{a.candidate_name}{a.is_demo&&<span className="demo-label"> DEMO</span>}</strong></td><td>{a.job_title}</td><td><Status name={a.stage}/></td><td>{canEdit&&!['hired','declined','withdrawn'].includes(a.stage)?<select className="stage-select" value="" aria-label={'Change stage for '+a.candidate_name} onChange={e=>{if(e.target.value)stageChange(a,e.target.value);}}><option value="">Move to…</option>{['human_review','interview','offer','hired','declined','withdrawn'].filter(x=>x!==a.stage).map(x=><option key={x} value={x}>{x.replace('_',' ')}</option>)}</select>:'—'}</td></tr>)}</tbody></table></div>:<Empty text="No applications yet. Link a candidate to an open vacancy."/>)}
          {page==='audit'&&(events.length?<div className="record-list">{events.map((event,i)=><div className="record" key={i}><div className="record-icon"><ShieldCheck size={18}/></div><div className="record-content"><strong>{event.action.replaceAll('.',' · ').replaceAll('_',' ')}</strong><small>{event.object_type} · {date(event.created_at)}</small></div></div>)}</div>:<Empty text="No recorded activity yet."/>)}
        </section>}
        <footer className="page-footer">CABO HUMAN CAPITAL <span>Transparent systems. Human potential.</span></footer>
      </div>
    </main>
    {evidenceCandidate&&<CandidateEvidence candidate={evidenceCandidate} editable={canEdit} onClose={()=>setEvidenceCandidate(null)}/>}
    {aiJob&&<Modal title="AI interview questions" description={'Draft questions for '+aiJob.title+'; human review required.'} onClose={()=>setAiJob(null)}>
      <div className="ai-question-list">
        {aiBusy&&<p>Creating a draft from job-related criteria…</p>}
        {aiError&&<div className="notice error">{aiError}</div>}
        {aiDraft&&<><p className="hint">AI generated suggestions. They are not candidate evaluations or hiring recommendations. Verify relevance and accessibility before using.</p>
        {aiDraft.questions.map((q,i)=><article className="ai-question" key={i}><div className="eyebrow small">QUESTION {i+1} · {q.criterion}</div><strong>{q.question}</strong><p>{q.guidance}</p></article>)}
        <small>Model: {aiDraft.model}. Draft only, no applications modified.</small></>}
      </div></Modal>}
    {dialog==='job'&&<Modal title="Create a vacancy" description="A documented evaluation framework is required before publication." onClose={()=>setDialog(null)}><JobForm busy={busy} onSubmit={data=>submit('/jobs','POST',data)}/></Modal>}
    {dialog==='candidate'&&<Modal title="Add a candidate" description="Capture only necessary recruitment information." onClose={()=>setDialog(null)}><CandidateForm busy={busy} onSubmit={data=>submit('/candidates','POST',data)}/></Modal>}
    {dialog==='application'&&<Modal title="Create an application" description="Human reviewers remain responsible for all outcomes." onClose={()=>setDialog(null)}><ApplicationForm jobs={jobs} candidates={candidates} busy={busy} onSubmit={data=>submit('/applications','POST',data)}/></Modal>}
  </div>;
}
function Entry({onLogin}:{onLogin:(email:string,password:string)=>Promise<void>}){
  const [setup,setSetup]=useState(false);
  return setup?<Setup onBack={()=>setSetup(false)}/>:<><Login onLogin={onLogin}/><div className="setup-launch"><span>First time setting up CABO Human Capital?</span><button onClick={()=>setSetup(true)}>Set up your organization <ArrowRight size={14}/></button></div></>;
}
function Setup({onBack}:{onBack:()=>void}){
  const [organization,setOrganization]=useState(''),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[token,setToken]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[complete,setComplete]=useState(false);
  async function handle(e:FormEvent){
    e.preventDefault();setError('');setBusy(true);
    try {
      await api('/setup',{method:'POST',headers:{'x-setup-token':token},body:JSON.stringify({organization,name,email,password})});
      setComplete(true);setToken('');setPassword('');
    } catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <div className="setup-page"><div className="login-mark"><div className="brand-icon">C.</div><span>CABO <small>HUMAN CAPITAL</small></span></div><div className="setup-box">
    <div className="eyebrow small">INITIAL ADMINISTRATOR SETUP</div>
    <h1>{complete?'Your workspace is ready.':'Establish your workspace.'}</h1>
    {complete?<><p>Organization and administrator created. Before using real information, remove <code>BOOTSTRAP_TOKEN</code> from the Render environment settings and redeploy. Sign in with your new credentials.</p><button className="primary-button" onClick={onBack}>Go to sign in <ArrowRight size={17}/></button></>:<>
    <p>This is an authorized, one-time setup for a brand-new CABO Human Capital database. Obtain your temporary setup token from the Render environment settings.</p>
    <form className="modal-form" onSubmit={handle}>
      <label>Organization name<input value={organization} onChange={e=>setOrganization(e.target.value)} minLength={2} required placeholder="CABO Solutions"/></label>
      <label>Administrator full name<input value={name} onChange={e=>setName(e.target.value)} minLength={2} required/></label>
      <label>Administrator email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      <label>Strong administrator password<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} required/></label>
      <label>Temporary setup token<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} minLength={24} required/></label>
      {error&&<div className="notice error">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy?'Establishing workspace…':'Create secure workspace'}<ArrowRight size={17}/></button>
    </form></>}
    <button className="setup-back" onClick={onBack}>Return to sign in</button></div></div>;
}
function Login({onLogin}:{onLogin:(email:string,password:string)=>Promise<void>}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[pending,setPending]=useState(false),[err,setErr]=useState('');
  async function handle(e:FormEvent){e.preventDefault();setPending(true);setErr('');try{await onLogin(email,password);}catch(x){setErr((x as Error).message);}finally{setPending(false);}}
  return <div className="login-page"><div className="login-mark"><div className="brand-icon">C.</div><span>CABO <small>HUMAN CAPITAL</small></span></div><div className="login-layout"><div className="login-pitch"><div className="eyebrow"><span className="eyebrow-line"/> INTELLIGENCE WITH INTEGRITY</div><h1>Where human<br/><em>potential</em><br/>moves forward.</h1><p>Recruitment, performance and professional growth. Built for the people behind every business.</p><div className="pitch-line"><ShieldCheck size={19}/> Designed for responsible, human-led decisions.</div></div><div className="login-box"><div className="eyebrow small">WELCOME BACK</div><h2>Sign in to your workspace</h2><p>Use the credentials created during your organization's setup.</p><form onSubmit={handle}><label>Email or username<input type="text" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="cabo_test or email address" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{err&&<div className="notice error">{err}</div>}<button className="primary-button login-submit" disabled={pending}>{pending?'Signing in…':'Sign in securely'}<ArrowRight size={18}/></button></form><small className="login-help">Need an account? Contact your organization's CABO administrator.</small></div></div><div className="login-bottom">© {new Date().getFullYear()} CABO SOLUTIONS <span>BUILT FOR SOUTH AFRICA</span></div></div>;
}
function Stat({icon:Icon,label,value,note}:{icon:typeof Activity;label:string;value:number|string;note:string}){return <div className="stat-card"><div className="stat-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{note}</small></div>;}
function Status({name}:{name:string}){return <span className={'status status-'+name}>{name.replaceAll('_',' ')}</span>;}
function Empty({text}:{text:string}){return <div className="empty"><FileText size={28}/><p>{text}</p></div>;}
function Modal({title,description,onClose,children}:{title:string;description:string;onClose:()=>void;children:ReactNode}){return <div className="modal-shade" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-top"><div><div className="eyebrow small">CABO / CREATE RECORD</div><h2>{title}</h2><p>{description}</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;}
function JobForm({onSubmit,busy}:{onSubmit:(data:unknown)=>void;busy:boolean}){const [title,setTitle]=useState(''),[department,setDepartment]=useState(''),[location,setLocation]=useState(''),[employmentType,setType]=useState('full-time'),[description,setDescription]=useState(''),[criteria,setCriteria]=useState('');return <form className="modal-form" onSubmit={e=>{e.preventDefault();onSubmit({title,department,location,employmentType,description,criteria});}}><label>Job title<input minLength={3} maxLength={150} required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Data Analyst"/></label><div className="form-two"><label>Department<input maxLength={100} value={department} onChange={e=>setDepartment(e.target.value)} placeholder="e.g. Technology"/></label><label>Location<input maxLength={100} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Sandton, Gauteng"/></label></div><label>Employment type<select value={employmentType} onChange={e=>setType(e.target.value)}>{['full-time','part-time','fixed-term','internship','contract'].map(x=><option key={x}>{x}</option>)}</select></label><label>Role description<textarea minLength={20} required rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe responsibilities and the role's purpose."/></label><label>Job-related evaluation criteria<textarea minLength={12} required rows={3} value={criteria} onChange={e=>setCriteria(e.target.value)} placeholder="List essential skills, evidence and required qualifications."/></label><button className="primary-button" disabled={busy}>{busy?'Saving…':'Save vacancy as draft'}<ArrowRight size={17}/></button></form>;}
function CandidateForm({onSubmit,busy}:{onSubmit:(data:unknown)=>void;busy:boolean}){const [fullName,setName]=useState(''),[email,setEmail]=useState(''),[headline,setHeadline]=useState(''),[notes,setNotes]=useState('');return <form className="modal-form" onSubmit={e=>{e.preventDefault();onSubmit({fullName,email,headline,notes});}}><label>Full name<input required minLength={2} value={fullName} onChange={e=>setName(e.target.value)}/></label><label>Email address<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Professional headline<input maxLength={200} value={headline} onChange={e=>setHeadline(e.target.value)} placeholder="e.g. Customer Success Specialist"/></label><label>Recruiter notes (optional)<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label><button className="primary-button" disabled={busy}>{busy?'Saving…':'Add candidate'}<ArrowRight size={17}/></button></form>;}
function ApplicationForm({jobs,candidates,onSubmit,busy}:{jobs:Job[];candidates:Candidate[];onSubmit:(data:unknown)=>void;busy:boolean}){const [jobId,setJobId]=useState(''),[candidateId,setCandidateId]=useState('');return <form className="modal-form" onSubmit={e=>{e.preventDefault();onSubmit({jobId,candidateId});}}><label>Vacancy<select required value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">Choose a vacancy</option>{jobs.filter(x=>x.status==='published').map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></label><label>Candidate<select required value={candidateId} onChange={e=>setCandidateId(e.target.value)}><option value="">Choose a candidate</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>{!jobs.some(x=>x.status==='published')&&<p className="hint">Publish a vacancy before linking an application.</p>}{candidates.length===0&&<p className="hint">Add a candidate before starting an application.</p>}<button className="primary-button" disabled={busy||!jobId||!candidateId}>{busy?'Saving…':'Create application'}<ArrowRight size={17}/></button></form>;}
export default App;
