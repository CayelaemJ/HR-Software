import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCvEvidence,assertGroundedExcerpts,scrubObviousIdentifiers} from './cv-ai.js';
const valid={
 roleRelevantEvidence:[{criterion:'ETL experience',documentExcerpt:'Created reporting ETL workflows',
 interpretation:'The applicant reports building data workflows.'}],
 transferableSkills:['Reporting and data transformation projects'],
 missingOrUnclearEvidence:['No independent credential confirmation exists'],
 humanVerificationQuestions:['Can the candidate demonstrate a pipeline they built?'],
 limitations:['This is unverified candidate-supplied material']
};
test('accepts bounded non-decisional output schema',()=>{
 assert.equal(parseCvEvidence(valid).roleRelevantEvidence.length,1);
 assert.throws(()=>parseCvEvidence({...valid,decision:'hire'}));
 assert.throws(()=>parseCvEvidence({...valid,score:98}));
});
test('every quoted excerpt must appear in actual extracted text',()=>{
 assert.doesNotThrow(()=>assertGroundedExcerpts(valid,'Worked in finance. Created reporting ETL workflows at work.'));
 assert.throws(()=>assertGroundedExcerpts(valid,'I like dashboards, but have never built an ETL workflow.'));
});
test('obvious direct personal identifiers are redacted before provider call',()=>{
 assert.equal(scrubObviousIdentifiers('ID: 9001011234088, email: abc@example.co.za, phone: 0821234567')
  .includes('abc@example.co.za'),false);
 assert.match(scrubObviousIdentifiers('ID 9001011234088'),/identifier withheld/);
});
