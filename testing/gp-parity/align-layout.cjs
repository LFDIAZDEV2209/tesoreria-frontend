// Migración acotada de las plantillas Angular; no forma parte de la aplicación.
const fs = require('fs');
const base = 'src/app/features/presupuesto/';
function edit(file, fn) { const p=base+file;fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'))); }
function between(s,a,b,replacement) {const start=s.indexOf(a),end=s.indexOf(b,start);if(start<0||end<0)throw Error('No se encontró bloque '+a);return s.slice(0,start)+replacement+s.slice(end);}
edit('components/gp-kpi/gp-kpi.component.ts',s=>{
 s=between(s,'  template: `','  styles: [',`  template: \`
    <div class="kpi-card" [ngClass]="cardClass">
      <div class="kpi-top"><span class="kpi-label">{{ label }}</span><div class="kpi-icon" [ngClass]="iconClass"><app-gp-icon [name]="icon" [size]="16"/></div></div>
      <div class="kpi-value-row"><span class="kpi-value" #valorEl [title]="tooltipTitulo">{{ display }}</span><span *ngIf="pill" class="kpi-trend" [ngClass]="pillClass">{{ pill }}</span></div>
    </div>
  \`,
`);
 return between(s,'  styles: [','})\nexport class',`  styles: [\`
    :host {display:block;min-width:0}
    .kpi-card {position:relative;overflow:hidden;border-radius:16px;background:var(--bg-surface);border:1px solid rgb(var(--bdr-rgb)/.10);box-shadow:var(--sh-card);padding:24px 20px 20px;--kpi:var(--acc-solid)}
    .kpi-card::before {content:'';position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--kpi),transparent 85%)}
    .kpi-top {display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:20px}
    .kpi-label {font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;line-height:1;color:var(--tx-3)}
    .kpi-icon {width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--kpi);color:white;flex-shrink:0;box-shadow:inset 0 1px 0 #ffffff29}
    .kpi-value-row {min-width:0}.kpi-value {font-size:24px;font-weight:700;line-height:1;color:var(--tx-1);font-variant-numeric:tabular-nums}
    .kpi-card--success {--kpi:var(--ok-solid)}.kpi-card--danger {--kpi:var(--err-solid)}.kpi-card--warning {--kpi:var(--warn-solid)}
    .kpi-trend {font-size:11px;color:var(--tx-2);margin-left:6px}
  \`],
`);
});
edit('pages/modulo-page/modulo-page.component.html',s=>{
 s=s.replace('<button acciones *appGpPermiso="\'modulos.importar\'"','<button acciones *ngIf="ctx.tienePermiso(\'modulos.importar\') && (resumen()?.totalMovimientos ?? 0) > 0"');
 return between(s,'  <!-- Empty state -->','  <!-- Sin resultados',`  <div *ngIf="!loading() && !error() && (resumen()?.totalMovimientos ?? 0) === 0 && !hayFiltrosActivos" class="gp-module-empty">
    <div class="gp-empty-symbol"><app-gp-icon name="upload" [size]="40"/></div>
    <h2>Sin datos importados</h2>
    <p>Importa el reporte de <strong>{{ titulo }}</strong> exportado<br class="hidden sm:block"> desde SIIGO para generar el análisis presupuestal.</p>
    <span class="gp-empty-puc">Cuenta PUC: {{ cfg.puc }}</span>
    <button *ngIf="ctx.tienePermiso('modulos.importar')" class="btn-primary gp-empty-import" (click)="wizardAbierto.set(true)"><app-gp-icon name="upload" [size]="18"/> Importar archivo SIIGO</button>
    <button class="btn-ghost" (click)="descargarPlantilla()"><app-gp-icon name="download" [size]="14"/> Descargar plantilla en Excel</button>
    <small>Formatos aceptados: .xlsx · .xls</small>
  </div>

`);
});
edit('pages/presupuesto/presupuesto-page.component.html',s=>{
 s=s.replace('class="gp-native-page gp-page"','class="gp-native-page gp-page module-page" style="--module-accent:#2563EB"');
 s=between(s,'  <!-- Miga + selector -->','  <div *ngIf="error()"',`  <app-gp-page-header class="gp-item" icono="chart" color="#2563EB" titulo="Presupuesto 2026" descripcion="Vista consolidada del presupuesto"><span acciones class="gp-budget-company">{{ ctx.nombreEmpresa() }}</span></app-gp-page-header>

`);
 s=s.replace('<div class="gp-item gp-estado"','<div *ngIf="!contratoIncompleto()" class="gp-item gp-estado"');
 s=between(s,'    <!-- Banner sin datos -->','    <!-- ══════ MENSUAL', '');
 s=s.replace('<div class="gp-item grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">','<div *ngIf="!contratoIncompleto() && meses().length" class="gp-item grid grid-cols-2 lg:grid-cols-4 gap-4">');
 s=s.replace('      <!-- Datos del contrato -->',`      <div *ngIf="!contratoIncompleto() && meses().length" class="gp-budget-downloads">
        <button (click)="descargarPdf()" [disabled]="descargandoPdf() || estadoAprobacion().tipo === 'rechazado'"><app-gp-icon name="download" [size]="20"/>{{ estadoAprobacion().tipo === 'rechazado' ? 'PDF bloqueado — el presupuesto está rechazado' : descargandoPdf() ? 'Generando PDF…' : 'Descargar PDF del Presupuesto' }}</button>
        <button (click)="descargarExcel()" [disabled]="descargandoExcel() || estadoAprobacion().tipo === 'rechazado'"><app-gp-icon name="download" [size]="20"/>{{ estadoAprobacion().tipo === 'rechazado' ? 'Excel bloqueado — el presupuesto está rechazado' : descargandoExcel() ? 'Generando Excel…' : 'Descargar Excel del Presupuesto' }}</button>
      </div>
      <!-- Datos del contrato -->`);
 s=s.replace('class="gp-item card gp-resumen !p-0 overflow-hidden"','class="gp-item card gp-reference-contract !p-0 overflow-hidden"');
 s=s.replace('<div class="gp-contrato-acento"></div>','');
 s=between(s,'            <!-- ── Sub-sección: Avances','          </div>\n        </div>\n      </div>',`            <div class="gp-budget-progress"><div><span>% del contrato ejecutado</span><strong>{{ pctTexto(ejecucionAnimada()) }}</strong></div><progress max="1" [value]="agotamientoPct()"></progress></div>
            <div class="gp-budget-progress"><div><span>% de raciones entregadas</span><strong>{{ contrato()?.diasEntregaAlimentacion ? pctTexto(racionesAnimada()) : '—' }}</strong></div><progress max="1" [value]="racionesPct()"></progress><small>{{ racionesEntregadas().toLocaleString('es-CO') }} de {{ (contrato()?.diasEntregaAlimentacion ?? 0).toLocaleString('es-CO') }} días de entrega</small></div>
`);
 s=between(s,'        <!-- Rail de secciones:','    <!-- ══════ CONSOLIDADO',`        <nav class="gp-budget-index" aria-label="Secciones del presupuesto">@for (sec of seccionesReferencia; track sec.id) { <button (click)="irSeccion(sec.id)">{{ sec.label }}</button> }</nav>
        @for (sec of seccionesReferencia; track sec.id) {
          <section class="card gp-budget-section" [id]="'gp-seccion-' + sec.id">
            <header><button (click)="toggleSeccion(sec.id)" [attr.aria-expanded]="!seccionesCerradas().has(sec.id)"><h2>{{ sec.titulo }}</h2><p>{{ sec.subtitulo }}</p></button><button *ngIf="sec.id === 'proveedores' && esGerencia && ctx.tienePermiso('presupuesto.recalcular_sugeridos')" class="btn-ghost" (click)="recalcularSugeridos()" [disabled]="actualizandoSugeridos()">{{ actualizandoSugeridos() ? 'Actualizando…' : 'Actualizar' }}</button><button class="gp-budget-collapse" [attr.aria-label]="(seccionesCerradas().has(sec.id) ? 'Expandir ' : 'Contraer ') + sec.label" (click)="toggleSeccion(sec.id)"><app-gp-icon [name]="seccionesCerradas().has(sec.id) ? 'chevron-down' : 'chevron-up'" [size]="16"/></button></header>
            <div *ngIf="!seccionesCerradas().has(sec.id)" class="overflow-auto"><ng-container *ngTemplateOutlet="tablaSeccion; context: {sec:sec}"></ng-container></div>
          </section>
        }
      </ng-container>
    </div>
    <div *ngIf="bannerCategorias" class="gp-budget-empty"><div class="gp-empty-symbol"><app-gp-icon name="chart" [size]="36"/></div><h2>Importa los 4 módulos primero</h2><p>El presupuesto consolidado se genera automáticamente cuando hay datos en Proveedores, Anticipos, Cuentas por Pagar y Cuentas por Cobrar.</p></div>

`);
 s=s.replace('pestanaAbierta(\'consolidado\')','!bannerCategorias').replace('pestanaAbierta(\'terceros\')','!bannerCategorias');
 s=s.replace('<span class="gp-panel-hero__chip">24 categorías PAE</span>','');
 return s;
});
