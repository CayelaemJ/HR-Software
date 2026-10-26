import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
const pos = (fragment: string) => {
 const at=source.indexOf(fragment);
 assert.ok(at>=0, 'Missing security middleware: '+fragment);
 return at;
};

test('request throttling precedes JSON parsing and cookie handling',()=>{
 const global=pos("app.use('/api/', rateLimit(");
 const login=pos("app.use('/api/v1/auth/login', rateLimit(");
 const cvs=pos("app.use('/api/v1/cvs', express.json(");
 const json=pos("app.use(express.json(");
 const cookie=pos("app.use(cookieParser());");
 assert.ok(global<cvs && global<json && global<cookie);
 assert.ok(login<cvs && login<json && login<cookie);
});

test('credential endpoint retains stricter per-login budget',()=>{
 assert.match(source, /app\.use\('\/api\/v1\/auth\/login', rateLimit\(\{ windowMs: 15 \* 60_000, limit: 12/);
});
