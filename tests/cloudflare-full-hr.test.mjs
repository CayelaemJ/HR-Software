import test from "node:test";
import assert from "node:assert/strict";
import {canRunCaboHr} from "../cloudflare/full-hr/gate.mjs";
const all={CABO_HR_FULL_APP_ENABLED:"true",CABO_HR_CANONICAL_HOST:"hr.example.org",CABO_HR_AUTH_E2E_VERIFIED:"true",CABO_HR_RLS_TENANT_VERIFIED:"true",CABO_HR_RETENTION_VERIFIED:"true",CABO_HR_MFA_VERIFIED:"true",CABO_HR_ROLLBACK_VERIFIED:"true",DATABASE_URL:"synthetic-only",SESSION_SECRET:"z".repeat(32)};
test("CABO HR candidate is disabled unless all full-app gates pass",()=>{assert.equal(canRunCaboHr({},"hr.example.org").ready,false);assert.equal(canRunCaboHr(all,"hr.example.org").ready,true);for(const key of Object.keys(all)){const x={...all};delete x[key];assert.equal(canRunCaboHr(x,"hr.example.org").ready,false,key)}});
test("any other hostname and insufficient session secret fail",()=>{assert.equal(canRunCaboHr(all,"attacker.example.org").ready,false);assert.equal(canRunCaboHr({...all,SESSION_SECRET:"weak"},"hr.example.org").ready,false)});
