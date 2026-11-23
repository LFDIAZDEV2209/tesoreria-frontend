import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TesoreriaService } from '../services/tesoreria.service';
import { SolicitudTesoreria, TIPO_REQUERIMIENTO_LABELS } from '../models/solicitud.model';

@Component({
  selector: 'app-revisar-solicitud',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './revisar-solicitud.component.html',
  styleUrls: ['./revisar-solicitud.component.scss'],
})
export class RevisarSolicitudComponent implements OnInit {
  // ─── State ──────────────────────────────────────────────────────
  solicitud = signal<SolicitudTesoreria | null>(null);
  datosAdicionales = signal<any>(null);
  historial = signal<any[]>([]);
  loading = signal(true);
  loadingHistorial = signal(false);
  processing = signal(false);
  errorMsg = signal('');

  activeSection = signal<'info' | 'detalles' | 'historial'>('info');

  // ─── Approve / reject ───────────────────────────────────────────
  observaciones = signal('');
  showRejectConfirm = signal(false);
  showApproveConfirm = signal(false);

  // ─── Toast ──────────────────────────────────────────────────────
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  // ─── Materia Prima viewer ────────────────────────────────────────
  reviewMateriaPrimaOCR = signal<any>(null);
  mpArchivoExpandido = signal<number | null>(null);
  mpArchivoVistas = signal<Record<number, 'resumen' | 'detalle'>>({});
  mpHojaActiva = signal<Record<number, number>>({});
  mpBusquedas = signal<Record<number, string>>({});
  mpSortColumn = signal<Record<number, number>>({});
  mpSortDir = signal<Record<number, 'asc' | 'desc'>>({});

