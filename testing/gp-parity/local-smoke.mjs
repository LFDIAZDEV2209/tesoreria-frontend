import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve('testing/gp-parity/artifacts');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, env: { ...process.env, TEMP: artifacts, TMP: artifacts } });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const requests = [];
const errors = [];
const session = { autenticado: true, usuario_id: 10, nombre: 'Cuenta de prueba local', rol: 'superadmin', debe_cambiar_password: false, multiples_empresas: true, puede_aprobar: true, solo_lectura: false, puede_operar_pagos: true };
// Sólo fixtures para pruebas: ninguna solicitud API se envía a servicios reales.
await context.route('**/*', async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.hostname !== '127.0.0.1') return route.abort();
  if (!/^\/(gp-api|api)\//.test(url.pathname)) return route.continue();
  requests.push({ path: url.pathname, method: req.method(), params: Object.fromEntries(url.searchParams) });
  let body = [];
  if (url.pathname.endsWith('/auth/estado')) body = session;
  if (url.pathname.endsWith('/auth/contadores')) body = [{ id: 1, nombre: 'Empresa de prueba', username: 'fixture' }];
  if (url.pathname.endsWith('/categorias/lista')) body = ['FRUVER', 'OTROS'];
  if (url.pathname.endsWith('/presupuesto/contrato')) body = {};
  if (url.pathname.endsWith('/presupuesto/mensual')) body = { meses: [], filas_contrato: [], filas_flujo_caja: [], filas_nomina: [], filas_estampillas: [], proveedores: {}, anticipos: {}, cx_pagar: {}, cx_cobrar: {}, impuestos: {}, pagos_proyectados: {} };
  if (url.pathname.endsWith('/pagos-proyectados/resumen')) body = { total_proyectado: 0, total_vencido: 0, total_proximos_7_dias: 0, total_proximos_30_dias: 0 };
  if (url.pathname.endsWith('/auditoria/')) body = { entradas: [], total: 0 };
  return route.fulfill({ json: body });
});
await context.addInitScript(() => {
  localStorage.setItem('currentUser', JSON.stringify({ id: 99, username: 'fixture-local', roles: [{name: 'SUPER_ADMIN'}], token: 'fixture-only' }));
  localStorage.setItem('gp_empresa_id', '1');
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
const report = [];
try {
  for (const route of ['proveedores', 'anticipos', 'cuentas-pagar', 'cuentas-cobrar', 'impuestos', 'presupuesto', 'otros-pagos', 'pagos-proyectados', 'resumen-gerencial', 'categorias', 'maestro-proveedores', 'usuarios', 'auditoria']) {
    await page.goto('http://127.0.0.1:4201/presupuesto/' + route);
    await page.waitForTimeout(800);
    report.push({ route, headings: await page.locator('h1,h2').allTextContents(), errors: [...errors], horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    console.log(JSON.stringify(report.at(-1)));
    if (['proveedores', 'presupuesto', 'categorias', 'usuarios'].includes(route)) await page.screenshot({ path: path.join(artifacts, `local-${route}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4201/presupuesto/proveedores');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(artifacts, 'local-mobile.png'), fullPage: true });
  console.log('ERRORS', errors);
  await writeFile(path.join(artifacts, 'local-smoke.json'), JSON.stringify({ report, errors, requests }, null, 2));
} finally { await browser.close(); }
