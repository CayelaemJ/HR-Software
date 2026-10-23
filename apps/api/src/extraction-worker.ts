import {parentPort,workerData} from 'node:worker_threads';
import mammoth from 'mammoth';

type Job={mediaType:string;bytes:Uint8Array};
type Page={page:number;text:string};
const MAX_CHARS=30000,MAX_PAGES=30;
async function extract(job:Job){
 const bytes=Buffer.from(job.bytes);
 const pages:Page[]=[];
 let used=0,truncated=false;
 if(job.mediaType==='application/pdf'){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false});
  const pdf=await task.promise;
  try{
   for(let n=1;n<=Math.min(MAX_PAGES,pdf.numPages);n++){
    const page=await pdf.getPage(n);
    const content=await page.getTextContent();
    const text=content.items.map(item=>'str' in item?item.str:'').join(' ').replace(/\s+/g,' ').trim();
    const remaining=MAX_CHARS-used;
    if(remaining<=0){truncated=true;break;}
    pages.push({page:n,text:text.slice(0,remaining)});
    used+=text.length;
    if(text.length>remaining){truncated=true;break;}
   }
   if(pdf.numPages>MAX_PAGES)truncated=true;
  }finally{await pdf.destroy();}
 }else if(job.mediaType==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
  const result=await mammoth.extractRawText({buffer:bytes});
  const text=result.value.replace(/\0/g,'').trim();
  pages.push({page:1,text:text.slice(0,MAX_CHARS)});
  truncated=text.length>MAX_CHARS;
 }else throw Error('Unsupported document');
 const hasText=pages.some(p=>p.text.trim().length>=30);
 return {status:hasText?'text_available':'ocr_required',pages:hasText?pages:[],truncated};
}
extract(workerData as Job).then(data=>parentPort?.postMessage({ok:true,data}))
 .catch(()=>parentPort?.postMessage({ok:false,error:'Document text extraction could not be completed'}));
