import {useEffect,useState,type FormEvent} from 'react';
import {Download,FileUp,FileWarning,Trash2} from 'lucide-react';

type Extracted={status:'text_available'|'ocr_required';pages:{page:number;text:string}[];truncated:boolean;verified:boolean;notice:string};
type CvBrief={model:string;sourceTextTruncated:boolean;draft:{roleRelevantEvidence:{criterion:string;documentExcerpt:string;interpretation:string}[];transferableSkills:string[];missingOrUnclearEvidence:string[];humanVerificationQuestions:string[];limitations:string[]}};
type JobOption={id:string;title:string};
type DocumentMeta={id:string;candidate_id:string;original_name:string;media_type:string;byte_length:number;sha256_hex:string;scan_status:'pending'|'clean'|'infected'|'scan_error';scan_checked_at:string|null;created_at:string;expires_at:string};
const TYPE_DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function request<T>(path:string,options?:RequestInit):Promise<T>{
 const result=await fetch('/api/v1/cvs'+path,{credentials:'same-origin',...options});
 if(result.status===204)return undefined as T;
 const data=await result.json().catch(()=>({error:'Documents service unavailable'}));
 if(!result.ok)throw Error(data.error||'Unable to process document');
 return data as T;
}
async function encode(file:File){
 const buf=new Uint8Array(await file.arrayBuffer());
 let raw='';
 for(let i=0;i<buf.length;i+=8192)raw+=String.fromCharCode(...buf.subarray(i,i+8192));
 return btoa(raw);
}
export function CandidateDocuments({candidateId,canEdit}:{candidateId:string;canEdit:boolean}){
 const [files,setFiles]=useState<DocumentMeta[]>([]),[file,setFile]=useState<File|null>(null);
 const [extraction,setExtraction]=useState<{documentId:string;result:Extracted}|null>(null);
 const [jobs,setJobs]=useState<JobOption[]>([]),[jobId,setJobId]=useState(''),[ai,setAi]=useState<CvBrief|null>(null);
 const [consent,setConsent]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 async function reload(){
  try{setFiles(await request<DocumentMeta[]>('/candidates/'+candidateId));}
  catch(e){setError((e as Error).message);}
 }
 useEffect(()=>{setExtraction(null);setAi(null);void reload();},[candidateId]);
 useEffect(()=>{fetch('/api/v1/jobs',{credentials:'same-origin',cache:'no-store'})
 .then(r=>{if(!r.ok)throw Error('Unable to load vacancies');return r.json() as Promise<JobOption[]>;})
 .then(setJobs).catch(()=>setJobs([]));},[]);
 async function upload(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!file||!consent)return;
  const isPdf=file.name.toLowerCase().endsWith('.pdf');
  const isDocx=file.name.toLowerCase().endsWith('.docx');
  if(file.size>1048576||file.size<32||!isPdf&&!isDocx){setError('Upload a PDF or DOCX of at most 1 MiB.');return;}
  setBusy(true);setError('');setNote('');
  try{
   const uploaded=await request<DocumentMeta>('/upload',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({candidateId,originalName:file.name,mediaType:isPdf?'application/pdf':TYPE_DOCX,
       base64:await encode(file),consentConfirmed:true})});
   setFile(null);setConsent(false);
   setNote(uploaded.scan_status==='clean'?'CV scanned and cleared for human review.':
     'CV quarantined. Downloads and extraction are disabled until malware scanning succeeds.');
   await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function extract(item:DocumentMeta){
  setBusy(true);setError('');setExtraction(null);
  try{const result=await request<Extracted>('/'+item.id+'/extract',{method:'POST'});
   setExtraction({documentId:item.id,result});setNote('Document text extracted for human review; no hiring decision was made.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function scan(item:DocumentMeta){
  setBusy(true);setError('');setExtraction(null);
  try{
    const result=await request<{status:string;deleted:boolean}>('/'+item.id+'/scan',{method:'POST'});
    setNote(result.status==='clean'?'Malware scan clear. Document is available for human review.':
      result.deleted?'Malware detected. The unsafe file was deleted.':
      'Scan pending or unavailable. The CV remains quarantined.');
    await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function analyze(item:DocumentMeta){
  if(!jobId){setError('Select a vacancy first.');return;}
  if(!window.confirm('Send text from a cleared CV and role requirements to the configured external AI provider? Confirm lawful processing authorization first. The AI will not make an employment decision.'))return;
  setBusy(true);setError('');setAi(null);
  try{
   const response=await fetch('/api/v1/ai/cv/evidence',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId,documentId:item.id,confirmExternalProcessing:true})});
   const body=await response.json().catch(()=>({error:'AI service unavailable'}));
   if(!response.ok)throw Error(body.error||'Evidence draft unavailable');
   setAi(body as CvBrief);setNote('Unverified role evidence generated for human review.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function download(item:DocumentMeta){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/v1/cvs/'+item.id+'/download',{credentials:'same-origin'});
   if(!response.ok)throw Error((await response.json()).error||'Download failed');
   const objectUrl=URL.createObjectURL(await response.blob());
   const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=item.original_name;
   document.body.append(anchor);anchor.click();anchor.remove();
   window.setTimeout(()=>URL.revokeObjectURL(objectUrl),60_000);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(item:DocumentMeta){
  if(!window.confirm('Delete this candidate document permanently? The deletion is audited.'))return;
  setBusy(true);setError('');
  try{await request('/'+item.id,{method:'DELETE'});await reload();setNote('Document deleted.');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="document-vault">
   <div className="recruitment-list-header"><strong>Private CV documents</strong><small>{files.length}/5 attachments</small></div>
   <p className="recruitment-help"><FileWarning size={15}/> Pilot storage: max 1 MiB per PDF or DOCX and 180-day retention. Every upload is quarantined until it passes a configured ClamAV scan. Without a scanner, files remain unavailable for download or extraction. A clean scan does not independently verify identity or qualifications. Text extraction is for human review only; scanned CVs may still need OCR.</p>
   {error&&<div className="notice error" role="alert">{error}</div>}
   {note&&<div className="notice success">{note}</div>}
   <label>Vacancy for evidence review<select value={jobId} onChange={e=>{setJobId(e.target.value);setAi(null);}}>
     <option value="">Select vacancy</option>{jobs.map(j=><option value={j.id} key={j.id}>{j.title}</option>)}
   </select></label>
   <p className="recruitment-help">Only documents for applicants to the selected role can be analyzed. No automatic hiring decision is made.</p>
   {files.length?<div className="recruitment-items">{files.map(item=><div className="document-item" key={item.id}>
     <div><strong>{item.original_name}</strong><small>{(item.byte_length/1024).toFixed(1)} KiB · {new Date(item.created_at).toLocaleDateString('en-ZA')} · expires {new Date(item.expires_at).toLocaleDateString('en-ZA')} · scan: <strong>{item.scan_status.replaceAll('_',' ')}</strong></small></div>
     <div className="recruitment-controls"><button disabled={busy||item.scan_status!=='clean'} onClick={()=>download(item)} title="Download scanned document"><Download size={15}/> Download</button>
       <button disabled={busy||item.scan_status!=='clean'} onClick={()=>void extract(item)}>Extract text</button>
       <button disabled={busy||!jobId||item.scan_status!=='clean'} onClick={()=>void analyze(item)}>Draft AI evidence</button>
       {item.scan_status!=='clean'&&<button disabled={busy} onClick={()=>void scan(item)}>Scan again</button>}{canEdit&&<button disabled={busy} onClick={()=>remove(item)} title="Delete stored document"><Trash2 size={15}/></button>}</div>
   </div>)}</div>:<p className="recruitment-help">No CV files stored for this candidate.</p>}
   {extraction&&<article className="hr-card" aria-label="Extracted unverified CV text">
     <h3>CV text — human verification required</h3><p className="recruitment-help">{extraction.result.notice}</p>
     {extraction.result.status==='ocr_required'?<p>This document requires OCR or an accessible replacement. Do not penalize the applicant for format.</p>:
     extraction.result.pages.map(page=><section key={page.page}><h4>Source page {page.page}</h4>
       <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:'12px'}}>{page.text}</pre></section>)}
     {extraction.result.truncated&&<p className="recruitment-help">Preview truncated at the safe processing limit.</p>}
   </article>}
   {ai&&<article className="hr-card" aria-label="Unverified AI CV evidence">
     <h3>Unverified AI evidence — human assessment required</h3>
     {ai.draft.roleRelevantEvidence.map((x,i)=><section key={i}><h4>{x.criterion}</h4><blockquote>{x.documentExcerpt}</blockquote><p>{x.interpretation}</p></section>)}
     <h4>Transferable skills</h4><ul>{ai.draft.transferableSkills.map((x,i)=><li key={i}>{x}</li>)}</ul>
     <h4>Evidence gaps</h4><ul>{ai.draft.missingOrUnclearEvidence.map((x,i)=><li key={i}>{x}</li>)}</ul>
     <h4>Questions for human review</h4><ul>{ai.draft.humanVerificationQuestions.map((x,i)=><li key={i}>{x}</li>)}</ul>
     <h4>Limitations</h4><ul>{ai.draft.limitations.map((x,i)=><li key={i}>{x}</li>)}</ul>
     {ai.sourceTextTruncated&&<p className="recruitment-help">The submitted evidence was truncated to the processing limit.</p>}
   </article>}
   {canEdit&&<form onSubmit={upload} className="modal-form document-form">
     <label>Upload a PDF or DOCX<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
     <label className="careers-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>I confirm the candidate has authorized secure storage of this CV for recruitment review.</span></label>
     <button className="primary-button" disabled={busy||!file||!consent}><FileUp size={16}/>{busy?'Uploading…':'Store CV securely'}</button>
   </form>}
 </section>;
}
