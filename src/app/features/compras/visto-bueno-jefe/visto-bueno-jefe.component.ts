import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { trigger, transition, style, animate, keyframes, state } from '@angular/animations';
import { Observable, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { TramitarRequisicionService } from '../tramitar-requisicion/services/tramitar-requisicion.service';
import {
  TramiteRequisicion,
  OrdenCompraCargada,
  ProveedorTramite,
} from '../tramitar-requisicion/models/tramitar-requisicion.model';
import { ComprasService } from '../services/compras.service';
import { OtpService } from '../services/otp.service';
import { SolicitudCompra, calcularSemaforo } from '../models/compra.model';
import { ProveedorService } from '../../proveedores/services/proveedor.service';
import { environment } from 'src/environments/environment';
import { Proveedor } from '../../proveedores/models/proveedor.model';

type DecisionType = 'APROBADO' | 'RECHAZADO' | 'ACEPTADO_CON_NOVEDAD' | null;

export const MOTIVOS_RECHAZO = [
  'Supera presupuesto',
  'Solicitud incompleta o mal diligenciada',
  'Incumplimiento de la política de compras',
  'Problema o desacuerdo con el proveedor',
  'Incumplimiento por parte del proveedor',
  'Precio o condiciones no competitivas',
  'Duplicidad o compra innecesaria',
  'Riesgos legales o contractuales',
];

const TIPO_REQ_LABELS: Record<string, string> = {
  MANTENIMIENTO: 'Mantenimiento',
  VIATICOS: 'Viáticos',
  MATERIA_PRIMA: 'Materia Prima',
  FUMIGACION: 'Fumigación',
  PRESUPUESTO: 'Presupuesto',
  COMPRA_INSUMOS: 'Compra de Insumos',
  SERVICIOS_GENERALES: 'Servicios Generales',
  COMPRA_HARDWARE: 'Compra de Hardware',
  DOTACION: 'Dotación',
  MESA_AYUDA: 'Mesa de Ayuda',
  OTRO: 'Otro',
};

interface HojaExcel {
  nombre: string;
  encabezados: string[];
  filas: string[][];
  totalFilas: number;
}

interface ArchivoOCR {
  nombre: string;
  tamano: string;
  hojas: HojaExcel[];
  kvPairs: { key: string; value: string }[];
  hojaActiva: number;
}

interface DatosOCR {
  archivos: ArchivoOCR[];
  fechaEntrega?: string;
  fechaFinalizacion?: string;
}

interface TramiteComparativoRow {
  codigo: string;
  producto: string;
  cantidad: number | null;
  kg: number | null;
  valorUnitario?: number | null;
  valor: number | null;
}

// ═══ Interfaces para comparación SIIGO ═══
interface ProductoComparativo {
  codigo: string | null;
  producto: string;
  cantidad: number | null;
  kg: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
}

interface DocumentoSiigoParsed {
  numeroDocumento: string | null;
  proveedor: string | null;
  nit: string | null;
  fecha: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  productos: ProductoComparativo[];
  textoPlano: string | null;
}

interface DiscrepanciaItem {
  campo: string;
  valorOC: string | null;
  valorSiigo: string | null;
  tipo: 'CRITICA' | 'ADVERTENCIA' | 'INFO';
  diferencia: number | null;
  porcentajeDiferencia: number | null;
}

interface ProductoMatch {
  productoOC: ProductoComparativo | null;
  productoSiigo: ProductoComparativo | null;
  coincide: boolean;
  estado: 'COINCIDE' | 'DIFERENTE' | 'SOLO_OC' | 'SOLO_SIIGO';
  diferencias: string[];
}

interface ResultadoComparacion {
  coincide: boolean;
  totalDiscrepancias: number;
  diferenciaTotalValor: number;
  porcentajeDiferenciaTotal: number;
  discrepancias: DiscrepanciaItem[];
  matchProductos: ProductoMatch[];
  documentoSiigo: DocumentoSiigoParsed;
}

@Component({
  selector: 'app-visto-bueno-jefe',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './visto-bueno-jefe.component.html',
  styleUrls: ['./visto-bueno-jefe.component.scss'],
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate(
          '0.35s ease-out',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '0.2s ease-in',
          style({ opacity: 0, transform: 'translateY(-10px)' }),
        ),
      ]),
    ]),
    trigger('modalAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(40px) scale(0.95)' }),
        animate(
          '0.35s cubic-bezier(0.33, 1, 0.68, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '0.2s ease-in',
          style({ opacity: 0, transform: 'translateY(20px) scale(0.95)' }),
        ),
      ]),
    ]),
    trigger('alertSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-12px)' }),
        animate('0.3s 0.1s ease-out', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('0.3s ease-out', style({ opacity: 1 })),
      ]),
    ]),
  ],
})
export class VistoBuenoJefeComponent implements OnInit, OnDestroy {
  tramite = signal<TramiteRequisicion | null>(null);
  solicitud = signal<SolicitudCompra | null>(null);
  loading = signal(true);
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  // Unified collapsible section
  requisicionExpanded = signal(false);

  // Decision state
  decision = signal<DecisionType>(null);
  observaciones = signal('');
  novedades = signal('');
  motivoRechazo = signal('');
  causacionNovedad = signal('');
  showConfirmModal = signal(false);
  submitting = signal(false);

  // Destination selector when approving
  destinoAprobacion = signal<'CONTABILIDAD' | 'CADENA_SUMINISTROS'>('CONTABILIDAD');

  // OTP verification
  showOtpModal = signal(false);
  otpCodigo = signal('');
  otpSending = signal(false);
  otpVerifying = signal(false);
  otpEmailMasked = signal('');
  otpError = signal('');
  otpResendCooldown = signal(0);
  private otpTimer: ReturnType<typeof setInterval> | null = null;

  // View order modal
  showViewModal = signal(false);
  selectedOrden = signal<OrdenCompraCargada | null>(null);
  pdfUrl = signal<SafeResourceUrl | null>(null);
  private currentBlobUrl: string | null = null;

  // Modal tabs (matching paso4 premium modal)
  showPreviewTab = signal(false);
  showFacturaPreviewTab = signal(false);
  showCreditTab = signal(false);
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewType = signal<'pdf' | 'image' | 'unsupported'>('unsupported');
  facturaPreviewUrl = signal<SafeResourceUrl | null>(null);
  facturaPreviewType = signal<'pdf' | 'image' | 'unsupported'>('unsupported');
  private rawPreviewUrl: string | null = null;
  private rawFacturaPreviewUrl: string | null = null;

  // Cards / Table toggle
  vistaDocumentos = signal<'cards' | 'tabla'>('cards');

  // Table expandable rows
  expandedOrdenIds = signal<Set<string>>(new Set());

  // Datos Específicos del Requerimiento (datosAdicionales)
  datosAdicionalesParsed = signal<Record<string, any> | null>(null);
  isOCRData = signal(false);
  datosOCR = signal<DatosOCR | null>(null);
  archivoExpandido = signal<number>(0);
  hojasActivas = signal<Record<number, number>>({});
  busquedas = signal<Record<number, string>>({});
  vistas = signal<Record<number, 'resumen' | 'detalle'>>({});
  sortColumn = signal<Record<number, number>>({});
  sortDirection = signal<Record<number, 'asc' | 'desc'>>({});

  // Document image modal
  showDocImageModal = signal(false);
  docModalImageUrl = signal('');
  docModalImageTitle = signal('');

