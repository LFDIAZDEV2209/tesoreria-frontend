// Sólo artefactos públicos para comparación visual local. No lee credenciales ni registros.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const origin = 'https://gestor-presupuestal.onrender.com';
const dir = path.resolve('testing/gp-parity/artifacts/reference');
await mkdir(path.join(dir, 'assets'), { recursive: true });
const html = await (await fetch(origin + '/presupuesto')).text();
await writeFile(path.join(dir, 'index.html'), html);
const pending = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(m => m[1]);
const seen = new Set();
while (pending.length) {
  const resource = pending.pop();
  if (seen.has(resource)) continue;
  if (!/^\/assets\/[\w.-]+\.(?:js|css)$/.test(resource)) throw new Error('Recurso fuera del ámbito de prueba');
  const response = await fetch(origin + resource);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${resource}`);
  const body = await response.text();
  seen.add(resource);
  await writeFile(path.join(dir, resource.slice(1)), body);
  if (resource.endsWith('.js')) for (const match of body.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)) pending.push('/assets/' + match[1]);
}
console.log('Recursos públicos para pruebas locales:', seen.size);
