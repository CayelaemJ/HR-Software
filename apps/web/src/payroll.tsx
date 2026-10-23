import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {CheckCircle2,Download,FileSpreadsheet,LockKeyhole,RefreshCcw} from 'lucide-react';

type Kind='employee_roster'|'approved_leave';
type Status={mfaEnabled:boolean;kind:string;salaryCalculations:boolean;vendorCertified:boolean};
type Preview={kind:Kind;count:number;periodStart:string;periodEnd:string;warning:string};
type ExportHistory={id:string;export_kind:Kind;period_start:string;period_end:string;record_count:number;file_sha256:string;created_at:string};

const base='/api/v1/hr/integrations/payroll';
async function json<T>(path:string,options?:RequestInit):Promise<T>{
 const r=await fetch(base+path,{credentials:'same-origin',...options,
  headers:{'Content-Type':'application/json',...options?.headers}});
 const body=await r.json().catch(()=>({error:'Payroll integration unavailable'}));
 if(!r.ok)throw Error(body.error||'Request failed');
 return body as T;
}
const iso=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');

export function PayrollWorkspace(){
 const today=new Date();
 const [kind,setKind]=useState<Kind>('employee_roster');
 const [start,setStart]=useState(iso(new Date(today.getFullYear(),today.getMonth(),1)));
 const [end,setEnd]=useState(iso(today));
 const [status,setStatus]=useState<Status|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [history,setHistory]=useState<ExportHistory[]>([]);
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  try{
   const statusResult=await json<Status>('/status');
   setStatus(statusResult);
   if(statusResult.mfaEnabled)setHistory(await json<ExportHistory[]>('/history'));
   else setHistory([]);
  }catch(e){setError((e as Error).message);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 function changeRange(next:()=>void){next();setPreview(null);setConfirmed(false);setNotice('');}
 async function inspect(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');setNotice('');setConfirmed(false);
  try{setPreview(await json<Preview>('/preview',{method:'POST',body:JSON.stringify({kind,periodStart:start,periodEnd:end})}));}
  catch(e){setPreview(null);setError((e as Error).message);}finally{setBusy(false);}
 }
 async function download(){
  if(!confirmed||!preview)return;
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(base+'/export',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({kind,periodStart:start,periodEnd:end,confirmed:true})});
   if(!response.ok){
    const payload=await response.json().catch(()=>({error:'Unable to generate CSV'}));
    throw Error(payload.error||'CSV generation failed');
   }
   const blob=await response.blob();
   const url=URL.createObjectURL(blob);
   const anchor=document.createElement('a');
   anchor.href=url;
   anchor.download='cabo-'+kind+'-'+end+'.csv';
   document.body.append(anchor);anchor.click();anchor.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
   setNotice('Generic CSV downloaded. Confirm your payroll system\'s mapping and process it using your approved secure procedures.');
   setConfirmed(false);setPreview(null);
   setHistory(await json<ExportHistory[]>('/history'));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="payroll-workspace">
  <div className="hr-card"><FileSpreadsheet size={27}/><div>
   <div className="eyebrow small">CONTROLLED HR DATA PORTABILITY</div>
   <h3>Payroll handoff · Generic CSV</h3>
   <p>Export a minimal employee roster or approved leave dates, never salary, banking, identity numbers or medical notes. These files are not certified Sage imports. A human must verify the receiving system's mapping.</p>
  </div></div>
  {error&&<div className="notice error" role="alert">{error}</div>}
  {notice&&<div className="notice success"><CheckCircle2 size={16}/>{notice}</div>}
  {status&&!status.mfaEnabled&&<div className="notice error"><LockKeyhole size={16}/> Enable authenticator MFA under Privacy & access to unlock this HR export.</div>}
  <form className="modal-form payroll-form" onSubmit={inspect}>
   <label>Export dataset<select value={kind} onChange={e=>changeRange(()=>setKind(e.target.value as Kind))}>
    <option value="employee_roster">Employee roster as of end date</option>
    <option value="approved_leave">Approved leave overlapping date range</option>
   </select></label>
   <div className="hr-form-grid">
    <label>Period start<input type="date" required value={start} onChange={e=>changeRange(()=>setStart(e.target.value))}/></label>
    <label>Period end<input type="date" required min={start} value={end} onChange={e=>changeRange(()=>setEnd(e.target.value))}/></label>
   </div>
   <button className="outline-button" disabled={busy||status?.mfaEnabled!==true}><RefreshCcw size={15}/> {busy?'Checking…':'Preview row count'}</button>
  </form>
  {preview&&<div className="hr-card payroll-preview"><div>
    <div className="eyebrow small">HUMAN CHECKPOINT</div><h3>{preview.count} rows ready for review</h3>
    <p>{preview.periodStart} to {preview.periodEnd}. No file will be produced until an HR administrator explicitly confirms. {preview.warning}</p>
   </div>
   <label className="careers-consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I have reviewed the scope, lawful basis and authorized recipient. I understand this is a generic CSV, not an approved payroll calculation.</span></label>
   <button className="primary-button" onClick={()=>void download()} disabled={!confirmed||busy}><Download size={16}/> {busy?'Generating…':'Download audited CSV'}</button>
  </div>}
  <div className="hr-card"><div><div className="eyebrow small">EXPORT HISTORY</div><h3>Recent controlled exports</h3>
    <p>Only date, row count and SHA-256 file fingerprint are retained. The generated file contents are not stored in this ledger.</p>
   </div></div>
  {history.length?<div className="table-wrap"><table><thead><tr><th>DATASET</th><th>DATES</th><th>ROWS</th><th>CREATED</th></tr></thead>
   <tbody>{history.map(entry=><tr key={entry.id}>
    <td>{entry.export_kind.replaceAll('_',' ')}</td><td>{entry.period_start.slice(0,10)} to {entry.period_end.slice(0,10)}</td>
    <td>{entry.record_count}</td><td>{new Date(entry.created_at).toLocaleDateString('en-ZA')}</td>
   </tr>)}</tbody></table></div>:<div className="hr-empty">No exports recorded for this organization.</div>}
 </section>;
}
