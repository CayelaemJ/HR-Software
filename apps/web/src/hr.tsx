import {useCallback,useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowRight,CheckCircle2,Download,FileCheck2,Plus,RefreshCw} from 'lucide-react';
import {ProgressionWorkspace} from './progression';
import {FairnessWorkspace} from './fairness';
import {HrFeedbackPanel} from './feedback';
import {EmployeeLinkPanel} from './employee';
import {PayrollWorkspace} from './payroll';

type Tab='employees'|'onboarding'|'leave'|'reviews'|'development'|'progression'|'fairness'|'feedback'|'integrations'|'reports';
type Employee={id:string;employee_code:string;full_name:string;work_email:string;department:string;job_title:string;employment_status:string;start_date:string};
type Task={id:string;employee_name:string;title:string;category:string;due_date:string|null;status:string};
type Leave={id:string;employee_name:string;leave_type:string;start_date:string;end_date:string;status:string;employee_note:string};
type Review={id:string;employee_id:string;employee_name:string;period_label:string;summary:string;status:string};
type Plan={id:string;employee_name:string;goal:string;actions:string;success_measure:string;target_date:string|null;status:string;progress_note:string};
type Reports={headcount:{total:number;active:number;on_leave:number};leave:{status:string;count:number}[];reviews:{status:string;count:number}[];development:{status:string;count:number}[];departments:{department:string;count:number}[];onboarding:{pending:number}};
const labels:{key:Tab;label:string}[]=[
 {key:'employees',label:'Employees'}, {key:'onboarding',label:'Onboarding'},{key:'leave',label:'Leave'},
 {key:'reviews',label:'Performance'},{key:'development',label:'Development'}, {key:'progression',label:'Career progression'}, {key:'fairness',label:'Process fairness'}, {key:'feedback',label:'Employee feedback'}, {key:'integrations',label:'Payroll handoff'}, {key:'reports',label:'Reports'}
];
const human=(s:string)=>s.replaceAll('_',' ').replace(/^./,x=>x.toUpperCase());
const fieldDate=(d:string|null|undefined)=>d?String(d).slice(0,10):'—';
async function call<T>(path:string,options?:RequestInit):Promise<T>{
 const result=await fetch('/api/v1/hr'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options?.headers}});
 const value=await result.json().catch(()=>({error:'Service is not responding'}));
 if(!result.ok)throw new Error(value.error||'Unable to load Human Capital record');
 return value as T;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label>{label}{children}</label>;}
const Input=({name,required=true,type='text',placeholder='',maxLength=160,minLength}: {name:string;required?:boolean;type?:string;placeholder?:string;maxLength?:number;minLength?:number})=>
 <input name={name} required={required} type={type} placeholder={placeholder} maxLength={maxLength} minLength={minLength}/>;
