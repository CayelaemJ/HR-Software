import {randomBytes,createCipheriv,createDecipheriv,createHmac,timingSafeEqual} from 'node:crypto';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encryptionKey(){
 const secret=process.env.SESSION_SECRET||'';
 if(secret.length<32)throw Error('MFA encryption secret not configured');
 return createHmac('sha256',Buffer.from(secret,'utf8')).update('CABO-HC-MFA-ENCRYPTION-v1').digest();
}
export function encodeBase32(bytes:Uint8Array){
 let value=0,bits=0,output='';
 for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){output+=alphabet[(value>>>(bits-=5))&31];}}
 if(bits>0)output+=alphabet[(value<<(5-bits))&31];
 return output;
}
export function decodeBase32(text:string){
 let value=0,bits=0;
 const bytes:number[]=[];
 for(const c of text.toUpperCase().replace(/=+$/,'')){
  const pos=alphabet.indexOf(c);
  if(pos<0)throw Error('Invalid Base32 secret');
  value=(value<<5)|pos;bits+=5;
  if(bits>=8){bytes.push((value>>>(bits-=8))&255);value&=(1<<bits)-1;}
 }
 return Buffer.from(bytes);
}
export function newTotpSecret(){return encodeBase32(randomBytes(20));}
export function totpCode(secret:Uint8Array,step:number){
 const counter=Buffer.alloc(8);
 counter.writeBigUInt64BE(BigInt(step));
 const mac=createHmac('sha1',secret).update(counter).digest();
 const offset=mac[mac.length-1]&15;
 const result=(mac.readUInt32BE(offset)&0x7fffffff)%1000000;
 return String(result).padStart(6,'0');
}
export function verifyTotp(base32:string,code:string,now=Date.now(),lastStep=-1):number|null{
 if(!/^\d{6}$/.test(code))return null;
 const current=Math.floor(now/30000);
 const secret=decodeBase32(base32);
 for(let step=current-1;step<=current+1;step++){
  if(step<=lastStep||step<0)continue;
  const expected=Buffer.from(totpCode(secret,step));
  if(timingSafeEqual(expected,Buffer.from(code)))return step;
 }
 return null;
}
export function encryptSecret(cleartext:string){
 const iv=randomBytes(12),key=encryptionKey();
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(cleartext,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}
export function decryptSecret(record:string){
 const [version,iv,tag,ciphertext]=record.split('.');
 if(version!=='v1'||!iv||!tag||!ciphertext)throw Error('Unrecognized MFA secret record');
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));
 decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
function normalizeRecovery(code:string){return code.replace(/[-\s]/g,'').trim().toUpperCase();}
export function recoveryDigest(code:string){
 return createHmac('sha256',encryptionKey()).update('recovery:'+normalizeRecovery(code)).digest('hex');
}
export function newRecoveryCodes(count=6){
 const codes=Array.from({length:count},()=>randomBytes(10).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'));
 return {codes,hashes:codes.map(recoveryDigest)};
}
export function recoveryIndex(hashes:string[],code:string){
 if(!/^[A-Fa-f0-9-]{20,30}$/.test(code))return -1;
 const wanted=Buffer.from(recoveryDigest(code),'hex');
 return hashes.findIndex(x=>{
  if(!/^[0-9a-f]{64}$/.test(x))return false;
  return timingSafeEqual(Buffer.from(x,'hex'),wanted);
 });
}
