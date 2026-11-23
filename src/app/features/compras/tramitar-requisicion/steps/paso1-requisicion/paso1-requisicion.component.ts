import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TramiteRequisicion,
  OrdenCompraCargada,
  RequisicionCompra,
} from '../../models/tramitar-requisicion.model';
import {
  ESTADO_COMPRA_LABELS,
  SolicitudCompra,
  calcularSemaforo,
} from '../../../models/compra.model';

/** Labels legibles para los tipos de requerimiento */
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

/** Hoja de Excel procesada por OCR */
interface HojaExcel {
  nombre: string;
  encabezados: string[];
  filas: string[][];
  totalFilas: number;
  kvPairs?: { key: string; value: string }[];
}

/** Archivo de planeación procesado */
interface ArchivoOCR {
  nombre: string;
  tamano: string;
  hojas: HojaExcel[];
  kvPairs: { key: string; value: string }[];
  hojaActiva: number;
  fileUrl?: string;
  fileKey?: string;
  datosBodega?: Record<number, { fechaEntrega: string; observaciones: string; fechasConsumoCategoria: Record<string, string> }>;
}

/** Datos OCR completos */
interface DatosOCR {
  archivos: ArchivoOCR[];
  fechaEntrega?: string;
  fechaFinalizacion?: string;
}

@Component({
  selector: 'app-paso1-requisicion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './paso1-requisicion.component.html',
  styleUrls: ['./paso1-requisicion.component.scss'],
})
export class Paso1RequisicionComponent implements OnInit, OnChanges {
  @Input() tramite!: TramiteRequisicion;
  @Input() solicitud: SolicitudCompra | null = null;
  @Output() completed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  requisicionView = signal<RequisicionCompra>(this.emptyRequisicion());
  showImageModal = signal(false);
  modalImageUrl = signal('');
  modalImageTitle = signal('');
  datosAdicionalesParsed = signal<Record<string, any> | null>(null);

  /** Whether datos adicionales is OCR data (MATERIA_PRIMA) */
  isOCRData = signal(false);
  /** Parsed OCR structure */
  datosOCR = signal<DatosOCR | null>(null);
  /** Currently expanded archivo index */
  archivoExpandido = signal<number>(0);
  /** Active hoja index per archivo */
  hojasActivas = signal<Record<number, number>>({});
  /** Search per archivo */
  busquedas = signal<Record<number, string>>({});
  /** View mode per archivo: 'resumen' | 'detalle' */
  vistas = signal<Record<number, 'resumen' | 'detalle'>>({});
  /** Sort column per archivo */
  sortColumn = signal<Record<number, number>>({});
  /** Sort direction per archivo */
  sortDir = signal<Record<number, 'asc' | 'desc'>>({});

  // ═══ Órdenes de Compra ═══
  vistaDocumentos = signal<'cards' | 'tabla'>('cards');
  expandedOrdenIds = signal<Set<string>>(new Set());

  // Orden detail modal
  showOrdenModal = signal(false);
  selectedOrden = signal<OrdenCompraCargada | null>(null);
  modalActiveTab = signal<'data' | 'preview'>('data');

  // ── Cached computed values to prevent DOM recreation ──
  datosAdicionalesEntries = computed(() => {
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
  });

  archivos = computed(() => this.datosOCR()?.archivos || []);

  // ── TrackBy functions ──
  trackByKey = (_: number, item: { key: string }) => item.key;
  trackByIndex = (index: number) => index;
  trackByOrdenId = (_: number, item: any) => item?.id ?? item?.numeroOC ?? _;

