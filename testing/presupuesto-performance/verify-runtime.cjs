/** Opt-in integration benchmark: real Angular components, backend and local MySQL.
 * Uses read-only GETs and the existing X-User-Name authentication contract.
 * node testing/presupuesto-performance/verify-runtime.cjs [baseline-git-ref]
 */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const artifacts = process.env.BUDGET_PERF_ARTIFACTS
  ? path.resolve(process.env.BUDGET_PERF_ARTIFACTS)
  : path.resolve(root, '../local-data/presupuesto-perf');
const componentDir = path.join(root, 'src/app/features/presupuesto/pages/presupuesto');
const ref = process.argv.slice(2).find(argument => !argument.startsWith('--')) || 'ac7f66c3b4cf5636efa9f98ee20e3ba2c168ba65';
const generated = [];
const write = (file, text) => {
  if (fs.existsSync(file)) throw new Error(`Temporary test file already exists: ${file}`);
  fs.writeFileSync(file, text, 'utf8'); generated.push(file);
};
fs.mkdirSync(artifacts, {recursive: true});
try {
  const sourcePath = 'src/app/features/presupuesto/pages/presupuesto/presupuesto-page.component';
  for (const extension of ['ts', 'html', 'scss']) {
    let source = execFileSync('git', ['show', `${ref}:${sourcePath}.${extension}`], {cwd: root, encoding: 'utf8'});
    if (extension === 'ts') source = source
      .replaceAll('PresupuestoPageComponent', 'PresupuestoBaselineRuntimeComponent')
      .replaceAll('./presupuesto-page.component.html', './runtime-presupuesto-baseline.component.html')
      .replaceAll('./presupuesto-page.component.scss', './runtime-presupuesto-baseline.component.scss');
    write(path.join(componentDir, `runtime-presupuesto-baseline.component.${extension}`), source);
  }
  let spec = fs.readFileSync(path.join(__dirname, 'runtime.spec.template'), 'utf8');
  const beforeOnly = process.argv.includes('--before-only');
  if (beforeOnly) spec = spec.replace("it('consulta proveedores", "xit('consulta proveedores")
    .replace("it('mide el componente optimizado", "xit('mide el componente optimizado");
  write(path.join(componentDir, 'runtime-presupuesto-performance.spec.ts'), spec);
  write(path.join(root, 'runtime-presupuesto-performance.tsconfig.json'), JSON.stringify({
    extends: './tsconfig.spec.json', include: ['src/app/features/presupuesto/pages/presupuesto/runtime-presupuesto-performance.spec.ts', 'src/**/*.d.ts'],
  }));
  write(path.join(root, 'runtime-presupuesto-performance.karma.cjs'), `module.exports = function(config) { config.set({
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher'), require('@angular-devkit/build-angular/plugins/karma')],
    reporters: ['progress'], browsers: ['BudgetChrome'], singleRun: true,
    browserNoActivityTimeout: 120000, captureTimeout: 120000,
    customLaunchers: { BudgetChrome: {base: 'ChromeHeadless', flags: ['--window-size=1440,1000', '--disable-gpu']} },
    client: {jasmine: {random: false, timeoutInterval: 90000}, captureConsole: true},
    proxies: {'/api/': 'http://localhost:4200/api/'}
  }); };\n`);
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@angular/cli/bin/ng.js'), 'test',
    '--watch=false', '--progress=false', '--karma-config=runtime-presupuesto-performance.karma.cjs',
    '--ts-config=runtime-presupuesto-performance.tsconfig.json',
    '--include=src/app/features/presupuesto/pages/presupuesto/runtime-presupuesto-performance.spec.ts'], {
    cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
    env: {...process.env, CHROME_BIN: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      NG_BUILD_MAX_WORKERS: '1', NODE_OPTIONS: '--max-old-space-size=768'}, timeout: 360000,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const prefix = beforeOnly ? 'browser-before' : 'browser-runtime';
  fs.writeFileSync(path.join(artifacts, prefix + '.log'), output);
  const samples = output.split(/\r?\n/).filter(line => line.includes('BUDGET_PERFORMANCE_JSON ')).map(line => {
    let text = line.slice(line.indexOf('BUDGET_PERFORMANCE_JSON ') + 'BUDGET_PERFORMANCE_JSON '.length);
    text = text.slice(0, text.lastIndexOf('}') + 1);
    return JSON.parse(text);
  });
  fs.writeFileSync(path.join(artifacts, prefix + '.json'), JSON.stringify({timestamp: new Date().toISOString(),
    baselineRef: ref, kind: 'Angular 18 components in ChromeHeadless + localhost:4200 + real local MySQL; read-only',
    shellExcluded: 'Login, route shell and shared company context are established before timing both components.',
    exitCode: result.status, samples}, null, 2));
  process.stdout.write(output);
  if (result.error) throw result.error;
  process.exitCode = result.status || (samples.length < (beforeOnly ? 1 : 2) ? 1 : 0);
} finally {
  // Only exact files created above, without touching existing files or directories.
  for (const file of generated.reverse()) fs.unlinkSync(file);
}
