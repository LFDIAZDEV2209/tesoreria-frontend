import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ═══════════════════════════════════════════════════════════
//  ENUMS (tipos string)
// ═══════════════════════════════════════════════════════════

export type ConceptoRetencion =
  | 'COMPRAS_GENERALES'
  | 'COMPRAS_TARJETA'
  | 'SERVICIOS_GENERALES'
  | 'HONORARIOS'
  | 'COMISIONES'
  | 'CONSULTORIA'
  | 'ARRENDAMIENTO_INMUEBLES'
  | 'ARRENDAMIENTO_MUEBLES'
  | 'TRANSPORTE_CARGA'
  | 'TRANSPORTE_PASAJEROS'
  | 'OTROS_INGRESOS'
  | 'CONTRATOS_CONSTRUCCION'
  | 'HOTELES_RESTAURANTES'
  | 'LICENCIAMIENTO_SOFTWARE'
  | 'SERVICIOS_TEMPORALES'
  | 'VIGILANCIA_ASEO';

export type TipoOperacion =
  | 'COMPRAS'
  | 'SERVICIOS'
  | 'HONORARIOS'
  | 'ARRENDAMIENTOS'
  | 'COMISIONES'
  | 'TRANSPORTE'
  | 'OTROS'
  | 'BIENES'
  | 'IVA';

export type TipoPersona =
  | 'PERSONA_JURIDICA'
  | 'PERSONA_NATURAL_DECLARANTE'
  | 'PERSONA_NATURAL_NO_DECLARANTE';

// ═══════════════════════════════════════════════════════════
//  REQUEST
// ═══════════════════════════════════════════════════════════

export interface RetencionCalculoRequest {
  /** Monto bruto del pago */
  valorPago: number;
  /** Obligatorio */
  tipoOperacion: TipoOperacion | string;
  /** Obligatorio */
  tipoPersona: TipoPersona | string;
  /** Opcional — si no se pasa, el backend lo infiere por tipoOperacion */
  conceptoRetencion?: ConceptoRetencion | string;
  proveedorId?: number;
  tramiteId?: number;
  /** Opcional — por defecto usa el año actual */
  anioFiscal?: number;
}

// ═══════════════════════════════════════════════════════════
//  RESPONSE — Cálculo
// ═══════════════════════════════════════════════════════════

export interface RetencionCalculoResponse {
  id?: number;
  tramiteId?: number;
  registroContableId?: number;
  proveedorId?: number;
  conceptoRetencion: string;
  tipoOperacion: string;
  tipoPersona: string;
  valorPago: number;
  /** Base mínima en pesos (baseMinimaUvt × valorUVT del año) */
  baseMinimaPesos: number;
  tarifaAplicada: number;
  valorRetenido: number;
  valorNetoPagar: number;
  /** true si valorPago >= baseMinimaPesos o baseMinimaUvt == 0 */
  aplicaRetencion: boolean;
  uvtUtilizada: number;
  anioFiscal: number;
  observaciones: string;
  calculadoAutomaticamente: boolean;
  /** ISO-8601 */
  fechaCalculo?: string;
  calculadoPor?: string;
  proveedorNombre?: string;
  descripcionRegla?: string;
}

// ═══════════════════════════════════════════════════════════
//  RESPONSE — Configuración
// ═══════════════════════════════════════════════════════════

export interface ConfiguracionRetencion {
  id?: number;
  conceptoRetencion: string;
  tipoOperacion: string;
  tipoPersona: string;
  baseMinimaUvt: number;
  tarifaRetencion: number;
  anioVigencia: number;
  descripcion?: string;
  activo?: boolean;
  /** Calculado por el backend: baseMinimaUvt × valorUVT del año */
  baseMinimaPesos?: number;
}

// ═══════════════════════════════════════════════════════════
//  RESPONSE — UVT
// ═══════════════════════════════════════════════════════════

export interface UvtAnual {
  id?: number;
  anio: number;
  valorUvt: number;
  activo?: boolean;
}

// ═══════════════════════════════════════════════════════════
//  API ERROR
// ═══════════════════════════════════════════════════════════