  ngOnInit(): void {
    this.syncRequisicionView();
    this.parseDatosAdicionales();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tramite'] || changes['solicitud']) {
      this.syncRequisicionView();
      this.parseDatosAdicionales();
    }
  }

  private parseDatosAdicionales(): void {
    const raw = this.requisicionView().datosAdicionales;
    if (!raw) {
      this.datosAdicionalesParsed.set(null);
      this.isOCRData.set(false);
      this.datosOCR.set(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.datosAdicionalesParsed.set(parsed);

      // Detect OCR data (MATERIA_PRIMA)
      if (parsed && parsed.datosOCR) {
        try {
          const ocrData: DatosOCR =
            typeof parsed.datosOCR === 'string'
              ? JSON.parse(parsed.datosOCR)
              : parsed.datosOCR;
          if (ocrData.archivos && ocrData.archivos.length > 0) {
            this.isOCRData.set(true);
            this.datosOCR.set(ocrData);
            return;
          }
        } catch {
          /* not valid OCR data */
        }
      }
      this.isOCRData.set(false);
      this.datosOCR.set(null);
    } catch {
      this.datosAdicionalesParsed.set(null);
    }
  }

  confirmar(): void {
    this.completed.emit();
  }

  getEstadoSolicitudLabel(estado?: string): string {
    if (!estado) return '—';
    return ESTADO_COMPRA_LABELS[estado] || estado;
  }

  getSemaforoClass(): string {
    if (!this.solicitud) {
      return 'bg-gray-100 text-gray-700';
    }

    const color = calcularSemaforo(
      this.solicitud.diasTranscurridos,
      this.solicitud.slaDias,
    );

    if (color === 'verde') return 'bg-emerald-100 text-emerald-700';
    if (color === 'amarillo') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  }

  getSemaforoLabel(): string {
    if (!this.solicitud) return 'Sin SLA';
    const color = calcularSemaforo(
      this.solicitud.diasTranscurridos,
      this.solicitud.slaDias,
    );
    if (color === 'verde') return 'En tiempo';
    if (color === 'amarillo') return 'Precaución';
    return 'Urgente';
  }

  getTipoRequerimientoLabel(tipo?: string): string {
    if (!tipo) return '—';
    return TIPO_REQ_LABELS[tipo] || tipo;
  }

  // ═══════════════════════════════════════════════
  // Image Modal
  // ═══════════════════════════════════════════════

  openImageModal(url: string, title: string): void {
    this.modalImageUrl.set(url);
    this.modalImageTitle.set(title);
    this.showImageModal.set(true);
  }

  closeImageModal(): void {
    this.showImageModal.set(false);
  }

  isImage(url?: string): boolean {
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

  isPdf(url?: string): boolean {
    if (!url) return false;
    return url.toLowerCase().endsWith('.pdf');
  }

  getFileName(url?: string): string {
    if (!url) return 'Archivo';
    const parts = url.split('/');
    return decodeURIComponent(parts[parts.length - 1]) || 'Archivo';
  }

  // ═══════════════════════════════════════════════
  // Datos Adicionales (non-OCR, simple key-value)
  // ═══════════════════════════════════════════════

  /** @deprecated Use datosAdicionalesEntries signal instead */
  getDatosAdicionalesEntries(): { key: string; value: any }[] {
    return this.datosAdicionalesEntries();
  }

  // ═══════════════════════════════════════════════
  // OCR Data Methods (MATERIA_PRIMA)
  // ═══════════════════════════════════════════════

  /** @deprecated Use archivos signal instead */
  getArchivos(): ArchivoOCR[] {
    return this.archivos();
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
    const colIdx = this.sortColumn()[archivoIdx];
    if (colIdx !== undefined) {
      const dir = this.sortDir()[archivoIdx] || 'asc';
      filas = [...filas].sort((a, b) => {
        const va = a[colIdx] || '';
        const vb = b[colIdx] || '';
        const na = this.parseMoneda(va);
        const nb = this.parseMoneda(vb);
        if (na !== 0 || nb !== 0) return dir === 'asc' ? na - nb : nb - na;
        return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return filas;
  }

  sortBy(archivoIdx: number, colIdx: number): void {
    const currentCol = this.sortColumn()[archivoIdx];
    if (currentCol === colIdx) {
      if ((this.sortDir()[archivoIdx] || 'asc') === 'asc') {
        this.sortDir.update((d) => ({ ...d, [archivoIdx]: 'desc' }));
      } else {
        this.sortColumn.update((c) => { const n = { ...c }; delete n[archivoIdx]; return n; });
        this.sortDir.update((d) => { const n = { ...d }; delete n[archivoIdx]; return n; });
      }
    } else {
      this.sortColumn.update((c) => ({ ...c, [archivoIdx]: colIdx }));
      this.sortDir.update((d) => ({ ...d, [archivoIdx]: 'asc' }));
    }
  }

  getSortIndicator(archivoIdx: number, colIdx: number): string {
    if (this.sortColumn()[archivoIdx] !== colIdx) return '';
    return this.sortDir()[archivoIdx] === 'asc' ? ' ▲' : ' ▼';
  }

  getColumnTotals(archivo: ArchivoOCR, archivoIdx: number): (string | null)[] {
    const hoja = this.getHojaData(archivo, archivoIdx);
    if (!hoja) return [];
    const filas = this.getFilasVisibles(archivo, archivoIdx);
    if (!filas.length) return [];
    const totals: (string | null)[] = [];
    let hasAny = false;
    for (let c = 0; c < hoja.encabezados.length; c++) {
      let sum = 0;
      let cnt = 0;
      for (const fila of filas) {
        if (this.isNumericCell(fila[c])) {
          sum += this.parseMoneda(fila[c]);
          cnt++;
        }
      }
      if (cnt >= 2) {
        totals.push(this.formatMoneda(sum));
        hasAny = true;
      } else {
        totals.push(null);
      }
    }
    return hasAny ? totals : [];
  }

  getCategoriasDeHoja(archivo: ArchivoOCR, hojaIdx: number): string[] {
    const hoja = archivo.hojas?.[hojaIdx];
    if (!hoja) return [];
    const catIdx = hoja.encabezados.findIndex((h) =>
      /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h),
    );
    if (catIdx < 0) return [];
    const cats = new Set<string>();
    hoja.filas.forEach((fila) => {
      const val = fila[catIdx]?.trim();
      if (val && !/^costo/i.test(val)) cats.add(val);
    });
    return Array.from(cats);
  }

  getCostoPorCategoria(archivo: ArchivoOCR, hojaIdx: number): { categoria: string; costo: number }[] {
    const hoja = archivo.hojas?.[hojaIdx];
    if (!hoja) return [];
    const catIdx = hoja.encabezados.findIndex((h) =>
      /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h),
    );
    const costoIdx = hoja.encabezados.findIndex((h) =>
      /\bcosto\b/i.test(h.trim()),
    );
    if (catIdx < 0 || costoIdx < 0) return [];
    const agrupado = new Map<string, number>();
    for (const fila of hoja.filas) {
      const catRaw = fila[catIdx]?.trim() || '';
      if (!catRaw || /^costo/i.test(catRaw)) continue;
      const valor = this.parseMoneda(fila[costoIdx]);
      if (valor > 0) agrupado.set(catRaw.toUpperCase(), (agrupado.get(catRaw.toUpperCase()) || 0) + valor);
    }
    return Array.from(agrupado.entries()).map(([categoria, costo]) => ({ categoria, costo }));
  }

  getCostoTotal(archivo: ArchivoOCR, hojaIdx: number): number {
    return this.getCostoPorCategoria(archivo, hojaIdx).reduce((a, i) => a + i.costo, 0);
  }

  getInfoHojaActiva(archivo: ArchivoOCR, hojaIdx: number): { key: string; value: string }[] {
    const hoja = archivo.hojas?.[hojaIdx] || archivo.hojas?.[0];
    if (hoja?.kvPairs?.length) return hoja.kvPairs;
    return archivo.kvPairs || [];
  }

  getDatosBodega(archivo: ArchivoOCR, hojaIdx: number): { fechaEntrega: string; observaciones: string; fechasConsumoCategoria: Record<string, string> } {
    return (archivo as any).datosBodega?.[hojaIdx] || { fechaEntrega: '', observaciones: '', fechasConsumoCategoria: {} };
  }

  getFechaEntrega(): string { return this.datosOCR()?.fechaEntrega || ''; }
  getFechaFinalizacion(): string { return this.datosOCR()?.fechaFinalizacion || ''; }

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
        /categor[ií]a|asignaci[oó]n|clasificaci[oó]n|tipo/i.test(h),
      );
      const precioIdx = hoja.encabezados.findIndex((h) =>
        /\bprecio\b/i.test(h.trim()),
      );
      // Priorizar "costo total" sobre "costo" genérico
      let costoIdx = hoja.encabezados.findIndex((h) =>
        /costo\s*total/i.test(h.trim()),
      );
      if (costoIdx < 0) {
        costoIdx = hoja.encabezados.findIndex(
          (h) =>
            /\bcosto\b/i.test(h.trim()) &&
            !/costo\s+compras/i.test(h.trim()),
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

  getFileIcon(nombre: string): string {
    if (nombre.match(/\.xlsx?$/i)) return '📊';
    if (nombre.endsWith('.pdf')) return '📄';
    if (nombre.match(/\.(png|jpg|jpeg)$/i)) return '🖼️';
    return '📁';
  }

  // ═══════════════════════════════════════════════
  // Órdenes de Compra
  // ═══════════════════════════════════════════════

  get totalOrdenes(): number {
    return this.tramite?.ordenesCargadas?.length ?? 0;
  }

  get totalSubtotal(): number {
    return (
      this.tramite?.ordenesCargadas?.reduce((s, o) => s + o.valorAntesIva, 0) ??
      0
    );
  }

  get totalIVA(): number {
    return (
      this.tramite?.ordenesCargadas?.reduce((s, o) => s + o.valorIva, 0) ?? 0
    );
  }

  get totalGeneral(): number {
    return (
      this.tramite?.ordenesCargadas?.reduce((s, o) => s + o.valorTotal, 0) ?? 0
    );
  }

  get conteoContado(): number {
    return (
      this.tramite?.ordenesCargadas?.filter((o) => o.tipoPago === 'CONTADO')
        .length ?? 0
    );
  }

  get conteoCredito(): number {
    return (
      this.tramite?.ordenesCargadas?.filter((o) => o.tipoPago === 'CREDITO')
        .length ?? 0
    );
  }

  get conteoContraEntrega(): number {
    return (
      this.tramite?.ordenesCargadas?.filter(
        (o) => o.tipoPago === 'CONTRA_ENTREGA',
      ).length ?? 0
    );
  }

  get ocsSinTipoPago(): number {
    return (
      this.tramite?.ordenesCargadas?.filter((o) => !o.tipoPago).length ?? 0
    );
  }

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

  getConfianzaColor(confianza: number): string {
    if (confianza >= 80) return '#10b981';
    if (confianza >= 50) return '#f59e0b';
    return '#ef4444';
  }

  getOrderFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext))
      return 'image';
    return 'other';
  }

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

  toggleOrdenExpand(id: string): void {
    this.expandedOrdenIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isOrdenExpanded(id: string): boolean {
    return this.expandedOrdenIds().has(id);
  }

  viewOrdenFile(orden: OrdenCompraCargada): void {
    const url = orden.archivoUrl;
    if (url) {
      if (this.isImageUrl(url)) {
        this.openImageModal(url, orden.nombreArchivo || 'Orden de Compra');
      } else {
        window.open(url, '_blank', 'noopener');
      }
    }
  }

  getTipoPagoLabel(tipoPago?: string): string {
    if (tipoPago === 'CONTRA_ENTREGA') return 'Contra Entrega';
    if (tipoPago === 'CREDITO') return 'Crédito';
    if (tipoPago === 'CONTADO') return 'Contado';
    return '—';
  }

  getParsedItems(descripcion: string | undefined): { codigo: string; producto: string; cantidad: number; unidadMedida: string; valorUnitario: number; valorTotal: number }[] {
    if (!descripcion) return [];
    try {
      const parsed = JSON.parse(descripcion);
      if (parsed?.__items && Array.isArray(parsed.__items)) return parsed.__items;
    } catch { /* plain text */ }
    return [];
  }

  viewOrdenDetail(orden: OrdenCompraCargada): void {
    this.selectedOrden.set(orden);
    this.modalActiveTab.set('data');
    this.showOrdenModal.set(true);
  }

  closeOrdenModal(): void {
    this.showOrdenModal.set(false);
    this.selectedOrden.set(null);
  }

  // ═══════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════

  private parseMoneda(val: string | undefined): number {
    if (!val) return 0;
    let clean = val.replace(/[\$\s]/g, '').trim();
    if (!clean) return 0;
    if (/[a-zA-Z()+\/*=]/.test(clean)) return 0;
    const dots = (clean.match(/\./g) || []).length;
    const commas = (clean.match(/,/g) || []).length;
    if (dots > 1) {
      clean = clean.replace(/\./g, '');
    } else if (dots === 1 && commas === 0) {
      if ((clean.split('.')[1] || '').length === 3) clean = clean.replace('.', '');
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

  private syncRequisicionView(): void {
    this.requisicionView.set(this.buildRequisicionView());
  }

  private buildRequisicionView(): RequisicionCompra {
    const base = this.tramite?.requisicion ?? this.emptyRequisicion();
    const solicitud = this.solicitud;

    return {
      ...base,
      numeroRequisicion:
        base.numeroRequisicion || solicitud?.codigoSolicitud || '',
      fecha: base.fecha || solicitud?.fechaSolicitud || '',
      solicitante: base.solicitante || solicitud?.solicitante || '',
      areaCentroCosto: base.areaCentroCosto || solicitud?.areaSolicitante || '',
      descripcionBreve:
        base.descripcionBreve ||
        solicitud?.observaciones ||
        'Sin observaciones adicionales.',
      cargo: base.cargo || solicitud?.cargo,
      correoElectronico: base.correoElectronico || solicitud?.correoElectronico,
      telefonoContacto: base.telefonoContacto || solicitud?.telefonoContacto,
      tipoRequerimiento: base.tipoRequerimiento || solicitud?.tipoRequerimiento,
      otroRequerimiento: base.otroRequerimiento || solicitud?.otroRequerimiento,
      esCompra: base.esCompra ?? solicitud?.esCompra,
      empresaCentroCostos:
        base.empresaCentroCostos || solicitud?.empresaCentroCostos,
      evidenciaUrl: base.evidenciaUrl || solicitud?.evidenciaUrl,
      vistoBuenoUrl: base.vistoBuenoUrl || solicitud?.vistoBuenoUrl,
      datosAdicionales: base.datosAdicionales || solicitud?.datosAdicionales,
      estado: solicitud?.estado || base.estado,
      creadoPor: base.creadoPor || solicitud?.creadoPor,
      fechaCreacion: base.fechaCreacion || solicitud?.fechaCreacion,
      valorEstimado: base.valorEstimado,
      tipoCompra: base.tipoCompra || 'General',
    };
  }

  private emptyRequisicion(): RequisicionCompra {
    return {
      numeroRequisicion: '',
      fecha: '',
      solicitante: '',
      areaCentroCosto: '',
      tipoCompra: '',
      descripcionBreve: '',
    };
  }
}
