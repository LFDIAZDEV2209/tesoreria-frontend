import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = 'http://localhost:4202';
const backend = 'http://localhost:8081';
const artifacts = process.env.GPQA_ARTIFACTS_DIR || fileURLToPath(new URL('./artifacts/gpqa/', import.meta.url));
const password = process.env.GPQA_PASSWORD || '';
await mkdir(artifacts,{recursive:true});

async function session(name, run) {
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.GPQA_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    env:{...process.env,TEMP:artifacts,TMP:artifacts}});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const evidence = {name,startedAt:new Date().toISOString(),requests:[],pageErrors:[],passed:false};
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  page.on('response',r=>{
    if(new URL(r.url()).pathname.startsWith('/api/')) evidence.requests.push({
      url:r.url(),method:r.request().method(),status:r.status(),
      username:r.request().headers()['x-user-name'] || null,
    });
  });
  try {
    await run({page,context,evidence});
    assert.deepEqual(evidence.pageErrors,[],'No page errors');
    assert.deepEqual(evidence.requests.filter(r=>r.status>=500),[],'No API 5xx');
    evidence.passed=true;
  } catch(e) {evidence.error=e.message;throw e;}
  finally {
    evidence.finalUrl=page.url();
    await page.screenshot({path:artifacts+name+'.png',fullPage:true}).catch(()=>{});
    await writeFile(artifacts+name+'.json',JSON.stringify(evidence,null,2));
    await browser.close();
  }
}

async function login(page, username) {
  await page.goto(base+'/');
  await page.waitForURL(base+'/login');
  await page.getByPlaceholder('ejemplo@correo.com').fill(username+'@example.invalid');
  await page.locator('input[type=password]').fill(password);
  const reply = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login' && r.request().method()==='POST');
  const stateReply = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/gp/auth/estado' && r.request().headers()['x-user-name']===username);
  await page.getByRole('button',{name:'Iniciar Sesión'}).click();
  const r=await reply;
  assert.equal(new URL(r.url()).origin,base,'Login stays on local frontend proxy');
  assert.equal(r.status(),200,'Real login must succeed');
  const body=await r.json();
  assert.equal(body.username,username);
  assert.equal(body.requirePasswordChange,false);
  assert.equal(body.token,null,'Current auth contract has no JWT');
  await page.waitForURL(base+'/presupuesto/presupuesto');
  assert.equal((await stateReply).status(),200,'Wait for real UI auth state, not an idle-network race');
  await page.waitForLoadState('networkidle');
  return body;
}

test('Frontend: login guard, /auth child guard and real carousel', {timeout:45000}, async()=>session('frontend-auth-carousel',async({page,evidence})=>{
  await page.goto(base+'/');
  await page.waitForURL(base+'/login');
  assert.equal(new URL(page.url()).origin,base);
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByPlaceholder('ejemplo@correo.com').isVisible(),true);
  assert.equal(await page.locator('input[type=password]').isVisible(),true);
  const images=page.locator('img.carousel-image');
  assert.equal(await images.count(),3);
  assert.equal(await images.evaluateAll(es=>es.every(e=>e.complete && e.naturalWidth>0)),true);
  const initial=await page.locator('img.carousel-image.active').getAttribute('src');
  await page.waitForFunction(src=>document.querySelector('img.carousel-image.active')?.getAttribute('src')!==src,initial,{timeout:15000});
  evidence.carousel={initial,next:await page.locator('img.carousel-image.active').getAttribute('src')};
  await page.goto(base+'/auth/change-password-required');
  await page.waitForURL(base+'/login');
  await page.goto(base+'/auth');
  await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).origin,base);
  evidence.authRoot={url:page.url(),loginVisible:await page.locator('input[type=password]').isVisible(),body:await page.locator('body').innerText()};
  // Diagnostic: /auth itself has no login component or guard. Child guard asserted above.
}));

for (const [username,role] of [['gpqa.contador','contador'],['gpqa.gerencia','gerente']]) {
  test('Real UI login and auth state: '+username,{timeout:90000},async()=>session(username,async({page,context,evidence})=>{
    evidence.login=await login(page,username);
    const anonymous=await context.request.get(backend+'/api/gp/auth/estado');
    assert.equal(anonymous.status(),401,'GP rejects anonymous identity');
    for(const origin of [backend,base]) {
      const r=await context.request.get(origin+'/api/gp/auth/estado',{headers:{'X-User-Name':username}});
      assert.equal(r.status(),200,origin+' auth state');
      const state=await r.json();
      assert.equal(state.autenticado,true);
      assert.equal(state.rol,role);
      assert.equal(state.usuario_id,evidence.login.userId);
      evidence[origin===backend?'backendState':'proxyState']=state;
    }
    assert.deepEqual(evidence.proxyState,evidence.backendState,'Proxy must reach the same identity backend');
    assert.ok(evidence.requests.some(r=>r.url.includes('/auth/estado') && r.username===username && r.status===200),'UI propagates X-User-Name');
  }));
}

