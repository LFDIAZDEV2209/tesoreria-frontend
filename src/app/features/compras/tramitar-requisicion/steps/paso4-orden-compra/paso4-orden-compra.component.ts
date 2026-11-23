import { firstValueFrom } from 'rxjs';
import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  stagger,
} from '@angular/animations';
import {
  TramiteRequisicion,
  OrdenCompraCargada,
  EstadoEscaneo,
  TipoPago,
  DetalleDiferencia,
  FacturaOcrResult,
  FechaPagoCredito,
  ProveedorTramite,
} from '../../models/tramitar-requisicion.model';
import { OcrScanningService } from '../../services/ocr-scanning.service';
import { TramitarRequisicionService } from '../../services/tramitar-requisicion.service';
import { ProveedorService } from '../../../../proveedores/services/proveedor.service';
import { Proveedor } from '../../../../proveedores/models/proveedor.model';

@Component({
  selector: 'app-paso4-orden-compra',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './paso4-orden-compra.component.html',
  styleUrls: ['./paso4-orden-compra.component.scss'],
  animations: [
    trigger('cardAppear', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px) scale(0.9)' }),
        animate(
          '0.4s cubic-bezier(0.33, 1, 0.68, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
        ),
      ]),
    ]),
    trigger('staggerCards', [
      transition('* => *', [
        query(
          ':enter',
          [
            style({ opacity: 0, transform: 'translateY(20px)' }),
            stagger(100, [
              animate(
                '0.35s cubic-bezier(0.33, 1, 0.68, 1)',
                style({ opacity: 1, transform: 'translateY(0)' }),
              ),
            ]),
          ],
          { optional: true },
        ),
      ]),
    ]),
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate(
          '0.3s ease-out',
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
  ],
})
export class Paso4OrdenCompraComponent implements OnInit, OnDestroy {
  @Input() tramite!: TramiteRequisicion;
  @Output() completed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  // Tipo de pago (ya no es global — cada OC tiene su propio tipoPago)
  // Se mantiene tipoPagoConfirmado para no romper la UI de forma radical
  tipoPagoConfirmado = signal(true); // Siempre true — ya no hay gate

  // Tipos de pago disponibles
  tiposPagoOptions: {
    value: TipoPago;
    label: string;
    color: string;
    icon: string;
  }[] = [
    { value: 'CONTADO', label: 'Contado', color: '#10b981', icon: 'cash' },
    { value: 'CREDITO', label: 'Crédito', color: '#3b82f6', icon: 'clock' },
    {
      value: 'CONTRA_ENTREGA',
      label: 'Contra Entrega',
      color: '#f59e0b',
      icon: 'truck',
    },
  ];

  // Vista: cards o tabla
  vistaDocumentos = signal<'cards' | 'tabla'>('cards');

  ordenesCargadas = signal<OrdenCompraCargada[]>([]);
  isDragging = signal(false);
  isScanning = signal(false);
  scanningCount = signal(0);
  totalToScan = signal(0);
  showViewModal = signal(false);
  selectedOrden = signal<OrdenCompraCargada | null>(null);
  showDeleteConfirm = signal(false);
  ordenToDelete = signal<OrdenCompraCargada | null>(null);

  // Proveedores del sistema para validar el proveedor OCR
  proveedoresSistema = signal<Proveedor[]>([]);
  loadingProveedores = signal(false);

  // ═══ CRÉDITO MODAL ═══
  showCreditoModal = signal(false);
  creditoModalOrden = signal<OrdenCompraCargada | null>(null);

  /** Abre el modal de gestión de crédito para una OC */
  openCreditoModal(orden: OrdenCompraCargada): void {
    this.creditoModalOrden.set(orden);
    this.showCreditoModal.set(true);
  }

  /** Cierra el modal de gestión de crédito */
  closeCreditoModal(): void {
    this.showCreditoModal.set(false);
    this.creditoModalOrden.set(null);
  }

  /** Devuelve la orden actualizada para el modal (reactivo) */
  getCreditoModalOrdenActualizada(): OrdenCompraCargada | null {
    const modalOrden = this.creditoModalOrden();
    if (!modalOrden) return null;
    return this.ordenesCargadas().find((o) => o.id === modalOrden.id) || null;
  }

  // Hidden file input for per-OC factura attachment
  facturaInputOrdenId: string | null = null;

  // ═══ MULTI-SELECT (mode-based, no checkboxes) ═══
  selectionMode = signal(false);
  selectedOrdenIds = signal<Set<string>>(new Set());

  toggleSelectionMode(): void {
    const active = !this.selectionMode();
    this.selectionMode.set(active);
    if (!active) this.deselectAllOrdenes();
  }

  exitSelectionMode(): void {
    this.selectionMode.set(false);
    this.deselectAllOrdenes();
  }

  toggleOrdenSelection(id: string, event?: Event): void {
    event?.stopPropagation();
    const current = new Set(this.selectedOrdenIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedOrdenIds.set(current);
  }

  isOrdenSelected(id: string): boolean {
    return this.selectedOrdenIds().has(id);
  }

  get selectedCount(): number {
    return this.selectedOrdenIds().size;
  }

  get allSelected(): boolean {
    return (
      this.ordenesCargadas().length > 0 &&
      this.selectedOrdenIds().size === this.ordenesCargadas().length
    );
  }

  get someSelected(): boolean {
    return this.selectedOrdenIds().size > 0 && !this.allSelected;
  }

  selectAllOrdenes(): void {
    this.selectedOrdenIds.set(new Set(this.ordenesCargadas().map((o) => o.id)));
  }

  deselectAllOrdenes(): void {
    this.selectedOrdenIds.set(new Set());
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.deselectAllOrdenes();
    } else {
      this.selectAllOrdenes();
    }
  }

  /** Bulk assign tipoPago to all selected OCs */
  bulkAssignTipoPago(tipo: TipoPago): void {
    const ids = this.selectedOrdenIds();
    if (ids.size === 0) return;
    ids.forEach((id) => {
      this.setOrdenTipoPago(id, tipo);
    });
    this.deselectAllOrdenes();
  }

