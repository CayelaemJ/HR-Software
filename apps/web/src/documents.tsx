import {useEffect,useState,type FormEvent} from 'react';
import {Download,FileUp,FileWarning,Trash2} from 'lucide-react';

type Extracted={status:'text_available'|'ocr_required';pages:{page:number;text:string}[];truncated:boolean;verified:boolean;notice:string};
type DocumentMeta={id:string;candidate_id:string;original_name:string;media_type:string;byte_length:number;sha256_hex:string;created_at:string;expires_at:string};
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
 const [consent,setConsent]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 async function reload(){
  try{setFiles(await request<DocumentMeta[]>('/candidates/'+candidateId));}
  catch(e){setError((e as Error).message);}
 }
 useEffect(()=>{setExtraction(null);void reload();},[candidateId]);
 async function upload(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!file||!consent)return;
  const isPdf=file.name.toLowerCase().endsWith('.pdf');
  const isDocx=file.name.toLowerCase().endsWith('.docx');
  if(file.size>1048576||file.size<32||!isPdf&&!isDocx){setError('Upload a PDF or DOCX of at most 1 MiB.');return;}
  setBusy(true);setError('');setNote('');
  try{
   await request('/upload',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({candidateId,originalName:file.name,mediaType:isPdf?'application/pdf':TYPE_DOCX,
       base64:await encode(file),consentConfirmed:true})});
   setFile(null);setConsent(false);setNote('CV saved privately; only authorized recruitment staff can retrieve it.');
   await reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function extract(item:DocumentMeta){
  setBusy(true);setError('');setExtraction(null);
  try{const result=await request<Extracted>('/'+item.id+'/extract',{method:'POST'});
   setExtraction({documentId:item.id,result});setNote('Document text extracted for human review; no hiring decision was made.');
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
   <p className="recruitment-help"><FileWarning size={15}/> Pilot storage: max 1 MiB per PDF or DOCX, 180-day retention window. No virus scanning or identity verification. Optional text extraction works on text-based PDFs and DOCX; scanned CVs still require OCR and must not be rejected for their format. Do not upload sensitive records without lawful consent.</p>
   {error&&<div className="notice error" role="alert">{error}</div>}
   {note&&<div className="notice success">{note}</div>}
   {files.length?<div className="recruitment-items">{files.map(item=><div className="document-item" key={item.id}>
     <div><strong>{item.original_name}</strong><small>{(item.byte_length/1024).toFixed(1)} KiB · {new Date(item.created_at).toLocaleDateString('en-ZA')} · expires {new Date(item.expires_at).toLocaleDateString('en-ZA')}</small></div>
     <div className="recruitment-controls"><button disabled={busy} onClick={()=>download(item)} title="Download original document"><Download size={15}/> Download</button><button disabled={busy} onClick={()=>void extract(item)}>Extract text</button>{canEdit&&<button disabled={busy} onClick={()=>remove(item)} title="Delete stored document"><Trash2 size={15}/></button>}</div>
   </div>)}</div>:<p className="recruitment-help">No CV files stored for this candidate.</p>}
   {extraction&&<article className="hr-card" aria-label="Extracted unverified CV text">
     <h3>CV text — human verification required</h3><p className="recruitment-help">{extraction.result.notice}</p>
     {extraction.result.status==='ocr_required'?<p>This document requires OCR or an accessible replacement. Do not penalize the applicant for format.</p>:
     extraction.result.pages.map(page=><section key={page.page}><h4>Source page {page.page}</h4>
       <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:'12px'}}>{page.text}</pre></section>)}
     {extraction.result.truncated&&<p className="recruitment-help">Preview truncated at the safe processing limit.</p>}
   </article>}
   {canEdit&&<form onSubmit={upload} className="modal-form document-form">
     <label>Upload a PDF or DOCX<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
     <label className="careers-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>I confirm the candidate has authorized secure storage of this CV for recruitment review.</span></label>
     <button className="primary-button" disabled={busy||!file||!consent}><FileUp size={16}/>{busy?'Uploading…':'Store CV securely'}</button>
   </form>}
 </section>;
}
