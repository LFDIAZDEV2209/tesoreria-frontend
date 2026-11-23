// APIs interceptadas y datos sintéticos exclusivos de pruebas; no conecta a bases reales.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {session,empresas,respuestaApi,contratoPrueba,mensual} from './fixtures.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve('dist/kpi-management-platform/browser'),artifacts=path.resolve('testing/gp-parity/artifacts/periodos');
let server,browser,base;
before(async()=>{
  await mkdir(artifacts,{recursive:true});
  server=createServer(async(req,res)=>{
    try{
      let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      let bytes;try{bytes=await readFile(file);}catch{file=path.join(root,'index.html');bytes=await readFile(file);}
      const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.json':'application/json'};
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'}).end(bytes);
    }catch{res.writeHead(500).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
function year(anio){return {anio,meses:Array.from({length:12},(_,i)=>({periodo:anio+'-'+String(i+1).padStart(2,'0'),creado:true,estado:anio===2026&&[7,8].includes(i)?'CERRADO':'VACIO',empresasConDatos:anio===2026&&[7,8].includes(i)?1:0,empresasCerradas:anio===2026&&[7,8].includes(i)?1:0}))};}
function fila(periodo){const sep=periodo==='2026-09';return {empresaId:1,nombreEmpresa:'Empresa de prueba',responsable:'Contador de prueba',totalAprobado:sep?100000:80000,totalPagado:40000,totalPendientePago:sep?60000:40000,totalDisponible:120000,tieneDatos:true,cerrado:true,historicoId:sep?9:8,fuente:'HISTORICO',archivo:null,cargadoEn:'2026-10-06T10:00:00-05:00'};}
const foto={historico:{id:9,empresaId:1,empresaNombre:'Empresa de prueba',periodo:'2026-09',generadoEn:'2026-10-06T10:00:00-05:00',usuarioId:1,usuarioNombre:'prueba',versionFormato:1,sha256:'prueba'},vista:{empresa:{id:1,name:'Empresa de prueba'},contrato:{...contratoPrueba,fecha_inicial:'2026-09-01',fecha_final:'2026-10-31'},mensual:{...mensual,meses:['2026-09','2026-10'],filas_contrato:[{concepto:'Valor Facturado',campo:'valor_facturado',editable:true,valores:{'2026-09':942000,'2026-10':777777}}],filas_flujo_caja:[{concepto:'TOTAL DISPONIBLE',valores:{'2026-09':120000,'2026-10':777777}}]},consolidado:[{categoria:'FRUVER',proveedores:100,anticipos:0,cx_pagar:0,cx_cobrar:0,impuestos:0,total:-100}],detalle:[],resumenProvisiones:{},categorias:['FRUVER']},secciones:{}};
function vistaModulo(modulo,nombre){
  const filas=[{id:1,nit:'900001',nombre,categoria:'FRUVER',fecha:'2025-03-15',fecha_proyectada:'2025-03-15',modulo_origen:modulo==='otros-pagos'?'manual':'proveedores',comprobante:modulo==='proveedores'?'SEP-REAL':'ANTERIOR-CONSERVADO',debito:10,credito:50,saldo:-40,monto_proyectado:40,estado:'pagado',aprobado:true}];
  return {historico:foto.historico,presentacion:{empresa:foto.vista.empresa,categorias:['FRUVER'],filas,fuentes:{movimientos:[],pagos:[],terceros:[],categorias_presupuesto:[],nomina_sugeridos:[]}},filas:{content:filas,page:0,size:50,totalElements:1,totalPages:1}};
}
async function setup(route='/presupuesto/resumen-gerencial?periodo=2026-10',options={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),calls=[],errors=[],years=[year(2026)];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
    const p=url.pathname.replace('/api/gp',''),method=route.request().method();calls.push({p,method,periodo:url.searchParams.get('periodo')});
    if(p==='/periodos/seleccion'){
      if(options.falloCatalogo)return route.fulfill({status:400,json:{detail:'Período inválido. Usa AAAA-MM.'}});
      return route.fulfill({json:{anios:years,historicos:options.soloOctubre?{'2026-10':152,...(options.septiembreGuardado?{'2026-09':9}:{})}:{'2026-08':8,'2026-09':9,...(options.cierreOctubre?{'2026-10':152}:{})},datosEmpresa:options.soloOctubre?[]:['2026-10']}});
    }
    if(p==='/periodos/anios'&&method==='POST'){const body=route.request().postDataJSON();years.push(year(body.anio));return route.fulfill({status:201});}
    if(/^\/periodos\/\d{4}-\d{2}\/historico\/presupuesto$/.test(p)){
      const snapshot=structuredClone(foto);
      if(options.septiembreGuardado && p.includes('2026-09')){
        snapshot.vista.mensual.notas={'2026-09':'DATOS DE EJEMPLO solicitados para septiembre de 2026.'};
        snapshot.vista.mensual.filas_contrato[0].valores['2026-09']=40000000;
      }
      if(options.cierreOctubre && p.includes('2026-10')){
        snapshot.historico.id=152;snapshot.historico.periodo='2026-10';
        snapshot.vista.mensual.meses=['2026-10','2026-11'];
        for(const fila of [...snapshot.vista.mensual.filas_contrato,...snapshot.vista.mensual.filas_flujo_caja])fila.valores={'2026-10':fila.valores['2026-09'],'2026-11':fila.valores['2026-10']};
        if(options.historicoAntiguo){
          snapshot.vista.mensual.meses=['2025-03','2026-07'];
          for(const fila of [...snapshot.vista.mensual.filas_contrato,...snapshot.vista.mensual.filas_flujo_caja])fila.valores={'2025-03':0,'2026-07':fila.valores['2026-10']};
        }
      }
      return route.fulfill({json:snapshot});
    }
    if(/^\/periodos\/\d{4}-\d{2}\/historico\//.test(p))return route.fulfill({json:vistaModulo(p.split('/').at(-1),'Tercero conservado')});
    if(p==='/periodos/comparar'){
      const origen=url.searchParams.get('origen'),destino=url.searchParams.get('destino'),a=fila(origen),b=fila(destino),valores={};
      for(const [k,f]of[['aprobado','totalAprobado'],['pendiente','totalPendientePago'],['pagado','totalPagado'],['liquidez','totalDisponible']])valores[k]={origen:a[f],destino:b[f],diferencia:b[f]-a[f],porcentaje:100*(b[f]-a[f])/Math.abs(a[f])};
      return route.fulfill({json:{origen,destino,filas:[{empresaId:1,nombreEmpresa:a.nombreEmpresa,responsable:a.responsable,datosOrigen:true,datosDestino:true,fuenteOrigen:'HISTORICO',fuenteDestino:'HISTORICO',valores}],totales:valores}});
    }
    if(/^\/periodos\/\d{4}-\d{2}$/.test(p))return route.fulfill({json:{periodo:p.split('/')[2],filas:['2026-08','2026-09'].includes(p.split('/')[2])?[fila(p.split('/')[2])]:[]}});
    if(p==='/historicos')return route.fulfill({json:{content:[foto.historico,{...foto.historico,id:8,periodo:'2025-08'}],page:0,size:20,totalElements:2,totalPages:1}});
    if(p==='/historicos/9')return route.fulfill({json:foto});
    if(/^\/historicos\/9\/modulos\//.test(p))return route.fulfill({json:vistaModulo(p.split('/').at(-1),'Registro completo conservado '+p.split('/').at(-1))});
    return route.fulfill({json:respuestaApi(url,true)});
  });
  await context.addInitScript(()=>{localStorage.setItem('currentUser',JSON.stringify({id:99,username:'test',roles:[{name:'SUPER_ADMIN'}],token:'token-prueba'}));localStorage.setItem('gp_nexa_empresa_id','1');});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+route);await page.locator('.gp-nexa-context').waitFor({state:'attached'});
  await page.waitForFunction(()=>!document.querySelector('.gp-global-period')?.textContent.includes('Consultando período'));
  return {context,page,calls,errors,habilitarCatalogo:()=>{options.falloCatalogo=false;}};
}
test('selector global, listado original y consulta de septiembre en presupuesto y módulos',async()=>{
  const t=await setup();try{
    await t.page.getByRole('heading',{name:'Todas las Empresas',exact:true}).waitFor();
    assert.equal(await t.page.locator('.gp-periodos-create').count(),0);
    await t.page.getByLabel('Mes del gestor',{exact:true}).selectOption('2026-09',{force:true});
    await t.page.locator('.gp-nexa-tabs a').filter({hasText:/^Presupuesto$/}).click();
    await t.page.getByRole('heading',{name:'Presupuesto histórico',exact:true}).waitFor();
    assert.match(await t.page.locator('app-historico-presupuesto').textContent(),/942[.,]000/);
    assert.doesNotMatch(await t.page.locator('app-historico-presupuesto').textContent(),/777[.,]777/);
    assert.equal(await t.page.locator('app-historico-presupuesto input:not([disabled])').count(),0);
    await t.page.locator('.gp-nexa-tabs a').filter({hasText:/^Proveedores$/}).click();
    await t.page.getByText('SEP-REAL',{exact:true}).waitFor();
    assert.ok(t.calls.some(c=>c.p==='/periodos/2026-09/historico/proveedores'));
    await t.page.locator('.gp-nexa-tabs a').filter({hasText:/^Proyección de Egresos$/}).click();
    await t.page.getByRole('heading',{name:'Proyección de Egresos',exact:true}).waitFor();
    await t.page.getByText('Tercero conservado',{exact:true}).waitFor();
    await t.page.getByLabel('Mes del gestor',{exact:true}).selectOption('2026-10',{force:true});
    await t.page.waitForFunction(()=>document.querySelector('app-pagos-proyectados-page')).catch(async error=>{
      throw new Error(error.message+' Estado: '+await t.page.locator('.gp-native-content').textContent()+' Errores: '+JSON.stringify(t.errors)+' Consultas: '+JSON.stringify(t.calls.slice(-12)));
    });
    await t.page.waitForTimeout(250);
    assert.ok(t.calls.some(c=>c.p.startsWith('/pagos-proyectados')&&c.periodo==='2026-10'));
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
test('octubre cerrado se consulta desde Presupuesto y un error usa una tarjeta integrada recuperable',async()=>{
  const t=await setup('/presupuesto/presupuesto?periodo=2026-10',{falloCatalogo:true,cierreOctubre:true});try{
    await t.page.getByRole('heading',{name:'No pudimos consultar Octubre de 2026',exact:true}).waitFor();
    assert.doesNotMatch(await t.page.locator('.gp-native-content').textContent(),/Período inválido|AAAA-MM/);
    assert.match(await t.page.locator('.gp-global-period').textContent(),/Pendiente de consulta/);
    assert.doesNotMatch(await t.page.locator('.gp-global-period').textContent(),/Mes no creado/);
    await t.page.screenshot({path:path.join(artifacts,'consulta-periodo-error.png'),fullPage:true,animations:'disabled'});
    t.habilitarCatalogo();await t.page.getByRole('button',{name:'Actualizar período',exact:true}).click();
    await t.page.getByRole('heading',{name:'Presupuesto histórico',exact:true}).waitFor();
    assert.match(await t.page.locator('.gp-global-period').textContent(),/Histórico consolidado/);
    assert.ok(t.calls.some(c=>c.p==='/periodos/2026-10/historico/presupuesto'));
    assert.match(await t.page.locator('app-historico-presupuesto').textContent(),/942[.,]000/);
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
test('octubre conserva la matriz antigua cuando el contrato archivado termina en julio',async()=>{
  const t=await setup('/presupuesto/presupuesto?periodo=2026-10',{cierreOctubre:true,historicoAntiguo:true});try{
    await t.page.getByRole('heading',{name:'Presupuesto histórico',exact:true}).waitFor();
    await t.page.getByText(/El cierre conserva la vista presupuestal de Mar 2025 a Jul 2026/).waitFor();
    assert.match(await t.page.locator('app-historico-presupuesto').textContent(),/942[.,]000/);
    assert.match(await t.page.locator('.gp-global-period').textContent(),/Octubre de 2026.*Histórico consolidado/s);
    assert.equal(await t.page.locator('app-historico-presupuesto input:not([disabled])').count(),0);
    await t.page.screenshot({path:path.join(artifacts,'octubre-matriz-conservada.png'),fullPage:true,animations:'disabled'});
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
test('Históricos reúne las vistas y compara septiembre guardado con octubre sin llenar otros meses',async()=>{
  const t=await setup('/presupuesto/comparar-presupuestos?periodo=2026-10&origen=2026-10&destino=2026-09',{cierreOctubre:true,soloOctubre:true,septiembreGuardado:true,historicoAntiguo:true});try{
    const panels=t.page.locator('.gp-compare-panel');await panels.nth(0).getByRole('heading',{name:'Presupuesto histórico',exact:true}).waitFor();
    await panels.nth(1).getByRole('heading',{name:'Presupuesto de ejemplo',exact:true}).waitFor();
    assert.match(t.page.url(),/\/historicos\/comparar-presupuestos/);
    assert.equal(await t.page.locator('.gp-nexa-tabs a').filter({hasText:/^Creación de periodos$|^Comparar presupuestos$/}).count(),0);
    assert.match(await panels.nth(0).textContent(),/942[.,]000/);assert.match(await panels.nth(1).textContent(),/40[.,]000[.,]000/);
    assert.match(await panels.nth(1).textContent(),/guardados y consolidados/);
    assert.equal(await t.page.getByLabel('Usar ejemplo de septiembre',{exact:true}).count(),0);
    const bounds=await panels.evaluateAll(ps=>ps.map(p=>{const r=p.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};}));
    assert.ok(bounds[0].x<bounds[1].x);assert.ok(Math.abs(bounds[0].y-bounds[1].y)<2);
    assert.equal(await panels.locator('app-historico-presupuesto input:not([disabled])').count(),0);
    await t.page.waitForTimeout(1800);
    await t.page.screenshot({path:path.join(artifacts,'presupuestos-lado-a-lado-vista.png'),animations:'disabled'});
    await t.page.screenshot({path:path.join(artifacts,'presupuestos-lado-a-lado.png'),fullPage:true,animations:'disabled'});
    for(const width of [1440,768,390]){
      await t.page.setViewportSize({width,height:1000});await t.page.waitForTimeout(350);
      assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Desbordamiento en comparativa: '+width);
    }
    await t.page.setViewportSize({width:1440,height:1000});
    await t.page.getByLabel('Mes del presupuesto derecho',{exact:true}).fill('2026-08');
    await panels.nth(1).getByRole('heading',{name:'Sin datos en Agosto de 2026',exact:true}).waitFor();
    assert.doesNotMatch(await panels.nth(1).textContent(),/942[.,]000|40[.,]000[.,]000/);
    await t.page.locator('.gp-nexa-tabs a').filter({hasText:/^Presupuesto$/}).click();
    await t.page.getByRole('heading',{name:'Presupuesto histórico',exact:true}).waitFor();
    await t.page.getByLabel('Mes del gestor',{exact:true}).selectOption('2026-09',{force:true});
    await t.page.getByRole('heading',{name:'Presupuesto de ejemplo',exact:true}).waitFor();
    assert.match(await t.page.locator('app-historico-presupuesto').textContent(),/40[.,]000[.,]000/);
    for(const mes of ['2026-08','2026-07']){
      await t.page.getByLabel('Mes del gestor',{exact:true}).selectOption(mes,{force:true});
      await t.page.getByRole('heading',{name:mes==='2026-08'?'Sin datos en Agosto de 2026':'Sin datos en Julio de 2026',exact:true}).waitFor();
      assert.doesNotMatch(await t.page.locator('.gp-native-content').textContent(),/942[.,]000|200[.,]000[.,]000/);
    }
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
test('años, meses y resumen se administran dentro de Históricos, con enlaces antiguos compatibles',async()=>{
  const t=await setup('/presupuesto/periodos?periodo=2026-10');try{
    assert.match(t.page.url(),/\/historicos\/periodos/);
    await t.page.getByRole('heading',{name:'Históricos',exact:true}).waitFor();
    assert.equal(await t.page.locator('nav[aria-label="Secciones de históricos"] a').count(),3);
    assert.equal(await t.page.locator('.gp-global-period').count(),0);
    await t.page.locator('.gp-periodos-summary').first().waitFor();assert.equal(await t.page.locator('input[type=file]').count(),0);
    assert.equal(await t.page.locator('.gp-periodos-summary').count(),2);
    assert.match(await t.page.locator('.gp-periodos-summary').first().textContent(),/100[.,]000/);
    await t.page.getByLabel('Otro período',{exact:true}).selectOption('2026-08');await t.page.getByRole('button',{name:'Comparar',exact:true}).click();
    await t.page.locator('.gp-periodos-table').waitFor();assert.match(await t.page.locator('.gp-periodos-table').textContent(),/-\$\s*20[.,]000/);
    const form=t.page.locator('form').filter({has:t.page.getByRole('heading',{name:'Crear año',exact:true})});
    await form.getByLabel('Año',{exact:true}).fill('2027');await form.getByLabel('Crear los doce meses').check();await form.getByRole('button',{name:'Crear año',exact:true}).click();
    await t.page.waitForFunction(()=>document.querySelector('button.btn-primary')?.disabled===false);
    await t.page.locator('.gp-nexa-tabs a').filter({hasText:/^Presupuesto$/}).click();
    await t.page.waitForFunction(()=>[...document.querySelectorAll('select[aria-label="Año del gestor"] option')].some(o=>o.value==='2027'));
    await t.page.getByLabel('Año del gestor',{exact:true}).selectOption('2027',{force:true});
    await t.page.getByRole('heading',{name:'Sin datos en Octubre de 2027',exact:true}).waitFor();
    await t.page.locator('.gp-nexa-tabs a').filter({hasText:/^Históricos$/}).click();
    await t.page.getByRole('link',{name:'Consultar',exact:true}).first().waitFor();
    assert.equal(await t.page.locator('.gp-global-period').count(),0);
    assert.equal(await t.page.locator('.hist-toolbar input[type=number]').count(),0);
    assert.match(await t.page.locator('.hist-table').textContent(),/2025/);
    assert.ok(t.calls.filter(c=>c.p==='/historicos').length>0);
    for(const width of [1440,768,390]){
      await t.page.setViewportSize({width,height:900});await t.page.waitForTimeout(350);
      assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'desbordamiento '+width);
      await t.page.screenshot({path:path.join(artifacts,'periodo-global-'+width+'.png'),fullPage:true,animations:'disabled'});
    }
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});

test('cada cierre permite recorrer todos los módulos sin filtro global de año o mes',async()=>{
  const t=await setup('/presupuesto/historicos/9?periodo=2026-10');try{
    await t.page.getByText('Consulta histórica – Septiembre de 2026',{exact:true}).waitFor();
    assert.equal(await t.page.locator('.gp-global-period').count(),0);
    for(const [modulo,nombre] of [['proveedores','Proveedores'],['cuentas-pagar','Cuentas por Pagar'],['impuestos','Impuestos, Estampillas y Seguros'],['cuentas-cobrar','Cuentas por Cobrar'],['anticipos','Anticipos'],['otros-pagos','Provisiones'],['pagos-proyectados','Proyección de Egresos']]){
      await t.page.locator('nav[aria-label="Vista histórica"]').getByRole('button',{name:nombre,exact:true}).click();
      await t.page.getByText('Registro completo conservado '+modulo,{exact:true}).waitFor();
      assert.ok(t.calls.some(c=>c.p==='/historicos/9/modulos/'+modulo));
      const contenido=t.page.locator('app-gp-modulo-historico');
      assert.ok(await contenido.locator('app-gp-kpi').count()>0);
      if(['otros-pagos','pagos-proyectados'].includes(modulo)){
        assert.ok(await contenido.locator('.gp-payment-card').count()>0);
        await contenido.locator('.gp-payment-card').first().click();
        await t.page.getByText('2025-03-15',{exact:true}).waitFor();
        assert.equal(await t.page.locator('input[name=numeroEgreso]').count(),0);
        await t.page.getByRole('button',{name:'Cerrar',exact:true}).click();
      }else{
        assert.match(await contenido.locator('.gp-table').textContent(),/2025-03-15/);
        assert.ok(await contenido.locator('apx-chart').count()>0);
        assert.equal(await contenido.getByRole('button',{name:'Importar período',exact:true}).count(),0);
        assert.equal(await contenido.locator('select[aria-label="Categoría del movimiento"]').count(),0);
        if(modulo==='anticipos'){
          await t.page.waitForTimeout(600);
          await t.page.screenshot({path:path.join(artifacts,'anticipos-historico-vista-original.png'),fullPage:true,animations:'disabled'});
        }
      }
    }
    assert.ok(t.calls.every(c=>c.method==='GET'));
    assert.deepEqual(t.errors,[]);
  }finally{await t.context.close();}
});
