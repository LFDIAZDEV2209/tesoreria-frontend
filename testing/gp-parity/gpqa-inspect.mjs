import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const artifacts = fileURLToPath(new URL('./artifacts/gpqa/', import.meta.url));
await mkdir(artifacts, {recursive:true});
const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', env:{...process.env,TEMP:artifacts,TMP:artifacts}});
try {
 const page = await browser.newPage();
 await page.goto('http://localhost:4202' + (process.env.QA_PATH || '/'));
 await page.waitForLoadState('networkidle');
 console.log('URL',page.url());
 console.log(await page.locator('body').innerText());
 console.log(await page.locator('input').evaluateAll(es=>es.map(e=>({type:e.type,id:e.id,name:e.name,placeholder:e.placeholder}))));
 console.log('IMAGES',await page.locator('img').evaluateAll(es=>es.map(e=>({src:e.getAttribute('src'),alt:e.alt,complete:e.complete,width:e.naturalWidth,cls:e.className}))));
 if(process.env.QA_LOGIN==='1') {
   page.on('response',r=>{if(r.url().includes('/api/'))console.log('API',r.status(),r.url());});
   await page.getByPlaceholder('ejemplo@correo.com').fill('gpqa.contador@example.invalid');
   await page.locator('input[type=password]').fill(process.argv[2] || process.env.GPQA_PASSWORD || '');
   await page.getByRole('button',{name:'Iniciar SesiÃ³n'}).click();
   await page.waitForURL('**/presupuesto/presupuesto');
   await page.waitForLoadState('networkidle');
   console.log('AFTER LOGIN',page.url(),await page.locator('body').innerText());
   console.log('SELECTS',await page.locator('select').evaluateAll(es=>es.map(e=>({aria:e.getAttribute('aria-label'),html:e.outerHTML}))));
 }
 await page.screenshot({path:artifacts+'login.png',fullPage:true});
} finally {await browser.close();}
