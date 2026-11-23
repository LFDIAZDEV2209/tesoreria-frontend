import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {api,once,manifest,persist,save,load,browserSession,front,dir,allRows,cents} from './gpqa-phase2-lib.mjs';

// Run with GPQA_ARTIFACTS_DIR pointing to local artifacts/gpqa/phase3/.
assert.ok(dir.replaceAll('\\','/').endsWith('/phase3/'),'Use the isolated phase3 evidence/ledger directory');
manifest.phase3 ??= {};
const campaign=manifest.phase3;
const listPath='/api/gp/pagos-proyectados?empresaId=91&origen=manual';
async function seed(name){
 const state=await api('/api/gp/periodos/seleccion?empresaId=91');assert.equal(state.status,200);
 const period=state.body.periodoActivo;assert.match(period,/^\d{4}-\d{2}$/);
 const result=await once('phase3-create-'+name,'/api/gp/pagos-proyectados?empresaId=91',{method:'POST',body:{nombre:name,nit:name.replaceAll('-',''),categoria:'OTROS',modulo_origen:'manual',concepto:name+' proy.',monto_proyectado:1234.56,fecha_proyectada:period+'-15',notas:'QA-ONLY synthetic row; GPQA phase3'}});
 assert.equal(result.status,200);return result.body;
}
async function openPayment(page,p){
 await page.goto(front+'/presupuesto/otros-pagos?empresaId=91');
 const select=page.getByLabel('Mes de consulta',{exact:true});
 const option=select.locator(`option[value$="${p.fecha_proyectada.slice(0,7)}"]`);await option.waitFor({state:'attached'});
 await select.selectOption(await option.getAttribute('value'));
 await page.getByLabel('Buscar en Provisiones',{exact:true}).fill(p.nombre);
 await page.locator('.gp-payment-card').filter({hasText:p.nombre}).click();
 const detail=page.locator('.gp-payment-detail article');await detail.waitFor();return detail;
}
async function saveEdit(page,id){
 const response=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname.endsWith('/pagos-proyectados/'+id));
 await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await page.getByRole('heading',{name:'Confirmar cambios de la proyección',exact:true}).waitFor();
 await page.getByRole('button',{name:'Guardar cambios',exact:true}).last().click();return response;
}

test('Phase3 P8: contador edits/deletes in UI; approved race toast',{timeout:150000},async()=>browserSession('P3-P8',async({page,evidence})=>{
 const p=await seed('GPQA-P3-FIX01'),approved=await seed('GPQA-P3-FIX02');evidence.ids={editable:p.id,approved:approved.id};
 if(!campaign.deleted){
  let detail=await openPayment(page,p);
  assert.equal(await detail.getByRole('button',{name:'Editar',exact:true}).isEnabled(),true);
  assert.equal(await detail.getByRole('button',{name:'Eliminar',exact:true}).isEnabled(),true);
  await page.screenshot({path:dir+'P3-P8-editable.png',fullPage:true});
  await detail.getByRole('button',{name:'Editar',exact:true}).click();
  await page.locator('#gp-payment-form input[name=concepto]').fill('GPQA-P3-FIX01 edited UI');
  const edit=await saveEdit(page,p.id);evidence.edit={status:edit.status(),body:await edit.json()};assert.equal(edit.status(),200);
  assert.equal(cents(evidence.edit.body.monto_proyectado),123456n);
  detail=await openPayment(page,p);await detail.getByRole('button',{name:'Eliminar',exact:true}).click();
  await page.getByRole('heading',{name:'Eliminar pago',exact:true}).waitFor();
  await page.screenshot({path:dir+'P3-P8-delete-confirm.png',fullPage:true});
  const deleted=page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname.endsWith('/pagos-proyectados/'+p.id));
  await page.getByRole('button',{name:'Sí, eliminar',exact:true}).click();const r=await deleted;
  campaign.deleted={status:r.status(),body:await r.json(),at:new Date().toISOString()};await persist();assert.equal(r.status(),200);
  await page.locator('.gp-payment-card').filter({hasText:p.nombre}).waitFor({state:'hidden'});
  campaign.disappeared=true;await persist();await page.screenshot({path:dir+'P3-P8-deleted.png',fullPage:true});
 }
 evidence.deleted=campaign.deleted;assert.equal(campaign.deleted.status,200);assert.equal(campaign.disappeared,true);
 const rows=await allRows(listPath);assert.equal(rows.find(x=>x.id===p.id)?.estado,'cancelado');
 if(!campaign.conflict){
  const detail=await openPayment(page,approved);await detail.getByRole('button',{name:'Editar',exact:true}).click();
  await page.locator('#gp-payment-form input[name=concepto]').fill('GPQA-P3-FIX02 stale edit must fail');
  const a=await once('phase3-approve',`/api/gp/pagos-proyectados/${approved.id}/aprobar?empresaId=91`,{method:'PUT',user:'gpqa.gerencia',body:{aprobado:true}});assert.equal(a.status,200);
  const r=await saveEdit(page,approved.id);campaign.conflict={status:r.status(),body:await r.json()};await persist();
  assert.equal(r.status(),409);assert.equal(campaign.conflict.body.code,'PRESUPUESTO_CONFLICT');
  await page.getByText(campaign.conflict.body.message,{exact:true}).first().waitFor();
  campaign.toast=campaign.conflict.body.message;await persist();await page.screenshot({path:dir+'P3-P8-409-toast.png',fullPage:true});
 }
 evidence.conflict=campaign.conflict;evidence.toast=campaign.toast;assert.equal(campaign.conflict.status,409);assert.ok(campaign.toast);
 const detail=await openPayment(page,approved);assert.equal(await detail.getByRole('button',{name:'Editar',exact:true}).isDisabled(),true);
 assert.equal(await detail.getByRole('button',{name:'Eliminar',exact:true}).count(),0);
 const row=(await allRows(listPath)).find(x=>x.id===approved.id);assert.equal(row.concepto,approved.concepto);assert.equal(cents(row.monto_proyectado),123456n);
 evidence.approvedDisabled=true;
}));

