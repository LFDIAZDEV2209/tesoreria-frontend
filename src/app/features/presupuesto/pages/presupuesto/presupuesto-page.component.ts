import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, ElementRef, NgZone, ViewChild, computed, effect, inject, OnDestroy, OnInit, Input, Optional, signal, untracked, WritableSignal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, map, Observable, Subject, takeUntil } from 'rxjs';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoColaConsultas } from '../../services/presupuesto-cola-consultas';
import {
  CATEGORIA_SIN_CLASIFICAR, Contrato, ConsolidadoFila, DetallePagoMensual, DetalleTerceroMensual, DetalleConsolidado, FacturaSugerida, FilaNomina,
  Mensual, PageResponse, PrevisualizarProveedor, SeccionTerceros, SeccionPagos, formatoCOP, formatoCOPShort, formatoMiles, formatearFechaCO,
} from '../../models/presupuesto.model';
import { generarPresupuestoPdf } from '../../presupuesto-pdf';
import { GpAnticipoLegalizacionService, LegalizacionAnticipo } from '../../services/gp-anticipo-legalizacion.service';
import { GpPermisoDirective } from '../../directives/gp-permiso.directive';
import { GpCargaVisibleDirective } from '../../directives/gp-carga-visible.directive';
import { GpKpiComponent } from '../../components/gp-kpi/gp-kpi.component';
import { GpBadgeCategoriaComponent } from '../../components/gp-badge-categoria/gp-badge-categoria.component';
import { GpEmpresaSelectorComponent } from '../../components/gp-empresa-selector/gp-empresa-selector.component';
import { GpCeldaMontoComponent } from '../../components/gp-celda-monto/gp-celda-monto.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpEstadoBadgeComponent } from '../../components/gp-estado-badge/gp-estado-badge.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpModalComponent } from '../../components/gp-modal/gp-modal.component';
import { GpFiltrosComponent } from '../../components/gp-filtros/gp-filtros.component';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpConfirmarLimpiezaComponent } from '../../components/gp-confirmar-limpieza/gp-confirmar-limpieza.component';
import { gpDespliegue, gpExpander, gpPop, gpStagger } from '../../animations/gp-animations';
import { msj } from '../modulo-page/modulo-page.component';

/** Pestañas del presupuesto (incluye la vista completa "Todos"). */
type PestanaId = 'mensual' | 'consolidado' | 'terceros' | 'todos';

/** Fila mínima para editar el Pago Sugerido (sirve en terceros y en pagos). */
export interface FilaSaldo { nit: string | null; total: number; pagoSugerido?: number | null; }
interface SeleccionSugerido { seccion: string; meses: string[]; }
interface EstadoSeccion {
  cargado: boolean; cargando: boolean; error: string | null;
  pagina: number; paginas: number; total: number; busqueda: string; categoria: string;
}
const ESTADO_SECCION: EstadoSeccion = { cargado: false, cargando: false, error: null, pagina: 0, paginas: 1, total: 0, busqueda: '', categoria: '' };

/** Fila del lote "Aprobar todo" con facturas (terceros y provisiones). */
interface FilaLoteFacturas { nit: string; nombre: string; sugerido: number | null; totalAprobar: number; facturas: FacturaSugerida[]; }

/** Item del lote de conceptos: aprobar un campo (concepto) de un mes. */
interface ItemConceptoLote { campo: string; concepto: string; mes: string; monto: number; }

/** Contenido del modal "Aprobar todo": facturas agrupadas por tercero o
 *  celdas concepto×mes (Nómina/Estampillas). */
interface LoteAprobacion {
  seccion: string; tipo: 'facturas' | 'conceptos';
  moduloBd: 'proveedores' | 'anticipos' | 'cx_cobrar' | 'cx_pagar' | 'provisiones' | null;
  /** Filtro de módulo del endpoint de facturas (impuestos aprueba solo sus
   *  movimientos; proveedores/cuentas por pagar comparten la selección). */
  moduloAprobar: string | null;
  filasFacturas: FilaLoteFacturas[]; filasConceptos: ItemConceptoLote[];
  totalAprobar: number; tercerosConPagos: number;
}

function sumarMeses(valores: Record<string, number>, meses: string[]): number {
  return meses.reduce((total, mes) => total + Math.round((valores[mes] ?? 0) * 100), 0) / 100;
}

@Component({
  selector: 'app-presupuesto-page',
  standalone: true,
  imports: [SelectBuscableDirective,
    CommonModule, FormsModule,
    GpKpiComponent, GpBadgeCategoriaComponent, GpEmpresaSelectorComponent, GpCeldaMontoComponent,
    GpIconComponent, GpEstadoBadgeComponent, GpSkeletonComponent, GpErrorStateComponent,
    GpEmptyStateComponent, GpModalComponent, GpFiltrosComponent, GpPageHeaderComponent,
    GpPermisoDirective, GpConfirmarLimpiezaComponent, GpCargaVisibleDirective,
  ],
  animations: [gpStagger, gpExpander, gpPop, gpDespliegue],
  templateUrl: './presupuesto-page.component.html',
  styleUrls: ['./presupuesto-page.component.scss'],
  host: {
    '(window:resize)': 'actualizarRailFlechas()',
  },
})
export class PresupuestoPageComponent implements OnInit, OnDestroy {
  @Input() modoHistorico = false;
  @Input() periodoHistorico = '';
  @Input() esEjemplo = false;
  @Input() fechaHistorica = '';

  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(PresupuestoToastService);
  private readonly anticiposLegalizaciones = inject(GpAnticipoLegalizacionService);
  readonly comprobantesAbiertos = signal(false);
  readonly cargandoComprobantes = signal(false);
  readonly errorComprobante = signal<string | null>(null);
  readonly documentosPago = signal<{nombre:string;url:string}[]>([]);
  readonly documentoPago = signal<SafeResourceUrl | null>(null);
  private consultaComprobante = 0;
  seleccionarComprobante(url: string): void { this.documentoPago.set(this.sanitizer.bypassSecurityTrustResourceUrl(url)); }
  verComprobantes(seccion: string, mes: string, nit?: string, concepto?: string): void {
    const empresa = this.empresaId;
    if (!empresa) return;
    const consulta=++this.consultaComprobante;
    this.comprobantesAbiertos.set(true); this.cargandoComprobantes.set(true);
    this.documentosPago.set([]); this.documentoPago.set(null); this.errorComprobante.set(null);
    this.service.comprobantesPago(empresa,mes,seccion,nit,concepto).subscribe({
      next: documentos => {
        if(consulta!==this.consultaComprobante || empresa!==this.empresaId) return;
        this.cargandoComprobantes.set(false); this.documentosPago.set(documentos);
        if(documentos.length) this.seleccionarComprobante(documentos[0].url);
        else this.errorComprobante.set('No hay un comprobante de Tesorería disponible para este pago.');
      },
      error: e => { if(consulta===this.consultaComprobante) { this.cargandoComprobantes.set(false); this.errorComprobante.set(msj(e)); } },
    });
  }

  readonly mesesCerrados = computed(() => this.modoHistorico ? [] : this.ctx.estadosMes().filter(m => m.aprobado).map(m => m.periodo));
  mesCerrado(periodo: string): boolean {
    return this.modoHistorico || !this.ctx.puedeEditarMes(periodo);
  }

  /**
   * El presupuesto (contrato) debe estar aprobado por Gerencia para que los
   * pagos proyectados se reflejen en su sección y en la card del resumen
   * rápido. Antes de aprobarlo la sección se muestra vacía (encabezado y fila
   * (Total) en $0) y la card queda en cero. La vista histórica conserva su
   * snapshot tal cual y no aplica la regla.
   */
  readonly presupuestoAprobado = computed(() => this.modoHistorico || this.contrato()?.estadoAprobacion === 'aprobado');

  /** Sección "Pagos Proyectados" visible: datos reales sólo con el presupuesto
   *  aprobado; en cualquier otro estado (pendiente o rechazado) va vacía. */
  readonly pagosProyectadosVisibles = computed<SeccionPagos>(() => {
    const vacia: SeccionPagos = { detalle: [], total: {} };
    if (!this.presupuestoAprobado()) return vacia;
    return this.mensual()?.pagosProyectados ?? vacia;
  });

  // ── P7 — Estado "Legalizado" y comprobantes en la grilla de Anticipos ──

  /** Magnitud legalizada vigente del tercero en el mes (viene del backend). */
  legalizadoMes(d: DetalleTerceroMensual, mes: string): number {
    return Math.max(0, d.legalizadoPorMes?.[mes] ?? 0);
  }

  /** Celda de un mes de Anticipos: '' = sin legalizar, 'total' = quedó en cero por legalizar, 'parcial' = solo parte. */
  estadoLegalizacionMes(d: DetalleTerceroMensual, mes: string): '' | 'total' | 'parcial' {
    const legalizado = this.legalizadoMes(d, mes);
    if (legalizado <= 0) return '';
    return (d.valores[mes] ?? 0) < 0.01 ? 'total' : 'parcial';
  }

  readonly legalizacionesAbiertas = signal(false);
  readonly cargandoLegalizacionesPanel = signal(false);
  readonly errorLegalizacionesPanel = signal<string | null>(null);
  readonly panelLegalizaciones = signal<{ tercero: string; nit: string; mes: string } | null>(null);
  readonly docsLegalizacion = signal<LegalizacionAnticipo[]>([]);
  private consultaLegalizacion = 0;

  /** Panel con los comprobantes de legalización del tercero en un mes. */
  verLegalizaciones(d: DetalleTerceroMensual, mes: string): void {
    const empresa = this.empresaId;
    if (!empresa || !d.nit || this.modoHistorico) return;
    const consulta = ++this.consultaLegalizacion;
    this.panelLegalizaciones.set({ tercero: d.nombre, nit: d.nit, mes });
    this.legalizacionesAbiertas.set(true);
    this.cargandoLegalizacionesPanel.set(true);
    this.docsLegalizacion.set([]);
    this.errorLegalizacionesPanel.set(null);
    this.anticiposLegalizaciones.listarPorNit(empresa, d.nit).subscribe({
      next: filas => {
        if (consulta !== this.consultaLegalizacion || empresa !== this.empresaId) return;
        this.cargandoLegalizacionesPanel.set(false);
        this.docsLegalizacion.set(filas.filter(f => f.periodo === mes && !f.anulada));
      },
      error: e => {
        if (consulta !== this.consultaLegalizacion || empresa !== this.empresaId) return;
        this.cargandoLegalizacionesPanel.set(false);
        this.errorLegalizacionesPanel.set(msj(e));
      },
    });
  }