export interface ApiError {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  details?: string[];
}

// ═══════════════════════════════════════════════════════════
//  SERVICE
// ═══════════════════════════════════════════════════════════

@Injectable({ providedIn: 'root' })
export class RetencionFuenteService {
  private readonly baseUrl = `${environment.apiUrl}/retencion-fuente`;

  constructor(private http: HttpClient) {}

  // ── Cálculo ──────────────────────────────────────────────

  /**
   * POST /api/retencion-fuente/calcular
   * Calcula la retención SIN persistirla (preview / simulación).
   * @returns 200 — RetencionCalculoResponse
   */
  calcular(
    request: RetencionCalculoRequest,
  ): Observable<RetencionCalculoResponse> {
    return this.http.post<RetencionCalculoResponse>(
      `${this.baseUrl}/calcular`,
      request,
    );
  }

  /**
   * POST /api/retencion-fuente/calcular-guardar
   * Calcula la retención Y la persiste en la BD.
   * @returns 201 — RetencionCalculoResponse (con id asignado)
   */
  calcularYGuardar(
    request: RetencionCalculoRequest,
  ): Observable<RetencionCalculoResponse> {
    return this.http.post<RetencionCalculoResponse>(
      `${this.baseUrl}/calcular-guardar`,
      request,
    );
  }

  /**
   * POST /api/retencion-fuente/calcular-tramite/{tramiteId}
   * Calcula retención automática para un trámite existente.
   * @returns 201 — RetencionCalculoResponse
   */
  calcularParaTramite(tramiteId: number): Observable<RetencionCalculoResponse> {
    return this.http.post<RetencionCalculoResponse>(
      `${this.baseUrl}/calcular-tramite/${tramiteId}`,
      {},
    );
  }

  // ── Consultas de retenciones ──────────────────────────────

  /**
   * GET /api/retencion-fuente/tramite/{tramiteId}
   * @returns 200 — RetencionCalculoResponse[]
   */
  getByTramite(tramiteId: number): Observable<RetencionCalculoResponse[]> {
    return this.http
      .get<RetencionCalculoResponse[]>(`${this.baseUrl}/tramite/${tramiteId}`)
      .pipe(catchError(() => of([])));
  }

  /**
   * GET /api/retencion-fuente/proveedor/{proveedorId}
   * @returns 200 — RetencionCalculoResponse[]
   */
  getByProveedor(proveedorId: number): Observable<RetencionCalculoResponse[]> {
    return this.http
      .get<
        RetencionCalculoResponse[]
      >(`${this.baseUrl}/proveedor/${proveedorId}`)
      .pipe(catchError(() => of([])));
  }

  /**
   * GET /api/retencion-fuente/anio/{anio}
   * @returns 200 — RetencionCalculoResponse[]
   */
  getByAnio(anio: number): Observable<RetencionCalculoResponse[]> {
    return this.http
      .get<RetencionCalculoResponse[]>(`${this.baseUrl}/anio/${anio}`)
      .pipe(catchError(() => of([])));
  }

  // ── Configuración de retención ────────────────────────────

  /**
   * GET /api/retencion-fuente/configuraciones
   * Lista TODAS las configuraciones activas.
   * @returns 200 — ConfiguracionRetencion[]
   */
  getConfiguraciones(): Observable<ConfiguracionRetencion[]> {
    return this.http
      .get<ConfiguracionRetencion[]>(`${this.baseUrl}/configuraciones`)
      .pipe(catchError(() => of([])));
  }

  /**
   * GET /api/retencion-fuente/configuraciones/todas
   * Lista TODAS las configuraciones (activas e inactivas).
   * @returns 200 — ConfiguracionRetencion[]
   */
  getTodasConfiguraciones(): Observable<ConfiguracionRetencion[]> {
    return this.http
      .get<ConfiguracionRetencion[]>(`${this.baseUrl}/configuraciones/todas`)
      .pipe(catchError(() => of([])));
  }

