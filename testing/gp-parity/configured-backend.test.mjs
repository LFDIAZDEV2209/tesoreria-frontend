/** Read-only UI verification through the CURRENT :4201 -> :8082 -> configured MySQL connection. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
const origin = 'http://localhost:4201';
const artifacts = path.resolve('testing/gp-parity/artifacts');
await mkdir(artifacts, {recursive: true});
const imported = JSON.parse(await readFile('../Tesoreriabd/local-data/render-import-report.json', 'utf8'));
const snapshot = JSON.parse(await readFile('../Tesoreriabd/local-data/render-snapshot.json', 'utf8'));
const populated = snapshot.workspaces.reduce((a, b) => a.data['movements-proveedores'].length > b.data['movements-proveedores'].length ? a : b);
const company = imported.workspaceMapping[populated.id];
const stateResponse = await fetch(`${origin}/api/gp/auth/estado`, {headers: {'X-User-Name': 'admin'}});
assert.equal(stateResponse.status, 200);
const state = await stateResponse.json();
assert.equal(state.rol, 'superadmin');
// Nexa uses X-User-Name; this isolated test session uses the existing admin, no password change or synthetic DB identity.
const user = {userId: state.usuario_id, username: 'admin', roles: [{name: 'SUPER_ADMIN'}], requirePasswordChange: false};
const browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  env: {...process.env, TEMP: artifacts, TMP: artifacts}});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
await context.addInitScript(user => localStorage.setItem('currentUser', JSON.stringify(user)), user);
const page = await context.newPage(), errors = [], failures = [], external = [], results = [];
page.setDefaultTimeout(20000);
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().includes('/api/gp/') && r.status() >= 400) failures.push({url: r.url(), status: r.status()}); });
page.on('request', r => { if (/onrender\.com|\/gp-api\//.test(r.url())) external.push(r.url()); });
async function check(name, fn) { try { await fn(); results.push({name, ok: true}); } catch (e) { results.push({name, ok: false, error: e.message}); } }
try {
  await check('selector muestra las 26 empresas al entrar sin selección', async () => {
    await page.goto(`${origin}/presupuesto/proveedores`);
    await page.locator('.gp-workspace-picker button').first().waitFor();
    assert.equal(await page.locator('.gp-workspace-picker button').count(), snapshot.workspaces.length);
    await page.locator('.gp-workspace-picker button').filter({hasText: populated.nombre}).first().click();
    await page.locator('.gp-workspace-picker').waitFor({state: 'hidden'});
  });
  for (const route of ['proveedores', 'anticipos', 'cuentas-pagar', 'cuentas-cobrar', 'impuestos', 'presupuesto', 'otros-pagos', 'pagos-proyectados', 'resumen-gerencial', 'categorias', 'maestro-proveedores', 'usuarios', 'auditoria']) {
    await check(route, async () => {
      await page.goto(`${origin}/presupuesto/${route}?empresaId=${company}`);
      await page.locator('.gp-app h1').first().waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByText('No tienes empresas disponibles para esta sesión.', {exact: true}).count(), 0);
      assert.equal(await page.getByText('No hay contadores activos todavía.', {exact: true}).count(), 0);
      assert.equal(await page.getByText('No hay empresas creadas todavía', {exact: true}).count(), 0);
      if (route === 'usuarios') assert.equal(await page.locator('.gp-app tbody tr').count(), snapshot.workspaces.length);
      if (route === 'proveedores') assert.ok(await page.locator('.gp-app tbody tr').count() > 0);
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({width, height: 900});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
      }
      assert.equal(await page.locator('app-sidebar aside').isVisible(), true);
      await page.screenshot({path: path.join(artifacts, `configured-${route}.png`), fullPage: true});
    });
  }
  assert.deepEqual(failures, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
} catch (e) { results.push({name: 'network/browser', ok: false, error: e.message}); }
finally {
  await writeFile(path.join(artifacts, 'configured-browser-results.json'), JSON.stringify({results, failures, external, errors}, null, 2));
  await browser.close();
}
console.log(JSON.stringify({passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, apiFailures: failures.length, renderRequests: external.length, javascriptErrors: errors.length}));
for (const r of results.filter(r => !r.ok)) console.error(r.name, r.error.slice(0, 400));
process.exitCode = results.some(r => !r.ok) ? 1 : 0;