  /** Abre los bytes del comprobante en una pestaña nueva. */
  abrirLegalizacion(id: number): void {
    const empresa = this.empresaId;
    if (empresa === null) return;
    const ventana = window.open('about:blank', '_blank');
    if (ventana) ventana.opener = null;
    this.anticiposLegalizaciones.contenidosArchivo(empresa, id).subscribe({
      next: respuesta => {
        if (empresa !== this.empresaId) { ventana?.close(); return; }
        if (!respuesta.ok || !respuesta.body || respuesta.body.size === 0) {
          ventana?.close();
          this.toast.error('No se pudo abrir el comprobante de legalización. Intenta de nuevo.');
          return;
        }
        if (ventana) {
          const url = URL.createObjectURL(respuesta.body);
          ventana.location.replace(url);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } else this.toast.error('Permite las ventanas emergentes y vuelve a abrir el comprobante.');
      },
      error: () => { ventana?.close(); this.toast.error('No se pudo abrir el comprobante de legalización. Intenta de nuevo.'); },
    });
  }
  readonly seccionesCerradas = signal(new Set<string>(['notas']));
  readonly resumenProvisiones = signal({ agendado: 0, aprobado: 0, pagado: 0 });
  /** Cards de "Resumen rápido": la card de cada módulo muestra el TOTAL DE
   *  SU SECCIÓN en todos los meses (así lo emite el backend en 'aprobado':
   *  consolidados de terceros, provisiones agendadas y nómina digitada);
   *  "Pagos proyectados" suma SOLO lo que Gerencia aprobó ('aprobadoPagos')
   *  y "Ya pagado" lo pagado de verdad (calendario real, sin cancelados).
   *  Cuentas por cobrar es el consolidado de la sección (dinero que entra,
   *  fuera de los totales de egresos). */
  readonly resumenRapido = computed(() => {
    const r = this.mensual()?.resumenAprobados ?? {};
    const aprobado = (...modulos: string[]) => modulos.reduce((s, m) => s + (r[m]?.aprobado || 0), 0);
    const aprobadoPagos = (...modulos: string[]) => modulos.reduce((s, m) => s + (r[m]?.aprobadoPagos || 0), 0);
    const pagado = (...modulos: string[]) => modulos.reduce((s, m) => s + (r[m]?.pagado || 0), 0);
    const EGRESOS = ['proveedores', 'cx_pagar', 'impuestos', 'anticipos', 'nomina', 'manual', 'importado'];
    return [
      { label: 'Proveedores', valor: aprobado('proveedores') },
      { label: 'Cuentas por pagar', valor: aprobado('cx_pagar') },
      { label: 'Impuestos', valor: aprobado('impuestos') },
      { label: 'Provisiones', valor: aprobado('manual', 'importado') },
      { label: 'Cuentas por cobrar', valor: aprobado('cx_cobrar') },
      { label: 'Anticipos', valor: aprobado('anticipos') },
      // Pagos proyectados sólo se reflejan con el presupuesto aprobado por
      // Gerencia; "Ya pagado" es un hecho ejecutado y no depende de eso.
      { label: 'Pagos proyectados', valor: this.presupuestoAprobado() ? aprobadoPagos(...EGRESOS) : 0 },
      { label: 'Ya pagado', valor: pagado(...EGRESOS) },
    ];
  });
  readonly descargandoExcel = signal(false);
  readonly modalLimpiar = signal(false);
  readonly limpiandoPresupuesto = signal(false);
  readonly conceptoPorAprobar = signal<{ periodo: string; tipo: 'nomina' | 'estampillas'; campo: string; concepto: string; monto: number } | null>(null);
  async limpiarPresupuesto(): Promise<void> {
    const empresa = this.empresaId;
    if (this.modoHistorico || empresa === null || !this.modalLimpiar() || this.limpiandoPresupuesto() || !this.ctx.tienePermiso('pagos.limpiar_workspace')) return;
    this.limpiandoPresupuesto.set(true); this.errorObservacion.set(null);
    try { await firstValueFrom(this.service.limpiarPresupuesto(empresa)); if (empresa === this.empresaId) { this.modalLimpiar.set(false); await this.cargar(); } }
    catch(e) { if (empresa === this.empresaId) this.errorObservacion.set(msj(e)); }
    finally { this.limpiandoPresupuesto.set(false); }
  }
  get seccionesReferencia() {
    // 'estampillas' comentado: sección retirada de esta vista (no debe estar).
    const orden = ['contrato', 'flujo', 'nomina', 'proveedores', 'prestamos', 'impuestos', 'provisiones', 'cuentasCobrar', 'anticipos', 'pagos', 'cobros', 'notas'];
    return orden.map(id => this.seccionesTabla.find(s => s.id === id)!);
  }
  toggleSeccion(id: string): void {
    const cerradas = new Set(this.seccionesCerradas());
    cerradas.has(id) ? cerradas.delete(id) : cerradas.add(id);
    this.seccionesCerradas.set(cerradas);
  }
  irSeccion(id: string): void {
    const cerradas = new Set(this.seccionesCerradas()); cerradas.delete(id); this.seccionesCerradas.set(cerradas);
    this.programarSalto('gp-seccion-' + id);
  }
  /** Scroll manual: scrollIntoView se descarrera con los contenedores
   *  overflow-hidden/animados; aquí medimos la sección y dejamos el título
   *  un poco por debajo de la barra sticky. */
  private programarSalto(idDom: string): void {
    requestAnimationFrame(() => this.desplazarASeccion(idDom));
    setTimeout(() => this.desplazarASeccion(idDom), 350);
  }
  private desplazarASeccion(idDom: string): void {
    const el = this.host?.nativeElement.querySelector<HTMLElement>('#'+idDom) ?? (!this.host?document.getElementById(idDom):null);
    if (!el) return;
    const barra = this.host?.nativeElement.querySelector<HTMLElement>('.gp-budget-index--global') ?? (!this.host?document.querySelector('.gp-budget-index--global') as HTMLElement|null:null);
    const alto = (barra?.offsetHeight ?? 0) + 12;
    const y = el.getBoundingClientRect().top + window.scrollY - alto;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
  subtituloSeccion(id: string): string {
    if (this.modoHistorico) return 'Información conservada al consolidar el mes · Solo lectura';
    const textos: Record<string,string> = {
      contrato:'Haz clic en una celda para editarla directo',
      flujo:'Los meses sin registros permanecen vacíos. El saldo inicial se calcula al registrar información del mes',
      nomina:'Sugerido por concepto y saldo pendiente frente al total de nómina',
      proveedores:`Calculado automático desde la fecha real de cada movimiento — ${this.cantidadFilasSeccion(id)} proveedores`,
      prestamos:`Calculado automático desde Cuentas por Pagar importadas — ${this.cantidadFilasSeccion(id)} terceros`,
      impuestos:`Calculado automático desde Impuestos, Estampillas y Seguros importadas — ${this.cantidadFilasSeccion(id)} terceros`,
      cuentasCobrar:`Calculado automático desde Cuentas por Cobrar importadas — ${this.cantidadFilasSeccion(id)} terceros`,
      anticipos:`Calculado automático desde la fecha real de cada movimiento — ${this.cantidadFilasSeccion(id)} terceros`,
      provisiones:`Lo que el contador agenda por su cuenta, sin aprobación de Gerencia — ${this.cantidadFilasSeccion(id)} beneficiarios. Se edita en el módulo Provisiones`,
      pagos:`Lo aprobado por Gerencia (Proveedores, Cuentas por pagar, Impuestos y Provisiones) — ${this.presupuestoAprobado() ? this.cantidadFilasSeccion(id) : 0} beneficiarios. Se edita en el módulo Pagos Proyectados`,
      cobros:`Lo aprobado por Gerencia (Cuentas por Cobrar) — dinero que entra — ${this.cantidadFilasSeccion(id)} beneficiarios. Se edita en el módulo Pagos Proyectados, pestaña Cuentas por cobrar`,
      notas:'Notas libres por mes — se guardan solas al salir del campo',
    };
    return textos[id] || '';
  }
  async descargarExcel(): Promise<void> {
    if (this.modoHistorico || this.empresaId === null || this.descargandoExcel() || this.estadoAprobacion().tipo === 'rechazado') return;
    this.descargandoExcel.set(true);
    try {
      const blob = await firstValueFrom(this.service.exportarPresupuestoExcel(this.empresaId));
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'Presupuesto.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) { this.errorObservacion.set(msj(e)); }
    finally { this.descargandoExcel.set(false); }
  }

  loading = signal(true);
  error = signal<string | null>(null);

  contrato = signal<Contrato | null>(null);
  mensual = signal<Mensual | null>(null);
  consolidado = signal<ConsolidadoFila[]>([]);
  /** Página actual del detalle por tercero: el backend filtra, ordena y
   *  pagina; aquí solo se guarda lo que se muestra. */
  detalle = signal<DetalleConsolidado[]>([]);
  detalleCategoria = signal('');
  detalleBusqueda = signal('');
  detalleAlerta = signal('');
  detalleNombre = signal('');
  detalleOrden = signal<'asc' | 'desc'>('desc');
  detallePagina = signal(0);
  readonly detalleTamano = 25;
  readonly detalleTotalElementos = signal(0);
  readonly detallePaginasServidor = signal(1);
  readonly detalleNombresServidor = signal<string[]>([]);
  readonly detalleCargando = signal(false);
  readonly errorDetalle = signal<string | null>(null);
  /** Fila del consolidado sin categoría real: sin edición de Sugerido/Notas. */
  readonly categoriaSinClasificar = CATEGORIA_SIN_CLASIFICAR;
  readonly detalleAlertas = [{valor:'alerta',label:'Con alerta (revisar)'},{valor:'sin-alerta',label:'Sin alerta'}];
  detalleNombres(): string[] { return this.detalleNombresServidor(); }
  guardandoNotas = signal<Record<string, boolean>>({});
  errorObservacion = signal<string | null>(null);

  /** Tarjetas independientes: cada una se expande/colapsa por separado. */
  pestanasAbiertas = signal<Record<string, boolean>>({ mensual: true });
  mesActivo = signal<string | null>(null);

  togglePestana(id: PestanaId): void {
    // Pestañas exclusivas: solo un panel visible a la vez (menos saturación).
    this.pestanasAbiertas.set({ [id]: true });
  }

  pestanaAbierta(id: PestanaId): boolean {
    return !!this.pestanasAbiertas()[id];
  }

  modalContrato = signal(false);
  modalRechazo = signal(false);
  motivoRechazo = signal('');
  guardando = signal(false);
  flagOk = signal<Record<string, boolean>>({});
  bannerCategorias = false;

  categorias: string[] = [];
  categoriasHistoricas: string[] = [];

  pestanaOpts: { id: PestanaId; label: string; desc: string; icono: string; color: string }[] = [
    { id: 'mensual', label: 'Presupuesto Mensual', desc: 'Contrato, flujo de caja y nómina por mes', icono: 'calendar', color: '#045C94' },
    { id: 'consolidado', label: 'Consolidado Anual', desc: 'Resumen por categoría con facturado y ejecutado', icono: 'layers', color: '#7C3AED' },
    { id: 'terceros', label: 'Terceros', desc: 'Proveedores, anticipos, cuentas por pagar y cobrar, impuestos', icono: 'users', color: '#0F766E' },
    { id: 'todos', label: 'Todos', desc: 'Todas las tablas del presupuesto, una debajo de la otra', icono: 'layout-dashboard', color: '#213053' },
  ];

  /**
   * Rail de secciones de la vista mensual: reemplaza la pila de acordeones.
   * Un solo panel visible a la vez — un clic en el rail muestra su tabla.
   */
  seccionTablaActiva = signal('contrato');

  readonly seccionesTabla: {
    id: string; grupo: 'operacion' | 'terceros'; label: string; titulo: string; subtitulo: string;
    icono: string; color: string; labelEntidad?: string; labelTotal?: string;
  }[] = [
    { id: 'contrato', grupo: 'operacion', label: 'Sección A', titulo: 'Sección A — Contrato y facturación', subtitulo: 'Contrato, facturación y ejecución del presupuesto — edita una celda con un clic', icono: 'file', color: '#045C94' },
    { id: 'flujo', grupo: 'operacion', label: 'Flujo de caja', titulo: 'Flujo de caja', subtitulo: 'Disponible inicial, ingresos y egresos por mes para conocer el efectivo proyectado', icono: 'waves', color: '#059669' },
    { id: 'nomina', grupo: 'operacion', label: 'Nómina', titulo: 'Nómina', subtitulo: 'Costos de nómina y beneficios por mes con total a pagar y aprobación de Gerencia', icono: 'users', color: '#D97706' },
    // Estampillas: proceso retirado de esta vista (a pedido: "no debería estar").
    // { id: 'estampillas', grupo: 'operacion', label: 'Estampillas', titulo: 'Estampillas', subtitulo: 'Obligaciones parafiscales y estampillas calculadas por mes', icono: 'layers', color: '#E11D48' },
    { id: 'pagos', grupo: 'operacion', label: 'Pagos', titulo: 'Pagos Proyectados', subtitulo: 'Calendario de pagos agendado por beneficiario con ejecutado y pendiente', icono: 'calendar', color: '#7C3AED' },
    { id: 'cobros', grupo: 'operacion', label: 'Cobros', titulo: 'Cobros Proyectados', subtitulo: 'Calendario de cobros agendado por tercero con cobrado y por cobrar', icono: 'trending', color: '#059669' },
    { id: 'provisiones', grupo: 'operacion', label: 'Provisiones', titulo: 'Provisiones', subtitulo: 'Pagos manuales e importados por beneficiario y mes', icono: 'calendar', color: '#0F766E' },
    { id: 'notas', grupo: 'operacion', label: 'Observaciones', titulo: 'Observaciones', subtitulo: 'Notas libres por mes para documentar ajustes y decisiones del presupuesto', icono: 'edit', color: '#045C94' },
    { id: 'proveedores', grupo: 'terceros', label: 'Proveedores', titulo: 'Proveedores', subtitulo: 'Deuda por mes con cada proveedor, pago sugerido y saldo pendiente', icono: 'users', color: '#0F766E', labelEntidad: 'Proveedor', labelTotal: 'Proveedores (Total)' },
    { id: 'anticipos', grupo: 'terceros', label: 'Anticipos', titulo: 'Anticipos', subtitulo: 'Anticipos entregados a proveedores y su saldo pendiente de legalizar', icono: 'wallet', color: '#7C3AED', labelEntidad: 'Proveedor', labelTotal: 'Anticipos (Total)' },
    { id: 'prestamos', grupo: 'terceros', label: 'Cuentas por pagar', titulo: 'Otras Cuentas por Pagar', subtitulo: 'Préstamos y obligaciones con terceros, detalle mes a mes', icono: 'credit-card', color: '#C2410C', labelEntidad: 'Prestamista', labelTotal: 'Otras Cuentas por Pagar (Total)' },
    { id: 'cuentasCobrar', grupo: 'terceros', label: 'Cuentas por Cobrar', titulo: 'Cuentas por Cobrar', subtitulo: 'Derechos por cobrar a terceros: valores y saldo a favor', icono: 'trending', color: '#059669', labelEntidad: 'Tercero', labelTotal: 'Cuentas por Cobrar (Total)' },
    { id: 'impuestos', grupo: 'terceros', label: 'Impuestos', titulo: 'Impuestos, Estampillas y Seguros', subtitulo: 'Obligaciones tributarias y parafiscales por tercero y mes', icono: 'calculator', color: '#D97706', labelEntidad: 'Tercero', labelTotal: 'Impuestos, Estampillas y Seguros (Total)' },
  ];

  /** Config de la sección activa (con fallback seguro). */
  readonly seccionActivaCfg = computed(
    () => this.seccionesTabla.find((s) => s.id === this.seccionTablaActiva()) ?? this.seccionesTabla[0],
  );

  abrirSeccionTabla(id: string): void {
    this.seccionTablaActiva.set(id);
    // El rail es sticky y puede quedar lejos del panel: al cambiar de
    // sección, trae el panel a la vista (solo si no está ya visible).
    setTimeout(() => {
      const panel = this.host?.nativeElement.querySelector('.gp-panel') ?? (!this.host?document.querySelector('.gp-panel'):null);
      if (!panel) return;
      const r = panel.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.55) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  }

  // ── Rail: flechas de scroll horizontal ──
  // El rail se desplaza en X; las flechas (y la rueda del ratón) permiten
  // alcanzar los chips que quedan fuera de la vista.
  @ViewChild('railEl') railEl?: ElementRef<HTMLElement>;
  railAlInicio = signal(true);
  railAlFinal = signal(true);

  ngAfterViewInit(): void {
    // Doble rAF: medir cuando el layout del rail ya exista.
    requestAnimationFrame(() => requestAnimationFrame(() => this.actualizarRailFlechas()));
  }

  actualizarRailFlechas(): void {
    const el = this.railEl?.nativeElement;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    this.railAlInicio.set(el.scrollLeft <= 4);
    this.railAlFinal.set(el.scrollLeft >= max - 4);
  }

  /* Desplazamiento suave: la rueda/flechas acumulan un DESTINO y la
     posición lo persigue con easing exponencial por rAF. Factor bajo
     (0.085): cada frame avanza solo una fracción pequeña del faltante,
     así el recorrido es lento, progresivo y sin brincos — como inercia
     de trackpad. Ticks seguidos de rueda extienden la misma animación. */
  private destinoScrollH = new WeakMap<HTMLElement, number>();
  private animandoScrollH = new WeakSet<HTMLElement>();

  private desplazarSuave(el: HTMLElement, delta: number): void {
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const destino = Math.max(0, Math.min(max, (this.destinoScrollH.get(el) ?? el.scrollLeft) + delta));
    this.destinoScrollH.set(el, destino);
    if (this.animandoScrollH.has(el)) return;
    this.animandoScrollH.add(el);
    const paso = () => {
      const objetivo = this.destinoScrollH.get(el) ?? el.scrollLeft;
      const falta = objetivo - el.scrollLeft;
      if (Math.abs(falta) < 0.5) {
        el.scrollLeft = objetivo;
        this.animandoScrollH.delete(el);
        return;
      }
      el.scrollLeft += falta * 0.085;
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  /** Desplaza el rail con el mismo suavizado (scrollBy smooth es ignorado
   *  por Chrome con scroll-snap obligatorio). */
  railScroll(direccion: number): void {
    const el = this.railEl?.nativeElement;
    if (!el) return;
    this.desplazarSuave(el, direccion * Math.max(240, el.clientWidth * 0.6));
  }

  /** Rueda vertical → scroll horizontal suave (solo si el rail tiene overflow). */
  onRailWheel(ev: WheelEvent): void {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    if ((delta < 0 && el.scrollLeft > 0) || (delta > 0 && el.scrollLeft < max - 1)) {
      ev.preventDefault();
      this.desplazarSuave(el, delta);
    }
  }

  /** Rueda sobre el cuerpo del panel: mueve la tabla en horizontal con
   *  suavizado (si hay overflow) en vez de obligar a arrastrar la barra. */
  onPanelWheel(ev: WheelEvent): void {
    const el = ev.currentTarget as HTMLElement | null;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    if ((delta < 0 && el.scrollLeft > 0) || (delta > 0 && el.scrollLeft < max - 1)) {
      ev.preventDefault();
      this.desplazarSuave(el, delta);
    }
  }

  /** Igual que onPanelWheel, pero solo con intención horizontal: en la vista
   *  "Todos" hay muchas tablas seguidas y no se puede secuestrar el scroll
   *  vertical de la página. */
  onPanelWheelHorizontal(ev: WheelEvent): void {
    if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
    this.onPanelWheel(ev);
  }

  /** Lleva a la tarjeta de una tabla dentro de la vista "Todos". */
  irASeccion(id: string): void {
    this.programarSalto('gp-sec-' + id);
  }

  /** Índice siempre visible: en "Todos" salta a la tarjeta; en el resto
   *  abre la pestaña mensual y lleva a la sección correspondiente. */
  irSeccionGlobal(id: string): void {
    if (this.pestanaAbierta('todos')) { this.irASeccion(id); return; }
    if (this.pestanaAbierta('mensual')) { this.irSeccion(id); return; }
    this.togglePestana('mensual');
    setTimeout(() => this.irSeccion(id), 320);
  }

  volverArriba(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  constructor(
    public ctx: PresupuestoContextService,
    private service: PresupuestoService,
    public auth: AuthorizationService,
    @Optional() private route: ActivatedRoute | null = null,
    @Optional() private readonly host: ElementRef<HTMLElement> | null = null,
  ) {
    // effect() SÃ puede crearse aquÃ­ (contexto de inyecciÃ³n); en ngOnInit NO.
    // Solo la EMPRESA dispara la recarga: el mes activo llega después, async,
    // desde la selección de períodos, y reaccionar a él provocaba una SEGUNDA
    // carga completa de la página (los mismos 7 endpoints, dos veces) al
    // entrar. Los datos ya traen todos los meses y el estado por mes se lee
    // reactivo desde el contexto (estadosMes), así que la segunda pasada era
    // redundante. Al cambiar de mes de consulta la sección no necesita
    // refetch: el resaltado y los candados son señales del contexto.
    effect(() => {
      this.ctx.empresaId();
      untracked(() => this.cargar());
    });
  }

  get empresaId(): number | null {
    return this.ctx.empresaId();
  }

  get esGerencia(): boolean {
    return this.ctx.permisos()?.gerencia ?? this.auth.hasAnyRole(['SUPER_ADMIN', 'ADMIN']);
  }

  /** Operaciones de datos: operativo, o superadmin para correcciones. */
  puedeOperar(): boolean {
    return this.ctx.tienePermiso('presupuesto.editar_periodos');
  }

  get puedeAprobar(): boolean {
    return this.ctx.permisos()?.superAdmin === true || this.ctx.permisos()?.puedeAprobar === true;
  }

  ngOnInit(): void {
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
    if (this.ctx.permisos() === null) this.ctx.cargarPermisos();
  }

  readonly estadosSeccion = signal<Record<string, EstadoSeccion>>({});
  readonly tamanoSeccion = 50;
  readonly errorCategorias = signal<string | null>(null);
  private categoriasCargadas = false;
  private consultaCategorias?: Promise<void>;
  private readonly cancelarCarga = new Subject<void>();
  private readonly colaConsultas = new PresupuestoColaConsultas(2);
  private readonly peticionesSeccion = new Map<string, Promise<void>>();
  private readonly cancelacionesSeccion = new Map<string, Subject<void>>();
  private readonly versionesSeccion = new Map<string, number>();
  private readonly temporizadoresSeccion = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly sugeridosActuales = new Map<string, number>();
  readonly cargandoTablaCompleta = signal(false);

  /** Las secciones siguen decidiendo cuándo consultar; la cola evita saturar la BD al hacer scroll rápido. */
  private consultarDatos<T>(consulta: () => Observable<T>): Observable<T> {
    return this.colaConsultas.ejecutar(consulta).pipe(takeUntil(this.cancelarCarga));
  }

  estadoSeccion(id: string): EstadoSeccion { return this.estadosSeccion()[id] ?? ESTADO_SECCION; }
  private cambiarEstadoSeccion(id: string, cambios: Partial<EstadoSeccion>): void {
    this.estadosSeccion.update(estados => ({ ...estados, [id]: { ...this.estadoSeccion(id), ...cambios } }));
  }
  esSeccionDiferida(id: string): boolean {
    return ['proveedores', 'prestamos', 'impuestos', 'cuentasCobrar', 'anticipos', 'provisiones', 'pagos', 'cobros', 'consolidado', 'terceros'].includes(id);
  }
  seccionLista(id: string): boolean {
    return !this.esSeccionDiferida(id) || this.modoHistorico && !['consolidado', 'terceros'].includes(id) || this.estadoSeccion(id).cargado;
  }
  private campoSeccion(id: string): string {
    return ({ impuestos: 'impuestosEstampillasSeguros', pagos: 'pagosProyectados', cobros: 'cobrosProyectados' } as Record<string, string>)[id] ?? id;
  }
  datosSeccion(id: string): SeccionTerceros | SeccionPagos {
    return (this.mensual() as any)?.[this.campoSeccion(id)] ?? { detalle: [], total: {} };
  }
  private cantidadFilasSeccion(id: string): number {
    const seccion = this.datosSeccion(id);
    return seccion.totalElements ?? seccion.detalle?.length ?? 0;
  }

  /** Las acciones sobre TODA la tabla incluyen las páginas aún no visitadas.
   * Sólo la acción explícita las solicita y nunca descarga otras secciones. */
  private async detalleCompletoSeccion(id: string): Promise<(DetalleTerceroMensual | DetallePagoMensual)[]> {
    const actual = this.datosSeccion(id), estado = this.estadoSeccion(id);
    if (this.modoHistorico || actual.totalElements === undefined ||
        !estado.busqueda && !estado.categoria && (actual.totalElements ?? 0) <= actual.detalle.length) return actual.detalle;
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null) return [];
    const detalle: (DetalleTerceroMensual | DetallePagoMensual)[] = [];
    let pagina = 0, paginas = 1;
    do {
      const respuesta = await firstValueFrom(this.consultarDatos(() => this.service.mensualSeccion(empresaId, this.campoSeccion(id), {
        page: pagina, size: 100,
      })));
      if (empresaId !== this.empresaId || carga !== this.solicitudCarga) return [];
      detalle.push(...respuesta.detalle);
      paginas = respuesta.totalPages ?? 1;
      pagina++;
    } while (pagina < paginas);
    return detalle;
  }

  /** Refresca agregados sin traer los detalles de secciones que siguen ocultas. */
  private aplicarResumen(mensual: Mensual): void {
    this.mensual.update(anterior => {
      if (!anterior) return mensual;
      const actualizado = { ...mensual };
      for (const id of ['proveedores', 'prestamos', 'impuestos', 'cuentasCobrar', 'anticipos', 'provisiones', 'pagos', 'cobros']) {
        if (!this.estadoSeccion(id).cargado) continue;
        const campo = this.campoSeccion(id) as keyof Mensual;
        const previo = anterior[campo] as SeccionTerceros | SeccionPagos;
        // El resumen no lleva los filtros ni la página de la tabla visible.
        // Mezclar sus totales globales con filas filtradas descuadra la tabla.
        // Las secciones afectadas por la edición se revalidan por separado.
        (actualizado as any)[campo] = previo;
      }
      return actualizado;
    });
  }

  private refrescarSeccionesVisitadas(ids: string[]): void {
    for (const id of ids) {
      const estado = this.estadoSeccion(id);
      if (estado.cargado || estado.cargando || estado.error) void this.cargarSeccion(id, true);
    }
  }

  cargarCategorias(): Promise<void> {
    if (this.categoriasCargadas) return Promise.resolve();
    if (this.consultaCategorias) return this.consultaCategorias;
    this.errorCategorias.set(null);
    this.consultaCategorias = firstValueFrom(this.consultarDatos(() => this.service.categorias()))
      .then(categorias => { this.categorias = categorias; this.categoriasHistoricas = categorias; this.categoriasCargadas = true; })
      .catch(e => { if (e?.name !== 'EmptyError') this.errorCategorias.set('No se pudo cargar el catálogo de categorías.'); })
      .finally(() => { this.consultaCategorias = undefined; });
    return this.consultaCategorias;
  }

  /** Un dato cargado se conserva al salir del viewport; sólo filtros o refresco lo invalidan. */
  cargarSeccion(id: string, forzar = false): Promise<void> {
    if (!this.esSeccionDiferida(id) || this.empresaId === null || this.loading()) return Promise.resolve();
    if (!forzar && this.peticionesSeccion.has(id)) return this.peticionesSeccion.get(id)!;
    if (!forzar && this.seccionLista(id)) return Promise.resolve();
    if (this.modoHistorico && !['consolidado', 'terceros'].includes(id)) return Promise.resolve();
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    const version = (this.versionesSeccion.get(id) ?? 0) + 1;
    this.versionesSeccion.set(id, version);
    this.cancelacionesSeccion.get(id)?.next();
    const cancelar = new Subject<void>();
    this.cancelacionesSeccion.set(id, cancelar);
    const vigente = () => empresaId === this.empresaId && carga === this.solicitudCarga && version === this.versionesSeccion.get(id);
    this.cambiarEstadoSeccion(id, { cargando: true, error: null });
    if (!['consolidado', 'terceros', 'pagos', 'cobros', 'provisiones'].includes(id)) void this.cargarCategorias();
    const peticion = (async () => {
      try {
        if (id === 'consolidado') {
          const filas = await firstValueFrom(this.consultarDatos(() => this.service.consolidado(empresaId)).pipe(takeUntil(cancelar)));
          if (vigente()) this.consolidado.set(filas ?? []);
        } else if (id === 'terceros') {
          void this.cargarCategorias();
          await this.cargarDetalle();
          if (this.errorDetalle()) throw new Error(this.errorDetalle()!);
        } else {
          const estado = this.estadoSeccion(id);
          const seccion = await firstValueFrom(this.consultarDatos(() => this.service.mensualSeccion(empresaId, this.campoSeccion(id), {
            page: estado.pagina, size: this.tamanoSeccion, busqueda: estado.busqueda, categoria: estado.categoria,
          })).pipe(takeUntil(cancelar)));
          if (!vigente()) return;
          this.mensual.update(m => m ? { ...m, [this.campoSeccion(id)]: seccion } : m);
          this.cambiarEstadoSeccion(id, { total: seccion.totalElements ?? seccion.detalle.length, paginas: Math.max(1, seccion.totalPages ?? 1), pagina: seccion.page ?? estado.pagina });
        }
        if (vigente()) this.cambiarEstadoSeccion(id, { cargado: true });
      } catch (e) {
        if (vigente()) this.cambiarEstadoSeccion(id, { error: msj(e) });
      } finally {
        cancelar.complete();
        if (vigente()) { this.cambiarEstadoSeccion(id, { cargando: false }); this.peticionesSeccion.delete(id); }
      }
    })();
    this.peticionesSeccion.set(id, peticion);
    return peticion;
  }

  cambiarFiltroSeccion(id: string, campo: 'busqueda' | 'categoria', valor: string): void {
    this.cancelacionesSeccion.get(id)?.next();
    this.versionesSeccion.set(id, (this.versionesSeccion.get(id) ?? 0) + 1);
    this.peticionesSeccion.delete(id);
    this.cambiarEstadoSeccion(id, { [campo]: valor, pagina: 0, cargado: false, cargando: false, error: null });
    clearTimeout(this.temporizadoresSeccion.get(id));
    this.temporizadoresSeccion.set(id, setTimeout(() => { void this.cargarSeccion(id, true); }, campo === 'busqueda' ? 300 : 0));
  }

  paginaSeccion(id: string, delta: number): Promise<void> {
    const estado = this.estadoSeccion(id), pagina = Math.max(0, Math.min(estado.pagina + delta, estado.paginas - 1));
    if (estado.cargando || pagina === estado.pagina) return Promise.resolve();
    this.cambiarEstadoSeccion(id, { pagina });
    return this.cargarSeccion(id, true);
  }

  private cancelarSecciones(): void {
    this.colaConsultas.cancelarTodas();
    this.cancelarCarga.next();
    for (const cancelar of this.cancelacionesSeccion.values()) { cancelar.next(); cancelar.complete(); }
    for (const temporizador of this.temporizadoresSeccion.values()) clearTimeout(temporizador);
    this.cancelacionesSeccion.clear(); this.peticionesSeccion.clear(); this.versionesSeccion.clear(); this.temporizadoresSeccion.clear();
  }

  private solicitudCarga = 0;
  private solicitudDetalle = 0;
  private readonly cancelarDetalle = new Subject<void>();
  ngOnDestroy(): void {
    this.solicitudCarga++;
    this.solicitudDetalle++;
    this.cancelarSecciones(); this.cancelarCarga.complete();
    this.cancelarDetalle.next();
    this.cancelarDetalle.complete();
  }

  async cargar(): Promise<void> {
    const solicitud = ++this.solicitudCarga;
    this.cancelarSecciones(); this.estadosSeccion.set({});
    this.sugeridosActuales.clear();
    this.solicitudDetalle++;
    this.cancelarDetalle.next();
    this.detalleCargando.set(false);
    const empresaId = this.empresaId;
    const vigente = () => solicitud === this.solicitudCarga && empresaId === this.empresaId;
    this.contrato.set(null);
    this.mensual.set(null);
    this.mesesSugeridos.set({}); this.guardandoSugeridos.set({}); this.erroresSugeridos.set({});
    this.guardandoNomina.set({}); this.erroresNomina.set({});
    this.guardandoCategorias.set({});
    this.consolidado.set([]);
    this.resumenProvisiones.set({agendado: 0, aprobado: 0, pagado: 0});
    this.detalle.set([]); this.limpiarDetalle();
    this.modalContrato.set(false);
    this.modalLimpiar.set(false); this.conceptoPorAprobar.set(null);
    this.guardando.set(false); this.errorContrato.set(null);
    this.modalSugerido.set(false);
    this.preview.set(null);
    this.previewModulo.set(null);
    this.observacionPago.set(null);
    this.guardandoNotas.set({}); this.guardandoObservacion.set(false); this.errorObservacion.set(null);
    this.loading.set(empresaId !== null);
    this.error.set(null);
    this.bannerCategorias = false;
    if (empresaId === null) return;
    try {
      const mensual = await firstValueFrom(this.consultarDatos(() => this.service.mensual(empresaId, false, !this.modoHistorico)));
      if (!vigente()) return;
      this.contrato.set(mensual?.contrato ?? null);
      this.mensual.set(mensual ?? null);
      const meses = mensual?.meses ?? [];
      const solicitado = this.ctx.periodo();
      if (!this.modoHistorico && solicitado && meses.includes(solicitado)) this.mesActivo.set(solicitado);

      if (this.modoHistorico && meses.includes(this.periodoHistorico)) this.mesActivo.set(this.periodoHistorico);
      if (meses.length) this.mesActivo.set(meses.includes(this.mesActivo() ?? '') ? this.mesActivo() : meses[meses.length - 1]);
      this.bannerCategorias = !meses.length && !Object.values(mensual?.resumenAprobados ?? {}).some(fila => fila.aprobado || fila.agendado || fila.pagado);
      setTimeout(() => {
        if (!vigente()) return;
        this.animarAnillos();
        requestAnimationFrame(() => { if (vigente()) this.actualizarRailFlechas(); });
      }, 250);
    } catch (e) {
      if (vigente()) this.error.set(msj(e));
    } finally {
      if (vigente()) this.loading.set(false);
    }
  }
  // ── Navegación mensual ──

  mesActual(): string {
    return this.mesActivo() ?? this.ultimoMes() ?? '';
  }

  indiceMes(): number {
    return Math.max(0, this.meses().indexOf(this.mesActual()));
  }

  navegarMes(delta: number): void {
    const ms = this.meses();
    const i = this.indiceMes() + delta;
    if (i >= 0 && i < ms.length) this.mesActivo.set(ms[i]);
  }

  esPrimerMes(): boolean {
    return this.indiceMes() <= 0;
  }

  esUltimoMes(): boolean {
    return this.indiceMes() >= this.meses().length - 1;
  }

  // â”€â”€ Contrato â”€â”€

  errorContrato = signal<string | null>(null);

  guardarContrato(body: Partial<Contrato>): void {
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null || this.guardando() || !this.ctx.tienePermiso('presupuesto.editar_contrato')) return;
    const vigente = () => empresaId === this.empresaId && carga === this.solicitudCarga;
    this.guardando.set(true);
    this.errorContrato.set(null);
    this.service.guardarContrato(empresaId, body).subscribe({
      next: (c) => {
        if (!vigente()) return;
        this.contrato.set(c); this.modalContrato.set(false); this.guardando.set(false); this.cargar();
      },
      error: (e) => {
        if (!vigente()) return;
        this.errorContrato.set(msj(e)); this.guardando.set(false);
      },
    });
  }

  // â”€â”€ AprobaciÃ³n â”€â”€

  /** Aprobación GLOBAL del presupuesto (todo el contrato de una vez):
   *  un solo clic marca el presupuesto completo como aprobado, igual que
   *  antes de la aprobación por mes. El backend registra auditoría y
   *  notifica al contador. */
  aprobar(): void {
    const empresaId = this.empresaId;
    if (empresaId === null || !this.puedeAprobar || this.guardando()) return;
    this.guardando.set(true);
    this.service.aprobar(empresaId).subscribe({
      next: (c) => {
        if (empresaId !== this.empresaId) { this.guardando.set(false); return; }
        this.contrato.set(c);
        // El corte del "reflejo" avanzó: recarga el consolidado para que la
        // card y la sección de pagos muestren lo recién aprobado (con buster
        // `_t` para que IIS/navegador no sirva la respuesta anterior).
        const refresco = ++this.solicitudRefrescoPeriodo;
        this.service.mensual(empresaId, true).subscribe({
          next: m => { if (empresaId === this.empresaId && refresco === this.solicitudRefrescoPeriodo) this.mensual.set(m); },
          error: () => {},
        });
        this.guardando.set(false);
      },
      error: (e) => { alert(msj(e)); this.guardando.set(false); },
    });
  }

  rechazar(): void {
    const empresaId = this.empresaId;
    if (empresaId === null || !this.motivoRechazo().trim()) return;
    this.guardando.set(true);
    this.service.rechazar(empresaId, this.motivoRechazo()).subscribe({
      next: (c) => { this.contrato.set(c); this.modalRechazo.set(false); this.motivoRechazo.set(''); this.guardando.set(false); },
      error: (e) => { alert(msj(e)); this.guardando.set(false); },
    });
  }

  // â”€â”€ EdiciÃ³n de periodos â”€â”€

  private solicitudRefrescoPeriodo = 0;

  guardarCampo(periodo: string, campo: string | null | undefined, valor: number | null): void {
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null || !campo || this.mesCerrado(periodo) || !this.ctx.tienePermiso('presupuesto.editar_periodos')) return;
    const vigente = () => empresaId === this.empresaId && carga === this.solicitudCarga;
    const clave = periodo + campo;
    this.marcarOk(clave, false);
    this.service.guardarPeriodo(empresaId, periodo, campo, valor).subscribe({
      next: () => {
        if (!vigente()) return;
        // Reflexo inmediato: el valor guardado se pinta al instante y el
        // refetch (fresco, con buster) solo consolida los totales.
        this.aplicarCampoOptimista(periodo, campo, valor);
        this.marcarOk(clave, true);
        const refresco = ++this.solicitudRefrescoPeriodo;
        this.consultarDatos(() => this.service.mensual(empresaId, true, true)).subscribe({
          next: m => { if (vigente() && refresco === this.solicitudRefrescoPeriodo) this.aplicarResumen(m); },
          error: e => { if (vigente() && refresco === this.solicitudRefrescoPeriodo) alert(msj(e)); },
        });
        this.actualizarContratoSilently();
        setTimeout(() => { if (vigente()) this.marcarOk(clave, false); }, 1600);
      },
      error: e => { if (vigente()) { this.marcarOk(clave, false); alert(msj(e)); } },
    });
  }

  /** Refleja al instante el valor digitado en TODAS las filas del mensual que
   *  compartan el campo (contrato, flujo, nómina y estampillas). Con esto la
   *  celda muestra el cambio guardado sin esperar el refetch — el gestor
   *  original se comportaba así y en producción el refetch puede verse
   *  demorado o absorvido por la capa de caché de IIS. */
  private aplicarCampoOptimista(periodo: string, campo: string, valor: number | null): void {
    const conValor = (filas: { campo?: string | null; valores: Record<string, number> }[] | undefined) => {
      if (!filas) return undefined;
      return filas.map(f => {
        if (f.campo !== campo) return f;
        const valores = { ...f.valores };
        if (valor === null || valor === undefined) delete valores[periodo]; // vaciado: el refetch consolida
        else valores[periodo] = valor;
        return { ...f, valores };
      });
    };
    this.mensual.update(m => {
      if (!m) return m;
      return {
        ...m,
        filasContrato: conValor(m.filasContrato) ?? m.filasContrato,
        filasFlujoCaja: conValor(m.filasFlujoCaja) ?? m.filasFlujoCaja,
        filasNomina: conValor(m.filasNomina) ?? m.filasNomina,
        filasEstampillas: conValor(m.filasEstampillas) ?? m.filasEstampillas,
      } as Mensual;
    });
  }

  guardandoCuentasCobrar = signal<string | null>(null);

  /** Edición mensual de Cuentas por Cobrar (mismo ciclo que guardarCampo). */
  guardarValorCuentasCobrar(d: DetalleTerceroMensual, mes: string, valor: number | null): void {
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null || this.modoHistorico || this.mesCerrado(mes) || !this.ctx.tienePermiso('presupuesto.editar_periodos')) return;
    const vigente = () => empresaId === this.empresaId && carga === this.solicitudCarga;
    const clave = mes + d.nit;
    this.guardandoCuentasCobrar.set(clave);
    this.service.guardarValorCuentasCobrar(empresaId, d.nit, mes, valor, d.nombre, d.categoria).subscribe({
      next: () => {
        if (!vigente()) return;
        this.guardandoCuentasCobrar.set(null);
        this.consultarDatos(() => this.service.mensual(empresaId, true, true)).subscribe({
          next: m => { if (vigente()) { this.aplicarResumen(m); this.refrescarSeccionesVisitadas(['cuentasCobrar', 'consolidado', 'terceros']); } },
          error: e => { if (vigente()) alert(msj(e)); },
        });
      },
      error: e => { if (vigente()) { this.guardandoCuentasCobrar.set(null); alert(msj(e)); } },
    });
  }

  guardarNotas(periodo: string, evento: Event): void {    const empresaId = this.empresaId;
    const valor = (evento.target as HTMLTextAreaElement).value ?? '';
    if (empresaId === null || this.mesCerrado(periodo) || !this.puedeOperar() || valor === (this.mensual()?.notas?.[periodo] || '')) return;
    this.errorObservacion.set(null);
    this.service.guardarNotasPeriodo(empresaId, periodo, valor).subscribe({
      next: () => { if (empresaId !== this.empresaId) return; this.marcarOk('notas' + periodo, true); this.mensual.update(m => m ? {...m,notas:{...m.notas,[periodo]:valor}} : m); setTimeout(() => this.marcarOk('notas' + periodo, false), 1500); },
      error: e => { if (empresaId === this.empresaId) { this.marcarOk('notas' + periodo, false); this.errorObservacion.set(msj(e)); } },
    });
  }

  aprobandoConcepto = signal<string | null>(null);
  aprobarConcepto(tipo: 'nomina' | 'estampillas', periodo: string, campo: string | null | undefined): void {
    const empresaId = this.ctx.empresaId();
    if (!empresaId || !campo || this.mesCerrado(periodo) || !this.conceptoPorAprobar() || this.aprobandoConcepto() || !this.ctx.tienePermiso(tipo === 'nomina' ? 'presupuesto.aprobar_nomina' : 'presupuesto.aprobar_estampillas')) return;
    this.aprobandoConcepto.set(periodo + campo);
    const llamado$ = tipo === 'nomina'
      ? this.service.aprobarConceptoNomina(empresaId, periodo, campo)
      : this.service.aprobarConceptoEstampillas(empresaId, periodo, campo);
    llamado$.subscribe({
      next: () => {
        this.aprobandoConcepto.set(null);
        if (empresaId === this.empresaId) {
          const dato = this.conceptoPorAprobar();
          this.toast.mostrar(`Se aprobaron ${formatoCOP(dato?.monto ?? 0)} de ${dato?.concepto ?? 'concepto'}.`);
          this.conceptoPorAprobar.set(null);
          this.cargar();
        }
      },
      error: e => { this.aprobandoConcepto.set(null); if (empresaId === this.empresaId) this.errorObservacion.set(msj(e)); },
    });
  }

  setPagoSugeridoCategoria(fila: ConsolidadoFila, valor: number | null): void {
    if (valor === fila.pagoSugerido) return;
    this.guardarCategoria(fila, valor, fila.notas);
  }

  setNotasCategoria(fila: ConsolidadoFila, notas: string): void {
    if (notas === (fila.notas ?? '')) return;
    this.guardarCategoria(fila, fila.pagoSugerido, notas);
  }

  readonly guardandoCategorias = signal<Record<string, boolean>>({});

  private guardarCategoria(fila: ConsolidadoFila, valor: number | null, notas: string | null): void {
    const empresaId = this.empresaId, carga = this.solicitudCarga, categoria = fila.categoria;
    if (empresaId === null || this.guardandoCategorias()[categoria] || !this.ctx.tienePermiso('presupuesto.pago_sugerido_categoria')) return;
    // La fila "(Sin categoría)" agrupa movimientos sin clasificar: no es una
    // categoría real del catálogo, así que no acepta Pago Sugerido ni notas.
    if (categoria === CATEGORIA_SIN_CLASIFICAR) return;
    const vigente = () => empresaId === this.empresaId && carga === this.solicitudCarga;
    this.guardandoCategorias.update(s => ({...s, [categoria]: true}));
    this.errorObservacion.set(null);
    this.service.setPagoSugeridoCategoria(empresaId, categoria, valor, notas).subscribe({
      next: respuesta => {
        if (!vigente()) return;
        // El endpoint devuelve solo la configuración, no los totales calculados.
        this.consolidado.update(filas => filas.map(f => f.categoria === categoria
          ? {...f, pagoSugerido: respuesta.pagoSugerido, notas: respuesta.notas} : f));
        this.guardandoCategorias.update(s => ({...s, [categoria]: false}));
      },
      error: e => {
        if (!vigente()) return;
        this.guardandoCategorias.update(s => ({...s, [categoria]: false}));
        this.errorObservacion.set(msj(e));
      },
    });
  }

  setNotasCategoriaEvent(fila: ConsolidadoFila, event: Event): void {
    this.setNotasCategoria(fila, (event.target as HTMLInputElement).value);
  }

guardarContratoModal(numeroContrato: string, fechaInicial: string, fechaFinal: string,
                       valorInicial: string, dias: string, dinero: string, plazoCxc: string = '45'): void {
    const valor = Number(valorInicial) || 0;
    if (!fechaInicial || !fechaFinal) {
      this.errorContrato.set('Fecha inicial y fecha final son obligatorias.');
      return;
    }
    if (valor <= 0) {
      this.errorContrato.set('El valor inicial del contrato debe ser mayor a cero.');
      return;
    }
    if (!this.usarMismasFechas() && (!this.fechaInicialPresupuesto() || !this.fechaFinalPresupuesto())) {
      this.errorContrato.set('Si el presupuesto usa un rango distinto al contrato, completa la fecha inicial y final del presupuesto.');
      return;
    }
    const plazo = Number(plazoCxc);
    if (!Number.isInteger(plazo) || plazo < 30 || plazo > 60) {
      this.errorContrato.set('El plazo de Cuentas por Cobrar debe estar entre 30 y 60 días.');
      return;
    }
    this.guardarContrato({
      plazoCxcDias: plazo,
      numeroContrato,
      fechaInicial,
      fechaFinal,
      valorInicialContrato: valor,
      diasEntregaAlimentacion: Number(dias) || null,
      dineroInicialDisponible: Number(dinero) || 0,
      fechaInicialPresupuesto: this.usarMismasFechas() ? fechaInicial : (this.fechaInicialPresupuesto() || null),
      fechaFinalPresupuesto: this.usarMismasFechas() ? fechaFinal : (this.fechaFinalPresupuesto() || null),
    });
  }

  /** Rango de presupuesto: por defecto usa las mismas fechas del contrato. */
  montoContrato(valor: number | null | undefined): string { return valor ? valor.toLocaleString('es-CO', {maximumFractionDigits: 0}) : ''; }
  formatearMontoContrato(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/[^0-9]/g, '');
    input.value = digits ? Number(digits).toLocaleString('es-CO') : '';
  }

  usarMismasFechas = signal(true);
  fechaInicialPresupuesto = signal<string>('');
  fechaFinalPresupuesto = signal<string>('');

  onMismasFechasToggle(event: Event): void {
    this.usarMismasFechas.set((event.target as HTMLInputElement).checked);
  }

  textoVencimiento(fecha: string | null | undefined): {texto: string; vencida: boolean} | null {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const fin = new Date(Date.UTC(anio, mes - 1, dia));
    if (fin.toISOString().slice(0, 10) !== fecha) return null;
    const hoy = new Date();
    const fechaBase = this.fechaHistorica ? this.fechaHistorica.slice(0, 10).split('-').map(Number)
      : [hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate()];
    const dias = Math.round((fin.getTime() - Date.UTC(fechaBase[0], fechaBase[1] - 1, fechaBase[2])) / 86400000);
    if (dias === 0) return {texto: 'Vence hoy', vencida: false};
    if (dias > 0) return {texto: `Faltan ${dias} día${dias === 1 ? '' : 's'}`, vencida: false};
    return {texto: `Vencida hace ${-dias} día${dias === -1 ? '' : 's'}`, vencida: true};
  }

  abrirModalContrato(): void {
    const c = this.contrato();
    this.errorContrato.set(null);
    this.usarMismasFechas.set(!c?.fechaInicialPresupuesto ||
      (c.fechaInicialPresupuesto === c.fechaInicial && c.fechaFinalPresupuesto === c.fechaFinal));
    this.fechaInicialPresupuesto.set(c?.fechaInicialPresupuesto ?? c?.fechaInicial ?? '');
    this.fechaFinalPresupuesto.set(c?.fechaFinalPresupuesto ?? c?.fechaFinal ?? '');
    this.modalContrato.set(true);
  }

  guardarObservacion(det: DetalleConsolidado, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    if (valor === (det.observacion ?? '')) return;
    this.persistirObservacion(det.nit, valor);
  }

  private persistirObservacion(nit: string, texto: string | null, desdeModal = false): void {
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null || !this.ctx.tienePermiso('presupuesto.observaciones') || this.guardandoNotas()[nit]) return;
    const vigente = () => empresaId === this.empresaId && carga === this.solicitudCarga;
    this.errorObservacion.set(null);
    this.guardandoNotas.update(v => ({...v, [nit]: true}));
    if (desdeModal) this.guardandoObservacion.set(true);
    const finalizar = () => {
      this.guardandoNotas.update(v => ({...v, [nit]: false}));
      if (desdeModal) this.guardandoObservacion.set(false);
    };
    this.service.setObservacion(empresaId, nit, texto).subscribe({
      next: respuesta => {
        if (!vigente()) return;
        finalizar();
        const observacion = respuesta.observacion ?? null;
        this.detalle.update(filas => filas.map(f => f.nit === nit ? {...f, observacion} : f));
        this.mensual.update(m => {
          if (!m) return m;
          const seccion = m.pagosProyectados;
          return {...m, pagosProyectados: {...seccion,
            detalle: (seccion?.detalle ?? []).map(d => d.nit === nit ? {...d, observacion} : d)}};
        });
        if (desdeModal) this.observacionPago.set(null);
      },
      error: e => {
        if (!vigente()) return;
        finalizar();
        this.errorObservacion.set('No se pudo guardar la observación. ' + msj(e));
      },
    });
  }
  // ── Observación rápida por beneficiario (sección Pagos Proyectados) ──

