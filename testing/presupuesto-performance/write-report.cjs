const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const dir = path.join(root, 'local-data/presupuesto-perf');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const browser = read('browser-runtime.json');
const controlled = read('controlled-initial-comparison.json');
const api = read('after-api-verification.json');
const detail = read('after-detalle-api-verification.json');
const profiles = read('after-db-http-profile.json');
if (browser.exitCode !== 0 || !controlled.allHttp200 || !api.passed || !detail.passed)
  throw new Error('Las pruebas reales deben terminar correctamente antes de publicar el informe.');
const old = controlled.medians.legacySixRequestContract;
const current = controlled.medians.summaryOneRequestContract;
const median = list => {const sorted = [...list].sort((a,b) => a-b); return sorted[Math.floor(sorted.length / 2)];};
const beforeBrowser = browser.samples.filter(sample => sample.phase === 'before');
const afterBrowser = browser.samples.filter(sample => sample.phase === 'after');
const n = value => Number(value).toLocaleString('es-CO', {maximumFractionDigits: 2});
const kb = value => n(value / 1000) + ' KB';
const improvement = (a,b) => n((a-b)/a*100) + '%';
const esc = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const link = (file, text=file) => `<a href="${esc(file)}">${esc(text)}</a>`;
const endpointRows = Object.entries(profiles.endpoints).map(([name, result]) => `<tr><td>${esc(name)}</td><td>${n(result.http.ms)} ms</td><td>${kb(result.http.bytes)}</td><td>${n(result.sqlCalls)}</td><td>${n(result.rowsSent)}</td></tr>`).join('');
const sections = browser.samples.find(sample => sample.phase === 'all-sections-on-viewport');
const extraPanels = browser.samples.find(sample => sample.phase === 'consolidated-and-detail-on-viewport');
if (!sections?.allOnlyNearViewport || sections.observedSections !== 8 || extraPanels?.observedSections !== 2)
  throw new Error('Falta verificar las diez secciones mediante scroll e IntersectionObserver reales.');
