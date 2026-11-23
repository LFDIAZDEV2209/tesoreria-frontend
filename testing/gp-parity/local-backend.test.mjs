import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const artifacts=path.resolve('testing/gp-parity/artifacts');await mkdir(artifacts,{recursive:true});
const imported=JSON.parse(await readFile('../Tesoreriabd/target/render-import-report.json','utf8'));
const snapshot=JSON.parse(await readFile('../Tesoreriabd/local-data/render-snapshot.json','utf8'));
const populated=snapshot.workspaces.reduce((a,b)=>a.data['movements-proveedores'].length>b.data['movements-proveedores'].length?a:b);
const company=imported.workspaceMapping[populated.id];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,env:{...process.env,TEMP:artifacts,TMP:artifacts}});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const response=await context.request.post('http://127.0.0.1:4201/api/auth/login',{data:{username:'gp_local_admin',password:'GpLocal2026!'}});
assert.equal(response.status(),200,'Local Nexa login');const user=await response.json();
await context.addInitScript(({user,company})=>{localStorage.setItem('currentUser',JSON.stringify(user));localStorage.setItem('gp_nexa_empresa_id',String(company));},{user,company});
const page=await context.newPage(),errors=[],failures=[],external=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().includes('/api/gp/')&&r.status()>=400)failures.push({url:r.url(),status:r.status()});});
page.on('request',r=>{if(/onrender\.com|\/gp-api\//.test(r.url()))external.push(r.url());});
page.setDefaultTimeout(15000);
try{
 for(const route of ['proveedores','anticipos','cuentas-pagar','cuentas-cobrar','impuestos','presupuesto','otros-pagos','pagos-proyectados','resumen-gerencial','categorias','maestro-proveedores','usuarios','auditoria']){
  try{
   await page.goto(`http://127.0.0.1:4201/presupuesto/${route}`);
   await page.locator('.gp-app h1').first().waitFor();await page.waitForLoadState('networkidle');
   assert.ok((await page.locator('.gp-app h1').allTextContents()).some(Boolean));
   for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} overflow ${width}`);}
   assert.equal(await page.locator('.gp-app').evaluate(el=>getComputedStyle(el).getPropertyValue('--bg-surface').trim()),'#ffffff');
   assert.equal(await page.locator('app-sidebar aside').isVisible(),true);
   await page.screenshot({path:path.join(artifacts,`local-${route}.png`),fullPage:true});results.push({route,ok:true});
  }catch(e){results.push({route,ok:false,error:e.message});}
 }
 await page.goto('http://127.0.0.1:4201/presupuesto/usuarios');await page.locator('.gp-app h1').waitFor();await page.waitForLoadState('networkidle');
 await page.getByRole('button',{name:'Nueva empresa',exact:false}).click();
 await page.getByLabel('Nombre de la empresa',{exact:true}).fill('Empresa sintética navegador');
 const code=`gp-browser-${Date.now()}`;await page.getByLabel('Código de la empresa',{exact:true}).fill(code);
 const saved=page.waitForResponse(r=>r.url().includes('/api/gp/usuarios/')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Crear empresa',exact:true}).click();assert.equal((await saved).status(),200);await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByText(code,{exact:true}).waitFor();results.push({route:'company creation via Angular',ok:true});
 assert.deepEqual(external,[],'No Render requests');assert.deepEqual(failures,[],'No failed GP API responses');assert.deepEqual(errors,[],'No browser JavaScript errors');
}catch(e){results.push({route:'integration',ok:false,error:e.message});}
finally{await writeFile(path.join(artifacts,'local-browser-results.json'),JSON.stringify({results,failures,errors,external},null,2));await browser.close();}
console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,apiFailures:failures.length,javascriptErrors:errors.length,renderRequests:external.length}));
for(const r of results.filter(r=>!r.ok))console.error(r.route,r.error.slice(0,300));process.exitCode=results.some(r=>!r.ok)?1:0;
