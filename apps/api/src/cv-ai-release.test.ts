import test from 'node:test';
import assert from 'node:assert/strict';
import {externalCvAiEnabled} from './cv-ai-router.js';

test('external CV AI release gate fails closed',()=>{
 for(const setting of [undefined,'','false','TRUE','1','yes',' true ']){
  assert.equal(externalCvAiEnabled(setting),false);
 }
 assert.equal(externalCvAiEnabled('true'),true);
});
