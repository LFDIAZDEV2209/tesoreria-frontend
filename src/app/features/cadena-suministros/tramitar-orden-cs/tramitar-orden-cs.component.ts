import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import {
  animate,
  style,
  transition,
  trigger,
  keyframes,
} from '@angular/animations';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  TramiteRequisicion,
  OrdenCompraCargada,
} from '../models/tramitar-requisicion-cs.model';
import { TramitarRequisicionCsService } from '../services/tramitar-requisicion-cs.service';
import { ComprasService } from 'src/app/features/compras/services/compras.service';
import { SolicitudCompra } from 'src/app/features/compras/models/compra.model';

/* ── Interfaces ── */
interface ProductoComparativo {
  codigo: string | null;
  producto: string | null;
  cantidad: number | null;
  kg: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
}

interface DiscrepanciaItem {
  campo: string;
  valorOC: string;
  valorSiigo: string;
  diferencia: number | null;
  porcentajeDiferencia: number | null;
  tipo: 'CRITICA' | 'ADVERTENCIA' | 'INFO';
}

interface ProductoMatch {
  productoOC: ProductoComparativo | null;
  productoSiigo: ProductoComparativo | null;
  coincide: boolean;
  diferencias: string[];
  estado: 'COINCIDE' | 'DIFERENTE' | 'SOLO_OC' | 'SOLO_SIIGO';
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

interface ResultadoComparacion {
  coincide: boolean;
  totalDiscrepancias: number;
  diferenciaTotalValor: number | null;
  porcentajeDiferenciaTotal: number | null;
  documentoSiigo: DocumentoSiigoParsed;
  discrepancias: DiscrepanciaItem[];
  matchProductos: ProductoMatch[];
}

interface TramiteComparativoRow {
  codigo: string;
  producto: string;
  cantidad: number | null;
  kg: number | null;
  valorUnitario: number | null;
  valor: number | null;
}

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

@Component({
  selector: 'app-tramitar-orden-cs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tramitar-orden-cs.component.html',
  styleUrls: ['./tramitar-orden-cs.component.scss'],
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate(
          '0.4s cubic-bezier(0.33, 1, 0.68, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('0.35s ease-out', style({ opacity: 1 })),
      ]),
    ]),
    trigger('slideUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate(
          '0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
    ]),
    trigger('alertSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(30px) scale(0.95)' }),
        animate(
          '0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'translateX(0) scale(1)' }),
        ),
      ]),
    ]),
    trigger('progressBar', [
      transition(':enter', [
        style({ width: '0%' }),
        animate('1.5s ease-out', style({ width: '*' })),
      ]),
    ]),
  ],
})
export class TramitarOrdenCsComponent implements OnInit, OnDestroy {
  /* ── Data ── */
  tramite = signal<TramiteRequisicion | null>(null);
  solicitud = signal<SolicitudCompra | null>(null);
  orden = signal<OrdenCompraCargada | null>(null);
  loading = signal(true);

  /* ── OC Products ── */
  tablaOcRows = signal<TramiteComparativoRow[]>([]);
  ocProductsLoading = signal(false);
  ocProductsError = signal('');

  /* ── SIIGO Upload & Analysis ── */
  tramitarModo = signal<'SIIGO' | 'MANUAL'>('SIIGO');
  siigoFile = signal<File | null>(null);
  siigoFileName = signal('');
  siigoUploading = signal(false);
  siigoAnalyzing = signal(false);
  siigoAnalyzingProgress = signal(0);
  siigoError = signal('');
  siigoDragOver = signal(false);

  /* ── Comparison ── */
  comparisonResult = signal<ResultadoComparacion | null>(null);
  comparisonDone = signal(false);
  showDiscrepancyDetail = signal(false);
  matchPercentage = signal(0);
  manualEditMode = signal(false);

  /* ── Manual validation ── */
  tablaValidacionRows = signal<TramiteComparativoRow[]>([]);

  /* ── Toast ── */
  private toastCounter = 0;
  toasts = signal<Array<{ id: number; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);

  /* ── OCR Data ── */
  private datosOCR = signal<DatosOCR | null>(null);