for(const user of ['gpqa.contador','gpqa.gerencia'])test('Phase3 P10 history '+user,{timeout:90000},async()=>browserSession('P3-P10-'+user,async({page,evidence})=>{
 const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/presupuesto/auditoria'&&new URL(r.url()).searchParams.get('empresaId')==='91');
 await page.goto(front+'/presupuesto/historial?empresaId=91');
 const initial=await loaded;const all=await initial.json();evidence.initial={status:initial.status(),body:all};assert.equal(initial.status(),200);
 evidence.initial.rows=all.length;evidence.initial.actors=[...new Set(all.map(x=>x.usuarioNombre))];
 if(user==='gpqa.contador')assert.ok(all.every(x=>x.usuarioNombre===user),'Own history only');
 else{assert.ok(all.some(x=>x.usuarioNombre==='gpqa.contador'));assert.ok(all.some(x=>x.usuarioNombre==='gpqa.gerencia'));}
 const period=manifest.mutations['phase3-create-GPQA-P3-FIX01'].body.fecha_proyectada.slice(0,7);
 await page.locator('input[name=periodo]').fill(period);await page.locator('input[name=usuario]').fill('gpqa.contador');
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/presupuesto/auditoria'&&new URL(r.url()).searchParams.get('periodo')===period);
 await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();const r=await response;
 evidence.filtered={status:r.status(),url:r.url(),body:await r.json()};assert.equal(r.status(),200);
 assert.equal(new URL(r.url()).searchParams.get('usuario'),'gpqa.contador');
 const own=evidence.filtered.body.filter(x=>x.usuarioNombre==='gpqa.contador'&&x.detalle?.includes(period));
 assert.ok(own.some(x=>x.detalle?.includes('GPQA-P3-FIX01')));
 const table=page.getByRole('region',{name:'Historial de modificaciones'});await table.waitFor();
 await page.waitForFunction(n=>document.querySelectorAll('app-auditoria tbody tr').length===n,own.length);
 const cells=await table.locator('tbody tr').evaluateAll(es=>es.map(e=>[...e.querySelectorAll('td')].map(x=>x.textContent.trim())));
 assert.equal(cells.length,own.length);assert.ok(cells.some(x=>x[4].includes('GPQA-P3-FIX01')));
 assert.ok(cells.every(x=>x[1]==='gpqa.contador'&&x[3].includes(period)));evidence.uiRows=cells.length;
},user));

