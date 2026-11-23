import { GpModuloAnualComponent } from '../../components/gp-modulo-anual/gp-modulo-anual.component';
import { GpAnticiposLegalizadosComponent } from '../../components/gp-anticipos-legalizados/gp-anticipos-legalizados.component';
import { GpVistaPeriodosComponent } from '../../components/gp-vista-periodos/gp-vista-periodos.component';
import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, computed, effect, OnInit, signal, untracked, ViewChild, HostListener } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { gpFilaTabla, gpPop, gpStagger } from '../../animations/gp-animations';
import { firstValueFrom, Subscription } from 'rxjs';
import { PresupuestoService } from '../../services/presupuesto.service';
import { GpAnticipoLegalizacionService, LegalizacionAnticipo } from '../../services/gp-anticipo-legalizacion.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { mensajeError } from '../../services/gp-errores';
import {
  MODULOS_CFG, CATEGORIA_COLORS, Movimiento, PageResponse, ResumenModulo,
  ImportacionPeriodoInfo,
  formatoCOP, formatoCOPShort, FacturaSugerida, PrevisualizarProveedor, formatearFechaCO,
} from '../../models/presupuesto.model';
import { periodoHistorico } from '../../models/historico.model';
import { GpKpiComponent } from '../../components/gp-kpi/gp-kpi.component';
import { GpBadgeCategoriaComponent } from '../../components/gp-badge-categoria/gp-badge-categoria.component';
import { GpEmpresaSelectorComponent } from '../../components/gp-empresa-selector/gp-empresa-selector.component';
import { GpImportWizardComponent } from '../../components/gp-import-wizard/gp-import-wizard.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpFiltrosComponent } from '../../components/gp-filtros/gp-filtros.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpConfirmarLimpiezaComponent } from '../../components/gp-confirmar-limpieza/gp-confirmar-limpieza.component';
import { GpModalComponent } from '../../components/gp-modal/gp-modal.component';
import { GpCeldaMontoComponent } from '../../components/gp-celda-monto/gp-celda-monto.component';
import { GpPermisoDirective } from '../../directives/gp-permiso.directive';

const GP_CHART_EJE_LABELS = { style: { colors: 'var(--tx-3)', fontSize: '11px' } };

/**
 * Animaciones del flujo de legalización de anticipos — copiadas tal cual de
 * la página Control de Bancos (módulo Tesorería): apertura/cierre del modal,
 * contenido (subida + escala) y despliegue de ítems de archivo.
 */
const glModalAnimation = trigger('glModalAnimation', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('200ms ease-out', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('150ms ease-in', style({ opacity: 0 })),
  ]),
]);

const glModalContent = trigger('glModalContent', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(30px) scale(0.95)' }),
    animate('350ms cubic-bezier(0.33, 1, 0.68, 1)',
      style({ opacity: 1, transform: 'translateY(0) scale(1)' })
    ),
  ]),
]);

const glSlideDown = trigger('glSlideDown', [
  transition(':enter', [
    style({ opacity: 0, height: 0, overflow: 'hidden' }),
    animate('300ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, height: '*' })),
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0, height: 0 })),
  ]),
]);

@Component({
  selector: 'app-modulo-page',
  standalone: true,
  imports: [GpModuloAnualComponent, GpAnticiposLegalizadosComponent, GpVistaPeriodosComponent, SelectBuscableDirective,
    CommonModule, FormsModule, RouterLink, NgApexchartsModule,
    GpKpiComponent, GpBadgeCategoriaComponent, GpEmpresaSelectorComponent,
    GpImportWizardComponent, GpSkeletonComponent, GpErrorStateComponent,
    GpEmptyStateComponent, GpFiltrosComponent, GpIconComponent, GpPageHeaderComponent, GpPermisoDirective, GpConfirmarLimpiezaComponent,
    GpModalComponent, GpCeldaMontoComponent,
  ],
  animations: [gpStagger, gpPop, gpFilaTabla, glModalAnimation, glModalContent, glSlideDown],
  templateUrl: './modulo-page.component.html',
  styleUrls: ['./modulo-page.component.scss'],
})
export class ModuloPageComponent implements OnInit {
  @Input() modoHistorico=false;

  cfg = MODULOS_CFG[0];

  loading = signal(true);
  error = signal<string | null>(null);
  resumen = signal<ResumenModulo | null>(null);
  pagina = signal<PageResponse<Movimiento> | null>(null);
  /** Última importación del módulo: badge de mes detectado y meses omitidos. */
  infoImportacion = signal<ImportacionPeriodoInfo | null>(null);

  categoria = signal('');
  busqueda = signal('');
  fechaDesde = signal('');
  fechaHasta = signal('');
  sortBy = signal('');
  sortDir = signal('desc');
  page = 0;
  size = 15;

  categorias: string[] = [];
  categoriasHistoricas: string[] = [];
  editingNit = signal<string | null>(null);
  guardandoCategoria = signal(false);
  categoriaOtrosPendiente = signal<string | null>(null);
  private solicitudCategoria = 0;
  wizardAbierto = signal(false);
  /** Referencia viva al asistente para conocer los meses que se cargaron. */
  @ViewChild(GpImportWizardComponent) wizardRef?: GpImportWizardComponent;
  descargando = signal(false);
  limpiando = signal(false);
  confirmarLimpieza = signal(false);
  seedOk = signal(false);
  modalAprobacion = signal(false);
  preview = signal<PrevisualizarProveedor | null>(null);
  previsualizando = signal(false);
  aprobando = signal(false);