  /* ── Preview ── */
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewType = signal<'pdf' | 'image' | 'unsupported'>('pdf');
  showPreview = signal(false);
  private rawPreviewUrl: string | null = null;

  /* ── Route params ── */
  private solicitudId!: number;
  private ordenId!: string;

  /* ── Computed ── */
  discrepanciasCriticas = computed(() =>
    (this.comparisonResult()?.discrepancias ?? []).filter(d => d.tipo === 'CRITICA').length
  );
  discrepanciasAdvertencia = computed(() =>
    (this.comparisonResult()?.discrepancias ?? []).filter(d => d.tipo === 'ADVERTENCIA').length
  );
  discrepanciasInfo = computed(() =>
    (this.comparisonResult()?.discrepancias ?? []).filter(d => d.tipo === 'INFO').length
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private tramiteService: TramitarRequisicionCsService,
    private comprasService: ComprasService,
  ) {}

  ngOnInit(): void {
    this.solicitudId = +(this.route.snapshot.paramMap.get('solicitudId') ?? 0);
    this.ordenId = this.route.snapshot.paramMap.get('ordenId') ?? '';

    if (!this.solicitudId) {
      this.router.navigate(['/cadena-suministros/bandeja-visto-bueno']);
      return;
    }

    this.cargarDatos();
  }

