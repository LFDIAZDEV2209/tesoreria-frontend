/** Read-only source export. Never persists session cookies or passwords. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const output = process.env.GP_EXPORT_DIRECTORY
  ? path.resolve(process.env.GP_EXPORT_DIRECTORY)
  : path.resolve(root, '../Tesoreriabd/local-data/render-export');
if (fs.existsSync(output)) throw new Error('El destino ya existe; usa GP_EXPORT_DIRECTORY para conservar los respaldos anteriores.');
const origin = 'https://gestor-presupuestal.onrender.com';
if(!process.env.GP_EXPORT_USERNAME || !process.env.GP_EXPORT_PASSWORD)
  throw new Error('Provide GP_EXPORT_USERNAME and GP_EXPORT_PASSWORD in the process environment.');
const credentials = { username: process.env.GP_EXPORT_USERNAME, password: process.env.GP_EXPORT_PASSWORD };
const login = await fetch(`${origin}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
  redirect: 'error', signal: AbortSignal.timeout(60000),
});
if (!login.ok) throw new Error(`Source authentication failed (${login.status}).`);
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
if (!cookie) throw new Error('La autenticación no devolvió una sesión.');
const manifest = { source: origin, startedAt: new Date().toISOString(), files: [], failures: [], limitations: [
  'API export, not a database backup: passwords, sessions and unexposed internal fields are unavailable.',
  'Source is live; requests do not constitute a transactional database snapshot.',
] };
fs.mkdirSync(output, { recursive: true });
function assertNoSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(password|password_hash|hashed_password|cookie|token|session)$/i.test(key))
      throw new Error('La respuesta contiene un campo secreto; no se guardó.');
    assertNoSecrets(item);
  }
}
async function get(endpoint, name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${origin}${endpoint}`, {
        headers: { Cookie: cookie }, redirect: 'error', signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt < 2) continue;
        manifest.failures.push({ endpoint, status: response.status });
        return null;
      }
      // Preserve original numeric precision and response bytes, not a JS reserialization.
      const bytes = await response.text();
      const data = JSON.parse(bytes);
      if (endpoint !== '/openapi.json') assertNoSecrets(data);
      fs.mkdirSync(path.dirname(path.join(output, name)), { recursive: true });
      fs.writeFileSync(path.join(output, name), bytes);
      manifest.files.push({ endpoint, file: name, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        count: Array.isArray(data) ? data.length : undefined });
      return data;
    } catch (error) {
      if (attempt === 2) manifest.failures.push({ endpoint, error: error.name });
    }
  }
  return null;
}
await get('/openapi.json', 'openapi.json');
const session = await get('/api/auth/estado', 'auth-state.json');
if (!session?.autenticado || session.rol !== 'superadmin')
  throw new Error('La exportación completa requiere una sesión superadmin.');
const users = await get('/api/usuarios/', 'users.json');
const companies = await get('/api/auth/contadores', 'workspaces.json');
await get('/api/categorias/admin/todas', 'categories.json');
await get('/api/auditoria/grupos', 'audit-groups.json');
await get('/api/presupuesto/resumen-gerencial', 'management-summary.json');
if (!Array.isArray(users) || !Array.isArray(companies)) throw new Error('Incomplete workspace inventory.');
const workspaceIds = [...new Set([...companies.map(c => c.id), ...users.filter(u => u.es_workspace).map(u => u.id)])];
const endpoints = {
  'proveedores/': 'movements-proveedores', 'anticipos/': 'movements-anticipos',
  'cuentas-pagar/': 'movements-cx_pagar', 'cuentas-cobrar/': 'movements-cx_cobrar',
  'impuestos/': 'movements-impuestos', 'categorias/': 'providers',
  'presupuesto/contrato': 'contract', 'presupuesto/periodos': 'periods',
  'presupuesto/': 'category-budgets', 'presupuesto/detalle': 'provider-balances',
  'presupuesto/fuentes': 'sources', 'presupuesto/mensual': 'monthly',
  'pagos-proyectados/': 'payments', 'notificaciones/': 'notifications',
};
let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < workspaceIds.length) {
    const id = workspaceIds[next++];
    for (const [endpoint, name] of Object.entries(endpoints)) {
      await get(`/api/${endpoint}?como=${id}`, `workspaces/${id}/${name}.json`);
    }
    console.log(`Workspace ${id}: exported read-only.`);
  }
}));
let offset = 0;
while (true) {
  const page = await get(`/api/auditoria/?limite=500&offset=${offset}`, `audit/${offset}.json`);
  if (!page || !Array.isArray(page.entradas)) break;
  offset += page.entradas.length;
  if (offset >= page.total) break;
  if (!page.entradas.length) { manifest.failures.push({ endpoint: '/api/auditoria/', error: 'Truncated pagination' }); break; }
}
manifest.completedAt = new Date().toISOString();
manifest.workspaceCount = workspaceIds.length;
manifest.accountCount = users.length;
manifest.auditCount = offset;
manifest.accessibleWorkspaceCount = companies.length;
manifest.complete = manifest.failures.length === 0;
const advertised = new Set(companies.map(c => String(c.id)));
manifest.accessibleComplete = manifest.failures.every(f => {
  const id = new URL(f.endpoint, origin).searchParams.get('como');
  return f.status === 404 && id !== null && !advertised.has(id);
});
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ files: manifest.files.length, failedRequests: manifest.failures.length,
  accessibleComplete: manifest.accessibleComplete, accessibleWorkspaces: companies.length,
  inspectedIdentities: workspaceIds.length, accounts: users.length, audit: offset }));
if (!manifest.accessibleComplete) process.exitCode = 2;
