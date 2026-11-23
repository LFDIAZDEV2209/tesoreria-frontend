import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {respuestaApi,session,empresas,mensualPrueba,contratoPrueba} from './fixtures.mjs';
const artifacts=path.resolve('testing/gp-parity/artifacts');
let browser;
before(async()=>{await mkdir(artifacts,{recursive:true});browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});});
after(async()=>{await browser?.close();});
async function setup(rol='gerente',extra=()=>undefined) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),calls=[],errors=[];
  const permission=['pagos.ver','pagos.aprobar','pagos.aprobar_sugeridas','pagos.eliminar','presupuesto.ver','modulos.ver','historicos.ver'];
  const role={...session,rol,rol_nexa:rol,permisos:rol==='contador'?['pagos.ver','modulos.ver','presupuesto.ver']:permission};
  const pagos=[1,2].map((id)=>({id,nit:'123',nombre:'Proveedor sintético',categoria:'FRUVER',modulo_origen:'cx_pagar',
    concepto:'Factura '+id,estado:'proyectado',aprobado:false,monto_proyectado:id*100,fecha_proyectada:'2026-10-20'}));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    const p=url.pathname.replace(/^\/api\/gp/,''),method=request.method();
    const body=request.headers()['content-type']?.includes('application/json')?request.postDataJSON():null;
    calls.push({p,method,body,company:url.searchParams.get('empresaId')??url.searchParams.get('como')});
    const custom=await extra({p,method,body});
    if(custom!==undefined)return route.fulfill({json:custom});
    let payload;
    if(p==='/auth/estado')payload=role;
    else if(p==='/periodos/seleccion')payload={...respuestaApi(url),datosEmpresa:['2026-01','2026-02','2026-10'],presupuestosEmpresa:['2026-01','2026-02','2026-10']};
    else if(p==='/auth/contadores')payload=rol==='contador'?empresas:[...empresas,{id:2,nombre:'Segunda empresa',username:'segunda'}];
    else if(p==='/pagos-proyectados/' && method==='GET')payload={content:pagos,page:0,size:200,totalElements:2,totalPages:1};
    else if(p==='/pagos-proyectados/sugeridos/aprobacion-masiva'){
      for(const pago of pagos)if(body.pago_ids.includes(pago.id))pago.aprobado=body.aprobado;
      payload={actualizados:pagos,errores:[]};
    }else if(p==='/usuarios/')payload=[{id:10,nombre:'Tesorera sintética',username:'tesorera',rol:'tesorero',es_workspace:false,activo:true,empresa_ids:[1]}];
    else payload=respuestaApi(url,true);
    return route.fulfill({json:payload});
  });
  await context.addInitScript(()=>{
    localStorage.setItem('currentUser',JSON.stringify({id:99,username:'fixture',roles:[{name:'SUPER_ADMIN'}],token:'fixture-local'}));
    localStorage.setItem('gp_nexa_empresa_id','1');
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const goto=async ruta=>{await page.goto('http://127.0.0.1:4201/presupuesto/'+ruta);await page.locator('.gp-app').waitFor();};
  return {page,context,calls,errors,goto};
}
test('aprobación y desaprobación masivas muestran sumatorias y envían la empresa correcta',async()=>{
  const t=await setup();try{
    await t.goto('pagos-sugeridos');
    await t.page.getByLabel('Empresa de pagos sugeridos').waitFor();
    await t.page.getByRole('tab',{name:/^Egresos/}).click();
    await t.page.getByRole('cell',{name:'Factura 2',exact:true}).waitFor();
    await t.page.getByRole('button',{name:'Seleccionar todos los pagos pendientes'}).click();
    await t.page.getByText(/Total seleccionado:.*300/).waitFor();
    await t.page.getByRole('button',{name:'Aprobar seleccionados',exact:true}).click();
    await t.page.getByText('2 pagos aprobados.').waitFor();
    await t.page.getByRole('button',{name:'Seleccionar todos los pagos pendientes'}).click();
    await t.page.getByRole('button',{name:'Desaprobar seleccionados',exact:true}).click();
    await t.page.getByText('2 pagos desaprobados.').waitFor();
    const cambios=t.calls.filter(c=>c.p.endsWith('/aprobacion-masiva'));
    assert.deepEqual(cambios.map(c=>c.body),[{pago_ids:[1,2],aprobado:true},{pago_ids:[1,2],aprobado:false}]);
    assert.ok(cambios.every(c=>c.company==='1'));
    await t.page.screenshot({path:path.join(artifacts,'request-sugeridos.png'),fullPage:true});
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
test('modal muestra días vencidos, permite retirar únicamente la factura futura y nómina no tiene inputs monetarios',async()=>{
  const hoy=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const fecha=delta=>new Date(Date.parse(hoy+'T00:00:00Z')+delta*86400000).toISOString().slice(0,10);
  let facturas=[{comprobante:'VENCIDA',movimiento_id:101,monto:100,fecha_vencimiento:fecha(-5),vencida:true},
    {comprobante:'FUTURA',movimiento_id:102,monto:200,fecha_vencimiento:fecha(5),vencida:false}];
  const t=await setup('superadmin',({p,method})=>{
    if(p.endsWith('/previsualizar-sugerido'))return {nit:'900999001',nombre:'Proveedor de prueba',pago_sugerido:1000,total_a_aprobar:300,facturas};
    if(p==='/pagos-proyectados/sugeridos/facturas/102' && method==='DELETE'){facturas=facturas.filter(f=>f.movimiento_id!==102);return {ok:true};}
    if(p==='/presupuesto/mensual')return {...mensualPrueba,filas_nomina:[{concepto:'Nómina administrativa',campo:'nomina_admon',valores:{'2026-01':1234567},editable:true,total:1234567,pago_sugerido:0},{concepto:'Total Nómina',valores:{'2026-01':1234567},total:1234567}]};
  });try{
    await t.goto('presupuesto?periodo=2026-01');
    const aprobar=t.page.locator('button[title="Aprobar facturas hasta cubrir el Pago Sugerido"]');
    await aprobar.first().waitFor();await aprobar.first().click();
    const modal=t.page.getByRole('dialog').filter({hasText:'Aprobar facturas con Pago Sugerido'});
    await modal.waitFor();
    const vencida=modal.getByRole('row').filter({hasText:'VENCIDA'}),futura=modal.getByRole('row').filter({hasText:'FUTURA'});
    assert.equal(await vencida.getByRole('cell',{name:'5',exact:true}).count(),1);
    assert.equal(await vencida.getByRole('button',{name:'Eliminar',exact:true}).count(),0);
    await t.page.screenshot({path:path.join(artifacts,'request-facturas-modal.png')});
    t.page.on('dialog',dialog=>dialog.accept());
    await futura.getByRole('button',{name:'Eliminar',exact:true}).click();
    await futura.waitFor({state:'detached'});
    assert.ok(t.calls.some(c=>c.method==='DELETE'&&c.p.endsWith('/facturas/102')));
    await t.page.screenshot({path:path.join(artifacts,'request-presupuesto-tras-eliminar.png')});
    assert.equal(await t.page.locator('.gp-nomina-editar').count(),0);
    assert.deepEqual(t.errors,[]);
  }catch(e){
    console.log('Diagnóstico del fixture de presupuesto:',(await t.page.locator('.gp-app').textContent()).slice(-4000));
    await t.page.screenshot({path:path.join(artifacts,'request-presupuesto-diagnostico.png'),fullPage:true});
    throw e;
  }finally{await t.context.close();}
});
test('contador solo dispone de empresas asignadas y no tiene acciones de aprobación o eliminación',async()=>{
  const t=await setup('contador');try{
    await t.goto('pagos-sugeridos');
    const options=t.page.getByLabel('Empresa de pagos sugeridos').locator('option');
    await options.last().waitFor({state:'attached'});
    assert.equal(await options.count(),2); // marcador + única empresa asignada
    assert.equal(await t.page.getByRole('button',{name:'Aprobar seleccionadas',exact:false}).count(),0);
    await t.page.getByRole('tab',{name:/^Egresos/}).click();
    assert.equal(await t.page.getByRole('button',{name:'Desaprobar seleccionados',exact:true}).count(),0);
    await t.page.getByRole('button',{name:/Proveedor sintético/}).first().click();
    assert.equal(await t.page.getByRole('button',{name:'Eliminar',exact:true}).count(),0);
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
test('proyección no contiene sugeridos ni cuentas por cobrar y listado de usuarios muestra Tesorera',async()=>{
  const t=await setup('superadmin');try{
    await t.goto('pagos-proyectados');await t.page.getByRole('heading',{name:'Proyección de Egresos',exact:true}).waitFor();
    assert.equal(await t.page.locator('.gp-budget-suggestions').count(),0);
    assert.equal(await t.page.getByRole('tab',{name:/Sugeridos|Cuentas por cobrar/i}).count(),0);
    await t.goto('usuarios');await t.page.getByRole('tab',{name:/Personas/}).click();
    await t.page.getByRole('cell',{name:'Tesorera',exact:true}).waitFor();
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
