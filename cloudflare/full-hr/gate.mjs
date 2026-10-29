export function canRunCaboHr(env={},host=""){
 const issues=[];
 if(env.CABO_HR_FULL_APP_ENABLED!=="true")issues.push("App disabled");
 if(!env.CABO_HR_CANONICAL_HOST||env.CABO_HR_CANONICAL_HOST!==host||
  !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host))issues.push("Hostname unverified");
 for(const key of ["CABO_HR_AUTH_E2E_VERIFIED","CABO_HR_RLS_TENANT_VERIFIED",
 "CABO_HR_RETENTION_VERIFIED","CABO_HR_MFA_VERIFIED","CABO_HR_ROLLBACK_VERIFIED"]){
  if(env[key]!=="true")issues.push(key+" not verified");
 }
 if(!env.DATABASE_URL||typeof env.SESSION_SECRET!=="string"||env.SESSION_SECRET.length<32)issues.push("Server secrets not scoped");
 return {ready:issues.length===0,issues};
}