  // ── Legalización de anticipos (sólo módulo Anticipos) ──
  /** Comprobantes de legalización de los movimientos visibles, por movimiento. */
  legalizaciones = signal<Map<number, LegalizacionAnticipo[]>>(new Map());
  legalizarAbierto = signal(false);
  legalizarMov = signal<Movimiento | null>(null);
  archivoLegalizar = signal<File | null>(null);
  valorLegalizar = '';
  observacionLegalizar = '';
  subiendoLegalizacion = signal(false);
  cargandoLegalizaciones = signal(false);
  errorLegalizaciones = signal('');
  errorArchivoLegalizar = signal('');
  validandoArchivoLegalizar = signal(false);
  private seleccionArchivo = 0;
  private solicitudLegalizaciones = 0;

  // ── Quitar comprobantes de legalización ──
  readonly quitarConfirm = signal<LegalizacionAnticipo | null>(null);
  readonly quitando = signal(false);

  private timerBusqueda: any = null;

  constructor(
    public ctx: PresupuestoContextService,
    private service: PresupuestoService,
    private legalizacionService: GpAnticipoLegalizacionService,
    private toast: PresupuestoToastService,
    private route: ActivatedRoute,
    public auth: AuthorizationService,
  ) {
    this.cfg=MODULOS_CFG.find(m=>m.modulo===this.route.snapshot?.data?.['modulo'])??MODULOS_CFG[0];
    // La vista de anticipos legalizados sólo existe en Anticipos: no se hereda a otros módulos.
    if (this.cfg.modulo !== 'anticipos') this.ctx.vistaLegalizados.set(false);
    // effect() SÍ puede crearse aquí (contexto de inyección); en ngOnInit NO.
    effect(() => {
      const empresaId = this.ctx.empresaId();
      this.ctx.mesActivo(); this.ctx.mesConsulta();
      untracked(() => { this.page=0; this.cargar(); });
    });
  }

  get empresaId(): number | null {
    return this.ctx.empresaId();
  }

  get esGerencia(): boolean {
    return this.auth.hasAnyRole(['SUPER_ADMIN', 'ADMIN']);
  }

  get hayFiltrosActivos(): boolean {
    return !!(this.busqueda() || this.categoria() || this.fechaDesde() || this.fechaHasta());
  }

  /** La legalización con comprobante sólo existe en el módulo Anticipos en vivo. */
  get esAnticipos(): boolean {
    return !this.modoHistorico && this.cfg.modulo === 'anticipos';
  }

  /**
   * Botón "Limpiar" del módulo: corrige la carga del mes habilitado (p. ej.
   * una plantilla errada). Visible para quien traiga `modulos.limpiar` de la
   * matriz (el Contador lo trae por defecto) mientras haya un mes habilitado
   * sin aprobar; en históricos o con el mes cerrado/presupuesto aprobado no
   * se ve. Sin movimientos cargados queda a la vista pero deshabilitado.
   */
  /** Mes en el que opera la limpieza: el posicionado ("Mes de consulta") o
   *  el habilitado si la vista está en "Mes habilitado". */
  get mesLimpieza(): string | null {
    return this.ctx.mesConsulta() ?? this.ctx.mesActivo();
  }

  get mesLimpiezaTexto(): string {
    const mes = this.mesLimpieza;
    if (!mes) return 'habilitado';
    const [anio, num] = mes.split('-');
    const nombres = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const indice = Number(num) - 1;
    return `${nombres[indice] ?? num} de ${anio}`;
  }

  get puedeLimpiarModulo(): boolean {
    return !this.modoHistorico
        && this.ctx.tienePermiso('modulos.limpiar')
        && !!this.mesLimpieza
        && this.ctx.puedeEditarMes(this.mesLimpieza);
  }

  get titulo(): string {
    return this.cfg.titulo;
  }

  get icono(): string {
    return this.cfg.icono;
  }

  get color(): string {
    return this.cfg.color;
  }

  get descripcion(): string {
    return this.cfg.descripcion;
  }

  get foto(): string {
    const fotos: Record<string, string> = { proveedores: 'photo-1521737711867-e3b97375f902', anticipos: 'photo-1554224154-26032ffc0d07', cx_pagar: 'photo-1556761175-b413da4baf72', cx_cobrar: 'photo-1556742049-0cfed4f6a45d', impuestos: 'photo-1554224155-6726b3ff858f' };
    return `https://images.unsplash.com/${fotos[this.cfg.modulo]}?auto=format&fit=crop&w=1600&q=82`;
  }

  saldoAbsoluto(valor: number): string { return formatoCOP(Math.abs(valor)); }

  /** P7: tooltip del saldo en Anticipos — contable, legalizado y pendiente. */
  tooltipSaldoAnticipo(mov: Movimiento): string | null {
    if (!this.esAnticipos || !mov.legalizado || mov.legalizado <= 0) return null;
    const contable = Math.abs(mov.saldo ?? 0) + mov.legalizado;
    return `Saldo contable ${formatoCOP(contable)} − Legalizado ${formatoCOP(mov.legalizado)} = Pendiente ${formatoCOP(Math.abs(mov.saldo))}`;
  }

  ngOnInit(): void {
    this.service.categorias().subscribe({
      next: categorias => { this.categorias = categorias; this.categoriasHistoricas = categorias; },
      error: () => this.error.set('No se pudo cargar el catálogo de categorías.'),
    });
    const modulo = this.route.snapshot.data['modulo'] ?? 'proveedores';
    this.cfg = MODULOS_CFG.find((m) => m.modulo === modulo) ?? MODULOS_CFG[0];
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
  }

