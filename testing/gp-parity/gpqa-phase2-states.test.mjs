import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,once,allRows,manifest,save,browserSession,front} from './gpqa-phase2-lib.mjs';
test('P8 controls: gerencia cancellation and immutable executed/cancelled own fixtures',async()=>{
 const evidence={results:[]};
 try{
  const current=manifest.mutations['delete-control-current'];assert.equal(current.status,200);evidence.results.push(current);
  const previous=await once('gerencia-delete-existing-previous',`/api/gp/pagos-proyectados/${manifest.payments.previous.id}?empresaId=91`,{method:'DELETE',user:'gpqa.gerencia'});
  evidence.results.push(previous);assert.equal(previous.status,200);
  const rows=await allRows('/api/gp/pagos-proyectados?empresaId=91&origen=manual');
  for(const id of [manifest.payments['delete-control-current'].id,manifest.payments.previous.id])assert.equal(rows.find(x=>x.id===id)?.estado,'cancelado');
  const executed=rows.find(x=>x.nombre==='GPQA-008-20261015 executed');assert.ok(executed);assert.equal(executed.estado,'pagado');evidence.executed=executed;
  for(const row of [executed,rows.find(x=>x.id===manifest.payments['delete-control-current'].id)]){
   for(const method of ['PUT','DELETE']){
    const r=await api(`/api/gp/pagos-proyectados/${row.id}?empresaId=91`,{method,user:method==='DELETE'?'gpqa.gerencia':'gpqa.contador',body:method==='PUT'?{monto_proyectado:999.99}:undefined});
    evidence.results.push(r);assert.equal(r.status,409);assert.ok(r.body.code);assert.ok(r.body.message);
   }
   const after=(await allRows('/api/gp/pagos-proyectados?empresaId=91&origen=manual')).find(x=>x.id===row.id);assert.deepEqual(after,row);
  }
 }finally{await save('P8-states',evidence);}
});
test('P8 UI executed record actions disabled',{timeout:90000},async()=>browserSession('P8-ui-executed',async({page,evidence})=>{
 await page.goto(front+'/presupuesto/otros-pagos?empresaId=91');
 await page.getByLabel('Mes de consulta',{exact:true}).selectOption({label:'Enero de 2027'});
 await page.getByLabel('Buscar en Provisiones',{exact:true}).fill('GPQA-008-20261015 executed');
 await page.locator('.gp-payment-card').filter({hasText:'GPQA-008-20261015 executed'}).click();
 const card=page.locator('.gp-payment-detail article');await card.waitFor();
 assert.equal(await card.getByRole('button',{name:'Editar',exact:true}).isDisabled(),true);
 assert.equal(await card.getByRole('button',{name:'Eliminar',exact:true}).count(),0);evidence.executedDisabled=true;
}));
