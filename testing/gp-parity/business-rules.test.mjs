import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {respuestaApi,session,empresas,mensualPrueba} from './fixtures.mjs';
const origin=process.env.GP_RULES_ORIGIN||'http://127.0.0.1:4203';
let browser;
before(async()=>{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});});
after(()=>{void browser?.close();});
async function setup(rol,permisos,handler=()=>undefined){
 const context=await browser.newContext();const calls=[];
 await context.addInitScript(()=>{localStorage.setItem('currentUser',JSON.stringify({id:99,username:'fixture',roles:[{name:'USER'}],token:'fixture'}));localStorage.setItem('gp_nexa_empresa_id','1');});
 await context.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace(/^\/api\/gp/,'');
  calls.push({p,method:req.method(),body:req.postData()});
  let payload=handler(p,req);
  if(payload===undefined){
   if(p==='/auth/estado')payload={...session,rol:'contador',rol_nexa:rol,permisos,puede_aprobar:false};
   else if(p==='/auth/contadores')payload=empresas;
   else if(p==='/periodos/seleccion')payload={anios:[{anio:2026,meses:[{periodo:'2026-01',creado:true},{periodo:'2026-02',creado:true}]}],historicos:{},datosEmpresa:['2026-01','2026-02'],presupuestosEmpresa:['2026-01','2026-02']};
   else payload=respuestaApi(url,true);
  }
  await route.fulfill({json:payload});
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);
 return {context,page,calls,goto:async path=>{await page.goto(origin+'/presupuesto/'+path);await page.locator('.gp-app').waitFor();}};
}
test('Director Contable accede a abrir meses y a catálogos sin consultar históricos restringidos',async()=>{
 const t=await setup('director_contable',['presupuesto.ver','presupuesto.abrir_periodos','admin.categorias']);
 try{
  await t.goto('historicos/periodos');
  await t.page.getByRole('button',{name:'Crear mes',exact:true}).waitFor();
  assert.equal(t.calls.some(c=>c.p.startsWith('/historicos')),false);
  await t.goto('maestro-proveedores');
  await t.page.getByRole('button',{name:'Nuevo proveedor',exact:true}).waitFor();
  assert.ok(t.page.url().includes('maestro-proveedores'));
 }finally{await t.context.close();}
});
test('contador con edición de datos no recibe el acceso para abrir meses',async()=>{
 const t=await setup('contador',['presupuesto.ver','presupuesto.editar_periodos','historicos.crear','historicos.ver']);
 try{await t.goto('historicos/periodos');await t.page.getByRole('heading',{name:'Históricos',exact:true}).waitFor();assert.equal(await t.page.getByRole('button',{name:'Crear mes',exact:true}).count(),0);}
 finally{await t.context.close();}
});
test('nómina manual emite guardado desde la celda editable',async()=>{
 const t=await setup('contador',['presupuesto.ver','presupuesto.editar_periodos','pagos.ver'],(p,req)=>{
  if(p==='/presupuesto/mensual')return {...mensualPrueba,contrato:{...mensualPrueba.contrato,estado_aprobacion:'rechazado'}};
  if(p.startsWith('/presupuesto/periodos/')&&req.method()==='PUT')return {};
 });
 try{
  await t.goto('presupuesto?periodo=2026-01');
  const input=t.page.locator('tr').filter({hasText:'Salarios'}).locator('app-gp-celda-monto input').first();
  await input.fill('123456');
  await Promise.all([t.page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/presupuesto/periodos/')),input.press('Tab')]);
  assert.ok(t.calls.some(c=>c.method==='PUT'&&c.p.includes('/presupuesto/periodos/')&&c.body.includes('123456')));
 }finally{await t.context.close();}
});
test('importador muestra advertencias de nómina devueltas por el servidor',async()=>{
 const aviso='La nómina del Excel se ignora; los valores manuales se conservan.';
 const t=await setup('contador',['modulos.importar','presupuesto.ver'],p=>p==='/importacion/maestro'?{ok:true,empresaId:1,nombreEmpresa:'Empresa de prueba',nombreArchivo:'fixture.xlsx',modulos:[],contrato:null,periodos:[],pagosProyectados:0,impuestosMovimientos:0,advertencias:[aviso]}:undefined);
 try{
  await t.goto('subir-archivos');
  await t.page.getByRole('button',{name:'Ya tengo la plantilla'}).click().catch(async e=>{console.error('IMPORT STEP 1',await t.page.locator('body').innerText());throw e;});
  await t.page.locator('input[type=file][accept=".xlsx,.xls"]').setInputFiles({name:'fixture.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture interceptada')});
  await t.page.getByRole('button',{name:/Importar archivo|Importar Excel|Importar ahora/}).first().click();
  await t.page.getByRole('button',{name:'Confirmar importación'}).click();
  await t.page.getByText(aviso,{exact:true}).waitFor().catch(async e=>{console.error('IMPORT RESULT',await t.page.locator('body').innerText());throw e;});
 }finally{await t.context.close();}
});
test('API real: Adriana conserva acceso de Tesorería en empresa 304 y no puede abrir meses',async()=>{
 const context=await browser.newContext({extraHTTPHeaders:{'X-User-Name':'adriana.maria.suarez.morelo'}});
 try{
  const estado=await context.request.get(origin+'/api/gp/auth/estado');assert.equal(estado.status(),200);
  const data=await estado.json();assert.equal(data.rol_nexa,'tesorero');assert.ok(!data.permisos.includes('presupuesto.abrir_periodos'));
  const pagos=await context.request.get(origin+'/api/gp/pagos-proyectados/?empresaId=304&page=0&size=10');assert.equal(pagos.status(),200);
 }finally{await context.close();}
});