test('Phase3 P7 new UI: annul only id1, reason required, S3 retained',{timeout:120000},async()=>browserSession('P3-P7',async({page,evidence})=>{
 const path='/api/gp/anticipos/legalizaciones?empresaId=91&movimientoIds=13363';
 const before=await api(path,{user:'gpqa.gerencia'});assert.equal(before.status,200);
 const item=before.body.find(x=>x.id===1);assert.ok(item);assert.equal(item.archivoNombre,'GPQA-P7-20261015-1.pdf');evidence.before=item;
 const download=async()=>{
  const signed=await api('/api/gp/anticipos/legalizaciones/1/archivo?empresaId=91',{user:'gpqa.gerencia'});assert.equal(signed.status,200);
  const url=new URL(signed.body.url);const key=decodeURIComponent(url.pathname.slice(1));assert.equal(key,'anticipos/legalizaciones/91/13363/0eb74a38-f107-4ffa-bd82-bc9479bb268e');
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});const bytes=Buffer.from(await r.arrayBuffer());const hash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(r.status,200);assert.equal(hash,'280af55a48bf1edea7c5ec91f989003d2c298f748d3dd96ddf4d5c4d0544e3bb');return{status:r.status,bytes:bytes.length,sha256:hash,key,bucket:url.hostname.split('.s3')[0]};
 };
 evidence.s3Before=await download();
 await page.goto(front+'/presupuesto/anticipos?empresaId=91');
 const select=page.getByLabel('Mes de consulta',{exact:true});const option=select.locator('option[value$="2026-09"]');await option.waitFor({state:'attached'});await select.selectOption(await option.getAttribute('value'));
 const row=page.locator('tbody tr').filter({hasText:'GPQA008P7'});await row.waitFor();
 await row.getByRole('button',{name:'Ver comprobantes',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:/^Legalizar anticipo/});await dialog.waitFor();
 await page.waitForLoadState('networkidle');
 await page.waitForFunction(()=>[...document.querySelectorAll('[role=dialog] .gl-file-item')].filter(e=>e.textContent.includes('GPQA-P7-20261015-1.pdf')).length===1);
 const file=dialog.locator('.gl-file-item').filter({hasText:'GPQA-P7-20261015-1.pdf'});await file.waitFor();
 assert.equal(await dialog.locator('.gl-dropzone').count(),1);assert.equal(await dialog.getByRole('button',{name:'Registrar legalización',exact:true}).isDisabled(),true);
 evidence.newLook={roundedPanel:await dialog.evaluate(e=>getComputedStyle(e).borderRadius),fileCard:true,dropzone:true};
 await page.screenshot({path:dir+'P3-P7-new-look.png',fullPage:true});
 if(!item.anulada){
  assert.ok(!campaign.annulPending,'Ambiguous prior attempt; inspect before retry');
  await file.getByRole('button',{name:'Anular',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Anular legalización',exact:true});await confirm.waitFor();
  await confirm.getByRole('button',{name:'Sí, anular legalización',exact:true}).click();
  await confirm.getByText('El motivo es obligatorio para anular la legalización.',{exact:true}).waitFor();
  assert.equal(evidence.network.filter(x=>x.url.includes('/1/anular')).length,0);evidence.reasonRequired=true;
  await page.screenshot({path:dir+'P3-P7-reason-required.png',fullPage:true});
  await confirm.locator('#motivoAnulacion').fill('GPQA anulacion prueba');
  campaign.annulPending=true;await persist();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/gp/anticipos/legalizaciones/1/anular');
  await confirm.getByRole('button',{name:'Sí, anular legalización',exact:true}).click();const r=await response;
  campaign.annul={status:r.status(),body:await r.json(),at:new Date().toISOString(),reasonRequired:true};campaign.annulPending=false;await persist();assert.equal(r.status(),200);
 }
 assert.ok(campaign.annul,'Annulment needs this campaign evidence');evidence.annul=campaign.annul;
 await file.locator('.gl-chip--anulada').waitFor();await file.getByRole('button',{name:'Anular',exact:true}).waitFor({state:'hidden'});
 assert.equal(await file.getByRole('button',{name:'Ver',exact:true}).isEnabled(),true);assert.match(await file.innerText(),/GPQA anulacion prueba/);
 const after=await api(path,{user:'gpqa.gerencia'});assert.equal(after.status,200);assert.equal(after.body.length,before.body.length);
 evidence.after=after.body.find(x=>x.id===1);assert.equal(evidence.after.anulada,true);assert.equal(evidence.after.anuladoPor,'gpqa.gerencia');assert.equal(evidence.after.motivoAnulacion,'GPQA anulacion prueba');assert.ok(evidence.after.anuladoEn);
 evidence.s3After=await download();assert.deepEqual(evidence.s3After,evidence.s3Before);
 const forbidden=evidence.network.filter(x=>x.method==='POST'&&new URL(x.url).pathname==='/api/gp/anticipos/legalizaciones');assert.deepEqual(forbidden,[]);evidence.newUploads=0;
 await page.screenshot({path:dir+'P3-P7-annulled.png',fullPage:true});
},'gpqa.gerencia'));
