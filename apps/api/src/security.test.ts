import { test } from 'node:test';
import { strict as assert } from 'node:assert';
process.env.SESSION_SECRET = 'test-secret-for-cabo-human-capital-at-least-32-characters';
const { createSession,verifySession,constantTimeEqual } = await import('./security.js');
const u = 'ed204891-f4c3-4c9d-85de-1e1d456dfa77';
const t = 'c7b81ba9-a92c-4300-b79f-e100887a8498';
test('signed sessions verify and expire',()=>{
  const now=1700000000000;
  const token=createSession(u,t,now);
  assert.equal(verifySession(token,now)?.tenantId,t);
  assert.equal(verifySession(token,now+9*60*60*1000),null);
});
test('tampered sessions are rejected',()=>{
  const token=createSession(u,t);
  assert.equal(verifySession(token.slice(0,-2)+'xx'),null);
  assert.equal(verifySession('nonsense'),null);
});
test('secrets compare without bypasses',()=>{
  assert.equal(constantTimeEqual('abc','abc'),true);
  assert.equal(constantTimeEqual('abc','abd'),false);
});