  /** Modal de observación: {nit, nombre, texto} de la fila en edición. */
  observacionPago = signal<{ nit: string; nombre: string; texto: string } | null>(null);
  guardandoObservacion = signal(false);

  abrirObservacionPago(p: DetallePagoMensual): void {
    if (!p.nit) return;
    this.observacionPago.set({ nit: p.nit, nombre: p.nombre, texto: p.observacion ?? '' });
  }

  cerrarObservacionPago(): void {
    this.observacionPago.set(null);
  }

  guardarObservacionPago(): void {
    const edit = this.observacionPago();
    if (edit) this.persistirObservacion(edit.nit, edit.texto?.trim() || null, true);
  }
  // â”€â”€ Helpers â”€â”€

  actualizarContratoSilently(): void {
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null) return;
    this.consultarDatos(() => this.service.contrato(empresaId)).subscribe({
      next: c => { if (empresaId === this.empresaId && carga === this.solicitudCarga) this.contrato.set(c); },
      error: () => {},
    });
  }

  actualizarMensual(): void { void this.cargar(); }

  private marcarOk(clave: string, valor: boolean): void {
    this.flagOk.update((f) => ({ ...f, [clave]: valor }));
  }

  ok(clave: string): boolean {
    return !!this.flagOk()[clave];
  }

  /** Columnas de mes colapsadas por sección (feature del original: useColumnasColapsables). */
  mesesColapsados = signal<Record<string, Record<string, boolean>>>({});

  /** Columna de mes colapsada: si el usuario no la ha tocado, los meses SIN
   *  información en esa sección llegan colapsados de fábrica (la tabla abre
   *  limpia y el botón + los despliega). Un clic del usuario fija el estado
   *  y desde ahí manda su elección. */
  mesColapsado(seccion: string, mes: string): boolean {
    const explicito = this.mesesColapsados()[seccion]?.[mes];
    if (explicito !== undefined) return explicito;
    return !this.mesConInformacion(seccion, mes);
  }

  /** ¿Este mes tiene algún dato real en la sección? Vacío = todos los
   *  valores de sus filas en 0 (o sin fila total, en pagos/provisiones). */
  mesConInformacion(seccion: string, mes: string): boolean {
    const m = this.mensual();
    if (!m) return true; // sin datos cargados no se colapsa nada de entrada
    const filas = seccion === 'contrato' ? m.filasContrato
      : seccion === 'flujo' ? m.filasFlujoCaja
      : seccion === 'nomina' ? m.filasNomina
      : seccion === 'estampillas' ? m.filasEstampillas : null;
    if (filas) return (filas as any[]).some((f) => Number(f.valores?.[mes] || 0) !== 0);
    if (seccion === 'pagos' || seccion === 'provisiones') {
      const datos: any = seccion === 'pagos' ? m.pagosProyectados : m.provisiones;
      return Number(datos?.total?.[mes] || 0) !== 0;
    }
    return Number((this.seccionTerceros(seccion) as any)?.total?.[mes] || 0) !== 0;
  }

  toggleMesColapsado(seccion: string, mes: string): void {
    this.mesesColapsados.update((m) => ({
      ...m,
      [seccion]: { ...(m[seccion] ?? {}), [mes]: !this.mesColapsado(seccion, mes) },
    }));
  }

  /** Colapsa o expande de una sola vez TODAS las columnas de mes de una
   *  sección: la tabla tiene un mes por columna y con muchos meses se vuelve
   *  impráctica; con el clip animado el cambio se ve fluido. */
  colapsarTodosMeses(seccion: string, colapsado: boolean): void {
    const seleccion: Record<string, boolean> = { ...(this.mesesColapsados()[seccion] ?? {}) };
    for (const m of this.mesesVisibles()) seleccion[m] = colapsado;
    this.mesesColapsados.update((m) => ({ ...m, [seccion]: seleccion }));
  }

  /** ¿Todas las columnas de mes de la sección están colapsadas? */
  mesesTodosColapsados(seccion: string): boolean {
    const meses = this.mesesVisibles();
    return meses.length > 0 && meses.every((m) => this.mesColapsado(seccion, m));
  }

  alternarTodosMeses(seccion: string): void {
    this.colapsarTodosMeses(seccion, !this.mesesTodosColapsados(seccion));
  }

  columnasVisibles(seccion: string): string[] {
    return this.mesesVisibles().filter((m) => !this.mesColapsado(seccion, m));
  }

  nombresTerceros(clave: string): string[] { return [...new Set<string>((this.seccionTerceros(clave).detalle || []).map((d: DetalleTerceroMensual) => d.nombre))].sort((a,b) => a.localeCompare(b)); }

  /** Filtro por nombre/NIT compartido en las tablas de terceros del mensual. */
  filtroTerceros = signal('');

  /** Ajuste manual del valor mensual de Cuentas por Cobrar (AJUSTE-CXC). */
  guardandoCxc = signal<Record<string, boolean>>({});

  async guardarValorCxCobrar(d: DetalleTerceroMensual, mes: string, valor: number | null): Promise<void> {
    const empresaId = this.empresaId;
    if (this.modoHistorico || empresaId === null) return;
    const nit = (d.nit ?? '').trim();
    if (!nit) { this.errorObservacion.set('El tercero no tiene NIT: no se puede ajustar.'); return; }
    if (valor == null || !Number.isFinite(valor) || valor < 0) { this.errorObservacion.set('El valor debe ser mayor o igual a cero.'); return; }
    if (this.mesCerrado(mes)) return;
    const version = empresaId === this.empresaId;
    this.guardandoCxc.update(v => ({ ...v, [nit]: true }));
    try {
      await firstValueFrom(this.service.ajustarCxCobrar(empresaId, nit, mes, Math.round(valor * 100) / 100));
      if (version && empresaId === this.empresaId) await this.actualizarMensual();
    } catch (e) { this.errorObservacion.set('No se pudo ajustar el valor. ' + msj(e)); }
    finally { if (version && empresaId === this.empresaId) this.guardandoCxc.update(v => ({ ...v, [nit]: false })); }
  }

  setFiltroTerceros(event: Event): void {
    this.filtroTerceros.set((event.target as HTMLInputElement).value);
  }

  limpiarFiltroTerceros(): void {
    this.filtroTerceros.set('');
  }

  /* Cachés computadas: antes estos métodos devolvían un array NUEVO en cada
     ciclo de CD y el *ngFor (tracking por identidad) destruía y recreaba TODAS
     las filas — incluida la re-animación de cada una — en cada frame de los
     contadores. Con computed() la identidad es estable hasta que cambian
     `mensual()` o el filtro. */
  private tercerosCache = computed<Record<string, any[]>>(() => {
    const q = this.filtroTerceros().trim().toLowerCase();
    const mapa: Record<string, any[]> = {};
    for (const s of this.seccionesTabla) {
      if (s.grupo !== 'terceros') continue;
      const detalle = this.seccionTerceros(s.id).detalle ?? [];
      mapa[s.id] = q
        ? detalle.filter((d: any) => d.nombre?.toLowerCase() === q)
        : detalle;
    }
    return mapa;
  });

  tercerosFiltrados(clave: string): any[] {
    return this.tercerosCache()[clave] ?? [];
  }

  private tercerosConteoCache = computed<Record<string, string>>(() => {
    const q = this.filtroTerceros().trim().toLowerCase();
    const mapa: Record<string, string> = {};
    for (const s of this.seccionesTabla) {
      if (s.grupo !== 'terceros') continue;
      const detalle = this.seccionTerceros(s.id).detalle ?? [];
      if (!q) {
        mapa[s.id] = `${detalle.length} terceros`;
      } else {
        const n = detalle.filter((d: any) => d.nombre?.toLowerCase().includes(q) || d.nit?.includes(q)).length;
        mapa[s.id] = `${n} de ${detalle.length}`;
      }
    }
    return mapa;
  });

  tercerosContados(clave: string): string {
    return this.tercerosConteoCache()[clave] ?? '';
  }

  mesesVisibles(): string[] {
    return this.meses();
  }

  rangoHistoricoConservado(): string {
    if (!this.modoHistorico || !this.meses().length || this.meses().includes(this.periodoHistorico)) return '';
    return 'El cierre conserva la vista presupuestal de ' + this.fechaCorta(this.meses()[0]) + ' ' + this.meses()[0].slice(0,4)
      + ' a ' + this.fechaCorta(this.meses()[this.meses().length-1]) + ' ' + this.meses()[this.meses().length-1].slice(0,4) + '.';
  }

  meses(): string[] {
    const conservados = this.mensual()?.meses ?? [];
    if(this.modoHistorico) return conservados;
    return [...new Set([...conservados, ...this.ctx.estadosMes().map(m=>m.periodo),
      ...(this.ctx.mesActivo() ? [this.ctx.mesActivo()!] : [])])].sort();
  }

  fechaCorta(mes: string): string {
    const [a, m] = mes.split('-');
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return nombres[Number(m) - 1] || mes;
  }

  ultimoMes(): string | null {
    const meses = this.meses();
    return meses.length ? meses[meses.length - 1] : null;
  }

  valorUltimo(filas: any[], campo: string): number {
    const mes = this.ultimoMes();
    const fila = filas.find((f) => f.campo === campo);
    if (!mes || !fila) return 0;
    return fila.valores?.[mes] ?? 0;
  }

  nominaUltimoMes(): number {
    const mes = this.ultimoMes();
    if (!mes) return 0;
    return (this.mensual()?.filasNomina ?? [])
      .filter((f) => f.concepto.includes('Beneficio'))
      .reduce((acc: number, f: any) => acc + ((f.valores?.[mes] as number) ?? 0), 0);
  }

  nominaMes(mes: string): number {
    return (this.mensual()?.filasNomina ?? [])
      .filter((f) => f.concepto.includes('Beneficio'))
      .reduce((acc: number, f: any) => acc + ((f.valores?.[mes] as number) ?? 0), 0);
  }

  esFilaDestacada(concepto: string): boolean {
    return concepto === 'Total Contrato' || concepto === 'Pendiente por Cobrar'
      || concepto === 'Agotamiento Presupuestal';
  }

  // ── trackBy: sin esto, cada refresh de datos recrea todas las filas del
  //    DOM (identidad nueva) y re-dispara su animación de entrada ──
  trackConcepto(_: number, f: any): string {
    return f?.concepto ?? String(_);
  }

  trackNit(_: number, d: any): string {
    return d?.nit ?? String(_);
  }

  trackCategoria(_: number, f: any): string {
    return f?.categoria ?? String(_);
  }

  trackMes(_: number, m: string): string {
    return m;
  }

  trackSeccion(_: number, s: { id: string }): string {
    return s.id;
  }

  sumaColumna(campo: 'proveedores' | 'anticipos' | 'cxPagar' | 'cxCobrar' | 'impuestos' | 'total'): number {
    return this.consolidado().reduce((acc, f) => acc + (Number((f as any)[campo]) || 0), 0);
  }

  /** Cada filtro del detalle vuelve a pedir la página 0 al backend (que ya
   *  filtra y ordena): no se recorre la cartera completa en el navegador. */
  onDetalleFiltro(ev: { campo: string; valor: string }): Promise<void> {
    this.detallePagina.set(0);
    if (ev.campo === 'busqueda') this.detalleBusqueda.set(ev.valor);
    if (ev.campo === 'categoria') this.detalleCategoria.set(ev.valor);
    if (ev.campo === 'nombre') this.detalleNombre.set(ev.valor);
    if (ev.campo === 'estado') this.detalleAlerta.set(ev.valor);
    return this.cargarDetalle();
  }

  limpiarDetalle(): void {
    this.detalleCategoria.set('');
    this.detalleBusqueda.set('');
    this.detalleAlerta.set(''); this.detalleNombre.set(''); this.detallePagina.set(0);
  }

  /** Carga la página actual del detalle según los filtros/orden vigentes. */
  async cargarDetalle(): Promise<void> {
    const solicitud = ++this.solicitudDetalle;
    this.cancelarDetalle.next();
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null) return;
    const vigente = () => solicitud === this.solicitudDetalle && carga === this.solicitudCarga && empresaId === this.empresaId;
    this.detalleCargando.set(true);
    this.errorDetalle.set(null);
    try {
      const filtros = {
        busqueda: this.detalleBusqueda(), categoria: this.detalleCategoria(),
        nombre: this.detalleNombre(), alerta: this.detalleAlerta(),
        orden: this.detalleOrden(), page: this.detallePagina(), size: this.detalleTamano,
      };
      const pagina = await firstValueFrom(this.consultarDatos(() => this.service.detalleConsolidado(empresaId, filtros)).pipe(takeUntil(this.cancelarDetalle)));
      if (!vigente()) return;
      this.aplicarPaginaDetalle(pagina);
      this.cambiarEstadoSeccion('terceros', { cargado: true, error: null });
    } catch (e) {
      if (vigente()) { this.errorDetalle.set(msj(e)); this.cambiarEstadoSeccion('terceros', { error: msj(e) }); }
    } finally {
      if (vigente()) this.detalleCargando.set(false);
    }
  }

  private aplicarPaginaDetalle(pagina: { content: DetalleConsolidado[]; totalElements: number; totalPages: number; nombres?: string[] } | null): void {
    this.detalle.set(pagina?.content ?? []);
    this.detalleTotalElementos.set(pagina?.totalElements ?? 0);
    this.detallePaginasServidor.set(Math.max(pagina?.totalPages ?? 1, 1));
    this.detalleNombresServidor.set(pagina?.nombres ?? []);
  }

  irPaginaDetalle(delta: number): Promise<void> {
    const destino = Math.min(Math.max(this.detallePagina() + delta, 0), this.detallePaginasServidor() - 1);
    if (destino === this.detallePagina()) return Promise.resolve();
    this.detallePagina.set(destino);
    return this.cargarDetalle();
  }

  valorConcepto(filas: any[], concepto: string, mes: string): number {
    const fila = filas.find((f) => f.concepto === concepto);
    return fila?.valores?.[mes] ?? 0;
  }

  estadoAprobacion(): { tipo: string; label: string } {
    const c = this.contrato();
    const estado = c?.estadoAprobacion ?? null;
    if (estado === 'aprobado') {
      // Reflejo por lotes: los cambios de pagos posteriores a la última
      // aprobación se avisan aquí y se muestran al volver a aprobar.
      const pendientes = this.mensual()?.cambiosPendientesPagos ?? 0;
      const sufijo = pendientes > 0
        ? ` · ${pendientes} ${pendientes === 1 ? 'cambio pendiente' : 'cambios pendientes'} de aprobación`
        : '';
      return { tipo: 'aprobado', label: `Presupuesto aprobado${c?.aprobadoPor ? ' por ' + c.aprobadoPor : ''}${c?.fechaAprobacion ? ' — ' + c.fechaAprobacion.slice(0, 10) : ''}${sufijo}` };
    }
    if (estado === 'rechazado') {
      return { tipo: 'rechazado', label: `Presupuesto rechazado — ${c?.motivoRechazo ?? ''}` };
    }
    return { tipo: '', label: 'Pendiente de aprobación por Gerencia' };
  }

  cp(v: number | null | undefined): string {
    return formatoCOP(v);
  }

  cpShort(v: number | null | undefined): string {
    return formatoCOPShort(v);
  }

  /** Consolidado por categoría: los negativos se muestran entre paréntesis. */
  cpPar(v: number | null | undefined): string {
    return (v ?? 0) < 0 ? '(' + this.cp(Math.abs(v ?? 0)) + ')' : this.cp(v);
  }

