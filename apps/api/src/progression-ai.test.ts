import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgressionBrief} from './progression-ai.js';
const valid={
 summary:'Documented role-specific evidence is insufficient to determine next steps without human evaluation.',
 documentedEvidence:['Written performance review confirms completed project milestones'],
 evidenceGaps:['Independent verification of leadership responsibilities is unavailable'],
 questionsForHumanReview:['Which published criteria are required for this career level?'],
 limitations:['Employee statements are not independently verified']
};
test('AI brief parser accepts structured evidence-only draft',()=>{
 const x=parseProgressionBrief(valid);assert.equal(x.documentedEvidence.length,1);
});
test('AI brief refuses underspecified unsupported output',()=>{
 assert.throws(()=>parseProgressionBrief({summary:'Recommended promotion',decision:'approve'}));
});
test('AI brief refuses malformed lists',()=>{
 assert.throws(()=>parseProgressionBrief({...valid,evidenceGaps:'none'}));
});
