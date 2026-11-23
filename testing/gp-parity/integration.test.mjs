import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {respuestaApi,session,empresas,mensualPrueba,contratoPrueba} from './fixtures.mjs';
const artifacts=path.resolve('testing/gp-parity/artifacts');
let browser;
before(async()=>{await mkdir(artifacts,{recursive:true});browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,env:{...process.env,TEMP:artifacts,TMP:artifacts}});});
after(async()=>{await browser?.close();});
async function setup(handler=()=>undefined,{workspace='1',role=session,companyList=empresas}={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),calls=[],errors=[];
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname!=='127.0.0.1')return route.abort();
  if(!/^\/(gp-api|api)\//.test(url.pathname))return route.continue();
  const p=url.pathname.replace(/^\/api\/gp/,''),method=request.method();
  const body=p.startsWith('/auth/') || !request.headers()['content-type']?.includes('application/json') ? undefined : request.postDataJSON();
  calls.push({p,method,body,params:Object.fromEntries(url.searchParams),headers:request.headers()});
  if(p==='/auth/estado')return route.fulfill({json:role});
  if(p==='/auth/contadores')return route.fulfill({json:companyList});
  const custom=await handler({p,method,body,url,calls});
  if(custom?.status)return route.fulfill({status:custom.status,json:custom.body});
  if(custom?.download)return route.fulfill({body:custom.download,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  let payload=custom===undefined?respuestaApi(url):custom;
  if(Array.isArray(payload) && p.endsWith('/resumen')) payload=payload.map(r=>({...r,movimientos:r.movimientos??r.total_proveedores??1}));
  if(Array.isArray(payload) && url.searchParams.has('page') && /^\/(proveedores|anticipos|cuentas-pagar|cuentas-cobrar|impuestos|pagos-proyectados)\/$/.test(p)) {
    let rows=[...payload];const q=url.searchParams.get('busqueda')?.toLowerCase();
    if(q)rows=rows.filter(r=>[r.nit,r.nombre,r.comprobante,r.detalle].join(' ').toLowerCase().includes(q));
    const category=url.searchParams.get('categoria');if(category)rows=rows.filter(r=>r.categoria===category);
    const key=(url.searchParams.get('sortBy')||'fecha').replace(/[A-Z]/g,c=>'_'+c.toLowerCase());const dir=url.searchParams.get('sortDir')==='asc'?1:-1;
    rows.sort((a,b)=>typeof a[key]==='number'?(a[key]-b[key])*dir:String(a[key]??'').localeCompare(String(b[key]??''))*dir);
    const page=Number(url.searchParams.get('page')),size=Number(url.searchParams.get('size')||50);
    payload={content:rows.slice(page*size,(page+1)*size),page,size,totalElements:rows.length,totalPages:Math.ceil(rows.length/size)};
  }
  return route.fulfill({json:payload});
 });
 await context.addInitScript(({workspace})=>{localStorage.setItem('currentUser',JSON.stringify({id:99,username:'test',roles:[{name:'SUPER_ADMIN'}],token:'token-plataforma-prueba'}));if(workspace)localStorage.setItem('gp_nexa_empresa_id',workspace);localStorage.setItem('gp-theme','dark');},{workspace});
 const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/ERROR|TypeError|ReferenceError|NG\d{4}/.test(m.text()))errors.push(m.text())});
 const goto=async route=>{await page.goto('http://127.0.0.1:4201/presupuesto/'+route);await page.locator('.gp-app').waitFor();await page.waitForTimeout(350);};
 return {context,page,calls,errors,goto};
}
async function eventually(fn){for(let i=0;i<50;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}assert.fail('La condición no se cumplió');}

