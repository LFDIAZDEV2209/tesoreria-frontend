const fs=require('fs');
const p='src/app/features/presupuesto/pages/pagos-proyectados/pagos-proyectados-page.component.html';
let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
function replaceBlock(start,end,value){const a=s.indexOf(start),b=s.indexOf(end,a);if(a<0||b<0)throw Error(start);s=s.slice(0,a)+value+s.slice(b);}
s=s.replace('class="gp-native-page gp-page"','class="gp-native-page gp-page module-page" style="--module-accent:#E11D48"');
replaceBlock('  <!-- Miga + selector -->','  <div *ngIf="error()"',`  <app-gp-page-header class="gp-item" icono="calendar" color="#E11D48" [titulo]="tituloPagina"
    foto="https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1600&q=82"
    [descripcion]="origen === 'manual' ? 'Provisión del contador — lo que se debe apartar para mediados y fin del mes siguiente, sin pasar por la aprobación de Gerencia' : 'Lo aprobado por Gerencia en Proveedores, Cuentas por pagar, Impuestos y Provisiones — cuándo se paga cada obligación'">
    <button acciones *ngIf="puedeOperar() && origen === 'manual'" class="btn-ghost text-xs" (click)="descargarPlantilla()" [disabled]="descargandoPlantilla()"><app-gp-icon name="download" [size]="14"/> Plantilla</button>
    <label acciones *ngIf="puedeOperar() && origen === 'manual'" class="btn-ghost text-xs cursor-pointer"><app-gp-icon name="upload" [size]="14"/> Importar<input type="file" accept=".xlsx,.xls" class="hidden" (change)="importarExcel($event)"></label>
    <button acciones *ngIf="puedeOperar() && origen === 'manual'" class="btn-primary" (click)="abrirCrear()"><app-gp-icon name="plus" [size]="15"/> Nuevo pago</button>
    <button acciones *ngIf="superadmin() && origen !== 'manual' && pagos().length" class="btn-ghost text-err text-xs" (click)="mostrarLimpiar.set(true)"><app-gp-icon name="trash" [size]="14"/> Limpiar workspace</button>
  </app-gp-page-header>

`);
replaceBlock('    <!-- ══ Banner de salud','    <!-- KPIs -->','');
s=s.replace('grid grid-cols-2 xl:grid-cols-4 gap-3','grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4');
s=s.replace('      <app-gp-kpi label="Próximos 30 días" [value]="resumen()?.proximos30Dias" icon="trending" variante="success"></app-gp-kpi>',`      <app-gp-kpi label="Próximos 30 días" [value]="resumen()?.proximos30Dias" icon="trending" variante="default"></app-gp-kpi>
      <app-gp-kpi [label]="'Ya pagado (' + (resumen()?.cantidadPagados ?? 0) + ')'" [value]="resumen()?.totalPagado" icon="check" variante="success"></app-gp-kpi>`);
