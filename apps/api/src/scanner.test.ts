import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {scanWithClamAV,trustedScannerHost} from './scanner.js';

test('only trusted local/private scanner targets are permitted',()=>{
 assert.equal(trustedScannerHost('127.0.0.1'),true);
 assert.equal(trustedScannerHost('clamav.internal'),true);
 assert.equal(trustedScannerHost('10.4.2.1'),true);
 assert.equal(trustedScannerHost('172.16.0.5'),true);
 assert.equal(trustedScannerHost('192.168.1.20'),true);
 assert.equal(trustedScannerHost('8.8.8.8'),false);
 assert.equal(trustedScannerHost('scan.example.com'),false);
});

async function mockClamd(reply:string) {
 const bytes=Buffer.from('%PDF-1.7\nMock scanning document '+'.'.repeat(40));
 const server=createServer(socket=>{
  let input:Buffer<ArrayBufferLike>=Buffer.alloc(0),completed=false;
  socket.on('data',chunk=>{
   if(completed)return;
   input=Buffer.concat([input,chunk]);
   if(input.length<14)return;
   assert.equal(input.subarray(0,10).toString(),'zINSTREAM\0');
   const count=input.readUInt32BE(10);
   if(input.length<14+count+4)return;
   assert.equal(count,bytes.length);
   assert.deepEqual(input.subarray(14,14+count),bytes);
   assert.equal(input.readUInt32BE(14+count),0);
   completed=true;
   socket.end(reply);
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 if(!address||typeof address==='string')throw Error('Expected ephemeral TCP port');
 return {bytes,port:address.port,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}

test('ClamAV INSTREAM clean response marks file clean',async()=>{
 const mock=await mockClamd('stream: OK\0');
 try{
  assert.deepEqual(await scanWithClamAV(mock.bytes,{host:'127.0.0.1',port:mock.port,timeoutMs:3000}),
    {status:'clean',engine:'clamav-instream'});
 }finally{await mock.close();}
});
test('ClamAV INSTREAM FOUND response rejects file',async()=>{
 const mock=await mockClamd('stream: Eicar-Test-Signature FOUND\0');
 try{
  assert.deepEqual(await scanWithClamAV(mock.bytes,{host:'127.0.0.1',port:mock.port,timeoutMs:3000}),
    {status:'infected',engine:'clamav-instream'});
 }finally{await mock.close();}
});
test('No configured scanner quarantines rather than trusting unscanned CVs',async()=>{
 const bytes=Buffer.from('sample');
 assert.deepEqual(await scanWithClamAV(bytes,{host:undefined}),
   {status:'pending',engine:null});
 const invalid=await scanWithClamAV(bytes,{host:'clamav.evil.com',port:3310});
 assert.equal(invalid.status,'scan_error');
});
test('ClamAV error does not become a clean result',async()=>{
 const mock=await mockClamd('stream: INSTREAM size limit exceeded. ERROR\0');
 try{assert.equal((await scanWithClamAV(mock.bytes,{host:'127.0.0.1',port:mock.port,timeoutMs:3000})).status,'scan_error');}
 finally{await mock.close();}
});