  ngOnDestroy(): void {
    this.consultaResumen?.unsubscribe();
    this.consultaPagina?.unsubscribe();
    this.consultaImportacion?.unsubscribe();
    clearTimeout(this.timerBusqueda);
    this.solicitudResumen++;
    this.solicitudPagina++;
    this.solicitudCategoria++;
    this.solicitudLimpieza++;
    this.solicitudLegalizaciones++;
  }

  /** Esc cierra el flujo de legalización respetando el orden de apertura. */
  @HostListener('document:keydown.escape')
  onEscapeLegalizacion(): void {
    if (this.quitarConfirm()) { this.cerrarQuitar(); return; }
    if (this.legalizarAbierto()) this.cerrarLegalizar();
  }

  buscarInputEvent(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
    clearTimeout(this.timerBusqueda);
    this.timerBusqueda = setTimeout(() => {
      this.page = 0;
      this.buscarInput();
    }, 350);
  }

  onFiltro(ev: { campo: string; valor: string }): void {
    switch (ev.campo) {
      case 'busqueda':
        this.busqueda.set(ev.valor);
        clearTimeout(this.timerBusqueda);
        this.timerBusqueda = setTimeout(() => { this.page = 0; this.buscarInput(); }, 350);
        break;
      case 'categoria':
        this.categoria.set(ev.valor); this.page = 0; this.buscarInput();
        break;
      case 'desde':
        this.fechaDesde.set(ev.valor); this.page = 0; this.buscarInput();
        break;
      case 'hasta':
        this.fechaHasta.set(ev.valor); this.page = 0; this.buscarInput();
        break;
    }
  }

