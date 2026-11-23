import { setTimeout } from 'node:timers/promises';
const pending = new Set(['http://localhost:8081/api/gp/auth/estado', 'http://localhost:4202']);
while (pending.size) {
  await Promise.all([...pending].map(async url => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      console.log(new Date().toISOString(), url, r.status);
      if (r.status < 500) pending.delete(url);
    } catch { console.log(new Date().toISOString(), url, 'WAIT'); }
  }));
  if (pending.size) await setTimeout(20000);
}