test('13 apartados: menú Nexa, tema claro y tamaños sin errores JavaScript ni desbordamiento',async()=>{
 const t=await setup();try{
  for(const route of ['proveedores','anticipos','cuentas-pagar','cuentas-cobrar','impuestos','presupuesto','otros-pagos','pagos-proyectados','resumen-gerencial','categorias','maestro-proveedores','usuarios','auditoria']){
   await t.goto(route);assert.ok((await t.page.locator('.gp-app h1').allTextContents()).some(Boolean),route);
   for(const width of [390,768,1024,1280,1440]){await t.page.setViewportSize({width,height:900});assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' '+width);}
  }
  await t.goto('proveedores');assert.equal(await t.page.locator('.gp-app').evaluate(el=>el.classList.contains('dark')),false);assert.equal(await t.page.locator('.gp-app').evaluate(el=>getComputedStyle(el).getPropertyValue('--bg-surface').trim()),'#ffffff');assert.equal(await t.page.locator('app-sidebar aside').isVisible(),true);assert.ok((await t.page.locator('.gp-app').boundingBox()).x>=256);
  await t.page.setViewportSize({width:390,height:844});await t.page.getByRole('button',{name:'Menú',exact:true}).click();assert.equal(await t.page.locator('app-sidebar aside').isVisible(),true);await t.page.locator('app-sidebar').getByRole('link',{name:'Presupuesto 2026',exact:true}).click();await t.page.waitForURL('**/presupuesto/presupuesto');await eventually(async()=>!(await t.page.locator('app-sidebar aside').isVisible()));await t.page.getByRole('button',{name:'Menú',exact:true}).click();await t.page.getByRole('button',{name:'Cerrar menú de navegación',exact:true}).click({position:{x:370,y:300}});await eventually(async()=>!(await t.page.locator('app-sidebar aside').isVisible()));
  assert.deepEqual(t.errors,[]);
  assert.ok(t.calls.filter(c=>!c.p.startsWith('/api/')).every(c=>c.headers['x-user-name']==='test'),'Propagar identidad Nexa al backend local');
 }finally{await t.context.close();}
});