function StaffSelect({employees}:{employees:Employee[]}){return <select name="employeeId" required defaultValue=""><option value="">Select employee…</option>{employees.filter(x=>x.employment_status!=='exited').map(e=><option key={e.id} value={e.id}>{e.full_name} · {e.employee_code}</option>)}</select>;}
function HrForm({tab,staff,busy,onSubmit}:{tab:Tab;staff:Employee[];busy:boolean;onSubmit:(v:Record<string,string>)=>Promise<void>}){
 const submit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const fields=Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
  void onSubmit(fields);
 };
 return <form className="modal-form hr-form" onSubmit={submit}>
 {tab==='employees'&&<>
   <div className="hr-form-grid"><Field label="Employee code"><Input name="employeeCode" placeholder="CABO-EMP-001" maxLength={50}/></Field><Field label="Start date"><Input name="startDate" type="date"/></Field></div>
   <Field label="Full legal name"><Input name="fullName"/></Field><Field label="Work email"><Input name="workEmail" type="email"/></Field>
   <div className="hr-form-grid"><Field label="Department"><Input name="department" required={false}/></Field><Field label="Job title"><Input name="jobTitle" required={false}/></Field></div>
 </>}
 {tab==='onboarding'&&<>
   <Field label="Employee"><StaffSelect employees={staff}/></Field>
   <Field label="Onboarding action"><Input name="title" maxLength={200} minLength={4} placeholder="Verify access and complete induction checklist"/></Field>
   <div className="hr-form-grid"><Field label="Category"><select name="category"><option value="documents">Documents</option><option value="it">Technology access</option><option value="orientation">Orientation</option><option value="training">Training</option><option value="other">Other</option></select></Field><Field label="Due date"><Input name="dueDate" type="date" required={false}/></Field></div>
 </>}
 {tab==='leave'&&<>
   <Field label="Employee"><StaffSelect employees={staff}/></Field>
   <Field label="Leave category"><select name="leaveType">{['annual','sick','family_responsibility','study','unpaid','other'].map(x=><option key={x} value={x}>{human(x)}</option>)}</select></Field>
   <div className="hr-form-grid"><Field label="Start date"><Input name="startDate" type="date"/></Field><Field label="End date"><Input name="endDate" type="date"/></Field></div>
   <Field label="Reason (optional, avoid sensitive details)"><textarea name="employeeNote" rows={2} maxLength={2000}/></Field>
 </>}
 {tab==='reviews'&&<>
   <Field label="Employee"><StaffSelect employees={staff}/></Field>
   <Field label="Review period"><Input name="periodLabel" maxLength={80} placeholder="2026 Q4"/></Field>
   <Field label="Evidence-based review summary"><textarea name="summary" rows={3} required minLength={20} maxLength={6000}/></Field>
   <Field label="Documented achievements"><textarea name="achievements" rows={2} maxLength={5000}/></Field>
   <Field label="Development opportunities"><textarea name="developmentAreas" rows={2} maxLength={5000}/></Field>
 </>}
 {tab==='development'&&<>
   <Field label="Employee"><StaffSelect employees={staff}/></Field>
   <Field label="Development goal"><textarea name="goal" rows={2} minLength={12} maxLength={1200} required placeholder="Build stronger analytical reporting capability"/></Field>
   <Field label="Specific agreed actions"><textarea name="actions" rows={2} minLength={12} maxLength={4000} required placeholder="Complete training and deliver supervised projects"/></Field>
   <Field label="Measurable success evidence"><textarea name="successMeasure" rows={2} minLength={8} maxLength={1500} required placeholder="Demonstrate improved accuracy and review outcomes"/></Field>
   <Field label="Target date"><Input name="targetDate" type="date" required={false}/></Field>
 </>}
 <button className="primary-button" disabled={busy||tab!=='employees'&&staff.length===0}><Plus size={16}/>{busy?'Saving…':tab==='employees'?'Add employee':tab==='onboarding'?'Add onboarding task':tab==='leave'?'Record leave request':tab==='reviews'?'Start review':'Create development plan'}</button>
 </form>;
}
function ExportButton(){return <button className="outline-button" onClick={()=>{window.location.href='/api/v1/hr/reports/employees.csv';}}><Download size={16}/> Export employee CSV</button>;}
export function HrWorkspace(){
 const [tab,setTab]=useState<Tab>('employees'),[showForm,setShowForm]=useState(false);
 const [employees,setEmployees]=useState<Employee[]>([]),[tasks,setTasks]=useState<Task[]>([]),[leave,setLeave]=useState<Leave[]>([]),[reviews,setReviews]=useState<Review[]>([]),[plans,setPlans]=useState<Plan[]>([]),[reports,setReports]=useState<Reports|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async(active:Tab)=>{
  setLoading(true);setError('');
  try{
   const staff=await call<Employee[]>('/employees');setEmployees(staff);
   if(active==='onboarding')setTasks(await call<Task[]>('/onboarding'));
   if(active==='leave')setLeave(await call<Leave[]>('/leave'));
   if(active==='reviews')setReviews(await call<Review[]>('/reviews'));
   if(active==='development')setPlans(await call<Plan[]>('/development'));
   if(active==='reports')setReports(await call<Reports>('/reports/overview'));
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh(tab);},[tab,refresh]);
 const paths:Record<Exclude<Tab,'reports'|'progression'|'fairness'|'feedback'|'integrations'>,string>={employees:'/employees',onboarding:'/onboarding',leave:'/leave',reviews:'/reviews',development:'/development'};
 async function create(values:Record<string,string>){
  if(tab==='reports'||tab==='progression'||tab==='fairness'||tab==='feedback'||tab==='integrations')return;
  setBusy(true);setError('');
  const valuesClean=Object.fromEntries(Object.entries(values).filter(([,value])=>value!=='')) as Record<string,string>;
  try{await call(paths[tab],{method:'POST',body:JSON.stringify(valuesClean)});
   setShowForm(false);setNotice('Saved to Neon and recorded in the audit trail.');await refresh(tab);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function change(path:string,body:object){
  setBusy(true);setError('');
  try{await call(path,{method:'PATCH',body:JSON.stringify(body)});
   setNotice('Human decision recorded.');await refresh(tab);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function promptReason(label:string){const value=window.prompt(label+' — provide a documented reason of at least 12 characters:');
  return value&&value.trim().length>=12?value.trim():null;}
 function decideLeave(entry:Leave,status:'approved'|'rejected'){
  const reason=promptReason(human(status)+' leave');
  if(reason)void change('/leave/'+entry.id+'/status',{status,reason});
 }
 function advanceReview(entry:Review){
  const status=entry.status==='draft'?'submitted':'finalized';
  const reason=promptReason('Review: '+human(status));if(reason)void change('/reviews/'+entry.id+'/status',{status,reason});
 }
 function changePlan(entry:Plan){
  const status=window.prompt('Plan status (planned, in_progress, completed, paused):',entry.status);
  if(!status||!['planned','in_progress','completed','paused'].includes(status))return;
  const progressNote=promptReason('Progress evidence');
  if(progressNote)void change('/development/'+entry.id,{status,progressNote});
 }
 function resolveTask(task:Task){
  const completionNote=promptReason('Onboarding completion note');if(completionNote)void change('/onboarding/'+task.id,{status:'completed',completionNote});
 }
 return <div className="hr-workspace">
 <div className="hr-nav" role="tablist" aria-label="HR workflows">{labels.map(l=><button role="tab" aria-selected={tab===l.key} className={tab===l.key?'active':''} key={l.key} onClick={()=>{setTab(l.key);setShowForm(false);setNotice('');}}>{l.label}</button>)}</div>
 {notice&&<div className="notice success"><CheckCircle2 size={16}/>{notice}</div>}
 {error&&<div className="notice error" role="alert">{error}</div>}
 <section className="panel records-panel">
  <div className="panel-heading"><div><div className="eyebrow small">PEOPLE, PROGRESS & ACCOUNTABILITY</div><h2>{labels.find(x=>x.key===tab)?.label}</h2></div>
   <div className="hr-toolbar"><button title="Refresh records" className="table-action" onClick={()=>void refresh(tab)}><RefreshCw size={16}/></button>{tab==='reports'?<ExportButton/>:tab==='progression'||tab==='fairness'||tab==='feedback'||tab==='integrations'?null:<button className="primary-button" onClick={()=>setShowForm(x=>!x)}><Plus size={16}/>{showForm?'Close':'Add '+(tab==='employees'?'employee':tab==='onboarding'?'task':tab==='leave'?'request':tab==='reviews'?'review':'plan')}</button>}</div>
  </div>
 {showForm&&tab!=='reports'&&tab!=='progression'&&tab!=='fairness'&&tab!=='feedback'&&tab!=='integrations'&&<div className="hr-compose"><h3>New {tab==='employees'?'employee record':tab==='onboarding'?'onboarding task':tab==='leave'?'leave request':tab==='reviews'?'performance review':'development plan'}</h3><p className="hr-footnote">Only authorized Human Capital administrators can view and update these records. No employment decisions are made automatically.</p><HrForm key={tab} tab={tab} staff={employees} busy={busy} onSubmit={create}/></div>}
 {loading?<div className="hr-empty">Loading secured records…</div>:
 <>
 {tab==='employees'&&<EmployeeLinkPanel employees={employees}/>}
 {tab==='employees'&&(employees.length?<div className="table-wrap"><table><thead><tr><th>EMPLOYEE</th><th>ROLE</th><th>DEPARTMENT</th><th>START</th><th>STATUS</th></tr></thead><tbody>{employees.map(e=><tr key={e.id}><td><strong>{e.full_name}</strong><small>{e.employee_code} · {e.work_email}</small></td><td>{e.job_title||'—'}</td><td>{e.department||'—'}</td><td>{fieldDate(e.start_date)}</td><td><span className="status">{human(e.employment_status)}</span></td></tr>)}</tbody></table></div>:<div className="hr-empty">No employees yet. Add a staff profile to begin HR onboarding.</div>)}
 {tab==='onboarding'&&(tasks.length?<div className="table-wrap"><table><thead><tr><th>EMPLOYEE</th><th>TASK</th><th>DUE DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}><td>{t.employee_name}</td><td><strong>{t.title}</strong><small>{human(t.category)}</small></td><td>{fieldDate(t.due_date)}</td><td>{human(t.status)}</td><td>{t.status==='pending'&&<button disabled={busy} className="table-action" onClick={()=>resolveTask(t)}>Complete</button>}</td></tr>)}</tbody></table></div>:<div className="hr-empty">Onboarding actions will appear here as they are recorded.</div>)}
 {tab==='leave'&&(leave.length?<div className="table-wrap"><table><thead><tr><th>EMPLOYEE</th><th>LEAVE</th><th>DATES</th><th>STATUS</th><th>HUMAN DECISION</th></tr></thead><tbody>{leave.map(l=><tr key={l.id}><td><strong>{l.employee_name}</strong></td><td>{human(l.leave_type)}</td><td>{fieldDate(l.start_date)} – {fieldDate(l.end_date)}</td><td>{human(l.status)}</td><td>{l.status==='pending'&&<div className="hr-row-actions"><button disabled={busy} className="table-action" onClick={()=>decideLeave(l,'approved')}>Approve</button><button disabled={busy} className="table-action" onClick={()=>decideLeave(l,'rejected')}>Reject</button></div>}</td></tr>)}</tbody></table></div>:<div className="hr-empty">No leave requests recorded yet.</div>)}
 {tab==='reviews'&&(reviews.length?<div className="hr-cards">{reviews.map(r=><article className="hr-card" key={r.id}><div><span className="eyebrow small">{r.period_label} · {human(r.status)}</span><h3>{r.employee_name}</h3><p>{r.summary}</p></div>{r.status!=='finalized'&&<button className="table-action" disabled={busy} onClick={()=>advanceReview(r)}>{r.status==='draft'?'Submit for review':'Finalize review'} <ArrowRight size={14}/></button>}</article>)}</div>:<div className="hr-empty">No documented performance reviews yet.</div>)}
 {tab==='development'&&(plans.length?<div className="hr-cards">{plans.map(p=><article className="hr-card" key={p.id}><div><span className="eyebrow small">{p.employee_name} · {human(p.status)} · {fieldDate(p.target_date)}</span><h3>{p.goal}</h3><p>{p.actions}</p><small>Success measure: {p.success_measure}</small></div><button className="table-action" disabled={busy} onClick={()=>changePlan(p)}>Update progress <ArrowRight size={14}/></button></article>)}</div>:<div className="hr-empty">Development plans link skills growth to measurable work evidence.</div>)}
 {tab==='progression'&&<ProgressionWorkspace employees={employees}/>}
 {tab==='fairness'&&<FairnessWorkspace/>}
 {tab==='feedback'&&<HrFeedbackPanel/>}
 {tab==='integrations'&&<PayrollWorkspace/>}
 {tab==='reports'&&reports&&<div className="hr-reports">
  <div className="hr-metrics"><div><small>TOTAL STAFF</small><strong>{reports.headcount.total}</strong></div><div><small>ACTIVE</small><strong>{reports.headcount.active}</strong></div><div><small>ON LEAVE</small><strong>{reports.headcount.on_leave}</strong></div><div><small>OPEN ONBOARDING TASKS</small><strong>{reports.onboarding.pending}</strong></div></div>
  <div className="hr-report-sets">{([{title:'Departments',data:reports.departments.map(x=>({name:x.department||'General',count:x.count}))},{title:'Leave decisions',data:reports.leave.map(x=>({name:human(x.status),count:x.count}))},{title:'Performance reviews',data:reports.reviews.map(x=>({name:human(x.status),count:x.count}))},{title:'Development plans',data:reports.development.map(x=>({name:human(x.status),count:x.count}))}]).map(g=><article key={g.title} className="hr-report"><h3>{g.title}</h3>{g.data.length?g.data.map(x=><div className="hr-report-line" key={x.name}><span>{x.name}</span><strong>{x.count}</strong></div>):<p>No records yet</p>}</article>)}</div>
  <p className="hr-footnote"><FileCheck2 size={14}/> Reports are based on recorded data, not inferred outcomes. Authorized employee exports are audited.</p>
  </div>}
 </>}
 </section></div>;
}
