const fs = require('node:fs');
const path = require('node:path');
const base = 'src/app/features/presupuesto';
const classMap = {
  'text-primary-600': 'text-t1', 'text-primary-700': 'text-t1',
  'text-[#213053]': 'text-t1', 'text-[#045C94]': 'text-acc',
  'text-gray-800': 'text-t1', 'text-gray-700': 'text-t2', 'text-gray-600': 'text-t2',
  'text-gray-500': 'text-t3', 'text-gray-400': 'text-t3',
  'text-slate-800': 'text-t1', 'text-slate-700': 'text-t2', 'text-slate-600': 'text-t2',
  'text-slate-500': 'text-t3', 'text-slate-400': 'text-t3',
  'text-accent-600': 'text-acc', 'text-accent-700': 'text-acc',
  'bg-white': 'bg-surface', 'bg-gray-50': 'bg-elevated', 'bg-gray-100': 'bg-elevated',
  'border-gray-100': 'border-bdr/10', 'border-gray-200': 'border-bdr/15',
  'bg-[#fbfcfe]': 'bg-surface', 'bg-[#f8fafc]': 'bg-elevated',
};
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(file); continue; }
    if (!/\.(html|scss|ts)$/.test(file) || /\.spec\.ts$|reference|gp-navigation|catalogo/.test(file)) continue;
    let s = fs.readFileSync(file, 'utf8');
    const original = s;
    if (!file.endsWith('.scss')) {
      for (const [a,b] of Object.entries(classMap)) s = s.split(a).join(b);
      s = s.replace(/min-h-screen bg-gradient-to-br from-\[#fdfdfd\] via-\[#f0f0f0\] to-\[#e4e8f3\] p-3/g, 'gp-native-page');
      s = s.replace(/min-h-screen gp-page p-3 lg:p-5/g, 'gp-native-page gp-page');
    } else if (!file.endsWith('_gestor-theme.scss')) {
      s = s.replace(/(background(?:-color)?:\s*)#(?:ffffff|fff)(?![0-9a-f])/gi, '$1var(--bg-surface)');
      s = s.replace(/#(?:213053|1b2844)(?![0-9a-f])/gi, 'var(--tx-1)');
      s = s.replace(/#045c94(?![0-9a-f])/gi, 'var(--acc-solid)');
      s = s.replace(/#(?:f4f4f4|f1f5f9|f8fafc|faf9ff|edf2fa|e6edf7|dfe8f4)(?![0-9a-f])/gi, 'var(--bg-elevated)');
      s = s.replace(/#(?:64748b|94a3b8)(?![0-9a-f])/gi, 'var(--tx-3)');
      s = s.replace(/#(?:e3e9f2|e2e8f0)(?![0-9a-f])/gi, 'rgb(var(--bdr-rgb) / .12)');
    }
    if (original !== s) fs.writeFileSync(file, s);
  }
}
walk(base);