  // Contexto Cadena de Suministros vs Compras
  esCadenaSuministros = signal(false);

  // Tramitar modal (solo para Cadena de Suministros)
  showTramitarModal = signal(false);
  tramitarModo = signal<'SIIGO' | 'MANUAL'>('SIIGO');
  tramitarOrden = signal<OrdenCompraCargada | null>(null);
  tablaOcRows = signal<TramiteComparativoRow[]>([]);
  tablaValidacionRows = signal<TramiteComparativoRow[]>([]);

  // SIIGO upload & comparison
  siigoFile = signal<File | null>(null);
  siigoFileName = signal('');
  siigoUploading = signal(false);
  siigoAnalyzing = signal(false);
  siigoAnalyzingProgress = signal(0);
  siigoError = signal('');
  siigoDragOver = signal(false);
  comparisonResult = signal<ResultadoComparacion | null>(null);
  comparisonDone = signal(false);
  showDiscrepancyDetail = signal(false);
  matchPercentage = signal(0);

  // Proveedores
  proveedoresSistema = signal<Proveedor[]>([]);
  showProveedorModal = signal(false);
  proveedorModalOrdenId = signal<string | null>(null);
  proveedorBusqueda = signal('');
  actualizandoProveedor = signal(false);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private tramiteService: TramitarRequisicionService,
    private comprasService: ComprasService,
    private otpService: OtpService,
    private proveedorService: ProveedorService,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    const solicitudId = this.route.snapshot.paramMap.get('solicitudId');
    this.esCadenaSuministros.set(
      this.router.url.startsWith('/cadena-suministros'),
    );

