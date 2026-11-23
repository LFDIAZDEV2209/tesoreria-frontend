import { HttpEventType } from '@angular/common/http';
import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { ControlDiarioComponent } from '../control-diario/control-diario.component';
import { EstadoBadgeComponent } from '../../components/estado-badge/estado-badge.component';
import { ArchivoAdjunto, DetalleSolicitudItem, MovimientoBancario } from '../../models/movimiento-bancario.model';
import { ConciliacionDetalle } from '../../models/conciliacion.model';
import { TesoreriaService, SolicitudViaticosTesoreria } from '../../services/tesoreria.service';
import { EgresoPdfDraft, EgresoPdfService } from '../../services/egreso-pdf.service';
import { Egreso } from '../../models/egreso.model';
import { TramitarRequisicionService } from '../../../../features/compras/tramitar-requisicion/services/tramitar-requisicion.service';
import { ControlEgresosService } from '../../../../features/contabilidad/control-egresos/control-egresos.service';
import { EgresoRegistrado } from '../../../../features/contabilidad/control-egresos/control-egresos.model';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-bandeja-tesoreria',
  standalone: true,
  imports: [SelectBuscableDirective,
    CommonModule,
    FormsModule,
    RouterModule,
    MatSnackBarModule,
    ControlDiarioComponent,
    EstadoBadgeComponent,
  ],
  templateUrl: './bandeja-tesoreria.component.html',
  styleUrl: './bandeja-tesoreria.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BandejaTesoreriaComponent implements OnInit {
  movimientos: MovimientoBancario[] = [];
  filteredMovimientos: MovimientoBancario[] = [];
  bancos: string[] = [];
  empresasUt: string[] = [];
  loading = false;

  // ───── Table switcher ──────────────────────────
  // Las tres bandejas comparten el flujo existente de Tesorería.
  activeView = signal<'compras' | 'viaticos' | 'egresos'>('egresos');
  showViewSelector = signal(false);
  switchingView = signal(false);
  readonly viewOptions: { value: 'compras' | 'viaticos' | 'egresos'; label: string; icon: string; oculta?: boolean }[] = [
    { value: 'compras', label: 'Solicitudes de Compras', icon: '🧾' },
    { value: 'viaticos', label: 'Solicitudes de Viáticos', icon: '✈️' },
    { value: 'egresos', label: 'Cargue de C. Egreso', icon: '🛡️' },
  ];
  readonly viewOptionsVisibles = this.viewOptions.filter((o) => !o.oculta);

  // ───── Viáticos ────────────────────────────────
  viaticos = signal<SolicitudViaticosTesoreria[]>([]);
  viaticosLoaded = signal(false);
  loadingViaticos = signal(false);
  searchViaticos = '';
  viaticosEstadoFilter: 'pendientes' | 'pagadas' | 'todas' = 'pendientes';
  filteredViaticos: SolicitudViaticosTesoreria[] = [];

  // ───── Egresos de Tesorería (envío a GF + pago) ─────
  egresosContador = signal<EgresoRegistrado[]>([]);
  egresosPendientesEnvio = signal<EgresoRegistrado[]>([]);
  enviandoAprobacionId = signal<number | null>(null);
  egresosLoaded = signal(false);
  loadingEgresos = signal(false);
  searchEgresos = signal('');
  filtroEgreso = signal<'todos' | 'enviar' | 'pagar'>('todos');
  empresaFiltro = signal<number | null | 'todas'>('todas');
  readonly progresoSoporte = signal<number | null>(null);
  readonly subiendoSoporte = signal<number | null>(null);

  /** Tabla unificada: primero los que faltan enviar a GF, luego los pendientes de pago. */
  readonly egresosTabla = computed<EgresoRegistrado[]>(() => {
    const peso = (e: EgresoRegistrado) => (e.estado === 'REGISTRADO' ? 0 : 1);
    return [...this.egresosPendientesEnvio(), ...this.egresosContador()].sort(
      (a, b) =>
        peso(a) - peso(b) ||
        String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')) ||
        (b.id ?? 0) - (a.id ?? 0),
    );
  });

  readonly egresosFiltrados = computed<EgresoRegistrado[]>(() => {
    const q = this.searchEgresos().toLowerCase().trim();
    const filtro = this.filtroEgreso();
    const empresa = this.empresaFiltro();
    return this.egresosTabla().filter((e) => {
      if (filtro === 'enviar' && e.estado !== 'REGISTRADO') return false;
      if (filtro === 'pagar' && e.estado !== 'ENVIADO_TESORERIA') return false;
      if (empresa !== 'todas' && (e.empresaId ?? null) !== empresa) return false;
      if (!q) return true;
      return [e.numeroFactura, e.numeroEgreso, e.nitProveedor, e.proveedorNombre, e.empresaNombre]
        .some((valor) => valor?.toLowerCase().includes(q));
    });
  });

  /** Empresas reales de los egresos cargados (para las pestañas). */
  readonly empresasEgresos = computed<{ id: number | null; clave: string; nombre: string; total: number }[]>(() => {
    const mapa = new Map<string, { id: number | null; clave: string; nombre: string; total: number }>();
    for (const e of this.egresosTabla()) {
      const id = e.empresaId ?? null;
      const clave = id == null ? 'sin-empresa' : String(id);
      const nombre = e.empresaNombre || (id == null ? 'Sin empresa' : `Empresa ${id}`);
      const fila = mapa.get(clave);
      if (fila) fila.total++;
      else mapa.set(clave, { id, clave, nombre, total: 1 });
    }
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly kpiPorEnviar = computed(() => this.egresosPendientesEnvio().length);
  readonly kpiPendientesPago = computed(() => this.egresosContador().length);
  readonly kpiMontoPendiente = computed(() =>
    this.egresosContador().reduce((total, e) => total + this.egresoNeto(e), 0),
  );
  adjuntarSoporte(e: EgresoRegistrado, event: Event): void {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!file || !e.id || this.subiendoSoporte() !== null) return;
    this.progresoSoporte.set(0);
    this.subiendoSoporte.set(e.id);
    this.controlEgresosService.adjuntarSoporte(e.id, file).pipe(finalize(() => {
      input.value = ''; this.subiendoSoporte.set(null); this.progresoSoporte.set(null); this.cdr.markForCheck();
    })).subscribe({next: event => {
      if (event.type === HttpEventType.UploadProgress) {
        this.progresoSoporte.set(event.total ? Math.round(100 * event.loaded / event.total) : null);
        this.cdr.markForCheck(); return;
      }
      if (event.type !== HttpEventType.Response || !event.body) return;
      e.soporteEgresoNombre = event.body.nombre; e.soporteEgresoKey = event.body.key;
      this.snackBar.open('Soporte de egreso adjuntado', 'Cerrar', {duration: 4000});
    }, error: err => this.snackBar.open(err?.error?.detail || err?.error?.message || 'No se pudo adjuntar el soporte', 'Cerrar', {duration: 6000})});
  }
  verSoporte(e: EgresoRegistrado): void {
    if (!e.id) return;
    this.controlEgresosService.verSoporte(e.id).subscribe({next: r => this.verArchivoEstado(r.url, e.soporteEgresoNombre || 'Soporte de egreso'),
      error: () => this.snackBar.open('No se pudo abrir el soporte', 'Cerrar', {duration: 4000})});
  }
  /** Verificación de duplicado por egreso id: 'checking' | 'ok' | 'dup' */
  dupVerificacion = new Map<number, 'checking' | 'ok' | 'dup'>();

  // ───── Tramites Contabilidad (merged into movimientos) ──────
  private tramiteSourceIds = new Set<number>();

  // ───── Filters ──────────────────────────
  searchTerm = '';
  filterBanco = '';
  filterEmpresa = '';
  openMenuId = signal<number | null>(null);
  menuPosition = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  /** ID of the currently-expanded row (for multi-provider accordion) */
  expandedRowId = signal<number | null>(null);

  // ───── Pagination for expanded rows ─────────────────
  private detailsPaginationMap = new Map<number, number>(); // Maps rowId to current page index
  private readonly DETAILS_PER_PAGE = 3; // Show 3 providers per page

  detalleModalOpen = false;
  detalleLoading = false;
  detalleData: ConciliacionDetalle | null = null;
  detalleOcCodigo = '';
  controlDiarioModalOpen = false;
  controlDiarioMovimiento: MovimientoBancario | null = null;
  pdfPreviewOpen = false;
  pdfDraft: EgresoPdfDraft | null = null;
  pdfEgreso: Egreso | null = null;
  pdfMovimiento: MovimientoBancario | null = null;

  // ───── Archivo viewer modal con pestañas ─────────
  archivoModalOpen = false;
  archivoModalUrl: SafeResourceUrl | null = null;
  archivoModalTitulo = '';
  archivoModalArchivos: ArchivoAdjunto[] = [];
  archivoModalTabActiva = 0;
  private backendApiBase: string = '';

  get totalValorMovimientos(): number {
    return this.movimientos.reduce((acc, row) => acc + row.valor, 0);
  }

  constructor(
    private readonly tesoreriaService: TesoreriaService,
    private readonly egresoPdfService: EgresoPdfService,
    private readonly tramiteService: TramitarRequisicionService,
    private readonly controlEgresosService: ControlEgresosService,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer,
    private readonly router: Router,
  ) {
    this.backendApiBase = this.resolveBackendApiBase();
  }

  actualizarBandeja(): void {
    if (this.activeView() === 'egresos') this.loadEgresosContador();
    else if (this.activeView() === 'viaticos') this.loadViaticos();
    else this.loadData();
  }

  ngOnInit(): void {
    this.loadData();
    // Abrir egresos por defecto; Compras y Viáticos siguen disponibles en el selector.
    if (this.activeView() === 'egresos' && !this.egresosLoaded()) {
      this.loadEgresosContador();
    }
  }

  // =====================================================
  // Computed stats for KPI cards
  // =====================================================

  get pendientesCount(): number {
    return this.movimientos.filter(m => m.estadoPago === 'Pendiente').length;
  }

  get conciliadosCount(): number {
    return this.movimientos.filter(m => m.estadoPago === 'Conciliado' || m.estadoPago === 'Completo').length;
  }

  get egresosCount(): number {
    return this.movimientos.filter(m => m.estadoEgreso === 'Conciliado' || m.estadoEgreso === 'Completo').length;
  }

  // =====================================================
  // Filtering
  // =====================================================

  filterMovimientos(): void {
    let result = this.movimientos;

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(m =>
        m.referencia?.toLowerCase().includes(term) ||
        m.cuenta?.toLowerCase().includes(term) ||
        m.empresaUt?.toLowerCase().includes(term) ||
        m.banco?.toLowerCase().includes(term) ||
        String(m.id).includes(term)
      );
    }

    if (this.filterBanco) {
      result = result.filter(m => m.banco === this.filterBanco);
    }

    if (this.filterEmpresa) {
      result = result.filter(m => m.empresaUt === this.filterEmpresa);
    }

    this.filteredMovimientos = result;
    this.cdr.markForCheck();
  }

  // =====================================================
  // Tramites de Contabilidad — mapped into movimientos
  // =====================================================

  loadTramitesTesoreria(): void {
    this.tramiteService.getBandejaTesoreriaEnriquecida().subscribe({
      next: (items: any[]) => {
        const mapped: MovimientoBancario[] = items.map((t: any) => {
          const mappedId = t.numeroSolicitud as number;
          this.tramiteSourceIds.add(mappedId);
          const esViaticos = String(t.concepto || '')
            .toLowerCase()
            .includes('viatic');

          // Map detalles (proveedores + OC + egresos)
          const detalles = (t.detalles || []).map((d: any) => ({
            proveedorRelacionId: d.proveedorRelacionId,
            proveedorNombre: d.proveedorNombre || 'Sin proveedor',
            proveedorNit: d.proveedorNit || '',
            proveedorBanco: d.proveedorBanco || '',
            proveedorNumeroCuenta: d.proveedorNumeroCuenta || '',
            proveedorFormaPago: d.proveedorFormaPago || '',
            numeroOc: d.numeroOc || '',
            archivoOcUrl: this.normalizeDocumentUrl(d.archivoOcUrl || ''),
            archivoOcNombre: d.archivoOcNombre || '',
            valorOc: d.valorOc || 0,
            fechaEmisionOc: d.fechaEmisionOc || '',
            estadoEgreso: d.estadoEgreso || 'Pendiente',
            numeroEgreso: d.numeroEgreso || '',
            valorEgreso: d.valorEgreso || 0,
            archivosEgresoDetalle: this.normalizeAdjuntos(d.archivosEgresoDetalle || []),
          }));

          // Determine banco/cuenta from first provider detail
          const firstDetail = detalles.length > 0 ? detalles[0] : null;
          const provBanco = firstDetail?.proveedorBanco || '';
          const provCuenta = firstDetail?.proveedorNumeroCuenta || '';

          // Store the full tramite object for later use when navigating to tramitar-pago
          const mov: any = {
            id: mappedId,
            tipoMovimiento: esViaticos ? 'Viaticos' : 'Solicitud Compra',
            fechaPago: this.formatIsoDate(t.fechaLlegadaTesoreria),
            empresaUt: t.empresaUt || '',
            areaDepartamento: t.areaDepartamento || '',
            banco: provBanco,
            cuenta: provCuenta,
            valor: t.valorAPagar || 0,
            estadoOc: (t.estadoOc || 'Pendiente') as any,
            estadoEgreso: (t.estadoEgreso || 'Pendiente') as any,
            estadoPago: (t.estadoPago || 'Pendiente') as any,
            referencia: t.numeroRequisicion || '',
            concepto: t.concepto || '',
            proveedor: t.proveedor || '',
            archivoOcUrl: t.archivosOc?.length > 0 ? this.normalizeDocumentUrl(t.archivosOc[0].url) : null,
            archivoEgresoUrl: t.archivosEgreso?.length > 0 ? this.normalizeDocumentUrl(t.archivosEgreso[0].url) : null,
            archivoPagoUrl: t.archivosPago?.length > 0 ? this.normalizeDocumentUrl(t.archivosPago[0].url) : null,
            archivosOc: this.normalizeAdjuntos(t.archivosOc || []),
            archivosEgreso: this.normalizeAdjuntos(t.archivosEgreso || []),
            archivosPago: this.normalizeAdjuntos(t.archivosPago || []),
            detalles,
            totalProveedores: t.totalProveedores || detalles.length,
            totalOrdenes: t.totalOrdenes || 0,
            // Store the full tramite object for later reference
            tramiteData: t,
          };
          return mov as MovimientoBancario;
        });
        this.movimientos = [...this.movimientos, ...mapped];
        this.filterMovimientos();
        this.cdr.markForCheck();
      },
      error: () => { /* tramites fail silently — normal movimientos still show */ }
    });
  }

  /** Check if a row was mapped from a contabilidad tramite */
  isTramiteRow(row: MovimientoBancario): boolean {
    return this.tramiteSourceIds.has(row.id);
  }

  /** Toggle expanded state for a row (shows provider details) */
  toggleExpandRow(row: MovimientoBancario): void {
    if (this.expandedRowId() === row.id) {
      this.expandedRowId.set(null);
    } else {
      this.expandedRowId.set(row.id);
    }
    this.cdr.markForCheck();
  }

  /** Check if a row has multiple providers to show */
  hasMultipleProviders(row: MovimientoBancario): boolean {
    return !!row.detalles && row.detalles.length > 0;
  }

  /** Get current page of details for expanded row */
  getCurrentDetailsPage(row: MovimientoBancario): any[] {
    if (!row.detalles) return [];
    const pageIndex = this.detailsPaginationMap.get(row.id) || 0;
    const start = pageIndex * this.DETAILS_PER_PAGE;
    return row.detalles.slice(start, start + this.DETAILS_PER_PAGE);
  }

  /** Get total pages for details */
  getTotalDetailsPages(row: MovimientoBancario): number {
    if (!row.detalles) return 0;
    return Math.ceil(row.detalles.length / this.DETAILS_PER_PAGE);
  }

  /** Get current page number for details (0-indexed) */
  getCurrentDetailsPageIndex(row: MovimientoBancario): number {
    return this.detailsPaginationMap.get(row.id) || 0;
  }

  /** Move to next page of details */
  nextDetailsPage(row: MovimientoBancario): void {
    const currentPage = this.getCurrentDetailsPageIndex(row);
    const totalPages = this.getTotalDetailsPages(row);
    if (currentPage < totalPages - 1) {
      this.detailsPaginationMap.set(row.id, currentPage + 1);
      this.cdr.markForCheck();
    }
  }

  /** Move to previous page of details */
  prevDetailsPage(row: MovimientoBancario): void {
    const currentPage = this.getCurrentDetailsPageIndex(row);
    if (currentPage > 0) {
      this.detailsPaginationMap.set(row.id, currentPage - 1);
      this.cdr.markForCheck();
    }
  }

  /** Go to specific page of details */
  gotoDetailsPage(row: MovimientoBancario, pageIndex: number): void {
    const totalPages = this.getTotalDetailsPages(row);
    if (pageIndex >= 0 && pageIndex < totalPages) {
      this.detailsPaginationMap.set(row.id, pageIndex);
      this.cdr.markForCheck();
    }
  }

  /** Navigate to compras tramitar for requisition */
  verTramiteContabilidad(row: MovimientoBancario): void {
    // row.id is the numeroSolicitud, use it directly to navigate to compras tramitar
    this.router.navigate(['/compras/tramitar', row.id]);
  }

  private formatIsoDate(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ───── View switcher ─────────────────────────────────────────────

  toggleViewSelector(): void {
    this.showViewSelector.set(!this.showViewSelector());
    this.cdr.markForCheck();
  }

  cambiarVista(vista: 'compras' | 'viaticos' | 'egresos'): void {
    if (this.activeView() === vista) {
      this.showViewSelector.set(false);
      this.cdr.markForCheck();
      return;
    }
    this.switchingView.set(true);
    this.showViewSelector.set(false);
    this.activeView.set(vista);
    if (vista === 'viaticos' && !this.viaticosLoaded()) {
      this.loadViaticos();
    } else if (vista === 'egresos' && !this.egresosLoaded()) {
      this.loadEgresosContador();
    } else {
      this.switchingView.set(false);
    }
    this.cdr.markForCheck();
  }

  getActiveViewIcon(): string {
    return this.viewOptions.find((o) => o.value === this.activeView())?.icon ?? '🧾';
  }

  getActiveViewLabel(): string {
    return this.viewOptions.find((o) => o.value === this.activeView())?.label ?? 'Compras';
  }

  loadViaticos(): void {
    this.loadingViaticos.set(true);
    this.tesoreriaService.getSolicitudesViaticosTesoreria().subscribe({
      next: (data) => {
        this.viaticos.set(data);
        this.filterViaticos();
        this.viaticosLoaded.set(true);
        this.loadingViaticos.set(false);
        this.switchingView.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingViaticos.set(false);
        this.switchingView.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onSearchViaticos(event: Event): void {
    this.searchViaticos = (event.target as HTMLInputElement).value;
    this.filterViaticos();
    this.cdr.markForCheck();
  }

  onChangeViaticosEstadoFilter(value: 'pendientes' | 'pagadas' | 'todas'): void {
    this.viaticosEstadoFilter = value;
    this.filterViaticos();
    this.cdr.markForCheck();
  }

  private isViaticoPagado(v: SolicitudViaticosTesoreria): boolean {
    const estado = String(v.estado ?? '').toUpperCase();
    return estado === 'PAGADO';
  }

  private isViaticoPendiente(v: SolicitudViaticosTesoreria): boolean {
    return !this.isViaticoPagado(v);
  }

  filterViaticos(): void {
    let result = this.viaticos();

    if (this.viaticosEstadoFilter === 'pendientes') {
      result = result.filter((v) => this.isViaticoPendiente(v));
    } else if (this.viaticosEstadoFilter === 'pagadas') {
      result = result.filter((v) => this.isViaticoPagado(v));
    }

    const q = this.searchViaticos.toLowerCase();
    if (!q) {
      this.filteredViaticos = result;
    } else {
      this.filteredViaticos = result.filter(
        (v) =>
          v.empresa?.toLowerCase().includes(q) ||
          v.area?.toLowerCase().includes(q) ||
          v.solicitante?.toLowerCase().includes(q) ||
          v.numeroViatico?.toLowerCase().includes(q),
      );
    }
    this.cdr.markForCheck();
  }

  getViaticosCount(): number {
    return this.viaticos().length;
  }

  formatCurrencyViaticos(value: number | null | undefined): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  formatFechaViaticos(fecha: string | null | undefined): string {
    if (!fecha) return '—';
    const d = new Date(fecha + 'T00:00:00');
    if (isNaN(d.getTime())) return fecha;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getViaticosEstadoLabel(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      PAGADO: 'Pagado',
    };
    return map[estado] ?? estado;
  }

  getViaticosEstadoClass(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'bg-amber-100 text-amber-700 border border-amber-200',
      PAGADO: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
    };
    return map[estado] ?? 'bg-gray-100 text-gray-700';
  }

  getSemaforoViaticos(v: SolicitudViaticosTesoreria): 'rojo' | 'amarillo' | 'verde' {
    if (!v.fechaMaximaEvento) return 'amarillo';
    const hoy = new Date();
    const fMax = new Date(v.fechaMaximaEvento + 'T00:00:00');
    const diffDays = Math.ceil((fMax.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'rojo';
    if (diffDays <= 3) return 'amarillo';
    return 'verde';
  }

  getSemaforoClassViaticos(semaforo: 'rojo' | 'amarillo' | 'verde'): string {
    const map = {
      rojo: 'semaforo-rojo',
      amarillo: 'semaforo-amarillo',
      verde: 'semaforo-verde',
    };
    return map[semaforo];
  }

  getSemaforoTooltipViaticos(semaforo: 'rojo' | 'amarillo' | 'verde'): string {
    const map = {
      rojo: 'Vencido',
      amarillo: 'Próximo a vencer (≤3 días)',
      verde: 'A tiempo',
    };
    return map[semaforo];
  }

  navegarTramitarViaticos(v: SolicitudViaticosTesoreria): void {
    this.router.navigate(['/tesoreria/tramitar-pago', v.solicitudViaticosId], {
      queryParams: { tipo: 'viaticos' },
      state: {
        tipo: 'viaticos',
        viaticoData: v,
      },
    });
  }

  // =====================================================
  // Egresos del Contador (enviados por contabilidad)
  // =====================================================

  loadEgresosContador(): void {
    this.loadingEgresos.set(true);
    this.controlEgresosService.listarPendientesEnvio().subscribe({
      next: (pendientes) => {
        this.egresosPendientesEnvio.set(pendientes);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.egresosPendientesEnvio.set([]);
        this.cdr.markForCheck();
        this.snackBar.open(e?.error?.message || 'No se pudieron cargar los egresos por enviar a Gerencia.', 'Cerrar', { duration: 5000 });
      },
    });
    this.controlEgresosService.listarParaTesoreria().subscribe({
      next: (data) => {
        this.egresosContador.set(data);
        this.egresosLoaded.set(true);
        this.loadingEgresos.set(false);
        this.switchingView.set(false);
        this.cdr.markForCheck();
        // Verificar duplicado de cada fila contra el registro central
        this.egresosContador().forEach((e) => this.verificarDuplicadoEgreso(e));
      },
      error: (e) => {
        this.loadingEgresos.set(false);
        this.switchingView.set(false);
        this.cdr.markForCheck();
        this.snackBar.open(e?.error?.message || 'No se pudieron cargar los egresos pendientes de pago.', 'Cerrar', { duration: 5000 });
      },
    });
  }

  onSearchEgresos(event: Event): void {
    this.searchEgresos.set((event.target as HTMLInputElement).value);
  }

  accionEgreso(e: EgresoRegistrado): 'ENVIAR_GF' | 'TRAMITAR' {
    return e.estado === 'REGISTRADO' ? 'ENVIAR_GF' : 'TRAMITAR';
  }

  egresoEstadoLabel(e: EgresoRegistrado): string {
    switch (e.estado) {
      case 'REGISTRADO': return 'Pendiente de envío';
      case 'EN_REVISION_GERENCIA': return 'En Gerencia Financiera';
      case 'ENVIADO_TESORERIA': return 'Pendiente de pago';
      case 'PAGADO': return 'Pagado';
      default: return e.estado ?? '—';
    }
  }

  egresoEstadoClass(e: EgresoRegistrado): string {
    switch (e.estado) {
      case 'REGISTRADO': return 'estado-envio';
      case 'EN_REVISION_GERENCIA': return 'estado-gf';
      case 'ENVIADO_TESORERIA': return 'estado-pago';
      case 'PAGADO': return 'estado-pagado';
      default: return 'estado-inactivo';
    }
  }

  egresoOrigen(e: EgresoRegistrado): string {
    return e.pagoProyectadoId != null ? 'Pagos Proyectados' : 'Contabilidad';
  }

  egresoRetenciones(e: EgresoRegistrado): number {
    return Number(e.reteFuente ?? 0) + Number(e.reteIca ?? 0);
  }

  egresoNeto(e: EgresoRegistrado): number {
    return Number(e.valorNetoPagar ?? e.valor ?? 0);
  }

  /** Tesorería envía el egreso a aprobación de Gerencia Financiera. */
  enviarAGerenciaFinanciera(e: EgresoRegistrado): void {
    if (!e.id || this.enviandoAprobacionId()) return;
    if (!confirm(`¿Enviar el egreso ${e.numeroEgreso || e.numeroFactura} a aprobación de Gerencia Financiera?`)) return;
    this.enviandoAprobacionId.set(e.id);
    this.controlEgresosService.enviarARevision(e.id).pipe(
      finalize(() => { this.enviandoAprobacionId.set(null); this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.snackBar.open('Egreso enviado a aprobación de Gerencia Financiera', 'Cerrar', { duration: 4000 });
        this.loadEgresosContador();
      },
      error: (err) => this.snackBar.open(
        err?.error?.detail || err?.error?.message || 'No se pudo enviar el egreso a aprobación',
        'Cerrar',
        { duration: 5000 },
      ),
    });
  }

  /** Verifica en tesorería que el egreso no esté duplicado */
  verificarDuplicadoEgreso(e: EgresoRegistrado): void {
    if (!e.id || !e.numeroFactura || !e.nitProveedor || !e.valor || !e.fecha) return;
    this.dupVerificacion.set(e.id, 'checking');
    this.controlEgresosService
      .checkDuplicado(e.numeroFactura, e.nitProveedor, Number(e.valor), e.fecha)
      .subscribe({
        next: (res) => {
          // Existe al menos el propio registro: duplicado solo si hay OTRO distinto.
          // Si el egreso no tiene id (nuevo sin guardar) y algo coincide, es duplicado.
          const otroDistinto =
            res.existe && (e.id == null || res.registro?.id == null || res.registro.id !== e.id);
          this.dupVerificacion.set(e.id!, otroDistinto ? 'dup' : 'ok');
          this.cdr.markForCheck();
        },
        error: () => {
          this.dupVerificacion.delete(e.id!);
          this.cdr.markForCheck();
        },
      });
  }

  getDupEstado(e: EgresoRegistrado): 'checking' | 'ok' | 'dup' | null {
    if (!e.id) return null;
    return this.dupVerificacion.get(e.id) ?? null;
  }

  // ── KPIs vista Egresos de Tesorería ──

  get egresosVerificadosCount(): number {
    return this.egresosFiltrados().filter(
      (e) => e.id != null && this.dupVerificacion.get(e.id) === 'ok',
    ).length;
  }

  get egresosDuplicadosCount(): number {
    return this.egresosFiltrados().filter(
      (e) => e.id != null && this.dupVerificacion.get(e.id) === 'dup',
    ).length;
  }

  navegarTramitarEgreso(e: EgresoRegistrado): void {
    this.router.navigate(['/tesoreria/tramitar-pago', e.id], {
      queryParams: { tipo: 'egreso-contador' },
      state: {
        tipo: 'egreso-contador',
        egresoData: e,
      },
    });
  }

  /** Aprobado por Gerencia Financiera: pasa al módulo Tesorería para el pago. */
  irAPagar(e: EgresoRegistrado): void {
    if (!e.id) return;
    this.router.navigate(['/tesoreria/pagos'], { queryParams: { egreso: e.id } });
  }

  toggleMenu(id: number | null, event?: MouseEvent): void {
    if (this.openMenuId() === id) {
      this.openMenuId.set(null);
    } else {
      if (event) {
        event.stopPropagation();
        const button = (event.currentTarget as HTMLElement);
        const rect = button.getBoundingClientRect();
        const menuWidth = 192;
        const menuHeight = 160;
        let top = rect.bottom + 4;
        let left = rect.right - menuWidth;
        // Prevent menu from going off-screen
        if (left < 8) left = 8;
        if (top + menuHeight > window.innerHeight) {
          top = rect.top - menuHeight - 4;
        }
        this.menuPosition.set({ top, left });
      }
      this.openMenuId.set(id);
    }
  }

  getOpenMenuRow(): MovimientoBancario | null {
    const id = this.openMenuId();
    if (id === null) return null;
    return this.filteredMovimientos.find(m => m.id === id) ?? null;
  }

  onVerDetalle(row: MovimientoBancario): void {
    this.abrirDetalleModal(row.id);
  }

  onAbrirControlDiario(row: MovimientoBancario): void {
    this.controlDiarioMovimiento = row;
    this.controlDiarioModalOpen = true;
    this.cdr.markForCheck();
  }

  verArchivoEstado(url: string | null, titulo: string): void {
    if (!url) return;
    const safeUrl = this.normalizeDocumentUrl(url);
    this.archivoModalTitulo = titulo;
    this.archivoModalArchivos = [{ nombre: titulo, url: safeUrl, tipo: '' }];
    this.archivoModalTabActiva = 0;
    this.archivoModalUrl = this.sanitizer.bypassSecurityTrustResourceUrl(safeUrl);
    this.archivoModalOpen = true;
    this.cdr.markForCheck();
  }

  /** Abrir modal con múltiples archivos en pestañas */
  verArchivosConTabs(archivos: ArchivoAdjunto[], titulo: string): void {
    if (!archivos || archivos.length === 0) return;
    const archivosNormalizados = this.normalizeAdjuntos(archivos);
    this.archivoModalTitulo = titulo;
    this.archivoModalArchivos = archivosNormalizados;
    this.archivoModalTabActiva = 0;
    this.archivoModalUrl = this.sanitizer.bypassSecurityTrustResourceUrl(archivosNormalizados[0].url);
    this.archivoModalOpen = true;
    this.cdr.markForCheck();
  }

  /** Cambiar pestaña activa en el modal de archivos */
  cambiarTabArchivo(index: number): void {
    if (index < 0 || index >= this.archivoModalArchivos.length) return;
    this.archivoModalTabActiva = index;
    const tabUrl = this.normalizeDocumentUrl(this.archivoModalArchivos[index].url);
    this.archivoModalUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      tabUrl
    );
    this.cdr.markForCheck();
  }

  cerrarArchivoModal(): void {
    this.archivoModalOpen = false;
    this.archivoModalUrl = null;
    this.archivoModalTitulo = '';
    this.archivoModalArchivos = [];
    this.archivoModalTabActiva = 0;
    this.cdr.markForCheck();
  }

  cerrarDetalleModal(): void {
    this.detalleModalOpen = false;
    this.detalleData = null;
    this.detalleOcCodigo = '';
  }

  vincularOcDesdeModal(): void {
    const movimientoId = this.detalleData?.movimiento.id;
    if (!movimientoId || !this.detalleOcCodigo.trim()) {
      this.snackBar.open('Ingresa un codigo OC valido', 'Cerrar', { duration: 2200 });
      return;
    }

    this.tesoreriaService.vincularOc(movimientoId, this.detalleOcCodigo.trim()).subscribe({ next: (result) => {
      this.snackBar.open(result.mensaje, 'Cerrar', { duration: 2300 });
      this.abrirDetalleModal(movimientoId);
    }, error: (error: any) => {  this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); } });
  }

  generarEgresoDesdeModal(): void {
    const movimiento = this.detalleData?.movimiento;
    if (!movimiento) {
      return;
    }

    this.tesoreriaService
      .generarEgreso({
        movimientoId: movimiento.id,
        proveedor: movimiento.empresaUt,
        valor: movimiento.valor,
        observaciones: `Generado desde detalle modal para ${movimiento.referencia}`,
      })
      .subscribe({ next: (egreso) => {
        this.abrirVistaPreviaPdf(egreso, movimiento);
        this.snackBar.open(`Egreso ${egreso.numeroEgreso} generado. Revisa y descarga el PDF`, 'Cerrar', { duration: 2300 });
        this.abrirDetalleModal(movimiento.id);
      }, error: (error: any) => {  this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); } });
  }

  cerrarPdfPreview(): void {
    this.pdfPreviewOpen = false;
    this.pdfDraft = null;
    this.pdfEgreso = null;
    this.pdfMovimiento = null;
    this.cdr.markForCheck();
  }

  cerrarControlDiarioModal(): void {
    this.controlDiarioModalOpen = false;
    this.controlDiarioMovimiento = null;
    this.cdr.markForCheck();
  }

  descargarPdfPreview(): void {
    if (!this.pdfDraft || !this.pdfEgreso || !this.pdfMovimiento) {
      return;
    }

    this.egresoPdfService
      .generarPdf({
        egreso: this.pdfEgreso,
        movimiento: this.pdfMovimiento,
        draft: this.pdfDraft,
      })
      .then(() => {
        this.snackBar.open('PDF descargado correctamente', 'Cerrar', { duration: 2200 });
      })
      .catch(() => {
        this.snackBar.open('No fue posible descargar el PDF', 'Cerrar', { duration: 2500 });
      });
  }

  marcarConciliadoDesdeModal(): void {
    const movimientoId = this.detalleData?.movimiento.id;
    if (!movimientoId) {
      return;
    }

    this.tesoreriaService.marcarConciliadoManual(movimientoId).subscribe({ next: (result) => {
      this.snackBar.open(result.mensaje, 'Cerrar', { duration: 2300 });
      this.abrirDetalleModal(movimientoId);
    }, error: (error: any) => {  this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); } });
  }

  /** Navega al calendario de pagos */
  navegarCalendario(): void {
    this.router.navigate(['/tesoreria/calendario-pagos']);
  }

  /** Navega al módulo de tramitar pago (para movimientos bancarios) */
  onTramitar(row: MovimientoBancario): void {
    // For Solicitud Compra rows, pass tramite data in navigation state
    const navigationExtras: any = {};
    if ((row as any).tramiteData) {
      navigationExtras.state = { tramiteData: (row as any).tramiteData };
    }
    this.router.navigate(['/tesoreria/tramitar-pago', row.id], navigationExtras);
  }

  loadData(): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.tesoreriaService
      .getMovimientosPendientes({ pageIndex: 0, pageSize: 100 })
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (result) => {
          this.movimientos = result.data;
          this.filteredMovimientos = result.data;
          if (result.data && result.data.length > 0) {
            if (this.bancos.length === 0) {
              this.bancos = [...new Set(result.data.map((item) => item.banco).filter(Boolean))].sort();
            }
            if (this.empresasUt.length === 0) {
              this.empresasUt = [...new Set(result.data.map((item) => item.empresaUt).filter(Boolean))].sort();
            }
          } else {
            if (this.bancos.length === 0) {
              this.tesoreriaService.getBancos().subscribe({
                next: (bancos) => { this.bancos = bancos; this.cdr.markForCheck(); },
                error: (error: any) => { this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); }
              });
            }
            if (this.empresasUt.length === 0) {
              this.tesoreriaService.getEmpresasUt().subscribe({
                next: (empresasUt) => { this.empresasUt = empresasUt; this.cdr.markForCheck(); },
                error: (error: any) => { this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); }
              });
            }
          }
          this.cdr.markForCheck();
          // After movimientos load, fetch and merge tramites from contabilidad
          this.loadTramitesTesoreria();
        },
        error: (error: any) => {
          this.movimientos = [];
          this.filteredMovimientos = [];
          this.loadTramitesTesoreria();
          this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500});
          this.cdr.markForCheck();
        }
      });
  }

  private abrirDetalleModal(movimientoId: number): void {
    this.detalleModalOpen = true;
    this.detalleLoading = true;
    this.detalleData = null;
    this.detalleOcCodigo = '';
    this.cdr.markForCheck();

    this.tesoreriaService
      .getDetalleConciliacion(movimientoId)
      .pipe(
        finalize(() => {
          this.detalleLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (detalle) => {
          this.detalleData = detalle;
          if (!detalle) {
            this.snackBar.open('No se encontro detalle para este movimiento', 'Cerrar', {
              duration: 2400, 
            });
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.detalleData = null;
          this.snackBar.open('No fue posible cargar el detalle', 'Cerrar', {
            duration: 2600,
          });
          this.cdr.markForCheck();
        },
      });
  }

  private abrirVistaPreviaPdf(egreso: Egreso, movimiento: MovimientoBancario): void {
    this.pdfEgreso = egreso;
    this.pdfMovimiento = movimiento;
    this.pdfDraft = this.egresoPdfService.crearDraft(egreso, movimiento);
    this.pdfPreviewOpen = true;
    this.cdr.markForCheck();
  }

  private normalizeAdjuntos(archivos: ArchivoAdjunto[] | null | undefined): ArchivoAdjunto[] {
    if (!Array.isArray(archivos) || archivos.length === 0) {
      return [];
    }

    return archivos.map((archivo) => ({
      ...archivo,
      url: this.normalizeDocumentUrl(archivo.url),
    }));
  }

  private normalizeDocumentUrl(url: string | null | undefined): string {
    const value = (url || '').trim();
    if (!value) {
      return '';
    }

    // Already absolute URL (http, https, data, blob)
    if (/^(https?:|data:|blob:)/i.test(value)) {
      return value;
    }

    // Protocol-relative URL
    if (value.startsWith('//')) {
      return `https:${value}`;
    }

    // Fallback if no backend base is configured
    if (!this.backendApiBase) {
      return value;
    }

    // URL already includes /api/ — just prepend origin
    if (value.startsWith('/api/')) {
      const origin = this.resolveBackendOrigin();
      return origin ? `${origin}${value}` : value;
    }

    // Relative path starting with / (local files) — use file download endpoint
    if (value.startsWith('/')) {
      // Remove leading slash for the path parameter
      const pathParam = value.substring(1);
      return `${this.backendApiBase}/files/download?path=${encodeURIComponent(pathParam)}`;
    }

    // Relative path without / — use file download endpoint
    return `${this.backendApiBase}/files/download?path=${encodeURIComponent(value)}`;
  }

  private resolveBackendApiBase(): string {
    const fallbackBase = typeof window !== 'undefined' ? `${window.location.origin}/api` : '';

    try {
      if (!environment.apiUrl) {
        return fallbackBase;
      }
      return environment.apiUrl.replace(/\/$/, '');
    } catch {
      return fallbackBase;
    }
  }

  private resolveBackendOrigin(): string {
    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : '';

    try {
      if (!environment.apiUrl) {
        return fallbackOrigin;
      }
      return new URL(environment.apiUrl, fallbackOrigin || 'http://localhost').origin;
    } catch {
      return fallbackOrigin;
    }
  }
}
