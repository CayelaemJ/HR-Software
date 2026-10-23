import {Worker} from 'node:worker_threads';
export type Extraction={status:'text_available'|'ocr_required';pages:{page:number;text:string}[];truncated:boolean};
const MAX_FILE=1_048_576;
export async function extractTextSafely(bytes:Buffer,mediaType:string):Promise<Extraction>{
 if(bytes.length<32||bytes.length>MAX_FILE)throw Error('CV document exceeds extraction limits');
 if(!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mediaType))
  throw Error('Unsupported document type');
 const worker=new Worker(new URL('./extraction-worker.js',import.meta.url),{
  workerData:{bytes:new Uint8Array(bytes),mediaType},
  resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16,stackSizeMb:4}
 });
 return new Promise<Extraction>((resolve,reject)=>{
  let settled=false;
  const complete=(callback:()=>void)=>{
   if(settled)return;
   settled=true;clearTimeout(deadline);worker.removeAllListeners();
   void worker.terminate();callback();
  };
  const deadline=setTimeout(()=>complete(()=>reject(Error('Text extraction timed out'))),8000);
  worker.on('message',(payload:unknown)=>{
   const p=payload as {ok?:boolean;data?:Extraction;error?:string};
   if(p?.ok && p.data && Array.isArray(p.data.pages))complete(()=>resolve(p.data!));
   else complete(()=>reject(Error('Unable to extract document text')));
  });
  worker.on('error',()=>complete(()=>reject(Error('Document processing failed'))));
  worker.on('exit',code=>{if(code!==0)complete(()=>reject(Error('Document parser exited unexpectedly')));});
 });
}
