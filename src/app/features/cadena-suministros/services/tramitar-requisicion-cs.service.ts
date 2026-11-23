import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  TramiteRequisicion,
  OrdenCompraCargada,
  RecepcionRecurso,
  EntregaRecurso,
  FacturaCargada,
  ComparacionOcFactura,
  EstadoTramite,
  TipoPago,
  VistoBuenoResponse,
  VistoBuenoJefe,
  EstadoVistoBueno,
  CausacionCatalogo,
} from '../models/tramitar-requisicion-cs.model';

/**
 * Respuesta del backend para un trámite (cadena de suministros).
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
  ultimoVistoBueno?: VistoBuenoBackend;
  vistoBueno?: VistoBuenoBackend;
  vistoBuenoEstado?: string;
  vistoBuenoObservaciones?: string;
  vistoBuenoNovedades?: string;
  vistoBuenoRevisadoPor?: string;
  vistoBuenoFechaRevision?: string;
  motivoRechazo?: string;
  causacionNovedad?: string;
  creadoPor: string;
  fechaCreacion: string;
  fechaActualizacion: string;
}

/**
 * Servicio independiente de Cadena de Suministros para la bandeja de visto bueno.
 * Modificar este servicio NO afecta al módulo de compras.
 */
@Injectable({
  providedIn: 'root',
})
export class TramitarRequisicionCsService {
  private readonly baseUrl = `${environment.apiUrl}/compras/tramite`;
  private readonly httpOptions = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
  };

  constructor(private http: HttpClient) {}

  // ═══════════════════════════════════════
  // Bandeja de Visto Bueno
  // ═══════════════════════════════════════

  /**
   * Trámites en estado ESPERANDO_VISTO_BUENO o EN_PROCESO para el Jefe.
   */
  getBandejaVistoBueno(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<TramiteBackendResponse[]>(
        `${this.baseUrl}/bandeja-cadena-suministros`,
        this.httpOptions,
      )
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  /**
   * Trámites aceptados por el Jefe (APROBADO y ACEPTADO_CON_NOVEDAD).
   */
  getBandejaAceptados(): Observable<TramiteRequisicion[]> {
    return this.http
      .get<TramiteBackendResponse[]>(
        `${this.baseUrl}/bandeja-aceptados`,
        this.httpOptions,
      )
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
      .get<TramiteBackendResponse[]>(
        `${this.baseUrl}/bandeja-rechazados`,
        this.httpOptions,
      )
      .pipe(
        map((items) => items.map((i) => this.mapBackendToFrontend(i))),
        catchError(() => of([])),
      );
  }

  /**
   * Obtener un trámite por ID (detalle completo).
   * GET /api/compras/tramite/{id}
   */
  getTramite(id: number): Observable<TramiteRequisicion | null> {
    return this.http
      .get<TramiteBackendResponse>(`${this.baseUrl}/${id}`, this.httpOptions)
      .pipe(
        map((res) => this.mapBackendToFrontend(res)),
        catchError(() => of(null)),
      );
  }

  /**
   * Obtener un trámite por ID de solicitud de compra.
   * GET /api/compras/tramite/solicitud/{solicitudId}
   */
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
        catchError((error) => {
          if (error.status === 404 || error.status === 0) {
            return of(null);
          }
          // Fallback seguro para otros errores
          return of(null);
        }),
      );
  }

  // ═══════════════════════════════════════
  // Visto Bueno
  // ═══════════════════════════════════════

  /**
   * Registrar una nueva decisión de visto bueno.
   */
  registrarVistoBueno(
    tramiteId: number,
    request: {
      estado: string;
      observaciones?: string;
      novedades?: string;
      revisadoPor?: string;
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

  /**
   * Registrar una causación asociada a una decisión de visto bueno.
   * POST /api/compras/tramite/{tramiteId}/visto-bueno/{vistoBuenoId}/causaciones
   */
  registrarCausacion(
    tramiteId: number,
    vistoBuenoId: number,
    descripcion: string,
    tipo: 'RECHAZO' | 'ACEPTACION_CON_NOVEDAD',
  ): Observable<any> {
    return this.http
      .post(
        `${this.baseUrl}/${tramiteId}/visto-bueno/${vistoBuenoId}/causaciones`,
        { descripcion, tipo },
        this.httpOptions,
      )
      .pipe(catchError(() => of(null)));
  }

  // ═══════════════════════════════════════
  // Causaciones
  // ═══════════════════════════════════════

  getCausaciones(
    tipo?: 'RECHAZO' | 'ACEPTACION_CON_NOVEDAD',
  ): Observable<CausacionCatalogo[]> {
    const params = tipo ? `?tipo=${tipo}` : '';
    return this.http
      .get<CausacionCatalogo[]>(
        `${environment.apiUrl}/compras/causaciones${params}`,
        this.httpOptions,
      )
      .pipe(catchError(() => of([])));
  }

  // ═══════════════════════════════════════
  // Archivos / Presigned URLs
  // ═══════════════════════════════════════

  /**
   * Obtener presigned URL del archivo de una orden de compra.
   * GET /api/compras/tramite/{tramiteId}/ordenes/{ordenId}/archivo
   */
  getPresignedUrlByOrden(
    tramiteId: number,
    ordenId: string,
  ): Observable<{ url: string }> {
    return this.http
      .get<{ url: string }>(
        `${this.baseUrl}/${tramiteId}/ordenes/${encodeURIComponent(ordenId)}/archivo`,
        this.httpOptions,
      )
      .pipe(catchError(() => of({ url: '' })));
  }

  /**
   * Obtener presigned URL del archivo de factura/cotización de una orden.
   * GET /api/compras/tramite/{tramiteId}/ordenes/{ordenId}/factura
   */
  getPresignedUrlFactura(
    tramiteId: number,
    ordenId: string,
  ): Observable<{ url: string }> {
    return this.http
      .get<{ url: string }>(
        `${this.baseUrl}/${tramiteId}/ordenes/${encodeURIComponent(ordenId)}/factura`,
        this.httpOptions,
      )
      .pipe(catchError(() => of({ url: '' })));
  }

  /**
   * Listar órdenes de compra del backend (fuente autoritativa de IDs / URLs).
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

  // ═══════════════════════════════════════
  // Mapeo Backend → Frontend
  // ═══════════════════════════════════════

  private mapBackendToFrontend(res: TramiteBackendResponse): TramiteRequisicion {
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
        numeroRequisicion: res.numeroRequisicion || '',
        fecha: '',
        solicitante: res.solicitante || '',
        areaCentroCosto: res.areaCentroCosto || '',
        tipoCompra: res.tipoCompra || 'General',
        descripcionBreve: res.descripcionBreve || 'Requisición de compra',
        valorEstimado: res.valorEstimado,
      },
      cotizaciones: [],
      ordenesCargadas,
      facturasCargadas,
      comparacionesOcFactura,
      recepcion,
      entrega,
      vistoBuenoJefe: this.mapVistoBueno(res),
      enviadoContabilidad: res.enviadoContabilidad || false,
      respuestaContabilidad: res.respuestaContabilidad || false,
      fechaCreacion: res.fechaCreacion,
      fechaActualizacion: res.fechaActualizacion,
    };
  }

  private mapVistoBueno(res: TramiteBackendResponse): VistoBuenoJefe | undefined {
    const vb = res.ultimoVistoBueno ?? res.vistoBueno;
    if (vb) {
      const motivoRechazo =
        vb.causaciones?.find((c) => c.tipo === 'RECHAZO')?.motivo ??
        vb.motivoRechazo ??
        res.motivoRechazo;
      const causacionNovedad =
        vb.causaciones?.find((c) => c.tipo === 'ACEPTACION_CON_NOVEDAD')
          ?.motivo ?? vb.causacionNovedad ?? res.causacionNovedad;
      return {
        estado: vb.estado as EstadoVistoBueno,
        motivoRechazo,
        causacionNovedad,
        observaciones: vb.observaciones,
        novedades: vb.novedades,
        revisadoPor: vb.revisadoPor,
        fechaRevision: vb.fechaRevision,
      };
    }
    if (res.vistoBuenoEstado) {
      return {
        estado: res.vistoBuenoEstado as EstadoVistoBueno,
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

  // ═══════════════════════════════════════
  // Enviar a Contabilidad (desde CS)
  // ═══════════════════════════════════════

  /**
   * Envía el trámite a contabilidad después de que todas las OC
   * han sido conciliadas en cadena de suministros.
   */
  enviarAContabilidad(tramiteId: number): Observable<{ success: boolean }> {
    return this.http
      .post<{ success: boolean }>(
        `${this.baseUrl}/${tramiteId}/enviar-contabilidad`,
        {},
        this.httpOptions,
      )
      .pipe(
        catchError((err) => {
          console.error('Error al enviar a contabilidad desde CS:', err);
          return throwError(() => err);
        }),
      );
  }
}
