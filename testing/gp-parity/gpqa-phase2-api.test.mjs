import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,once,payment,allRows,cents,manifest,persist,save,load} from './gpqa-phase2-lib.mjs';

test('P8 API: synthetic provisions and immutable approved records',async t=>{
 const results=[];
 for(const [key,period] of [['current','2026-10'],['previous','2026-09']]){
  const p=await payment(key,period);
  await t.test(key+' edit',async()=>{
   const r=await once('edit-'+key,`/api/presupuesto/pagos-proyectados/${p.id}?empresaId=91`,{method:'PUT',body:{montoProyectado:2345.67,concepto:'GPQA-008 edited '+key,notas:'QA-ONLY synthetic row edited',fechaProyectada:period+'-16',nombre:p.nombre,nit:p.nit,seccion:'OTROS'}});
   results.push(r);assert.equal(r.status,200);assert.equal(cents(r.body.montoProyectado),234567n);assert.equal(r.body.fechaProyectada,period+'-16');
  });
  await t.test(key+' delete by contador',async()=>{
   const r=await once('delete-'+key,`/api/gp/pagos-proyectados/${p.id}?empresaId=91`,{method:'DELETE'});results.push(r);assert.equal(r.status,200,JSON.stringify(r.body));
   const rows=await allRows('/api/gp/pagos-proyectados?empresaId=91&origen=manual');assert.equal(rows.find(x=>x.id===p.id)?.estado,'cancelado');
  });
 }
 const p=await payment('approved');
 const approval=await once('approve-fixed',`/api/gp/pagos-proyectados/${p.id}/aprobar?empresaId=91`,{method:'PUT',user:'gpqa.gerencia',body:{aprobado:true}});assert.equal(approval.status,200,JSON.stringify(approval));
 const before=(await allRows('/api/gp/pagos-proyectados?empresaId=91&origen=manual')).find(x=>x.id===p.id);
 assert.equal(before.aprobado,true);assert.equal(before.estado,'proyectado');
 for(const base of ['/api/presupuesto/pagos-proyectados','/api/gp/pagos-proyectados'])for(const method of ['PUT','DELETE']){
  await t.test(method+' approved '+base,async()=>{
   const r=await once('protected-'+base+'-'+method,`${base}/${p.id}?empresaId=91`,{method,body:method==='PUT'?(base.includes('/gp/')?{monto_proyectado:999.99}:{montoProyectado:999.99}):undefined});results.push(r);
   assert.equal(r.status,409,JSON.stringify(r.body));assert.ok(r.body.code);assert.ok(r.body.message);assert.match(r.body.message,/aprobad|ejecutad|provisi/i);
  });
 }
 const patch=await once('approved-patch',`/api/gp/pagos-proyectados/${p.id}?empresaId=91`,{method:'PATCH',body:{monto_proyectado:999.99}});results.push({...patch,note:'PATCH is not in the brief PUT/DELETE contract'});
 // A second authorized role proves the business conflict separately from contador permission failures.
 const managerDelete=await once('approved-manager-delete',`/api/gp/pagos-proyectados/${p.id}?empresaId=91`,{method:'DELETE',user:'gpqa.gerencia'});results.push(managerDelete);
 await t.test('gerencia DELETE protects approved with 409',()=>{assert.equal(managerDelete.status,409);assert.ok(managerDelete.body.code);assert.ok(managerDelete.body.message);});
 const after=(await allRows('/api/gp/pagos-proyectados?empresaId=91&origen=manual')).find(x=>x.id===p.id);assert.deepEqual(after,before);
 await payment('ui-edit');await payment('ui-race');await payment('ui-previous','2026-09');
 await save('P8-api',{results,before,after});
});

