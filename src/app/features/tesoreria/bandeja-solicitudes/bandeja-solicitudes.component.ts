import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TesoreriaService } from '../services/tesoreria.service';
import { SolicitudTesoreria, TIPO_REQUERIMIENTO_LABELS } from '../models/solicitud.model';
import { AuthService } from 'src/app/core/services/auth.service';

type TabType = 'pendientes' | 'enviadas' | 'rechazadas';

@Component({
  selector: 'app-bandeja-solicitudes',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './bandeja-solicitudes.component.html',
  styleUrls: ['./bandeja-solicitudes.component.scss'],
})
export class BandejaSolicitudesComponent implements OnInit, OnDestroy {
  // ─── Solicitudes signals ──────────────────────────────────────────
  solicitudesPendientes = signal<SolicitudTesoreria[]>([]);
  solicitudesEnviadas = signal<SolicitudTesoreria[]>([]);
  solicitudesRechazadas = signal<SolicitudTesoreria[]>([]);

  loading = signal(true);
  activeTab = signal<TabType>('pendientes');
  busqueda = signal('');

  // Toast
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  // ─── Selection mode ────────────────────────────────────────────────
  selectionMode = signal(false);
  selectedIds = signal<Set<number>>(new Set());
  bulkProcessing = signal(false);
  showBulkConfirm = signal(false);

  selectedCount = computed(() => this.selectedIds().size);

  allPendientesSelected = computed(() => {
    const filtered = this.pendientesFiltrados();
    if (filtered.length === 0) return false;
    const sel = this.selectedIds();
    return filtered.every((s) => sel.has(s.id!));
  });

  somePendientesSelected = computed(() => {
    const filtered = this.pendientesFiltrados();
    const sel = this.selectedIds();
    const count = filtered.filter((s) => sel.has(s.id!)).length;
    return count > 0 && count < filtered.length;
  });

  // ─── Expand / collapse card ────────────────────────────────────────
  expandedId = signal<number | null>(null);

  // ─── Review modal ──────────────────────────────────────────────────
  showReviewModal = signal(false);
  reviewSolicitud = signal<SolicitudTesoreria | null>(null);
  reviewDatosAdicionales = signal<any>(null);
  reviewHistorial = signal<any[]>([]);
  reviewLoadingHistorial = signal(false);
  reviewProcessing = signal(false);
  reviewObservaciones = signal('');
  showRejectConfirm = signal(false);
  reviewActiveSection = signal<'info' | 'detalles' | 'archivos' | 'historial'>('info');

  // ─── Materia Prima viewer state ────────────────────────────────
  reviewMateriaPrimaOCR = signal<any>(null);
  mpArchivoExpandido = signal<number | null>(null);
  mpArchivoVistas = signal<Record<number, 'resumen' | 'detalle'>>({});
  mpHojaActiva = signal<Record<number, number>>({});
  mpBusquedas = signal<Record<number, string>>({});
  mpSortColumn = signal<Record<number, number>>({});
  mpSortDir = signal<Record<number, 'asc' | 'desc'>>({});

  // ─── Computed filters ─────────────────────────────────────────────
  pendientesFiltrados = computed(() =>
    this.filtrar(this.solicitudesPendientes()),
  );
  enviadasFiltrados = computed(() => this.filtrar(this.solicitudesEnviadas()));
  rechazadasFiltrados = computed(() =>
    this.filtrar(this.solicitudesRechazadas()),
  );

  currentFilteredList = computed(() => {
    switch (this.activeTab()) {
      case 'pendientes':
        return this.pendientesFiltrados();
      case 'enviadas':
        return this.enviadasFiltrados();
      case 'rechazadas':
        return this.rechazadasFiltrados();
    }
  });