cl(v: number | null | undefined): string {
    return (v ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600';
  }

  /** Valor de celda: dinero con formato COP, o entero simple si es un conteo (raciones). */
  cv(f: any, v: number | null | undefined): string {
    if (f?.campo === 'racionesEntregadas') return formatoMiles(v ?? 0);
    return this.cp(v);
  }

  /** El backend ya devuelve la página filtrada y ordenada: la tabla muestra
   *  el contenido tal cual llega (sin filtrar ni ordenar en el navegador). */
  detalleFiltrado(): DetalleConsolidado[] {
    return this.detalle();
  }

  detalleVisible(): DetalleConsolidado[] {
    return this.detalle();
  }

  detallePaginas(): number { return Math.max(this.detallePaginasServidor(), 1); }

  /** El orden del total también viaja al backend (vuelve a la página 0). */
  cambiarOrdenDetalle(): Promise<void> {
    this.detalleOrden.update(v => v === 'asc' ? 'desc' : 'asc');
    this.detallePagina.set(0);
    return this.cargarDetalle();
  }

  seccionTerceros(clave: string): any {
    return (this.mensual() as any)?.[clave === 'impuestos' ? 'impuestosEstampillasSeguros' : clave] ?? { detalle: [], total: {} };
  }

  sumaTerceros(clave: string, campo: string, mes?: string): number {
    const seccion = this.seccionTerceros(clave);
    if (seccion.totales) return mes ? seccion.total?.[mes] ?? 0 : seccion.totales[campo] ?? 0;
    return this.tercerosFiltrados(clave).reduce((s,d) => s + (mes ? d.valores[mes] || 0 : d[campo] || 0), 0);
  }
  sumaPagos(datos: DetallePagoMensual[], campo: 'total' | 'montoPagado' | 'montoPendiente'): number { return datos.reduce((s,d) => s + (d[campo] || 0), 0); }
  totalPagoSeccion(id: string, campo: 'montoPagado' | 'montoPendiente'): number {
    const datos = this.datosSeccion(id);
    return datos.totales?.[campo] ?? this.sumaPagos(datos.detalle as DetallePagoMensual[], campo);
  }

  /** Fila (Total) de las pestañas Pagos/Provisiones/Cobros: SIEMPRE la suma
   *  del detalle del mes (mismo origen que las filas: pagos por fecha
   *  proyectada). Antes "Pagos" usaba totalPresupuesto (saldos de
   *  movimientos + nómina por mes de movimiento), una métrica distinta que
   *  hacía que el Total no cuadrara con Ejecutado + Por ejecutar. */
  totalPagosMes(mes: string, seccionId: string): number {
    // Los pagos proyectados sólo cuentan con el presupuesto aprobado.
    if (seccionId === 'pagos' && !this.presupuestoAprobado()) return 0;
    const campo = seccionId === 'pagos' ? 'pagosProyectados' : seccionId === 'cobros' ? 'cobrosProyectados' : 'provisiones';
    const pagos = (this.mensual() as any)?.[campo];
    return pagos?.total?.[mes] ?? 0;
  }

  /** Columna Total de la pestaña Pagos: suma de TODOS los meses visibles del
   *  total del presupuesto (mismo origen que totalPagosMes). No depende del
   *  colapso visual de columnas: el Total no cambia al plegar meses. */
  sumaPagosMeses(seccionId: string, campo: 'total'): number {
    let s = 0;
    for (const m of this.mesesVisibles()) s += this.totalPagosMes(m, seccionId);
    return s;
  }
  saldoDetalle(valor: number): string { return valor < 0 ? '(' + this.cp(Math.abs(valor)) + ')' : this.cp(valor); }
  importeDetalle(valor: number): string { return valor ? this.cp(Math.abs(valor)) : '—'; }
  alertaDetalle(d: DetalleConsolidado): boolean { return (d.proveedores || 0) !== 0 && (d.anticipos || 0) !== 0; }

  /** Contador de filas mostrado en la cabecera de cada tarjeta acordeón. */
  contadorSeccion(id: string): string {
    const m = this.mensual();
    if (!m) return '';
    switch (id) {
      case 'contrato': return `${m.filasContrato.length} conceptos`;
      case 'flujo': return `${m.filasFlujoCaja.length} conceptos`;
      case 'nomina': return `${m.filasNomina.length} conceptos`;
      case 'estampillas': return `${m.filasEstampillas.length} conceptos`;
      case 'pagos': return `${this.presupuestoAprobado() ? this.cantidadFilasSeccion(id) : 0} beneficiarios`;
      case 'cobros':
      case 'provisiones': return `${this.cantidadFilasSeccion(id)} beneficiarios`;
      case 'notas': return `${m.meses.length} meses`;
      default:
        return `${this.cantidadFilasSeccion(id)} terceros`;
    }
  }

  /** Número corto para el chip del rail. */
  contadorCorto(id: string): string {
    const m = this.mensual();
    if (!m) return '';
    switch (id) {
      case 'contrato': return String(m.filasContrato.length);
      case 'flujo': return String(m.filasFlujoCaja.length);
      case 'nomina': return String(m.filasNomina.length);
      case 'estampillas': return String(m.filasEstampillas.length);
      case 'pagos': return String(this.presupuestoAprobado() ? this.cantidadFilasSeccion(id) : 0);
      case 'cobros':
      case 'provisiones': return String(this.cantidadFilasSeccion(id));
      case 'notas': return String(m.meses.length);
      default:
        return String(this.cantidadFilasSeccion(id));
    }
  }

  // ── Funcionales del panel mensual (réplica del presupuesto de referencia) ──

  descargandoPdf = signal(false);
  recalculando = signal(false);
  actualizandoSugeridos = signal(false);

  contratoIncompleto(): boolean {
    const c = this.contrato();
    return !c?.fechaInicial || !c?.fechaFinal || !c?.valorInicialContrato;
  }

  private filaConcepto(concepto: string): any {
    return (this.mensual()?.filasContrato ?? []).find((f) => f.concepto === concepto);
  }

  totalContratoValor(): number {
    const fila = this.filaConcepto('Total Contrato');
    const mes = this.ultimoMes();
    return fila && mes ? (fila.valores?.[mes] ?? 0) : (this.contrato()?.valorInicialContrato ?? 0);
  }

  agotamientoValor(): number {
    const fila = this.filaConcepto('Agotamiento Presupuestal');
    const mes = this.ultimoMes();
    return fila && mes ? (fila.valores?.[mes] ?? 0) : 0;
  }

  agotamientoPct(): number {
    const total = this.totalContratoValor();
    return total ? 1 - this.agotamientoValor() / total : 0;
  }

  agotamientoAlto(): boolean {
    return this.agotamientoPct() >= 0.85;
  }

  /** Pago Sugerido total — dedup por NIT (cuentasCobrar no entra: su sugerido es 0). */
  totalPagoSugerido(): number {
    const m = this.mensual();
    if (!m) return 0;
    if (m.totalesGlobales) return m.totalesGlobales.totalPagoSugerido;
    const porNit = new Map<string, number>();
    for (const seccion of [m.proveedores, m.anticipos, m.prestamos, m.impuestosEstampillasSeguros]) {
      for (const p of seccion?.detalle ?? []) {
        porNit.set(p.nit, (p.pagoSugerido ?? 0));
      }
    }
    return [...porNit.values()].reduce((s, v) => s + (v ?? 0), 0);
  }

  totalSugeridoAprobado(): number {
    const m = this.mensual();
    if (!m) return 0;
    if (m.totalesGlobales) return m.totalesGlobales.totalSugeridoAprobado;
    return [...new Map([m.proveedores, m.anticipos, m.prestamos, m.impuestosEstampillasSeguros].flatMap(s => (s?.detalle || []).map(d => [d.nit, d] as const))).values()].reduce((s,d) => s + (d.totalYaAprobado || 0), 0);
  }

  racionesEntregadas(): number {
    const fila = this.filaConcepto('Días de Entrega');
    return fila ? Object.values(fila.valores ?? {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0) : 0;
  }

  racionesPct(): number {
    const esperadas = this.contrato()?.diasEntregaAlimentacion ?? 0;
    return esperadas ? this.racionesEntregadas() / esperadas : 0;
  }

  // ── Anillos de progreso (SVG) ──
  // Circunferencia del círculo r=42 → 2π·42 ≈ 264. El arco parte del arco
  // vacío (dashoffset = 264) y con una transición CSS avanza hasta el
  // porcentaje real — disparado con `animoAnillos` tras cargar los datos
  // (doble rAF para que el navegador pinte primero el estado inicial).
  readonly ANILLO_C = 264;

  /** true → el arco CSS transiciona hasta su destino y los % cuentan de 0. */
  animoAnillos = signal(false);
  /** Valores animados del % (contador en pantalla). */
  ejecucionAnimada = signal(0);
  racionesAnimada = signal(0);

  anilloOffset(pct: number): number {
    return this.ANILLO_C * (1 - Math.min(Math.max(pct, 0), 1));
  }

  /** Offset actual del arco: vacío mientras no arranca la animación. */
  offsetEjecucion(): number {
    return this.animoAnillos() ? this.anilloOffset(this.agotamientoPct()) : this.ANILLO_C;
  }

  offsetRaciones(): number {
    return this.animoAnillos() ? this.anilloOffset(this.racionesPct()) : this.ANILLO_C;
  }

  pctTexto(pct: number): string {
    return (pct * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%';
  }

  /** Reinicia y dispara la animación de anillos + contadores. */
  animarAnillos(): void {
    this.animoAnillos.set(false);
    this.ejecucionAnimada.set(0);
    this.racionesAnimada.set(0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.animoAnillos.set(true);
      this.contar(this.agotamientoPct(), this.ejecucionAnimada);
      this.contar(this.racionesPct(), this.racionesAnimada);
    }));
  }

  /** Cuenta de 0 al valor destino con easing cubic-out, vía rAF.
   *  El easing se evalúa con el tiempo real, pero la señal solo se escribe
   *  cada ~50ms: cada `.set()` dispara change detection sobre TODO el
   *  template (tablas incluidas) y a 60fps eso congela la página. */
  private contar(destino: number, destinoSignal: WritableSignal<number>): void {
    const duracion = 1200;
    const intervalo = 50;
    const t0 = performance.now();
    let ultimo = -Infinity;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duracion, 1);
      if (t - ultimo >= intervalo || p === 1) {
        ultimo = t;
        const eased = 1 - Math.pow(1 - p, 3);
        destinoSignal.set(destino * eased);
      }
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private sumaTotalSeccion(clave: 'proveedores' | 'anticipos' | 'prestamos' | 'cuentasCobrar' | 'impuestos'): number {
    const seccion = this.seccionTerceros(clave);
    if (seccion.totales) return seccion.totales.total ?? 0;
    return (this.seccionTerceros(clave).detalle ?? []).reduce((s: number, p: any) => s + (p.total ?? 0), 0);
  }

  kpiIngresosPorCobrar(): number {
    return this.valorConcepto(this.mensual()?.filasContrato ?? [], 'Pendiente por Cobrar', this.ultimoMes() ?? '');
  }

  kpiTotalNomina(): number {
    const filas = this.mensual()?.filasNomina ?? [];
    const total = filas[filas.length - 1];
    return total ? Object.values(total.valores ?? {}).reduce((s: number, v: any) => s + (Number(v) || 0), 0) : 0;
  }

  kpiObligacionesPendientes(): number {
    return this.kpiTotalNomina()
      + this.sumaTotalSeccion('proveedores') + this.sumaTotalSeccion('prestamos')
      + this.sumaTotalSeccion('impuestos');
  }

  kpiCuentasPorCobrar(): number {
    return this.sumaTotalSeccion('anticipos') + this.sumaTotalSeccion('cuentasCobrar');
  }

  kpiNecesidadApalancamiento(): number {
    return this.kpiIngresosPorCobrar() + this.kpiCuentasPorCobrar() - this.kpiObligacionesPendientes();
  }

  // ── PDF ──

  async descargarPdf(): Promise<void> {
    const contrato = this.contrato();
    const mensual = this.mensual();
    if (!contrato || !mensual) return;
    if (contrato.estadoAprobacion === 'rechazado') {
      alert('No puedes descargar el PDF mientras el presupuesto esté rechazado. Corrige lo que pidió Gerencia y espera a que lo vuelvan a aprobar.');
      return;
    }
    this.descargandoPdf.set(true);
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    try {
      const completo = this.modoHistorico || empresaId === null ? mensual
        : await firstValueFrom(this.consultarDatos(() => this.service.mensual(empresaId)));
      if (empresaId !== this.empresaId || carga !== this.solicitudCarga) return;
      generarPresupuestoPdf(contrato, completo, this.mesesVisibles());
    } catch (e) {
      if (empresaId === this.empresaId && carga === this.solicitudCarga) this.errorObservacion.set(msj(e));
    } finally {
      this.descargandoPdf.set(false);
    }
  }

  // ── Recalcular / sugeridos ──

  recalcular(): void {
    this.recalculando.set(true);
    this.cargar().finally(() => this.recalculando.set(false));
  }

  recalcularSugeridos(): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.actualizandoSugeridos.set(true);
    this.service.recalcularSugeridos(empresaId).subscribe({
      next: () => this.actualizarMensual(),
      error: (e) => alert(msj(e)),
    }).add(() => this.actualizandoSugeridos.set(false));
  }

  /**
   * Vista previa EN VIVO: mientras se digita el Pago Sugerido, el Saldo
   * Pendiente de la fila (y de las demás secciones del MISMO proceso) se
   * rebaja al instante sin guardar ni tocar el valor digitado. El guardado
   * real ocurre en (commit).
   */
  previsualizarSaldoProveedor(d: FilaSaldo, valor: number | null, seccionId?: string): void {
    this.aplicarSaldoOptimista(d, valor, false, this.ambitoSugerido(seccionId));
  }

  /** El sugerido de egresos (CxP) y el de cobros (CxC) son procesos
   *  separados: editar uno NUNCA toca las secciones del otro. */
  private ambitoSugerido(seccionId?: string): 'egresos' | 'cobros' {
    return seccionId === 'cuentasCobrar' ? 'cobros' : 'egresos';
  }

  /** El sugerido se guarda por NIT y proceso; cada sección conserva su total. */
  private aplicarSaldoOptimista(d: FilaSaldo, valor: number | null, fijarSugerido: boolean,
                                ambito: 'egresos' | 'cobros' = 'egresos'): void {
    if (!d.nit) return;
    this.mensual.update(m => {
      if (!m) return m;
      const actualizarSeccion = (seccion: any) => {
        const fila = seccion?.detalle?.find((item: any) => item.nit === d.nit);
        const delta = fila ? (valor ?? 0) - (fila.pagoSugerido ?? 0) : 0;
        return {
        ...seccion,
        totales: seccion?.totales && fijarSugerido ? {
          ...seccion.totales,
          pagoSugerido: (seccion.totales.pagoSugerido ?? 0) + delta,
          saldoPendiente: (seccion.totales.saldoPendiente ?? 0) - delta,
        } : seccion?.totales,
        detalle: seccion?.detalle?.map((item: any) => {
          if (item.nit !== d.nit) return item;
          const yaAprobado = item.totalYaAprobado ?? item.yaAprobadoPendienteDePago ?? 0;
          const valorNuevo = valor ?? 0;
          // Igual que el backend (GREATEST(total − comprometido, 0)): el saldo
          // en vivo nunca se vuelve negativo aunque el valor digitado supere
          // lo disponible; un negativo aquí solo confundía al usuario.
          const saldoPendiente = Math.max(0, Math.round(((item.total ?? 0) - yaAprobado - valorNuevo) * 100) / 100);
          return fijarSugerido
            ? { ...item, pagoSugerido: valorNuevo, saldoPendiente }
            : { ...item, saldoPendiente };
        }) ?? []
      }; };
      if (ambito === 'cobros') {
        return {
          ...m,
          cuentasCobrar: actualizarSeccion(m.cuentasCobrar),
          cobrosProyectados: actualizarSeccion(m.cobrosProyectados),
        };
      }
      const filaAnterior = [m.proveedores, m.prestamos, m.impuestosEstampillasSeguros]
        .flatMap(seccion => seccion?.detalle ?? []).find(item => item.nit === d.nit);
      const anterior = this.sugeridosActuales.get(d.nit!) ?? filaAnterior?.pagoSugerido ?? d.pagoSugerido ?? 0;
      if (fijarSugerido) this.sugeridosActuales.set(d.nit!, valor ?? 0);
      return {
        ...m,
        totalesGlobales: m.totalesGlobales && fijarSugerido ? {
          ...m.totalesGlobales,
          totalPagoSugerido: m.totalesGlobales.totalPagoSugerido + (valor ?? 0) - anterior,
        } : m.totalesGlobales,
        proveedores: actualizarSeccion(m.proveedores),
        prestamos: actualizarSeccion(m.prestamos),
        impuestosEstampillasSeguros: actualizarSeccion(m.impuestosEstampillasSeguros),
        pagosProyectados: actualizarSeccion(m.pagosProyectados),
      };
    });
  }

  guardarPagoSugeridoProveedor(d: FilaSaldo, valor: number | null, seccionId?: string): void {
    if ((d.pagoSugerido ?? null) === valor) return;
    this.persistirSugerido(d, valor, undefined, false, seccionId);
  }

  readonly mesesSugeridos = signal<Record<string, SeleccionSugerido | undefined>>({});
  readonly guardandoSugeridos = signal<Record<string, boolean>>({});
  readonly erroresSugeridos = signal<Record<string, string | null>>({});

  puedeSugerir(seccion: string): boolean {
    // Cuentas por Cobrar también maneja Sugerido (cupo para aprobar cobros);
    // Proveedores/Cuentas por pagar/Impuestos comparten el maestro por NIT.
    return !this.modoHistorico && ['proveedores', 'prestamos', 'impuestos', 'cuentasCobrar'].includes(seccion)
      && this.esGerencia && this.ctx.tienePermiso('presupuesto.pago_sugerido_proveedor');
  }

  /** Edición del Pago Sugerido por tercero: secciones del maestro
   *  compartido por NIT (Cuentas por Cobrar incluye su flujo de aprobar
   *  cobros hasta cubrir lo sugerido; la columna Total conserva el suyo). */
  puedeEditarSugerido(seccion: string): boolean {
    return !this.modoHistorico && ['proveedores', 'prestamos', 'impuestos', 'cuentasCobrar'].includes(seccion)
      && this.esGerencia && this.ctx.tienePermiso('presupuesto.pago_sugerido_proveedor');
  }

  mesesSeleccionados(seccion: string, nit: string): string[] {
    const seleccion = this.mesesSugeridos()[nit];
    return seleccion?.seccion === seccion ? seleccion.meses : [];
  }

  sugerirFilaCompleta(seccion: string, d: DetalleTerceroMensual, limpiar = false, limpiezaConfirmada = false, onDone?: () => void): void {
    if (!this.puedeSugerir(seccion)) { onDone?.(); return; }
    const meses = limpiar ? [] : this.mesesVisibles().filter(m => Number.isFinite(d.valores[m]) && this.pendienteMes(d, m) > 0);
    this.persistirSugerido(d, this.sumaPendienteMeses(d, meses), {seccion, meses}, limpiezaConfirmada, seccion, onDone);
  }

  sugerirTabla(seccion: string, limpiar = false): void {
    if (!this.puedeSugerir(seccion) || this.sugeridosOcupados()) return;
    const datos = this.datosSeccion(seccion), estado = this.estadoSeccion(seccion);
    if (datos.totalElements !== undefined && (estado.busqueda || estado.categoria || datos.totalElements > datos.detalle.length)) {
      const empresaId = this.empresaId, carga = this.solicitudCarga;
      this.cargandoTablaCompleta.set(true);
      this.detalleCompletoSeccion(seccion).then(detalle => {
        if (empresaId === this.empresaId && carga === this.solicitudCarga) this.aplicarSugeridoTabla(seccion, detalle as DetalleTerceroMensual[], limpiar);
      }).catch(e => { if (empresaId === this.empresaId && carga === this.solicitudCarga) this.toast.error(msj(e)); })
        .finally(() => this.cargandoTablaCompleta.set(false));
      return;
    }
    this.aplicarSugeridoTabla(seccion, datos.detalle as DetalleTerceroMensual[], limpiar);
  }

  private aplicarSugeridoTabla(seccion: string, detalle: DetalleTerceroMensual[], limpiar: boolean): void {
    // Una sola confirmación para toda la tabla: aunque sea "Sumar todas las
    // filas", pueden quedar filas cuyo mes sumado baje el Sugerido actual, y
    // reducirlas cancela sus proyecciones aprobadas pendientes (mismo caso
    // real que la limpieza). La respuesta aplica a TODO el lote.
    const reducen = limpiar ? [] : detalle.filter(d => {
      const meses = this.mesesVisibles().filter(m => Number.isFinite(d.valores[m]) && this.pendienteMes(d, m) > 0);
      return this.sumaPendienteMeses(d, meses) < (d.pagoSugerido ?? 0);
    });
    if (limpiar) {
      if (detalle.some(d => !!d.pagoSugerido)
        && !window.confirm('Se limpiará la columna Sugerido de toda esta tabla. Se cancelarán las proyecciones aprobadas pendientes que dependan de esos sugeridos. Los pagos realizados y los datos mensuales se conservan. ¿Continuar para todas las filas?')) return;
    } else if (reducen.length > 0) {
      if (!window.confirm('Pueden quedar filas con un Sugerido menor al registrado. Reducirlo cancelará sus Pagos Proyectados aprobados y sin pagar; lo ya pagado no se toca. Los pagos realizados y los datos mensuales se conservan. ¿Continuar para todas las filas?')) {
        // El usuario no acepta cancelaciones: solo se envían las filas seguras.
        for (const d of detalle.filter(x => !reducen.includes(x))) this.sugerirFilaCompleta(seccion, d, false, false);
        return;
      }
    }
    // Todas las filas, incluso las ocultas por el filtro de terceros.
    // Refresco ÚNICO al terminar el lote: un refresco por fila saturaba el
    // endpoint mensual (95 peticiones en una limpieza) y dejaba la tabla con
    // importes viejos cuando el último refresco competía con los guardados.
    let pendientes = detalle.length;
    const alTerminarFila = () => {
      if (--pendientes === 0) this.refrescarTrasLote(seccion);
    };
    for (const d of detalle) this.sugerirFilaCompleta(seccion, d, limpiar, limpiar || reducen.length > 0, alTerminarFila);
  }

  /** Refresco único tras un lote ("Limpiar columna" / "Sumar todas las filas"):
   *  la cancelación forzada cambia proyecciones y saldos en el backend, así que
   *  se revalida la sección editada y las que comparten el maestro por NIT. */
  private refrescarTrasLote(seccion: string): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.consultarDatos(() => this.service.mensual(empresaId, true, true)).subscribe({
      next: m => {
        if (empresaId !== this.empresaId) return;
        this.aplicarResumen(m);
        // La sección editada y sus hermanas del maestro (comparten pago_sugerido
        // por NIT) además del flujo de pagos/cobros, provisiones y consolidado.
        this.refrescarSeccionesVisitadas(['proveedores', 'prestamos', 'impuestos', 'cuentasCobrar', 'pagos', 'cobros', 'provisiones', 'consolidado', 'terceros']);
      },
      error: () => { /* El lote ya se guardó; el refresco fallido se reintenta con Actualizar. */ },
    });
  }

  sugerirNominaCompleta(f: FilaNomina, limpiar = false): void {
    if (!this.puedeSugerirNomina() || !f.campo) return;
    const meses = limpiar ? [] : this.mesesVisibles().filter(m => !!f.aprobados?.[m] && Number.isFinite(f.valores[m]) && !!f.valores[m]);
    this.guardarSugeridoNomina(f, sumarMeses(f.valores, meses), meses);
  }

  sugerirTablaNomina(limpiar = false): void {
    for (const f of this.mensual()?.filasNomina ?? []) this.sugerirNominaCompleta(f, limpiar);
  }

  sugerirTablaCategorias(limpiar = false): void {
    if (this.modoHistorico || !this.ctx.tienePermiso('presupuesto.pago_sugerido_categoria')) return;
    for (const f of this.consolidado()) {
      if (f.categoria === CATEGORIA_SIN_CLASIFICAR) continue;
      this.setPagoSugeridoCategoria(f, limpiar ? 0 : f.total);
    }
  }

  sugeridosOcupados(): boolean {
    return this.cargandoTablaCompleta() || [...Object.values(this.guardandoSugeridos()), ...Object.values(this.guardandoNomina()),
      ...Object.values(this.guardandoCategorias())].some(Boolean);
  }

  pendienteMes(d: DetalleTerceroMensual, mes: string): number {
    return Math.max(0, (d.valores[mes] || 0) - (d.pagadoPorMes?.[mes] || 0));
  }

  estadoPagoMes(d: DetalleTerceroMensual, mes: string): string {
    if (!((d.pagadoPorMes?.[mes] || 0) > 0)) return '';
    return this.pendienteMes(d, mes) < 0.01 ? 'Pagado' : 'Pago parcial';
  }

  private sumaPendienteMeses(d: DetalleTerceroMensual, meses: string[]): number {
    return sumarMeses(Object.fromEntries(meses.map(mes => [mes, this.pendienteMes(d, mes)])), meses);
  }

  alternarMesSugerido(seccion: string, d: DetalleTerceroMensual, mes: string): void {
    if (!this.puedeSugerir(seccion) || !d.nit || this.guardandoSugeridos()[d.nit]
        || !Number.isFinite(d.valores[mes]) || this.pendienteMes(d, mes) <= 0) return;
    const seleccionados = this.mesesSeleccionados(seccion, d.nit);
    const meses = seleccionados.includes(mes) ? seleccionados.filter(m => m !== mes) : [...seleccionados, mes].sort();
    const suma = this.sumaPendienteMeses(d, meses);
    this.persistirSugerido(d, suma, {seccion, meses}, false, seccion);
  }

  private persistirSugerido(d: FilaSaldo, valor: number | null, seleccion?: SeleccionSugerido,
                            limpiezaConfirmada = false, seccionId?: string, onDone?: () => void): void {
    const empresaId = this.empresaId, carga = this.solicitudCarga;
    if (empresaId === null || !d.nit || this.guardandoSugeridos()[d.nit]
        || !this.esGerencia || !this.ctx.tienePermiso('presupuesto.pago_sugerido_proveedor')) { onDone?.(); return; }
    const nit = d.nit;
    // Cuentas por Cobrar guarda su sugerido en el proceso de COBROS (columna
    // propia del maestro); el resto en el de egresos. Un proceso jamás
    // modifica ni revierte valores del otro.
    const ambito = this.ambitoSugerido(seccionId);
    const anterior = d.pagoSugerido ?? 0, seleccionAnterior = this.mesesSugeridos()[nit];
    const vigente = () => empresaId === this.empresaId && carga === this.solicitudCarga;
    this.mesesSugeridos.update(s => ({...s, [nit]: seleccion}));
    this.erroresSugeridos.update(s => ({...s, [nit]: null}));
    this.aplicarSaldoOptimista(d, valor, true, ambito);
    if (anterior === (valor ?? 0)) { onDone?.(); return; }
    this.guardandoSugeridos.update(s => ({...s, [nit]: true}));
    const revertir = (mensaje: string | null) => {
      this.aplicarSaldoOptimista(d, anterior, true, ambito);
      this.mesesSugeridos.update(s => ({...s, [nit]: seleccionAnterior}));
      this.erroresSugeridos.update(s => ({...s, [nit]: mensaje}));
      this.guardandoSugeridos.update(s => ({...s, [nit]: false}));
    };
    const peticion = ambito === 'cobros'
      ? (forzar: boolean) => this.service.setPagoSugeridoCobro(empresaId, nit, valor, forzar)
      : (forzar: boolean) => this.service.setPagoSugeridoProveedor(empresaId, nit, valor, forzar);
    const guardar = (forzar: boolean) => peticion(forzar).subscribe({
      next: respuesta => {
        if (!vigente()) { onDone?.(); return; }
        const guardado = respuesta.pagoSugerido ?? 0;
        this.aplicarSaldoOptimista(d, guardado, true, ambito);
        // La tabla Detalle muestra el sugerido de EGRESOS: no se toca al
        // guardar el saldo sugerido de cobros.
        if (ambito !== 'cobros') {
          this.detalle.update(filas => filas.map(f => f.nit === nit ? {...f, pagoSugerido: guardado} : f));
        }
        this.guardandoSugeridos.update(s => ({...s, [nit]: false}));
        onDone?.();
        // Durante un lote el refresco lo hace refrescarTrasLote (UNA vez al
        // final); una cancelación forzada de una sola fila refresca aquí.
        if (forzar && !limpiezaConfirmada) {
          const refresco = ++this.solicitudRefrescoPeriodo;
          this.consultarDatos(() => this.service.mensual(empresaId, true, true)).subscribe({
            next: m => {
              if (!vigente() || refresco !== this.solicitudRefrescoPeriodo) return;
              this.aplicarResumen(m);
              this.refrescarSeccionesVisitadas(['pagos', 'cobros', 'provisiones', 'consolidado', 'terceros']);
            },
            error: e => { if (vigente()) this.erroresSugeridos.update(s => ({...s, [nit]: msj(e)})); },
          });
        }
      },
      error: e => {
        if (!vigente()) { onDone?.(); return; }
        if (e?.status === 409 && !forzar) {
          if (limpiezaConfirmada) {
            // Confirmación única de la tabla ("Sumar todas las filas" /
            // "Limpiar columna"): el usuario ya aceptó las cancelaciones.
            guardar(true);
            return;
          }
          if (window.confirm('Este tercero ya tiene facturas aprobadas sin pagar. Si reduces el Pago Sugerido se cancelarán esos Pagos Proyectados. Lo ya pagado no se toca. ¿Continuar?')) {
            guardar(true);
            return;
          }
          revertir(null);
          onDone?.();
          return;
        }
        revertir(msj(e));
        onDone?.();
      },
    });
    guardar(limpiezaConfirmada);
  }

  /** "Ya aprobado: $X" en la celda de sugerido (feature del original). */
  yaAprobadoLabel(d: DetalleTerceroMensual): string | null {
    return d.totalYaAprobado > 0 ? `Ya aprobado: ${formatoCOP(d.totalYaAprobado)}` : null;
  }

  // ── Aprobación de proveedor con Pago Sugerido ──

  readonly guardandoNomina = signal<Record<string, boolean>>({});
  readonly erroresNomina = signal<Record<string, string | null>>({});

  puedeSugerirNomina(): boolean {
    return !this.modoHistorico && this.esGerencia && this.ctx.tienePermiso('presupuesto.pago_sugerido_nomina');
  }

  mesesNomina(f: FilaNomina): string[] {
    return f.mesesSeleccionados ?? [];
  }

  alternarMesNomina(f: FilaNomina, mes: string): void {
    if (!f.aprobados?.[mes]) return;
    if (!this.puedeSugerirNomina() || !f.campo || this.guardandoNomina()[f.campo]) return;
    const seleccion = this.mesesNomina(f);
    if (!Number.isFinite(f.valores[mes]) || (!f.valores[mes] && !seleccion.includes(mes))) return;
    const meses = seleccion.includes(mes) ? seleccion.filter(m => m !== mes) : [...seleccion, mes].sort();
    this.guardarSugeridoNomina(f, sumarMeses(f.valores, meses), meses);
  }

  private actualizarSugeridoNomina(campo: string, monto: number, meses: string[] | null, fijar = true): void {
    this.mensual.update(m => {
      if (!m) return m;
      const filas = m.filasNomina.map(f => f.campo === campo ? {
        ...f, saldoPendiente: Math.round((f.total - monto) * 100) / 100,
        ...(fijar ? {pagoSugerido: monto, mesesSeleccionados: meses} : {}),
      } : f);
      const conceptos = filas.filter(f => !!f.campo);
      const sugerido = conceptos.reduce((sum, f) => sum + Math.round((f.campo === campo ? monto : f.pagoSugerido ?? 0) * 100), 0) / 100;
      const saldo = conceptos.reduce((sum, f) => sum + Math.round((f.saldoPendiente ?? f.total) * 100), 0) / 100;
      return {...m, filasNomina: filas.map(f => f.campo ? f : {...f, pagoSugerido: sugerido, saldoPendiente: saldo})};
    });
  }

  guardarSugeridoNomina(f: FilaNomina, valor: number | null, meses: string[] | null = null): void {
    if (meses === null) return;
    const empresa = this.empresaId, carga = this.solicitudCarga, campo = f.campo;
    if (empresa === null || !campo || !this.puedeSugerirNomina() || this.guardandoNomina()[campo]) return;
    const monto = valor ?? 0, anterior = f.pagoSugerido ?? 0, seleccionAnterior = f.mesesSeleccionados ?? null;
    if (monto === anterior && JSON.stringify(meses) === JSON.stringify(seleccionAnterior)) return;
    const vigente = () => empresa === this.empresaId && carga === this.solicitudCarga;
    this.actualizarSugeridoNomina(campo, monto, meses);
    this.guardandoNomina.update(s => ({...s, [campo]: true}));
    this.erroresNomina.update(s => ({...s, [campo]: null}));
    this.service.setSugeridoNomina(empresa, campo, monto, meses).subscribe({
      next: r => {
        if (!vigente()) return;
        this.actualizarSugeridoNomina(campo, r.pagoSugerido, r.mesesSeleccionados);
        this.guardandoNomina.update(s => ({...s, [campo]: false}));
      },
      error: e => {
        if (!vigente()) return;
        this.actualizarSugeridoNomina(campo, anterior, seleccionAnterior);
        this.guardandoNomina.update(s => ({...s, [campo]: false}));
        this.erroresNomina.update(s => ({...s, [campo]: msj(e)}));
      },
    });
  }

  modalSugerido = signal(false);
  previsualizando = signal(false);
  aprobandoSugerido = signal(false);
  /** Origen de la previsualización del modal individual: Proveedores usa el
   *  Sugerido; Anticipos/Cuentas por Cobrar aprueban por módulo y Provisiones
   *  por beneficiario -- mismo modal, distinta confirmación. */
  previewModulo = signal<'proveedores' | 'anticipos' | 'cx_cobrar' | 'cx_pagar' | 'impuestos' | 'provisiones' | string | null>('proveedores');
  /** Módulo que filtra las facturas del flujo Pago Sugerido (solo Impuestos
   *  aprueba únicamente sus movimientos; Proveedores/Cuentas por pagar
   *  comparten la selección por tercero). */
  previewModuloSugerido = signal<'impuestos' | 'cx_cobrar' | null>(null);
  /** true = el escudo del Sugerido (Otras Cuentas por Pagar) repartió el
   *  cupo entre las facturas: el modal titula "saldo sugerido", no "total". */
  previewCupoSugerido = signal(false);
  preview = signal<PrevisualizarProveedor | null>(null);

  async previsualizarAprobacion(d: DetalleTerceroMensual, seccion?: string): Promise<void> {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    // En la sección Impuestos el Sugerido del tercero se aprueba solo con
    // movimientos de impuestos; en Cuentas por Cobrar solo con sus cobros;
    // Proveedores/Cuentas por pagar comparten selección (mismo tercero,
    // misma deuda).
    const modulo = seccion === 'impuestos' ? 'impuestos'
      : seccion === 'cuentasCobrar' ? 'cx_cobrar'
      : undefined;
    this.previsualizando.set(true);
    try {
      const p = await firstValueFrom(this.service.previsualizarProveedor(empresaId, d.nit, modulo));
      this.preview.set(p);
      this.previewModulo.set('proveedores');
      this.previewModuloSugerido.set(modulo ?? null);
      this.modalSugerido.set(true);
    } catch (e) {
      this.toast.error(msj(e));
    } finally {
      this.previsualizando.set(false);
    }
  }

  /** Sección → módulo del backend para el flujo de aprobación por módulo /
   *  pagos parciales (Cuentas por Cobrar y Otras Cuentas por Pagar).
   *  Anticipos NO tiene flujo de aprobación; Proveedores/Impuestos conservan
   *  su flujo con Pago Sugerido.
   *  Otras Cuentas por Pagar tiene DOS acciones: el escudo del Sugerido
   *  aprueba el cupo sugerido (repartido en pagos parciales) y el del Total
   *  aprueba todo el saldo pendiente. */
  readonly APROBAR_MODULOS: Record<string, 'cx_cobrar' | 'cx_pagar'> = {
    cuentasCobrar: 'cx_cobrar',
    prestamos: 'cx_pagar',
  };

  apmovSeccion(seccion: string): 'cx_cobrar' | 'cx_pagar' | null {
    return this.APROBAR_MODULOS[seccion] ?? null;
  }

  moduloLegible(modulo: string): string {
    return ({ proveedores: 'Proveedores', anticipos: 'Anticipos', 'cx_pagar': 'Otras Cuentas por Pagar', 'cx_cobrar': 'Cuentas por Cobrar', provisiones: 'Provisiones' })[modulo] ?? modulo;
  }

  private readonly ETIQUETA_SECCION_APROBAR: Record<string, string> = {
    proveedores: 'Proveedores', prestamos: 'Cuentas por pagar', impuestos: 'Impuestos',
    cuentasCobrar: 'Cuentas por Cobrar', provisiones: 'Provisiones',
    nomina: 'Nómina', estampillas: 'Estampillas',
  };

  etiquetaSeccionAprobar(seccion: string): string {
    return this.ETIQUETA_SECCION_APROBAR[seccion] ?? seccion;
  }

  tituloPreview(): string {
    const modulo = this.previewModulo();
    if (modulo === 'provisiones') return 'Aprobar provisiones del beneficiario';
    if (modulo === 'cx_pagar') return this.previewCupoSugerido()
      ? 'Aprobar saldo sugerido del tercero'
      : 'Aprobar saldo total del tercero';
    if (modulo === 'cx_cobrar') return this.previewCupoSugerido()
      ? 'Aprobar cobros con el Saldo Sugerido'
      : 'Aprobar saldo pendiente del tercero';
    if (modulo === 'proveedores') return this.previewModuloSugerido() === 'cx_cobrar'
      ? 'Aprobar cobros con Pago Sugerido'
      : 'Aprobar facturas con Pago Sugerido';
    return 'Aprobar saldo pendiente del tercero';
  }

  /** Escudo de una fila: SIEMPRE previzualiza antes de aprobar (igual que
   *  en Proveedores), resolviendo el endpoint que toque por sección.
   *  `modo` distingue la columna que invoca: 'sugerido' aprueba facturas
   *  enteras hasta cubrir el cupo sugerido; 'saldo' aprueba todo el saldo
   *  del módulo. Sin modo se conserva el flujo histórico de la sección.
   *  Otras Cuentas por Pagar (cx_pagar) usa PAGOS PARCIALES en ambas
   *  columnas: con 'sugerido' reparte el cupo del Pago Sugerido entre las
   *  facturas (más antiguas primero) y con 'saldo' aprueba el saldo
   *  completo — la factura que no cabe entera se aprueba por el monto que
   *  quepa, que es justo lo que el Pago Sugerido necesita. */
  async previsualizarAprobacionFila(seccion: string, d: DetalleTerceroMensual | DetallePagoMensual, modo?: 'saldo' | 'sugerido'): Promise<void> {
    if (modo === 'sugerido' && seccion === 'cuentasCobrar') { await this.previsualizarCupoSugeridoCobros(d as DetalleTerceroMensual); return; }
    if (modo === 'sugerido' && seccion !== 'prestamos') { await this.previsualizarAprobacion(d as DetalleTerceroMensual, seccion); return; }
    const modulo = seccion === 'prestamos' ? 'cx_pagar' : this.apmovSeccion(seccion);
    if (!modulo) { await this.previsualizarAprobacion(d as DetalleTerceroMensual, seccion); return; }
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.previsualizando.set(true);
    try {
      if (modulo) {
        const p = await firstValueFrom(this.service.previsualizarTerceroModulo(empresaId, modulo, (d as DetalleTerceroMensual).nit));
        const porCupo = seccion === 'prestamos' && modo === 'sugerido';
        if (porCupo) this.repartirSugeridoSobreFacturas(p, d as DetalleTerceroMensual);
        this.previewCupoSugerido.set(porCupo);
        this.preview.set(p); this.previewModulo.set(modulo);
      } else if (seccion === 'provisiones') {
        const id: { nit?: string | null; nombre?: string | null } = d.nit ? { nit: d.nit } : { nombre: (d as DetallePagoMensual).nombre };
        const p = await firstValueFrom(this.service.previsualizarProvisionesBeneficiario(empresaId, id));
        this.previewCupoSugerido.set(false);
        this.preview.set(p); this.previewModulo.set('provisiones');
      } else return;
      this.modalSugerido.set(true);
    } catch (e) {
      alert(msj(e));
    } finally {
      this.previsualizando.set(false);
    }
  }

  /** Otras Cuentas por Pagar: reparte el cupo del Pago Sugerido entre las
   *  facturas pendientes (más antiguas primero) como monto a aprobar; el
   *  resto queda editable hasta el saldo en el modal. Así el escudo del
   *  Sugerido aprueba el saldo sugerido y el del Total el saldo completo. */
  private repartirSugeridoSobreFacturas(p: PrevisualizarProveedor, d: DetalleTerceroMensual): void {
    let restante = Math.round((d.pagoSugerido ?? 0) * 100) / 100;
    for (const f of p.facturas) {
      const saldo = f.saldoPendiente ?? f.monto;
      const asignar = Math.max(0, Math.min(saldo, restante));
      f.montoAprobar = Math.round(asignar * 100) / 100;
      restante = Math.round((restante - asignar) * 100) / 100;
    }
    p.sugerido = d.pagoSugerido ?? null;
    p.totalAprobar = Math.round(p.facturas.reduce((s, f) => s + (f.montoAprobar ?? 0), 0) * 100) / 100;
  }

  /**
   * Escudo del Sugerido en Cuentas por Cobrar: como Otras Cuentas por Pagar,
   * el cupo del Saldo Sugerido de cobros se reparte entre los cobros
   * pendientes (más antiguos primero, con centavos) y cada factura queda
   * apruebable por lo que quepa; lo que exceda el cupo no se aprueba. Antes
   * exigía que la factura completa cupiera en el sugerido y con un cupo
   * menor no aprobaba nada.
   */
  private async previsualizarCupoSugeridoCobros(d: DetalleTerceroMensual): Promise<void> {
    const empresaId = this.empresaId;
    if (empresaId === null || !d.nit) return;
    this.previsualizando.set(true);
    try {
      const p = await firstValueFrom(this.service.previsualizarParcial(empresaId, 'cx_cobrar', d.nit));
      this.repartirSugeridoSobreFacturas(p, d);
      this.previewCupoSugerido.set(true);
      this.preview.set(p);
      this.previewModulo.set('cx_cobrar');
      this.previewModuloSugerido.set('cx_cobrar');
      this.modalSugerido.set(true);
    } catch (e) {
      this.toast.error(msj(e));
    } finally {
      this.previsualizando.set(false);
    }
  }

  actualizarMontoParcial(f: FacturaSugerida, valor: number | null): void {
    const p = this.preview();
    if (!p) return;
    const maximo = f.saldoPendiente ?? f.monto;
    const v = valor == null ? 0 : Math.max(0, Math.min(valor, maximo));
    f.montoAprobar = Math.round(v * 100) / 100;
    p.totalAprobar = Math.round(p.facturas.reduce((sum, item) => sum + (item.montoAprobar ?? item.monto), 0) * 100) / 100;
  }

  formatearFecha(fecha: string | null | undefined): string {
    return formatearFechaCO(fecha);
  }

  async confirmarAprobacionSugerido(): Promise<void> {
    const empresaId = this.empresaId;
    const p = this.preview();
    const modulo = this.previewModulo();
    if (empresaId === null || !p) return;
    this.aprobandoSugerido.set(true);
    try {
      if (p.permiteParcial && modulo && modulo !== 'proveedores') {
        const aprobaciones = p.facturas
          .filter(f => (f.montoAprobar ?? f.monto) > 0)
          .map(f => ({
            movimiento_id: f.movimientoId,
            monto: f.montoAprobar ?? f.monto,
          }));
        try {
          const r = await firstValueFrom(this.service.aprobarParcial(empresaId, modulo, p.nit, aprobaciones));
          if (r.error) { this.toast.error(r.error); return; }
          this.cerrarModalPreview();
          this.refrescarTrasAprobacion();
          this.toast.mostrar(`Se aprobaron ${r.facturasAprobadas} ítems por ${formatoCOP(r.totalAprobado)} en ${this.moduloLegible(modulo)}.`);
          return;
        } catch (err: any) {
          if (err?.status !== 404 && err?.status !== 501) {
            throw err;
          }
          // Cupo sugerido (CxP/CxC): jamás caer al "aprobar TODO" como
          // fallback — el usuario pidió aprobar solo lo que cubre el cupo.
          if (this.previewCupoSugerido()) throw err;
          console.warn('Fallback: endpoint aprobar-parcial no listo en backend, usando flujo tradicional.');
        }
      }
      if (modulo === 'anticipos' || modulo === 'cx_cobrar' || modulo === 'cx_pagar' || modulo === 'impuestos') {
        const r = await firstValueFrom(this.service.aprobarTerceroModulo(empresaId, modulo, p.nit));
        if (r.error) { this.toast.error(r.error); return; }
        this.cerrarModalPreview();
        this.refrescarTrasAprobacion();
        this.toast.mostrar(`Se aprobaron ${r.facturasAprobadas} ítem(s) por ${formatoCOP(r.totalAprobado)} en ${this.moduloLegible(modulo)}.`);
        return;
      }
      if (modulo === 'provisiones') {
        const r = await firstValueFrom(this.service.aprobarProvisionesBeneficiario(empresaId, p.nit ? { nit: p.nit } : { nombre: p.nombre }));
        if (r.error) { this.toast.error(r.error); return; }
        this.cerrarModalPreview();
        this.refrescarTrasAprobacion();
        this.toast.mostrar(`Se aprobaron ${r.pagosAprobados} provisión(es) por ${formatoCOP(r.totalAprobado)}.`);
        return;
      }
      const sugeridoModulo = this.previewModuloSugerido() ?? undefined;
      const r = await firstValueFrom(this.service.aprobarProveedorSugerido(empresaId, p.nit, sugeridoModulo));
      if (r.error) {
        this.toast.error(r.error);
        return;
      }
      this.cerrarModalPreview();
      this.refrescarTrasAprobacion();
      const omitida = r.primeraFacturaOmitida;
      this.toast.mostrar(`Se aprobaron facturas por ${formatoCOP(r.totalAprobado)}${omitida ? '. La primera factura que no cabe completa se dejó pendiente.' : ''}`);
    } catch (e) {
      this.toast.error(msj(e));
    } finally {
      this.aprobandoSugerido.set(false);
    }
  }

  /**
   * Refresco tras aprobar SIN reiniciar la pantalla: actualiza el resumen y
   * recarga solo las secciones ya visitadas. Antes se llamaba `cargar()`,
   * que borra el estado de todos los módulos y devuelve el scroll al inicio:
   * la pantalla "saltaba" a otra parte justo después de confirmar.
   */
  private refrescarTrasAprobacion(): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.consultarDatos(() => this.service.mensual(empresaId, true, true)).subscribe({
      next: m => {
        if (!m) return;
        this.aplicarResumen(m);
        this.refrescarSeccionesVisitadas(['pagos', 'cobros', 'provisiones', 'consolidado', 'terceros']);
      },
      error: e => this.toast.error(msj(e)),
    });
  }

  private cerrarModalPreview(): void {
    this.modalSugerido.set(false);
    this.preview.set(null);
    this.previewModulo.set(null);
    this.previewModuloSugerido.set(null);
    this.previewCupoSugerido.set(false);
  }

  // ── Aprobar todo (cualquier sección): UNA confirmación para el lote ──

  /** Lote de aprobación masiva: un solo modal por tabla, sin avisos por
   *  pago. mismo patrón que Proveedores, replicado por sección: facturas
   *  de terceros (proveedores/chxp/impuestos), movimientos por módulo
   *  (anticipos/cuentas por cobrar), pagos por beneficiario (provisiones)
   *  o celdas concepto×mes (nómina/estampillas). */
  readonly APROBAR_TABLAS = ['proveedores', 'prestamos', 'impuestos'] as const;

  /** Secciones con columna Sugerido editable: el aprobar (individual y
   *  masivo) vive en esa columna. Cuentas por Cobrar conserva ADEMÁS la
   *  aprobación por saldo pendiente en la columna Total (Anticipos solo
   *  tiene esa). */
  readonly SECCIONES_SUGERIDO = ['proveedores', 'prestamos', 'impuestos', 'cuentasCobrar'];

  aprobacionSugeridoCol(seccion: string): boolean {
    return this.SECCIONES_SUGERIDO.includes(seccion);
  }

  /** Aprobar por módulo (Anticipos/Cuentas por Cobrar) en la columna Total:
   *  Cuentas por Cobrar la mantiene junto a la del Sugerido. */
  aprobacionSaldoCol(seccion: string): boolean {
    return !!this.apmovSeccion(seccion);
  }

  tooltipAprobarTabla(seccion: string, modo?: 'saldo' | 'sugerido'): string {
    if (!this.puedeAprobar) return 'Sin permiso para aprobar — requiere Gerencia/Superadmin';
    if (modo === 'saldo') return 'Aprobar todo el saldo pendiente de la tabla en un solo lote';
    if (modo === 'sugerido') {
      return seccion === 'prestamos'
        ? 'Aprobar el saldo sugerido de la tabla (pagos parciales repartidos por cupo)'
        : 'Aprobar los Pago Sugerido de toda la tabla en un solo lote';
    }
    if (this.APROBAR_TABLAS.includes(seccion as any)) return 'Aprobar los Pago Sugerido de toda la tabla en un solo lote';
    if (this.apmovSeccion(seccion)) return 'Aprobar todo el saldo pendiente de la tabla en un solo lote';
    if (seccion === 'provisiones') return 'Aprobar todas las provisiones pendientes en un solo lote';
    if (seccion === 'nomina') return 'Aprobar todos los conceptos pendientes de nómina en un solo lote';
    if (seccion === 'estampillas') return 'Aprobar todos los conceptos pendientes de estampillas en un solo lote';
    return 'Aprobar todo en un solo lote';
  }

  tooltipAprobarFila(seccion: string, d: DetalleTerceroMensual, modo?: 'saldo' | 'sugerido'): string {
    if (!this.puedeAprobar) return 'Sin permiso para aprobar — requiere Gerencia/Superadmin';
    if (modo === 'saldo') {
      const modulo = this.apmovSeccion(seccion);
      return modulo
        ? 'Aprobar todo el saldo pendiente de este tercero en ' + this.moduloLegible(modulo)
        : 'Aprobar todo el saldo pendiente de este tercero';
    }
    if (modo === 'sugerido') {
      if (seccion === 'prestamos') return 'Aprobar el saldo sugerido de este tercero (pagos parciales hasta el cupo)';
      return d.pagoSugerido ? 'Aprobar facturas hasta cubrir el Pago Sugerido' : 'Digita un Pago Sugerido para poder aprobar';
    }
    if (seccion === 'proveedores') return d.pagoSugerido ? 'Aprobar facturas hasta cubrir el Pago Sugerido' : 'Digita un Pago Sugerido para poder aprobar';
    return 'Previsualizar pagos parciales pendientes';
  }

  deshabilitarAprobarFila(seccion: string, d: DetalleTerceroMensual, modo?: 'saldo' | 'sugerido'): boolean {
    const ocupado = !this.puedeAprobar || this.previsualizando() || !!this.guardandoSugeridos()[d.nit];
    if (modo === 'sugerido') return ocupado || !d.pagoSugerido;
    if (modo === 'saldo') return ocupado;
    return ocupado || (seccion === 'proveedores' && !d.pagoSugerido);
  }

  aprobacionTablaOcupada = signal(false);
  aprobacionTabla = signal<LoteAprobacion | null>(null);

  totalFacturasTabla(): number {
    const lote = this.aprobacionTabla();
    if (!lote) return 0;
    if (lote.tipo === 'conceptos') return lote.filasConceptos.length;
    return lote.filasFacturas.reduce((t, f) => t + f.facturas.length, 0);
  }

  async previsualizarAprobacionTabla(seccion: string, modo?: 'saldo' | 'sugerido'): Promise<void> {
    const empresaId = this.empresaId;
    if (empresaId === null || !this.puedeAprobar || this.aprobacionTablaOcupada()) return;
    const carga = this.solicitudCarga;
    this.aprobacionTablaOcupada.set(true);
    try {
    // Otras Cuentas por Pagar: el Sugerido aprueba el cupo repartido (pagos
    // parciales); el Total aprueba el saldo completo. Mismo lote por módulo.
    if (modo === 'sugerido' && seccion === 'prestamos') { await this.previsualizarLoteMovimiento(seccion, 'cx_pagar', empresaId, true); return; }
    if (modo === 'sugerido' || (!modo && this.APROBAR_TABLAS.includes(seccion as any))) { await this.previsualizarLoteProveedores(seccion, empresaId); return; }
    const moduloBd = this.apmovSeccion(seccion);
    if (moduloBd) { await this.previsualizarLoteMovimiento(seccion, moduloBd, empresaId); return; }
    if (seccion === 'provisiones') { await this.previsualizarLoteProvisiones(empresaId); return; }
    if (seccion === 'nomina' || seccion === 'estampillas') { await this.previsualizarLoteConceptos(seccion, empresaId); return; }
    } catch (e) {
      if (empresaId === this.empresaId && carga === this.solicitudCarga) this.toast.error(msj(e));
    } finally {
      this.aprobacionTablaOcupada.set(false);
    }
  }

  private async previsualizarLoteProveedores(seccion: string, empresaId: number): Promise<void> {
    const detalle = (await this.detalleCompletoSeccion(seccion) as DetalleTerceroMensual[])
      .filter(d => !!d.pagoSugerido).sort((a, b) => a.nit.localeCompare(b.nit));
    if (!detalle.length) { this.toast.error('No hay Pago Sugerido en esta tabla.'); return; }
    if (seccion === 'cuentasCobrar') {
      // Cobros: el cupo de cada tercero se reparte en parciales, igual que
      // en Otras Cuentas por Pagar (antes exigía la factura completa).
      await this.consultarLoteFacturas(seccion, 'proveedores', detalle,
        d => this.service.previsualizarParcial(empresaId, 'cx_cobrar', (d as DetalleTerceroMensual).nit)
          .pipe(map(p => { this.repartirSugeridoSobreFacturas(p, d as DetalleTerceroMensual); return p; })),
        empresaId, 'cx_cobrar');
      return;
    }
    const modulo = seccion === 'impuestos' ? 'impuestos' : undefined;
    await this.consultarLoteFacturas(seccion, 'proveedores', detalle,
      d => this.service.previsualizarProveedor(empresaId, (d as DetalleTerceroMensual).nit, modulo), empresaId, modulo ?? null);
  }

  private async previsualizarLoteMovimiento(seccion: string, moduloBd: 'anticipos' | 'cx_cobrar' | 'cx_pagar', empresaId: number, porSugerido = false): Promise<void> {
    const detalle = (await this.detalleCompletoSeccion(seccion) as DetalleTerceroMensual[])
      .filter(d => !porSugerido || !!d.pagoSugerido)
      .slice().sort((a, b) => a.nit.localeCompare(b.nit));
    if (!detalle.length) { this.toast.error(porSugerido ? 'No hay Pago Sugerido en esta tabla.' : `No hay terceros en ${this.moduloLegible(moduloBd)}.`); return; }
    await this.consultarLoteFacturas(seccion, moduloBd, detalle,
      d => this.service.previsualizarTerceroModulo(empresaId, moduloBd, (d as DetalleTerceroMensual).nit)
        .pipe(map(p => { if (porSugerido) this.repartirSugeridoSobreFacturas(p, d as DetalleTerceroMensual); return p; })),
      empresaId, null);
  }

  private async previsualizarLoteProvisiones(empresaId: number): Promise<void> {
    const detalle = (await this.detalleCompletoSeccion('provisiones')).slice().sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
    if (!detalle.length) { this.toast.error('No hay beneficiarios en Provisiones.'); return; }
    await this.consultarLoteFacturas('provisiones', 'provisiones', detalle, p => this.service.previsualizarProvisionesBeneficiario(
      empresaId, p.nit ? { nit: p.nit } : { nombre: p.nombre }), empresaId, null);
  }

  /** Cuerpo común del lote "facturas": consulta la previsualización de cada
   *  fila (con guardas de empresa/periodo mientras consulta) y abre el
   *  modal del lote. */
  private async consultarLoteFacturas(
    seccion: string,
    moduloBd: 'proveedores' | 'anticipos' | 'cx_cobrar' | 'cx_pagar' | 'provisiones',
    detalle: (DetalleTerceroMensual | DetallePagoMensual)[],
    consultar: (d: DetalleTerceroMensual | DetallePagoMensual) => import('rxjs').Observable<PrevisualizarProveedor>,
    empresaId: number,
    moduloAprobar: string | null,
  ): Promise<void> {
    const carga = this.solicitudCarga;
    this.aprobacionTablaOcupada.set(true);
    try {
      const filas: FilaLoteFacturas[] = [];
      for (const d of detalle) {
        // La empresa o el periodo pueden cambiar mientras se consulta.
        if (empresaId !== this.empresaId || carga !== this.solicitudCarga) return;
        const p = await firstValueFrom(consultar(d));
        filas.push({ nit: p.nit, nombre: p.nombre ?? (d as DetalleTerceroMensual).nombre, sugerido: p.sugerido, totalAprobar: p.totalAprobar, facturas: p.facturas });
      }
      if (empresaId !== this.empresaId || carga !== this.solicitudCarga) return;
      if (!filas.some(f => f.facturas.length > 0)) {
        this.toast.error(seccion === 'provisiones' ? 'No hay provisiones pendientes por aprobar en esta tabla.' : 'No hay facturas pendientes por aprobar en esta tabla.');
        return;
      }
      this.aprobacionTabla.set({
        seccion, tipo: 'facturas', moduloBd, moduloAprobar,
        filasFacturas: filas, filasConceptos: [],
        totalAprobar: filas.reduce((t, f) => t + (f.totalAprobar ?? 0), 0),
        tercerosConPagos: filas.filter(f => f.facturas.length > 0).length,
      });
    } catch (e) {
      this.toast.error(msj(e));
    } finally {
      this.aprobacionTablaOcupada.set(false);
    }
  }

  /** Lote de celdas concepto×mes (Nómina y Estampillas): todos los valores
   *  digitados que todavía no están aprobados ni pagados. usa los mismos
   *  endpoints que el botón de aprobar por celda. */
  private async previsualizarLoteConceptos(seccion: 'nomina' | 'estampillas', empresaId: number): Promise<void> {
    const permiso = seccion === 'nomina' ? 'presupuesto.aprobar_nomina' : 'presupuesto.aprobar_estampillas';
    if (!this.ctx.tienePermiso(permiso)) return;
    const mensual = this.mensual();
    if (!mensual) return;
    const filasDestino = seccion === 'nomina' ? mensual.filasNomina : mensual.filasEstampillas;
    const filasConceptos: ItemConceptoLote[] = [];
    for (const f of filasDestino as FilaNomina[]) {
      if (!f.campo) continue;
      for (const m of this.mesesVisibles()) {
        if (!this.conceptoAprobable(f, m)) continue;
        filasConceptos.push({ campo: f.campo, concepto: f.concepto, mes: m, monto: f.valores[m] ?? 0 });
      }
    }
    if (!filasConceptos.length) { this.toast.error('No hay conceptos pendientes por aprobar en esta tabla.'); return; }
    this.aprobacionTabla.set({
      seccion, tipo: 'conceptos', moduloBd: null, moduloAprobar: null,
      filasFacturas: [], filasConceptos,
      totalAprobar: filasConceptos.reduce((t, c) => t + c.monto, 0),
      tercerosConPagos: new Set(filasConceptos.map(c => c.campo)).size,
    });
  }

  private conceptoAprobable(f: FilaNomina, m: string): boolean {
    return !!f.campo && (f.valores[m] ?? 0) > 0 && !f.aprobados?.[m] && !(f.pagadoPorMes?.[m] || 0) && !this.mesCerrado(m);
  }

  async confirmarAprobacionTabla(): Promise<void> {
    const empresaId = this.empresaId;
    const lote = this.aprobacionTabla();
    if (empresaId === null || !lote || this.aprobacionTablaOcupada()) return;
    this.aprobacionTablaOcupada.set(true);
    let aprobados = 0, total = 0, conAprobada = 0;
    const errores: string[] = [];
    try {
      if (lote.tipo === 'conceptos') {
        for (const item of lote.filasConceptos) {
          if (empresaId !== this.empresaId) break;
          try {
            const llamado$ = lote.seccion === 'nomina'
              ? this.service.aprobarConceptoNomina(empresaId, item.mes, item.campo)
              : this.service.aprobarConceptoEstampillas(empresaId, item.mes, item.campo);
            await firstValueFrom(llamado$);
            aprobados++; total += item.monto;
          } catch (e) {
            errores.push(`${item.concepto} · ${this.fechaCorta(item.mes)}: ${msj(e)}`);
          }
        }
        this.aprobacionTabla.set(null);
        if (this.empresaId === empresaId) this.actualizarMensual();
        let resumen = `Se aprobaron ${aprobados} concepto${aprobados === 1 ? '' : 's'} por ${formatoCOP(total)}.`;
        if (errores.length) { this.toast.error(resumen + '\nNo aprobados:\n' + errores.join('\n')); } else { this.toast.mostrar(resumen); }
        return;
      }
      for (const fila of lote.filasFacturas) {
        if (empresaId !== this.empresaId) break;
        try {
          if (lote.moduloBd === 'provisiones') {
            const r = await firstValueFrom(this.service.aprobarProvisionesBeneficiario(empresaId, fila.nit ? { nit: fila.nit } : { nombre: fila.nombre }));
            aprobados += r.pagosAprobados;
            total += r.totalAprobado;
            if (r.pagosAprobados > 0) conAprobada++;
          } else if (lote.moduloBd === 'cx_pagar' || lote.moduloAprobar === 'cx_cobrar') {
            // Otras Cuentas por Pagar y el Sugerido de CxC: aprueba los montos
            // del lote tal como se previsualizaron (cupo repartido en
            // parciales, con centavos) — el Total de CxC va por su rama.
            const moduloParcial = lote.moduloBd === 'cx_pagar' ? 'cx_pagar' : 'cx_cobrar';
            const aprobaciones = fila.facturas
              .filter(f => (f.montoAprobar ?? f.monto ?? 0) > 0)
              .map(f => ({ movimiento_id: f.movimientoId, monto: f.montoAprobar ?? f.monto }));
            const r = await firstValueFrom(this.service.aprobarParcial(empresaId, moduloParcial, fila.nit, aprobaciones));
            if (r.error) { errores.push(`${fila.nombre}: ${r.error}`); continue; }
            aprobados += r.facturasAprobadas;
            total += r.totalAprobado;
            if (r.facturasAprobadas > 0) conAprobada++;
          } else if (lote.moduloBd === 'anticipos' || lote.moduloBd === 'cx_cobrar') {
            const r = await firstValueFrom(this.service.aprobarTerceroModulo(empresaId, lote.moduloBd, fila.nit));
            if (r.error) { errores.push(`${fila.nombre}: ${r.error}`); continue; }
            aprobados += r.facturasAprobadas;
            total += r.totalAprobado;
            if (r.facturasAprobadas > 0) conAprobada++;
          } else {
            const r = await firstValueFrom(this.service.aprobarProveedorSugerido(empresaId, fila.nit, lote.moduloAprobar ?? undefined));
            if (r.error) { errores.push(`${fila.nombre}: ${r.error}`); continue; }
            aprobados += r.facturasAprobadas ?? 0;
            total += r.totalAprobado ?? 0;
            if ((r.facturasAprobadas ?? 0) > 0) conAprobada++;
          }
        } catch (e) {
          errores.push(`${fila.nombre}: ${msj(e)}`);
        }
      }
      this.aprobacionTabla.set(null);
      if (this.empresaId === empresaId) this.actualizarMensual();
      const parte = lote.moduloBd === 'provisiones'
        ? ` en ${conAprobada} beneficiario${conAprobada === 1 ? '' : 's'}`
        : ` en ${conAprobada} tercero${conAprobada === 1 ? '' : 's'}`;
      const unidad = lote.moduloBd === 'provisiones' ? 'provisión'
        : lote.moduloAprobar === 'cx_cobrar' ? 'cobro' : 'pago';
      let resumen = `Se aprobaron ${aprobados} ${unidad}${aprobados === 1 ? '' : 's'} por ${formatoCOP(total)}${parte}.`;
      if (errores.length) { this.toast.error(resumen + '\nNo aprobados:\n' + errores.join('\n')); } else { this.toast.mostrar(resumen); }
    } finally {
      this.aprobacionTablaOcupada.set(false);
    }
  }

  cerrarAprobacionTabla(): void {
    if (!this.aprobacionTablaOcupada()) this.aprobacionTabla.set(null);
  }


  diasVencidos(fecha: string | null): number {
    if (!fecha) return 0;
    const hoy = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    return Math.max(0, Math.floor((Date.parse(hoy + 'T00:00:00Z') - Date.parse(fecha.slice(0,10) + 'T00:00:00Z')) / 86400000));
  }

  async eliminarFacturaSugerida(f: FacturaSugerida): Promise<void> {
    const empresaId = this.empresaId;
    const p = this.preview();
    if (empresaId === null || !p || !this.ctx.tienePermiso('pagos.eliminar') || f.vencida || !f.fechaVencimiento || this.diasVencidos(f.fechaVencimiento) > 0 || this.aprobandoSugerido()) return;
    if (!confirm(`Eliminar la factura ${f.comprobante ?? f.movimientoId} de ${f.nombre}?`)) return;
    this.aprobandoSugerido.set(true);
    try {
      await firstValueFrom(this.service.eliminarFacturaSugerida(empresaId, f.movimientoId));
      const actualizado = await firstValueFrom(this.service.previsualizarProveedor(empresaId, p.nit));
      if (empresaId === this.empresaId) { this.preview.set(actualizado); this.actualizarMensual(); }
    } catch (e) { this.toast.error(msj(e)); }
    finally { this.aprobandoSugerido.set(false); }
  }

  cerrarModalSugerido(): void {
    if (!this.aprobandoSugerido()) {
      this.modalSugerido.set(false);
      this.preview.set(null);
      this.previewModulo.set(null);
      this.previewCupoSugerido.set(false);
    }
  }
}