function cents(value) {
  assert.notEqual(value,null,'Missing monetary amount');
  assert.notEqual(value,undefined,'Missing monetary amount');
  const match=String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  assert.ok(match,'Invalid API money: '+value);
  return (match[1] ? -1n : 1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));
}
function copCents(text) {
  const s=text.replace(/COP|\$|\s|\u00a0/g,'').replace(/\./g,'');
  assert.match(s,/^-?\d+(?:,\d{1,2})?$/,'Expected complete COP amount, no abbreviated value');
  return cents(s.replace(',','.'));
}

test('Regression: pagos-proyectados listing and exact API/UI totals',{timeout:120000},async()=>session('regression-pagos',async({page,context,evidence})=>{
  await login(page,'gpqa.contador');
  const listReply=page.waitForResponse(r=>/\/api\/gp\/pagos-proyectados\/$/.test(new URL(r.url()).pathname) && new URL(r.url()).searchParams.get('como')==='91');
  const summaryReply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/gp/pagos-proyectados/resumen' && new URL(r.url()).searchParams.get('como')==='91');
  await page.goto(base+'/presupuesto/pagos-proyectados?empresaId=91');
  const [list,summary]=await Promise.all([listReply,summaryReply]);
  assert.equal(list.status(),200); assert.equal(summary.status(),200);
  const first=await list.json(), resumen=await summary.json();
  assert.ok(Array.isArray(first.content));
  const rows=[...first.content];
  assert.ok(Number.isInteger(first.totalPages));
  for(let n=1;n<first.totalPages;n++) {
    const url=new URL(list.url());url.searchParams.set('page',n);
    const r=await context.request.get(url.href,{headers:{'X-User-Name':'gpqa.contador'}});
    assert.equal(r.status(),200);rows.push(...(await r.json()).content);
  }
  assert.equal(rows.length,first.totalElements,'All API pages included');
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'No duplicated API rows');
  const outgoing=rows.filter(r=>r.modulo_origen!=='cx_cobrar');
  const total=outgoing.reduce((a,r)=>a+cents(r.monto_proyectado),0n);
  await page.locator('.gp-payment-total__monto strong').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Proyección de Egresos',exact:true}).isVisible(),true);
  assert.equal(Number(await page.locator('.gp-payment-total__resumen strong').innerText()),outgoing.length);
  assert.equal(copCents(await page.locator('.gp-payment-total__monto strong').innerText()),total);
  const kpi=page.locator('app-gp-kpi').filter({has:page.locator('.kpi-label',{hasText:/^Total proyectado$/})}).locator('.kpi-value');
  assert.equal(copCents(await kpi.getAttribute('title')),cents(resumen.total_proyectado));
  assert.equal(await page.locator('app-gp-error-state').count(),0);
  if(!outgoing.length) assert.equal(await page.getByText('Sin egresos registrados',{exact:true}).isVisible(),true);
  evidence.reconciliation={empresa:91,count:outgoing.length,totalCents:String(total),summaryCents:String(cents(resumen.total_proyectado)),precision:'Exact cents; full KPI amount from UI title'};
}));

test('Regression: proveedores module visible and API/UI balance',{timeout:120000},async()=>session('regression-proveedores',async({page,evidence})=>{
  await login(page,'gpqa.contador');
  const replies=[];
  page.on('response',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/gp/proveedores')&&u.searchParams.get('como')==='91')replies.push(r);});
  await page.goto(base+'/presupuesto/proveedores?empresaId=91');
  await page.getByRole('heading',{name:'Proveedores',exact:true}).waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('link',{name:'Proveedores',exact:true}).first().isVisible(),true);
  const summary=replies.findLast(r=>new URL(r.url()).pathname==='/api/gp/proveedores/resumen');
  const list=replies.findLast(r=>/^\/api\/gp\/proveedores\/?$/.test(new URL(r.url()).pathname));
  assert.ok(summary,'Summary API called');assert.ok(list,'Listing API called');
  assert.equal(summary.status(),200);assert.equal(list.status(),200);
  const payload=await list.json(), groups=await summary.json();
  assert.ok(Array.isArray(payload.content));assert.ok(Array.isArray(groups));
  assert.equal(await page.locator('app-gp-error-state').count(),0);
  const balance=groups.reduce((a,r)=>a+cents(r.total_saldo),0n);
  if(payload.totalElements===0) {
    assert.equal(await page.getByRole('heading',{name:'Sin datos importados',exact:true}).isVisible(),true);
    assert.equal(balance,0n,'Empty list must reconcile with zero summary');
  } else {
    const kpi=page.locator('app-gp-kpi').filter({has:page.locator('.kpi-label',{hasText:/^Saldo acumulado$/})}).locator('.kpi-value');
    assert.equal(copCents(await kpi.getAttribute('title')),balance<0n?-balance:balance);
    assert.ok(await page.locator('tbody tr').count()>0,'Nonempty API displays rows');
  }
  evidence.reconciliation={empresa:91,count:payload.totalElements,balanceCents:String(balance)};
}));