  ngOnDestroy(): void {
    if (this.rawPreviewUrl) {
      URL.revokeObjectURL(this.rawPreviewUrl);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     DATA LOADING
     ════════════════════════════════════════════════════════════════ */

  private cargarDatos(): void {
    this.loading.set(true);

    // Load tramite
    this.tramiteService.getTramiteBySolicitudId(this.solicitudId).subscribe({
      next: (tramite) => {
        this.tramite.set(tramite);

        // Find the matching order
        if (tramite && tramite.ordenesCargadas?.length) {
          const foundOrden = this.ordenId
            ? tramite.ordenesCargadas.find(o => o.id === this.ordenId)
            : tramite.ordenesCargadas[0];

          if (foundOrden) {
            this.orden.set(foundOrden);
            if (tramite.id != null) {
              this.cargarProductosOC(tramite.id, foundOrden);
            }
            this.generarPreview(foundOrden);
          }
        }
        this.loading.set(false);
      },
      error: () => {
        this.displayToast('Error al cargar el trámite', 'error');
        this.loading.set(false);
      },
    });

    // Load solicitud
    this.comprasService.getSolicitudById(this.solicitudId).subscribe({
      next: (sol) => {
        this.solicitud.set(sol);
        this.parseDatosAdicionales((sol as any).datosAdicionales);
      },
      error: () => {},
    });
  }

  private parseDatosAdicionales(raw: string | undefined): void {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.datosOCR) {
        try {
          const ocrData: DatosOCR =
            typeof parsed.datosOCR === 'string'
              ? JSON.parse(parsed.datosOCR)
              : parsed.datosOCR;
          if (ocrData.archivos?.length) {
            this.datosOCR.set(ocrData);
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  private cargarProductosOC(tramiteId: number, orden: OrdenCompraCargada): void {
    this.ocProductsLoading.set(true);
    this.ocProductsError.set('');

    // Fallback row
    this.tablaOcRows.set([{
      codigo: orden.numeroOC,
      producto: orden.descripcionItems || 'Cargando productos...',
      cantidad: null, kg: null, valorUnitario: null,
      valor: orden.valorTotal ?? null,
    }]);

    this.http.get<ProductoComparativo[]>(
      `${environment.apiUrl}/v1/discrepancia/extraer-productos-oc/${tramiteId}/${encodeURIComponent(orden.id)}`
    ).subscribe({
      next: (productos) => {
        this.ocProductsLoading.set(false);
        if (productos?.length) {
          const rows: TramiteComparativoRow[] = productos.map(p => ({
            codigo: p.codigo ?? '—',
            producto: p.producto ?? '—',
            cantidad: p.cantidad ?? null,
            kg: p.kg ?? null,
            valorUnitario: p.valorUnitario ?? null,
            valor: p.valorTotal ?? null,
          }));
          this.tablaOcRows.set(rows);
          this.tablaValidacionRows.set(rows.map(r => ({ ...r })));
        } else {
          this.tryLocalOCRFallback(orden);
        }
      },
      error: () => {
        this.ocProductsLoading.set(false);
        this.tryLocalOCRFallback(orden);
      },
    });
  }

  private tryLocalOCRFallback(orden: OrdenCompraCargada): void {
    const productRows = this.extractProductosFromOCR(orden);
    if (productRows.length > 0) {
      this.tablaOcRows.set(productRows);
    } else {
      this.tablaOcRows.set([{
        codigo: orden.numeroOC,
        producto: orden.descripcionItems || 'Producto general',
        cantidad: null, kg: null, valorUnitario: null,
        valor: orden.valorTotal ?? null,
      }]);
    }
    this.tablaValidacionRows.set(this.tablaOcRows().map(r => ({ ...r })));
  }

  private extractProductosFromOCR(orden: OrdenCompraCargada): TramiteComparativoRow[] {
    const ocrData = this.datosOCR();
    if (!ocrData?.archivos?.length) return [];

    let archivo: ArchivoOCR | undefined;
    if (ocrData.archivos.length === 1) {
      archivo = ocrData.archivos[0];
    } else {
      const orderName = (orden.nombreArchivo || '').toLowerCase().replace(/\s+/g, '');
      archivo = ocrData.archivos.find(a =>
        (a.nombre || '').toLowerCase().replace(/\s+/g, '').includes(orderName) ||
        orderName.includes((a.nombre || '').toLowerCase().replace(/\s+/g, ''))
      ) || ocrData.archivos[0];
    }

    if (!archivo?.hojas?.length) return [];
    const rows: TramiteComparativoRow[] = [];

    for (const hoja of archivo.hojas) {
      if (!hoja.encabezados?.length || !hoja.filas?.length) continue;
      const headers = hoja.encabezados.map(h => h.toLowerCase().trim());
      const colCodigo = this.findCol(headers, ['código', 'codigo', 'cod', 'ref', 'referencia', 'item']);
      const colProducto = this.findCol(headers, ['producto', 'descripción', 'descripcion', 'detalle', 'concepto', 'artículo', 'articulo', 'nombre']);
      const colCantidad = this.findCol(headers, ['cantidad', 'cant', 'qty', 'unidades', 'und']);
      const colKg = this.findCol(headers, ['kg', 'peso', 'kilos']);
      const colValUni = this.findCol(headers, ['valor unitario', 'vr unitario', 'precio', 'precio unitario', 'vr. unit']);
      let colValTot = this.findCol(headers, ['valor total', 'total', 'vr total', 'subtotal', 'importe']);

      if (colValTot === colValUni && colValTot >= 0) {
        colValTot = -1;
        for (let i = headers.length - 1; i >= 0; i--) {
          if (i !== colValUni && (headers[i].includes('total') || headers[i].includes('importe'))) {
            colValTot = i; break;
          }
        }
      }

      if (colProducto < 0 && colCodigo < 0) continue;

      for (const fila of hoja.filas) {
        if (!fila?.length) continue;
        const joined = fila.join(' ').toLowerCase().trim();
        if (joined.startsWith('total') || joined.startsWith('subtotal') || joined.startsWith('iva') || !joined) continue;

        const codigo = colCodigo >= 0 && colCodigo < fila.length ? fila[colCodigo]?.trim() : '';
        const producto = colProducto >= 0 && colProducto < fila.length ? fila[colProducto]?.trim() : '';
        const cantidad = colCantidad >= 0 && colCantidad < fila.length ? this.parseMoneda(fila[colCantidad]) : 0;
        const kg = colKg >= 0 && colKg < fila.length ? this.parseMoneda(fila[colKg]) : 0;
        const valorUnitario = colValUni >= 0 && colValUni < fila.length ? this.parseMoneda(fila[colValUni]) : 0;
        let valorTotal = colValTot >= 0 && colValTot < fila.length ? this.parseMoneda(fila[colValTot]) : 0;

        if (!codigo && !producto) continue;
        if (!valorTotal && valorUnitario && cantidad) valorTotal = valorUnitario * cantidad;

        rows.push({
          codigo: codigo || '—', producto: producto || '—',
          cantidad: cantidad || null, kg: kg || null,
          valorUnitario: valorUnitario || null, valor: valorTotal || null,
        });
      }
    }
    return rows;
  }

  private findCol(headers: string[], keywords: string[]): number {
    for (const kw of keywords) {
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].includes(kw)) return i;
      }
    }
    return -1;
  }

  /* ════════════════════════════════════════════════════════════════
     PREVIEW
     ════════════════════════════════════════════════════════════════ */

  private generarPreview(orden: OrdenCompraCargada): void {
    const ext = (orden.nombreArchivo || '').split('.').pop()?.toLowerCase()?.split('?')[0] || '';
    this.previewType.set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext) ? 'image' : 'pdf');

    this.resolveArchivoUrl(orden).subscribe({
      next: (url) => {
        if (url) {
          this.rawPreviewUrl = url;
          this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        }
      },
    });
  }

