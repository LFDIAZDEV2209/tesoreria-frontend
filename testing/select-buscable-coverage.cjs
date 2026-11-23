// Verifica que ningún select nativo quede sin la búsqueda compartida.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const directive = path.join(root, 'src/app/core/ui/select-buscable/select-buscable.directive');
let total = 0, controls = 0, changed = 0;
const missing = [];
function visit(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { visit(file); continue; }
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
    let source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const edits = [];
    function inspect(node) {
      if (ts.isDecorator(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'Component') {
        const meta = node.expression.arguments[0];
        if (!meta || !ts.isObjectLiteralExpression(meta)) return;
        const prop = name => meta.properties.find(p => p.name?.getText(ast) === name);
        let template = prop('template')?.initializer?.text ?? '';
        const url = prop('templateUrl')?.initializer?.text;
        if (url) template += fs.readFileSync(path.resolve(path.dirname(file),url), 'utf8');
        if (!/<select\b/.test(template)) return;
        total++; controls += (template.match(/<select\b/g) ?? []).length;
        const imports = prop('imports')?.initializer;
        if (imports?.getText(ast).includes('SelectBuscableDirective')) return;
        if (prop('standalone')?.initializer?.kind !== ts.SyntaxKind.TrueKeyword || !imports || !ts.isArrayLiteralExpression(imports)) {
          missing.push(file + ': requiere integración manual'); return;
        }
        if (!process.argv.includes('--write')) { missing.push(path.relative(root,file)); return; }
        const pos = imports.getStart(ast) + 1;
        edits.push({pos, text: 'SelectBuscableDirective,' + (/^[\\r\\n]/.test(source.slice(pos)) ? '' : ' ')});
      }
      ts.forEachChild(node, inspect);
    }
    inspect(ast);
    if (edits.length) {
      for (const edit of edits.sort((a,b)=>b.pos-a.pos)) source=source.slice(0,edit.pos)+edit.text+source.slice(edit.pos);
      let relative = path.relative(path.dirname(file),directive).replaceAll('\\','/');
      if (!relative.startsWith('.')) relative='./'+relative;
      source=`import { SelectBuscableDirective } from '${relative}';\n`+source;
      fs.writeFileSync(file,source); changed++;
    }
  }
}
visit(path.join(root,'src/app'));
console.log(JSON.stringify({componentes:total,selectores:controls,integrados:changed,faltantes:missing}));
if (missing.length) process.exitCode=1;