const sectionRows = [...sections.requests, ...extraPanels.requests].map(request => `<tr><td><code>${esc(new URL(request.url, 'http://localhost:4200').pathname)}</code></td><td>${n(request.ms)} ms</td><td>${kb(request.bytes)}</td><td>${request.status}</td></tr>`).join('');
const date = new Intl.DateTimeFormat('es-CO', {dateStyle:'full',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date());
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rendimiento de Presupuesto — auditoría y validación</title><style>
*{box-sizing:border-box}body{font:16px/1.65 system-ui,sans-serif;color:#172a40;background:#f5f7fa;margin:0;padding:32px 20px}main{max-width:1080px;margin:auto;background:white;padding:42px;border:1px solid #dbe4ed;border-radius:12px}h1{font-size:30px;line-height:1.2;margin:0 0 10px}h2{font-size:22px;margin:36px 0 12px;color:#064b76}p{margin:10px 0}small,.muted{color:#586d80}table{border-collapse:collapse;width:100%;font-size:14px;margin:18px 0}th,td{text-align:left;padding:11px 13px;border-bottom:1px solid #dce5ed;vertical-align:top}th{background:#edf4f8}code{font-size:13px;overflow-wrap:anywhere}a{color:#005990}.outcome{background:#ecf8f3;border-left:4px solid #18835c;padding:16px 20px;margin:24px 0}.note{background:#f1f5f9;padding:14px 18px;border-radius:6px}ul{padding-left:24px}li{margin:7px 0}.table-wrap{overflow:auto}@media(max-width:700px){main{padding:22px}body{padding:12px}h1{font-size:25px}}@media print{body{background:white;padding:0}main{border:0;padding:0}h2{break-after:avoid}tr{break-inside:avoid}a{color:inherit}}
</style><main><h1>Optimización de <code>/presupuesto/presupuesto</code></h1><p class="muted">Informe técnico · ${esc(date)} · Entorno local Nexa / Spring Boot / MySQL</p>
<div class="outcome"><strong>Implementación y pruebas reales completadas.</strong> La carga inicial solicita un resumen sin listados. Proveedores y las otras nueve secciones diferidas se consultan al aproximarse a su área visible. Los cálculos y datos originales se conservan.</div>
<h2>1. Cuellos de botella y evidencia inicial</h2>
<p>El componente esperaba un <code>Promise.all</code> de contrato, mensual completo, consolidado, detalle de terceros, resumen de provisiones y cierres. Además solicitaba el catálogo de categorías. El mensual ya contenía el contrato y todas las matrices de terceros y beneficiarios, aunque el usuario todavía estuviera en la cabecera. El detalle aplicaba filtros y recortaba la página después de construir todos los terceros en Java.</p>
<p>La empresa 51, seleccionada por ser la de mayor volumen local, tenía 597 movimientos y 338 pagos. El mensual devolvía 163 filas de detalle agrupadas y 132.587 bytes antes de estos cambios. Se registraron solicitudes HTTP, respuestas originales, índices, definiciones de vistas, <code>EXPLAIN ANALYZE</code> y estadísticas de <code>performance_schema</code>. No se encontró un N+1 por cada fila; sí cargas completas, consultas independientes redundantes y trabajo para secciones ocultas.</p>
<h2>2. Cambios implementados</h2>
<ul><li><code>GET /api/gp/presupuesto/mensual?resumen=true</code>: contrato, meses, tablas base y agregados; ninguna fila de detalle de las ocho matrices diferidas. El contrato mensual completo continúa disponible para exportaciones, históricos y consumidores anteriores.</li>
<li><code>GET /api/gp/presupuesto/mensual/secciones/{seccion}</code>: selección SQL de las claves de la página y recuperación limitada a esos terceros. Búsqueda y categoría se ejecutan en la base de datos. Los totales corresponden a todo el filtro, sin confundirlos con la página visible.</li>
<li>El detalle consolidado aplica búsqueda, categoría, nombre exacto, alertas, orden y <code>LIMIT/OFFSET</code> en SQL. La interfaz solicita 25 filas por página. Los nombres del selector se entregan al abrir esa sección.</li>
<li>Los pagos se filtran por empresa, beneficiarios de la página, sección, meses y estado antes de materializarlos. Se conserva el comportamiento histórico de pagos sin estado, incluidos como pendientes.</li>
<li>Los JOIN al maestro añaden una igualdad indexable de NIT y conservan la comparación binaria exacta. El plan pasa de recorrer hasta 123 candidatos por grupo a una búsqueda de una fila mediante el índice compuesto existente. Cinco comparaciones de resultados fueron idénticas; los ensayos aislados redujeron las consultas principales entre 25% y 34%.</li></ul>
<h2>3. Estrategia de carga por sección</h2>
<p>Contrato, flujo de caja, nómina y notas usan la respuesta base, necesaria para los indicadores y la vista principal. Proveedores, Cuentas por pagar, Impuestos, Provisiones, Cuentas por cobrar, Anticipos, Pagos, Cobros, Consolidado y Detalle de terceros usan <code>IntersectionObserver</code>, con un margen de aproximación de 300 px. Un panel contraído no consulta sus datos.</p>
<p>Los espacios reservados mantienen altura mientras no hay datos y evitan que todos los paneles vacíos entren juntos en el área visible. Cada sección conserva sus datos al salir de pantalla, comparte su solicitud pendiente, muestra spinner y texto de carga, expone errores y permite reintentar. La búsqueda espera 300 ms y cancela o descarta respuestas anteriores. Cambiar de empresa invalida las peticiones y las respuestas pendientes.</p>
<p>El catálogo se solicita al necesitar filtros. Los refrescos por edición actualizan el resumen y las secciones ya visitadas. Las acciones sobre toda una tabla solicitan todas sus páginas únicamente al ejecutarlas, con lotes de 100; el PDF obtiene el mensual completo únicamente al descargarlo.</p>
<h2>4. Base de datos, índices y consistencia</h2>
<p>No se crearon vistas, índices, tablas resumen ni migraciones. Los índices existentes ya resultaban útiles; la vista <code>vw_gp_movimientos</code> materializaba filas y relaciones antes del límite y no mejoraba estas lecturas. Se eligieron consultas especializadas y se corrigieron las condiciones de los JOIN para aprovechar los índices actuales.</p>
<p>No se añadió caché compartida ni preagregación persistente. Los cálculos siguen usando las fuentes vigentes y la precisión decimal original. La memoria del componente sólo evita repetir peticiones durante su uso y se invalida al cambiar empresa, filtros o datos. Los permisos y la selección autorizada de empresa siguen validándose en cada endpoint.</p>
<h2>5. Mediciones antes y después</h2>
<p>Comparación controlada: cinco pares alternados, con calentamiento, contra el mismo backend, la misma base de datos y el mismo contenido lógico. Los seis contratos anteriores se conservaron para poder repetir la comparación sin restaurar datos ni simular respuestas.</p>
<div class="table-wrap"><table><thead><tr><th>Métrica inicial</th><th>Antes</th><th>Después</th><th>Reducción</th></tr></thead><tbody>
<tr><td>Peticiones principales</td><td>6</td><td>1</td><td>83,33%</td></tr>
<tr><td>Cuerpo JSON total</td><td>${kb(old.bytes)}</td><td>${kb(current.bytes)}</td><td>${improvement(old.bytes,current.bytes)}</td></tr>
<tr><td>Tiempo HTTP del conjunto, mediana</td><td>${n(old.httpTotalMs)} ms</td><td>${n(current.httpTotalMs)} ms</td><td>${improvement(old.httpTotalMs,current.httpTotalMs)}</td></tr>
<tr><td>Consultas SQL del conjunto, mediana</td><td>${n(old.sqlCalls)}</td><td>${n(current.sqlCalls)}</td><td>${improvement(old.sqlCalls,current.sqlCalls)}</td></tr>
<tr><td>Tiempo SQL acumulado del conjunto, mediana</td><td>${n(old.sqlMs)} ms</td><td>${n(current.sqlMs)} ms</td><td>${improvement(old.sqlMs,current.sqlMs)}</td></tr>
<tr><td>Filas enviadas desde MySQL, mediana</td><td>${n(old.rowsSent)}</td><td>${n(current.rowsSent)}</td><td>${improvement(old.rowsSent,current.rowsSent)}</td></tr>
<tr><td>Filas examinadas en MySQL, mediana</td><td>${n(old.rowsExamined)}</td><td>${n(current.rowsExamined)}</td><td>${improvement(old.rowsExamined,current.rowsExamined)}</td></tr>
<tr><td>Filas de detalle en el mensual inicial</td><td>163</td><td>0</td><td>100%</td></tr>
</tbody></table></div>
<p>En ChromeHeadless se renderizaron el componente original de Git y el actual con respuestas reales y tres muestras de cada uno. La sesión y el contexto común de empresa se establecieron antes de medir, por igual en ambos casos.</p>
<div class="table-wrap"><table><thead><tr><th>Componente en Chrome</th><th>Antes</th><th>Después</th></tr></thead><tbody>
<tr><td>Hasta datos iniciales renderizados, mediana</td><td>${n(median(beforeBrowser.map(x=>x.usableMs)))} ms</td><td>${n(median(afterBrowser.map(x=>x.usableMs)))} ms</td></tr>
<tr><td>Peticiones con catálogo frío</td><td>${n(median(beforeBrowser.map(x=>x.count)))}</td><td>${n(median(afterBrowser.map(x=>x.count)))}</td></tr>
<tr><td>Cuerpos JSON con catálogo frío</td><td>${kb(median(beforeBrowser.map(x=>x.bytes)))}</td><td>${kb(median(afterBrowser.map(x=>x.bytes)))}</td></tr>
<tr><td>Filas DOM iniciales</td><td>${n(median(beforeBrowser.map(x=>x.renderedRows)))}</td><td>${n(median(afterBrowser.map(x=>x.renderedRows)))}</td></tr>
</tbody></table></div>
<p><strong>Scroll real:</strong> las ocho matrices se consultaron dentro del margen de aproximación; también se verificaron Consolidado y Detalle. Se registró cada solicitud desde su inicio, incluyendo posibles errores o cancelaciones. Proveedores no se solicitó al inicio y no volvió a solicitarse al salir y entrar de la sección. Los diez paneles terminaron correctamente con HTTP 200.</p>
<div class="table-wrap"><table><thead><tr><th>Sección al visitarla</th><th>HTTP en Chrome</th><th>JSON sin comprimir</th><th>Estado</th></tr></thead><tbody>${sectionRows}</tbody></table></div>
<p>Perfil final de cada endpoint: lecturas reales con la misma empresa y páginas de 25 registros. La comprobación de Chrome anterior usa la configuración de la interfaz: 50 registros por matriz y 25 en el detalle. Son muestras individuales para atribuir el trabajo; los tiempos varían con la carga de la máquina.</p>
<div class="table-wrap"><table><thead><tr><th>Endpoint</th><th>HTTP</th><th>Respuesta</th><th>SQL</th><th>Filas MySQL</th></tr></thead><tbody>${endpointRows}</tbody></table></div>
<h2>6. Pruebas y alcance</h2>
<ul><li>Backend: 84 pruebas aprobadas, cero errores u omisiones; compilación de las fuentes y pruebas del proyecto.</li><li>Frontend: 106 pruebas aprobadas, incluyendo permisos, cambios de empresa, respuestas obsoletas, filtros, estados de carga, reintentos y acciones sobre todas las páginas. Compilación de producción validada.</li><li>Integración Chrome: seis pruebas con componentes reales, HTTP real, observer real y scroll real; sin sustituir respuestas de API.</li><li>Paridad HTTP: 295 comprobaciones de las ocho matrices y 31 del detalle consolidado; mismas filas, importes, metadatos relevantes, filtros y nombres.</li><li>SQL real: 137 comprobaciones del mensual, 69 del detalle y 42 de la consulta paginada de pagos. Incluye casos de estados NULL, cancelados, meses, empresa y beneficiarios sin modificar datos de negocio.</li><li>Concurrencia: lotes de seis consultas simultáneas, todos HTTP 200; resultados y tiempos guardados en la evidencia.</li></ul>
<div class="note"><strong>Volumen y límites:</strong> se probaron 50.000 movimientos y 5.000 NIT en tablas temporales de una conexión aislada. Una consulta candidata de página + entidades + agregados redujo la recuperación de 50.000 a 560 filas y su mediana de 2.308,8 a 519,4 ms. Este ensayo mide la estrategia y no representa el endpoint final completo: MySQL impidió reutilizar una misma tabla TEMPORARY en ciertos CTE del ensayo exacto. Las consultas finales sí se verificaron contra las tablas reales. La prueba no insertó datos sintéticos en las tablas de negocio.</div>
<p>Los tamaños se expresan como cuerpos JSON sin comprimir; el registro de Chrome conserva también tamaños codificados y transferidos. El tiempo de componente excluye inicio de sesión, descarga inicial de Angular y shell común; no equivale al tiempo de abrir una pestaña completamente fría. La evidencia corresponde al entorno local; las cifras del servidor público deben medirse allí antes de establecer objetivos de latencia.</p>
<h2>7. Archivos y reproducción</h2>
<p>Frontend: <code>presupuesto-page.component.ts/html/scss</code>, <code>gp-carga-visible.directive.ts</code>, modelos, <code>gp-mapper.ts</code>, <code>presupuesto.service.ts</code> y pruebas asociadas. Backend: <code>GestorPresupuestoController</code>, permisos de endpoints, DTO mensual y secciones, <code>PresupuestoPresupuestoService</code>, <code>PresupuestoConsolidadoService</code>, repositorio de pagos y nuevos repositorios <code>PresupuestoMensualConsultaRepository</code> y <code>PresupuestoDetalleConsultaRepository</code>.</p>
<p>Desde <code>Tesoreria</code>, ejecutar <code>node testing/presupuesto-performance/verify-runtime.cjs</code> con frontend 4200 y backend 8081 activos. El script genera y retira sus fixtures temporales, compara con la revisión <code>${esc(browser.baselineRef)}</code> y conserva el informe JSON. Los scripts SQL y HTTP de esta carpeta permiten repetir las mediciones locales usando la configuración existente, sin publicar credenciales.</p>
<p>${link('browser-runtime.json','Chrome: métricas y consultas')} · ${link('controlled-initial-comparison.json','Comparación controlada')} · ${link('after-api-verification.json','Paridad de matrices')} · ${link('after-detalle-api-verification.json','Paridad de detalle')} · ${link('after-db-http-profile.json','Perfil HTTP y SQL')} · ${link('db-baseline-metadata.json','Índices y vistas')} · ${link('sql-final-verification.json','Planes y paridad SQL')} · ${link('join-index-experiment.json','Ensayo de JOIN indexable')} · ${link('isolated-volume-sql.json','Ensayo de volumen aislado')}</p>
</main></html>`;
const output = path.join(dir, 'informe-rendimiento-presupuesto.html');
fs.writeFileSync(output, html, 'utf8');
console.log(output);