replaceBlock('    <!-- ══════════════ PROGRAMADOS','    <!-- ═══════════════ Sugeridos',`    <div *ngIf="pestana() === 'programados'" class="gp-item gp-payment-list">
      <div *ngIf="pagos().length" class="gp-payment-filters">
        <select class="field" aria-label="Proveedor" [ngModel]="filtroProveedor()" (ngModelChange)="filtroProveedor.set($event)"><option value="">Todos los proveedores</option>@for(nombre of beneficiarios();track nombre){<option [value]="nombre">{{nombre}}</option>}</select>
        <div class="gp-payment-date-filters">@for(f of opcionesFecha;track f.id){<button [class.active]="filtroFecha()===f.id" (click)="setFiltroFecha(f.id)">{{f.label}}</button>}</div>
        @if(filtroFecha()==='rango'){<input class="field" aria-label="Desde" type="date" [ngModel]="rangoDesde()" (ngModelChange)="rangoDesde.set($event)"><span>a</span><input class="field" aria-label="Hasta" type="date" [ngModel]="rangoHasta()" (ngModelChange)="rangoHasta.set($event)">}
        <button *ngIf="hayFiltrosActivos()" class="text-xs text-t3" (click)="limpiarPagos()">Quitar filtros</button>
      </div>
      <p *ngIf="hayFiltrosActivos()" class="gp-payment-total">Total filtrado: <strong>{{cp(totalFiltrado())}}</strong> <small>({{filtrados().length}} pagos — compáralo con lo que aprobaste)</small></p>
      @if(!pagos().length){<div class="card gp-payment-empty"><p>No hay pagos programados todavía.</p><small>Ve a la pestaña "Por agendar" para programar pagos sobre obligaciones reales, créalo manual, o impórtalos en bloque con la plantilla de Excel.</small></div>}
      @else if(!programadosOrdenados().length && !pagadosFiltrados().length){<div class="card gp-payment-empty">Ningún pago coincide con estos filtros.</div>}
      @for(seccion of gruposPagos();track seccion.etiqueta){
        <section class="gp-payment-group"><header><span>{{seccion.etiqueta}}</span><strong>{{cp(seccion.total)}}</strong><small>{{seccion.cantidad}} pagos</small><select class="field" [attr.aria-label]="'Proveedor en '+seccion.etiqueta" [ngModel]="filtrosGrupo()[seccion.etiqueta] || ''" (ngModelChange)="filtrosGrupo.set({...filtrosGrupo(),[seccion.etiqueta]:$event})"><option value="">Todos ({{seccion.etiqueta}})</option>@for(nombre of seccion.opciones;track nombre){<option [value]="nombre">{{nombre}}</option>}</select></header>
          @for(grupo of seccion.grupos;track grupo.id){<button class="card gp-payment-card" (click)="abrirGrupo(grupo.id)"><span class="gp-payment-day" [class.overdue]="grupo.fecha < hoy"><small>{{mm(grupo.fecha).mes}}</small><strong>{{mm(grupo.fecha).dia}}</strong></span><span class="gp-payment-beneficiary"><strong>{{grupo.nombre}}</strong><span><app-gp-badge-categoria *ngIf="grupo.categoria" [categoria]="grupo.categoria"/><code>{{grupo.nit}}</code><small *ngIf="grupo.fecha < hoy" class="text-err">ATRASADO</small></span></span><span class="gp-payment-amount"><small>Egreso</small><strong>{{grupo.egreso || (grupo.mixto ? 'Revisar' : 'Sin registrar')}}</strong></span><span class="gp-payment-amount"><small>Total aprobado</small><strong>{{cp(grupo.aprobado)}}</strong><small>{{grupo.pagos.length}} pagos · Total {{cp(grupo.total)}}</small></span><app-gp-icon name="chevron-down" [size]="16"/></button>}
          @if(!seccion.grupos.length){<p class="card gp-payment-empty">Ningún pago coincide con este proveedor.</p>}
        </section>
      }
      @if(pagadosFiltrados().length){<section class="gp-payment-group"><header><span>Pagados</span><strong>{{pagadosFiltrados().length}}</strong></header>@for(p of pagadosFiltrados();track p.id){<button class="card gp-payment-card paid" (click)="abrirEditar(p)"><app-gp-icon name="check" [size]="16"/><strong>{{p.nombre}}</strong><small>{{p.aprobadoPor}}</small><strong>{{cp(p.montoProyectado)}}</strong><small>{{p.fechaPagoReal}}</small></button>}</section>}
    </div>
    @if(detalleGrupo(); as grupo){
      <app-gp-modal [titulo]="grupo.nombre" [subtitulo]="grupo.nit || ''" icono="wallet" ancho="lg" (cerrar)="grupoAbierto.set(null)">
        <div class="gp-payment-detail">
          <p>Total aprobado: <strong>{{cp(grupo.aprobado)}}</strong> · {{grupo.pagos.length}} pagos</p>
          <form *ngIf="puedeOperar() || (esGerencia && !ctx.permisos()?.soloLectura)" (ngSubmit)="guardarEgresoGrupo()" class="gp-payment-filters"><label>Número de egreso<input class="field" name="numeroEgreso" [(ngModel)]="numeroEgreso"/></label><label>Fecha del egreso<input class="field" type="date" name="fechaEgreso" [(ngModel)]="fechaEgreso" [required]="!!numeroEgreso.trim()"/></label><button class="btn-primary" [disabled]="guardandoEgreso()">{{guardandoEgreso()?'Guardando…':'Guardar egreso'}}</button></form>
          @for(p of grupo.pagos;track p.id){<article class="card"><div class="gp-payment-detail-title"><div><strong>{{p.concepto || p.nombre}}</strong><p>{{p.fechaProyectada}}</p></div><strong>{{cp(p.montoProyectado)}}</strong><app-gp-estado-badge [estado]="p.estado"/></div><p *ngIf="p.notas">{{p.notas}}</p><div class="gp-payment-filters"><button *ngIf="puedeAprobar" class="btn-ghost" (click)="aprobarPago(p,!p.aprobado)">{{p.aprobado?'Quitar aprobación':'Aprobar'}}</button><span *ngIf="p.aprobado" class="text-ok text-xs">Aprobado por {{p.aprobadoPor || 'Gerencia'}}</span><button *ngIf="puedeOperar()" class="btn-primary" [disabled]="!p.aprobado || p.estado!=='proyectado'" (click)="pagar(p)">Marcar pagado</button><button class="btn-ghost" [disabled]="bloqueadoMonto(p)" (click)="grupoAbierto.set(null);abrirEditar(p)">Editar</button><button *ngIf="puedeOperar() && (superadmin() || p.estado!=='pagado')" class="btn-ghost text-err" (click)="eliminar(p)">Eliminar</button><button *ngIf="permiso('egresos.registrar') && p.aprobado && p.estado==='proyectado'" class="btn-ghost" (click)="cuentaEgreso='';pagoParaEgreso.set(p)">Registrar egreso en Contabilidad</button></div></article>}
        </div>
      </app-gp-modal>
    }

`);
s=s.replace('(ngModelChange)="filtrosGrupo.set({...filtrosGrupo(),[seccion.etiqueta]:$event})"','(ngModelChange)="filtrarGrupo(seccion.etiqueta,$event)"').replace('(esGerencia && !ctx.permisos()?.soloLectura)','permiso(\'pagos.observaciones\')');
fs.writeFileSync(p,s);
