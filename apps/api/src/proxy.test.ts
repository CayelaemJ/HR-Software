import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { trustedProxyHops } from './proxy.js';

test('does not trust forwarded headers by default', () => {
  assert.equal(trustedProxyHops(undefined), false);
  assert.equal(trustedProxyHops(''), false);
});
test('explicit single-proxy configuration is supported', () => {
  assert.equal(trustedProxyHops('1'), 1);
});
test('rejects ambiguous or excessive trusted hop counts', () => {
  for (const value of ['0', '2', 'true', 'yes', '-1', '*']) {
    assert.equal(trustedProxyHops(value), false);
  }
});
