import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {respuestaApi} from './fixtures.mjs';

const artifacts=path.resolve('testing/gp-parity/artifacts');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,env:{...process.env,TEMP:artifacts,TMP:artifacts}});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1')return route.abort();
  if(/^\/(gp-api|api)\//.test(url.pathname))return route.fulfill({json:respuestaApi(url,true)});
  return route.continue();
});
await context.addInitScript(()=>{
  localStorage.setItem('currentUser',JSON.stringify({id:99,username:'fixture-local',roles:[{name:'SUPER_ADMIN'}],token:'fixture-only'}));
  localStorage.setItem('gp_empresa_id','1');
  // Incluso una preferencia oscura anterior debe respetar ahora el diseño Nexa.
  localStorage.setItem('gp-theme','dark');
});
const page=await context.newPage(),errors=[],report=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/ERROR|TypeError|ReferenceError|NG\d{4}/.test(m.text()))errors.push(m.text());});
try{
  for(const route of ['proveedores','presupuesto','otros-pagos','usuarios','auditoria']){
    await page.goto('http://127.0.0.1:4201/presupuesto/'+route);
    await page.waitForTimeout(1200);
    await page.screenshot({path:path.join(artifacts,`nexa-${route}.png`),fullPage:route!=='presupuesto'});
    report.push({route,width:1440,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors:[...errors]});
  }
  for(const width of [768,390]){
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:4201/presupuesto/proveedores');
    await page.waitForTimeout(1200);
    await page.screenshot({path:path.join(artifacts,`nexa-proveedores-${width}.png`),fullPage:true});
    report.push({route:'proveedores',width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors:[...errors]});
  }
  await page.getByRole('button',{name:'Importar período',exact:true}).click();
  await page.waitForTimeout(300);
  await page.screenshot({path:path.join(artifacts,'nexa-importacion-mobile.png')});
  await writeFile(path.join(artifacts,'nexa-preview.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await browser.close();}
