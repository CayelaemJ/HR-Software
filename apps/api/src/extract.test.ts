import test from 'node:test';
import assert from 'node:assert/strict';
import {extractTextSafely} from './extract.js';

function pdfWithText(text:string):Buffer{
 const stream='BT /F1 14 Tf 72 720 Td ('+text+') Tj ET';
 const items=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'
 ];
 let raw='%PDF-1.4\n';
 const offsets=[0];
 for(let i=0;i<items.length;i++){
  offsets.push(Buffer.byteLength(raw));
  raw+=(i+1)+' 0 obj\n'+items[i]+'\nendobj\n';
 }
 const start=Buffer.byteLength(raw);
 raw+='xref\n0 '+(items.length+1)+'\n0000000000 65535 f \n';
 for(const off of offsets.slice(1))raw+=String(off).padStart(10,'0')+' 00000 n \n';
 raw+='trailer\n<< /Size '+(items.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
 return Buffer.from(raw,'utf8');
}
test('rejects unsupported formats and invalid tiny inputs',async()=>{
 await assert.rejects(()=>extractTextSafely(Buffer.alloc(10),'application/pdf'));
 await assert.rejects(()=>extractTextSafely(Buffer.alloc(80),'text/plain'));
});
test('extracts text from a representative text PDF in a bounded worker',async()=>{
 const result=await extractTextSafely(pdfWithText('Experienced data engineer delivering reliable analytical reports'),'application/pdf');
 assert.equal(result.status,'text_available');
 assert.match(result.pages[0].text,/data engineer/);
 assert.equal(result.truncated,false);
});
