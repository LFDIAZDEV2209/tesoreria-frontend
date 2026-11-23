import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpEvent } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  EgresoRegistrado, CheckDuplicadoResponse, CotizacionEgreso,
  EgresoHistoricoItem, HistorialEstadoEgreso, HistoricoEgresosResponse,
} from './control-egresos.model';

@Injectable({ providedIn: 'root' })
export class ControlEgresosService {
  private baseUrl = `${environment.apiUrl}/contabilidad/egresos-registrados`;

  constructor(private http: HttpClient) {}

  adjuntarSoporte(id: number, file: File): Observable<HttpEvent<{nombre: string; key: string}>> {
    const body = new FormData(); body.append('file', file);
    return this.http.post<{nombre: string; key: string}>(`${this.baseUrl}/${id}/soporte`, body, {observe: 'events', reportProgress: true});
  }
  verSoporte(id: number): Observable<{url: string}> {
    return this.http.get<{url: string}>(`${this.baseUrl}/${id}/soporte`);
  }

  listar(): Observable<EgresoRegistrado[]> {
    return this.http.get<EgresoRegistrado[]>(this.baseUrl);
  }

  /** Egresos enviados a Tesorería pendientes de pago (con su monto) */
  listarParaTesoreria(): Observable<EgresoRegistrado[]> {
    return this.http.get<EgresoRegistrado[]>(`${this.baseUrl}/para-tesoreria`);
  }

  /** Egresos de pagos proyectados pendientes de envío a Gerencia Financiera */
  listarPendientesEnvio(): Observable<EgresoRegistrado[]> {
    return this.http.get<EgresoRegistrado[]>(`${this.baseUrl}/pendientes-envio`);
  }

  /** Módulo Tesorería: egresos aprobados por Gerencia Financiera (pago + conciliación) */
  listarPagosTesoreria(): Observable<EgresoRegistrado[]> {
    return this.http.get<EgresoRegistrado[]>(`${this.baseUrl}/tesoreria-pagos`);
  }

