// CSS público de la referencia; no se incorpora su runtime React.
const fs = require('node:fs');
const postcss = require('../../node_modules/postcss');
const css = postcss.parse(fs.readFileSync('testing/gp-parity/reference-inspection.css', 'utf8'));
css.walkAtRules('import', rule => { if (rule.params.includes('IBM+Plex+Sans')) rule.remove(); });
const animations = new Map();
css.walkAtRules('keyframes', rule => {
  animations.set(rule.params, `gp-reference-${rule.params}`);
  rule.params = `gp-reference-${rule.params}`;
});
css.walkDecls(/animation/, declaration => {
  for (const [name, replacement] of animations) declaration.value = declaration.value.replace(new RegExp(`\\b${name}\\b`, 'g'), replacement);
});
css.walkRules(rule => {
  if (rule.parent.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
  rule.selectors = rule.selectors.map(selector => {
    if (/^(?:html|body|:root)(?:$|[ .:])/.test(selector)) return selector.replace(/^(?:html|body|:root)/, '.gp-app');
    if (/^\.(dark|neutral)(?:$|[ .:])/.test(selector)) return selector.replace(/^\.(dark|neutral)/, '.gp-app.$1');
    return `.gp-app ${selector}`;
  });
});
fs.writeFileSync('src/app/features/presupuesto/styles/reference.css', '/* Estilos públicos del Gestor, index-CI_5exW0.css. Selectores y animaciones aislados al módulo Angular. */\n' + css.toString());