  constructor(
    private tesoreriaService: TesoreriaService,
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargarSolicitudes();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private cargarSolicitudes(): void {
    this.loading.set(true);
    this.tesoreriaService.obtenerBandejaSolicitudes().subscribe({
      next: (solicitudes: SolicitudTesoreria[]) => {
        // Separar por estado
        const pendientes = solicitudes.filter(
          (s: SolicitudTesoreria) => s.estado === 'PENDIENTE_ENVIO_COMPRAS',
        );
        const enviadas = solicitudes.filter(
          (s: SolicitudTesoreria) => s.estado === 'ENVIADA_COMPRAS',
        );
        const rechazadas = solicitudes.filter(
          (s: SolicitudTesoreria) => s.estado === 'RECHAZADA_COMPRAS',
        );

        this.solicitudesPendientes.set(pendientes);
        this.solicitudesEnviadas.set(enviadas);
        this.solicitudesRechazadas.set(rechazadas);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error cargando solicitudes:', err);
        this.mostrarToast('Error al cargar las solicitudes', 'error');
        this.loading.set(false);
      },
    });
  }

  private filtrar(solicitudes: SolicitudTesoreria[]): SolicitudTesoreria[] {
    const search = this.busqueda().toLowerCase();
    if (!search) return solicitudes;
    return solicitudes.filter(
      (s) =>
        s.nombre?.toLowerCase().includes(search) ||
        s.areaDepartamento?.toLowerCase().includes(search) ||
        s.correoElectronico?.toLowerCase().includes(search),
    );
  }

  // ─── Tab navigation ────────────────────────────────────────────────
  setTab(tab: TabType): void {
    this.activeTab.set(tab);
  }

  // ─── Search ────────────────────────────────────────────────────────
  onBusqueda(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.busqueda.set(input.value);
  }

  // ─── Selection mode ────────────────────────────────────────────────
  toggleSelectionMode(): void {
    this.selectionMode.update((v) => !v);
    if (!this.selectionMode()) {
      this.selectedIds.set(new Set());
    }
  }

  exitSelectionMode(): void {
    this.selectionMode.set(false);
    this.selectedIds.set(new Set());
  }

  toggleSelectAll(): void {
    if (this.allPendientesSelected()) {
      this.selectedIds.set(new Set());
    } else {
      const allIds = new Set(this.pendientesFiltrados().map((s) => s.id!));
      this.selectedIds.set(allIds);
    }
  }

  toggleSelect(id: number): void {
    const ids = new Set(this.selectedIds());
    if (ids.has(id)) {
      ids.delete(id);
    } else {
      ids.add(id);
    }
    this.selectedIds.set(ids);
  }

  isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  // ─── Card expand/collapse ─────────────────────────────────────────
  toggleExpanded(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ─── Envío a compras ───────────────────────────────────────────────
  openBulkConfirm(): void {
    if (this.selectedCount() === 0) return;
    this.showBulkConfirm.set(true);
  }

  closeBulkConfirm(): void {
    this.showBulkConfirm.set(false);
  }

  confirmarEnvio(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.bulkProcessing.set(true);
    this.tesoreriaService.enviarSolicitudesACompras(ids).subscribe({
      next: () => {
        this.mostrarToast(
          `${ids.length} solicitud(es) enviada(s) a compras`,
          'success',
        );
        this.bulkProcessing.set(false);
        this.closeBulkConfirm();
        this.exitSelectionMode();
        this.cargarSolicitudes();
      },
      error: (err) => {
        console.error('Error enviando solicitudes:', err);
        this.mostrarToast('Error al enviar las solicitudes', 'error');
        this.bulkProcessing.set(false);
      },
    });
  }

  // ─── View details ──────────────────────────────────────────────────
  verDetalle(solicitud: SolicitudTesoreria): void {
    this.router.navigate(['/tesoreria/solicitud'], {
      queryParams: { id: solicitud.id, readonly: true },
    });
  }

  // ─── Review — navigate to full page ──────────────────────────────
  openReviewModal(solicitud: SolicitudTesoreria): void {
    this.router.navigate(['/tesoreria/revisar-solicitud', solicitud.id]);
  }

  /** @deprecated kept for internal use only */
  private _openReviewModalLegacy(solicitud: SolicitudTesoreria): void {
    this.reviewSolicitud.set(solicitud);
    this.reviewObservaciones.set('');
    this.showRejectConfirm.set(false);
    this.reviewActiveSection.set('info');
    this.reviewProcessing.set(false);

    // Reset MP viewer state
    this.mpArchivoExpandido.set(null);
    this.mpArchivoVistas.set({});
    this.mpHojaActiva.set({});
    this.mpBusquedas.set({});
    this.mpSortColumn.set({});
    this.mpSortDir.set({});
    this.reviewMateriaPrimaOCR.set(null);

    // Parse datos adicionales
    try {
      const datos = solicitud.datosAdicionales
        ? JSON.parse(solicitud.datosAdicionales)
        : null;
      this.reviewDatosAdicionales.set(datos);

      // Parse inner OCR data for MATERIA_PRIMA
      if (solicitud.tipoRequerimiento === 'MATERIA_PRIMA' && datos?.datosOCR) {
        try {
          const ocrData = typeof datos.datosOCR === 'string'
            ? JSON.parse(datos.datosOCR)
            : datos.datosOCR;
          this.reviewMateriaPrimaOCR.set(ocrData);
          // Auto-expand first archivo
          if (ocrData?.archivos?.length > 0) {
            this.mpArchivoExpandido.set(0);
          }
        } catch {
          this.reviewMateriaPrimaOCR.set(null);
        }
      }
    } catch {
      this.reviewDatosAdicionales.set(null);
    }

    // Load historial
    this.reviewLoadingHistorial.set(true);
    this.reviewHistorial.set([]);
    if (solicitud.id) {
      this.tesoreriaService.getHistorial(solicitud.id).subscribe({
        next: (historial) => {
          this.reviewHistorial.set(historial);
          this.reviewLoadingHistorial.set(false);
        },
        error: () => this.reviewLoadingHistorial.set(false),
      });
    }

    this.showReviewModal.set(true);
  }

  closeReviewModal(): void {
    this.showReviewModal.set(false);
    this.reviewSolicitud.set(null);
    this.reviewDatosAdicionales.set(null);
    this.reviewHistorial.set([]);
    this.showRejectConfirm.set(false);
    this.reviewMateriaPrimaOCR.set(null);
  }

  setReviewSection(section: 'info' | 'detalles' | 'archivos' | 'historial'): void {
    this.reviewActiveSection.set(section);
  }

  onReviewObservaciones(event: Event): void {
    this.reviewObservaciones.set((event.target as HTMLTextAreaElement).value);
  }

  aprobarSolicitud(): void {
    const solicitud = this.reviewSolicitud();
    if (!solicitud?.id) return;

    this.reviewProcessing.set(true);
    this.tesoreriaService
      .revisarSolicitud(solicitud.id, 'APROBAR', this.reviewObservaciones() || 'Solicitud aprobada')
      .subscribe({
        next: () => {
          this.mostrarToast('Solicitud aprobada y enviada a compras', 'success');
          this.closeReviewModal();
          this.cargarSolicitudes();
        },
        error: (err) => {
          console.error('Error aprobando solicitud:', err);
          this.mostrarToast('Error al aprobar la solicitud', 'error');
          this.reviewProcessing.set(false);
        },
      });
  }

  toggleRejectConfirm(): void {
    this.showRejectConfirm.update((v) => !v);
  }

  rechazarSolicitud(): void {
    const solicitud = this.reviewSolicitud();
    if (!solicitud?.id) return;

    if (!this.reviewObservaciones().trim()) {
      this.mostrarToast('Debe ingresar el motivo del rechazo', 'warning');
      return;
    }

    this.reviewProcessing.set(true);
    this.tesoreriaService
      .revisarSolicitud(solicitud.id, 'RECHAZAR', this.reviewObservaciones())
      .subscribe({
        next: () => {
          this.mostrarToast('Solicitud rechazada', 'warning');
          this.closeReviewModal();
          this.cargarSolicitudes();
        },
        error: (err) => {
          console.error('Error rechazando solicitud:', err);
          this.mostrarToast('Error al rechazar la solicitud', 'error');
          this.reviewProcessing.set(false);
        },
      });
  }

  // ─── Helper: Get datos adicionales keys ────────────────────────────
  getDatosKeys(): string[] {
    const datos = this.reviewDatosAdicionales();
    if (!datos || typeof datos !== 'object') return [];
    return Object.keys(datos).filter(
      (k) => datos[k] !== null && datos[k] !== undefined && datos[k] !== '',
    );
  }

  getDatoLabel(key: string): string {
    const labels: Record<string, string> = {
      tipoActivo: 'Tipo de Activo',
      codigoActivo: 'Código de Activo',
      nombreActivo: 'Nombre del Activo',
      ubicacionExacta: 'Ubicación Exacta',
      marcaModelo: 'Marca / Modelo',
      tipoMantenimiento: 'Tipo de Mantenimiento',
      fallaDetectada: 'Falla Detectada',
      sintomaObservado: 'Síntoma Observado',
      detalleProblema: 'Detalle del Problema',
      equipoDetenido: 'Equipo Detenido',
      nivelCriticidad: 'Nivel de Criticidad',
      fechaRequerida: 'Fecha Requerida',
      franjaHoraria: 'Franja Horaria',
      impactoOperativo: 'Impacto Operativo',
      requiereCompra: 'Requiere Compra',
      presupuestoEstimado: 'Presupuesto Estimado',
      centroCostos: 'Centro de Costos',
      proyecto: 'Proyecto',
      tipoPpto: 'Tipo de Presupuesto',
      conceptoGasto: 'Concepto de Gasto',
      justificacion: 'Justificación',
      alcanceEsperado: 'Alcance Esperado',
      beneficioEsperado: 'Beneficio Esperado',
      tipoFinanciero: 'Tipo Financiero',
      moneda: 'Moneda',
      incluyeImpuestos: 'Incluye Impuestos',
      nivelUrgencia: 'Nivel de Urgencia',
      impacto: 'Impacto',
      proveedorSugerido: 'Proveedor Sugerido',
      requiereCotizaciones: 'Requiere Cotizaciones',
      numCotizaciones: 'Número de Cotizaciones',
      tipoProveedor: 'Tipo de Proveedor',
      vigenciaPresupuesto: 'Vigencia del Presupuesto',
      sedeEdificio: 'Sede / Edificio',
      areaEspecifica: 'Área Específica',
      metrajeAproximado: 'Metraje Aproximado',
      nivelInfestacion: 'Nivel de Infestación',
      tiposControl: 'Tipos de Control',
      motivo: 'Motivo',
      descripcionProblema: 'Descripción del Problema',
      riesgo: 'Riesgo',
      contempladoPresupuesto: 'Contemplado en Presupuesto',
      proveedorCertificado: 'Proveedor Certificado',
      tipoServicio: 'Tipo de Servicio',
      sedeUbicacion: 'Sede / Ubicación',
      descripcionServicio: 'Descripción del Servicio',
      alcance: 'Alcance',
      prioridad: 'Prioridad',
      estaPresupuestado: 'Está Presupuestado',
      requiereProveedorExterno: 'Requiere Proveedor Externo',
      responsableEjecucion: 'Responsable de Ejecución',
      horarioPreferido: 'Horario Preferido',
      tipoHardware: 'Tipo de Hardware',
      descripcionEquipo: 'Descripción del Equipo',
      marcaSugerida: 'Marca Sugerida',
      modeloSugerido: 'Modelo Sugerido',
      procesador: 'Procesador',
      ram: 'RAM',
      disco: 'Disco',
      pantalla: 'Pantalla',
      sistemaOperativo: 'Sistema Operativo',
      puertosConectividad: 'Puertos / Conectividad',
      garantiaMinima: 'Garantía Mínima',
      usuarioAsignado: 'Usuario Asignado',
      cargoUsuario: 'Cargo del Usuario',
      procesoFuncion: 'Proceso / Función',
      tipoUso: 'Tipo de Uso',
      motivoCompra: 'Motivo de Compra',
      vidaUtilEstimada: 'Vida Útil Estimada',
      tiempoEntrega: 'Tiempo de Entrega',
      registrarActivoFijo: 'Registrar como Activo Fijo',
      responsableActivo: 'Responsable del Activo',
      ubicacionFisica: 'Ubicación Física',
      empresaRazonSocial: 'Empresa / Razón Social',
      nit: 'NIT',
      sedeSucursal: 'Sede / Sucursal',
      tipoDotacion: 'Tipo de Dotación',
      tallaCamisa: 'Talla de Camisa',
      tallaPantalon: 'Talla de Pantalón',
      tallaCalzado: 'Talla de Calzado',
      genero: 'Género',
      cantidad: 'Cantidad',
      colorReferencia: 'Color / Referencia',
      caracteristicasEspeciales: 'Características Especiales',
      motivoSolicitud: 'Motivo de Solicitud',
      valorEstimado: 'Valor Estimado',
      presupuestoDisponible: 'Presupuesto Disponible',
      proveedorHomologado: 'Proveedor Homologado',
      numeroTicket: 'Número de Ticket',
      datosOCR: 'Datos OCR',
      items: 'Ítems',
    };
    return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
  }

  getDatoValue(key: string): string {
    const datos = this.reviewDatosAdicionales();
    if (!datos) return '—';
    const val = datos[key];
    if (val === true) return 'Sí';
    if (val === false) return 'No';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  getHistorialEstadoLabel(estado: string): string {
    const labels: Record<string, string> = {
      PENDIENTE_ENVIO_COMPRAS: 'Pendiente',
      ENVIADA_COMPRAS: 'Enviada a Compras',
      RECHAZADA_COMPRAS: 'Rechazada',
    };
    return labels[estado] || estado;
  }

  // ─── Toast ─────────────────────────────────────────────────────────
  private mostrarToast(
    mensaje: string,
    tipo: 'success' | 'error' | 'warning' | 'info' = 'info',
  ): void {
    this.toastMessage.set(mensaje);
    this.toastType.set(tipo);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }

  // ─── Total counts ──────────────────────────────────────────────────
  getTotalSolicitudes(): number {
    return (
      this.solicitudesPendientes().length +
      this.solicitudesEnviadas().length +
      this.solicitudesRechazadas().length
    );
  }

  // ─── Refresh ────────────────────────────────────────────────────────
  cargarDatos(): void {
    this.cargarSolicitudes();
  }

  // ─── Helper: Tipo de requerimiento label ────────────────────────────
  getTipoLabel(tipo: string): string {
    const labels: Record<string, string> = {
      MANTENIMIENTO: 'Mantenimiento',
      VIATICOS: 'Viáticos',
      MATERIA_PRIMA: 'Materia Prima',
      FUMIGACION: 'Fumigación',
      PRESUPUESTO: 'Presupuesto',
      COMPRA_INSUMOS: 'Compra de Insumos',
      SERVICIOS_GENERALES: 'Servicios Generales',
      COMPRA_HARDWARE: 'Compra Hardware',
      DOTACION: 'Dotación',
      MESA_AYUDA: 'Mesa de Ayuda',
      OTRO: 'Otro',
    };
    return labels[tipo] || tipo;
  }

  // ─── Helper: Format dates ───────────────────────────────────────────
  formatFecha(fecha?: string): string {
    if (!fecha) return '—';
    try {
      return new Date(fecha).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return fecha;
    }
  }

  // ─── Helper: Avatar letter ─────────────────────────────────────────
  getAvatarLetter(solicitud: SolicitudTesoreria): string {
    return (solicitud.nombre || '?').charAt(0).toUpperCase();
  }

  // ─── Helper: Estado label ──────────────────────────────────────────
  getEstadoLabel(estado?: string): string {
    const labels: Record<string, string> = {
      PENDIENTE_ENVIO_COMPRAS: 'Pendiente',
      ENVIADA_COMPRAS: 'Enviada',
      RECHAZADA_COMPRAS: 'Rechazada',
    };
    return labels[estado || ''] || estado || '—';
  }

  // ─── Semáforo helpers ─────────────────────────────────────────────
  // SLA por defecto: 5 días hábiles
  private readonly SLA_DIAS = 5;

  getCodigoSolicitud(s: SolicitudTesoreria): string {
    return 'S-' + String(s.id || 0).padStart(3, '0');
  }

  getDiasTranscurridos(s: SolicitudTesoreria): number {
    if (!s.fechaSolicitud) return 0;
    try {
      const fecha = new Date(s.fechaSolicitud);
      const hoy = new Date();
      const diff = hoy.getTime() - fecha.getTime();
      return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    } catch {
      return 0;
    }
  }

  getSlaDias(): number {
    return this.SLA_DIAS;
  }

  getSemaforo(s: SolicitudTesoreria): 'verde' | 'amarillo' | 'rojo' {
    const dias = this.getDiasTranscurridos(s);
    const sla = this.SLA_DIAS;
    if (dias <= 2) return 'verde';
    if (dias >= 3 && dias < sla - 1) return 'amarillo';
    return 'rojo';
  }

  getSemaforoClass(color: 'verde' | 'amarillo' | 'rojo'): string {
    switch (color) {
      case 'verde':   return 'semaforo-verde';
      case 'amarillo': return 'semaforo-amarillo';
      case 'rojo':    return 'semaforo-rojo';
    }
  }

  getSemaforoTooltip(color: 'verde' | 'amarillo' | 'rojo'): string {
    switch (color) {
      case 'verde':   return '≤ 2 días — En tiempo';
      case 'amarillo': return 'Cerca del SLA — Precaución';
      case 'rojo':    return 'Excede SLA — Urgente';
    }
  }
  // ═══════════════════════════════════════════════════════════════
  // MATERIA PRIMA VIEWER helpers
  // ═══════════════════════════════════════════════════════════════

  getMPArchivos(): any[] {
    return this.reviewMateriaPrimaOCR()?.archivos || [];
  }

  getMPFechaEntrega(): string {
    return this.reviewMateriaPrimaOCR()?.fechaEntrega || '';
  }

  getMPFechaFinalizacion(): string {
    return this.reviewMateriaPrimaOCR()?.fechaFinalizacion || '';
  }

  mpToggleExpand(idx: number): void {
    this.mpArchivoExpandido.update(v => v === idx ? null : idx);
  }

  mpGetVista(idx: number): 'resumen' | 'detalle' {
    return this.mpArchivoVistas()[idx] || 'resumen';
  }

  mpSetVista(idx: number, vista: 'resumen' | 'detalle'): void {
    this.mpArchivoVistas.update(v => ({ ...v, [idx]: vista }));
  }

  mpGetHojaActiva(archivoIdx: number, archivo: any): number {
    const override = this.mpHojaActiva()[archivoIdx];
    return override !== undefined ? override : (archivo.hojaActiva || 0);
  }

  mpCambiarHoja(archivoIdx: number, hojaIdx: number): void {
    this.mpHojaActiva.update(h => ({ ...h, [archivoIdx]: hojaIdx }));
  }

  mpGetBusqueda(idx: number): string {
    return this.mpBusquedas()[idx] || '';
  }

  mpOnBusqueda(idx: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.mpBusquedas.update(b => ({ ...b, [idx]: val }));
  }

  private mpParseMoneda(val: string | undefined): number {
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
      if (afterDot.length === 3) clean = clean.replace('.', '');
    } else if (commas >= 1) {
      clean = clean.replace(/,/g, '');
    }
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
      /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h)
    );
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
      /categor[ií]a|asignaci[oó]n|clasificaci[oó]n/i.test(h)
    );
    const costoIdx = (hoja.encabezados as string[]).findIndex((h: string) =>
      /\bcosto\b/i.test(h.trim())
    );
    if (catIdx < 0 || costoIdx < 0) return [];
    const agrupado = new Map<string, number>();
    for (const fila of (hoja.filas as string[][])) {
      const catRaw = fila[catIdx]?.trim() || '';
      if (!catRaw || /^costo/i.test(catRaw)) continue;
      const catName = catRaw.toUpperCase();
      const valor = this.mpParseMoneda(fila[costoIdx]);
      if (valor > 0) {
        agrupado.set(catName, (agrupado.get(catName) || 0) + valor);
      }
    }
    return Array.from(agrupado.entries()).map(([categoria, costo]) => ({ categoria, costo }));
  }

  mpGetCostoTotal(archivo: any, hojaIdx: number): number {
    return this.mpGetCostoPorCategoria(archivo, hojaIdx).reduce((acc, item) => acc + item.costo, 0);
  }

  mpGetInfoHojaActiva(archivo: any, hojaIdx: number): any[] {
    const hoja = archivo.hojas?.[hojaIdx] || archivo.hojas?.[0];
    if (hoja?.kvPairs?.length > 0) return hoja.kvPairs;
    return archivo.kvPairs || [];
  }

  mpGetDatosBodega(archivo: any, hojaIdx: number): any {
    return archivo.datosBodega?.[hojaIdx] || { fechaEntrega: '', observaciones: '', fechasConsumoCategoria: {} };
  }

  mpGetFechasConsumoEntries(archivo: any, hojaIdx: number): { cat: string; fecha: string }[] {
    const bodega = this.mpGetDatosBodega(archivo, hojaIdx);
    const entries = bodega.fechasConsumoCategoria || {};
    return Object.entries(entries).map(([cat, fecha]) => ({ cat, fecha: fecha as string }));
  }

  mpGetFilasVisibles(archivo: any, archivoIdx: number): string[][] {
    const hojaIdx = this.mpGetHojaActiva(archivoIdx, archivo);
    const hoja = archivo.hojas?.[hojaIdx];
    if (!hoja) return [];
    let filas = hoja.filas as string[][];
    const q = this.mpGetBusqueda(archivoIdx).toLowerCase().trim();
    if (q) {
      filas = filas.filter((fila: string[]) => fila.some((c: string) => c?.toLowerCase().includes(q)));
    }
    const colIdx = this.mpSortColumn()[archivoIdx];
    if (colIdx !== undefined) {
      const dir = this.mpSortDir()[archivoIdx] || 'asc';
      filas = [...filas].sort((a: string[], b: string[]) => {
        const va = a[colIdx] || '';
        const vb = b[colIdx] || '';
        const na = this.mpParseMoneda(va);
        const nb = this.mpParseMoneda(vb);
        if (na !== 0 || nb !== 0) return dir === 'asc' ? na - nb : nb - na;
        return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return filas;
  }

  mpSortBy(archivoIdx: number, colIdx: number): void {
    const currentCol = this.mpSortColumn()[archivoIdx];
    const currentDir = this.mpSortDir()[archivoIdx] || 'asc';
    if (currentCol === colIdx) {
      if (currentDir === 'asc') {
        this.mpSortDir.update(d => ({ ...d, [archivoIdx]: 'desc' }));
      } else {
        this.mpSortColumn.update(c => { const n = { ...c }; delete n[archivoIdx]; return n; });
        this.mpSortDir.update(d => { const n = { ...d }; delete n[archivoIdx]; return n; });
      }
    } else {
      this.mpSortColumn.update(c => ({ ...c, [archivoIdx]: colIdx }));
      this.mpSortDir.update(d => ({ ...d, [archivoIdx]: 'asc' }));
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
    if (filas.length === 0) return [];
    const totals: (string | null)[] = [];
    let hasAnyTotal = false;
    for (let c = 0; c < hoja.encabezados.length; c++) {
      let sum = 0;
      let numericCount = 0;
      for (const fila of filas) {
        if (this.mpIsNumericCell(fila[c])) {
          sum += this.mpParseMoneda(fila[c]);
          numericCount++;
        }
      }
      if (numericCount >= 2) {
        totals.push(this.mpFormatMoneda(sum));
        hasAnyTotal = true;
      } else {
        totals.push(null);
      }
    }
    return hasAnyTotal ? totals : [];
  }

  mpGetResumen(archivo: any, archivoIdx: number): {
    totalFilas: number; totalHojas: number; nombreHoja: string;
    categorias: string[]; totalCosto: number; kvPairs: any[];
  } {
    const hojaIdx = this.mpGetHojaActiva(archivoIdx, archivo);
    const hoja = archivo.hojas?.[hojaIdx] || archivo.hojas?.[0];
    if (!hoja) {
      return { totalFilas: 0, totalHojas: archivo.hojas?.length || 0, nombreHoja: '', categorias: [], totalCosto: 0, kvPairs: [] };
    }
    return {
      totalFilas: hoja.totalFilas || hoja.filas?.length || 0,
      totalHojas: archivo.hojas?.length || 0,
      nombreHoja: hoja.nombre,
      categorias: this.mpGetCategoriasDeHoja(archivo, hojaIdx).slice(0, 12),
      totalCosto: this.mpGetCostoTotal(archivo, hojaIdx),
      kvPairs: this.mpGetInfoHojaActiva(archivo, hojaIdx)
    };
  }}