  /**
   * Las 40 causales oficiales de eliminación, centralizadas en el backend.
   * El selector del contador las consume desde aquí; el backend valida la
   * enviada contra esta misma lista.
   */
  listarCausalesEliminacion(): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.baseUrl}/causales-eliminacion`)
      .pipe(catchError(() => of([])));
  }

  desdePago(id: number, cuenta: string | null) { return this.http.post<EgresoRegistrado>(`${this.baseUrl}/desde-pago/${id}`, {cuenta}); }

  registrar(egreso: EgresoRegistrado): Observable<EgresoRegistrado> {
    return this.http.post<EgresoRegistrado>(this.baseUrl, egreso);
  }

  /** Calcula retefuente + reteica + neto sin guardar (vista previa en vivo) */
  cotizar(
    valor: number,
    nitProveedor?: string | null,
    tipoOperacion?: string | null,
    tarifaIcaPorMil?: number | null,
  ): Observable<CotizacionEgreso> {
    return this.http
      .post<EgresoRegistrado>(`${this.baseUrl}/cotizar`, {
        valor,
        nitProveedor: nitProveedor ?? undefined,
        tipoOperacion: tipoOperacion ?? undefined,
        tarifaIcaPorMil: tarifaIcaPorMil ?? undefined,
      })
      .pipe(
        map((r) => ({
          reteFuente: Number(r.reteFuente ?? 0),
          reteFuenteTarifa: r.reteFuenteTarifa != null ? Number(r.reteFuenteTarifa) : undefined,
          reteFuenteBaseMinima: r.reteFuenteBaseMinima != null ? Number(r.reteFuenteBaseMinima) : undefined,
          reteFuenteOrigen: r.reteFuenteOrigen,
          reteIca: Number(r.reteIca ?? 0),
          reteIcaTarifa: r.reteIcaTarifa != null ? Number(r.reteIcaTarifa) : undefined,
          reteIcaOrigen: r.reteIcaOrigen,
          valorNetoPagar: Number(r.valorNetoPagar ?? valor),
          tipoOperacion: r.tipoOperacion,
        })),
      );
  }

  obtenerPorId(id: number): Observable<EgresoRegistrado | null> {
    return this.http
      .get<EgresoRegistrado>(`${this.baseUrl}/${id}`)
      .pipe(catchError(() => of(null)));
  }

  /**
   * Envía el egreso a revisión de Gerencia Financiera
   * (REGISTRADO -> EN_REVISION_GERENCIA).
   */
  enviarARevision(id: number): Observable<EgresoRegistrado> {
    return this.http.patch<EgresoRegistrado>(`${this.baseUrl}/${id}/estado`, {
      estado: 'EN_REVISION_GERENCIA',
    });
  }

  /**
   * Gerencia Financiera aprueba el egreso: pasa al módulo de Tesorería
   * (EN_REVISION_GERENCIA -> ENVIADO_TESORERIA).
   */
  aprobarRevision(id: number): Observable<EgresoRegistrado> {
    return this.http.patch<EgresoRegistrado>(`${this.baseUrl}/${id}/estado`, {
      estado: 'ENVIADO_TESORERIA',
    });
  }

  /**
   * Gerencia Financiera rechaza el egreso con observación: vuelve al contador
   * (EN_REVISION_GERENCIA -> REGISTRADO).
   */
  rechazarRevision(id: number, motivoRevision: string): Observable<EgresoRegistrado> {
    return this.http.patch<EgresoRegistrado>(`${this.baseUrl}/${id}/estado`, {
      estado: 'REGISTRADO',
      motivoRevision,
    });
  }

  /**
   * Solicita la eliminación indicando la causal.
   * La aprueba o rechaza el editor contable en su bandeja.
   */
  solicitarEliminacion(id: number, causalEliminacion: string): Observable<EgresoRegistrado> {
    return this.http.patch<EgresoRegistrado>(`${this.baseUrl}/${id}/estado`, {
      estado: 'ELIMINAR_SOLICITADO',
      causalEliminacion,
    });
  }

  /** Bandeja del editor contable: solicitudes de eliminación pendientes */
  listarSolicitudesEliminacion(): Observable<EgresoRegistrado[]> {
    return this.http
      .get<EgresoRegistrado[]>(`${this.baseUrl}/solicitudes-eliminacion`)
      .pipe(catchError(() => of([])));
  }

  /** El editor aprueba (elimina) o rechaza (devuelve a REGISTRADO) */
  resolverEliminacion(id: number, aprobar: boolean): Observable<EgresoRegistrado> {
    return this.http.patch<EgresoRegistrado>(`${this.baseUrl}/${id}/estado`, {
      estado: aprobar ? 'ELIMINADO' : 'REGISTRADO',
    });
  }

  /** Ajuste manual de retenciones (recalcula el neto) */
  actualizarRetenciones(id: number, reteFuente: number, reteIca: number): Observable<EgresoRegistrado> {
    return this.http.patch<EgresoRegistrado>(`${this.baseUrl}/${id}/retenciones`, {
      reteFuente,
      reteIca,
    });
  }

  /**
   * Marca el egreso como pagado desde tramitar-pago.
   */
  marcarPagado(id: number): Observable<EgresoRegistrado> {
    return this.http.patch<EgresoRegistrado>(`${this.baseUrl}/${id}/estado`, {
      estado: 'PAGADO',
    });
  }

  checkDuplicado(
    numeroFactura: string,
    nitProveedor: string,
    valor?: number | null,
    fecha?: string | null,
  ): Observable<CheckDuplicadoResponse> {
    let params = new HttpParams()
      .set('numeroFactura', numeroFactura ?? '')
      .set('nitProveedor', nitProveedor ?? '');
    if (valor != null && valor !== 0) {
      params = params.set('valor', String(valor));
    }
    if (fecha) {
      params = params.set('fecha', fecha);
    }
    return this.http
      .get<CheckDuplicadoResponse>(`${this.baseUrl}/check-duplicado`, { params });
  }

  /** Histórico general de cargue de egresos (server-side pagination + filtros) */
  obtenerHistoricoEgresos(filtros: {
    empresaId?: number;
    desde?: string;
    hasta?: string;
    estado?: string;
    origen?: string;
    texto?: string;
    montoMin?: number;
    montoMax?: number;
    page?: number;
    size?: number;
    orden?: 'asc' | 'desc';
  }): Observable<HistoricoEgresosResponse> {
    let params = new HttpParams();
    if (filtros.empresaId != null) params = params.set('empresaId', String(filtros.empresaId));
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.estado) params = params.set('estado', filtros.estado);
    if (filtros.origen) params = params.set('origen', filtros.origen);
    if (filtros.texto) params = params.set('texto', filtros.texto);
    if (filtros.montoMin != null) params = params.set('monto_min', String(filtros.montoMin));
    if (filtros.montoMax != null) params = params.set('monto_max', String(filtros.montoMax));
    if (filtros.page != null) params = params.set('page', String(filtros.page));
    if (filtros.size != null) params = params.set('size', String(filtros.size));
    const ordenBackend = filtros.orden === 'asc' ? 'fecha_asc' : 'fecha_desc';
    params = params.set('orden', ordenBackend);

    return this.http.get<any>(`${this.baseUrl}/historico`, { params }).pipe(
      map((r) => ({
        total: r?.total ?? (Array.isArray(r) ? r.length : 0),
        page: r?.page ?? (filtros.page ?? 0),
        items: (r?.items ?? (Array.isArray(r) ? r : [])).map((it: any) => ({
          id: it.id,
          fecha: it.fecha ?? it.createdAt ?? '',
          comprobante: it.numero_egreso_activo ?? it.numeroEgresoActivo ?? it.numero_factura ?? it.numeroFactura ?? it.comprobante ?? null,
          numeroEgreso: it.numero_egreso ?? it.numeroEgreso ?? null,
          nombre: it.proveedor_nombre ?? it.proveedorNombre ?? it.nombre ?? null,
          tercero: it.proveedor_nombre ?? it.proveedorNombre ?? it.tercero ?? it.nombre ?? null,
          nit: it.nit_proveedor ?? it.nitProveedor ?? it.nit ?? null,
          monto: Number(it.valor ?? it.monto ?? it.valorNetoPagar ?? 0),
          estado: it.estado ?? 'REGISTRADO',
          origen: it.origen ?? (it.pagoProyectadoId ? 'gp' : 'contabilidad'),
          observaciones: it.observaciones ?? it.motivoRevision ?? null,
        })),
      })),

    );
  }

  /** Historial de estados de un egreso específico */
  obtenerHistorialEstados(id: number): Observable<HistorialEstadoEgreso[]> {
    return this.http.get<any[]>(`${this.baseUrl}/${id}/historial-estados`).pipe(
      map((arr) => (arr || []).map((x: any) => ({
        id: x.id,
        estadoAnterior: x.estadoAnterior ?? x.estado_anterior ?? null,
        estadoNuevo: x.estadoNuevo ?? x.estado_nuevo ?? x.estado ?? '',
        usuario: x.usuario ?? x.creadoPor ?? x.creado_por ?? null,
        comentario: x.comentario ?? x.observacion ?? x.motivo ?? null,
        fecha: x.fecha ?? x.createdAt ?? x.created_at ?? '',
      }))),
      catchError(() => of([])),
    );
  }
}
