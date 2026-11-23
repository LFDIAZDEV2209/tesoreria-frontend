import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {api,once,allRows,browserSession,front,dir,manifest,save,load,cents,cop} from './gpqa-phase2-lib.mjs';

for(const [route,module] of [['proveedores','proveedores'],['otros-pagos','provisiones']])test('P9 UI toggle and exact cells '+module,{timeout:90000},async()=>browserSession('P9-ui-'+module,async({page,evidence})=>{
 await page.goto(front+`/presupuesto/${route}?empresaId=91`);
 await page.getByRole('button',{name:'Todos los meses',exact:true}).waitFor();
 const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/anual'));
 await page.getByRole('button',{name:'Todos los meses',exact:true}).click();
 const r=await response;evidence.annualStatus=r.status();evidence.annualUrl=r.url();assert.equal(r.status(),200,'Annual UI integration must not return 404');
 const url=new URL(r.url());assert.equal(url.searchParams.has('vistaMes'),false);assert.equal(url.searchParams.has('periodoConsulta'),false);
 const a=await r.json();assert.ok(a.filas.length>0);
 const table=page.locator('app-gp-modulo-anual table');await table.waitFor();
 assert.equal(await table.locator('tbody tr').count(),a.filas.length);
 evidence.comparedCells=0;
 for(const metric of ['saldo','debito','credito']){
  await page.locator('app-gp-modulo-anual select').filter({has:page.locator('option[value="saldo"]')}).selectOption(metric);
  const cells=await table.locator('tbody tr').evaluateAll(es=>es.map(e=>[...e.querySelectorAll('td')].map(x=>x.textContent.trim())));
  for(let i=0;i<a.filas.length;i++){
   for(let m=0;m<a.meses.length;m++){assert.equal(cop(cells[i][m]),cents(a.filas[i].valores[a.meses[m]][metric]),`${i} ${a.meses[m]} ${metric}`);evidence.comparedCells++;}
   assert.equal(cop(cells[i].at(-1)),cents(a.filas[i].totalAnio[metric]));evidence.comparedCells++;
  }
  const totals=await table.locator('tfoot td').allTextContents();
  a.meses.forEach((m,i)=>assert.equal(cop(totals[i]),cents(a.totalesMes[m][metric])));
  assert.equal(cop(totals.at(-1)),cents(a.totalGeneral[metric]));
 }
 await page.screenshot({path:dir+'P9-ui-'+module+'-annual.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');
 await page.locator('app-gp-modulo-anual').getByRole('button',{name:'Exportar Excel',exact:true}).click();
 const download=await downloadPromise;
 const expectedName=`${module}-91-${a.anio ?? 'todos'}-credito.xlsx`;
 assert.equal(download.suggestedFilename(),expectedName);
 await download.saveAs(dir+expectedName);
 const bytes=await readFile(dir+expectedName);assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>1000);
 assert.ok(bytes.includes(Buffer.from('[Content_Types].xml')));assert.ok(bytes.includes(Buffer.from('xl/workbook.xml')));
 evidence.export={filename:expectedName,bytes:bytes.length,downloadFailure:await download.failure()};
 assert.equal(evidence.export.downloadFailure,null);
 await page.getByRole('button',{name:'Vista mensual',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('app-gp-vista-periodos button')?.getAttribute('aria-pressed')==='true');
 assert.equal(await page.getByRole('button',{name:'Vista mensual',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('app-gp-modulo-anual').count(),0);
 evidence.monthlyRestored=true;
}));

test('P8 UI editable prior month, approved disabled and real race 409 toast',{timeout:150000},async t=>{
 await browserSession('P8-ui',async({page,evidence})=>{
  evidence.checks=[];
  async function open(key,month){
   await page.goto(front+'/presupuesto/otros-pagos?empresaId=91');
   await page.getByLabel('Mes de consulta',{exact:true}).selectOption({label:month});
   await page.getByLabel('Buscar en Provisiones',{exact:true}).fill(manifest.payments[key].nombre);
   await page.locator('.gp-payment-card').filter({hasText:manifest.payments[key].nombre}).click();
   await page.locator('.gp-payment-detail article').waitFor();
  }
  for(const [key,month] of [['ui-edit','Octubre de 2026'],['ui-previous','Septiembre de 2026']]){
   const fixture=manifest.payments[key];
   // Restore ONLY our synthetic cents before a fresh UI concept-only edit.
   const reset=await api(`/api/gp/pagos-proyectados/${fixture.id}?empresaId=91`,{method:'PUT',body:{monto_proyectado:1234.56,concepto:fixture.concepto}});
   assert.equal(reset.status,200);assert.equal(cents(reset.body.monto_proyectado),123456n);
   await open(key,month);const card=page.locator('.gp-payment-detail article');
   assert.equal(await card.getByRole('button',{name:'Editar',exact:true}).isEnabled(),true);
   const deleteVisible=await card.getByRole('button',{name:'Eliminar',exact:true}).count();evidence.checks.push({key,editEnabled:true,deleteVisible});
   await page.screenshot({path:dir+'P8-'+key+'-actions.png',fullPage:true});
   await card.getByRole('button',{name:'Editar',exact:true}).click();
   await page.locator('#gp-payment-form input[name=concepto]').fill('GPQA-008 UI edited '+key);
   const response=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/pagos-proyectados/'+manifest.payments[key].id+'?'));
   await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
   await page.getByRole('heading',{name:'Confirmar cambios de la proyección',exact:true}).waitFor();
   await page.getByRole('button',{name:'Guardar cambios',exact:true}).last().click();
   const r=await response;assert.equal(r.status(),200);evidence.checks.push({key,editStatus:r.status()});
   const row=(await allRows('/api/gp/pagos-proyectados?empresaId=91&origen=manual')).find(x=>x.id===manifest.payments[key].id);assert.equal(row.concepto,'GPQA-008 UI edited '+key);
   evidence.checks.push({key,amountBefore:manifest.payments[key].monto_proyectado,amountAfter:row.monto_proyectado});
  }
  await open('approved','Octubre de 2026');const approved=page.locator('.gp-payment-detail article');
  assert.equal(await approved.getByRole('button',{name:'Editar',exact:true}).isDisabled(),true);
  assert.equal(await approved.getByRole('button',{name:'Eliminar',exact:true}).count(),0);
  evidence.approvedDisabled=true;await page.screenshot({path:dir+'P8-approved-actions.png',fullPage:true});
  const id=manifest.payments['ui-race'].id;
  const current=(await allRows('/api/gp/pagos-proyectados?empresaId=91&origen=manual')).find(x=>x.id===id);
  if(current.aprobado){
   const prior=await load('initial/P8-ui-checks');
   assert.equal(prior.conflict?.status,409);assert.ok(prior.toast);assert.equal(current.concepto,manifest.payments['ui-race'].concepto);
   evidence.conflict=prior.conflict;evidence.toast=prior.toast;evidence.raceEvidence='initial/P8-ui-checks.json and P8-ui-409-toast.png (original real race; no second approval)';
  }
  else{
   await open('ui-race','Octubre de 2026');await page.locator('.gp-payment-detail article').getByRole('button',{name:'Editar',exact:true}).click();
   await page.locator('#gp-payment-form input[name=concepto]').fill('GPQA-008 stale edit must fail');
   const a=await once('approve-ui-race',`/api/gp/pagos-proyectados/${id}/aprobar?empresaId=91`,{method:'PUT',user:'gpqa.gerencia',body:{aprobado:true}});assert.equal(a.status,200);
   const response=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/pagos-proyectados/'+id+'?'));
   await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
   await page.getByRole('heading',{name:'Confirmar cambios de la proyección',exact:true}).waitFor();
   await page.getByRole('button',{name:'Guardar cambios',exact:true}).last().click();const r=await response;
   evidence.conflict={status:r.status(),body:await r.json()};assert.equal(r.status(),409);assert.ok(evidence.conflict.body.code);
   await page.getByText(evidence.conflict.body.message,{exact:true}).first().waitFor();evidence.toast=evidence.conflict.body.message;
   await page.screenshot({path:dir+'P8-ui-409-toast.png',fullPage:true});
  }
  await save('P8-ui-checks',evidence);
  await t.test('contador can delete an editable provision in UI',()=>assert.ok(evidence.checks.filter(x=>'deleteVisible'in x).every(x=>x.deleteVisible>0),'Eliminar is absent on current and prior unapproved provisions'));
  await t.test('concept-only edit preserves cents',()=>{for(const x of evidence.checks.filter(x=>'amountAfter'in x))assert.equal(cents(x.amountAfter),cents(x.amountBefore),x.key);});
  assert.ok(evidence.checks.filter(x=>'deleteVisible'in x).every(x=>x.deleteVisible>0),'P8 failed: contador delete action absent');
  for(const x of evidence.checks.filter(x=>'amountAfter'in x))assert.equal(cents(x.amountAfter),cents(x.amountBefore),x.key);
 });
});

test('P10 UI new month navigation and own history',{timeout:90000},async()=>browserSession('P10-ui',async({page,evidence})=>{
 assert.ok(manifest.period,'Run P10 API preparation first');
 await page.goto(front+'/presupuesto/proveedores?empresaId=91');
 const selector=page.getByLabel('Mes de consulta',{exact:true});await selector.waitFor();
 const option=await selector.locator('option').evaluateAll((es,p)=>es.find(e=>e.value.includes(p))?.value,manifest.period);assert.ok(option,'New month appears in UI');
 const response=page.waitForResponse(r=>r.url().includes('/api/gp/proveedores/')&&new URL(r.url()).searchParams.get('periodoConsulta')===manifest.period);
 await selector.selectOption(option);const r=await response;assert.equal(r.status(),200);evidence.period=manifest.period;evidence.monthUrl=r.url();
 await page.screenshot({path:dir+'P10-month.png',fullPage:true});
 const links=page.getByRole('link',{name:'Historial',exact:true});assert.ok(await links.count());evidence.historyHref=await links.first().getAttribute('href');
 await links.first().click();await page.waitForLoadState('networkidle');
 evidence.historyBody=await page.locator('body').innerText();
 evidence.historyControls=await page.locator('input,select').evaluateAll(es=>es.map(e=>({tag:e.tagName,aria:e.getAttribute('aria-label'),name:e.getAttribute('name')})));
 console.log('HISTORY',JSON.stringify({url:page.url(),controls:evidence.historyControls,body:evidence.historyBody.slice(-2500)}));
 await page.locator('input[name=periodo]').fill(manifest.period);await page.locator('input[name=usuario]').fill('gpqa.contador');
 const responseAudit=page.waitForResponse(r=>r.url().includes('/auditoria'));
 await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();const ar=await responseAudit;
 evidence.filteredAudit={url:ar.url(),status:ar.status(),body:await ar.json()};
 assert.equal(ar.status(),200,'Accountant history must be readable');
}));
