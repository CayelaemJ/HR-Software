import {test} from 'node:test';
import {strict as assert} from 'node:assert';
process.env.SESSION_SECRET='cabo-ci-mfa-encryption-key-not-for-real-use-at-all';
const {encodeBase32,decodeBase32,totpCode,verifyTotp,encryptSecret,decryptSecret,newRecoveryCodes,recoveryIndex,newTotpSecret}=await import('./totp.js');
test('RFC 6238 SHA1 TOTP vector and replay rejection',()=>{
 const raw=Buffer.from('12345678901234567890','utf8'),secret=encodeBase32(raw);
 assert.deepEqual(decodeBase32(secret),raw);
 assert.equal(totpCode(raw,1),'287082');
 assert.equal(verifyTotp(secret,'287082',59000),1);
 assert.equal(verifyTotp(secret,'287082',59000,1),null);
 assert.equal(verifyTotp(secret,'not-an-otp',59000),null);
});
test('TOTP secrets use authenticated encryption and random per-record IV',()=>{
 const secret=newTotpSecret(),c1=encryptSecret(secret),c2=encryptSecret(secret);
 assert.notEqual(c1,c2);assert.equal(decryptSecret(c1),secret);
 assert.equal(decryptSecret(c2),secret);
 assert.throws(()=>decryptSecret(c1.slice(0,-4)+'AAAA'));
});
test('recovery codes are one-time style hashes, not stored as cleartext',()=>{
 const {codes,hashes}=newRecoveryCodes();
 assert.equal(codes.length,6);assert.equal(hashes.length,6);
 assert.equal(recoveryIndex(hashes,codes[2]),2);
 assert.equal(recoveryIndex(hashes,'INVALID'),-1);
 assert.equal(hashes.some(x=>codes.includes(x)),false);
 assert.equal(recoveryIndex(hashes.filter((_,i)=>i!==2),codes[2]),-1);
});
