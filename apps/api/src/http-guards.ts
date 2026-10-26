import type {Request} from 'express';

export type BrowserRequestMetadata={
 method:string;origin?:string;referer?:string;fetchSite?:string;host?:string;protocol?:string;hasSessionCookie?:boolean;
};

/**
 * Applies browser-origin checks without misclassifying native Flutter clients,
 * which do not send browser Origin or Sec-Fetch-* headers.
 * Browser Fetch Metadata is set by the browser and cannot be overridden by JS.
 */
export function unsafeBrowserRequest(reason:BrowserRequestMetadata,publicOrigin?:string):string|null{
 if(['GET','HEAD','OPTIONS'].includes(reason.method.toUpperCase()))return null;
 if(reason.fetchSite==='cross-site'||reason.fetchSite==='same-site')
  return 'Cross-site form and API writes are not allowed';
 const originHeader=reason.origin?.trim();
 const refererHeader=reason.referer?.trim();
 // Browser session cookies must not authorise a write that proves no origin.
 // Native signed-session clients without cookies can omit browser-only headers.
 if(reason.hasSessionCookie && !originHeader && !refererHeader)
  return 'Cookie-authenticated write requires same-origin evidence';
 if(reason.origin!==undefined && !originHeader)
  return 'Missing trusted Origin header';
 if(reason.referer!==undefined && !refererHeader)
  return 'Missing trusted Referer header';
 if(originHeader==='null')return 'Opaque web origins are not allowed';
 const expectedRaw=publicOrigin?.trim()||(
  reason.host&&reason.protocol?reason.protocol+'://'+reason.host:null
 );
 if(!expectedRaw) return originHeader||refererHeader?'Missing trusted application origin':null;
 let expected:URL;
 try{expected=new URL(expectedRaw);}
 catch{return 'Invalid configured application origin';}
 if(!['https:','http:'].includes(expected.protocol)||expected.username||expected.password)
  return 'Invalid configured application origin';
 if(originHeader){
  try {
   if(new URL(originHeader).origin!==expected.origin)
    return 'Origin does not match CABO application';
  }catch{return 'Malformed Origin header';}
 }
 if(refererHeader){
  try{
   if(new URL(refererHeader).origin!==expected.origin)
    return 'Referrer does not match CABO application';
  }catch{return 'Malformed Referer header';}
 }
 return null;
}
export function browserRequestMetadata(req:Request):BrowserRequestMetadata{
 return {
  method:req.method,
  origin:req.get('origin'),
  referer:req.get('referer'),
  fetchSite:req.get('sec-fetch-site'),
  host:req.get('host'),
  protocol:req.protocol,
  hasSessionCookie:/(?:^|;\s*)cabo_session=/.test(String(req.headers.cookie||''))
 };
}
export function protectedApiResponse(path:string):boolean{
 return path.startsWith('/api/')||path==='/api';
}