for(const module of ['proveedores','anticipos','cuentas-pagar','cuentas-cobrar','impuestos','provisiones'])test('P9 reconcile '+module,async()=>{
 const path=module==='provisiones'?'/api/gp/pagos-proyectados/provisiones/anual':`/api/gp/${module}/anual`;
 const all=await api(path+'?empresaId=91');assert.equal(all.status,200);assert.ok(all.body.anios.length,'Need a year with data');
 const year=all.body.anios.includes(2026)?2026:all.body.anios[0],r=await api(path+`?empresaId=91&anio=${year}`);assert.equal(r.status,200);const a=r.body;
 assert.ok(a.filas.length>0,'Annual reconciliation must include real data');
 const comparisons=[];
 try{
  assert.deepEqual(a.meses,[...new Set(a.meses)].sort());
  for(const metric of ['debito','credito','saldo']){
   let yearly=0n;
   for(const month of a.meses){
    const rows=await allRows(module==='provisiones'?`/api/gp/pagos-proyectados?empresaId=91&origen=manual&vistaMes=true&periodoConsulta=${month}`:`/api/gp/${module}/?empresaId=91&vistaMes=true&periodoConsulta=${month}`);
    const monthly=rows.filter(x=>module!=='provisiones'||x.estado!=='cancelado').reduce((s,x)=>s+cents(module==='provisiones'?(metric==='credito'?0:x.monto_proyectado):x[metric]),0n);
    const aggregate=cents(a.totalesMes[month][metric]);const rowSum=a.filas.reduce((s,x)=>s+cents(x.valores[month][metric]),0n);
    comparisons.push({month,metric,monthly,aggregate,rowSum,rows:rows.length});
    assert.equal(monthly,aggregate,`${module} ${month} ${metric}: monthly != annual`);assert.equal(rowSum,aggregate);yearly+=aggregate;
   }
   assert.equal(yearly,cents(a.totalGeneral[metric]));
   for(const row of a.filas)assert.equal(a.meses.reduce((s,m)=>s+cents(row.valores[m][metric]),0n),cents(row.totalAnio[metric]));
  }
 }finally{await save('P9-api-'+module,{path,year,anios:all.body.anios,annual:a,comparisons});}
});

test('P10 API: accountant creates year/month and audit is accessible',async t=>{
 const before=await api('/api/gp/periodos/seleccion?empresaId=91');assert.equal(before.status,200);
 if(!manifest.year){const used=new Set(before.body.anios.map(x=>x.anio));let year=2027;while(used.has(year))year++;manifest.year=year;manifest.period=year+'-01';manifest.periodBefore=before.body;await persist();}
 const year=await once('create-year','/api/gp/periodos/anios?empresaId=91',{method:'POST',body:{anio:manifest.year,crearMeses:false}});
 const month=await once('create-month',`/api/gp/periodos/${manifest.period}?empresaId=91`,{method:'POST'});
 await t.test('year and month creation',()=>{assert.equal(year.status,201);assert.equal(month.status,201);});
 const after=await api('/api/gp/periodos/seleccion?empresaId=91');assert.equal(after.status,200);assert.ok(after.body.estadosMes.some(x=>x.periodo===manifest.period));
 // FE sends empresaId only, then applies period/user filters locally.
 const audit=await api(`/api/presupuesto/auditoria?empresaId=91`);
 const manager=await api(`/api/presupuesto/auditoria?empresaId=91`,{user:'gpqa.gerencia'});
 const own=Array.isArray(manager.body)?manager.body.filter(x=>JSON.stringify(x).includes('gpqa.')):[];
 await save('P10-api',{year,month,after:after.body,audit,manager:{status:manager.status,ownRows:own}});
 await t.test('accountant can query own audit',()=>{assert.equal(audit.status,200,JSON.stringify(audit.body));});
 await t.test('SQL evidence: creation and edits persisted with actor and period',async()=>{
  const sql=await load('P10-sql');assert.ok(sql.rows?.length,'Run SELECT evidence capture first');
  for(const action of ['crear_anio_panorama','abrir_mes','pago_editar'])assert.ok(sql.rows.some(x=>x.accion===action&&x.usuario_nombre==='gpqa.contador'&&x.detalle.includes('periodo=')),action);
 });
});
