import { Component, Input, signal, computed, OnInit, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from 'src/environments/environment';


// ─── Interfaces ─────────────────────────────────
interface TextractResponse {
  plainText: string;
  tables: string[][][];
  keyValuePairs: { key: string; value: string }[];
  sheetNames?: string[];
  fileKey?: string;
  fileUrl?: string;
}

export interface HojaExcel {
  nombre: string;
  encabezados: string[];
  filas: string[][];
  totalFilas: number;
  kvPairs: { key: string; value: string }[];
}

/** Datos por bodega (hoja/pestaña) */
export interface DatosBodega {
  fechaEntrega: string;
  observaciones: string;
  fechasConsumoCategoria: Record<string, string>;
}

/** Representa un archivo Excel procesado */
export interface ArchivoPlaneacion {
  id: number;
  nombre: string;
  tamano: string;
  estado: 'uploading' | 'done' | 'error';
  progreso: number;
  error?: string;
  hojas: HojaExcel[];
  kvPairs: { key: string; value: string }[];
  hojaActiva: number;
  fileKey?: string;
  fileUrl?: string;
  datosBodega: Record<number, DatosBodega>;
}

/** Borrador guardado en localStorage */
export interface Borrador {
  id: string;
  nombre: string;
  fechaGuardado: string;
  empresa: string;
  area: string;
  totalArchivos: number;
  datos: {
    archivos: any[];
    fechaEntrega: string;
    fechaFinalizacion: string;
  };
}


@Component({
  selector: 'app-materia-prima-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './materia-prima-fields.component.html',
  styleUrls: ['../_shared-form.scss', './materia-prima-fields.component.scss']
})
export class MateriaPrimaFieldsComponent implements OnInit {
  @Input() formGroup!: FormGroup;
  @Input() empresaNombre: string = '';
  @Input() areaNombre: string = '';

  // ─── Archivos cargados ────────────────────────
  archivos = signal<ArchivoPlaneacion[]>([]);
  isDragOver = signal(false);
  private nextId = 1;

  // ─── Fechas extraídas automáticamente del OCR ─
  fechaEntrega = signal<string>('');
  fechaFinalizacion = signal<string>('');

  // ─── Archivo activo (expandido) ───────────────
  archivoExpandido = signal<number | null>(null);

  // ─── Vista: 'resumen' | 'detalle' por archivo ─
  vistas = signal<Record<number, 'resumen' | 'detalle'>>({});

  // ─── Búsqueda por archivo ─────────────────────
  busquedas = signal<Record<number, string>>({});

  // ─── Ordenamiento de columnas ─────────────────
  sortColumn = signal<Record<number, number>>({});
  sortDirection = signal<Record<number, 'asc' | 'desc'>>({});

  // ─── Vista previa de documento ─────────────────
  previewArchivo = signal<ArchivoPlaneacion | null>(null);
  previewHojaActiva = signal<number>(0);

  // ─── Borradores ──────────────────────────────
  borradores = signal<Borrador[]>([]);
  mostrarBorradores = signal(false);
  mostrarModalBorrador = signal(false);
  nombreBorrador = signal('');
  guardadoExitoso = signal(false);
  borradorAEliminar = signal<string | null>(null);

  private readonly STORAGE_KEY = 'mp_borradores_v1';
  private readonly textractUrl = `${environment.apiUrl}/v1/textract/upload-and-analyze`;
  private progressTimers: Record<number, any> = {};

  // ─── Caches para evitar parpadeo en *ngFor ────
  private _costoCatCache = new Map<string, { categoria: string; costo: number }[]>();
  private _costoTotalCache = new Map<string, number>();


  constructor(private http: HttpClient, private sanitizer: DomSanitizer, private elRef: ElementRef) {}


  // ═══════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════

  ngOnInit(): void {
    this.restaurarEstado();
    this.cargarBorradores();
  }

  private restaurarEstado(): void {
    const raw = this.formGroup.get('datosOCR')?.value;
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (!data?.archivos?.length) return;
      const archivosRestaurados: ArchivoPlaneacion[] = data.archivos.map((a: any, idx: number) => {
        const id = this.nextId++;
        return {
          id,
          nombre: a.nombre || `Archivo ${idx + 1}`,
          tamano: a.tamano || '',
          estado: 'done' as const,
          progreso: 100,
          hojas: a.hojas || [],
          kvPairs: a.kvPairs || [],
          hojaActiva: a.hojaActiva || 0,
          fileKey: a.fileKey || undefined,
          fileUrl: a.fileUrl || undefined,
          datosBodega: a.datosBodega || {}
        };
      });
      this.archivos.set(archivosRestaurados);
      if (archivosRestaurados.length > 0) {
        this.archivoExpandido.set(archivosRestaurados[0].id);
      }
      if (data.fechaEntrega) this.fechaEntrega.set(data.fechaEntrega);
      if (data.fechaFinalizacion) this.fechaFinalizacion.set(data.fechaFinalizacion);
    } catch (e) {}
  }


  // ═══════════════════════════════════════════════
  // Computed helpers
  // ═══════════════════════════════════════════════

  totalArchivos = computed(() => this.archivos().length);
  archivosListos = computed(() => this.archivos().filter(a => a.estado === 'done').length);

  getVista(id: number): 'resumen' | 'detalle' {
    return this.vistas()[id] || 'resumen';
  }

  getBusqueda(id: number): string {
    return this.busquedas()[id] || '';
  }

  getHojaActiva(archivo: ArchivoPlaneacion): HojaExcel | null {
    return archivo.hojas[archivo.hojaActiva] || null;
  }

  getFilasVisibles(archivo: ArchivoPlaneacion): string[][] {
    const hoja = this.getHojaActiva(archivo);
    if (!hoja) return [];
    let filas = hoja.filas;
    const q = this.getBusqueda(archivo.id).toLowerCase().trim();
    if (q) {
      filas = filas.filter(fila => fila.some(c => c.toLowerCase().includes(q)));
    }
    const colIdx = this.sortColumn()[archivo.id];
    if (colIdx !== undefined && colIdx >= 0) {
      const dir = this.sortDirection()[archivo.id] || 'asc';
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

  sortBy(archivoId: number, colIdx: number): void {
    const currentCol = this.sortColumn()[archivoId];
    const currentDir = this.sortDirection()[archivoId] || 'asc';
    if (currentCol === colIdx) {
      if (currentDir === 'asc') {
        this.sortDirection.update(d => ({ ...d, [archivoId]: 'desc' }));
      } else {
        this.sortColumn.update(c => { const n = { ...c }; delete n[archivoId]; return n; });
        this.sortDirection.update(d => { const n = { ...d }; delete n[archivoId]; return n; });
      }
    } else {
      this.sortColumn.update(c => ({ ...c, [archivoId]: colIdx }));
      this.sortDirection.update(d => ({ ...d, [archivoId]: 'asc' }));
    }
  }

  getSortIndicator(archivoId: number, colIdx: number): string {
    if (this.sortColumn()[archivoId] !== colIdx) return '';
    return this.sortDirection()[archivoId] === 'asc' ? ' ▲' : ' ▼';
  }

  getColumnTotals(archivo: ArchivoPlaneacion): (string | null)[] {
    const hoja = this.getHojaActiva(archivo);
    if (!hoja) return [];
    const filas = this.getFilasVisibles(archivo);
    if (filas.length === 0) return [];
    const totals: (string | null)[] = [];
    let hasAnyTotal = false;
    for (let c = 0; c < hoja.encabezados.length; c++) {
      let sum = 0;
      let numericCount = 0;
      for (const fila of filas) {
        if (this.isNumericCell(fila[c])) {
          sum += this.parseMoneda(fila[c]);
          numericCount++;
        }
      }
      if (numericCount >= 2) {
        totals.push(this.formatMoneda(sum));
        hasAnyTotal = true;
      } else {
        totals.push(null);
      }
    }
    return hasAnyTotal ? totals : [];
  }

  getInfoHojaActiva(archivo: ArchivoPlaneacion): { key: string; value: string }[] {
    const hoja = archivo.hojas[archivo.hojaActiva] || archivo.hojas[0];
    if (hoja?.kvPairs?.length > 0) return hoja.kvPairs;
    return archivo.kvPairs;
  }

  getResumen(archivo: ArchivoPlaneacion): {
    totalFilas: number; totalHojas: number; nombreHoja: string;
    categorias: string[]; campos: { key: string; value: string }[];
    totalPrecio: number; totalCosto: number;
  } {
    const totalHojas = archivo.hojas.length;
    const hoja = archivo.hojas[archivo.hojaActiva] || archivo.hojas[0];
    if (!hoja) {
      return { totalFilas: 0, totalHojas, nombreHoja: '', categorias: [], campos: archivo.kvPairs, totalPrecio: 0, totalCosto: 0 };
    }
    const totalFilas = hoja.totalFilas;
    const nombreHoja = hoja.nombre;
    const categorias = new Set<string>();
    let totalPrecio = 0;
    const catIdx = hoja.encabezados.findIndex(h => /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h));
    const precioIdx = hoja.encabezados.findIndex(h => /\bprecio\b/i.test(h.trim()));
    hoja.filas.forEach(fila => {
      if (catIdx >= 0) {
        const val = fila[catIdx]?.trim();
        if (val && !/costo/i.test(val)) categorias.add(val);
      }
      if (precioIdx >= 0) {
        totalPrecio += this.parseMoneda(fila[precioIdx]);
      }
    });
    const totalCosto = this.getCostoTotalHoja(archivo, archivo.hojaActiva);
    return {
      totalFilas, totalHojas, nombreHoja,
      categorias: Array.from(categorias).slice(0, 12),
      campos: archivo.kvPairs, totalPrecio, totalCosto
    };
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
    } else if (dots === 1 && commas === 0) {
      const afterDot = clean.split('.')[1] || '';
      if (afterDot.length === 3) {
        clean = clean.replace('.', '');
      }
    } else if (commas >= 1) {
      clean = clean.replace(/,/g, '');
    }
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  formatMoneda(valor: number): string {
    if (valor === 0) return '$0';
    return '$' + valor.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }


  // ═══════════════════════════════════════════════
  // Drag & Drop + File select
  // ═══════════════════════════════════════════════

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        this.agregarArchivo(files[i]);
      }
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      for (let i = 0; i < input.files.length; i++) {
        this.agregarArchivo(input.files[i]);
      }
      input.value = '';
    }
  }

  agregarArchivo(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const permitidos = ['xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'];
    if (!permitidos.includes(ext)) return;
    const id = this.nextId++;
    const archivo: ArchivoPlaneacion = {
      id,
      nombre: file.name,
      tamano: this.formatFileSize(file.size),
      estado: 'uploading',
      progreso: 0,
      hojas: [],
      kvPairs: [],
      hojaActiva: 0,
      datosBodega: {}
    };
    this.archivos.update(arr => [...arr, archivo]);
    this.archivoExpandido.set(id);
    this.subirArchivo(id, file);
  }


  // ═══════════════════════════════════════════════
  // Upload + procesamiento
  // ═══════════════════════════════════════════════

  private subirArchivo(id: number, file: File): void {
    let step = 0;
    this.progressTimers[id] = setInterval(() => {
      step++;
      const ratio = step / 50;
      const progreso = Math.min(Math.round(92 * (1 - Math.pow(1 - ratio, 2.8))), 92);
      this.updateArchivo(id, { progreso });
      if (step >= 50) clearInterval(this.progressTimers[id]);
    }, 200);

    const formData = new FormData();
    formData.append('file', file);

    this.http.post<TextractResponse>(this.textractUrl, formData).subscribe({
      next: (response) => {
        clearInterval(this.progressTimers[id]);
        const hojas = this.procesarRespuesta(response);
        this.updateArchivo(id, {
          estado: 'done',
          progreso: 100,
          hojas,
          kvPairs: response.keyValuePairs || [],
          fileKey: response.fileKey,
          fileUrl: response.fileUrl
        });
        this.extraerFechasDeHojas(hojas);
        this.invalidarCacheCostos();
        this.persistirDatos();
      },
      error: (err) => {
        clearInterval(this.progressTimers[id]);
        const detail = err?.error?.detail || err?.error?.error || err?.message || 'Error desconocido';
        this.updateArchivo(id, { estado: 'error', progreso: 0, error: detail });
      }
    });
  }

  private procesarRespuesta(response: TextractResponse): HojaExcel[] {
    const tables = response.tables || [];
    if (tables.length === 0) {
      const lineas = (response.plainText || '').split('\n').filter(l => l.trim());
      if (lineas.length > 0) {
        return [{ nombre: 'Datos Extraídos', encabezados: ['Contenido'], filas: lineas.map(l => [l]), totalFilas: lineas.length, kvPairs: [] }];
      }
      return [];
    }
    const nombres = response.sheetNames || [];
    const knownKeys = /^(union\s+temporal|bodega|n[°º]\s*documento|fecha\s+de\s+env[ií]o|necesidad|rps|ciclo)/i;
    return tables.map((tabla, idx) => {
      const encabezados = tabla.length > 0 ? tabla[0] : [];
      const filas = tabla.length > 1 ? tabla.slice(1) : [];
      const kvPairs: { key: string; value: string }[] = [];
      for (const fila of filas) {
        let found = false;
        for (let c = 0; c < fila.length - 1; c++) {
          const cell = fila[c]?.trim().replace(/:$/, '') || '';
          if (cell && knownKeys.test(cell)) {
            const val = fila[c + 1]?.trim() || '';
            if (val) { kvPairs.push({ key: cell.toUpperCase(), value: val }); found = true; }
          }
        }
        if (!found && kvPairs.length > 0) break;
      }
      return { nombre: nombres[idx] || `Hoja ${idx + 1}`, encabezados, filas, totalFilas: filas.length, kvPairs };
    });
  }

  private extraerFechasDeHojas(hojas: HojaExcel[]): void {
    if (this.fechaEntrega()) return;
    for (const hoja of hojas) {
      const fechaEntregaIdx = hoja.encabezados.findIndex(h => /fecha.*entrega/i.test(h));
      const diaConsumoIdx = hoja.encabezados.findIndex(h => /dia.*consum|d[ií]a.*consum/i.test(h));
      if (fechaEntregaIdx >= 0) {
        const fechas = hoja.filas.map(f => f[fechaEntregaIdx]?.trim()).filter(v => v && v.length > 0);
        if (fechas.length > 0 && !this.fechaEntrega()) this.fechaEntrega.set(fechas[0]);
      }
      if (diaConsumoIdx >= 0) {
        const dias = hoja.filas.map(f => f[diaConsumoIdx]?.trim()).filter(v => v && v.length > 0);
        if (dias.length > 0 && !this.fechaFinalizacion()) this.fechaFinalizacion.set(dias[dias.length - 1]);
      }
      if (this.fechaEntrega() && this.fechaFinalizacion()) break;
    }
  }

  private updateArchivo(id: number, changes: Partial<ArchivoPlaneacion>): void {
    this.archivos.update(arr => arr.map(a => a.id === id ? { ...a, ...changes } : a));
  }

  private persistirDatos(): void {
    const archivosListos = this.archivos().filter(a => a.estado === 'done');
    this.formGroup.patchValue({
      datosOCR: JSON.stringify({
        archivos: archivosListos.map(a => ({
          nombre: a.nombre, tamano: a.tamano, hojas: a.hojas, kvPairs: a.kvPairs,
          hojaActiva: a.hojaActiva, fileKey: a.fileKey, fileUrl: a.fileUrl, datosBodega: a.datosBodega
        })),
        fechaEntrega: this.fechaEntrega(),
        fechaFinalizacion: this.fechaFinalizacion()
      })
    });
  }


  // ═══════════════════════════════════════════════
  // Acciones UI
  // ═══════════════════════════════════════════════

  toggleExpand(id: number): void {
    this.archivoExpandido.update(v => v === id ? null : id);
  }

  cambiarVista(id: number, vista: 'resumen' | 'detalle'): void {
    this.vistas.update(v => ({ ...v, [id]: vista }));
  }

  cambiarHoja(archivoId: number, hojaIdx: number): void {
    this.updateArchivo(archivoId, { hojaActiva: hojaIdx });
  }

  onBusqueda(id: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.busquedas.update(b => ({ ...b, [id]: val }));
  }

  getDatosBodega(archivoId: number, hojaIdx: number): DatosBodega {
    const archivo = this.archivos().find(a => a.id === archivoId);
    return archivo?.datosBodega?.[hojaIdx] || { fechaEntrega: '', observaciones: '', fechasConsumoCategoria: {} };
  }

  getCategoriasDeHoja(archivo: ArchivoPlaneacion, hojaIdx: number): string[] {
    const hoja = archivo.hojas[hojaIdx];
    if (!hoja) return [];
    const catIdx = hoja.encabezados.findIndex(h => /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h));
    if (catIdx < 0) return [];
    const cats = new Set<string>();
    hoja.filas.forEach(fila => {
      const val = fila[catIdx]?.trim();
      if (val && !/costo/i.test(val)) cats.add(val);
    });
    return Array.from(cats);
  }

  getCostoPorCategoria(archivo: ArchivoPlaneacion, hojaIdx: number): { categoria: string; costo: number }[] {
    const cacheKey = `${archivo.id}-${hojaIdx}`;
    if (this._costoCatCache.has(cacheKey)) return this._costoCatCache.get(cacheKey)!;
    const hoja = archivo.hojas[hojaIdx];
    if (!hoja) return [];
    const catIdx = hoja.encabezados.findIndex(h => /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h));
    const costoIdx = hoja.encabezados.findIndex(h => /\bcosto\b/i.test(h.trim()));
    if (catIdx < 0 || costoIdx < 0) { this._costoCatCache.set(cacheKey, []); return []; }
    const agrupado = new Map<string, number>();
    for (const fila of hoja.filas) {
      const catRaw = fila[catIdx]?.trim() || '';
      if (!catRaw || /^costo/i.test(catRaw)) continue;
      const catName = catRaw.toUpperCase();
      const valor = this.parseMoneda(fila[costoIdx]);
      if (valor > 0) agrupado.set(catName, (agrupado.get(catName) || 0) + valor);
    }
    const result = Array.from(agrupado.entries()).map(([categoria, costo]) => ({ categoria, costo }));
    this._costoCatCache.set(cacheKey, result);
    return result;
  }

  getCostoTotalHoja(archivo: ArchivoPlaneacion, hojaIdx: number): number {
    const cacheKey = `${archivo.id}-${hojaIdx}`;
    if (this._costoTotalCache.has(cacheKey)) return this._costoTotalCache.get(cacheKey)!;
    const total = this.getCostoPorCategoria(archivo, hojaIdx).reduce((acc, item) => acc + item.costo, 0);
    this._costoTotalCache.set(cacheKey, total);
    return total;
  }

  private invalidarCacheCostos(): void {
    this._costoCatCache.clear();
    this._costoTotalCache.clear();
  }

  onFechaEntregaBodegaChange(archivoId: number, hojaIdx: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.updateDatosBodega(archivoId, hojaIdx, { fechaEntrega: val });
  }

  onObservacionesBodegaChange(archivoId: number, hojaIdx: number, event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.updateDatosBodega(archivoId, hojaIdx, { observaciones: val });
  }

  onFechaConsumoCategoriaChange(archivoId: number, hojaIdx: number, categoria: string, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    const actual = this.getDatosBodega(archivoId, hojaIdx);
    const nuevasFechas = { ...actual.fechasConsumoCategoria, [categoria]: val };
    this.updateDatosBodega(archivoId, hojaIdx, { fechasConsumoCategoria: nuevasFechas });
  }

  private updateDatosBodega(archivoId: number, hojaIdx: number, changes: Partial<DatosBodega>): void {
    const archivo = this.archivos().find(a => a.id === archivoId);
    if (!archivo) return;
    const actual = archivo.datosBodega?.[hojaIdx] || { fechaEntrega: '', observaciones: '', fechasConsumoCategoria: {} };
    const updated: DatosBodega = { ...actual, ...changes };
    this.updateArchivo(archivoId, { datosBodega: { ...archivo.datosBodega, [hojaIdx]: updated } });
    this.persistirDatos();
  }

  eliminarArchivo(id: number): void {
    clearInterval(this.progressTimers[id]);
    this.archivos.update(arr => arr.filter(a => a.id !== id));
    if (this.archivoExpandido() === id) this.archivoExpandido.set(null);
    this.invalidarCacheCostos();
    this.persistirDatos();
  }

  reintentarArchivo(id: number): void {
    this.eliminarArchivo(id);
  }

  canViewOriginal(archivo: ArchivoPlaneacion): boolean {
    return archivo.estado === 'done' && !!(archivo.fileUrl || archivo.fileKey);
  }

  verDocumentoOriginal(archivo: ArchivoPlaneacion, event: Event): void {
    event.stopPropagation();
    if (!archivo.fileUrl) return;
    this.previewHojaActiva.set(0);
    this.previewArchivo.set(archivo);
  }

  cerrarPreview(): void {
    this.previewArchivo.set(null);
    this.previewHojaActiva.set(0);
  }

  getPreviewType(nombre: string): 'image' | 'pdf' | 'office' {
    if (/\.(png|jpg|jpeg|gif|webp|tiff|tif)$/i.test(nombre)) return 'image';
    if (/\.pdf$/i.test(nombre)) return 'pdf';
    return 'office';
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  getBackendPreviewUrl(fileKey: string): SafeResourceUrl {
    const url = `${environment.apiUrl}/v1/textract/preview?fileKey=${encodeURIComponent(fileKey)}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }


  // ═══════════════════════════════════════════════
  // BORRADORES — Guardar / Cargar / Eliminar
  // ═══════════════════════════════════════════════

  /** Abre el modal de guardar borrador con un nombre sugerido */
  abrirModalGuardarBorrador(): void {
    const fecha = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const empresa = this.empresaNombre || 'Solicitud';
    this.nombreBorrador.set(`${empresa} — ${fecha}`);
    this.mostrarModalBorrador.set(true);
  }

  /** Confirma y guarda el borrador en localStorage */
  guardarBorrador(): void {
    const nombre = this.nombreBorrador().trim();
    if (!nombre) return;

    const archivosListos = this.archivos().filter(a => a.estado === 'done');
    const borrador: Borrador = {
      id: Date.now().toString(),
      nombre,
      fechaGuardado: new Date().toISOString(),
      empresa: this.empresaNombre,
      area: this.areaNombre,
      totalArchivos: archivosListos.length,
      datos: {
        archivos: archivosListos.map(a => ({
          nombre: a.nombre, tamano: a.tamano, hojas: a.hojas, kvPairs: a.kvPairs,
          hojaActiva: a.hojaActiva, fileKey: a.fileKey, fileUrl: a.fileUrl, datosBodega: a.datosBodega
        })),
        fechaEntrega: this.fechaEntrega(),
        fechaFinalizacion: this.fechaFinalizacion()
      }
    };

    const nuevos = [borrador, ...this.borradores()];
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevos));
    } catch (e) {
      // localStorage no disponible
    }
    this.borradores.set(nuevos);
    this.mostrarModalBorrador.set(false);
    this.nombreBorrador.set('');

    // Feedback visual de éxito
    this.guardadoExitoso.set(true);
    setTimeout(() => this.guardadoExitoso.set(false), 2500);
  }

  /** Cancela el modal de guardar borrador */
  cancelarGuardarBorrador(): void {
    this.mostrarModalBorrador.set(false);
    this.nombreBorrador.set('');
  }

  /** Carga la lista de borradores desde localStorage */
  cargarBorradores(): void {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) this.borradores.set(JSON.parse(raw));
    } catch {
      this.borradores.set([]);
    }
  }

  /** Restaura el estado del componente desde un borrador seleccionado */
  seleccionarBorrador(borrador: Borrador): void {
    try {
      const archivosRestaurados: ArchivoPlaneacion[] = borrador.datos.archivos.map((a: any) => {
        const id = this.nextId++;
        return {
          id,
          nombre: a.nombre || 'Archivo',
          tamano: a.tamano || '',
          estado: 'done' as const,
          progreso: 100,
          hojas: a.hojas || [],
          kvPairs: a.kvPairs || [],
          hojaActiva: a.hojaActiva || 0,
          fileKey: a.fileKey,
          fileUrl: a.fileUrl,
          datosBodega: a.datosBodega || {}
        };
      });

      this.archivos.set(archivosRestaurados);
      if (archivosRestaurados.length > 0) this.archivoExpandido.set(archivosRestaurados[0].id);
      if (borrador.datos.fechaEntrega) this.fechaEntrega.set(borrador.datos.fechaEntrega);
      if (borrador.datos.fechaFinalizacion) this.fechaFinalizacion.set(borrador.datos.fechaFinalizacion);

      this.invalidarCacheCostos();
      this.persistirDatos();
      this.mostrarBorradores.set(false);
    } catch (e) {}
  }

  /** Elimina un borrador guardado */
  eliminarBorrador(id: string, event: Event): void {
    event.stopPropagation();
    const nuevos = this.borradores().filter(b => b.id !== id);
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevos));
    } catch (e) {}
    this.borradores.set(nuevos);
  }

  /** Formatea la fecha de guardado del borrador para mostrar */
  formatFechaBorrador(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-CO', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  /** Devuelve el número de categorías con fecha asignada en un borrador */
  getBorradorResumen(borrador: Borrador): string {
    const count = borrador.totalArchivos;
    return count === 1 ? '1 archivo' : `${count} archivos`;
  }

  onNombreBorradorInput(event: Event): void {
    this.nombreBorrador.set((event.target as HTMLInputElement).value);
  }


  // ═══════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════

  Math = Math;

  getFileIcon(nombre: string): string {
    if (nombre.match(/\.xlsx?$/i)) return '📊';
    if (nombre.endsWith('.pdf')) return '📄';
    if (nombre.match(/\.(png|jpg|jpeg)$/i)) return '🖼️';
    return '📁';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  isNumericCell(value: string): boolean {
    if (!value || value.trim() === '') return false;
    return /^[\d$.,\-+%]+$/.test(value.trim());
  }

  trackById(_: number, item: ArchivoPlaneacion) { return item.id; }
  trackByCat(_: number, item: { categoria: string; costo: number }) { return item.categoria; }
  trackByBorrador(_: number, item: Borrador) { return item.id; }


  // ═══════════════════════════════════════════════
  // Custom Calendar Dropdown
  // ═══════════════════════════════════════════════

  calendarOpen = signal<string | null>(null);
  calendarMonth = signal<number>(new Date().getMonth());
  calendarYear = signal<number>(new Date().getFullYear());
  calendarPos = signal<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 300 });

  private calendarContext: { type: 'entrega' | 'cat'; archivoId: number; hojaIdx: number; categoria?: string } | null = null;

  private readonly DIAS_SEMANA = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  private readonly MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  get diasSemana(): string[] { return this.DIAS_SEMANA; }

  get mesActualLabel(): string {
    return `${this.MESES[this.calendarMonth()]} ${this.calendarYear()}`;
  }

  toggleCalendar(id: string, currentValue: string, event: Event): void {
    event.stopPropagation();
    if (this.calendarOpen() === id) { this.calendarOpen.set(null); this.calendarContext = null; return; }
    const trigger = (event.currentTarget || event.target) as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const calWidth = 290;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + calWidth > window.innerWidth - 12) left = window.innerWidth - calWidth - 12;
    if (left < 8) left = 8;
    const calApproxHeight = 320;
    if (top + calApproxHeight > window.innerHeight - 12) {
      top = rect.top - calApproxHeight - 4;
      if (top < 8) top = 8;
    }
    this.calendarPos.set({ top, left, width: Math.max(calWidth, rect.width) });
    if (currentValue) {
      const parts = currentValue.split('-');
      this.calendarYear.set(parseInt(parts[0], 10));
      this.calendarMonth.set(parseInt(parts[1], 10) - 1);
    } else {
      const now = new Date();
      this.calendarYear.set(now.getFullYear());
      this.calendarMonth.set(now.getMonth());
    }
    this.parseCalendarContext(id);
    this.calendarOpen.set(id);
  }

  private parseCalendarContext(id: string): void {
    if (id.startsWith('entrega-')) {
      const parts = id.replace('entrega-', '').split('-');
      this.calendarContext = { type: 'entrega', archivoId: parseInt(parts[0], 10), hojaIdx: parseInt(parts[1], 10) };
    } else if (id.startsWith('cat-')) {
      const rest = id.replace('cat-', '');
      const firstDash = rest.indexOf('-');
      const secondDash = rest.indexOf('-', firstDash + 1);
      const archivoId = parseInt(rest.substring(0, firstDash), 10);
      const hojaIdx = parseInt(rest.substring(firstDash + 1, secondDash), 10);
      const categoria = rest.substring(secondDash + 1);
      this.calendarContext = { type: 'cat', archivoId, hojaIdx, categoria };
    }
  }

  selectDay(day: number | null, event: Event): void {
    event.stopPropagation();
    if (!day || !this.calendarContext) return;
    const value = this.formatDate(day);
    const ctx = this.calendarContext;
    if (ctx.type === 'entrega') {
      this.updateDatosBodega(ctx.archivoId, ctx.hojaIdx, { fechaEntrega: value });
    } else if (ctx.type === 'cat' && ctx.categoria) {
      const actual = this.getDatosBodega(ctx.archivoId, ctx.hojaIdx);
      const nuevasFechas = { ...actual.fechasConsumoCategoria, [ctx.categoria]: value };
      this.updateDatosBodega(ctx.archivoId, ctx.hojaIdx, { fechasConsumoCategoria: nuevasFechas });
    }
    this.calendarOpen.set(null);
    this.calendarContext = null;
  }

  getCalendarCurrentValue(): string {
    if (!this.calendarContext) return '';
    const ctx = this.calendarContext;
    const datos = this.getDatosBodega(ctx.archivoId, ctx.hojaIdx);
    if (ctx.type === 'entrega') return datos.fechaEntrega || '';
    if (ctx.type === 'cat' && ctx.categoria) return datos.fechasConsumoCategoria[ctx.categoria] || '';
    return '';
  }

  clearCurrentDate(event: Event): void {
    event.stopPropagation();
    if (!this.calendarContext) return;
    const ctx = this.calendarContext;
    if (ctx.type === 'entrega') {
      this.updateDatosBodega(ctx.archivoId, ctx.hojaIdx, { fechaEntrega: '' });
    } else if (ctx.type === 'cat' && ctx.categoria) {
      const actual = this.getDatosBodega(ctx.archivoId, ctx.hojaIdx);
      const nuevasFechas = { ...actual.fechasConsumoCategoria };
      delete nuevasFechas[ctx.categoria];
      this.updateDatosBodega(ctx.archivoId, ctx.hojaIdx, { fechasConsumoCategoria: nuevasFechas });
    }
    this.calendarOpen.set(null);
    this.calendarContext = null;
  }

  closeCalendar(): void {
    this.calendarOpen.set(null);
    this.calendarContext = null;
  }

  prevMonth(event: Event): void {
    event.stopPropagation();
    let m = this.calendarMonth() - 1;
    let y = this.calendarYear();
    if (m < 0) { m = 11; y--; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
  }

  nextMonth(event: Event): void {
    event.stopPropagation();
    let m = this.calendarMonth() + 1;
    let y = this.calendarYear();
    if (m > 11) { m = 0; y++; }
    this.calendarMonth.set(m);
    this.calendarYear.set(y);
  }

  getCalendarWeeks(): (number | null)[][] {
    const y = this.calendarYear();
    const m = this.calendarMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  isToday(day: number | null): boolean {
    if (!day) return false;
    const now = new Date();
    return day === now.getDate() && this.calendarMonth() === now.getMonth() && this.calendarYear() === now.getFullYear();
  }

  isSelected(day: number | null, currentValue: string): boolean {
    if (!day || !currentValue) return false;
    const sel = currentValue.split('-');
    return parseInt(sel[0], 10) === this.calendarYear()
        && parseInt(sel[1], 10) - 1 === this.calendarMonth()
        && parseInt(sel[2], 10) === day;
  }

  goToToday(event: Event): void {
    event.stopPropagation();
    const now = new Date();
    this.calendarYear.set(now.getFullYear());
    this.calendarMonth.set(now.getMonth());
  }

  private formatDate(day: number): string {
    const y = this.calendarYear();
    const m = this.calendarMonth() + 1;
    return `${y}-${m.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  formatDateDisplay(value: string): string {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length !== 3) return value;
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${d} ${meses[m]} ${parts[0]}`;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.calendarOpen() && !this.elRef.nativeElement.contains(event.target)) {
      this.calendarOpen.set(null);
    }
  }
}