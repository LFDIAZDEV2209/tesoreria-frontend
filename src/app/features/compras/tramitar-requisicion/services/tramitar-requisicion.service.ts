import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  Observable,
  of,
  BehaviorSubject,
  throwError,
  forkJoin,
  concat,
} from 'rxjs';
import { catchError, tap, map, switchMap, toArray } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  TramiteRequisicion,
  Cotizacion,
  ComparativoSeleccion,
  OrdenCompra,
  RecepcionRecurso,
  EntregaRecurso,
  EstadoTramite,
  RequisicionCompra,
  OrdenCompraCargada,
  VistoBuenoResponse,
  CausacionCatalogo,
  FacturaCargada,
  ComparacionOcFactura,
  TipoPago,
  TrackingTimeline,
  ProveedorTramite,
} from '../models/tramitar-requisicion.model';
import { SolicitudCompra } from '../../models/compra.model';

/**
 * Interfaz que representa la respuesta del backend para un trámite.
 */
interface VistoBuenoBackend {
  id: number;
  estado: string;
  observaciones?: string;
  novedades?: string;
  revisadoPor?: string;
  fechaRevision?: string;
  causaciones?: Array<{ motivo: string; tipo: string; observaciones?: string }>;
  motivoRechazo?: string;
  causacionNovedad?: string;
}

interface TramiteBackendResponse {
  id: number;
  solicitudId: number;
  numeroRequisicion: string;
  estadoTramite: string;
  pasoActual: number;
  tipoPago: string | null;
  solicitante: string;
  areaCentroCosto: string;
  tipoCompra: string;
  descripcionBreve: string;
  valorEstimado: number;
  ordenesCargadasJson: string | null;
  totalOrdenes: number;
  valorTotalOrdenes: number;
  montoSubtotal: number | null;
  ivaPorcentaje: number | null;
  ivaValor: number | null;
  reteFuenteValor: number | null;
  reteIcaValor: number | null;
  valorNetoPagar: number | null;
  enviadoContabilidad: boolean;
  fechaEnvioContabilidad: string | null;
  respuestaContabilidad: boolean;
  fechaRespuestaContabilidad: string | null;
  observacionesContabilidad: string | null;
  registroContableId: number | null;
  facturasJson: string | null;
  comparacionOcFacturaJson: string | null;
  recepcionJson: string | null;
  entregaJson: string | null;
  comparativaPlaneacionOcJson: string | null;
  comparativaBorradorJson?: string | null;
  // Último visto bueno embebido (puede venir como objeto o como campos planos)
  ultimoVistoBueno?: VistoBuenoBackend;
  vistoBueno?: VistoBuenoBackend;
  // Campos planos (fallback si el back los devuelve directamente en el trámite)
  vistoBuenoEstado?: string;
  vistoBuenoObservaciones?: string;
  vistoBuenoNovedades?: string;
  vistoBuenoRevisadoPor?: string;
  vistoBuenoFechaRevision?: string;
  motivoRechazo?: string;
  causacionNovedad?: string;
  // Proveedores asociados a las OCs del trámite
  proveedores?: ProveedorTramite[];
  creadoPor: string;
  fechaCreacion: string;
  fechaActualizacion: string;
}

/** Payload de validación automática de CP contra egreso/factura (backend). */
export interface ComprobanteValidacionPayload {
  solicitudId: number;
  proveedorRelacionId: number;
  valorExtraido?: number | null;
  cuentaExtraida?: string | null;
  bancoExtraido?: string | null;
  beneficiarioExtraido?: string | null;
  conceptoExtraido?: string | null;
  nombreArchivo?: string | null;
  valorEsperado?: number | null;
  cuentaEsperada?: string | null;
  beneficiarioEsperado?: string | null;
  descripcionEsperada?: string | null;
}

/** Veredicto del backend: APROBADO bloquea/desbloquea finalizarPago. */
export interface ComprobanteValidacionResult {
  veredicto: 'APROBADO' | 'RECHAZADO';
  montoOk: boolean;
  cuentaOk: boolean;
  beneficiarioOk: boolean;
  descripcionOk: boolean;
  diferenciaMonto?: number | null;
  diferencias: string[];
}