  // ─── Computed ───────────────────────────────────────────────────
  isPending = computed(() => this.solicitud()?.estado === 'PENDIENTE_ENVIO_COMPRAS');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tesoreriaService: TesoreriaService,
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.router.navigate(['/tesoreria/bandeja-solicitudes']);
      return;
    }
    this.cargarSolicitud(id);
  }

  private cargarSolicitud(id: number): void {
    this.loading.set(true);
    this.tesoreriaService.getSolicitudById(id).subscribe({
      next: (s) => {
        this.solicitud.set(s);
        this.parseDatosAdicionales(s);
        this.loading.set(false);
        this.cargarHistorial(id);
      },
      error: () => {
        this.errorMsg.set('No se pudo cargar la solicitud.');
        this.loading.set(false);
      },
    });
  }

  private parseDatosAdicionales(s: SolicitudTesoreria): void {
    try {
      const datos = s.datosAdicionales ? JSON.parse(s.datosAdicionales) : null;
      this.datosAdicionales.set(datos);
      if (s.tipoRequerimiento === 'MATERIA_PRIMA' && datos?.datosOCR) {
        try {
          const ocrData =
            typeof datos.datosOCR === 'string'
              ? JSON.parse(datos.datosOCR)
              : datos.datosOCR;
          this.reviewMateriaPrimaOCR.set(ocrData);
          if (ocrData?.archivos?.length > 0) {
            this.mpArchivoExpandido.set(0);
          }
        } catch {
          this.reviewMateriaPrimaOCR.set(null);
        }
      }
    } catch {
      this.datosAdicionales.set(null);
    }
  }

  private cargarHistorial(id: number): void {
    this.loadingHistorial.set(true);
    this.tesoreriaService.getHistorial(id).subscribe({
      next: (h) => {
        this.historial.set(h);
        this.loadingHistorial.set(false);
      },
      error: () => this.loadingHistorial.set(false),
    });
  }

  // ─── Navigation ─────────────────────────────────────────────────
  volver(): void {
    this.router.navigate(['/tesoreria/bandeja-solicitudes']);
  }

  setSection(section: 'info' | 'detalles' | 'historial'): void {
    this.activeSection.set(section);
  }

  // ─── Approve / reject actions ────────────────────────────────────
  onObservaciones(event: Event): void {
    this.observaciones.set((event.target as HTMLTextAreaElement).value);
  }

  toggleApproveConfirm(): void {
    this.showApproveConfirm.update((v) => !v);
    this.showRejectConfirm.set(false);
  }

  toggleRejectConfirm(): void {
    this.showRejectConfirm.update((v) => !v);
    this.showApproveConfirm.set(false);
  }

  cancelConfirm(): void {
    this.showApproveConfirm.set(false);
    this.showRejectConfirm.set(false);
  }

  aprobar(): void {
    const s = this.solicitud();
    if (!s?.id) return;
    this.processing.set(true);
    this.tesoreriaService
      .revisarSolicitud(s.id, 'APROBAR', this.observaciones() || 'Solicitud aprobada')
      .subscribe({
        next: () => {
          this.mostrarToast('Solicitud aprobada y enviada a compras', 'success');
          this.processing.set(false);
          this.showApproveConfirm.set(false);
          setTimeout(() => this.router.navigate(['/tesoreria/bandeja-solicitudes']), 1400);
        },
        error: () => {
          this.mostrarToast('Error al aprobar la solicitud', 'error');
          this.processing.set(false);
        },
      });
  }

  rechazar(): void {
    const s = this.solicitud();
    if (!s?.id) return;
    if (!this.observaciones().trim()) {
      this.mostrarToast('Debe ingresar el motivo del rechazo', 'warning');
      return;
    }
    this.processing.set(true);
    this.tesoreriaService
      .revisarSolicitud(s.id, 'RECHAZAR', this.observaciones())
      .subscribe({
        next: () => {
          this.mostrarToast('Solicitud rechazada', 'warning');
          this.processing.set(false);
          this.showRejectConfirm.set(false);
          setTimeout(() => this.router.navigate(['/tesoreria/bandeja-solicitudes']), 1400);
        },
        error: () => {
          this.mostrarToast('Error al rechazar la solicitud', 'error');
          this.processing.set(false);
        },
      });
  }

  // ─── Generic datos helpers ────────────────────────────────────────
  getDatosKeys(): string[] {
    const datos = this.datosAdicionales();
    if (!datos || typeof datos !== 'object') return [];
    return Object.keys(datos).filter(
      (k) => datos[k] !== null && datos[k] !== undefined && datos[k] !== '' && k !== 'datosOCR',
    );
  }

  getDatoLabel(key: string): string {
    const labels: Record<string, string> = {
      tipoActivo: 'Tipo de Activo', codigoActivo: 'Código de Activo',
      nombreActivo: 'Nombre del Activo', ubicacionExacta: 'Ubicación Exacta',
      marcaModelo: 'Marca / Modelo', tipoMantenimiento: 'Tipo de Mantenimiento',
      fallaDetectada: 'Falla Detectada', sintomaObservado: 'Síntoma Observado',
      detalleProblema: 'Detalle del Problema', equipoDetenido: 'Equipo Detenido',
      nivelCriticidad: 'Nivel de Criticidad', fechaRequerida: 'Fecha Requerida',
      franjaHoraria: 'Franja Horaria', impactoOperativo: 'Impacto Operativo',
      requiereCompra: 'Requiere Compra', presupuestoEstimado: 'Presupuesto Estimado',
      centroCostos: 'Centro de Costos', proyecto: 'Proyecto',
      tipoPpto: 'Tipo de Presupuesto', conceptoGasto: 'Concepto de Gasto',
      justificacion: 'Justificación', alcanceEsperado: 'Alcance Esperado',
      beneficioEsperado: 'Beneficio Esperado', tipoFinanciero: 'Tipo Financiero',
      moneda: 'Moneda', incluyeImpuestos: 'Incluye Impuestos',
      nivelUrgencia: 'Nivel de Urgencia', impacto: 'Impacto',
      proveedorSugerido: 'Proveedor Sugerido', requiereCotizaciones: 'Requiere Cotizaciones',
      numCotizaciones: 'Número de Cotizaciones', tipoProveedor: 'Tipo de Proveedor',
      vigenciaPresupuesto: 'Vigencia del Presupuesto', sedeEdificio: 'Sede / Edificio',
      areaEspecifica: 'Área Específica', metrajeAproximado: 'Metraje Aproximado',
      nivelInfestacion: 'Nivel de Infestación', tiposControl: 'Tipos de Control',
      motivo: 'Motivo', descripcionProblema: 'Descripción del Problema',
      riesgo: 'Riesgo', contempladoPresupuesto: 'Contemplado en Presupuesto',
      proveedorCertificado: 'Proveedor Certificado', tipoServicio: 'Tipo de Servicio',
      sedeUbicacion: 'Sede / Ubicación', descripcionServicio: 'Descripción del Servicio',
      alcance: 'Alcance', prioridad: 'Prioridad', estaPresupuestado: 'Está Presupuestado',
      requiereProveedorExterno: 'Requiere Proveedor Externo',
      responsableEjecucion: 'Responsable de Ejecución', horarioPreferido: 'Horario Preferido',
      tipoHardware: 'Tipo de Hardware', descripcionEquipo: 'Descripción del Equipo',
      marcaSugerida: 'Marca Sugerida', modeloSugerido: 'Modelo Sugerido',
      procesador: 'Procesador', ram: 'RAM', disco: 'Disco', pantalla: 'Pantalla',
      sistemaOperativo: 'Sistema Operativo', puertosConectividad: 'Puertos / Conectividad',
      garantiaMinima: 'Garantía Mínima', usuarioAsignado: 'Usuario Asignado',
      cargoUsuario: 'Cargo del Usuario', procesoFuncion: 'Proceso / Función',
      tipoUso: 'Tipo de Uso', motivoCompra: 'Motivo de Compra',
      vidaUtilEstimada: 'Vida Útil Estimada', tiempoEntrega: 'Tiempo de Entrega',
      registrarActivoFijo: 'Registrar como Activo Fijo', responsableActivo: 'Responsable del Activo',
      ubicacionFisica: 'Ubicación Física', empresaRazonSocial: 'Empresa / Razón Social',
      nit: 'NIT', sedeSucursal: 'Sede / Sucursal', tipoDotacion: 'Tipo de Dotación',
      tallaCamisa: 'Talla de Camisa', tallaPantalon: 'Talla de Pantalón',
      tallaCalzado: 'Talla de Calzado', genero: 'Género', cantidad: 'Cantidad',
      colorReferencia: 'Color / Referencia', caracteristicasEspeciales: 'Características Especiales',
      motivoSolicitud: 'Motivo de Solicitud', valorEstimado: 'Valor Estimado',
      presupuestoDisponible: 'Presupuesto Disponible', proveedorHomologado: 'Proveedor Homologado',
      numeroTicket: 'Número de Ticket', items: 'Ítems',
    };
    return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
  }

  getDatoValue(key: string): string {
    const datos = this.datosAdicionales();
    if (!datos) return '—';
    const val = datos[key];
    if (val === true) return 'Sí';
    if (val === false) return 'No';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return JSON.stringify(val);
    return val !== null && val !== undefined ? String(val) : '—';
  }

  // ─── Label helpers ───────────────────────────────────────────────
  getTipoLabel(tipo?: string): string {
    if (!tipo) return '—';
    return (TIPO_REQUERIMIENTO_LABELS as any)[tipo] || tipo;
  }

  getEstadoLabel(estado?: string): string {
    const labels: Record<string, string> = {
      PENDIENTE_ENVIO_COMPRAS: 'Pendiente',
      ENVIADA_COMPRAS: 'Enviada a Compras',
      RECHAZADA_COMPRAS: 'Rechazada',
    };
    return labels[estado || ''] || estado || '—';
  }

  getHistorialEstadoLabel(estado: string): string {
    return this.getEstadoLabel(estado);
  }

  formatFecha(fecha?: string): string {
    if (!fecha) return '—';
    try {
      return new Date(fecha).toLocaleDateString('es-ES', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return fecha; }
  }

  getAvatarLetter(): string {
    return (this.solicitud()?.nombre || '?').charAt(0).toUpperCase();
  }

  // ─── Toast ───────────────────────────────────────────────────────
  private mostrarToast(
    mensaje: string,
    tipo: 'success' | 'error' | 'warning' | 'info' = 'info',
  ): void {
    this.toastMessage.set(mensaje);
    this.toastType.set(tipo);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }

  // ═══════════════════════════════════════════════════════════════
  // MATERIA PRIMA VIEWER HELPERS
  // ═══════════════════════════════════════════════════════════════

  getMPArchivos(): any[] { return this.reviewMateriaPrimaOCR()?.archivos || []; }
  getMPFechaEntrega(): string { return this.reviewMateriaPrimaOCR()?.fechaEntrega || ''; }
  getMPFechaFinalizacion(): string { return this.reviewMateriaPrimaOCR()?.fechaFinalizacion || ''; }

  mpToggleExpand(idx: number): void {
    this.mpArchivoExpandido.update((v) => (v === idx ? null : idx));
  }

  mpGetVista(idx: number): 'resumen' | 'detalle' {
    return this.mpArchivoVistas()[idx] || 'resumen';
  }

  mpSetVista(idx: number, vista: 'resumen' | 'detalle'): void {
    this.mpArchivoVistas.update((v) => ({ ...v, [idx]: vista }));
  }

  mpGetHojaActiva(archivoIdx: number, archivo: any): number {
    const override = this.mpHojaActiva()[archivoIdx];
    return override !== undefined ? override : (archivo.hojaActiva || 0);
  }

  mpCambiarHoja(archivoIdx: number, hojaIdx: number): void {
    this.mpHojaActiva.update((h) => ({ ...h, [archivoIdx]: hojaIdx }));
  }

  mpGetBusqueda(idx: number): string { return this.mpBusquedas()[idx] || ''; }

  mpOnBusqueda(idx: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.mpBusquedas.update((b) => ({ ...b, [idx]: val }));
  }

  private mpParseMoneda(val: string | undefined): number {
    if (!val) return 0;
    let clean = val.replace(/[\$\s]/g, '').trim();
    if (!clean) return 0;
    if (/[a-zA-Z()+\/*=]/.test(clean)) return 0;
    const dots = (clean.match(/\./g) || []).length;
    const commas = (clean.match(/,/g) || []).length;
    if (dots > 1) { clean = clean.replace(/\./g, ''); }
    else if (dots === 1 && commas === 0) {
      if ((clean.split('.')[1] || '').length === 3) clean = clean.replace('.', '');
    } else if (commas >= 1) { clean = clean.replace(/,/g, ''); }
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  mpFormatMoneda(valor: number): string {
    if (valor === 0) return '$0';
    return '$' + valor.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  mpIsNumericCell(val: string): boolean {
    if (!val) return false;
    return this.mpParseMoneda(val) !== 0;
  }

  mpGetCategoriasDeHoja(archivo: any, hojaIdx: number): string[] {
    const hoja = archivo.hojas?.[hojaIdx];
    if (!hoja) return [];
    const catIdx = (hoja.encabezados as string[]).findIndex((h: string) =>
      /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h));
    if (catIdx < 0) return [];
    const cats = new Set<string>();
    (hoja.filas as string[][]).forEach((fila: string[]) => {
      const val = fila[catIdx]?.trim();
      if (val && !/^costo/i.test(val)) cats.add(val);
    });
    return Array.from(cats);
  }

  mpGetCostoPorCategoria(archivo: any, hojaIdx: number): { categoria: string; costo: number }[] {
    const hoja = archivo.hojas?.[hojaIdx];
    if (!hoja) return [];
    const catIdx = (hoja.encabezados as string[]).findIndex((h: string) =>
      /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h));
    const costoIdx = (hoja.encabezados as string[]).findIndex((h: string) =>
      /\bcosto\b/i.test(h.trim()));
    if (catIdx < 0 || costoIdx < 0) return [];
    const agrupado = new Map<string, number>();
    for (const fila of (hoja.filas as string[][])) {
      const catRaw = fila[catIdx]?.trim() || '';
      if (!catRaw || /^costo/i.test(catRaw)) continue;
      const valor = this.mpParseMoneda(fila[costoIdx]);
      if (valor > 0) agrupado.set(catRaw.toUpperCase(), (agrupado.get(catRaw.toUpperCase()) || 0) + valor);
    }
    return Array.from(agrupado.entries()).map(([categoria, costo]) => ({ categoria, costo }));
  }

  mpGetCostoTotal(archivo: any, hojaIdx: number): number {
    return this.mpGetCostoPorCategoria(archivo, hojaIdx).reduce((a, i) => a + i.costo, 0);
  }

  mpGetInfoHojaActiva(archivo: any, hojaIdx: number): any[] {
    const hoja = archivo.hojas?.[hojaIdx] || archivo.hojas?.[0];
    if (hoja?.kvPairs?.length > 0) return hoja.kvPairs;
    return archivo.kvPairs || [];
  }

  mpGetDatosBodega(archivo: any, hojaIdx: number): any {
    return archivo.datosBodega?.[hojaIdx] || { fechaEntrega: '', observaciones: '', fechasConsumoCategoria: {} };
  }

  mpGetFilasVisibles(archivo: any, archivoIdx: number): string[][] {
    const hojaIdx = this.mpGetHojaActiva(archivoIdx, archivo);
    const hoja = archivo.hojas?.[hojaIdx];
    if (!hoja) return [];
    let filas = hoja.filas as string[][];
    const q = this.mpGetBusqueda(archivoIdx).toLowerCase().trim();
    if (q) filas = filas.filter((f: string[]) => f.some((c: string) => c?.toLowerCase().includes(q)));
    const colIdx = this.mpSortColumn()[archivoIdx];
    if (colIdx !== undefined) {
      const dir = this.mpSortDir()[archivoIdx] || 'asc';
      filas = [...filas].sort((a: string[], b: string[]) => {
        const va = a[colIdx] || ''; const vb = b[colIdx] || '';
        const na = this.mpParseMoneda(va); const nb = this.mpParseMoneda(vb);
        if (na !== 0 || nb !== 0) return dir === 'asc' ? na - nb : nb - na;
        return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return filas;
  }

  mpSortBy(archivoIdx: number, colIdx: number): void {
    const currentCol = this.mpSortColumn()[archivoIdx];
    if (currentCol === colIdx) {
      if ((this.mpSortDir()[archivoIdx] || 'asc') === 'asc') {
        this.mpSortDir.update((d) => ({ ...d, [archivoIdx]: 'desc' }));
      } else {
        this.mpSortColumn.update((c) => { const n = { ...c }; delete n[archivoIdx]; return n; });
        this.mpSortDir.update((d) => { const n = { ...d }; delete n[archivoIdx]; return n; });
      }
    } else {
      this.mpSortColumn.update((c) => ({ ...c, [archivoIdx]: colIdx }));
      this.mpSortDir.update((d) => ({ ...d, [archivoIdx]: 'asc' }));
    }
  }

  mpGetSortIndicator(archivoIdx: number, colIdx: number): string {
    if (this.mpSortColumn()[archivoIdx] !== colIdx) return '';
    return this.mpSortDir()[archivoIdx] === 'asc' ? ' ▲' : ' ▼';
  }

  mpGetColumnTotals(archivo: any, archivoIdx: number): (string | null)[] {
    const hojaIdx = this.mpGetHojaActiva(archivoIdx, archivo);
    const hoja = archivo.hojas?.[hojaIdx];
    if (!hoja) return [];
    const filas = this.mpGetFilasVisibles(archivo, archivoIdx);
    if (!filas.length) return [];
    const totals: (string | null)[] = [];
    let hasAny = false;
    for (let c = 0; c < hoja.encabezados.length; c++) {
      let sum = 0; let cnt = 0;
      for (const fila of filas) {
        if (this.mpIsNumericCell(fila[c])) { sum += this.mpParseMoneda(fila[c]); cnt++; }
      }
      if (cnt >= 2) { totals.push(this.mpFormatMoneda(sum)); hasAny = true; }
      else totals.push(null);
    }
    return hasAny ? totals : [];
  }

  mpGetResumen(archivo: any, archivoIdx: number): {
    totalFilas: number; totalHojas: number; nombreHoja: string;
    categorias: string[]; totalCosto: number; kvPairs: any[];
  } {
    const hojaIdx = this.mpGetHojaActiva(archivoIdx, archivo);
    const hoja = archivo.hojas?.[hojaIdx] || archivo.hojas?.[0];
    if (!hoja) return { totalFilas: 0, totalHojas: archivo.hojas?.length || 0, nombreHoja: '', categorias: [], totalCosto: 0, kvPairs: [] };
    return {
      totalFilas: hoja.totalFilas || hoja.filas?.length || 0,
      totalHojas: archivo.hojas?.length || 0,
      nombreHoja: hoja.nombre,
      categorias: this.mpGetCategoriasDeHoja(archivo, hojaIdx).slice(0, 12),
      totalCosto: this.mpGetCostoTotal(archivo, hojaIdx),
      kvPairs: this.mpGetInfoHojaActiva(archivo, hojaIdx),
    };
  }
}
