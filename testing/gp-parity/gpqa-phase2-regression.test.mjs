import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,browserSession,front,cents,cop} from './gpqa-phase2-lib.mjs';
for(const module of ['proveedores','anticipos','cuentas-pagar','cuentas-cobrar','impuestos'])test('Monthly regression '+module,{timeout:60000},async()=>browserSession('monthly-'+module,async({page,evidence})=>{
 const annual=await api(`/api/gp/${module}/anual?empresaId=91`);assert.equal(annual.status,200);const month=annual.body.meses.at(-1);assert.ok(month);
 await page.goto(front+`/presupuesto/${module}?empresaId=91`);
 const select=page.getByLabel('Mes de consulta',{exact:true});await select.waitFor();
 // The select shell renders before the asynchronous period options arrive.
 await page.waitForFunction(m=>[...document.querySelectorAll('select[aria-label="Mes de consulta"] option')].some(e=>e.value.endsWith(m)),month);
 const value=await select.locator('option').evaluateAll((es,m)=>es.find(e=>e.value.endsWith(m))?.value,month);assert.ok(value,'Month must be selectable');
 const summaryPromise=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/gp/${module}/resumen`&&new URL(r.url()).searchParams.get('periodoConsulta')===month);
 const listPromise=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/gp/${module}/`&&new URL(r.url()).searchParams.get('periodoConsulta')===month);
 await select.selectOption(value);const [summary,list]=await Promise.all([summaryPromise,listPromise]);assert.equal(summary.status(),200);assert.equal(list.status(),200);
 const s=await summary.json(),p=await list.json();assert.ok(Array.isArray(s));assert.ok(Array.isArray(p.content));assert.ok(p.totalElements>0);
 const balance=s.reduce((n,r)=>n+cents(r.total_saldo),0n);const kpi=page.locator('app-gp-kpi').filter({has:page.locator('.kpi-label',{hasText:/^Saldo acumulado$/})}).locator('.kpi-value');await kpi.waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('app-modulo-page app-gp-skeleton').length===0);
 assert.equal(cop(await kpi.getAttribute('title')),balance<0n?-balance:balance);assert.equal(await page.locator('app-modulo-page app-gp-error-state').count(),0);
 assert.equal(await page.getByRole('button',{name:'Vista mensual',exact:true}).getAttribute('aria-pressed'),'true');
 evidence.month=month;evidence.balanceCents=String(balance);evidence.rows=p.totalElements;evidence.apiUrl=list.url();
}));
