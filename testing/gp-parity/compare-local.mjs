import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { respuestaApi } from './fixtures.mjs';
const artifacts = path.resolve('testing/gp-parity/artifacts');
const root = path.join(artifacts, 'reference');
await mkdir(artifacts, {recursive:true});
const server = createServer(async(req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  const relative = /^\/assets\/[\w.-]+$/.test(pathname) ? pathname.slice(1) : 'index.html';
  try { const data=await readFile(path.join(root,relative)); res.setHeader('Content-Type', relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':'text/html');res.end(data); }
  catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(4202,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,env:{...process.env,TEMP:artifacts,TMP:artifacts}});
const report=[];const populated=process.argv.includes('--populated');
try {
  for(const app of ['reference','angular']) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='127.0.0.1') return route.abort();
      if(/^\/(?:api|gp-api)\//.test(url.pathname)) return route.fulfill({json:respuestaApi(url,populated)});
      return route.continue();
    });
    await context.addInitScript(()=>{
      localStorage.setItem('currentUser',JSON.stringify({id:99,username:'fixture-local',roles:[{name:'SUPER_ADMIN'}],token:'fixture-only'}));
      localStorage.setItem('gp_empresa_id','1'); localStorage.setItem('gp_viendo_como','1');
      localStorage.setItem('gp-theme','dark');
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/ERROR|TypeError|ReferenceError|NG\d{4}/.test(m.text()))errors.push(m.text());});
    for(const [name,ref,local] of [['resumen','resumen-gerencial','resumen-gerencial'],['proveedores','proveedores','proveedores'],['presupuesto','presupuesto','presupuesto'],['provisiones','otros-pagos','otros-pagos'],['pagos','pagos-proyectados','pagos-proyectados'],['categorias','admin/categorias','categorias'],['usuarios','admin/usuarios','usuarios'],['maestro','admin/proveedores','maestro-proveedores'],['auditoria','admin/auditoria','auditoria']]) {
      await page.goto(`http://127.0.0.1:${app==='reference'?4202:4201}/${app==='reference'?ref:'presupuesto/'+local}`);
      await page.waitForTimeout(1800);
      report.push({app,name,errors:[...errors],headings:await page.locator('h1,h2').allTextContents(),text:await page.locator('body').innerText()});
      await page.screenshot({path:path.join(artifacts,`${app}-${name}${populated?'-data':''}.png`),fullPage:true});
      if(process.argv.includes('--dialogs')) {
        const action={proveedores:'Importar período',provisiones:'Nuevo pago',categorias:'Nueva categoría',usuarios:'Nueva empresa',maestro:'Nuevo proveedor'}[name];
        if(action) {
          await page.getByRole('button',{name:new RegExp(action,'i')}).click();
          await page.waitForTimeout(400);
          await page.screenshot({path:path.join(artifacts,`${app}-${name}-dialog.png`),fullPage:true});
          report.push({app,name:name+'-dialog',errors:[...errors],text:await page.locator('body').innerText()});
          await page.keyboard.press('Escape');
        }
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(`http://127.0.0.1:${app==='reference'?4202:4201}/${app==='reference'?'proveedores':'presupuesto/proveedores'}`);
    await page.waitForTimeout(1800);
    await page.screenshot({path:path.join(artifacts,`${app}-mobile.png`),fullPage:true});
    await context.close();
  }
  await writeFile(path.join(artifacts,populated?'comparison-data.json':'comparison.json'),JSON.stringify(report,null,2));
  console.log(report.map(({app,name,headings,errors})=>({app,name,headings,errors})));
} finally {await browser.close();server.close();}