test('multiempresa: selección explícita y parámetro como al cambiar de empresa',async()=>{
 const t=await setup(()=>undefined,{workspace:null,companyList:[...empresas,{id:2,nombre:'Segunda empresa',responsable:'Contador B'}]});try{
  await t.goto('proveedores');await t.page.getByRole('heading',{name:'¿Con qué empresa vas a trabajar?'}).waitFor();
  assert.equal(t.calls.some(c=>c.p==='/proveedores/'),false);
  await t.page.getByRole('button',{name:'Segunda empresa',exact:true}).click();await eventually(()=>t.calls.some(c=>c.p==='/proveedores/'&&c.params.como==='2'));
  await t.page.getByRole('combobox',{name:'Empresa',exact:true}).filter({visible:true}).selectOption({label:'Empresa de prueba'});await eventually(()=>t.calls.some(c=>c.p==='/proveedores/'&&c.params.como==='1'));
  assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('movimientos: búsqueda, categorías, orden, paginación y exportación real',async()=>{
 const rows=Array.from({length:31},(_,i)=>({id:i+1,nit:'900'+String(i).padStart(3,'0'),nombre:'Proveedor '+String(i).padStart(2,'0'),categoria:i%2?'OTROS':'FRUVER',saldo:1000+i,fecha:'2026-09-01',comprobante:'FAC-'+i}));
 const t=await setup(({p})=>p==='/proveedores/'?rows:p==='/proveedores/resumen'?[{categoria:'FRUVER',total_saldo:10000,total_proveedores:16}]:p==='/proveedores/exportar'?{download:'fixture-export'}:undefined);try{
  await t.goto('proveedores');await t.page.locator('tbody tr').first().waitFor();assert.equal(await t.page.locator('tbody tr').count(),15);
  await t.page.getByRole('button',{name:'Siguiente'}).click();await eventually(async()=> (await t.page.locator('.gp-page-pill').innerText()).includes('2 / 3'));
  await t.page.getByPlaceholder('Buscar por NIT o nombre…').fill('Proveedor 03');await eventually(async()=>await t.page.locator('tbody tr').count()===1);
  assert.match(await t.page.locator('tbody').innerText(),/Proveedor 03/);
  await t.page.getByPlaceholder('Buscar por NIT o nombre…').fill('');await t.page.getByRole('combobox',{name:'Categoría',exact:true}).selectOption('FRUVER');await eventually(async()=>await t.page.locator('tbody tr').count()===15);
  const download=t.page.waitForEvent('download');await t.page.getByRole('button',{name:'Exportar Excel',exact:true}).click();await download;assert.ok(t.calls.some(c=>c.p==='/proveedores/exportar'&&c.params.categoria==='FRUVER'));await t.page.setViewportSize({width:390,height:844});await t.page.waitForTimeout(500);const searchBox=await t.page.getByPlaceholder('Buscar por NIT o nombre…').boundingBox(),dateStart=await t.page.getByTitle('Fecha inicial',{exact:true}).boundingBox(),dateEnd=await t.page.getByTitle('Fecha final',{exact:true}).boundingBox();assert.ok(searchBox.width>=280);assert.equal(Math.round(dateStart.y),Math.round(dateEnd.y));assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('categorías: alta, renombrado, desactivación y error conservan el formulario',async()=>{
 let rows=[{id:1,nombre:'FRUVER',activa:true}],fail=false;
 const t=await setup(({p,method,body})=>{
  if(p==='/categorias/admin/todas')return rows;
  if(p==='/categorias/admin'&&method==='POST'){if(fail)return {status:409,body:{detail:'La categoría ya existe'}};rows.push({id:2,...body,activa:true});return rows.at(-1);}
  if(p==='/categorias/admin/2'&&method==='PUT'){Object.assign(rows[1],body);return rows[1];}
 });try{
  await t.goto('categorias');await t.page.getByRole('button',{name:/Nueva categoría/}).click();await t.page.locator('form input').fill('PRUEBA LOCAL');await t.page.getByRole('button',{name:'Crear categoría',exact:true}).click();await t.page.getByText('PRUEBA LOCAL',{exact:true}).waitFor();
  const row=t.page.getByRole('row').filter({hasText:'PRUEBA LOCAL'});await row.getByRole('button',{name:'Editar',exact:true}).click();await t.page.locator('form input').fill('RENOMBRADA');await t.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await t.page.getByText('RENOMBRADA',{exact:true}).waitFor();await t.page.getByRole('button',{name:'Desactivar RENOMBRADA',exact:true}).click();await eventually(()=>rows[1].activa===false);
  fail=true;await t.page.getByRole('button',{name:/Nueva categoría/}).click();await t.page.locator('form input').fill('RENOMBRADA');await t.page.getByRole('button',{name:'Crear categoría',exact:true}).click();await t.page.getByRole('alert').filter({hasText:'ya existe'}).first().waitFor();assert.equal(await t.page.locator('form input').inputValue(),'RENOMBRADA');
  assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('cuentas y proveedores: formularios envían los contratos reales de creación',async()=>{
 const t=await setup(({p,method,body})=>method==='POST'?{id:100,...body}:undefined);try{
  await t.goto('usuarios');await t.page.getByRole('button',{name:/Nueva empresa/}).click();await t.page.getByLabel('Nombre de la empresa').fill('Empresa sintética');await t.page.getByLabel('Código de la empresa',{exact:true}).fill('empresa_prueba');await t.page.getByRole('button',{name:'Crear empresa',exact:true}).click();await eventually(()=>t.calls.some(c=>c.p==='/usuarios/'&&c.method==='POST'));
  const account=t.calls.find(c=>c.p==='/usuarios/'&&c.method==='POST').body;assert.equal(account.es_workspace,true);assert.equal(account.rol,'contador');
  await t.goto('maestro-proveedores');await t.page.getByRole('button',{name:'Nuevo proveedor',exact:true}).click();await t.page.getByLabel('NIT',{exact:true}).fill('900999001');await t.page.getByLabel('Nombre',{exact:true}).fill('Proveedor sintético');await t.page.getByLabel('Categoría',{exact:true}).selectOption('OTROS');assert.equal(await t.page.getByRole('button',{name:'Crear proveedor',exact:true}).isDisabled(),true);await t.page.getByLabel('¿Cuál otro?').fill('Detalle de prueba');await t.page.getByRole('button',{name:'Crear proveedor',exact:true}).click();await eventually(()=>t.calls.some(c=>c.p==='/categorias/crear'));
  const provider=t.calls.find(c=>c.p==='/categorias/crear');assert.equal(provider.body.categoria_detalle,'Detalle de prueba');assert.equal(provider.params.como,'1');assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('pagos: separación por origen, detalle agrupado y guardado de egreso',async()=>{
 let rows=[{id:1,nit:'9001',nombre:'Beneficiario de prueba',categoria:'FRUVER',modulo_origen:'proveedores',concepto:'Factura de prueba',estado:'proyectado',aprobado:true,monto_proyectado:123456,fecha_proyectada:'2026-10-15'}];
 const t=await setup(({p,method,body})=>{
  if(p==='/pagos-proyectados/')return rows;
  if(p==='/pagos-proyectados/1'&&method==='PUT'){Object.assign(rows[0],body);return rows[0];}
 });try{
  await t.goto('otros-pagos');await eventually(()=>t.calls.some(c=>c.p==='/pagos-proyectados/'&&c.params.origen==='manual'));assert.equal(t.calls.some(c=>c.p==='/pagos-proyectados/candidatos'),false);
  await t.goto('pagos-proyectados');await t.page.getByRole('button').filter({hasText:'Beneficiario de prueba'}).click();await t.page.getByLabel('Número de egreso',{exact:true}).fill('EGR-LOCAL-1');await t.page.getByRole('button',{name:'Guardar egreso',exact:true}).click();await eventually(()=>rows[0].numero_egreso==='EGR-LOCAL-1');assert.ok(rows[0].numero_egreso_fecha);
  assert.ok(t.calls.some(c=>c.p==='/pagos-proyectados/'&&c.params.origen==='aprobado'));assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('auditoría: filtros consultan el servidor y detalle de registro se expande',async()=>{
 const t=await setup(({p})=>p==='/auditoria/'?{total:1,entradas:[{id:1,fecha:'2026-09-30T10:00:00',usuario:'Usuario sintético',empresa:'Empresa de prueba',accion_texto:'Pago creado',grupo:'pagos',resumen:'Registro sintético',accion:'crear',entidad:'pago',detalle:{id:5}}]}:undefined);try{
  await t.goto('auditoria');await t.page.getByText('Registro sintético',{exact:true}).waitFor();await t.page.getByRole('button',{name:'Ver detalle del registro 1'}).click();await t.page.getByText('Registro técnico',{exact:true}).waitFor();assert.match(await t.page.locator('tbody').innerText(),/Detalle: \{"id":5\}/);await t.page.getByLabel('Buscar en auditoría').fill('Registro');await eventually(()=>t.calls.some(c=>c.p==='/auditoria/'&&c.params.q==='Registro'));assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('fallos de API, reintento y expiración de sesión',async()=>{
 let fail=true,expired=false;
 const t=await setup(({p})=>p==='/proveedores/resumen'?(expired?{status:401,body:{detail:'Sesión expirada'}}:fail?{status:500,body:{detail:'Fallo de prueba controlado'}}:[]):undefined);try{
  await t.goto('proveedores');await t.page.getByText('Fallo de prueba controlado',{exact:true}).waitFor();fail=false;await t.page.getByRole('button',{name:'Reintentar',exact:true}).click();await t.page.getByRole('heading',{name:'Sin datos importados'}).waitFor();
  expired=true;await t.page.goto('http://127.0.0.1:4201/presupuesto/proveedores');await t.page.getByRole('button',{name:'Volver a iniciar sesión en Nexa',exact:true}).waitFor();assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});


test('presupuesto con datos: impuestos, resumen, edición mensual, nómina y exportaciones',async()=>{
 const monthly=structuredClone(mensualPrueba);monthly.impuestos_estampillas_seguros={detalle:[{...monthly.proveedores.detalle[0],nit:'8002',nombre:'Impuesto de prueba'}],total:{'2026-01':120000,'2026-02':130000}};
 const t=await setup(({p,method,body,url})=>{
  if(p==='/presupuesto/mensual/excel')return {download:'export-presupuesto-local'};
  if(p==='/presupuesto/mensual')return monthly;
  if(p==='/presupuesto/periodos/2026-01'&&method==='PUT'){Object.assign(monthly.notas,{'2026-01':body.notas || monthly.notas['2026-01']});return {};}
  if(method==='GET')return respuestaApi(url,true);
  return {};
 });try{
  await t.goto('presupuesto');await t.page.getByRole('heading',{name:'Resumen rápido del presupuesto'}).waitFor();await t.page.locator('#gp-seccion-impuestos tbody').getByText('Impuesto de prueba',{exact:true}).waitFor();
  const contrato=t.page.locator('#gp-seccion-contrato');await contrato.getByRole('button',{name:/Colapsar Ene/}).click();await contrato.getByRole('button',{name:/Mostrar Ene/}).click();
  const celda=contrato.locator('tbody tr').filter({hasText:'Valor Facturado'}).locator('input').first();await celda.fill('180000');assert.equal(await celda.inputValue(),'180000');await celda.press('Tab');await eventually(()=>t.calls.some(c=>c.p==='/presupuesto/periodos/2026-01'&&c.body?.valor_facturado===180000)).catch(e=>{throw new Error(e.message+' '+JSON.stringify(t.calls.filter(c=>c.method==='PUT'))+' errors='+JSON.stringify(t.errors));});
  await t.page.getByRole('button',{name:'Expandir Observaciones',exact:true}).click();await t.page.locator('#gp-seccion-notas textarea').first().fill('Observación sintética');await t.page.locator('#gp-seccion-notas textarea').first().press('Tab');await eventually(()=>t.calls.some(c=>c.body?.notas==='Observación sintética'));
  await t.page.locator('#gp-seccion-nomina').getByRole('button',{name:/Aprobar Salarios Ene/}).click();assert.equal(t.calls.some(c=>c.p.includes('aprobar-concepto')),false);await t.page.getByRole('button',{name:'Cancelar',exact:true}).click();
  let download=t.page.waitForEvent('download');await t.page.getByRole('button',{name:'Descargar Excel del Presupuesto',exact:true}).click();assert.match((await download).suggestedFilename(),/xlsx$/);assert.ok(t.calls.some(c=>c.p==='/presupuesto/mensual/excel'&&c.params.como==='1'));
  download=t.page.waitForEvent('download');await t.page.getByRole('button',{name:'Descargar PDF del Presupuesto',exact:true}).click();const pdf=await download;assert.match(pdf.suggestedFilename(),/pdf$/);await pdf.saveAs(path.join(artifacts,'presupuesto-sintetico.pdf'));
  for(const width of [390,768,1440]){await t.page.setViewportSize({width,height:900});assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('limpieza: exige el nombre exacto y conserva la empresa en la solicitud',async()=>{
 const t=await setup(({url,method})=>method==='GET'?respuestaApi(url,true):{ok:true});try{
  await t.goto('proveedores');await t.page.getByRole('button',{name:'Limpiar',exact:true}).click();const borrar=t.page.getByRole('button',{name:'Borrar todo',exact:true});assert.equal(await borrar.isDisabled(),true);
  await t.page.getByLabel('Confirmar nombre de empresa').fill('Otra empresa');assert.equal(await borrar.isDisabled(),true);assert.equal(t.calls.some(c=>c.method==='DELETE'),false);
  await t.page.getByLabel('Confirmar nombre de empresa').fill('Empresa de prueba');await borrar.click();await eventually(()=>t.calls.some(c=>c.method==='DELETE'&&c.p==='/demo/proveedores'&&c.params.como==='1'));assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('perfil: error de API conserva datos; actualización cambia el nombre en la navegación',async()=>{
 let fail=true;const t=await setup(({p})=>p==='/auth/perfil'?(fail?{status:400,body:{detail:'No se pudo actualizar el perfil de prueba'}}:{nombre:'Nombre actualizado'}):undefined);try{
  await t.goto('proveedores');await t.page.getByTitle('Mi cuenta',{exact:true}).click();await t.page.getByLabel('Nombre completo').fill('Nombre actualizado');await t.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await t.page.getByRole('alert').filter({hasText:'perfil de prueba'}).waitFor();assert.equal(await t.page.getByLabel('Nombre completo').inputValue(),'Nombre actualizado');fail=false;await t.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await eventually(async()=>!(await t.page.getByRole('dialog').count()));assert.match(await t.page.getByTitle('Mi cuenta',{exact:true}).innerText(),/Nombre actualizado/);assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('importación SIIGO: preview, confirmación y resultado con contrato multipart',async()=>{
 const t=await setup(({p})=>p==='/importacion/preview'?{importacion_id:71,modulo:'proveedores',cuenta_puc:'22050501',total_debito:0,total_credito:1000,total_saldo:1000,total_filas:1,total_proveedores:1,proveedores:[{nit:'800',nombre:'Proveedor sintético',categoria:'FRUVER',saldo:1000}],sin_categoria:[],puede_confirmar:true}:p==='/importacion/confirmar/71'?{confirmada:true,total_filas:1,total_proveedores:1,proveedores_sin_categoria:[]}:undefined);try{
  await t.goto('proveedores');await t.page.getByRole('button',{name:'Importar archivo SIIGO',exact:true}).click();await t.page.locator('input[type=file]').setInputFiles({name:'prueba-local.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('archivo sintetico; parser remoto interceptado')});await t.page.getByRole('button',{name:'Importar 1 movimientos →',exact:true}).click();await eventually(()=>t.calls.some(c=>c.p==='/importacion/confirmar/71'));assert.ok(t.calls.find(c=>c.p==='/importacion/preview').headers['content-type'].startsWith('multipart/form-data;'));assert.ok(t.calls.some(c=>c.p==='/importacion/confirmar/71'&&c.params.como==='1'));assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('provisiones: creación envía monto, fecha y categoría reales al endpoint existente',async()=>{
 const t=await setup(({method,body})=>method==='POST'?{id:81,...body}:undefined);try{
  await t.goto('otros-pagos');await t.page.getByRole('button',{name:'Nuevo pago',exact:true}).click();await t.page.getByPlaceholder('Nombre del proveedor o beneficiario').fill('Pago sintético');await t.page.getByLabel('Fecha proyectada',{exact:true}).fill('2026-11-15');await t.page.getByPlaceholder('0',{exact:true}).fill('250000');await t.page.getByRole('button',{name:'Agendar pago',exact:true}).click();await eventually(()=>t.calls.some(c=>c.p==='/pagos-proyectados/'&&c.method==='POST'));const req=t.calls.find(c=>c.p==='/pagos-proyectados/'&&c.method==='POST');assert.equal(req.body.monto_proyectado,250000);assert.equal(req.body.fecha_proyectada,'2026-11-15');assert.equal(req.params.como,'1');assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('importación JSON: valida sintaxis, conserva error del servidor y envía a la empresa seleccionada',async()=>{
 let fail=true;const t=await setup(({p})=>p==='/importacion/estructura'?(fail?{status:422,body:{detail:'Estructura de prueba rechazada'}}:{ok:true,total_movimientos:0,total_proveedores:0}):undefined);try{
  await t.goto('proveedores');await t.page.getByRole('button',{name:'Importar archivo SIIGO',exact:true}).click();await t.page.getByRole('button',{name:'Cargar datos base',exact:true}).click();await t.page.getByLabel('Datos base JSON').fill('{');await t.page.getByRole('button',{name:'Importar datos base',exact:true}).click();await t.page.getByRole('alert').waitFor();assert.equal(t.calls.some(c=>c.p==='/importacion/estructura'),false);
  const body={Proveedores:[],Anticipos:[],CuentasPorCobrar:[],CuentasPorPagar:[]};await t.page.getByLabel('Datos base JSON').fill(JSON.stringify(body));await t.page.getByRole('button',{name:'Importar datos base',exact:true}).click();await t.page.getByRole('alert').filter({hasText:'rechazada'}).waitFor();assert.equal(await t.page.getByLabel('Datos base JSON').inputValue(),JSON.stringify(body));fail=false;await t.page.getByRole('button',{name:'Importar datos base',exact:true}).click();await eventually(async()=>!(await t.page.getByRole('dialog').count()));const request=t.calls.find(c=>c.p==='/importacion/estructura');assert.equal(request.params.como,'1');assert.deepEqual(request.body,body);assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('gráficas: cinco vistas conservan datos con la tipografía de Nexa',async()=>{
 const t=await setup(({url})=>respuestaApi(url,true));try{
  await t.goto('proveedores');for(const title of ['Barras horizontales','Barras verticales','Línea','Área','Donut']){await t.page.getByTitle(title,{exact:true}).click();await t.page.locator('apx-chart svg').first().waitFor();await t.page.waitForTimeout(250);assert.ok(await t.page.locator('apx-chart').innerHTML());}
  assert.match(await t.page.locator('.gp-app').evaluate(el=>getComputedStyle(el).fontFamily),/Poppins/);assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('roles GP: contador sin administración y gerente de solo lectura sin acciones de edición',async()=>{
 for(const role of [{...session,rol:'contador',multiples_empresas:false,puede_aprobar:false},{...session,rol:'gerente',solo_lectura:true,puede_aprobar:false,puede_operar_pagos:false}]){
  const t=await setup(({url})=>respuestaApi(url,true),{role});try{
   await t.goto('presupuesto');assert.equal(await t.page.getByRole('button',{name:/Administración/}).count(),0);
   if(role.rol==='gerente'){assert.equal(await t.page.getByRole('button',{name:'Editar contrato',exact:true}).isDisabled(),true);assert.equal(await t.page.locator('app-gp-celda-monto input').count(),0);}
   await t.goto('pagos-proyectados');assert.equal(await t.page.getByRole('button',{name:'Limpiar workspace',exact:true}).count(),0);assert.equal(t.calls.some(c=>['PUT','POST','DELETE'].includes(c.method)),false);assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
 }
});

test('contrato: validación, fechas independientes, moneda y guardado conservan el contrato de API',async()=>{
 const t=await setup(({url,method,body})=>method==='PUT'?body:respuestaApi(url,true));try{
  await t.goto('presupuesto');await t.page.getByRole('button',{name:'Editar contrato',exact:true}).click();const modal=t.page.getByRole('dialog',{name:'Datos del contrato',exact:true});assert.equal(await t.page.evaluate(()=>document.elementFromPoint(5,5)?.classList.contains('gp-dialog-backdrop')),true);await modal.getByLabel('Valor inicial del contrato',{exact:true}).fill('0');await modal.getByRole('button',{name:'Guardar contrato',exact:true}).click();await modal.getByRole('alert').filter({hasText:'mayor a cero'}).waitFor();assert.equal(t.calls.some(c=>c.p==='/presupuesto/contrato'&&c.method==='PUT'),false);
  await modal.getByLabel('Valor inicial del contrato',{exact:true}).fill('12500000');await modal.getByLabel('El presupuesto usa las mismas fechas del contrato').uncheck();await modal.getByLabel('Fecha inicial del presupuesto',{exact:true}).fill('2026-02-01');await modal.getByLabel('Fecha final del presupuesto',{exact:true}).fill('2026-03-31');await modal.getByRole('button',{name:'Guardar contrato',exact:true}).click();await eventually(()=>t.calls.some(c=>c.p==='/presupuesto/contrato'&&c.method==='PUT'));const body=t.calls.find(c=>c.p==='/presupuesto/contrato'&&c.method==='PUT').body;assert.equal(body.valor_inicial_contrato,12500000);assert.equal(body.fecha_inicial_presupuesto,'2026-02-01');assert.equal(body.plazo_cxc_dias,45);assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});

test('empresas Nexa: editar, desactivar y retirar conserva el ID de workspace',async()=>{
 let rows=[{id:-77,empresa_id:77,nombre:'Empresa local',username:'empresa_local',rol:'contador',es_workspace:true,activo:true,solo_lectura:false,empresa_ids:[]}];const t=await setup(({p,method,body})=>{if(p==='/usuarios/')return rows;if(p==='/usuarios/-77'&&method==='PUT'){Object.assign(rows[0],body);return rows[0];}if(p==='/usuarios/-77'&&method==='DELETE'){rows=[];return {};}});try{
  await t.goto('usuarios');await t.page.getByRole('button',{name:'Editar',exact:true}).click();await t.page.getByLabel('Nombre de la empresa',{exact:true}).fill('Empresa corregida');await t.page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await t.page.getByText('Empresa corregida',{exact:true}).waitFor();assert.equal(await t.page.getByRole('button',{name:'Cambiar clave de Empresa corregida',exact:true}).count(),0);await t.page.getByRole('button',{name:'Desactivar',exact:true}).click();await eventually(()=>rows[0].activo===false);await t.page.getByTitle('Retirar empresa del Gestor',{exact:true}).click();assert.equal(t.calls.some(c=>c.method==='DELETE'),false);await t.page.getByRole('dialog',{name:'Retirar empresa',exact:true}).getByRole('button',{name:'Retirar empresa',exact:true}).click();await eventually(()=>rows.length===0);assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();}
});