  private resolveArchivoUrl(orden: OrdenCompraCargada): Observable<string | null> {
    const archivo = orden.archivo;
    if (archivo instanceof File) return of(URL.createObjectURL(archivo));
    if (typeof archivo === 'string' && archivo.startsWith('http') && archivo.includes('X-Amz-'))
      return of(archivo);

    const tramiteId = this.tramite()?.id;
    if (!tramiteId) return of(null);

    return this.tramiteService.getPresignedUrlByOrden(tramiteId, orden.id).pipe(
      map(res => res.url || null),
      catchError(() =>
        this.tramiteService.getOrdenesFromBackend(tramiteId).pipe(
          switchMap(backendOrdenes => {
            const match = backendOrdenes.find(b => b.nombreArchivo === orden.nombreArchivo);
            if (!match) return of(null);
            if (match.archivoUrl?.startsWith('http')) return of(match.archivoUrl);
            return this.tramiteService.getPresignedUrlByOrden(tramiteId, match.id).pipe(
              map(res => res.url || null),
              catchError(() => of(null)),
            );
          }),
          catchError(() => of(null)),
        ),
      ),
    );
  }

  togglePreview(): void {
    this.showPreview.update(v => !v);
  }

  /* ════════════════════════════════════════════════════════════════
     SIIGO FILE HANDLING
     ════════════════════════════════════════════════════════════════ */

  setModo(modo: 'SIIGO' | 'MANUAL'): void {
    this.tramitarModo.set(modo);
  }

  toggleManualEdit(): void {
    this.manualEditMode.update(v => !v);
  }

