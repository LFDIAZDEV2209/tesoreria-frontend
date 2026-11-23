import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {api,manifest,persist,save,allRows,cents} from './gpqa-phase2-lib.mjs';
const movement=13363;
const fixture=await readFile(new URL('./fixtures/gpqa-legalizacion.pdf',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function uploadOnce(label,value,filename){
 const existing=manifest.uploads.find(x=>x.label===label);
 if(existing){assert.ok(existing.result,'Pending/ambiguous upload: no automatic retry');return existing.result;}
 assert.ok(manifest.uploads.length<2,'Hard limit: 2 multipart attempts');
 const entry={label,value,filename,movement,bucket:'demo-s3-bucket',folder:`anticipos/legalizaciones/91/${movement}/`,startedAt:new Date().toISOString()};manifest.uploads.push(entry);await persist();
 const form=new FormData();form.set('empresaId','91');form.set('movimientoId',String(movement));form.set('valorLegalizado',String(value));form.set('observacion','GPQA-008 P7 QA-ONLY synthetic row '+label);form.set('archivo',new Blob([fixture],{type:'application/pdf'}),filename);
 const r=await api('/api/gp/anticipos/legalizaciones',{method:'POST',form});entry.result=r;await persist();return r;
}
test('P7 real PDF upload listing and presigned bytes, no retries',{timeout:120000},async t=>{
 const evidence={movement,sha256:hash(fixture),bytes:fixture.length,checks:[]};
 const rows=await allRows('/api/gp/anticipos/?empresaId=91&vistaMes=true&periodoConsulta=2026-09');
 const before=rows.find(x=>x.id===movement);assert.ok(before);assert.equal(before.nit,'GPQA008P7');
 try{
  const upload=await uploadOnce('valid',123.45,'GPQA-P7-20261015-1.pdf');evidence.upload=upload;
  await t.test('PDF upload HTTP 200',()=>assert.equal(upload.status,200,JSON.stringify(upload.body)));
  const listing=await api(`/api/gp/anticipos/legalizaciones?empresaId=91&movimientoIds=${movement}`);evidence.listing=listing;assert.equal(listing.status,200);
  if(upload.status===200){
   await t.test('Listing and actual S3 GET match fixture',async()=>{
    const item=listing.body.find(x=>x.id===upload.body.id);assert.ok(item);assert.equal(item.archivoNombre,'GPQA-P7-20261015-1.pdf');assert.equal(item.periodo,'2026-09');assert.equal(item.creadoPor,'gpqa.contador');assert.equal(item.archivoBytes,fixture.length);
    const signed=await api(`/api/gp/anticipos/legalizaciones/${item.id}/archivo?empresaId=91`);assert.equal(signed.status,200);
    const url=new URL(signed.body.url);const key=decodeURIComponent(url.pathname.slice(1));assert.ok(key.startsWith(`anticipos/legalizaciones/91/${movement}/`));
    evidence.storage={bucket:url.hostname.split('.s3')[0],key,host:url.hostname,legalizacionId:item.id};manifest.uploads.find(x=>x.label==='valid').storage=evidence.storage;await persist();
    const r=await fetch(url,{signal:AbortSignal.timeout(30000)});const bytes=Buffer.from(await r.arrayBuffer());evidence.download={status:r.status,type:r.headers.get('content-type'),bytes:bytes.length,sha256:hash(bytes)};
    assert.equal(r.status,200);assert.equal(hash(bytes),hash(fixture));assert.equal(r.headers.get('content-type'),'application/pdf');
   });
  }
  const negative=await uploadOnce('negative',-1,'GPQA-P7-20261015-negative.pdf');evidence.negative=negative;
  await t.test('Negative value rejected before S3',()=>{assert.equal(negative.status,400);assert.match(JSON.stringify(negative.body),/negativo/i);});
  const after=await api(`/api/gp/anticipos/legalizaciones?empresaId=91&movimientoIds=${movement}`);assert.deepEqual(after.body,listing.body,'Negative value must not create a support');
  const afterRows=await allRows('/api/gp/anticipos/?empresaId=91&vistaMes=true&periodoConsulta=2026-09');assert.equal(cents(afterRows.find(x=>x.id===movement).saldo),cents(before.saldo));
 }finally{await save('P7',evidence);}
});
