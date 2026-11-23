import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
export const origin='http://localhost:8081', front='http://localhost:4202';
export const dir=process.env.GPQA_ARTIFACTS_DIR || fileURLToPath(new URL('./artifacts/gpqa/',import.meta.url));
await mkdir(dir,{recursive:true});
export const run='GPQA-008-20261015';
export async function save(name,data){await writeFile(dir+name+'.json',JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v,2));}
export async function load(name,fallback={}){try{return JSON.parse(await readFile(dir+name+'.json','utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export const manifest=await load('phase2-manifest',{run,payments:{},mutations:{},uploads:[]});
export async function persist(){await save('phase2-manifest',manifest);}
export const trace=[];
export async function api(path,{method='GET',body,user='gpqa.contador',form}={}){
  assert.ok(!(form && dir.replaceAll('\\','/').endsWith('/phase3/')),'Phase3 forbids multipart uploads; preserve the existing S3 object');
  const startedAt=new Date().toISOString();
  const r=await fetch(origin+path,{method,headers:{'X-User-Name':user,...(body?{'Content-Type':'application/json'}:{})},body:form || (body?JSON.stringify(body):undefined),signal:AbortSignal.timeout(60000)});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  const result={method,path,user,status:r.status,body:data,startedAt};
  const safe=JSON.parse(JSON.stringify({...result,requestBody:body},(key,value)=>key==='url'&&typeof value==='string'&&value.includes('X-Amz-')?value.split('?')[0]+'?[presigned-redacted]':value));
  trace.push(safe);await save('phase2-api-trace',trace);
  return result;
}
// Durable mutation ledger prevents accidental duplicate seeds and uploads on repeat runs.
export async function once(key,path,options){
  if(manifest.mutations[key]){assert.notEqual(manifest.mutations[key].status,'PENDING','Ambiguous mutation; inspect manually, never retry');return manifest.mutations[key];}
  manifest.mutations[key]={status:'PENDING',path,method:options.method};await persist();
  const result=await api(path,options);manifest.mutations[key]=result;await persist();return result;
}
export function cents(value){
  const m=String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);assert.ok(m,'Exact decimal amount required: '+value);
  return (m[1]?-1n:1n)*(BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')));
}
export function cop(value){return cents(value.replace(/COP|\$|\s/g,'').replaceAll('.','').replace(',','.'));}
export async function allRows(path,user='gpqa.contador'){
  const url=new URL(path,origin);url.searchParams.set('page','0');url.searchParams.set('size','200');
  const first=await api(url.pathname+url.search,{user});assert.equal(first.status,200,first.path);
  if(Array.isArray(first.body))return first.body;
  assert.ok(Array.isArray(first.body.content));const rows=[...first.body.content];
  for(let page=1;page<first.body.totalPages;page++){url.searchParams.set('page',page);const r=await api(url.pathname+url.search,{user});assert.equal(r.status,200);rows.push(...r.body.content);}
  assert.equal(rows.length,first.body.totalElements);return rows;
}
export async function payment(key,period='2026-10'){
  if(manifest.payments[key])return manifest.payments[key];
  const body={nombre:run+' '+key,nit:'GPQA008'+key.replace(/[^A-Za-z0-9]/g,'').slice(0,10),categoria:'OTROS',concepto:run+' proy. '+key,modulo_origen:'manual',monto_proyectado:1234.56,fecha_proyectada:period+'-15',notas:'QA-ONLY synthetic row'};
  const r=await once('create-'+key,'/api/gp/pagos-proyectados?empresaId=91',{method:'POST',body});assert.equal(r.status,200,JSON.stringify(r.body));
  assert.ok(r.body.id);manifest.payments[key]=r.body;await persist();return r.body;
}
export async function browserSession(name,work,user='gpqa.contador'){
  const browser=await chromium.launch({headless:true,executablePath:process.env.GPQA_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',env:{...process.env,TEMP:dir,TMP:dir}});
  const context=await browser.newContext({viewport:{width:1600,height:1100}});const page=await context.newPage();page.setDefaultTimeout(20000);
  const evidence={name,startedAt:new Date().toISOString(),network:[],errors:[],passed:false};
  page.on('pageerror',e=>evidence.errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(front+'/api/'))evidence.network.push({url:r.url(),status:r.status(),method:r.request().method()});});
  try{
    await page.goto(front+'/login');await page.getByPlaceholder('ejemplo@correo.com').fill(user+'@example.invalid');await page.locator('input[type=password]').fill(process.env.GPQA_PASSWORD || '');
    const state=page.waitForResponse(r=>r.url().includes('/api/gp/auth/estado')&&r.status()===200);
    await page.getByRole('button',{name:'Iniciar Sesión'}).click();await page.waitForURL('**/presupuesto/presupuesto');await state;
    await work({page,context,evidence});assert.deepEqual(evidence.errors,[]);evidence.passed=true;
  }catch(e){evidence.error=e.message;throw e;}
  finally{evidence.finalUrl=page.url();await page.screenshot({path:dir+name+'.png',fullPage:true}).catch(()=>{});await save(name,evidence);await browser.close();}
}