  updateSiigoProducto(index: number, field: 'producto' | 'cantidad' | 'valorUnitario' | 'valorTotal', value: any): void {
    const result = this.comparisonResult();
    if (!result) return;
    const match = result.matchProductos[index];
    if (!match) return;
    if (!match.productoSiigo) {
      match.productoSiigo = { codigo: null, producto: null, cantidad: null, kg: null, valorUnitario: null, valorTotal: null };
    }
    if (field === 'cantidad' || field === 'valorUnitario' || field === 'valorTotal') {
      match.productoSiigo[field] = value != null && value !== '' ? Number(value) : null;
    } else {
      (match.productoSiigo as any)[field] = value;
    }
    this.comparisonResult.set({ ...result });
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.siigoDragOver.set(true);
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.siigoDragOver.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.siigoDragOver.set(false);
    const files = e.dataTransfer?.files;
    if (files?.length) this.handleSiigoFile(files[0]);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleSiigoFile(input.files[0]);
      input.value = '';
    }
  }

  private handleSiigoFile(file: File): void {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.xlsx', '.xls', '.docx', '.doc'];
    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
    if (!allowed.includes(ext)) {
      this.siigoError.set('Tipo de archivo no soportado. Permitidos: PDF, imágenes, Excel, Word.');
      return;
    }
    this.siigoFile.set(file);
    this.siigoFileName.set(file.name);
    this.siigoError.set('');
    this.comparisonResult.set(null);
    this.comparisonDone.set(false);
    this.showDiscrepancyDetail.set(false);
    this.matchPercentage.set(0);
  }

  removeSiigoFile(): void {
    this.siigoFile.set(null);
    this.siigoFileName.set('');
    this.siigoError.set('');
    this.comparisonResult.set(null);
    this.comparisonDone.set(false);
    this.showDiscrepancyDetail.set(false);
    this.matchPercentage.set(0);
  }

  /* ════════════════════════════════════════════════════════════════
     ANALYSIS
     ════════════════════════════════════════════════════════════════ */

  analizarDocumentoSiigo(): void {
    const file = this.siigoFile();
    const ord = this.orden();
    if (!file || !ord) return;

    this.siigoUploading.set(true);
    this.siigoAnalyzing.set(true);
    this.siigoError.set('');
    this.siigoAnalyzingProgress.set(0);

    const progressInterval = setInterval(() => {
      const c = this.siigoAnalyzingProgress();
      if (c < 85) this.siigoAnalyzingProgress.set(c + Math.random() * 8 + 2);
    }, 500);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('ordenCompraJson', JSON.stringify({
      numeroOC: ord.numeroOC,
      proveedor: ord.proveedor,
      nitProveedor: ord.nitProveedor ?? '',
      subtotal: ord.valorAntesIva,
      iva: ord.valorIva,
      total: ord.valorTotal,
      descripcionItems: ord.descripcionItems,
      productos: this.tablaOcRows().map(r => ({
        codigo: r.codigo, producto: r.producto, cantidad: r.cantidad,
        kg: r.kg, valorUnitario: r.valorUnitario, valorTotal: r.valor,
      })),
    }));

    this.http.post<ResultadoComparacion>(
      `${environment.apiUrl}/v1/discrepancia/analizar-siigo`, formData,
    ).subscribe({
      next: (result) => {
        clearInterval(progressInterval);
        this.siigoAnalyzingProgress.set(100);

        setTimeout(() => {
          this.siigoUploading.set(false);
          this.siigoAnalyzing.set(false);
          this.comparisonResult.set(result);
          this.comparisonDone.set(true);
          this.showDiscrepancyDetail.set(!result.coincide);

          const targetPct = result.coincide
            ? 100
            : Math.max(0, 100 - (result.porcentajeDiferenciaTotal ?? 0));
          this.animateMatchPct(targetPct);

          // Show comparison result as toast
          this.showComparisonToast(result, targetPct);

          if (result.documentoSiigo?.productos?.length) {
            this.tablaValidacionRows.set(
              result.documentoSiigo.productos.map(p => ({
                codigo: p.codigo ?? '', producto: p.producto ?? '',
                cantidad: p.cantidad, kg: p.kg,
                valorUnitario: p.valorUnitario, valor: p.valorTotal,
              })),
            );
          }
        }, 600);
      },
      error: (err) => {
        clearInterval(progressInterval);
        this.siigoUploading.set(false);
        this.siigoAnalyzing.set(false);
        this.siigoAnalyzingProgress.set(0);
        const msg = err?.error?.detail || err?.error?.error || 'Error al analizar el documento SIIGO. Intente de nuevo.';
        this.siigoError.set(msg);
        this.displayToast(msg, 'error');
      },
    });
  }

  /* ════════════════════════════════════════════════════════════════
     MANUAL COMPARISON
     ════════════════════════════════════════════════════════════════ */

  addManualRow(): void {
    this.tablaValidacionRows.update(rows => [
      ...rows,
      { codigo: '', producto: '', cantidad: null, kg: null, valorUnitario: null, valor: null },
    ]);
  }

  removeManualRow(index: number): void {
    this.tablaValidacionRows.update(rows => rows.filter((_, i) => i !== index));
  }

  guardarComparacion(): void {
    const result = this.comparisonResult();
    const ord = this.orden();
    if (!result && this.tramitarModo() !== 'MANUAL') {
      this.displayToast('Primero analice un documento SIIGO o complete la validación manual', 'warning');
      return;
    }

    if (this.tramitarModo() === 'MANUAL') {
      const ocRows = this.tablaOcRows();
      const valRows = this.tablaValidacionRows();
      const diffs: string[] = [];
      const maxLen = Math.max(ocRows.length, valRows.length);

      for (let i = 0; i < maxLen; i++) {
        const ocr = ocRows[i];
        const vr = valRows[i];
        if (!ocr && vr) { diffs.push(`Producto extra en validación: ${vr.producto}`); continue; }
        if (ocr && !vr) { diffs.push(`Producto faltante: ${ocr.producto}`); continue; }
        if (!ocr || !vr) continue;
        if (ocr.valor !== vr.valor) diffs.push(`${ocr.producto}: Valor OC=${this.formatCurrency(ocr.valor ?? 0)} vs Manual=${this.formatCurrency(vr.valor ?? 0)}`);
        if (ocr.cantidad !== vr.cantidad) diffs.push(`${ocr.producto}: Cantidad OC=${ocr.cantidad ?? 0} vs Manual=${vr.cantidad ?? 0}`);
        if (ocr.valorUnitario !== vr.valorUnitario) diffs.push(`${ocr.producto}: Vr.Unit OC=${this.formatCurrency(ocr.valorUnitario ?? 0)} vs Manual=${this.formatCurrency(vr.valorUnitario ?? 0)}`);
      }

      if (diffs.length > 0) {
        const matchProductos: ProductoMatch[] = [];
        for (let i = 0; i < maxLen; i++) {
          const ocr = ocRows[i]; const vr = valRows[i];
          const pocP: ProductoComparativo | null = ocr ? { codigo: ocr.codigo, producto: ocr.producto, cantidad: ocr.cantidad, kg: ocr.kg, valorUnitario: ocr.valorUnitario, valorTotal: ocr.valor } : null;
          const psiP: ProductoComparativo | null = vr ? { codigo: vr.codigo, producto: vr.producto, cantidad: vr.cantidad, kg: vr.kg, valorUnitario: vr.valorUnitario, valorTotal: vr.valor } : null;
          const itemDiffs: string[] = [];
          if (ocr && vr) {
            if (ocr.valor !== vr.valor) itemDiffs.push(`Valor: ${this.formatCurrency(ocr.valor ?? 0)} → ${this.formatCurrency(vr.valor ?? 0)}`);
            if (ocr.cantidad !== vr.cantidad) itemDiffs.push(`Cantidad: ${ocr.cantidad ?? 0} → ${vr.cantidad ?? 0}`);
          }
          matchProductos.push({ productoOC: pocP, productoSiigo: psiP, coincide: itemDiffs.length === 0 && !!ocr && !!vr, diferencias: itemDiffs, estado: !ocr ? 'SOLO_SIIGO' : !vr ? 'SOLO_OC' : itemDiffs.length > 0 ? 'DIFERENTE' : 'COINCIDE' });
        }
        this.comparisonResult.set({
          coincide: false, totalDiscrepancias: diffs.length, diferenciaTotalValor: null, porcentajeDiferenciaTotal: null,
          documentoSiigo: { numeroDocumento: 'Validación Manual', proveedor: null, nit: null, fecha: null, subtotal: null, iva: null, total: null, productos: [], textoPlano: null },
          discrepancias: diffs.map(d => ({ campo: d, valorOC: '', valorSiigo: '', diferencia: null, porcentajeDiferencia: null, tipo: 'ADVERTENCIA' as const })),
          matchProductos,
        });
        this.comparisonDone.set(true);
        this.showDiscrepancyDetail.set(true);
        const manualPct = Math.max(0, 100 - (diffs.length * 15));
        this.animateMatchPct(manualPct);
        this.displayToast(`${manualPct}% — Se detectaron ${diffs.length} diferencia(s) en la validación manual.`, 'warning');
      } else {
        this.comparisonDone.set(true);
        this.comparisonResult.set({
          coincide: true, totalDiscrepancias: 0, diferenciaTotalValor: 0, porcentajeDiferenciaTotal: 0,
          documentoSiigo: { numeroDocumento: 'Validación Manual', proveedor: null, nit: null, fecha: null, subtotal: null, iva: null, total: null, productos: [], textoPlano: null },
          discrepancias: [], matchProductos: [],
        });
        this.animateMatchPct(100);
        this.displayToast('100% — Los datos coinciden correctamente.', 'success');
      }
    } else {
      if (result?.coincide) {
        this.displayToast('Comparación guardada exitosamente.', 'success');
      } else {
        this.displayToast('Comparación guardada con discrepancias detectadas.', 'warning');
      }
      setTimeout(() => this.volver(), 2000);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     HELPERS
     ════════════════════════════════════════════════════════════════ */

  private animateMatchPct(target: number): void {
    const step = target / 30;
    let current = 0;
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        this.matchPercentage.set(Math.round(target));
        clearInterval(interval);
      } else {
        this.matchPercentage.set(Math.round(current));
      }
    }, 30);
  }

  toggleDiscrepancyDetail(): void {
    this.showDiscrepancyDetail.update(v => !v);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  getOcProductsTotal(): number {
    return this.tablaOcRows().reduce((sum, r) => sum + (r.valor ?? 0), 0);
  }

  getSiigoProductsTotal(): number {
    const matches = this.comparisonResult()?.matchProductos ?? [];
    return matches.reduce((sum, m) => sum + (m.productoSiigo?.valorTotal ?? 0), 0);
  }

  getMatchPercentageColor(): string {
    const pct = this.matchPercentage();
    if (pct >= 95) return '#10b981';
    if (pct >= 70) return '#f59e0b';
    return '#ef4444';
  }

  getDiscrepancyTypeLabel(tipo: string): string {
    switch (tipo) {
      case 'CRITICA': return 'Crítica';
      case 'ADVERTENCIA': return 'Advertencia';
      case 'INFO': return 'Información';
      default: return tipo;
    }
  }

  getMatchStatusLabel(estado: string): string {
    switch (estado) {
      case 'COINCIDE': return 'Coincide';
      case 'DIFERENTE': return 'Diferencias';
      case 'SOLO_OC': return 'Solo en OC';
      case 'SOLO_SIIGO': return 'Solo en SIIGO';
      default: return estado;
    }
  }

  getSiigoFileIcon(): string {
    const name = this.siigoFileName().toLowerCase();
    if (name.endsWith('.pdf')) return '📄';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return '📊';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return '📝';
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return '🖼️';
    return '📎';
  }

  hasDiscrepancy(campo: string): boolean {
    return (this.comparisonResult()?.discrepancias ?? []).some(d =>
      d.campo.toLowerCase().includes(campo.toLowerCase()),
    );
  }

  countByEstado(estado: string): number {
    return (this.comparisonResult()?.matchProductos ?? []).filter(m => m.estado === estado).length;
  }

  getOcRowMatchStatus(index: number): string {
    const result = this.comparisonResult();
    if (!result?.matchProductos?.length) return '';
    const ocMatches = result.matchProductos.filter(m => m.productoOC != null);
    return index < ocMatches.length ? ocMatches[index].estado : '';
  }

  private parseMoneda(val: string | undefined): number {
    if (!val) return 0;
    let clean = val.replace(/[\$\s]/g, '').trim();
    if (!clean || /[a-zA-Z()+\/*=]/.test(clean)) return 0;
    if ((clean.match(/\./g) || []).length > 1) clean = clean.replace(/\./g, '');
    else if ((clean.match(/,/g) || []).length >= 1) clean = clean.replace(/,/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  volver(): void {
    this.router.navigate(['/cadena-suministros/visto-bueno', this.solicitudId]);
  }

  private displayToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success'): void {
    const id = this.toastCounter++;
    this.toasts.update(t => [...t, { id, message, type }]);
  }

  closeToast(id: number): void {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }

  /** Show a toast summarising comparison result (percentage + discrepancies). */
  private showComparisonToast(result: ResultadoComparacion, pct: number): void {
    if (result.coincide) {
      this.displayToast(`${pct}% — Los documentos coinciden correctamente.`, 'success');
    } else {
      const criticas  = result.discrepancias?.filter(d => d.tipo === 'CRITICA').length  ?? 0;
      const advertencias = result.discrepancias?.filter(d => d.tipo === 'ADVERTENCIA').length ?? 0;
      const parts: string[] = [];
      if (criticas > 0)     parts.push(`${criticas} crítica(s)`);
      if (advertencias > 0) parts.push(`${advertencias} advertencia(s)`);
      const detail = parts.length ? `: ${parts.join(', ')}` : '';
      const tipo: 'error' | 'warning' = criticas > 0 ? 'error' : 'warning';
      this.displayToast(`${pct}% — ${result.totalDiscrepancias} discrepancia(s)${detail}`, tipo);
    }
  }
}