    if (solicitudId) {
      this.cargarTramite(+solicitudId);
      this.cargarSolicitud(+solicitudId);
    } else {
      this.router.navigate(['/compras/bandeja-visto-bueno']);
    }
  }

  toggleRequisicionExpanded(): void {
    this.requisicionExpanded.update((v) => !v);
  }

  // ── Comparativa Planeación vs OC ──
  get comparativa(): any | null {
    return this.tramite()?.comparativaPlaneacionOc ?? null;
  }

  step1Expanded = signal(true);
  step2Expanded = signal(true);
  comparativaExpanded = signal(true);
  toggleStep1Expanded(): void {
    this.step1Expanded.update((v) => !v);
  }
  toggleStep2Expanded(): void {
    this.step2Expanded.update((v) => !v);
  }
  toggleComparativaExpanded(): void {
    this.comparativaExpanded.update((v) => !v);
  }

  getParsedItems(descripcion: string | undefined): { codigo: string; producto: string; cantidad: number; unidadMedida: string; valorUnitario: number; valorTotal: number }[] {
    if (!descripcion) return [];
    try {
      const parsed = JSON.parse(descripcion);
      if (parsed?.__items && Array.isArray(parsed.__items)) return parsed.__items;
    } catch { /* plain text */ }
    return [];
  }

  // ── Comparativa helper methods ──
  formatMoney(value: number): string {
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }

  getCpoStatusClass(estado: string): string {
    const map: Record<string, string> = {
      COINCIDE: 'status--coincide', DIFERENTE: 'status--diferente',
      SOLO_PLAN: 'status--solo-plan', SOLO_OC: 'status--solo-oc'
    };
    return map[estado] || '';
  }

  getCpoStatusLabel(estado: string): string {
    const map: Record<string, string> = {
      COINCIDE: 'Coincide', DIFERENTE: 'Diferencias',
      SOLO_PLAN: 'Solo Planeación', SOLO_OC: 'Solo en OC'
    };
    return map[estado] || estado;
  }

  getComparativaPlanCount(): number {
    return this.comparativa?.matchProductos?.filter((m: any) => m.productoPlaneacion).length ?? 0;
  }

  getComparativaOCCount(): number {
    return this.comparativa?.matchProductos?.filter((m: any) => m.productoOC).length ?? 0;
  }

  getComparativaCoberturaItems(): number {
    const plan = this.getComparativaPlanCount();
    if (plan === 0) return 0;
    return Math.min(100, (this.getComparativaOCCount() / plan) * 100);
  }

  getComparativaCoberturaPrecio(): number {
    const plan = this.comparativa?.totalPlaneacion ?? 0;
    if (plan === 0) return 0;
    return Math.min(100, ((this.comparativa?.totalOC ?? 0) / plan) * 100);
  }

  getComparativaDiferencia(): number {
    return (this.comparativa?.totalOC ?? 0) - (this.comparativa?.totalPlaneacion ?? 0);
  }

  getComparativaPctDiferencia(): number {
    const plan = this.comparativa?.totalPlaneacion ?? 0;
    if (plan === 0) return 0;
    return (this.getComparativaDiferencia() / plan) * 100;
  }

  getComparativaGaugeColor(): string {
    const pct = this.comparativa?.porcentajeCoincidencia ?? 0;
    if (pct >= 90) return '#10b981';
    if (pct >= 60) return '#f59e0b';
    return '#ef4444';
  }

  getComparativaIncompletos(): any[] {
    return this.comparativa?.matchProductos?.filter((m: any) => m.productoPlaneacion && m.porcentajeCumplimiento < 100) ?? [];
  }

  ngOnDestroy(): void {
    this.revokeBlobUrl();

    if (this.otpTimer) {
      clearInterval(this.otpTimer);
      this.otpTimer = null;
    }
  }

  private cargarTramite(solicitudId: number): void {
    this.loading.set(true);
    this.tramiteService.getTramiteBySolicitudId(solicitudId).subscribe({
      next: (tramite) => {
        this.tramite.set(tramite);
        this.loading.set(false);
        // Reconcile order IDs with the authoritative OrdenCompra table
        if (tramite && tramite.id && tramite.ordenesCargadas.length) {
          this.reconciliarOrdenesIds(tramite.id);
        }
      },
      error: () => {
        this.displayToast('Error al cargar el trámite', 'error');
        this.loading.set(false);
      },
    });
  }

  /**
   * Reconciles order IDs stored in ordenesCargadasJson with the canonical
   * IDs in the OrdenCompra table (GET .../ordenes). Fixes mismatches caused
   * by re-uploading files that generated new client-side IDs.
   */
  private reconciliarOrdenesIds(tramiteId: number): void {
    this.tramiteService.getOrdenesFromBackend(tramiteId).subscribe({
      next: (backendOrdenes) => {
        if (!backendOrdenes.length) return;
        this.tramite.update((t) => {
          if (!t) return t;
          const updated = t.ordenesCargadas.map((o) => {
            // Match by filename to find the canonical order in the DB
            const match = backendOrdenes.find(
              (b) => b.nombreArchivo === o.nombreArchivo,
            );
            if (!match) return o;
            return {
              ...o,
              id: match.id,
              archivoUrl: match.archivoUrl || o.archivoUrl,
            };
          });
          return { ...t, ordenesCargadas: updated };
        });
      },
    });
  }

  private cargarSolicitud(solicitudId: number): void {
    this.comprasService.getSolicitudById(solicitudId).subscribe({
      next: (sol) => {
        this.solicitud.set(sol);
        this.parseDatosAdicionales((sol as any).datosAdicionales);
        this.enrichRequisicionFromSolicitud(sol);
      },
      error: () => {
        // Fallback: load from list
        this.comprasService.getSolicitudes().subscribe({
          next: (solicitudes) => {
            const sol = solicitudes.find((s) => s.id === solicitudId);
            if (sol) {
              this.solicitud.set(sol);
              this.parseDatosAdicionales((sol as any).datosAdicionales);
              this.enrichRequisicionFromSolicitud(sol);
            }
          },
        });
      },
    });
  }

  /**
   * Merges extended fields from the SolicitudCompra into the tramite's
   * requisicion object so the template can reference them consistently.
   */
  private enrichRequisicionFromSolicitud(sol: SolicitudCompra): void {
    this.tramite.update((t) => {
      if (!t) return t;
      return {
        ...t,
        requisicion: {
          ...t.requisicion,
          fecha: t.requisicion.fecha || sol.fechaSolicitud || '',
          cargo: t.requisicion.cargo || sol.cargo,
          correoElectronico: t.requisicion.correoElectronico || sol.correoElectronico,
          telefonoContacto: t.requisicion.telefonoContacto || sol.telefonoContacto,
          tipoRequerimiento: t.requisicion.tipoRequerimiento || sol.tipoRequerimiento,
          otroRequerimiento: t.requisicion.otroRequerimiento || sol.otroRequerimiento,
          esCompra: t.requisicion.esCompra ?? sol.esCompra,
          empresaCentroCostos: t.requisicion.empresaCentroCostos || sol.empresaCentroCostos,
          evidenciaUrl: t.requisicion.evidenciaUrl || sol.evidenciaUrl,
          vistoBuenoUrl: t.requisicion.vistoBuenoUrl || sol.vistoBuenoUrl,
          datosAdicionales: t.requisicion.datosAdicionales || sol.datosAdicionales,
          estado: t.requisicion.estado || (sol.estado as string),
          creadoPor: t.requisicion.creadoPor || sol.creadoPor,
          fechaCreacion: t.requisicion.fechaCreacion || sol.fechaCreacion,
        },
      };
    });
  }

  private parseDatosAdicionales(raw: string | undefined): void {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      this.datosAdicionalesParsed.set(parsed);
      if (parsed?.datosOCR) {
        try {
          const ocrData: DatosOCR =
            typeof parsed.datosOCR === 'string'
              ? JSON.parse(parsed.datosOCR)
              : parsed.datosOCR;
          if (ocrData.archivos && ocrData.archivos.length > 0) {
            this.isOCRData.set(true);
            this.datosOCR.set(ocrData);
          }
        } catch {
          /* not OCR data */
        }
      }
    } catch {
      this.datosAdicionalesParsed.set(null);
    }
  }

  // ═══ KPIs ═══
  get totalOrdenes(): number {
    return this.tramite()?.ordenesCargadas?.length ?? 0;
  }

  get totalGeneral(): number {
    return (
      this.tramite()?.ordenesCargadas?.reduce((s, o) => s + o.valorTotal, 0) ??
      0
    );
  }

  get totalSubtotal(): number {
    return (
      this.tramite()?.ordenesCargadas?.reduce(
        (s, o) => s + o.valorAntesIva,
        0,
      ) ?? 0
    );
  }

  get totalIVA(): number {
    return (
      this.tramite()?.ordenesCargadas?.reduce((s, o) => s + o.valorIva, 0) ?? 0
    );
  }

  get conteoContado(): number {
    return (
      this.tramite()?.ordenesCargadas?.filter((o) => o.tipoPago === 'CONTADO')
        .length ?? 0
    );
  }

  get conteoCredito(): number {
    return (
      this.tramite()?.ordenesCargadas?.filter((o) => o.tipoPago === 'CREDITO')
        .length ?? 0
    );
  }

  get conteoContraEntrega(): number {
    return (
      this.tramite()?.ordenesCargadas?.filter(
        (o) => o.tipoPago === 'CONTRA_ENTREGA',
      ).length ?? 0
    );
  }

  get ocsSinTipoPago(): number {
    return (
      this.tramite()?.ordenesCargadas?.filter((o) => !o.tipoPago).length ?? 0
    );
  }

  get promedioConfianza(): number {
    const ordenes = this.tramite()?.ordenesCargadas ?? [];
    const completadas = ordenes.filter(
      (o) => o.estadoEscaneo === 'completado' && o.confianzaOCR > 0,
    );
    if (!completadas.length) return 0;
    return Math.round(
      completadas.reduce((s, o) => s + o.confianzaOCR, 0) / completadas.length,
    );
  }

  get totalDocFacturacion(): number {
    return (
      this.tramite()
        ?.ordenesCargadas?.filter(
          (o) => o.tipoPago === 'CONTADO' && o.facturaValorTotal,
        )
        .reduce((s, o) => s + (o.facturaValorTotal || 0), 0) ?? 0
    );
  }

  // ═══ Table Expand / Collapse ═══
  toggleOrdenExpand(id: string): void {
    const current = new Set(this.expandedOrdenIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.expandedOrdenIds.set(current);
  }

  isOrdenExpanded(id: string): boolean {
    return this.expandedOrdenIds().has(id);
  }

  expandAllOrdenes(): void {
    const ordenes = this.tramite()?.ordenesCargadas ?? [];
    this.expandedOrdenIds.set(new Set(ordenes.map((o) => o.id)));
  }

  collapseAllOrdenes(): void {
    this.expandedOrdenIds.set(new Set());
  }

  // ═══ PROVEEDORES ═══

  /** Gets enriched provider info from the trámite's proveedores array */
  getProveedorInfo(ordenId: string): ProveedorTramite | undefined {
    return this.tramite()?.proveedores?.find(
      (p) => p.ordenCompraId === ordenId,
    );
  }

  /** Count of OCs pending provider selection */
  get ocsSinProveedorValidado(): number {
    const proveedores = this.tramite()?.proveedores;
    if (!proveedores || proveedores.length === 0) return 0;
    return proveedores.filter((p) => p.requiereSeleccionProveedor).length;
  }

  /** Load providers catalog for selector */
  cargarProveedoresSistema(): void {
    if (this.proveedoresSistema().length > 0) return;
    this.proveedorService.getProveedores().subscribe({
      next: (data) => this.proveedoresSistema.set(data || []),
      error: () => this.proveedoresSistema.set([]),
    });
  }

  get proveedoresActivos(): Proveedor[] {
    return this.proveedoresSistema().filter((p) => p.estado !== 'INACTIVO');
  }

  get proveedoresFiltrados(): Proveedor[] {
    const q = this.proveedorBusqueda().toLowerCase().trim();
    if (!q) return this.proveedoresActivos;
    return this.proveedoresActivos.filter(
      (p) =>
        p.nombreProveedor.toLowerCase().includes(q) ||
        (p.nit && p.nit.toLowerCase().includes(q)),
    );
  }

  openProveedorModal(ordenId: string): void {
    this.proveedorModalOrdenId.set(ordenId);
    this.proveedorBusqueda.set('');
    this.cargarProveedoresSistema();
    this.showProveedorModal.set(true);
  }

  closeProveedorModal(): void {
    this.showProveedorModal.set(false);
    this.proveedorModalOrdenId.set(null);
    this.proveedorBusqueda.set('');
  }

  seleccionarProveedor(proveedor: Proveedor): void {
    const ordenId = this.proveedorModalOrdenId();
    const tramiteId = this.tramite()?.id;
    if (!ordenId || !tramiteId || !proveedor.id) return;

    this.actualizandoProveedor.set(true);
    this.tramiteService
      .actualizarProveedorOrden(tramiteId, ordenId, {
        proveedorId: proveedor.id,
        proveedorNombreFinal: proveedor.nombreProveedor,
      })
      .subscribe({
        next: (result) => {
          // Refresh the trámite to get updated proveedores array
          this.tramiteService
            .getTramiteBySolicitudId(this.tramite()!.solicitudCompraId)
            .subscribe({
              next: (t) => {
                if (t) this.tramite.set(t);
                this.actualizandoProveedor.set(false);
                this.closeProveedorModal();
                this.displayToast(
                  'Proveedor asignado correctamente',
                  'success',
                );
              },
              error: () => {
                this.actualizandoProveedor.set(false);
                this.closeProveedorModal();
              },
            });
        },
        error: () => {
          this.actualizandoProveedor.set(false);
          this.displayToast('Error al asignar el proveedor', 'error');
        },
      });
  }

  private resolveFacturaUrl(
    orden: OrdenCompraCargada,
  ): Observable<string | null> {
    // Only use direct URL if it's already a presigned URL (contains X-Amz- params)
    if (
      typeof orden.facturaArchivo === 'string' &&
      orden.facturaArchivo.startsWith('http') &&
      orden.facturaArchivo.includes('X-Amz-')
    ) {
      return of(orden.facturaArchivo);
    }
    // Always fetch a presigned URL from backend (raw S3 URLs return 403)
    const tramiteId = this.tramite()?.id;
    if (!tramiteId) return of(null);
    return this.tramiteService.getPresignedUrlFactura(tramiteId, orden.id).pipe(
      map((res) => res.url || null),
      catchError(() =>
        // ID mismatch: try to find the correct order from backend
        this.tramiteService.getOrdenesFromBackend(tramiteId).pipe(
          switchMap((backendOrdenes) => {
            const match = backendOrdenes.find(
              (b) => b.nombreArchivo === orden.nombreArchivo,
            );
            if (!match) return of(null);
            return this.tramiteService
              .getPresignedUrlFactura(tramiteId, match.id)
              .pipe(
                map((res) => res.url || null),
                catchError(() => of(null)),
              );
          }),
          catchError(() => of(null)),
        ),
      ),
    );
  }

  readonly MOTIVOS_RECHAZO = MOTIVOS_RECHAZO;

  // ═══ Decision Actions ═══
  selectDecision(type: DecisionType): void {
    this.decision.set(type);
    this.motivoRechazo.set('');
    this.causacionNovedad.set('');
    this.observaciones.set('');
    this.novedades.set('');
  }

  openConfirmModal(): void {
    if (!this.decision()) {
      this.displayToast(
        'Seleccione una decisión antes de continuar',
        'warning',
      );
      return;
    }
    if (this.decision() === 'RECHAZADO' && !this.motivoRechazo().trim()) {
      this.displayToast('Seleccione el motivo del rechazo', 'warning');
      return;
    }
    if (
      this.decision() === 'ACEPTADO_CON_NOVEDAD' &&
      !this.causacionNovedad().trim()
    ) {
      this.displayToast('Seleccione la causación de la novedad', 'warning');
      return;
    }
    this.showConfirmModal.set(true);
  }

  cancelConfirm(): void {
    this.showConfirmModal.set(false);
  }

  // ═══ OTP Verification ═══

  /**
   * Called when user confirms their decision in the confirmation modal.
   * For approval/accept-with-novelty, requests OTP first.
   * For rejection, submits directly.
   */
  confirmAndStartOtp(): void {
    const dec = this.decision();
    if (!environment.enableOtpVerification) {
      this.showConfirmModal.set(false);
      this.submitDecision();
      return;
    }
    if (dec === 'APROBADO' || dec === 'ACEPTADO_CON_NOVEDAD') {
      this.showConfirmModal.set(false);
      this.sendOtpCode();
    } else {
      // Rejections don't need OTP — submit directly
      this.submitDecision();
    }
  }

  sendOtpCode(): void {
    this.otpSending.set(true);
    this.otpError.set('');
    this.otpCodigo.set('');

    this.otpService.solicitarOtp('VISTO_BUENO').subscribe({
      next: (res) => {
        this.otpSending.set(false);
        this.otpEmailMasked.set(res.emailEnmascarado);
        this.showOtpModal.set(true);
        this.startResendCooldown();
      },
      error: () => {
        this.otpSending.set(false);
        this.displayToast('Error al enviar el código de verificación', 'error');
      },
    });
  }

  resendOtpCode(): void {
    if (this.otpResendCooldown() > 0) return;
    this.sendOtpCode();
  }

  verifyOtpAndSubmit(): void {
    const code = this.otpCodigo().trim();
    if (code.length < 6) {
      this.otpError.set('Ingrese el código de 6 dígitos');
      return;
    }

    this.otpVerifying.set(true);
    this.otpError.set('');

    this.otpService.verificarOtp(code, 'VISTO_BUENO').subscribe({
      next: (res) => {
        this.otpVerifying.set(false);
        if (res.valido) {
          this.closeOtpModal();
          this.submitDecision();
        } else {
          this.otpError.set(res.mensaje || 'Código inválido o expirado');
        }
      },
      error: () => {
        this.otpVerifying.set(false);
        this.otpError.set('Error al verificar el código. Intente de nuevo.');
      },
    });
  }

  closeOtpModal(): void {
    this.showOtpModal.set(false);
    this.otpCodigo.set('');
    this.otpError.set('');
    if (this.otpTimer) {
      clearInterval(this.otpTimer);
      this.otpTimer = null;
    }
  }

  onOtpInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Only allow digits, max 6
    const cleaned = input.value.replace(/\D/g, '').slice(0, 6);
    this.otpCodigo.set(cleaned);
    input.value = cleaned;
  }

  private startResendCooldown(): void {
    this.otpResendCooldown.set(60);
    if (this.otpTimer) clearInterval(this.otpTimer);
    this.otpTimer = setInterval(() => {
      const val = this.otpResendCooldown();
      if (val <= 1) {
        this.otpResendCooldown.set(0);
        if (this.otpTimer) {
          clearInterval(this.otpTimer);
          this.otpTimer = null;
        }
      } else {
        this.otpResendCooldown.set(val - 1);
      }
    }, 1000);
  }

  submitDecision(): void {
    const tramite = this.tramite();
    if (!tramite?.id) {
      this.displayToast('No se encontró el trámite. Recargue la página e intente de nuevo.', 'error');
      return;
    }

    this.submitting.set(true);
    const decisionValue = this.decision()!;
    const tramiteId = tramite.id;

    const causaTxt =
      decisionValue === 'RECHAZADO'
        ? this.motivoRechazo().trim()
        : decisionValue === 'ACEPTADO_CON_NOVEDAD'
          ? this.causacionNovedad().trim()
          : '';
    const tipoCausa =
      decisionValue === 'RECHAZADO'
        ? ('RECHAZO' as const)
        : decisionValue === 'ACEPTADO_CON_NOVEDAD'
          ? ('ACEPTACION_CON_NOVEDAD' as const)
          : null;

    const destino = this.destinoAprobacion();
    const navigate = () => {
      this.showConfirmModal.set(false);
      this.submitting.set(false);
      if (decisionValue === 'APROBADO' || decisionValue === 'ACEPTADO_CON_NOVEDAD') {
        const destLabel = destino === 'CADENA_SUMINISTROS' ? 'Cadena de Suministros' : 'Contabilidad';
        const destRoute = destino === 'CADENA_SUMINISTROS' ? '/cadena-suministros/bandeja-visto-bueno' : '/contabilidad/gestion';
        const msg = decisionValue === 'APROBADO'
          ? `Trámite aprobado. Se envía a ${destLabel}.`
          : `Aceptado con novedad. Se envía a ${destLabel}.`;
        this.displayToast(msg, 'success');
        setTimeout(() => this.router.navigate([destRoute]), 2500);
      } else {
        this.displayToast(
          'Trámite rechazado. Se devuelve al área de Compras.',
          'warning',
        );
        setTimeout(() => this.router.navigate(['/compras/gestion']), 2500);
      }
    };

    this.tramiteService
      .registrarVistoBueno(tramiteId, {
        estado: decisionValue,
        observaciones: this.observaciones().trim() || undefined,
        novedades: this.novedades().trim() || undefined,
        destino: destino,
      })
      .subscribe({
        next: (vb) => {
          if (causaTxt && tipoCausa) {
            this.tramiteService
              .registrarCausacion(tramiteId, vb.id, causaTxt, tipoCausa)
              .subscribe({ next: navigate, error: navigate });
          } else {
            navigate();
          }
        },
        error: (err) => {
          this.submitting.set(false);
          if (err?.status === 409) {
            this.showConfirmModal.set(false);
            this.displayToast(
              'No se puede aprobar: hay órdenes de compra con proveedor pendiente de selección.',
              'warning',
            );
          } else if (err?.status === 0) {
            this.displayToast('Sin conexión con el servidor. Verifique que el backend esté disponible.', 'error');
          } else if (err?.status === 401 || err?.status === 403) {
            this.displayToast('No tiene permisos para realizar esta acción. Inicie sesión nuevamente.', 'error');
          } else {
            const msg = err?.error?.message || err?.error?.error || err?.message;
            this.displayToast(
              msg ? `Error: ${msg}` : 'Error al registrar la decisión. Intente de nuevo.',
              'error',
            );
          }
        },
      });
  }

  // ═══ Document Handling ═══

  /**
   * Resolve a viewable URL for an order's PDF.
   * Falls back to presigned URL from backend when the stored archivoUrl is a key.
   */
  private resolveArchivoUrl(
    orden: OrdenCompraCargada,
  ): Observable<string | null> {
    const archivo = orden.archivo;
    if (archivo instanceof File) {
      return of(URL.createObjectURL(archivo));
    }
    if (
      typeof archivo === 'string' &&
      archivo.startsWith('http') &&
      archivo.includes('X-Amz-')
    ) {
      return of(archivo);
    }
    // Always fetch a fresh presigned URL from the backend (raw S3 URLs return 403).
    const tramiteId = this.tramite()?.id;
    if (!tramiteId) return of(null);
    return this.tramiteService.getPresignedUrlByOrden(tramiteId, orden.id).pipe(
      map((res) => res.url || null),
      catchError(() =>
        // ID mismatch: fetch canonical order list and retry with the correct ID
        this.tramiteService.getOrdenesFromBackend(tramiteId).pipe(
          switchMap((backendOrdenes) => {
            const match = backendOrdenes.find(
              (b) => b.nombreArchivo === orden.nombreArchivo,
            );
            if (!match) return of(null);
            if (match.archivoUrl?.startsWith('http'))
              return of(match.archivoUrl);
            return this.tramiteService
              .getPresignedUrlByOrden(tramiteId, match.id)
              .pipe(
                map((res) => res.url || null),
                catchError(() => of(null)),
              );
          }),
          catchError(() => of(null)),
        ),
      ),
    );
  }

  getConfianzaColor(confianza: number): string {
    if (confianza >= 80) return '#10b981';
    if (confianza >= 50) return '#f59e0b';
    return '#ef4444';
  }

  // ═══ Datos Específicos del Requerimiento ═══

  getTipoRequerimientoLabel(tipo?: string): string {
    if (!tipo) return '—';
    return TIPO_REQ_LABELS[tipo] || tipo;
  }

  getDatosAdicionalesEntries(): { key: string; value: any }[] {
    const datos = this.datosAdicionalesParsed();
    if (!datos || this.isOCRData()) return [];
    return Object.entries(datos)
      .filter(
        ([k, v]) =>
          v !== null && v !== undefined && v !== '' && k !== 'datosOCR',
      )
      .map(([key, value]) => ({
        key: this.formatKey(key),
        value:
          typeof value === 'boolean'
            ? value
              ? 'Sí'
              : 'No'
            : typeof value === 'object'
              ? JSON.stringify(value)
              : value,
      }));
  }

  getArchivos(): ArchivoOCR[] {
    return this.datosOCR()?.archivos || [];
  }

  toggleArchivo(idx: number): void {
    this.archivoExpandido.set(this.archivoExpandido() === idx ? -1 : idx);
  }

  getHojaActiva(archivoIdx: number): number {
    return this.hojasActivas()[archivoIdx] || 0;
  }

  cambiarHoja(archivoIdx: number, hojaIdx: number): void {
    this.hojasActivas.update((v) => ({ ...v, [archivoIdx]: hojaIdx }));
  }

  getVista(archivoIdx: number): 'resumen' | 'detalle' {
    return this.vistas()[archivoIdx] || 'detalle';
  }

  cambiarVista(archivoIdx: number, vista: 'resumen' | 'detalle'): void {
    this.vistas.update((v) => ({ ...v, [archivoIdx]: vista }));
  }

  getBusqueda(archivoIdx: number): string {
    return this.busquedas()[archivoIdx] || '';
  }

  onBusqueda(archivoIdx: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.busquedas.update((b) => ({ ...b, [archivoIdx]: val }));
  }

  getHojaData(archivo: ArchivoOCR, archivoIdx: number): HojaExcel | null {
    const idx = this.getHojaActiva(archivoIdx);
    return archivo.hojas[idx] || null;
  }

  getFilasVisibles(archivo: ArchivoOCR, archivoIdx: number): string[][] {
    const hoja = this.getHojaData(archivo, archivoIdx);
    if (!hoja) return [];
    let filas = hoja.filas;
    const q = this.getBusqueda(archivoIdx).toLowerCase().trim();
    if (q) {
      filas = filas.filter((fila) =>
        fila.some((c) => (c || '').toLowerCase().includes(q)),
      );
    }
    // Aplicar ordenamiento
    const colIdx = this.sortColumn()[archivoIdx];
    if (colIdx !== undefined && colIdx >= 0) {
      const dir = this.sortDirection()[archivoIdx] || 'asc';
      filas = [...filas].sort((a, b) => {
        const va = a[colIdx] || '';
        const vb = b[colIdx] || '';
        const na = this.parseMoneda(va);
        const nb = this.parseMoneda(vb);
        if (na !== 0 || nb !== 0) {
          return dir === 'asc' ? na - nb : nb - na;
        }
        return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return filas;
  }

  sortBy(archivoIdx: number, colIdx: number): void {
    const currentCol = this.sortColumn()[archivoIdx];
    const currentDir = this.sortDirection()[archivoIdx] || 'asc';
    if (currentCol === colIdx) {
      if (currentDir === 'asc') {
        this.sortDirection.update(d => ({ ...d, [archivoIdx]: 'desc' }));
      } else {
        this.sortColumn.update(c => { const n = { ...c }; delete n[archivoIdx]; return n; });
        this.sortDirection.update(d => { const n = { ...d }; delete n[archivoIdx]; return n; });
      }
    } else {
      this.sortColumn.update(c => ({ ...c, [archivoIdx]: colIdx }));
      this.sortDirection.update(d => ({ ...d, [archivoIdx]: 'asc' }));
    }
  }

  getSortIndicator(archivoIdx: number, colIdx: number): string {
    if (this.sortColumn()[archivoIdx] !== colIdx) return '';
    return this.sortDirection()[archivoIdx] === 'asc' ? ' ▲' : ' ▼';
  }

  getColumnTotals(archivo: ArchivoOCR, archivoIdx: number): (string | null)[] {
    const hoja = this.getHojaData(archivo, archivoIdx);
    if (!hoja) return [];
    const filas = this.getFilasVisibles(archivo, archivoIdx);
    if (filas.length === 0) return [];
    const totals: (string | null)[] = [];
    let hasAny = false;
    for (let c = 0; c < hoja.encabezados.length; c++) {
      let sum = 0;
      let numCount = 0;
      for (const fila of filas) {
        if (this.isNumericCell(fila[c])) {
          sum += this.parseMoneda(fila[c]);
          numCount++;
        }
      }
      if (numCount >= 2) {
        totals.push(this.formatMoneda(sum));
        hasAny = true;
      } else {
        totals.push(null);
      }
    }
    return hasAny ? totals : [];
  }

  getResumen(archivo: ArchivoOCR): {
    totalFilas: number;
    categorias: string[];
    totalPrecio: number;
    totalCosto: number;
  } {
    const totalFilas = archivo.hojas.reduce((sum, h) => sum + h.totalFilas, 0);
    const categorias = new Set<string>();
    let totalPrecio = 0;
    let totalCosto = 0;

    for (const hoja of archivo.hojas) {
      const catIdx = hoja.encabezados.findIndex((h) =>
        /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h),
      );
      const precioIdx = hoja.encabezados.findIndex((h) =>
        /\bprecio\b/i.test(h.trim()),
      );
      // Priorizar "costo total" sobre "costo" genérico
      let costoIdx = hoja.encabezados.findIndex((h) =>
        /costo\s+total/i.test(h.trim()),
      );
      if (costoIdx < 0) {
        costoIdx = hoja.encabezados.findIndex((h) =>
          /\bcosto\b/i.test(h.trim()),
        );
      }
      hoja.filas.forEach((fila) => {
        if (catIdx >= 0) {
          const val = fila[catIdx]?.trim();
          if (val) categorias.add(val);
        }
        if (precioIdx >= 0) totalPrecio += this.parseMoneda(fila[precioIdx]);
        if (costoIdx >= 0) totalCosto += this.parseMoneda(fila[costoIdx]);
      });
    }

    return {
      totalFilas,
      categorias: Array.from(categorias).slice(0, 12),
      totalPrecio,
      totalCosto,
    };
  }

  formatMoneda(valor: number): string {
    if (valor === 0) return '$0';
    return (
      '$' +
      valor.toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    );
  }

  isNumericCell(value: string): boolean {
    if (!value || value.trim() === '') return false;
    return /^[\d$.,\-+%]+$/.test(value.trim());
  }

  getOcrFileIcon(nombre: string): string {
    if (nombre.match(/\.xlsx?$/i)) return '📊';
    if (nombre.endsWith('.pdf')) return '📄';
    if (nombre.match(/\.(png|jpg|jpeg)$/i)) return '🖼️';
    return '📁';
  }

  // ═══════════════════════════════════════════════
  // Document Image Modal (Documentos Adjuntos)
  // ═══════════════════════════════════════════════

  isImageUrl(url?: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.webp') ||
      lower.endsWith('.bmp') ||
      lower.includes('image')
    );
  }

  getDocFileName(url?: string): string {
    if (!url) return 'Archivo';
    const parts = url.split('/');
    return decodeURIComponent(parts[parts.length - 1]) || 'Archivo';
  }

  openDocImageModal(url: string, title: string): void {
    this.docModalImageUrl.set(url);
    this.docModalImageTitle.set(title);
    this.showDocImageModal.set(true);
  }

  closeDocImageModal(): void {
    this.showDocImageModal.set(false);
  }

  private parseMoneda(val: string | undefined): number {
    if (!val) return 0;
    let clean = val.replace(/[\$\s]/g, '').trim();
    if (!clean) return 0;
    if (/[a-zA-Z()+\/*=]/.test(clean)) return 0;
    const dots = (clean.match(/\./g) || []).length;
    const commas = (clean.match(/,/g) || []).length;
    if (dots > 1) {
      clean = clean.replace(/\./g, '');
    } else if (commas >= 1) {
      clean = clean.replace(/,/g, '');
    }
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  private formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\s/, '')
      .replace(/^./, (s) => s.toUpperCase());
  }

  getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext))
      return 'image';
    return 'other';
  }

  getSemaforoClass(sol: SolicitudCompra): string {
    const color = calcularSemaforo(sol.diasTranscurridos, sol.slaDias);
    switch (color) {
      case 'verde':
        return 'vb-semaforo-verde';
      case 'amarillo':
        return 'vb-semaforo-amarillo';
      case 'rojo':
        return 'vb-semaforo-rojo';
    }
  }

  getSemaforoLabel(sol: SolicitudCompra): string {
    const color = calcularSemaforo(sol.diasTranscurridos, sol.slaDias);
    switch (color) {
      case 'verde':
        return 'En tiempo';
      case 'amarillo':
        return 'Precaución';
      case 'rojo':
        return 'Urgente';
    }
  }

  getEstadoSolicitudLabel(estado: string): string {
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      REALIZADO: 'Realizado',
      TRAMITE: 'En Trámite',
      EN_PROCESO: 'En Proceso',
      COMPLETADO: 'Completado',
    };
    return labels[estado] || estado;
  }

  // ═══ View Order ═══
  viewOrden(orden: OrdenCompraCargada): void {
    this.selectedOrden.set(orden);
    this.showPreviewTab.set(false);
    this.showFacturaPreviewTab.set(false);
    this.showCreditTab.set(false);
    this.generatePreviewUrl(orden);
    this.generateFacturaPreviewUrl(orden);
    this.buildPdfUrl(orden);
    this.showViewModal.set(true);
  }

  closeViewModal(): void {
    this.showViewModal.set(false);
    this.selectedOrden.set(null);
    this.showPreviewTab.set(false);
    this.showFacturaPreviewTab.set(false);
    this.showCreditTab.set(false);
    this.revokeBlobUrl();
    this.revokePreviewUrl();
    this.revokeFacturaPreviewUrl();
    this.pdfUrl.set(null);
  }

  togglePreviewTab(tab: 'data' | 'preview' | 'factura' | 'credito'): void {
    this.showPreviewTab.set(tab === 'preview');
    this.showFacturaPreviewTab.set(tab === 'factura');
    this.showCreditTab.set(tab === 'credito');
  }

  private generatePreviewUrl(orden: OrdenCompraCargada): void {
    this.revokePreviewUrl();
    const ext =
      (orden.nombreArchivo || '')
        .split('.')
        .pop()
        ?.toLowerCase()
        ?.split('?')[0] || '';
    if (ext === 'pdf') {
      this.previewType.set('pdf');
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      this.previewType.set('image');
    } else {
      this.previewType.set('pdf'); // assume PDF for S3 files
    }
    this.resolveArchivoUrl(orden).subscribe({
      next: (url) => {
        if (url) {
          this.rawPreviewUrl = url;
          this.previewUrl.set(
            this.sanitizer.bypassSecurityTrustResourceUrl(url),
          );
        }
      },
    });
  }

  private generateFacturaPreviewUrl(orden: OrdenCompraCargada): void {
    this.revokeFacturaPreviewUrl();
    if (!orden.facturaNombreArchivo) {
      this.facturaPreviewType.set('unsupported');
      return;
    }
    const ext =
      (orden.facturaNombreArchivo || '')
        .split('.')
        .pop()
        ?.toLowerCase()
        ?.split('?')[0] || '';
    if (ext === 'pdf') {
      this.facturaPreviewType.set('pdf');
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      this.facturaPreviewType.set('image');
    } else {
      this.facturaPreviewType.set('pdf');
    }
    this.resolveFacturaUrl(orden).subscribe({
      next: (url) => {
        if (url) {
          this.rawFacturaPreviewUrl = url;
          this.facturaPreviewUrl.set(
            this.sanitizer.bypassSecurityTrustResourceUrl(url),
          );
        }
      },
    });
  }

  private revokePreviewUrl(): void {
    if (this.rawPreviewUrl) {
      URL.revokeObjectURL(this.rawPreviewUrl);
      this.rawPreviewUrl = null;
    }
    this.previewUrl.set(null);
  }

  private revokeFacturaPreviewUrl(): void {
    if (this.rawFacturaPreviewUrl) {
      URL.revokeObjectURL(this.rawFacturaPreviewUrl);
      this.rawFacturaPreviewUrl = null;
    }
    this.facturaPreviewUrl.set(null);
  }

  private buildPdfUrl(orden: OrdenCompraCargada): void {
    this.revokeBlobUrl();
    this.pdfUrl.set(null);
    this.resolveArchivoUrl(orden).subscribe({
      next: (url) => {
        if (!url) return;
        if (orden.archivo instanceof File) {
          this.currentBlobUrl = url;
        }
        this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      },
    });
  }

  private revokeBlobUrl(): void {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  }

  // ═══ Tramitar (Cadena de Suministros) ═══
  openTramitarModal(orden: OrdenCompraCargada): void {
    // Redirigir a la vista dedicada de tramitar orden
    const solicitudId = this.route.snapshot.paramMap.get('solicitudId');
    this.router.navigate(['/cadena-suministros/tramitar-orden', solicitudId, orden.id]);
  }

  /** Extract product rows from OCR data for the given OC */
  private extractProductosFromOCR(orden: OrdenCompraCargada): TramiteComparativoRow[] {
    const ocrData = this.datosOCR();
    if (!ocrData?.archivos?.length) return [];

    // Find the matching archivo by OC filename
    const archivoOC = ocrData.archivos.find(a =>
      orden.archivo instanceof File
        ? a.nombre === orden.archivo.name
        : a.nombre === orden.nombreArchivo
    ) || ocrData.archivos[0]; // fallback to first file

    if (!archivoOC) return [];

    const rows: TramiteComparativoRow[] = [];

    for (const hoja of archivoOC.hojas) {
      if (!hoja.filas?.length || !hoja.encabezados?.length) continue;

      const headers = hoja.encabezados.map(h => h.toLowerCase().trim());

      // Detect column indices by keyword matching
      const idxCodigo    = headers.findIndex(h => h.includes('código') || h.includes('codigo') || h.includes('ítem') || h.includes('item') || h === 'cod');
      const idxProducto  = headers.findIndex(h => h.includes('descripci') || h.includes('producto') || h.includes('detalle') || h.includes('concepto'));
      const idxCantidad  = headers.findIndex(h => h.includes('cantidad') || h.includes('cant') || h === 'qty');
      const idxKg        = headers.findIndex(h => h.includes('kg') || h.includes('peso') || h.includes('kilos'));
      const idxVrUnit    = headers.findIndex(h => h.includes('unitario') || h.includes('vr. unit') || h.includes('precio'));
      const idxValor     = headers.findIndex(h => h.includes('total') || h.includes('valor') || h.includes('vr.'));

      // If we can't find at least a product column, skip this sheet
      if (idxProducto === -1 && idxCodigo === -1) continue;

      for (const fila of hoja.filas) {
        const productoStr = idxProducto >= 0 ? (fila[idxProducto] || '').trim() : '';
        const codigoStr   = idxCodigo >= 0 ? (fila[idxCodigo] || '').trim() : '';

        // Skip empty rows and header-like rows
        if (!productoStr && !codigoStr) continue;
        if (productoStr.toLowerCase().includes('total') && productoStr.length < 15) continue;

        const parseMoney = (val: string): number | null => {
          if (!val) return null;
          const cleaned = val.replace(/[$.]/g, '').replace(/,/g, '.').trim();
          const n = parseFloat(cleaned);
          return isNaN(n) ? null : n;
        };

        rows.push({
          codigo: codigoStr || '—',
          producto: productoStr || '—',
          cantidad: idxCantidad >= 0 ? parseMoney(fila[idxCantidad]) : null,
          kg: idxKg >= 0 ? parseMoney(fila[idxKg]) : null,
          valorUnitario: idxVrUnit >= 0 ? parseMoney(fila[idxVrUnit]) : null,
          valor: idxValor >= 0 ? parseMoney(fila[idxValor]) : null,
        });
      }
    }

    // Fallback: try kvPairs if no table rows found
    if (rows.length === 0 && archivoOC.kvPairs?.length) {
      for (const kv of archivoOC.kvPairs) {
        const k = kv.key?.toLowerCase() || '';
        if (k.includes('producto') || k.includes('descripci') || k.includes('item') || k.includes('detalle')) {
          rows.push({
            codigo: '—',
            producto: kv.value || '—',
            cantidad: null,
            kg: null,
            valor: null,
          });
        }
      }
    }

    return rows;
  }

  closeTramitarModal(): void {
    this.showTramitarModal.set(false);
    this.tramitarOrden.set(null);
    this.tramitarModo.set('SIIGO');
    this.tablaOcRows.set([]);
    this.tablaValidacionRows.set([]);
    this.siigoFile.set(null);
    this.siigoFileName.set('');
    this.siigoError.set('');
    this.comparisonResult.set(null);
    this.comparisonDone.set(false);
    this.matchPercentage.set(0);
    this.showDiscrepancyDetail.set(false);
  }

  setTramitarModo(mode: 'SIIGO' | 'MANUAL'): void {
    this.tramitarModo.set(mode);
  }

  // ═══ SIIGO Drag & Drop ═══
  onSiigoDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.siigoDragOver.set(true);
  }

  onSiigoDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.siigoDragOver.set(false);
  }

  onSiigoDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.siigoDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.siigoFile.set(files[0]);
      this.siigoFileName.set(files[0].name);
      this.siigoError.set('');
    }
  }

  onSiigoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.siigoFile.set(input.files[0]);
      this.siigoFileName.set(input.files[0].name);
      this.siigoError.set('');
    }
  }

  removeSiigoFile(): void {
    this.siigoFile.set(null);
    this.siigoFileName.set('');
    this.siigoError.set('');
    this.comparisonResult.set(null);
    this.comparisonDone.set(false);
    this.matchPercentage.set(0);
    this.showDiscrepancyDetail.set(false);
  }

  getSiigoFileIcon(): string {
    const name = this.siigoFileName().toLowerCase();
    if (name.endsWith('.pdf')) return '📄';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return '📊';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return '📝';
    if (name.match(/\.(png|jpg|jpeg|tiff|tif)$/)) return '🖼️';
    return '📎';
  }

  // ═══ SIIGO OCR Analysis ═══
  analizarDocumentoSiigo(): void {
    const file = this.siigoFile();
    const orden = this.tramitarOrden();
    if (!file || !orden) return;

    this.siigoAnalyzing.set(true);
    this.siigoAnalyzingProgress.set(0);
    this.siigoError.set('');

    // Simulate progress
    const progressInterval = setInterval(() => {
      const current = this.siigoAnalyzingProgress();
      if (current < 90) {
        this.siigoAnalyzingProgress.set(current + Math.random() * 8);
      }
    }, 500);

    const formData = new FormData();
    formData.append('file', file);

    // Build OC products from extracted OCR rows for the backend comparison
    const ocRows = this.tablaOcRows();
    const productosOC = ocRows.map(r => ({
      codigo: r.codigo !== '—' ? r.codigo : null,
      producto: r.producto !== '—' ? r.producto : null,
      cantidad: r.cantidad,
      kg: r.kg,
      valorUnitario: r.valorUnitario ?? null,
      valorTotal: r.valor,
    }));

    const ordenData = {
      numeroOC: orden.numeroOC,
      proveedor: orden.proveedor || '',
      nitProveedor: orden.nitProveedor || '',
      subtotal: orden.valorAntesIva ?? 0,
      iva: orden.valorIva ?? 0,
      total: orden.valorTotal ?? 0,
      descripcionItems: orden.descripcionItems || '',
      productos: productosOC,
    };
    formData.append('ordenCompraJson', JSON.stringify(ordenData));

    this.http.post<ResultadoComparacion>(
      `${environment.apiUrl}/v1/discrepancia/analizar-siigo`,
      formData
    ).subscribe({
      next: (result) => {
        clearInterval(progressInterval);
        this.siigoAnalyzingProgress.set(100);
        setTimeout(() => {
          this.siigoAnalyzing.set(false);
          this.comparisonResult.set(result);
          this.comparisonDone.set(true);
          // Compute match percentage: 100 - porcentajeDiferenciaTotal
          const matchPct = Math.max(0, 100 - (result.porcentajeDiferenciaTotal ?? 0));
          this.animateMatchPercentage(matchPct);
          if (!result.coincide) {
            this.showDiscrepancyDetail.set(true);
          }
        }, 600);
      },
      error: (err) => {
        clearInterval(progressInterval);
        this.siigoAnalyzing.set(false);
        this.siigoAnalyzingProgress.set(0);
        const msg = err.error?.message || err.error?.error || 'Error al analizar el documento SIIGO';
        this.siigoError.set(msg);
        this.displayToast(msg, 'error');
      },
    });
  }

  private animateMatchPercentage(target: number): void {
    const duration = 1200;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        this.matchPercentage.set(Math.round(target));
        clearInterval(interval);
      } else {
        this.matchPercentage.set(Math.round(current));
      }
    }, duration / steps);
  }

  toggleDiscrepancyDetail(): void {
    this.showDiscrepancyDetail.set(!this.showDiscrepancyDetail());
  }

  getMatchPercentageColor(): string {
    const p = this.matchPercentage();
    if (p >= 95) return '#16a34a';
    if (p >= 70) return '#f59e0b';
    return '#ef4444';
  }

  getDiscrepancyTypeClass(tipo: string): string {
    switch (tipo) {
      case 'CRITICA': return 'disc-critica';
      case 'ADVERTENCIA': return 'disc-advertencia';
      case 'INFO': return 'disc-info';
      default: return '';
    }
  }

  getDiscrepancyTypeLabel(tipo: string): string {
    switch (tipo) {
      case 'CRITICA': return '⛔ Crítica';
      case 'ADVERTENCIA': return '⚠️ Advertencia';
      case 'INFO': return 'ℹ️ Info';
      default: return tipo;
    }
  }

  hasDiscrepancy(campo: string): boolean {
    const result = this.comparisonResult();
    if (!result) return false;
    return result.discrepancias.some(d => d.campo === campo);
  }

  countByEstado(estado: string): number {
    const result = this.comparisonResult();
    if (!result || !result.matchProductos) return 0;
    return result.matchProductos.filter(m => m.estado === estado).length;
  }

  getEstadoLabel(estado: string): string {
    switch (estado) {
      case 'COINCIDE': return '✓ Coincide';
      case 'DIFERENTE': return '⚠ Diferente';
      case 'SOLO_OC': return '← Solo OC';
      case 'SOLO_SIIGO': return '→ Solo SIIGO';
      default: return estado;
    }
  }

  getEstadoClass(estado: string): string {
    switch (estado) {
      case 'COINCIDE': return 'estado-coincide';
      case 'DIFERENTE': return 'estado-diferente';
      case 'SOLO_OC': return 'estado-solo-oc';
      case 'SOLO_SIIGO': return 'estado-solo-siigo';
      default: return '';
    }
  }

  getOcProductsTotal(): number {
    return this.tablaOcRows().reduce((sum, r) => sum + (r.valor ?? 0), 0);
  }

  guardarComparacion(): void {
    const result = this.comparisonResult();
    if (result?.coincide) {
      this.displayToast('Documentos validados correctamente ✓', 'success');
    } else {
      this.displayToast('Comparación guardada con discrepancias pendientes', 'warning');
    }
    this.closeTramitarModal();
  }

  addManualRow(): void {
    const rows = this.tablaValidacionRows();
    this.tablaValidacionRows.set([...rows, { codigo: '', producto: '', cantidad: null, kg: null, valor: null }]);
  }

  removeManualRow(index: number): void {
    const rows = [...this.tablaValidacionRows()];
    rows.splice(index, 1);
    this.tablaValidacionRows.set(rows);
  }

  // ═══ Helpers ═══
  volver(): void {
    this.router.navigate(['/compras/bandeja-visto-bueno']);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  getTotalCuotas(orden: OrdenCompraCargada): number {
    if (!orden.creditoFechasPago) return 0;
    return orden.creditoFechasPago.reduce((s, c) => s + (c.monto || 0), 0);
  }

  cuotasCubrenTotal(orden: OrdenCompraCargada): boolean {
    const totalCuotas = this.getTotalCuotas(orden);
    return Math.abs(totalCuotas - orden.valorTotal) < 1;
  }

  formatFechaLegible(fecha: string): string {
    if (!fecha) return '—';
    try {
      const d = new Date(fecha + 'T12:00:00');
      return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return fecha;
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getDecisionLabel(): string {
    switch (this.decision()) {
      case 'APROBADO':
        return 'Aprobar';
      case 'RECHAZADO':
        return 'Rechazar';
      case 'ACEPTADO_CON_NOVEDAD':
        return 'Aceptar con Novedad';
      default:
        return '';
    }
  }

  getDecisionIcon(): string {
    switch (this.decision()) {
      case 'APROBADO':
        return 'check';
      case 'RECHAZADO':
        return 'x';
      case 'ACEPTADO_CON_NOVEDAD':
        return 'alert';
      default:
        return '';
    }
  }

  private displayToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }
}