  // ═══ TABLE EXPAND/COLLAPSE ═══
  expandedOrdenIds = signal<Set<string>>(new Set());

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
    const allIds = new Set(this.ordenesCargadas().map((o) => o.id));
    this.expandedOrdenIds.set(allIds);
  }

  collapseAllOrdenes(): void {
    this.expandedOrdenIds.set(new Set());
  }

  // File preview signals
  showPreviewTab = signal(false);
  showFacturaPreviewTab = signal(false);
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewType = signal<'pdf' | 'image' | 'unsupported'>('unsupported');
  facturaPreviewUrl = signal<SafeResourceUrl | null>(null);
  facturaPreviewType = signal<'pdf' | 'image' | 'unsupported'>('unsupported');
  private rawPreviewUrl: string | null = null;
  private rawFacturaPreviewUrl: string | null = null;

  /** Visual miniatura por tarjeta del documento de factura mientras se procesa. */
  readonly miniFactura = signal<Record<string, { url: SafeResourceUrl; tipo: 'pdf' | 'image' } | null>>({});
  private miniFacturaRaw = new Map<string, string>();

  constructor(
    private ocrService: OcrScanningService,
    private sanitizer: DomSanitizer,
    private tramiteService: TramitarRequisicionService,
    private proveedorService: ProveedorService,
  ) {}

  ngOnInit(): void {
    // Restore orders from the tramite. Orders with File objects are from the current session,
    // orders without File objects are restored from the backend (serialized).
    // Both should be displayed so data persists on navigation.
    if (
      this.tramite.ordenesCargadas &&
      this.tramite.ordenesCargadas.length > 0
    ) {
      const restoredOrders = this.tramite.ordenesCargadas.map((o) => {
        const restored = { ...o };

        // If order was restored from backend (no File), ensure archivo is set from URL
        if (!restored.archivo && restored.archivoUrl) {
          restored.archivo = restored.archivoUrl;
        }

        // If factura data exists from backend but facturaArchivo is missing, mark it present
        if (
          !restored.facturaArchivo &&
          restored.facturaNombreArchivo &&
          (restored.facturaEstadoEscaneo === 'completado' ||
            restored.facturaEstadoEscaneo === 'escaneando')
        ) {
          restored.facturaArchivo = restored.facturaNombreArchivo;
        }

        return restored;
      });
      this.ordenesCargadas.set(restoredOrders);
    }

    this.cargarProveedores();
  }

  private cargarProveedores(): void {
    this.loadingProveedores.set(true);
    this.proveedorService.getProveedores().subscribe({
      next: (data) => {
        this.proveedoresSistema.set(data || []);
        this.loadingProveedores.set(false);
        // If trámite already has provider associations from backend, apply them
        if (this.tramite.proveedores && this.tramite.proveedores.length > 0) {
          this.aplicarProveedoresBackend(this.tramite.proveedores);
        } else {
          this.validarProveedoresPendientes();
        }
      },
      error: () => {
        this.proveedoresSistema.set([]);
        this.loadingProveedores.set(false);
      },
    });
  }

  /**
   * Aplica las asociaciones proveedor ↔ OC que ya vienen del backend
   * en el campo `proveedores` del trámite.
   */
  private aplicarProveedoresBackend(proveedores: ProveedorTramite[]): void {
    proveedores.forEach((prov) => {
      const orden = this.ordenesCargadas().find(
        (o) => o.id === prov.ordenCompraId,
      );
      if (!orden) return;

      this.updateOrdenState(prov.ordenCompraId, {
        proveedorId: prov.proveedorId ?? undefined,
        proveedor: prov.proveedorNombreFinal || orden.proveedor,
        proveedorNombreOriginalOcr:
          prov.proveedorNombreOriginalOcr || orden.proveedor,
        nitProveedor: prov.proveedorNit || orden.nitProveedor,
        requiereSeleccionProveedor: prov.requiereSeleccionProveedor,
      });
    });

    // For OCs not yet associated in backend, run local validation
    const asociadas = new Set(proveedores.map((p) => p.ordenCompraId));
    this.ordenesCargadas()
      .filter((o) => o.estadoEscaneo === 'completado' && !asociadas.has(o.id))
      .forEach((o) => this.validarProveedorOrden(o.id));
  }

  /**
   * Guarda todas las asociaciones de proveedores al backend via PUT masivo.
   * Se llama después del OCR scan y después de la validación local.
   */
  guardarProveedoresEnBackend(): void {
    if (!this.tramite.id) return;
    const ordenes = this.ordenesCargadas().filter(
      (o) => o.estadoEscaneo === 'completado',
    );
    if (ordenes.length === 0) return;

    const asociaciones = ordenes.map((o) => ({
      ordenCompraId: o.id,
      proveedorId: o.proveedorId ?? null,
      proveedorNombreFinal: o.proveedorId ? o.proveedor : null,
      proveedorNombreOriginalOcr:
        o.proveedorNombreOriginalOcr || o.proveedor || null,
      requiereSeleccionProveedor: !!o.requiereSeleccionProveedor,
    }));

    this.tramiteService
      .guardarProveedoresTramite(this.tramite.id, asociaciones)
      .subscribe({
        next: (result) => {
          if (result.length > 0) {
            this.tramite.proveedores = result;
          }
        },
      });
  }

  private get proveedoresActivos(): Proveedor[] {
    return this.proveedoresSistema().filter((p) => p.estado !== 'INACTIVO');
  }

  get ocsSinProveedorValidado(): number {
    return this.ordenesCargadas().filter(
      (o) => o.estadoEscaneo === 'completado' && !!o.requiereSeleccionProveedor,
    ).length;
  }

  getProveedoresDisponibles(): Proveedor[] {
    return this.proveedoresActivos;
  }

  /** Gets enriched provider info from the trámite's proveedores array */
  getProveedorInfo(ordenId: string): ProveedorTramite | undefined {
    return this.tramite.proveedores?.find((p) => p.ordenCompraId === ordenId);
  }

  seleccionarProveedorOrden(ordenId: string, proveedorIdRaw: string): void {
    const proveedorId = Number(proveedorIdRaw);
    const proveedor = this.proveedoresActivos.find((p) => p.id === proveedorId);
    if (!proveedor) return;

    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    this.updateOrdenState(ordenId, {
      proveedorId: proveedor.id,
      proveedorNombreOriginalOcr:
        orden?.proveedorNombreOriginalOcr || orden?.proveedor || '',
      proveedor: proveedor.nombreProveedor,
      nitProveedor: proveedor.nit || orden?.nitProveedor,
      requiereSeleccionProveedor: false,
    });
    this.syncToTramite();

    // Persist to backend via PATCH
    if (this.tramite.id) {
      this.tramiteService
        .actualizarProveedorOrden(this.tramite.id, ordenId, {
          proveedorId: proveedor.id!,
          proveedorNombreFinal: proveedor.nombreProveedor,
        })
        .subscribe();
    }
  }

  private validarProveedoresPendientes(): void {
    this.ordenesCargadas()
      .filter((o) => o.estadoEscaneo === 'completado')
      .forEach((o) => this.validarProveedorOrden(o.id));
  }

  private validarProveedorOrden(ordenId: string): void {
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (!orden || orden.estadoEscaneo !== 'completado') return;

    const proveedores = this.proveedoresActivos;
    if (proveedores.length === 0) return;

    if (orden.proveedorId && !orden.requiereSeleccionProveedor) return;

    const matched = this.encontrarProveedorCoincidente(orden, proveedores);
    if (matched) {
      this.updateOrdenState(ordenId, {
        proveedorId: matched.id,
        proveedorNombreOriginalOcr:
          orden.proveedorNombreOriginalOcr || orden.proveedor,
        proveedor: matched.nombreProveedor,
        nitProveedor: matched.nit || orden.nitProveedor,
        requiereSeleccionProveedor: false,
      });
      return;
    }

    this.updateOrdenState(ordenId, {
      proveedorId: undefined,
      proveedorNombreOriginalOcr:
        orden.proveedorNombreOriginalOcr || orden.proveedor,
      requiereSeleccionProveedor: true,
    });
  }

  private encontrarProveedorCoincidente(
    orden: OrdenCompraCargada,
    proveedores: Proveedor[],
  ): Proveedor | null {
    const nitOcr = this.normalizeNit(orden.nitProveedor || '');
    if (nitOcr) {
      const matchNit = proveedores.find(
        (p) => this.normalizeNit(p.nit) === nitOcr,
      );
      if (matchNit) return matchNit;
    }

    const proveedorOcr = this.normalizeStr(orden.proveedor || '');
    if (!proveedorOcr) return null;

    const exacto = proveedores.find(
      (p) => this.normalizeStr(p.nombreProveedor) === proveedorOcr,
    );
    if (exacto) return exacto;

    const aproximados = proveedores.filter((p) => {
      const nombre = this.normalizeStr(p.nombreProveedor);
      return nombre.includes(proveedorOcr) || proveedorOcr.includes(nombre);
    });

    return aproximados.length === 1 ? aproximados[0] : null;
  }

  private normalizeNit(nit: string): string {
    return (nit || '').replace(/[^0-9]/g, '');
  }

  // ═══ PER-OC TIPO DE PAGO ═══
  setOrdenTipoPago(ordenId: string, tipo: TipoPago | undefined): void {
    this.updateOrdenState(ordenId, { tipoPago: tipo });
    // If switching away from CONTADO, clear factura data
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (orden && tipo !== 'CONTADO' && orden.facturaArchivo) {
      this.removeFactura(ordenId);
    }
    this.syncToTramite();
  }

  /** Helper: check if an OC is CONTADO */
  isContado(orden: OrdenCompraCargada): boolean {
    return orden.tipoPago === 'CONTADO';
  }

  /** Check if any OC is CONTADO (to show factura column) */
  get hayContado(): boolean {
    return this.ordenesCargadas().some((o) => o.tipoPago === 'CONTADO');
  }

  /** Count of OCs without a payment type assigned */
  get ocsSinTipoPago(): number {
    return this.ordenesCargadas().filter((o) => !o.tipoPago).length;
  }

  /** Get tipoPago label */
  getTipoPagoLabel(tipo: TipoPago | undefined): string {
    if (!tipo) return 'Sin asignar';
    const opt = this.tiposPagoOptions.find((o) => o.value === tipo);
    return opt ? opt.label : tipo;
  }

  /** Get tipoPago color */
  getTipoPagoColor(tipo: TipoPago | undefined): string {
    if (!tipo) return 'rgba(33,48,83,0.3)';
    const opt = this.tiposPagoOptions.find((o) => o.value === tipo);
    return opt ? opt.color : '#213053';
  }

  /** Count OCs per tipo de pago */
  get conteoContado(): number {
    return this.ordenesCargadas().filter((o) => o.tipoPago === 'CONTADO')
      .length;
  }
  get conteoCredito(): number {
    return this.ordenesCargadas().filter((o) => o.tipoPago === 'CREDITO')
      .length;
  }
  get conteoContraEntrega(): number {
    return this.ordenesCargadas().filter((o) => o.tipoPago === 'CONTRA_ENTREGA')
      .length;
  }

  // ═══ KPIs ═══
  get totalOrdenes(): number {
    return this.ordenesCargadas().length;
  }
  get totalSubtotal(): number {
    return this.ordenesCargadas().reduce((s, o) => s + o.valorAntesIva, 0);
  }
  get totalIVA(): number {
    return this.ordenesCargadas().reduce((s, o) => s + o.valorIva, 0);
  }
  get totalGeneral(): number {
    return this.ordenesCargadas().reduce((s, o) => s + o.valorTotal, 0);
  }
  get totalDocFacturacion(): number {
    return this.ordenesCargadas()
      .filter((o) => o.tipoPago === 'CONTADO')
      .reduce((s, o) => s + (o.facturaValorTotal || 0), 0);
  }
  get completadas(): number {
    return this.ordenesCargadas().filter(
      (o) => o.estadoEscaneo === 'completado',
    ).length;
  }
  get escaneandoCount(): number {
    return this.ordenesCargadas().filter(
      (o) => o.estadoEscaneo === 'escaneando',
    ).length;
  }
  get promedioConfianza(): number {
    const completadas = this.ordenesCargadas().filter(
      (o) => o.estadoEscaneo === 'completado',
    );
    if (completadas.length === 0) return 0;
    return Math.round(
      completadas.reduce((s, o) => s + o.confianzaOCR, 0) / completadas.length,
    );
  }

  get allScanned(): boolean {
    return (
      this.ordenesCargadas().length > 0 &&
      this.ordenesCargadas().every((o) => o.estadoEscaneo === 'completado')
    );
  }

  // ═══ DRAG & DROP ═══
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (event.dataTransfer?.files) {
      this.processFiles(event.dataTransfer.files);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFiles(input.files);
      input.value = ''; // Reset input
    }
  }

  private processFiles(files: FileList): void {
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!validExtensions.includes(ext)) continue;
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Both CONTADO and CREDITO: each file = 1 OC
    // For CONTADO, user attaches factura per-OC card after scanning
    this.processCreditoFiles(validFiles);
  }

  /** CRÉDITO: Each file is an independent OC */
  private processCreditoFiles(files: File[]): void {
    const newOrdenes: OrdenCompraCargada[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const orden: OrdenCompraCargada = {
        id: `oc-${Date.now()}-${i}`,
        archivo: file,
        nombreArchivo: file.name,
        tamanoArchivo: file.size,
        estadoEscaneo: 'pendiente',
        progresoEscaneo: 0,
        numeroOC: '',
        proveedor: '',
        fechaEmision: '',
        valorAntesIva: 0,
        ivaPorcentaje: 0,
        valorIva: 0,
        valorTotal: 0,
        responsableCompra: '',
        confianzaOCR: 0,
      };
      newOrdenes.push(orden);
    }

    if (newOrdenes.length > 0) {
      const currentOrdenes = [...this.ordenesCargadas(), ...newOrdenes];
      this.ordenesCargadas.set(currentOrdenes);
      this.startOCRScanning(newOrdenes);
    }
  }

  // ═══ FACTURA ATTACHMENT PER-OC (CONTADO) ═══

  /**
   * Opens a file input dialog to attach a factura to a specific OC.
   * Called from the "Adjuntar Factura" button on each OC card.
   */
  triggerFacturaUpload(ordenId: string): void {
    this.facturaInputOrdenId = ordenId;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.tiff,.tif';
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        this.attachFacturaToOrden(ordenId, target.files[0]);
      }
    };
    input.click();
  }

  /**
   * Attaches a factura file to an existing OC and starts factura-specific OCR scanning.
   */
  private attachFacturaToOrden(ordenId: string, file: File): void {
    this.miniDetalle(ordenId, file);
    this.updateOrdenState(ordenId, {
      facturaArchivo: file,
      facturaNombreArchivo: file.name,
      facturaTamanoArchivo: file.size,
      facturaEstadoEscaneo: 'pendiente' as EstadoEscaneo,
      facturaProgresoEscaneo: 0,
    });
    this.scanFacturaForOrden(ordenId, file, () => {
      this.syncToTramite();
    });
  }

  /** Visual del documento cargado y siendo procesado (miniatura por tarjeta). */
  private miniDetalle(ordenId: string, archivo: File): void {
    this.miniLiberar(ordenId);
    const raw = URL.createObjectURL(archivo);
    this.miniFacturaRaw.set(ordenId, raw);
    const tipo: 'pdf' | 'image' = archivo.type === 'application/pdf' ? 'pdf' : 'image';
    const safe = this.sanitizer.bypassSecurityTrustResourceUrl(raw);
    this.miniFactura.update((m) => ({ ...m, [ordenId]: { url: safe, tipo } }));
  }

  private miniLiberar(ordenId: string): void {
    const raw = this.miniFacturaRaw.get(ordenId);
    if (raw) {
      URL.revokeObjectURL(raw);
      this.miniFacturaRaw.delete(ordenId);
    }
    this.miniFactura.update((m) => {
      if (!(ordenId in m)) return m;
      const copia = { ...m };
      delete copia[ordenId];
      return copia;
    });
  }

  /** Normaliza el número de factura para comparaciones de duplicado. */
  private normalizarNumeroFactura(valor: string | null | undefined): string {
    return String(valor ?? '').replace(/\s/g, '').toUpperCase().trim();
  }

  /**
   * Removes the attached factura from an OC.
   */
  removeFactura(ordenId: string): void {
    this.miniLiberar(ordenId);
    this.updateOrdenState(ordenId, {
      facturaArchivo: undefined,
      facturaNombreArchivo: undefined,
      facturaTamanoArchivo: undefined,
      facturaEstadoEscaneo: undefined,
      facturaProgresoEscaneo: undefined,
      facturaNumero: '',
      facturaProveedor: '',
      facturaNitProveedor: undefined,
      facturaFechaEmision: '',
      facturaValorAntesIva: undefined,
      facturaIvaPorcentaje: undefined,
      facturaValorIva: undefined,
      facturaValorTotal: 0,
      facturaDescripcionItems: undefined,
      facturaConfianzaOCR: 0,
      comparacionCoincide: undefined,
      comparacionDiferencia: undefined,
      comparacionPorcentaje: undefined,
      comparacionDetalles: undefined,
    });
    this.syncToTramite();
  }

  /**
   * Re-scans a factura that had an error.
   */
  rescanFactura(ordenId: string): void {
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (!orden || !(orden.facturaArchivo instanceof File)) return;
    this.updateOrdenState(ordenId, {
      facturaEstadoEscaneo: 'pendiente' as EstadoEscaneo,
      facturaProgresoEscaneo: 0,
      facturaMensaje: undefined,
    });
    this.scanFacturaForOrden(ordenId, orden.facturaArchivo, () => {
      this.syncToTramite();
    });
  }

  /**
   * Checks if an OC has a factura attached.
   */
  tieneFactura(orden: OrdenCompraCargada): boolean {
    return !!orden.facturaArchivo;
  }

  /**
   * Updates the observation for an OC (used when no billing doc is attached).
   */
  updateObservacion(ordenId: string, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.updateOrdenState(ordenId, { observacionDocFacturacion: value });
    this.syncToTramite();
  }

  // ═══ CRÉDITO — Gestión de Fechas de Pago ═══

  /** Signal: OC cuyo panel de crédito está expandido */
  creditoPanelExpandido = signal<Set<string>>(new Set());

  /** Signal: OC cuyo formulario de nueva fecha está abierto */
  creditoFormAbierto = signal<Set<string>>(new Set());

  /** Temporal: nuevas fechas en edición */
  nuevaFechaPago: Record<string, string> = {};
  nuevoMontoPago: Record<string, number> = {};
  nuevaObservacionPago: Record<string, string> = {};

  /** Toggle panel crédito */
  toggleCreditoPanel(ordenId: string): void {
    const current = new Set(this.creditoPanelExpandido());
    if (current.has(ordenId)) {
      current.delete(ordenId);
    } else {
      current.add(ordenId);
    }
    this.creditoPanelExpandido.set(current);
  }

  isCreditoPanelExpandido(ordenId: string): boolean {
    return this.creditoPanelExpandido().has(ordenId);
  }

  /** Toggle formulario nueva fecha de pago */
  toggleCreditoForm(ordenId: string): void {
    const current = new Set(this.creditoFormAbierto());
    if (current.has(ordenId)) {
      current.delete(ordenId);
    } else {
      current.add(ordenId);
      // Initialize defaults
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 30);
      this.nuevaFechaPago[ordenId] = this.formatDateISO(tomorrow);
      this.nuevoMontoPago[ordenId] = 0;
      this.nuevaObservacionPago[ordenId] = '';
    }
    this.creditoFormAbierto.set(current);
  }

  isCreditoFormAbierto(ordenId: string): boolean {
    return this.creditoFormAbierto().has(ordenId);
  }

  /** Agregar una nueva cuota de pago a crédito */
  agregarFechaPagoCredito(ordenId: string): void {
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (!orden) return;

    const fecha = this.nuevaFechaPago[ordenId];
    if (!fecha) return;

    const nuevaCuota: FechaPagoCredito = {
      id: `cuota-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      fechaPago: fecha,
      monto: this.nuevoMontoPago[ordenId] || undefined,
      observacion: this.nuevaObservacionPago[ordenId] || undefined,
      esEstimada: false,
    };

    const cuotasActuales = [...(orden.creditoFechasPago || []), nuevaCuota];
    this.updateOrdenState(ordenId, { creditoFechasPago: cuotasActuales });
    this.syncToTramite();

    // Cerrar formulario
    const current = new Set(this.creditoFormAbierto());
    current.delete(ordenId);
    this.creditoFormAbierto.set(current);
  }

  /** Eliminar una cuota de pago */
  eliminarFechaPagoCredito(ordenId: string, cuotaId: string): void {
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (!orden || !orden.creditoFechasPago) return;

    const cuotasActualizadas = orden.creditoFechasPago.filter(
      (c) => c.id !== cuotaId,
    );
    this.updateOrdenState(ordenId, { creditoFechasPago: cuotasActualizadas });
    this.syncToTramite();
  }

  /** Actualizar el plazo de crédito en días */
  actualizarPlazoCredito(ordenId: string, event: Event): void {
    const newPlazo =
      parseInt((event.target as HTMLInputElement).value, 10) || 0;
    this.updateOrdenState(ordenId, { creditoPlazosDias: newPlazo });
    this.syncToTramite();
  }

  /** Actualizar la fecha de una cuota existente */
  actualizarFechaCuota(ordenId: string, cuotaId: string, event: Event): void {
    const newDate = (event.target as HTMLInputElement).value;
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (!orden || !orden.creditoFechasPago) return;

    const cuotasActualizadas = orden.creditoFechasPago.map((c) =>
      c.id === cuotaId ? { ...c, fechaPago: newDate, esEstimada: false } : c,
    );
    this.updateOrdenState(ordenId, { creditoFechasPago: cuotasActualizadas });
    this.syncToTramite();
  }

  /** Actualizar el monto de una cuota existente */
  actualizarMontoCuota(ordenId: string, cuotaId: string, event: Event): void {
    const newMonto = parseFloat((event.target as HTMLInputElement).value) || 0;
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (!orden || !orden.creditoFechasPago) return;

    const cuotasActualizadas = orden.creditoFechasPago.map((c) =>
      c.id === cuotaId ? { ...c, monto: newMonto, esEstimada: false } : c,
    );
    this.updateOrdenState(ordenId, { creditoFechasPago: cuotasActualizadas });
    this.syncToTramite();
  }

  /** Actualizar la observación de una cuota existente */
  actualizarObservacionCuota(
    ordenId: string,
    cuotaId: string,
    event: Event,
  ): void {
    const newObs = (event.target as HTMLInputElement).value;
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (!orden || !orden.creditoFechasPago) return;

    const cuotasActualizadas = orden.creditoFechasPago.map((c) =>
      c.id === cuotaId ? { ...c, observacion: newObs } : c,
    );
    this.updateOrdenState(ordenId, { creditoFechasPago: cuotasActualizadas });
    this.syncToTramite();
  }

  /** Recalcular montos de cuotas equitativamente */
  distribuirMontosCuotas(ordenId: string): void {
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (
      !orden ||
      !orden.creditoFechasPago ||
      orden.creditoFechasPago.length === 0
    )
      return;

    const totalOC = orden.valorTotal;
    const numCuotas = orden.creditoFechasPago.length;
    const montoPorCuota = Math.round(totalOC / numCuotas);

    const cuotasActualizadas = orden.creditoFechasPago.map((c, i) => ({
      ...c,
      monto:
        i === numCuotas - 1
          ? totalOC - montoPorCuota * (numCuotas - 1) // últma cuota absorbe redondeo
          : montoPorCuota,
    }));
    this.updateOrdenState(ordenId, { creditoFechasPago: cuotasActualizadas });
    this.syncToTramite();
  }

  /** Obtener el total de las cuotas programadas */
  getTotalCuotas(orden: OrdenCompraCargada): number {
    if (!orden.creditoFechasPago) return 0;
    return orden.creditoFechasPago.reduce((s, c) => s + (c.monto || 0), 0);
  }

  /** Verificar si todas las cuotas cubren el total de la OC */
  cuotasCubrenTotal(orden: OrdenCompraCargada): boolean {
    const totalCuotas = this.getTotalCuotas(orden);
    return Math.abs(totalCuotas - orden.valorTotal) < 1;
  }

  /** Formatear fecha legible */
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

  /** Helper para formatear fecha ISO */
  private formatDateISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Check si es crédito */
  isCredito(orden: OrdenCompraCargada): boolean {
    return orden.tipoPago === 'CREDITO';
  }

  /** Validación crédito: OCs a crédito deben tener al menos una cuota */
  get creditosSinFechas(): number {
    return this.ordenesCargadas().filter(
      (o) =>
        o.tipoPago === 'CREDITO' &&
        (!o.creditoFechasPago || o.creditoFechasPago.length === 0),
    ).length;
  }

  /**
   * Count of CONTADO OCs that have NEITHER a doc attached NOR an observation,
   * plus CONTRA_ENTREGA OCs without an observation.
   */
  get ocsSinDocumentoNiObservacion(): number {
    return this.ordenesCargadas().filter(
      (o) =>
        (o.tipoPago === 'CONTADO' &&
          !o.facturaArchivo &&
          !o.observacionDocFacturacion?.trim()) ||
        (o.tipoPago === 'CONTRA_ENTREGA' &&
          !o.observacionDocFacturacion?.trim()),
    ).length;
  }

  /**
   * Checks if all OCs have their facturas, for CONTADO validation.
   */
  get todasConFactura(): boolean {
    return (
      this.ordenesCargadas().length > 0 &&
      this.ordenesCargadas().every(
        (o) => !!o.facturaArchivo && o.facturaEstadoEscaneo === 'completado',
      )
    );
  }

  /**
   * Count of OCs missing facturas (CONTADO).
   */
  get ocsSinFactura(): number {
    return this.ordenesCargadas().filter((o) => !o.facturaArchivo).length;
  }

  /**
   * Can confirm if all OCs are scanned, all have a tipoPago assigned, AND
   * each CONTADO OC has either a billing doc or an observation,
   * each CONTRA_ENTREGA OC has an observation,
   * and each CREDITO OC has at least one fecha de pago.
   */
  get puedeConfirmarContado(): boolean {
    if (!this.allScanned) return false;
    if (this.ocsSinTipoPago > 0) return false;
    if (this.ocsSinProveedorValidado > 0) return false;
    return this.ordenesCargadas().every((o) => {
      if (o.tipoPago === 'CONTADO') {
        // CONTADO: has a doc and it's fully scanned
        if (o.facturaArchivo && o.facturaEstadoEscaneo === 'completado')
          return true;
        // No doc but has an observation
        if (!o.facturaArchivo && o.observacionDocFacturacion?.trim())
          return true;
        return false;
      }
      if (o.tipoPago === 'CONTRA_ENTREGA') {
        // CONTRA_ENTREGA: must have an observation
        return !!o.observacionDocFacturacion?.trim();
      }
      if (o.tipoPago === 'CREDITO') {
        // CREDITO: must have at least one fecha de pago
        return !!o.creditoFechasPago && o.creditoFechasPago.length > 0;
      }
      return true;
    });
  }

  // ═══ OCR SCANNING (AWS Textract) ═══
  private startOCRScanning(ordenes: OrdenCompraCargada[]): void {
    this.isScanning.set(true);
    this.totalToScan.set(this.totalToScan() + ordenes.length);
    let completedCount = 0;

    ordenes.forEach((orden, idx) => {
      // Set to scanning state
      this.updateOrdenState(orden.id, {
        estadoEscaneo: 'escaneando' as EstadoEscaneo,
        progresoEscaneo: 5,
      });

      // Progress animation: 60s duration — creeps to 95% while waiting for real API
      const scanDuration = 60000;
      const progressSub = this.ocrService
        .getProgresoStream(scanDuration)
        .subscribe((progreso) => {
          this.updateOrdenState(orden.id, { progresoEscaneo: progreso });
        });

      // Real OCR via AWS Textract
      const globalIndex = this.ordenesCargadas().findIndex(
        (o) => o.id === orden.id,
      );
      this.ocrService
        .escanearArchivo(orden.archivo as File, globalIndex)
        .subscribe((result) => {
          progressSub.unsubscribe();

          if (result.estadoEscaneo === 'error') {
            this.updateOrdenState(orden.id, {
              ...result,
              estadoEscaneo: 'error' as EstadoEscaneo,
              progresoEscaneo: 0,
            });
          } else {
            this.updateOrdenState(orden.id, {
              ...result,
              progresoEscaneo: 100,
              estadoEscaneo: 'completado' as EstadoEscaneo,
            });

            this.validarProveedorOrden(orden.id);
          }

          completedCount++;
          this.scanningCount.set(completedCount);

          if (completedCount === ordenes.length) {
            this.isScanning.set(false);
            this.syncToTramite();
            // Save provider associations to backend after all OCR completes
            this.guardarProveedoresEnBackend();
          }
        });
    });
  }

  private updateOrdenState(
    id: string,
    updates: Partial<OrdenCompraCargada>,
  ): void {
    const current = this.ordenesCargadas().map((o) =>
      o.id === id ? { ...o, ...updates } : o,
    );
    this.ordenesCargadas.set(current);
  }

  // ═══ CARD ACTIONS ═══

  /** Permite editar el N° de OC extraído por OCR */
  updateNumeroOC(ordenId: string, value: string): void {
    const trimmed = value?.trim();
    if (trimmed) {
      this.updateOrdenState(ordenId, { numeroOC: trimmed });
      this.refreshSelectedOrden(ordenId);
    }
  }

  /** Actualiza cualquier campo de texto de la OC */
  updateOrdenField(ordenId: string, field: keyof OrdenCompraCargada, value: string): void {
    const trimmed = value?.trim() || '';
    this.updateOrdenState(ordenId, { [field]: trimmed } as Partial<OrdenCompraCargada>);
    this.refreshSelectedOrden(ordenId);
  }

  /** Actualiza campos financieros y recalcula IVA/Total automáticamente */
  updateOrdenFinancials(ordenId: string, field: 'valorAntesIva' | 'ivaPorcentaje', value: string): void {
    const numVal = parseFloat(value) || 0;
    const orden = this.ordenesCargadas().find(o => o.id === ordenId);
    if (!orden) return;

    let valorAntesIva = orden.valorAntesIva;
    let ivaPorcentaje = orden.ivaPorcentaje;

    if (field === 'valorAntesIva') valorAntesIva = numVal;
    if (field === 'ivaPorcentaje') ivaPorcentaje = numVal;

    const valorIva = Math.round(valorAntesIva * ivaPorcentaje) / 100;
    const valorTotal = valorAntesIva + valorIva;

    this.updateOrdenState(ordenId, { valorAntesIva, ivaPorcentaje, valorIva, valorTotal });
    this.refreshSelectedOrden(ordenId);
  }

  /** Refresca selectedOrden si está abierta en el modal */
  private refreshSelectedOrden(ordenId: string): void {
    const sel = this.selectedOrden();
    if (sel && sel.id === ordenId) {
      const updated = this.ordenesCargadas().find(o => o.id === ordenId);
      if (updated) this.selectedOrden.set({ ...updated });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Helpers para edición de ítems de la OC
  // ═══════════════════════════════════════════════════════

  /** Parsea el JSON de descripcionItems en un array de ítems editables */
  getParsedItems(descripcion: string | undefined): {
    codigo: string; producto: string; cantidad: number;
    unidadMedida: string; valorUnitario: number; valorTotal: number;
  }[] {
    if (!descripcion) return [];
    try {
      const parsed = JSON.parse(descripcion);
      if (parsed?.__items && Array.isArray(parsed.__items)) return parsed.__items;
    } catch { /* texto plano */ }
    return [];
  }

  /** Actualiza un campo de un ítem específico y serializa de vuelta a JSON */
  updateItemField(ordenId: string, itemIndex: number, field: string, rawValue: string): void {
    const orden = this.ordenesCargadas().find(o => o.id === ordenId);
    if (!orden) return;
    const items = this.getParsedItems(orden.descripcionItems);
    if (itemIndex < 0 || itemIndex >= items.length) return;
    const item = { ...items[itemIndex] };
    if (field === 'cantidad' || field === 'valorUnitario' || field === 'valorTotal') {
      (item as any)[field] = parseFloat(rawValue.replace(/[^0-9.\-]/g, '')) || 0;
      // Recalcular valorTotal cuando cambian cantidad o valorUnitario
      if (field !== 'valorTotal') {
        item.valorTotal = Math.round(item.cantidad * item.valorUnitario);
      }
    } else {
      (item as any)[field] = rawValue.trim();
    }
    items[itemIndex] = item;
    this.updateOrdenField(ordenId, 'descripcionItems', JSON.stringify({ __items: items }));
  }

  /** Añade un ítem vacío */
  addItem(ordenId: string): void {
    const orden = this.ordenesCargadas().find(o => o.id === ordenId);
    if (!orden) return;
    const items = this.getParsedItems(orden.descripcionItems);
    items.push({ codigo: '', producto: '', cantidad: 1, unidadMedida: 'UND', valorUnitario: 0, valorTotal: 0 });
    this.updateOrdenField(ordenId, 'descripcionItems', JSON.stringify({ __items: items }));
  }

  /** Elimina un ítem por índice */
  removeItem(ordenId: string, itemIndex: number): void {
    const orden = this.ordenesCargadas().find(o => o.id === ordenId);
    if (!orden) return;
    const items = this.getParsedItems(orden.descripcionItems);
    items.splice(itemIndex, 1);
    this.updateOrdenField(ordenId, 'descripcionItems', JSON.stringify({ __items: items }));
  }

  /** Suma de valorTotal de los ítems (para el subtotal de la tabla) */
  getItemsTotal(descripcion: string | undefined): number {
    return this.getParsedItems(descripcion).reduce((acc, i) => acc + (i.valorTotal || 0), 0);
  }

  viewOrden(orden: OrdenCompraCargada): void {
    this.selectedOrden.set(orden);
    this.showPreviewTab.set(false);
    this.showFacturaPreviewTab.set(false);
    this.generatePreviewUrl(orden);
    this.generateFacturaPreviewUrl(orden);
    this.showViewModal.set(true);
  }

  closeViewModal(): void {
    this.showViewModal.set(false);
    this.selectedOrden.set(null);
    this.showPreviewTab.set(false);
    this.showFacturaPreviewTab.set(false);
    this.revokePreviewUrl();
    this.revokeFacturaPreviewUrl();
  }

  togglePreviewTab(tab: 'data' | 'preview' | 'factura'): void {
    this.showPreviewTab.set(tab === 'preview');
    this.showFacturaPreviewTab.set(tab === 'factura');
  }

  private generatePreviewUrl(orden: OrdenCompraCargada): void {
    this.revokePreviewUrl();

    if (orden.archivo instanceof File) {
      const file = orden.archivo;
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf') {
        this.previewType.set('pdf');
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
        this.previewType.set('image');
      } else {
        this.previewType.set('unsupported');
        return;
      }

      const url = URL.createObjectURL(file);
      this.rawPreviewUrl = url;
      this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    } else {
      // Try to load from backend URL (S3 presigned URL)
      const stringUrl =
        orden.archivoUrl ||
        (typeof orden.archivo === 'string' ? orden.archivo : null);
      if (stringUrl) {
        const ext =
          (orden.nombreArchivo || stringUrl)
            .split('.')
            .pop()
            ?.toLowerCase()
            ?.split('?')[0] || '';
        if (ext === 'pdf') {
          this.previewType.set('pdf');
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
          this.previewType.set('image');
        } else {
          // Assume PDF for unknown extensions from S3
          this.previewType.set('pdf');
        }
        // For S3 URLs, fetch a fresh presigned URL
        if (this.tramite.id) {
          this.tramiteService
            .getPresignedUrlByOrden(this.tramite.id, orden.id)
            .subscribe({
              next: (res) => {
                if (res.url) {
                  this.previewUrl.set(
                    this.sanitizer.bypassSecurityTrustResourceUrl(res.url),
                  );
                } else {
                  this.previewUrl.set(
                    this.sanitizer.bypassSecurityTrustResourceUrl(stringUrl),
                  );
                }
              },
              error: () => {
                this.previewUrl.set(
                  this.sanitizer.bypassSecurityTrustResourceUrl(stringUrl),
                );
              },
            });
        } else {
          this.previewUrl.set(
            this.sanitizer.bypassSecurityTrustResourceUrl(stringUrl),
          );
        }
      } else {
        this.previewType.set('unsupported');
      }
    }
  }

  private generateFacturaPreviewUrl(orden: OrdenCompraCargada): void {
    this.revokeFacturaPreviewUrl();

    if (orden.facturaArchivo instanceof File) {
      const file = orden.facturaArchivo;
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf') {
        this.facturaPreviewType.set('pdf');
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
        this.facturaPreviewType.set('image');
      } else {
        this.facturaPreviewType.set('unsupported');
        return;
      }

      const url = URL.createObjectURL(file);
      this.rawFacturaPreviewUrl = url;
      this.facturaPreviewUrl.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(url),
      );
    } else if (
      typeof orden.facturaArchivo === 'string' &&
      orden.facturaArchivo
    ) {
      // Factura restored from backend — data exists but no File object
      // Preview is not available for backend-restored facturas, but OCR data is shown
      this.facturaPreviewType.set('unsupported');
    } else {
      this.facturaPreviewType.set('unsupported');
    }
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

  ngOnDestroy(): void {
    this.revokePreviewUrl();
    this.revokeFacturaPreviewUrl();
    for (const id of Array.from(this.miniFacturaRaw.keys())) this.miniLiberar(id);
  }

  confirmDelete(orden: OrdenCompraCargada): void {
    this.ordenToDelete.set(orden);
    this.showDeleteConfirm.set(true);
  }

  deleteOrden(): void {
    const toDelete = this.ordenToDelete();
    if (!toDelete) return;

    const filtered = this.ordenesCargadas().filter((o) => o.id !== toDelete.id);
    this.ordenesCargadas.set(filtered);
    this.showDeleteConfirm.set(false);
    this.ordenToDelete.set(null);
    this.syncToTramite();
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
    this.ordenToDelete.set(null);
  }

  rescanOrden(orden: OrdenCompraCargada): void {
    this.updateOrdenState(orden.id, {
      estadoEscaneo: 'pendiente' as EstadoEscaneo,
      progresoEscaneo: 0,
    });
    this.startOCRScanning([orden]);
  }

  // ═══ SYNC & CONFIRM ═══
  private syncToTramite(): void {
    this.tramite.ordenesCargadas = [...this.ordenesCargadas()];
    this.saved.emit();
  }

  confirmar(): void {
    if (!this.allScanned) return;
    if (this.ocsSinTipoPago > 0) return;
    if (this.ocsSinProveedorValidado > 0) return;
    // For CONTADO OCs, validate factura or observation
    if (this.hayContado && !this.puedeConfirmarContado) return;
    this.syncToTramite();
    this.completed.emit();
  }

  // ═══ TIPO DE PAGO ═══
  // ═══ TIPO DE PAGO (legacy compat — per-OC now) ═══
  /** @deprecated Global tipoPago no longer used. Kept for template compat. */
  tipoPago(): TipoPago | null {
    // Return 'CONTADO' if ANY OC is contado, for header display compat
    if (this.hayContado) return 'CONTADO';
    return null;
  }

  seleccionarTipoPago(tipo: TipoPago): void {
    /* no-op */
  }
  confirmarTipoPago(): void {
    /* no-op */
  }
  cambiarTipoPago(): void {
    /* no-op */
  }

  // ═══ TOGGLE VIEW ═══
  toggleVista(): void {
    this.vistaDocumentos.set(
      this.vistaDocumentos() === 'cards' ? 'tabla' : 'cards',
    );
  }

  /** Scan a factura file using the dedicated factura OCR parser and attach results to parent OC */
  private scanFacturaForOrden(
    ordenId: string,
    facturaFile: File,
    onComplete: () => void,
  ): void {
    this.updateOrdenState(ordenId, {
      facturaEstadoEscaneo: 'escaneando' as EstadoEscaneo,
      facturaProgresoEscaneo: 5,
    });

    const scanDuration = 60000;
    const progressSub = this.ocrService
      .getProgresoStream(scanDuration)
      .subscribe((progreso) => {
        this.updateOrdenState(ordenId, { facturaProgresoEscaneo: progreso });
      });

    // Use the dedicated factura OCR parser
    this.ocrService.escanearFactura(facturaFile).subscribe(async (result) => {
      if (this.ordenesCargadas().find(o => o.id === ordenId)?.facturaArchivo !== facturaFile) {progressSub.unsubscribe();onComplete();return;}
      let existeServidor = false;
      if (result.estadoEscaneo !== 'error' && result.facturaNumero?.trim()) {
        try {
          existeServidor = (await firstValueFrom(this.tramiteService.facturaExiste(result.facturaNumero, ordenId))).existe;
        } catch {
          progressSub.unsubscribe();
          this.updateOrdenState(ordenId, {facturaArchivo: undefined, facturaEstadoEscaneo: 'error', facturaProgresoEscaneo: 0,
            facturaMensaje: 'No se pudo verificar si la factura ya existe. Vuelve a adjuntarla.'});
          onComplete();return;
        }
      }
      progressSub.unsubscribe();
      if (this.ordenesCargadas().find(o => o.id === ordenId)?.facturaArchivo !== facturaFile) {onComplete();return;}
      if (result.estadoEscaneo === 'error') {
        this.updateOrdenState(ordenId, {
          facturaEstadoEscaneo: 'error' as EstadoEscaneo,
          facturaProgresoEscaneo: 0,
          facturaMensaje: result.descripcionItems || 'No se pudo analizar la factura con Textract.',
        });
      } else if (!result.facturaNumero?.trim()) {
        this.updateOrdenState(ordenId, {facturaArchivo: undefined, facturaEstadoEscaneo: 'error', facturaProgresoEscaneo: 0, facturaMensaje: 'Textract no pudo extraer el número de factura. No se adjuntó el documento.'});
      } else {
        // Duplicado: si el número extraído por Textract coincide con otra
        // factura ya adjuntada, NO se adjunta y se avisa al usuario.
        const numero = this.normalizarNumeroFactura(result.facturaNumero);
        const duplicada = existeServidor ||
          !!numero &&
          this.ordenesCargadas().some(
            (o) =>
              o.id !== ordenId &&
              o.facturaEstadoEscaneo === 'completado' &&
              this.normalizarNumeroFactura(o.facturaNumero) === numero,
          );
        if (duplicada) {
          this.miniLiberar(ordenId);
          this.updateOrdenState(ordenId, {
            facturaArchivo: undefined,
            facturaNombreArchivo: undefined,
            facturaTamanoArchivo: undefined,
            facturaEstadoEscaneo: 'error' as EstadoEscaneo,
            facturaProgresoEscaneo: 0,
            facturaNumero: '',
            facturaProveedor: '',
            facturaNitProveedor: undefined,
            facturaFechaEmision: '',
            facturaValorAntesIva: undefined,
            facturaIvaPorcentaje: undefined,
            facturaValorIva: undefined,
            facturaValorTotal: 0,
            facturaDescripcionItems: undefined,
            facturaConfianzaOCR: 0,
            comparacionCoincide: undefined,
            comparacionDiferencia: undefined,
            comparacionPorcentaje: undefined,
            comparacionDetalles: undefined,
            facturaMensaje:
              `Esta factura ya existe: el número ${result.facturaNumero} ya está registrado. No se adjuntó.`,
          });
        } else {
          this.updateOrdenState(ordenId, {
            facturaEstadoEscaneo: 'completado' as EstadoEscaneo,
            facturaProgresoEscaneo: 100,
            facturaNumero: result.facturaNumero || '',
            facturaProveedor: result.proveedor || '',
            facturaNitProveedor: result.nitProveedor,
            facturaFechaEmision: result.fechaEmision || '',
            facturaValorAntesIva: result.valorAntesIva || 0,
            facturaIvaPorcentaje: result.ivaPorcentaje || 0,
            facturaValorIva: result.valorIva || 0,
            facturaValorTotal: result.valorTotal || 0,
            facturaDescripcionItems: result.descripcionItems,
            facturaConfianzaOCR: result.confianzaOCR || 0,
            facturaMensaje: undefined,
          });

          // Auto-compare OC vs Factura
          this.compareInline(ordenId);
        }
      }

      onComplete();
    });
  }

  /** Compare OC values vs Factura values inline on the same OrdenCompraCargada */
  private compareInline(ordenId: string): void {
    const orden = this.ordenesCargadas().find((o) => o.id === ordenId);
    if (
      !orden ||
      orden.estadoEscaneo !== 'completado' ||
      orden.facturaEstadoEscaneo !== 'completado'
    )
      return;

    const diferencia = Math.abs(
      orden.valorTotal - (orden.facturaValorTotal || 0),
    );
    const porcentaje =
      orden.valorTotal > 0
        ? Math.round((diferencia / orden.valorTotal) * 10000) / 100
        : 0;
    const coincide = diferencia < 1;

    const detalles: DetalleDiferencia[] = [
      {
        campo: 'Valor Total',
        valorOC: orden.valorTotal,
        valorFactura: orden.facturaValorTotal || 0,
        estado: coincide ? 'coincide' : 'diferente',
      },
      {
        campo: 'Subtotal (sin IVA)',
        valorOC: orden.valorAntesIva,
        valorFactura: orden.facturaValorAntesIva || 0,
        estado:
          Math.abs(orden.valorAntesIva - (orden.facturaValorAntesIva || 0)) < 1
            ? 'coincide'
            : 'diferente',
      },
      {
        campo: 'IVA',
        valorOC: orden.valorIva,
        valorFactura: orden.facturaValorIva || 0,
        estado:
          Math.abs(orden.valorIva - (orden.facturaValorIva || 0)) < 1
            ? 'coincide'
            : 'diferente',
      },
      {
        campo: 'Proveedor',
        valorOC: orden.proveedor,
        valorFactura: orden.facturaProveedor || '',
        estado:
          this.normalizeStr(orden.proveedor) ===
          this.normalizeStr(orden.facturaProveedor || '')
            ? 'coincide'
            : 'advertencia',
      },
      {
        campo: '% IVA',
        valorOC: orden.ivaPorcentaje,
        valorFactura: orden.facturaIvaPorcentaje || 0,
        estado:
          orden.ivaPorcentaje === (orden.facturaIvaPorcentaje || 0)
            ? 'coincide'
            : 'advertencia',
      },
    ];

    this.updateOrdenState(ordenId, {
      comparacionCoincide: coincide,
      comparacionDiferencia: diferencia,
      comparacionPorcentaje: porcentaje,
      comparacionDetalles: detalles,
    });
  }

  private normalizeStr(s: string): string {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /** Check if any OC (contado) has discrepancies */
  get hayDiscrepancias(): boolean {
    return this.ordenesCargadas().some((o) => o.comparacionCoincide === false);
  }

  get ordenesConDiscrepancia(): OrdenCompraCargada[] {
    return this.ordenesCargadas().filter(
      (o) => o.comparacionCoincide === false,
    );
  }

  /** Check if all OCs + their facturas are fully scanned */
  get allScannedContado(): boolean {
    return (
      this.ordenesCargadas().length > 0 &&
      this.ordenesCargadas().every(
        (o) =>
          o.estadoEscaneo === 'completado' &&
          o.facturaEstadoEscaneo === 'completado',
      )
    );
  }

  // ═══ FORMAT HELPERS ═══
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getEstadoLabel(estado: EstadoEscaneo): string {
    const map: Record<EstadoEscaneo, string> = {
      pendiente: 'Pendiente',
      escaneando: 'Escaneando...',
      completado: 'Completado',
      error: 'Error',
    };
    return map[estado];
  }

  getConfianzaColor(confianza: number): string {
    if (confianza >= 90) return '#10b981';
    if (confianza >= 75) return '#f59e0b';
    return '#ef4444';
  }

  isNumber(val: any): boolean {
    return typeof val === 'number';
  }

  getFileIcon(nombre: string): string {
    const ext = nombre.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xlsx', 'xls'].includes(ext)) return 'excel';
    return 'file';
  }
}
