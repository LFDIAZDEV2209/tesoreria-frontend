import {browserSession,front,save} from './gpqa-phase2-lib.mjs';
await browserSession('phase2-dom',async({page,evidence})=>{
 await page.goto(front+(process.env.GPQA_PATH||'/presupuesto/otros-pagos?empresaId=91'));
 await page.waitForLoadState('networkidle');
 await page.locator('app-gp-skeleton').first().waitFor({state:'hidden'}).catch(()=>{});
 const text=await page.locator('body').innerText();
 const controls=await page.locator('select,input,button').evaluateAll(es=>es.map(e=>({tag:e.tagName,name:e.getAttribute('name'),aria:e.getAttribute('aria-label'),text:e.tagName==='SELECT'?e.outerHTML:e.textContent?.trim().slice(0,80),placeholder:e.getAttribute('placeholder')})));
 evidence.body=text;evidence.controls=controls;console.log(text);console.log(JSON.stringify(controls));
});
