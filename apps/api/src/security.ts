import { createHmac, timingSafeEqual } from 'node:crypto';

type Session = { userId: string; tenantId: string; exp: number; version: number };
const secret = process.env.SESSION_SECRET ?? '';

export function ensureSecurityConfigured(): void {
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
}

function signature(data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}
export function createSession(userId: string, tenantId: string, now = Date.now(), version = 0): string {
  ensureSecurityConfigured();
  const payload: Session = { userId, tenantId, exp: Math.floor(now / 1000) + 8 * 60 * 60, version };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return encoded + '.' + signature(encoded);
}
export function verifySession(cookie: unknown, now = Date.now()): Session | null {
  if (typeof cookie !== 'string' || cookie.length > 4096 || !secret) return null;
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const [encoded, supplied] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]+$/.test(supplied)) return null;
  const expected = Buffer.from(signature(encoded));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (!data || typeof data !== 'object') return null;
    const s = data as Record<string, unknown>;
    if (typeof s.userId !== 'string' || typeof s.tenantId !== 'string' || typeof s.exp !== 'number') return null;
    if (!/^[0-9a-f-]{36}$/i.test(s.userId) || !/^[0-9a-f-]{36}$/i.test(s.tenantId)) return null;
    if (s.exp <= Math.floor(now / 1000)) return null;
    if (s.version === undefined) s.version = 0;
    if (typeof s.version !== 'number' || !Number.isSafeInteger(s.version) || s.version < 0) return null;
    return s as Session;
  } catch { return null; }
}
export function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