@Injectable({
  providedIn: 'root',
})
export class TramitarRequisicionService {
  private readonly baseUrl = `${environment.apiUrl}/compras/tramite`;
  private readonly httpOptions = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
  };

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // Estado local del trámite actual
  private tramiteActual = new BehaviorSubject<TramiteRequisicion | null>(null);
  tramiteActual$ = this.tramiteActual.asObservable();

  constructor(private http: HttpClient) {}

  // ═══════════════════════════════════════
  // CRUD del trámite
  // ═══════════════════════════════════════

  iniciarTramite(solicitud: SolicitudCompra): Observable<TramiteRequisicion> {
    const body = {
      solicitudId: solicitud.id,
      numeroRequisicion: solicitud.codigoSolicitud,
      solicitante: solicitud.solicitante,
      areaCentroCosto: solicitud.areaSolicitante,
      tipoCompra: 'General',
      descripcionBreve: solicitud.observaciones || 'Requisición de compra',
    };

    return this.http
      .post<TramiteBackendResponse>(this.baseUrl, body, this.httpOptions)
      .pipe(
        map((res) => this.mapBackendToFrontend(res, solicitud)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          const tramite = this.crearTramiteDesdeSolicitud(solicitud);
          this.tramiteActual.next(tramite);
          return of(tramite);
        }),
      );
  }

  getTramite(id: number): Observable<TramiteRequisicion | null> {
    return this.http
      .get<TramiteBackendResponse>(`${this.baseUrl}/${id}`, this.httpOptions)
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => of(null)),
      );
  }

  getTramiteBySolicitudId(
    solicitudId: number,
  ): Observable<TramiteRequisicion | null> {
    return this.http
      .get<TramiteBackendResponse>(
        `${this.baseUrl}/solicitud/${solicitudId}`,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError((error) => {
          // Si es 404 (no encontrado), retornar null en lugar de error
          if (error.status === 404 || error.status === 0) {
            return of(null);
          }
          // Para otros errores, también retornar null pero loguear
          console.warn('Error al obtener trámite por solicitud:', error);
          return of(null);
        }),
      );
  }

  guardarTramite(tramite: TramiteRequisicion): Observable<TramiteRequisicion> {
    const body = this.mapFrontendToBackend(tramite);
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramite.id}`,
        body,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          this.tramiteActual.next(tramite);
          return of(tramite);
        }),
      );
  }

  // ═══════════════════════════════════════
  // Operaciones por paso
  // ═══════════════════════════════════════

  guardarCotizaciones(
    tramiteId: number,
    cotizaciones: Cotizacion[],
  ): Observable<TramiteRequisicion> {
    const current = this.tramiteActual.value;
    if (current) {
      current.cotizaciones = cotizaciones;
      current.pasoActual = Math.max(current.pasoActual, 2);
      this.tramiteActual.next({ ...current });
    }
    return of(current!);
  }

  guardarComparativo(
    tramiteId: number,
    comparativo: ComparativoSeleccion,
  ): Observable<TramiteRequisicion> {
    const current = this.tramiteActual.value;
    if (current) {
      current.comparativo = comparativo;
      current.pasoActual = Math.max(current.pasoActual, 3);
      this.tramiteActual.next({ ...current });
    }
    return of(current!);
  }

  /**
   * Guardar órdenes de compra en el backend.
   * Flujo: 1) Guardar JSON de órdenes en BD → 2) Subir archivos a S3
   * (el backend necesita que las órdenes existan antes de subir archivos)
   */
  guardarOrdenesCompra(
    tramiteId: number,
    ordenes: OrdenCompraCargada[],
  ): Observable<TramiteRequisicion> {
    // Paso 1: Serializar y guardar órdenes en el backend primero
    const ordenesSerialized = ordenes.map((o) => ({
      id: o.id,
      nombreArchivo: o.nombreArchivo,
      tamanoArchivo: o.tamanoArchivo,
      estadoEscaneo: o.estadoEscaneo,
      progresoEscaneo: o.progresoEscaneo,
      numeroOC: o.numeroOC,
      proveedor: o.proveedor,
      nitProveedor: o.nitProveedor,
      fechaEmision: o.fechaEmision,
      valorAntesIva: o.valorAntesIva,
      ivaPorcentaje: o.ivaPorcentaje,
      valorIva: o.valorIva,
      valorTotal: o.valorTotal,
      responsableCompra: o.responsableCompra,
      descripcionItems: o.descripcionItems,
      condicionesPago: o.condicionesPago,
      tiempoEntrega: o.tiempoEntrega,
      confianzaOCR: o.confianzaOCR,
      archivoUrl:
        o.archivoUrl ||
        (typeof o.archivo === 'string' && o.archivo ? o.archivo : undefined),
      // Per-OC tipo de pago
      tipoPago: o.tipoPago,
      // Facturación/Cotización inline per-OC
      observacionDocFacturacion: o.observacionDocFacturacion,
      facturaNombreArchivo: o.facturaNombreArchivo,
      facturaEstadoEscaneo: o.facturaEstadoEscaneo,
      facturaProgresoEscaneo: o.facturaProgresoEscaneo,
      facturaNumero: o.facturaNumero,
      facturaProveedor: o.facturaProveedor,
      facturaNitProveedor: o.facturaNitProveedor,
      facturaFechaEmision: o.facturaFechaEmision,
      facturaValorAntesIva: o.facturaValorAntesIva,
      facturaIvaPorcentaje: o.facturaIvaPorcentaje,
      facturaValorIva: o.facturaValorIva,
      facturaValorTotal: o.facturaValorTotal,
      facturaConfianzaOCR: o.facturaConfianzaOCR,
      // Comparación OC vs Factura inline
      comparacionCoincide: o.comparacionCoincide,
      comparacionDiferencia: o.comparacionDiferencia,
      comparacionPorcentaje: o.comparacionPorcentaje,
      comparacionDetalles: o.comparacionDetalles,
      // Datos de crédito (solo cuando tipoPago === 'CREDITO')
      creditoFechasPago: o.creditoFechasPago,
      creditoObservacionesOC: o.creditoObservacionesOC,
      creditoFechaEntrega: o.creditoFechaEntrega,
      creditoPlazosDias: o.creditoPlazosDias,
      creditoConsumoDesde: o.creditoConsumoDesde,
      creditoConsumoHasta: o.creditoConsumoHasta,
      creditoNumeroDoc: o.creditoNumeroDoc,
      creditoCobertura: o.creditoCobertura,
      creditoDireccionEntrega: o.creditoDireccionEntrega,
      creditoContactoEntrega: o.creditoContactoEntrega,
    }));

    const body = {
      ordenesCargadasJson: JSON.stringify(ordenesSerialized),
      totalOrdenes: ordenes.length,
      valorTotalOrdenes: ordenes.reduce((s, o) => s + o.valorTotal, 0),
    };

    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/ordenes`,
        body,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        // Paso 2: Ahora que las órdenes existen en BD, subir archivos a S3
        switchMap((tramite) => {
          const uploadTasks = ordenes
            .filter((o) => o.archivo instanceof File && !o.archivoUrl)
            .map((o) =>
              this.subirArchivoOrden(tramiteId, o.id, o.archivo as File).pipe(
                catchError(() => of(null)),
              ),
            );

          // Paso 2b: Subir archivos de factura a S3
          const facturaUploadTasks = ordenes
            .filter((o) => o.facturaArchivo instanceof File)
            .map((o) =>
              this.subirFacturaOrden(
                tramiteId,
                o.id,
                o.facturaArchivo as File,
              ),
            );

          const allTasks = [...uploadTasks, ...facturaUploadTasks];

          if (allTasks.length === 0) {
            return of(tramite);
          }

          // Upload files sequentially (concat) to avoid S3 rate limiting (503/400)
          return concat(...allTasks).pipe(
            toArray(),
            map(() => tramite),
          );
        }),
        tap((t) => this.tramiteActual.next(t)),

      );
  }

  guardarOrdenCompra(
    tramiteId: number,
    orden: OrdenCompra,
  ): Observable<TramiteRequisicion> {
    const current = this.tramiteActual.value;
    if (current) {
      current.ordenCompra = orden;
      this.tramiteActual.next({ ...current });
    }
    return of(current!);
  }

  /**
   * Guardar tipo de pago (CONTADO o CREDITO).
   */
  guardarTipoPago(
    tramiteId: number,
    tipoPago: TipoPago,
  ): Observable<TramiteRequisicion> {
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/tipo-pago`,
        { tipoPago },
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          const current = this.tramiteActual.value;
          if (current) {
            current.tipoPago = tipoPago;
            this.tramiteActual.next({ ...current });
          }
          return of(current!);
        }),
      );
  }

  /**
   * Guardar facturas escaneadas y comparación OC vs Factura.
   */
  guardarFacturas(
    tramiteId: number,
    facturas: FacturaCargada[],
    comparaciones: ComparacionOcFactura[],
  ): Observable<TramiteRequisicion> {
    const facturasSerialized = facturas.map((f) => ({
      id: f.id,
      nombreArchivo: f.nombreArchivo,
      tamanoArchivo: f.tamanoArchivo,
      estadoEscaneo: f.estadoEscaneo,
      progresoEscaneo: f.progresoEscaneo,
      numeroFactura: f.numeroFactura,
      proveedor: f.proveedor,
      nitProveedor: f.nitProveedor,
      fechaEmision: f.fechaEmision,
      valorAntesIva: f.valorAntesIva,
      ivaPorcentaje: f.ivaPorcentaje,
      valorIva: f.valorIva,
      valorTotal: f.valorTotal,
      descripcionItems: f.descripcionItems,
      condicionesPago: f.condicionesPago,
      confianzaOCR: f.confianzaOCR,
      ordenCompraAsociadaId: f.ordenCompraAsociadaId,
    }));

    const body = {
      facturasJson: JSON.stringify(facturasSerialized),
      comparacionOcFacturaJson: JSON.stringify(comparaciones),
    };

    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/facturas`,
        body,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          const current = this.tramiteActual.value;
          if (current) {
            current.facturasCargadas = facturas;
            current.comparacionesOcFactura = comparaciones;
            this.tramiteActual.next({ ...current });
          }
          return of(current!);
        }),
      );
  }

  /**
   * Enviar trámite a contabilidad — persiste en backend.
   */
  enviarAContabilidad(tramiteId: number): Observable<{ success: boolean }> {
    return this.http
      .post<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/enviar-contabilidad`,
        {},
        this.httpOptions,
      )
      .pipe(
        tap(() => {
          const current = this.tramiteActual.value;
          if (current) {
            current.enviadoContabilidad = true;
            current.estadoTramite = 'ESPERANDO_CONTABILIDAD';
            this.tramiteActual.next({ ...current });
          }
        }),
        map(() => ({ success: true })),
        catchError((err) => {
          console.error('Error al enviar a contabilidad:', err);
          return throwError(() => err);
        }),
      );
  }

  /**
   * Verificar si contabilidad ha respondido.
   */
  verificarRespuestaContabilidad(
    tramiteId: number,
  ): Observable<{ respondido: boolean; observaciones?: string }> {
    return this.http
      .get<{
        respondido: boolean;
        observaciones: string;
        fechaRespuesta: string;
      }>(`${this.baseUrl}/${tramiteId}/contabilidad-status`, this.httpOptions)
      .pipe(
        catchError(() =>
          of({ respondido: false, observaciones: '', fechaRespuesta: '' }),
        ),
      );
  }

  /**
   * Guardar recepción del recurso.
   */
  guardarRecepcion(
    tramiteId: number,
    recepcion: RecepcionRecurso,
  ): Observable<TramiteRequisicion> {
    const body = {
      recepcionJson: JSON.stringify(recepcion),
    };
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/recepcion`,
        body,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          const current = this.tramiteActual.value;
          if (current) {
            current.recepcion = recepcion;
            current.pasoActual = Math.max(current.pasoActual, 4);
            this.tramiteActual.next({ ...current });
          }
          return of(current!);
        }),
      );
  }

  guardarComparativaPlaneacionOcBorrador(
    tramiteId: number,
    borrador: any,
  ): Observable<TramiteRequisicion> {
    const body = { borradorJson: JSON.stringify(borrador) };
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/comparativa-planeacion-oc/borrador`,
        body,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          const current = this.tramiteActual.value;
          if (current) {
            current.comparativaBorrador = borrador;
            this.tramiteActual.next({ ...current });
          }
          return of(current!);
        }),
      );
  }

  guardarComparativaPlaneacionOc(
    tramiteId: number,
    comparativa: any,
  ): Observable<TramiteRequisicion> {
    const body = {
      comparativaPlaneacionOcJson: JSON.stringify(comparativa),
    };
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/comparativa-planeacion-oc`,
        body,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          const current = this.tramiteActual.value;
          if (current) {
            current.comparativaPlaneacionOc = comparativa;
            current.pasoActual = Math.max(current.pasoActual, 3);
            this.tramiteActual.next({ ...current });
          }
          return of(current!);
        }),
      );
  }

  /**
   * Guardar entrega del recurso y completar trámite.
   */
  guardarEntrega(
    tramiteId: number,
    entrega: EntregaRecurso,
  ): Observable<TramiteRequisicion> {
    const body = {
      entregaJson: JSON.stringify(entrega),
    };
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/entrega`,
        body,
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => {
          t.estadoTramite = 'COMPLETADO';
          this.tramiteActual.next(t);
        }),
        catchError(() => {
          const current = this.tramiteActual.value;
          if (current) {
            current.entrega = entrega;
            current.pasoActual = 5;
            current.estadoTramite = 'COMPLETADO';
            this.tramiteActual.next({ ...current });
          }
          return of(current!);
        }),
      );
  }

  // ═══════════════════════════════════════
  // Bandeja de Contabilidad
  // ═══════════════════════════════════════

  // ═══════════════════════════════════════
  // Bandeja Visto Bueno
  // ═══════════════════════════════════════

  /**
   * Trámites en estado ESPERANDO_VISTO_BUENO o EN_PROCESO para el Jefe.
   */
  getBandejaVistoBueno(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<
        TramiteBackendResponse[]
      >(`${this.baseUrl}/bandeja-visto-bueno`, this.httpOptions)
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  /**
   * Trámites aceptados por el Jefe (APROBADO y ACEPTADO_CON_NOVEDAD).
   * GET /api/compras/tramite/bandeja-aceptados
   */
  getBandejaAceptados(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<
        TramiteBackendResponse[]
      >(`${this.baseUrl}/bandeja-aceptados`, this.httpOptions)
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  /**
   * Trámites en estado RECHAZADO_JEFE.
   */
  getBandejaRechazados(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<
        TramiteBackendResponse[]
      >(`${this.baseUrl}/bandeja-rechazados`, this.httpOptions)
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  // ═══════════════════════════════════════
  // Visto Bueno
  // ═══════════════════════════════════════

  /**
   * Registrar una nueva decisión de visto bueno.
   * Retorna el visto bueno creado con su ID (necesario para registrar causaciones).
   */
  registrarVistoBueno(
    tramiteId: number,
    request: {
      estado: string;
      observaciones?: string;
      novedades?: string;
      revisadoPor?: string;
      destino?: string;
    },
  ): Observable<VistoBuenoResponse> {
    return this.http
      .post<VistoBuenoResponse>(
        `${this.baseUrl}/${tramiteId}/visto-bueno`,
        request,
        this.httpOptions,
      )
      .pipe(catchError((err) => throwError(() => err)));
  }

  // ═══════════════════════════════════════
  // Causaciones
  // ═══════════════════════════════════════

  /**
   * Listar catálogo global de causaciones.
   * @param tipo Filtro opcional: 'RECHAZO' | 'ACEPTACION_CON_NOVEDAD'
   */
  getCausaciones(
    tipo?: 'RECHAZO' | 'ACEPTACION_CON_NOVEDAD',
  ): Observable<CausacionCatalogo[]> {
    const params = tipo ? `?tipo=${tipo}` : '';
    return this.http
      .get<
        CausacionCatalogo[]
      >(`${environment.apiUrl}/compras/causaciones${params}`, this.httpOptions)
      .pipe(catchError(() => of([])));
  }

  /**
   * Registrar una causación para una decisión de visto bueno específica.
   */
  registrarCausacion(
    tramiteId: number,
    vistoBuenoId: number,
    motivo: string,
    tipo: 'RECHAZO' | 'ACEPTACION_CON_NOVEDAD',
  ): Observable<any> {
    return this.http
      .post(
        `${this.baseUrl}/${tramiteId}/visto-bueno/${vistoBuenoId}/causaciones`,
        { motivo, tipo },
        this.httpOptions,
      )
      .pipe(catchError(() => of(null)));
  }

  // ═══════════════════════════════════════
  // Acciones sobre trámites rechazados
  // ═══════════════════════════════════════

  /**
   * Reenviar un trámite rechazado al jefe de compras para nueva revisión.
   * Cambia el estado del trámite de RECHAZADO_JEFE a ESPERANDO_VISTO_BUENO.
   */
  reenviarAJefeCompras(tramiteId: number): Observable<TramiteRequisicion> {
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}`,
        { estadoTramite: 'ESPERANDO_VISTO_BUENO' },
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          // Fallback: update locally
          const current = this.tramiteActual.value;
          if (current && current.id === tramiteId) {
            current.estadoTramite = 'ESPERANDO_VISTO_BUENO';
            this.tramiteActual.next({ ...current });
            return of(current);
          }
          return throwError(() => new Error('No se pudo reenviar'));
        }),
      );
  }

  /**
   * Devolver un trámite rechazado a solicitud de compra (estado PENDIENTE).
   * Resetea el trámite para que vuelva al flujo inicial.
   */
  devolverASolicitud(tramiteId: number): Observable<TramiteRequisicion> {
    return this.http
      .put<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}`,
        { estadoTramite: 'EN_PROCESO', pasoActual: 1 },
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        tap((t) => this.tramiteActual.next(t)),
        catchError(() => {
          const current = this.tramiteActual.value;
          if (current && current.id === tramiteId) {
            current.estadoTramite = 'EN_PROCESO';
            current.pasoActual = 1;
            this.tramiteActual.next({ ...current });
            return of(current);
          }
          return throwError(() => new Error('No se pudo devolver'));
        }),
      );
  }

  /**
   * Obtener el visto bueno actual (último) de un trámite.
   * GET /api/compras/tramite/{tramiteId}/visto-bueno/actual
   */
  getVistoBuenoActual(tramiteId: number): Observable<{
    id: number;
    estado: string;
    observaciones?: string;
    revisadoPor?: string;
    fechaRevision?: string;
    causaciones?: Array<{
      motivo: string;
      tipo: string;
      observaciones?: string;
    }>;
  } | null> {
    return this.http
      .get<any>(
        `${this.baseUrl}/${tramiteId}/visto-bueno/actual`,
        this.httpOptions,
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Obtener información del rechazo de un trámite por solicitudId.
   * Retorna el último visto bueno con estado RECHAZADO.
   */
  getRechazoInfoBySolicitud(solicitudId: number): Observable<{
    motivoRechazo: string;
    observaciones: string;
    fechaRechazo: string;
    revisadoPor: string;
  } | null> {
    return this.getTramiteBySolicitudId(solicitudId).pipe(
      switchMap((tramite) => {
        if (!tramite) return of(null);
        // Si ya tiene vistoBuenoJefe con motivo, usarlo directamente
        const vb = tramite.vistoBuenoJefe;
        if (vb && vb.estado === 'RECHAZADO' && vb.motivoRechazo) {
          return of({
            motivoRechazo: vb.motivoRechazo,
            observaciones: vb.observaciones || '',
            fechaRechazo: vb.fechaRevision || '',
            revisadoPor: vb.revisadoPor || 'Jefe de Compras',
          });
        }
        // Fallback: consultar visto-bueno/actual directamente con causaciones
        return this.getVistoBuenoActual(tramite.id!).pipe(
          map((vbActual) => {
            if (!vbActual || vbActual.estado !== 'RECHAZADO') return null;
            const causaRechazo = vbActual.causaciones?.find(
              (c) => c.tipo === 'RECHAZO',
            );
            return {
              motivoRechazo: causaRechazo?.motivo || 'No especificado',
              observaciones: vbActual.observaciones || '',
              fechaRechazo: vbActual.fechaRevision || '',
              revisadoPor: vbActual.revisadoPor || 'Jefe de Compras',
            };
          }),
        );
      }),
      catchError(() => of(null)),
    );
  }

  getBandejaContabilidad(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<
        TramiteBackendResponse[]
      >(`${this.baseUrl}/bandeja-contabilidad`, this.httpOptions)
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  getTramitesProcesados(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<
        TramiteBackendResponse[]
      >(`${this.baseUrl}/procesados`, this.httpOptions)
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  getAllTramites(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<TramiteBackendResponse[]>(this.baseUrl, this.httpOptions)
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  /**
   * Obtener la línea de tiempo de tracking completa de un trámite.
   * GET /api/compras/tramite/{id}/tracking
   */
  getTrackingTimeline(tramiteId: number): Observable<TrackingTimeline> {
    return this.http
      .get<TrackingTimeline>(
        `${this.baseUrl}/${tramiteId}/tracking`,
        this.httpOptions,
      )
      .pipe(
        catchError(() =>
          of({
            tramiteId,
            estadoActual: 'EN_PROCESO',
            pasoActual: 0,
            pasos: [],
          }),
        ),
      );
  }

  // ═══════════════════════════════════════
  // Proveedores por Trámite
  // ═══════════════════════════════════════

  /**
   * Obtener asociaciones proveedor ↔ OC del trámite.
   * GET /api/compras/tramite/{tramiteId}/proveedores
   */
  getProveedoresTramite(tramiteId: number): Observable<ProveedorTramite[]> {
    return this.http
      .get<
        ProveedorTramite[]
      >(`${this.baseUrl}/${tramiteId}/proveedores`, this.httpOptions)
      .pipe(catchError(() => of([])));
  }

  /**
   * Upsert masivo de asociaciones proveedor ↔ OC.
   * PUT /api/compras/tramite/{tramiteId}/proveedores
   */
  guardarProveedoresTramite(
    tramiteId: number,
    asociaciones: Array<{
      ordenCompraId: string;
      proveedorId: number | null;
      proveedorNombreFinal: string | null;
      proveedorNombreOriginalOcr: string | null;
      requiereSeleccionProveedor: boolean;
    }>,
  ): Observable<ProveedorTramite[]> {
    return this.http
      .put<
        ProveedorTramite[]
      >(`${this.baseUrl}/${tramiteId}/proveedores`, asociaciones, this.httpOptions)
      .pipe(catchError(() => of([])));
  }

  /**
   * Actualizar una sola asociación proveedor ↔ OC.
   * PATCH /api/compras/tramite/{tramiteId}/proveedores/{ordenCompraId}
   */
  actualizarProveedorOrden(
    tramiteId: number,
    ordenCompraId: string,
    body: { proveedorId: number; proveedorNombreFinal: string },
  ): Observable<ProveedorTramite> {
    return this.http
      .patch<ProveedorTramite>(
        `${this.baseUrl}/${tramiteId}/proveedores/${encodeURIComponent(ordenCompraId)}`,
        body,
        this.httpOptions,
      )
      .pipe(catchError((err) => throwError(() => err)));
  }

  /**
   * Responder un trámite desde contabilidad.
   */
  responderDesdeContabilidad(
    tramiteId: number,
    observaciones: string,
  ): Observable<TramiteRequisicion> {
    return this.http
      .post<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/responder-contabilidad`,
        { observaciones },
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        catchError(() => of(this.getMockTramite(tramiteId))),
      );
  }

  /**
   * Enviar un trámite a tesorería desde contabilidad.
   * Actualiza el estado del trámite a EN_TESORERIA y el registro contable a PROGRAMADO_PAGO.
   */
  enviarATesoreria(
    tramiteId: number,
    observaciones: string,
  ): Observable<TramiteRequisicion> {
    return this.http
      .post<TramiteBackendResponse>(
        `${this.baseUrl}/${tramiteId}/enviar-tesoreria`,
        { observaciones },
        this.httpOptions,
      )
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        catchError((err) => throwError(() => err)),
      );
  }

  /**
   * Obtener trámites en bandeja de tesorería (estado EN_TESORERIA).
   */
  getBandejaTesoreria(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<TramiteBackendResponse[]>(`${this.baseUrl}/bandeja-tesoreria`, this.httpOptions)
      .pipe(
        map((list) => list.map((item) => this.mapBackendToFrontend(item))),
        catchError(() => of([])),
      );
  }

  /**
   * Obtener bandeja de tesorería enriquecida con datos de solicitud,
   * registro contable y archivos adjuntos.
   */
  getBandejaTesoreriaEnriquecida(): Observable<any[]> {
    return this.http
      .get<any[]>(`${this.baseUrl}/bandeja-tesoreria-v2`, this.httpOptions)
      .pipe(
        catchError(() => of([])),
      );
  }

  /**
   * Obtener un solo item enriquecido de la bandeja de tesorería por solicitudId.
   * Usado por tramitar-pago cuando se accede por URL directa sin navigation state.
   */
  getSolicitudTesoreriaEnriquecida(solicitudId: number): Observable<any> {
    return this.http
      .get<any>(`${this.baseUrl}/bandeja-tesoreria-v2/${solicitudId}`, this.httpOptions);
  }

  /**
   * Finalizar el proceso de pago de una solicitud.
   * Marca el trámite como COMPLETADO y todos los estados como Conciliado.
   * Persiste los detalles de conciliación por proveedor.
   * El backend exige validación APROBADO o override auditado por proveedor.
   */
  finalizarPago(solicitudId: number, detallesConciliacion?: { proveedorRelacionId: number; valorPagado: number | null; matchPorcentaje: number | null; tipoPago: string | null; porcentajePago: number | null; nombreArchivo: string | null; comprobanteUrl?: string | null; comprobanteS3Key?: string | null; overrideManual?: boolean; overrideMotivo?: string | null; overrideUsuario?: string | null }[]): Observable<any> {
    const body = detallesConciliacion ? { detalles: detallesConciliacion } : {};
    return this.http
      .post<any>(`${this.baseUrl}/finalizar-pago/${solicitudId}`, body, this.httpOptions);
  }

  // ── Validación automática de comprobantes (backend) ──

  /**
   * Valida el CP contra egreso/factura en el backend y persiste el veredicto.
   * El backend bloquea finalizarPago si el veredicto no es APROBADO.
   */
  validarComprobante(payload: ComprobanteValidacionPayload): Observable<ComprobanteValidacionResult> {
    return this.http.post<ComprobanteValidacionResult>(
      `${environment.apiUrl}/v1/comprobantes/validar`,
      payload,
      this.httpOptions,
    );
  }

  /**
   * Sube un comprobante de pago (CP) asociado a una solicitud y proveedor.
   * El archivo se sube a S3 y se guarda la referencia en el trámite.
   */
  subirComprobantePago(solicitudId: number, proveedorRelacionId: number, file: File): Observable<{ url: string; s3Key: string; nombre: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('proveedorRelacionId', proveedorRelacionId.toString());
    return this.http.post<{ url: string; s3Key: string; nombre: string }>(
      `${this.baseUrl}/${solicitudId}/comprobante-pago`,
      formData,
    );
  }

  subirDocumentoEgreso(solicitudId: number, proveedorRelacionId: number, file: File): Observable<{ url: string; s3Key: string; nombre: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('proveedorRelacionId', proveedorRelacionId.toString());
    return this.http.post<{ url: string; s3Key: string; nombre: string }>(
      `${this.baseUrl}/${solicitudId}/documento-egreso`,
      formData,
    );
  }

  // ═══════════════════════════════════════
  // Presigned URL / Archivo Órdenes
  // ═══════════════════════════════════════

  /**
   * Subir el PDF de una orden de compra usando el endpoint dedicado por orden.
   * Returns: { url: string, key?: string }
   */
  subirArchivoOrden(
    tramiteId: number,
    ordenId: string,
    file: File,
  ): Observable<{ url: string; key?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<{
        url: string;
        key?: string;
      }>(
        `${this.baseUrl}/${tramiteId}/ordenes/${encodeURIComponent(ordenId)}/archivo`,
        formData,
      )
      .pipe(catchError(() => of({ url: URL.createObjectURL(file) })));
  }

  /**
   * Obtener presigned URL del PDF de una orden por su ID.
   * GET /api/compras/tramite/{tramiteId}/ordenes/{ordenId}/archivo
   */
  getPresignedUrlByOrden(
    tramiteId: number,
    ordenId: string,
  ): Observable<{ url: string }> {
    return this.http
      .get<{
        url: string;
      }>(
        `${this.baseUrl}/${tramiteId}/ordenes/${encodeURIComponent(ordenId)}/archivo`,
        this.httpOptions,
      )
      .pipe(catchError(() => of({ url: '' })));
  }

  /**
   * Subir el archivo de factura/cotización de una OC.
   * POST /api/compras/tramite/{tramiteId}/ordenes/{ordenId}/factura
   */
  subirFacturaOrden(
    tramiteId: number,
    ordenId: string,
    file: File,
  ): Observable<{ url: string; s3Key?: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<{
        url: string;
        s3Key?: string;
      }>(`${this.baseUrl}/${tramiteId}/ordenes/${encodeURIComponent(ordenId)}/factura`, formData);
  }

  facturaExiste(numero: string, ordenId: string): Observable<{existe: boolean}> {
    return this.http.get<{existe: boolean}>(`${environment.apiUrl}/compras/facturas/existe`, {params: {numero, ordenId}});
  }

  /**
   * Obtener presigned URL del archivo de factura de una orden.
   * GET /api/compras/tramite/{tramiteId}/ordenes/{ordenId}/factura
   */
  getPresignedUrlFactura(
    tramiteId: number,
    ordenId: string,
  ): Observable<{ url: string }> {
    return this.http
      .get<{
        url: string;
      }>(`${this.baseUrl}/${tramiteId}/ordenes/${encodeURIComponent(ordenId)}/factura`, this.httpOptions)
      .pipe(catchError(() => of({ url: '' })));
  }

  /**
   * Listar las órdenes de compra cargadas del trámite (fuente autoritativa de IDs).
   * GET /api/compras/tramite/{tramiteId}/ordenes
   */
  getOrdenesFromBackend(tramiteId: number): Observable<
    Array<{
      id: string;
      nombreArchivo: string;
      archivoUrl?: string;
      archivoKey?: string;
    }>
  > {
    return this.http
      .get<any[]>(`${this.baseUrl}/${tramiteId}/ordenes`, this.httpOptions)
      .pipe(catchError(() => of([])));
  }

  /**
   * Obtener presigned URL temporal mediante clave S3.
   * GET /api/compras/tramite/{tramiteId}/archivo/{archivoKey}/presigned
   */
  getPresignedUrl(
    tramiteId: number,
    archivoKey: string,
  ): Observable<{ url: string }> {
    return this.http
      .get<{
        url: string;
      }>(
        `${this.baseUrl}/${tramiteId}/archivo/${encodeURIComponent(archivoKey)}/presigned`,
        this.httpOptions,
      )
      .pipe(catchError(() => of({ url: '' })));
  }

  // ═══════════════════════════════════════
  // Subir archivos
  // ═══════════════════════════════════════

  subirArchivo(
    tramiteId: number,
    paso: string,
    file: File,
  ): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<{
        url: string;
      }>(`${this.baseUrl}/${tramiteId}/upload/${paso}`, formData)
      .pipe(catchError(() => of({ url: URL.createObjectURL(file) })));
  }

  // ═══════════════════════════════════════
  // Estado local
  // ═══════════════════════════════════════

  setTramiteActual(tramite: TramiteRequisicion): void {
    this.tramiteActual.next(tramite);
  }

  getTramiteActual(): TramiteRequisicion | null {
    return this.tramiteActual.value;
  }

  limpiarTramite(): void {
    this.tramiteActual.next(null);
  }

  // ═══════════════════════════════════════
  // Mappers Backend ↔ Frontend
  // ═══════════════════════════════════════

  private mapBackendToFrontend(
    res: TramiteBackendResponse,
    solicitud?: SolicitudCompra,
  ): TramiteRequisicion {
    let ordenesCargadas: OrdenCompraCargada[] = [];
    if (res.ordenesCargadasJson) {
      try {
        ordenesCargadas = JSON.parse(res.ordenesCargadasJson);
      } catch (e) {
        /* ignore parse error */
      }
    }

    let recepcion: RecepcionRecurso | undefined;
    if (res.recepcionJson) {
      try {
        recepcion = JSON.parse(res.recepcionJson);
      } catch (e) {
        /* ignore */
      }
    }

    let entrega: EntregaRecurso | undefined;
    if (res.entregaJson) {
      try {
        entrega = JSON.parse(res.entregaJson);
      } catch (e) {
        /* ignore */
      }
    }

    let facturasCargadas: FacturaCargada[] = [];
    if (res.facturasJson) {
      try {
        facturasCargadas = JSON.parse(res.facturasJson);
      } catch (e) {
        /* ignore */
      }
    }

    let comparacionesOcFactura: ComparacionOcFactura[] = [];
    if (res.comparacionOcFacturaJson) {
      try {
        comparacionesOcFactura = JSON.parse(res.comparacionOcFacturaJson);
      } catch (e) {
        /* ignore */
      }
    }

    return {
      id: res.id,
      solicitudCompraId: res.solicitudId,
      estadoTramite: (res.estadoTramite || 'EN_PROCESO') as EstadoTramite,
      pasoActual: res.pasoActual || 1,
      tipoPago: (res.tipoPago as TipoPago) || undefined,
      requisicion: {
        numeroRequisicion:
          res.numeroRequisicion || solicitud?.codigoSolicitud || '',
        fecha: solicitud?.fechaSolicitud || '',
        solicitante: res.solicitante || solicitud?.solicitante || '',
        areaCentroCosto:
          res.areaCentroCosto || solicitud?.areaSolicitante || '',
        tipoCompra: res.tipoCompra || 'General',
        descripcionBreve:
          res.descripcionBreve ||
          solicitud?.observaciones ||
          'Requisición de compra',
        valorEstimado: res.valorEstimado,
        // Datos extendidos de la solicitud original
        cargo: solicitud?.cargo,
        correoElectronico: solicitud?.correoElectronico,
        telefonoContacto: solicitud?.telefonoContacto,
        tipoRequerimiento: solicitud?.tipoRequerimiento,
        otroRequerimiento: solicitud?.otroRequerimiento,
        esCompra: solicitud?.esCompra,
        empresaCentroCostos: solicitud?.empresaCentroCostos,
        evidenciaUrl: solicitud?.evidenciaUrl,
        vistoBuenoUrl: solicitud?.vistoBuenoUrl,
        datosAdicionales: solicitud?.datosAdicionales,
        estado: solicitud?.estado as string,
        creadoPor: solicitud?.creadoPor,
        fechaCreacion: solicitud?.fechaCreacion,
      },
      cotizaciones: [],
      ordenesCargadas,
      facturasCargadas,
      comparacionesOcFactura,
      proveedores: res.proveedores || [],
      recepcion,
      entrega,
      comparativaPlaneacionOc: res.comparativaPlaneacionOcJson
        ? (() => { try { return JSON.parse(res.comparativaPlaneacionOcJson); } catch { return undefined; } })()
        : undefined,
      comparativaBorrador: res.comparativaBorradorJson
        ? (() => { try { return JSON.parse(res.comparativaBorradorJson); } catch { return undefined; } })()
        : undefined,
      vistoBuenoJefe: this.mapVistoBueno(res),
      valorTotalOrdenes: res.valorTotalOrdenes || undefined,
      montoSubtotal: res.montoSubtotal || undefined,
      ivaPorcentaje: res.ivaPorcentaje || undefined,
      ivaValor: res.ivaValor || undefined,
      reteFuenteValor: res.reteFuenteValor || undefined,
      reteIcaValor: res.reteIcaValor || undefined,
      valorNetoPagar: res.valorNetoPagar || undefined,
      enviadoContabilidad: res.enviadoContabilidad || false,
      respuestaContabilidad: res.respuestaContabilidad || false,
      fechaCreacion: res.fechaCreacion,
      fechaActualizacion: res.fechaActualizacion,
    };
  }

  private mapVistoBueno(
    res: TramiteBackendResponse,
  ): import('../models/tramitar-requisicion.model').VistoBuenoJefe | undefined {
    // Preferred: nested object
    const vb = res.ultimoVistoBueno ?? res.vistoBueno;
    if (vb) {
      const causacionRechazo = vb.causaciones?.find(
        (c) => c.tipo === 'RECHAZO',
      );
      const motivoRechazo =
        causacionRechazo?.motivo ?? vb.motivoRechazo ?? res.motivoRechazo;
      const causacionNovedadItem = vb.causaciones?.find(
        (c) => c.tipo === 'ACEPTACION_CON_NOVEDAD',
      );
      const causacionNovedad =
        causacionNovedadItem?.motivo ??
        vb.causacionNovedad ??
        res.causacionNovedad;
      return {
        estado:
          vb.estado as import('../models/tramitar-requisicion.model').EstadoVistoBueno,
        motivoRechazo,
        causacionNovedad,
        observaciones: vb.observaciones,
        novedades: vb.novedades,
        revisadoPor: vb.revisadoPor,
        fechaRevision: vb.fechaRevision,
      };
    }
    // Fallback: flat fields on the tramite
    if (res.vistoBuenoEstado) {
      return {
        estado:
          res.vistoBuenoEstado as import('../models/tramitar-requisicion.model').EstadoVistoBueno,
        motivoRechazo: res.motivoRechazo,
        causacionNovedad: res.causacionNovedad,
        observaciones: res.vistoBuenoObservaciones,
        novedades: res.vistoBuenoNovedades,
        revisadoPor: res.vistoBuenoRevisadoPor,
        fechaRevision: res.vistoBuenoFechaRevision,
      };
    }
    return undefined;
  }

  private mapFrontendToBackend(tramite: TramiteRequisicion): any {
    return {
      solicitudId: tramite.solicitudCompraId,
      numeroRequisicion: tramite.requisicion.numeroRequisicion,
      estadoTramite: tramite.estadoTramite,
      pasoActual: tramite.pasoActual,
      solicitante: tramite.requisicion.solicitante,
      areaCentroCosto: tramite.requisicion.areaCentroCosto,
      tipoCompra: tramite.requisicion.tipoCompra,
      descripcionBreve: tramite.requisicion.descripcionBreve,
      valorEstimado: tramite.requisicion.valorEstimado,
      ordenesCargadasJson:
        tramite.ordenesCargadas.length > 0
          ? JSON.stringify(
              tramite.ordenesCargadas.map((o) => ({
                id: o.id,
                nombreArchivo: o.nombreArchivo,
                tamanoArchivo: o.tamanoArchivo,
                estadoEscaneo: o.estadoEscaneo,
                numeroOC: o.numeroOC,
                proveedor: o.proveedor,
                nitProveedor: o.nitProveedor,
                fechaEmision: o.fechaEmision,
                valorAntesIva: o.valorAntesIva,
                ivaPorcentaje: o.ivaPorcentaje,
                valorIva: o.valorIva,
                valorTotal: o.valorTotal,
                responsableCompra: o.responsableCompra,
                descripcionItems: o.descripcionItems,
                condicionesPago: o.condicionesPago,
                tiempoEntrega: o.tiempoEntrega,
                confianzaOCR: o.confianzaOCR,
                archivoUrl:
                  o.archivoUrl ||
                  (typeof o.archivo === 'string' && o.archivo
                    ? o.archivo
                    : undefined),
                // Per-OC tipo de pago
                tipoPago: o.tipoPago,
                // Facturación/Cotización inline per-OC
                observacionDocFacturacion: o.observacionDocFacturacion,
                facturaNombreArchivo: o.facturaNombreArchivo,
                facturaEstadoEscaneo: o.facturaEstadoEscaneo,
                facturaProgresoEscaneo: o.facturaProgresoEscaneo,
                facturaNumero: o.facturaNumero,
                facturaProveedor: o.facturaProveedor,
                facturaNitProveedor: o.facturaNitProveedor,
                facturaFechaEmision: o.facturaFechaEmision,
                facturaValorAntesIva: o.facturaValorAntesIva,
                facturaIvaPorcentaje: o.facturaIvaPorcentaje,
                facturaValorIva: o.facturaValorIva,
                facturaValorTotal: o.facturaValorTotal,
                facturaConfianzaOCR: o.facturaConfianzaOCR,
                // Comparación OC vs Factura inline
                comparacionCoincide: o.comparacionCoincide,
                comparacionDiferencia: o.comparacionDiferencia,
                comparacionPorcentaje: o.comparacionPorcentaje,
                comparacionDetalles: o.comparacionDetalles,
                // Datos de crédito (solo cuando tipoPago === 'CREDITO')
                creditoFechasPago: o.creditoFechasPago,
                creditoObservacionesOC: o.creditoObservacionesOC,
                creditoFechaEntrega: o.creditoFechaEntrega,
                creditoPlazosDias: o.creditoPlazosDias,
                creditoConsumoDesde: o.creditoConsumoDesde,
                creditoConsumoHasta: o.creditoConsumoHasta,
                creditoNumeroDoc: o.creditoNumeroDoc,
                creditoCobertura: o.creditoCobertura,
                creditoDireccionEntrega: o.creditoDireccionEntrega,
                creditoContactoEntrega: o.creditoContactoEntrega,
              })),
            )
          : null,
      totalOrdenes: tramite.ordenesCargadas.length,
      valorTotalOrdenes: tramite.ordenesCargadas.reduce(
        (s, o) => s + o.valorTotal,
        0,
      ),
      recepcionJson: tramite.recepcion
        ? JSON.stringify(tramite.recepcion)
        : null,
      entregaJson: tramite.entrega ? JSON.stringify(tramite.entrega) : null,
    };
  }

  // ═══════════════════════════════════════
  // Mock / Fallback
  // ═══════════════════════════════════════

  private crearTramiteDesdeSolicitud(
    solicitud: SolicitudCompra,
  ): TramiteRequisicion {
    return {
      id: Date.now(),
      solicitudCompraId: solicitud.id,
      estadoTramite: 'EN_PROCESO',
      pasoActual: 1,
      requisicion: {
        numeroRequisicion: solicitud.codigoSolicitud,
        fecha: solicitud.fechaSolicitud,
        solicitante: solicitud.solicitante,
        areaCentroCosto: solicitud.areaSolicitante,
        tipoCompra: 'General',
        descripcionBreve: solicitud.observaciones || 'Requisición de compra',
        valorEstimado: undefined,
        cargo: solicitud.cargo,
        correoElectronico: solicitud.correoElectronico,
        telefonoContacto: solicitud.telefonoContacto,
        tipoRequerimiento: solicitud.tipoRequerimiento,
        otroRequerimiento: solicitud.otroRequerimiento,
        esCompra: solicitud.esCompra,
        empresaCentroCostos: solicitud.empresaCentroCostos,
        evidenciaUrl: solicitud.evidenciaUrl,
        vistoBuenoUrl: solicitud.vistoBuenoUrl,
        datosAdicionales: solicitud.datosAdicionales,
        estado: solicitud.estado as string,
        creadoPor: solicitud.creadoPor,
        fechaCreacion: solicitud.fechaCreacion,
      },
      cotizaciones: [],
      ordenesCargadas: [],
      enviadoContabilidad: false,
      respuestaContabilidad: false,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };
  }

  private getMockTramite(id: number): TramiteRequisicion {
    return {
      id,
      solicitudCompraId: id,
      estadoTramite: 'EN_PROCESO',
      pasoActual: 1,
      requisicion: {
        numeroRequisicion: '',
        fecha: '',
        solicitante: '',
        areaCentroCosto: '',
        tipoCompra: 'General',
        descripcionBreve: 'Requisición de compra',
        valorEstimado: undefined,
      },
      cotizaciones: [],
      ordenesCargadas: [],
      enviadoContabilidad: false,
      respuestaContabilidad: false,
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };
  }
}