  /**
   * GET /api/retencion-fuente/configuraciones/{id}
   * Obtiene una configuración por su ID (incluye baseMinimaPesos calculada).
   * @returns 200 — ConfiguracionRetencion
   * @throws  404 — si no existe
   */
  getConfiguracionById(id: number): Observable<ConfiguracionRetencion> {
    return this.http.get<ConfiguracionRetencion>(
      `${this.baseUrl}/configuraciones/${id}`,
    );
  }

  /**
   * GET /api/retencion-fuente/configuraciones/anio/{anio}
   * Lista configuraciones de un año específico (incluye baseMinimaPesos calculado).
   * @returns 200 — ConfiguracionRetencion[]
   */
  getConfiguracionesByAnio(anio: number): Observable<ConfiguracionRetencion[]> {
    return this.http
      .get<
        ConfiguracionRetencion[]
      >(`${this.baseUrl}/configuraciones/anio/${anio}`)
      .pipe(catchError(() => of([])));
  }

  /**
   * POST /api/retencion-fuente/configuraciones
   * Crea una nueva configuración.
   * @returns 201 — ConfiguracionRetencion (con id y baseMinimaPesos)
   * @throws  409 — si ya existe (concepto + operación + persona + año)
   */
  createConfiguracion(
    config: ConfiguracionRetencion,
  ): Observable<ConfiguracionRetencion> {
    return this.http.post<ConfiguracionRetencion>(
      `${this.baseUrl}/configuraciones`,
      config,
    );
  }

  /**
   * PUT /api/retencion-fuente/configuraciones/{id}
   * Actualiza una configuración existente.
   * @returns 200 — ConfiguracionRetencion actualizada
   * @throws  404 | 409
   */
  updateConfiguracion(
    id: number,
    config: ConfiguracionRetencion,
  ): Observable<ConfiguracionRetencion> {
    return this.http.put<ConfiguracionRetencion>(
      `${this.baseUrl}/configuraciones/${id}`,
      config,
    );
  }

  /**
   * DELETE /api/retencion-fuente/configuraciones/{id}
   * Desactiva (soft delete) una configuración.
   * @returns 204 — No Content
   */
  deleteConfiguracion(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/configuraciones/${id}`);
  }

  // ── UVT ──────────────────────────────────────────────────

  /**
   * GET /api/retencion-fuente/uvt
   * Lista todos los valores UVT registrados por año.
   * @returns 200 — UvtAnual[]
   */
  getAllUvt(): Observable<UvtAnual[]> {
    return this.http
      .get<UvtAnual[]>(`${this.baseUrl}/uvt`)
      .pipe(catchError(() => of([])));
  }

  /**
   * GET /api/retencion-fuente/uvt/{anio}
   * Obtiene el valor UVT de un año específico.
   * @returns 200 — UvtAnual
   * @throws  404 — si no existe ese año
   */
  getUvtByAnio(anio: number): Observable<UvtAnual> {
    return this.http.get<UvtAnual>(`${this.baseUrl}/uvt/${anio}`);
  }

  /**
   * POST /api/retencion-fuente/uvt
   * Upsert: crea o actualiza el valor UVT de un año.
   * @returns 200 — UvtAnual
   */
  createOrUpdateUvt(uvt: UvtAnual): Observable<UvtAnual> {
    return this.http.post<UvtAnual>(`${this.baseUrl}/uvt`, uvt);
  }

  // ── Aliases para compatibilidad con otros módulos ─────────

  /** @deprecated Usar calcular() */
  calcularRetencion = this.calcular.bind(this);
  /** @deprecated Usar calcularYGuardar() */
  calcularYGuardarRetencion = this.calcularYGuardar.bind(this);
  /** @deprecated Usar calcularParaTramite() */
  calcularRetencionParaTramite = this.calcularParaTramite.bind(this);
  /** @deprecated Usar getByTramite() */
  getRetencionesByTramite = this.getByTramite.bind(this);
  /** @deprecated Usar getByProveedor() */
  getRetencionesByProveedor = this.getByProveedor.bind(this);
  /** @deprecated Usar getByAnio() */
  getRetencionesByAnio = this.getByAnio.bind(this);
}