  descargarPlantilla(): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.service.descargarPlantilla(this.cfg.modulo, empresaId).subscribe({ next: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantilla_${this.cfg.modulo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    }, error: e => this.toast.error(msj(e)) });
  }

  /** Botón "Limpiar": borra los datos del módulo (movimientos + importaciones). */
  limpiar(confirmado = false): void {
    const empresaId = this.empresaId;
    if (empresaId === null || this.limpiando() || !this.ctx.tienePermiso('modulos.limpiar')) return;
    if (!confirmado) { this.confirmarLimpieza.set(true); return; }
    if (!this.confirmarLimpieza()) return;
    const solicitud = ++this.solicitudLimpieza;
    const vigente = () => solicitud === this.solicitudLimpieza && empresaId === this.empresaId;
    this.limpiando.set(true);
    this.service.limpiarModulo(this.cfg.modulo, empresaId, this.mesLimpieza).subscribe({
      next: () => {
        if (!vigente()) return;
        this.limpiando.set(false);
        this.confirmarLimpieza.set(false);
        this.toast.mostrar(`Datos de ${this.titulo} (${this.mesLimpiezaTexto}) eliminados`);
        this.page = 0;
        this.cargar();
      },
      error: (e: any) => { if (vigente()) { this.limpiando.set(false); this.toast.error(msj(e)); } },
    });
  }

  private solicitudLimpieza = 0;
  private solicitudResumen = 0;
  private solicitudPagina = 0;
  private consultaResumen?: Subscription;
  private consultaPagina?: Subscription;
  private consultaImportacion?: Subscription;
  private resumenPendiente = false;
  private paginaPendiente = false;

  private actualizarCarga(): void {
    this.loading.set(this.resumenPendiente || this.paginaPendiente);
  }

  cargar(): void {
    this.consultaResumen?.unsubscribe();
    this.consultaPagina?.unsubscribe();
    this.consultaImportacion?.unsubscribe();
    this.confirmarLimpieza.set(false);
    this.solicitudLimpieza++;
    this.limpiando.set(false);
    this.solicitudCategoria++;
    this.guardandoCategoria.set(false);
    const solicitud = ++this.solicitudResumen;
    this.solicitudPagina++;
    const empresaId = this.empresaId;
    const vigente = () => solicitud === this.solicitudResumen && empresaId === this.empresaId;
    this.pagina.set(null);
    this.resumen.set(null);
    this.infoImportacion.set(null);
    this.editingNit.set(null);
    this.categoriaOtrosPendiente.set(null);
    this.wizardAbierto.set(false);
    this.cerrarLegalizar();
    this.legalizaciones.set(new Map());
    this.solicitudLegalizaciones++;
    this.loading.set(empresaId !== null);
    this.resumenPendiente = empresaId !== null;
    this.paginaPendiente = false;
    this.error.set(null);
    if (empresaId === null) return;
    this.cargarInfoImportacion(empresaId, vigente);
    this.consultaResumen = this.service.resumenModulo(this.cfg.modulo, empresaId).subscribe({
      next: resumen => { if (vigente()) { this.resumen.set(resumen); this.resumenPendiente = false; this.actualizarCarga(); } },
      error: e => { if (vigente()) { this.error.set(msj(e)); this.resumenPendiente = false; this.actualizarCarga(); } },
    });
    // El listado no depende del resumen: ambas lecturas pueden empezar juntas.
    this.cargarPagina(empresaId, false);
  }

  /** Al terminar la importación, deja consultando un mes de lo recién cargado
   *  para que el módulo muestre de inmediato los datos importados (tabla,
   *  KPIs y gráfica). */
  alFinalizarWizard(): void {
    const meses = this.wizardRef?.cargadosResultado() ?? [];
    const destino = meses.length ? meses[meses.length - 1] : null;
    this.wizardAbierto.set(false);
    if (destino && destino !== this.ctx.mesConsulta()) {
      this.ctx.mesConsulta.set(destino); // el effect recarga con ese mes
      return;
    }
    this.cargar();
  }

  cargarPagina(empresaId: number, limpiarError = true): void {
    this.consultaPagina?.unsubscribe();
    const solicitud = ++this.solicitudPagina;
    const vigente = () => solicitud === this.solicitudPagina && empresaId === this.empresaId;
    if (!vigente()) return;
    this.loading.set(true);
    this.paginaPendiente = true;
    if (limpiarError) this.error.set(null);
    this.consultaPagina = this.service.movimientos(this.cfg.modulo, empresaId, {
      categoria: this.categoria() || undefined,
      busqueda: this.busqueda() || undefined,
      fechaDesde: this.fechaDesde() || undefined,
      fechaHasta: this.fechaHasta() || undefined,
      page: this.page,
      size: this.size,
      sortBy: this.sortBy(),
      sortDir: this.sortDir(),
    }).subscribe({
      next: pagina => { if (vigente()) { this.pagina.set(pagina); this.paginaPendiente = false; this.actualizarCarga(); this.cargarLegalizaciones(empresaId); } },
      error: e => { if (vigente()) { this.error.set(msj(e)); this.paginaPendiente = false; this.actualizarCarga(); } },
    });
  }
  buscar(): void {
    this.page = 0;
    if (this.empresaId !== null) this.cargarPagina(this.empresaId);
  }

  limpiarFiltros(): void {
    this.categoria.set('');
    this.busqueda.set('');
    this.fechaDesde.set('');
    this.fechaHasta.set('');
    this.page = 0;
    this.buscarInput();
  }

  buscarInput(): void {
    if (this.empresaId !== null) this.cargarPagina(this.empresaId);
  }

  ordenar(columna: string): void {
    if (this.sortBy() === columna) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(columna);
      this.sortDir.set(columna === 'saldo' ? 'desc' : 'asc');
    }
    this.page = 0;
    this.buscarInput();
  }

  flecha(columna: string): string {
    if (this.sortBy() !== columna) return '';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }

  paginar(delta: number): void {
    const totalPages = this.pagina()?.totalPages ?? 0;
    const nueva = this.page + delta;
    if (nueva < 0 || nueva >= Math.max(totalPages, 1)) return;
    this.page = nueva;
    this.buscarInput();
  }

  cambiarCategoriaFila(mov: Movimiento, categoria: string | null, detalle: string | null): void {
    const empresaId = this.empresaId;
    if (empresaId === null || this.guardandoCategoria() || !this.ctx.tienePermiso('modulos.categorizar')) return;
    const solicitud = ++this.solicitudCategoria;
    const vigente = () => solicitud === this.solicitudCategoria && empresaId === this.empresaId;
    this.guardandoCategoria.set(true);
    this.service.asignarCategoria(empresaId, mov.nit, categoria ?? '',
      categoria === 'OTROS' ? detalle : null, this.cfg.modulo).subscribe({
      next: () => {
        if (!vigente()) return;
        this.cargar();
        if (categoria === 'OTROS') this.editingNit.set(mov.nit);
      },
      error: (e) => {
        if (!vigente()) return;
        this.guardandoCategoria.set(false);
        this.toast.error(msj(e));
      },
    });
  }

  abrirCategoria(mov: Movimiento): void {
    this.categoriaOtrosPendiente.set(null);
    this.editingNit.set(mov.nit);
  }

  onCambioCategoria(mov: Movimiento, event: Event): void {
    const valor = (event.target as HTMLSelectElement).value;
    if (valor === 'OTROS' && !mov.categoriaDetalle?.trim()) {
      this.categoriaOtrosPendiente.set(mov.nit);
      return;
    }
    this.cambiarCategoriaFila(mov, valor === '' ? null : valor,
      valor === 'OTROS' ? mov.categoriaDetalle : null);
  }

  onDetalleCategoria(mov: Movimiento, event: Event): void {
    const detalle = (event.target as HTMLInputElement).value;
    if (mov.categoria !== 'OTROS' && this.categoriaOtrosPendiente() !== mov.nit) return;
    if (detalle === (mov.categoriaDetalle ?? '') && mov.categoria === 'OTROS') return;
    this.cambiarCategoriaFila(mov, 'OTROS', detalle);
  }

  private cargarInfoImportacion(empresaId: number, vigente: () => boolean): void {
    this.consultaImportacion = this.service.importacionPeriodos(this.cfg.modulo, empresaId).subscribe({
      next: (info) => { if (vigente()) this.infoImportacion.set(info); },
      error: () => { if (vigente()) this.infoImportacion.set(null); },
    });
  }

  /** Etiqueta amigable del mes detectado en el badge del módulo ("Octubre 2026"). */
  etiquetaMes(p: string): string {
    return periodoHistorico(p);
  }

  /** Mes del movimiento; la fecha respalda listados anteriores sin periodo. */
  mesEtiqueta(mov: Movimiento): string {
    const fecha = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mov.fecha ?? '');
    const periodo = mov.periodo || (fecha ? `${fecha[3]}-${fecha[2]}` : (mov.fecha ?? '').slice(0, 7));
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) ? this.etiquetaMes(periodo) : '';
  }

  /** Badge del encabezado de la tabla con el mes de la última carga. */
  badgeMes(): string {
    const cargados = this.infoImportacion()?.periodosCargados ?? [];
    if (!cargados.length) return '';
    const primera = this.etiquetaMes(cargados[0]);
    return cargados.length > 1 ? `${primera} +${cargados.length - 1}` : primera;
  }

  badgeOmitidos(): string[] {
    return (this.infoImportacion()?.periodosOmitidos ?? []).map((o) => this.etiquetaMes(o.periodo));
  }

  tooltipMes(): string {
    const info = this.infoImportacion();
    if (!info || !info.periodosCargados.length) return '';
    const meses = info.periodosCargados.map((m) => this.etiquetaMes(m)).join(', ');
    return `Mes de la plantilla cargada en ${this.titulo}${info.nombreArchivo ? ' (' + info.nombreArchivo + ')' : ''}: ${meses}`;
  }

  tooltipOmitidos(): string {
    return (this.infoImportacion()?.periodosOmitidos ?? [])
      .map((o) => `${this.etiquetaMes(o.periodo)}: ${o.razon}`).join(' · ');
  }

  // ── Legalización de anticipos ──

  /** Carga los soportes de legalización de la página visible (sólo Anticipos). */
  cargarLegalizaciones(empresaId: number): void {
    const solicitud = ++this.solicitudLegalizaciones;
    this.errorLegalizaciones.set('');
    this.cargandoLegalizaciones.set(false);
    if (!this.esAnticipos) { this.legalizaciones.set(new Map()); return; }
    const ids = (this.pagina()?.content ?? []).map((m) => m.id).filter((id) => id != null);
    if (!ids.length) { this.legalizaciones.set(new Map()); return; }
    this.cargandoLegalizaciones.set(true);
    this.legalizacionService.listar(empresaId, ids).subscribe({
      next: (filas) => {
        if (solicitud !== this.solicitudLegalizaciones || empresaId !== this.empresaId) return;
        const mapa = new Map<number, LegalizacionAnticipo[]>();
        for (const fila of filas) {
          const lista = mapa.get(fila.movimientoId) ?? [];
          lista.push(fila);
          mapa.set(fila.movimientoId, lista);
        }
        for (const lista of mapa.values()) lista.sort((a,b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? '') || b.id-a.id);
        this.legalizaciones.set(mapa);
        this.cargandoLegalizaciones.set(false);
      },
      // El módulo sigue usable aunque no se puedan consultar los soportes.
      error: e => {
        if (solicitud !== this.solicitudLegalizaciones || empresaId !== this.empresaId) return;
        this.cargandoLegalizaciones.set(false);
        this.errorLegalizaciones.set(msj(e));
      },
    });
  }

  legalizacionesDe(mov: Movimiento): LegalizacionAnticipo[] {
    return this.legalizaciones().get(mov.id) ?? [];
  }

  /** Comprobantes vigentes del movimiento: sólo estos cuentan para el badge. */
  legalizacionesVigentes(mov: Movimiento): LegalizacionAnticipo[] {
    return this.legalizacionesDe(mov).filter((l) => !l.anulada);
  }

  legalizacionesAnuladas(mov: Movimiento): LegalizacionAnticipo[] {
    return this.legalizacionesDe(mov).filter((l) => l.anulada);
  }

  /** Badge "Legalizado": cuenta únicamente comprobantes vigentes. */
  estaLegalizado(mov: Movimiento): boolean {
    return this.legalizacionesVigentes(mov).length > 0;
  }

  /** Tooltip del chip de anuladas en la tabla: archivo + motivo de cada una. */
  tooltipAnuladas(mov: Movimiento): string {
    return this.legalizacionesAnuladas(mov)
      .map((l) => `${l.archivoNombre || 'Comprobante'}: ${l.motivoAnulacion || 'sin motivo registrado'}`)
      .join(' · ');
  }

  abrirLegalizar(mov: Movimiento): void {
    this.seleccionArchivo++;
    this.errorArchivoLegalizar.set('');
    this.validandoArchivoLegalizar.set(false);
    this.legalizarMov.set(mov);
    this.archivoLegalizar.set(null);
    this.valorLegalizar = '';
    this.observacionLegalizar = '';
    this.legalizarAbierto.set(true);
    if (this.empresaId !== null) this.cargarLegalizaciones(this.empresaId);
  }

  cerrarLegalizar(): void {
    this.seleccionArchivo++;
    this.legalizarAbierto.set(false);
    this.legalizarMov.set(null);
    this.archivoLegalizar.set(null);
    this.subiendoLegalizacion.set(false);
    // La confirmación para quitar vive encima de este modal: se limpia con él.
    this.quitando.set(false);
    this.quitarConfirm.set(null);
  }

  async onArchivoLegalizar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    await this.validarArchivoLegalizar(file);
  }

  private async validarArchivoLegalizar(file: File | undefined): Promise<void> {
    const seleccion = ++this.seleccionArchivo;
    this.archivoLegalizar.set(null);
    this.validandoArchivoLegalizar.set(false);
    this.errorArchivoLegalizar.set('');
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      this.errorArchivoLegalizar.set('Selecciona un comprobante en formato PDF.'); return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      this.errorArchivoLegalizar.set('El PDF debe contener información y pesar máximo 10 MB.'); return;
    }
    this.validandoArchivoLegalizar.set(true);
    try {
      const firma = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
      if (seleccion !== this.seleccionArchivo) return;
      if (firma !== '%PDF-') { this.errorArchivoLegalizar.set('El contenido del archivo no corresponde a un PDF válido.'); return; }
      this.archivoLegalizar.set(file);
    } catch {
      if (seleccion === this.seleccionArchivo) this.errorArchivoLegalizar.set('No se pudo leer el PDF. Selecciónalo de nuevo.');
    } finally { if (seleccion === this.seleccionArchivo) this.validandoArchivoLegalizar.set(false); }
  }

  /** Drop del comprobante sobre la zona de carga (igual que Control de Bancos). */
  async onArchivoLegalizarSoltado(event: DragEvent): Promise<void> {
    if (this.subiendoLegalizacion()) return;
    await this.validarArchivoLegalizar(event.dataTransfer?.files?.[0]);
  }

  quitarArchivoLegalizar(): void {
    this.seleccionArchivo++;
    this.validandoArchivoLegalizar.set(false);
    this.archivoLegalizar.set(null);
    this.valorLegalizar = '';
  }

  /** Categoría del archivo para pintar el icono (copiado de Control de Bancos). */
  tipoArchivo(nombre: string | null | undefined): string {
    const ext = (nombre ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xls', 'xlsx'].includes(ext)) return 'excel';
    return 'default';
  }

  /** Agrupa miles sin completar los decimales mientras se escribe. */
  formatearValorMiles(v: string): string {
    const [entero, ...decimales] = v.replace(/[^\d,]/g, '').split(',');
    const miles = entero.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (miles || (decimales.length ? '0' : '')) + (decimales.length ? ',' + decimales.join('').slice(0, 2) : '');
  }

  parsearValorMiles(v: string): number | null {
    const normalizado = v.trim().replace(/\./g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{0,2})?$/.test(normalizado)) return null;
    const valor = Number(normalizado);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }

  registrarLegalizacion(): void {
    const empresaId = this.empresaId;
    const mov = this.legalizarMov();
    const file = this.archivoLegalizar();
    if (empresaId === null || !mov || !file || this.subiendoLegalizacion() || !this.puedeLegalizar || this.validandoArchivoLegalizar()) return;
    const valor = this.parsearValorMiles(this.valorLegalizar);
    if (this.valorLegalizar.trim() && valor === null) {
      this.toast.error('El valor legalizado debe ser mayor a cero, o puedes dejarlo vacío.'); return;
    }
    const solicitud = this.solicitudResumen;
    const vigente = () => empresaId === this.empresaId && solicitud === this.solicitudResumen && this.legalizarMov()?.id === mov.id;
    this.subiendoLegalizacion.set(true);
    this.legalizacionService.registrar(empresaId, mov.id, file, valor, this.observacionLegalizar)
      .subscribe({
        next: () => {
          if (!vigente()) return;
          this.subiendoLegalizacion.set(false);
          const mes = this.mesEtiqueta(mov);
          this.toast.mostrar(mes
            ? `Comprobante registrado para ${mov.nombre} · se aplica en ${mes}`
            : `Comprobante de legalización registrado para ${mov.nombre}`);
          this.archivoLegalizar.set(null);
          this.valorLegalizar = '';
          this.observacionLegalizar = '';
          this.cargarLegalizaciones(empresaId);
        },
        error: (e) => { if (vigente()) { this.subiendoLegalizacion.set(false); this.toast.error(msj(e)); } },
      });
  }

  verDocumentoLegalizacion(l: LegalizacionAnticipo): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    const ventana = window.open('about:blank', '_blank');
    if (ventana) ventana.opener = null;
    this.legalizacionService.contenidosArchivo(empresaId, l.id).subscribe({
      next: r => {
        if (empresaId !== this.empresaId) { ventana?.close(); return; }
        if (!r.ok || !r.body || r.body.size === 0) {
          ventana?.close();
          this.toast.error('No se pudo abrir el comprobante de legalización. Intenta de nuevo.');
          return;
        }
        if (ventana) {
          const url = URL.createObjectURL(r.body);
          ventana.location.replace(url);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        else this.toast.error('Permite las ventanas emergentes y vuelve a abrir el comprobante.');
      },
      error: () => { ventana?.close(); this.toast.error('No se pudo abrir el comprobante de legalización. Intenta de nuevo.'); },
    });
  }

  /** Cierra la confirmación sin interrumpir una eliminación en curso. */
  cerrarQuitar(): void {
    if (!this.quitando()) this.quitarConfirm.set(null);
  }

  quitar(): void {
    const empresaId = this.empresaId;
    const l = this.quitarConfirm();
    if (empresaId === null || !l || l.anulada || this.quitando() || !this.puedeLegalizar) return;
    this.quitando.set(true);
    this.legalizacionService.quitar(empresaId, l.id).subscribe({
      next: () => {
        this.quitando.set(false);
        if (empresaId !== this.empresaId) return;
        this.quitarConfirm.set(null);
        this.toast.mostrar(`Comprobante quitado · ${l.archivoNombre || 'Comprobante'}`);
        this.cargarLegalizaciones(empresaId);
        untracked(() => this.cargar());
      },
      error: (e) => {
        this.quitando.set(false);
        if (empresaId === this.empresaId) this.toast.error(msj(e));
      },
    });
  }

  tamanoLegible(bytes: number | null | undefined): string {
    if (bytes == null || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Permiso efectivo para subir el comprobante de legalización: la regla del
   * backend es `modulos.importar`. Se lee el permiso crudo a propósito: la
   * legalización de un anticipo de un mes anterior es evidencia documental y
   * NO debe ocultarse porque el mes habilitado esté aprobado (a diferencia de
   * las ediciones del presupuesto que sí pasan por tienePermiso()).
   */
  get puedeLegalizar(): boolean {
    const p = this.ctx.permisos();
    if (!p) return false;
    if (p.superAdmin) return true;
    return p.permisos?.includes('modulos.importar') ?? false;
  }

  exportar(): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.descargando.set(true);    this.service.exportarModulo(this.cfg.modulo, empresaId,
      this.categoria() || undefined, this.fechaDesde() || undefined, this.fechaHasta() || undefined)
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gestor_presupuestal_${this.cfg.modulo}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.descargando.set(false);
      }, e => { this.descargando.set(false); this.toast.error(msj(e)); });
  }

  // ── Gráficas ──

  /** Tipo de visualización de la gráfica "Saldo por categoría" (ChartBar del original). */
  tipoGrafica = signal<'bar-h' | 'bar-v' | 'line' | 'area' | 'donut'>('bar-h');

  tiposGrafica: { id: 'bar-h' | 'bar-v' | 'line' | 'area' | 'donut'; icono: string; titulo: string }[] = [
    { id: 'bar-h', icono: 'chart', titulo: 'Barras horizontales' },
    { id: 'bar-v', icono: 'chart', titulo: 'Barras verticales' },
    { id: 'line', icono: 'trending', titulo: 'Línea' },
    { id: 'area', icono: 'activity', titulo: 'Área' },
    { id: 'donut', icono: 'pie-chart', titulo: 'Donut' },
  ];

  setTipoGrafica(id: 'bar-h' | 'bar-v' | 'line' | 'area' | 'donut'): void {
    this.tipoGrafica.set(id);
  }

  /** Datos base: categorías con saldo ≠ 0, valor absoluto, desc, top 8 (donut) / 12 (resto). */
  chartDatos = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    const limite = this.tipoGrafica() === 'donut' ? 8 : 12;
    return r.resumen.filter((c) => c.saldo !== 0)
      .map((c) => ({
        categoria: (c.categoria ?? 'SIN CATEGORÍA').length > 14 ? (c.categoria ?? '').slice(0,13) + '…' : (c.categoria ?? 'SIN CATEGORÍA'),
        categoriaFull: c.categoria ?? 'SIN CATEGORÍA',
        valor: Math.abs(c.saldo),
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, limite);
  });

  /** Series de ApexCharts: números para donut, [{name,data}] para barras/línea/área. */
  chartSeries = computed(() => {
    const tipo = this.tipoGrafica();
    const valores = this.chartDatos().map((d) => d.valor);
    if (tipo === 'donut') return valores;
    return [{ name: 'Saldo', data: valores }];
  });

  /** Opciones de la gráfica según el tipo seleccionado (ApexCharts).
   *  Colores, rejilla y leyendas corresponden a la referencia. */
  chartOptions = computed<any>(() => {
    const tipo = this.tipoGrafica();
    const datos = this.chartDatos();
    const esDonut = tipo === 'donut';
    const esBarH = tipo === 'bar-h';
    const esBarras = tipo === 'bar-h' || tipo === 'bar-v';
    const nombres = datos.map((d) => d.categoriaFull);
    const valores = datos.map((d) => d.valor);

    const base: any = {
      chart: {
        type: esDonut ? 'donut' : esBarras ? 'bar' : tipo,
        height: esDonut ? 340 : esBarH ? 300 : 310,
        parentHeightOffset: 0,
        foreColor: '#64748b',
        fontFamily: 'Poppins, system-ui, sans-serif',
        toolbar: { show: false },
        animations: { enabled: true, speed: 450 },
      },
      colors: esDonut || esBarras ? datos.map(d=>CATEGORIA_COLORS[d.categoriaFull] || '#64748b') : ['#045C94'],
      dataLabels: { enabled: false },
      tooltip: { y: { formatter: (val: number) => formatoCOP(val) } },
      legend: { show: esDonut, position: 'bottom', fontSize: '12px', markers: { size: 5 } },
      grid: { borderColor: 'rgba(148,163,184,.08)', strokeDashArray: 3, padding: {top: esBarH ? -25 : 0, left:esBarH ? -10 : 0, right:6}, xaxis:{lines:{show:esBarH}},yaxis:{lines:{show:!esBarH}} },
    };

    if (esDonut) {
      base.labels = nombres;
      base.stroke = { width: 2, colors: ['#ffffff'] };
      base.plotOptions = { pie: { donut: { size: '72%', labels: { show: true, total: { show: true, label: 'Saldo', formatter: (w: any) => formatoCOPShort(w.globals.seriesTotals[0]) } } } } };
    } else if (esBarras) {
      base.series = [{ name: 'Saldo', data: valores }];
      if (esBarH) {
        base.plotOptions = { bar: { horizontal: true, distributed:true, borderRadius: 4, barHeight: Math.min(80,datos.length*10)+'%' } };
        const pasoBase = 10 ** Math.floor(Math.log10(Math.max(...valores, 1) / 4));
        const paso = Math.ceil(Math.max(...valores, 1) / 4 / pasoBase * 2) / 2 * pasoBase;
        base.xaxis = { categories: nombres, min:0, max:paso*4, tickAmount:4, axisBorder:{show:false},axisTicks:{show:false},labels: { formatter: (val: string) => '$'+(Number(val)/1e6).toFixed(0)+'M', ...GP_CHART_EJE_LABELS } };
        base.yaxis = { labels: { minWidth:110, maxWidth:126, ...GP_CHART_EJE_LABELS } };
      } else {
        base.plotOptions = { bar: { distributed:true,columnWidth: '42%', borderRadius: 5 } };
        base.xaxis = { categories: nombres, labels: { ...GP_CHART_EJE_LABELS } };
        base.yaxis = { labels: { formatter: (val: number) => formatoCOPShort(val) } };
      }
    } else {
      base.series = [{ name: 'Saldo', data: valores }];
      base.xaxis = { categories: nombres, labels: { ...GP_CHART_EJE_LABELS } };
      base.yaxis = { labels: { formatter: (val: number) => formatoCOPShort(val) } };
      base.stroke = { curve: 'smooth', width: 2.5 };
      if (tipo === 'area') {
        base.fill = { type: 'gradient', gradient: { opacityFrom: 0.28, opacityTo: 0.02 } };
      }
    }

    return base;
  });

  // ── Helpers de template ──

  saldo(v: number | null): string {
    return formatoCOP(v);
  }

  clasesSaldo(v: number | null): string {
    return (v ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600';
  }

  aprobada(mov: Movimiento): string {
    return mov.aprobada ? 'SÍ · Aprobada' : 'NO';
  }

  formatearFecha(fecha: string | null | undefined): string {
    return formatearFechaCO(fecha);
  }

  rango(): string {
    return `Página ${this.page + 1} / ${Math.max(this.pagina()?.totalPages ?? 1, 1)}`;
  }

  paginas(): number {
    return Math.max(this.pagina()?.totalPages ?? 1, 1);
  }

  tieneAprobacion(): boolean {
    return this.cfg.modulo === 'proveedores' || this.cfg.modulo === 'cx_pagar' || this.cfg.modulo === 'impuestos';
  }

  cp(v: number | null | undefined): string {
    return formatoCOP(v);
  }

  diasVencidos(fecha: string | null | undefined): number {
    if (!fecha) return 0;
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return Math.max(0, Math.floor((Date.parse(hoy + 'T00:00:00Z') - Date.parse(fecha.slice(0, 10) + 'T00:00:00Z')) / 86400000));
  }

  actualizarMontoParcial(f: FacturaSugerida, valor: number | null): void {
    const p = this.preview();
    if (!p) return;
    const maximo = f.saldoPendiente ?? f.monto;
    const v = valor == null ? 0 : Math.max(0, Math.min(valor, maximo));
    f.montoAprobar = Math.round(v * 100) / 100;
    p.totalAprobar = Math.round(p.facturas.reduce((sum, item) => sum + (item.montoAprobar ?? item.monto), 0) * 100) / 100;
  }

  async previsualizarAprobacionFila(mov: Movimiento): Promise<void> {
    const empresaId = this.empresaId;
    if (empresaId === null || !mov.nit) return;
    this.previsualizando.set(true);
    try {
      let p: PrevisualizarProveedor;
      if (this.cfg.modulo === 'proveedores') {
        p = await firstValueFrom(this.service.previsualizarProveedor(empresaId, mov.nit));
      } else {
        p = await firstValueFrom(this.service.previsualizarTerceroModulo(empresaId, this.cfg.modulo, mov.nit));
      }
      this.preview.set(p);
      this.modalAprobacion.set(true);
    } catch (e) {
      this.toast.error(msj(e));
    } finally {
      this.previsualizando.set(false);
    }
  }

  async confirmarAprobacionModal(): Promise<void> {
    const empresaId = this.empresaId;
    const p = this.preview();
    if (empresaId === null || !p) return;
    this.aprobando.set(true);
    try {
      if (p.permiteParcial && this.cfg.modulo !== 'proveedores') {
        const aprobaciones = p.facturas
          .filter(f => (f.montoAprobar ?? f.monto) > 0)
          .map(f => ({
            movimiento_id: f.movimientoId,
            monto: f.montoAprobar ?? f.monto,
          }));
        try {
          const r = await firstValueFrom(this.service.aprobarParcial(empresaId, this.cfg.modulo, p.nit, aprobaciones));
          if (r.error) { this.toast.error(r.error); return; }
          this.cerrarModalAprobacion();
          this.toast.mostrar(`Se aprobaron ${r.facturasAprobadas} facturas por ${formatoCOP(r.totalAprobado)}.`);
          this.cargar();
          return;
        } catch (err: any) {
          if (err?.status !== 404 && err?.status !== 501) {
            throw err;
          }
          console.warn('Fallback: endpoint aprobar-parcial no listo en backend, usando flujo tradicional.');
        }
      }

      if (this.cfg.modulo === 'proveedores') {
        const r = await firstValueFrom(this.service.aprobarProveedorSugerido(empresaId, p.nit));
        if (r.error) { this.toast.error(r.error); return; }
        this.cerrarModalAprobacion();
        const omitida = r.primeraFacturaOmitida;
        this.toast.mostrar(`Se aprobaron facturas por ${formatoCOP(r.totalAprobado)}${omitida ? '.\nLa primera factura que no cabe completa se dejó pendiente.' : ''}`);
        this.cargar();
      } else {
        const r = await firstValueFrom(this.service.aprobarTerceroModulo(empresaId, this.cfg.modulo, p.nit));
        if (r.error) { this.toast.error(r.error); return; }
        this.cerrarModalAprobacion();
        this.toast.mostrar(`Se aprobaron ${r.facturasAprobadas} ítems por ${formatoCOP(r.totalAprobado)} en ${this.titulo}.`);
        this.cargar();
      }
    } catch (e) {
      this.toast.error(msj(e));
    } finally {
      this.aprobando.set(false);
    }
  }

  cerrarModalAprobacion(): void {
    this.modalAprobacion.set(false);
    this.preview.set(null);
  }

  totalPagina(): number {
    return (this.pagina()?.content ?? []).reduce((s, m) => s + (m.saldo ?? 0), 0);
  }

  totales(): string {
    const p = this.pagina();
    return p ? `${new Intl.NumberFormat('es-CO').format(p.totalElements)} registros` : '';
  }

  na(v: number | null | undefined): number {
    return v ?? 0;
  }
}

export function msj(e: any): string {
  return mensajeError(e);
}
