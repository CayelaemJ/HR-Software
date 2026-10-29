import {Container} from "@cloudflare/containers";
import {env as bindings} from "cloudflare:workers";
import {canRunCaboHr} from "./gate.mjs";
export class CaboHrContainer extends Container{
 defaultPort=3000;
 sleepAfter="20m";
 envVars={
  NODE_ENV:"production",PORT:"3000",CABO_CLOUDFLARE_CONTAINER:"true",
  DATABASE_URL:bindings.DATABASE_URL,
  SESSION_SECRET:bindings.SESSION_SECRET,
  CABO_PUBLIC_ORIGIN:"https://"+bindings.CABO_HR_CANONICAL_HOST,
  TRUST_PROXY_HOPS:"1",
  GROQ_API_KEY:bindings.GROQ_API_KEY,
  CABO_RETENTION_SCHEDULER_VERIFIED:bindings.CABO_HR_RETENTION_VERIFIED
 };
}
const headers={"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
export default {async fetch(request,env){
 const url=new URL(request.url);
 const gate=canRunCaboHr(env,url.hostname);
 if(url.pathname==="/__migration/status")
  return new Response(JSON.stringify({product:"CABO Human Capital",fullStackReady:gate.ready,production:false}),{headers});
 if(!gate.ready)return new Response(JSON.stringify({error:"CABO HR full stack is not enabled"}),{status:503,headers});
 try{return await env.CABO_HR_APP.getByName("primary-hr").fetch(request);}
 catch{return new Response(JSON.stringify({error:"CABO HR application unavailable"}),{status:503,headers});}
}};
