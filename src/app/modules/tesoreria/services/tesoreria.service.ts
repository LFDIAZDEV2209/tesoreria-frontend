import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  catchError,
  throwError,
  delay,
  forkJoin,
  map,
  of,
  switchMap,
  shareReplay,
} from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  EstadoMovimiento,
  FiltroMovimientos,
  MovimientoBancario,
  PagedResult,
} from '../models/movimiento-bancario.model';
import {
  ConciliacionDetalle,
  ConciliacionResultado,
} from '../models/conciliacion.model';
import { ControlDiarioPago, CrearEgresoRequest, Egreso } from '../models/egreso.model';

@Injectable({
  providedIn: 'root',
})
export class TesoreriaService {
  private readonly baseUrl = `${environment.apiUrl}/tesoreria`;



  constructor(private readonly http: HttpClient) {}

  getMovimientosPendientes(
    filtros: FiltroMovimientos,
  ): Observable<PagedResult<MovimientoBancario>> {


    let params = new HttpParams();

    if (filtros.fechaDesde) params = params.set('fechaDesde', filtros.fechaDesde);
    if (filtros.fechaHasta) params = params.set('fechaHasta', filtros.fechaHasta);
    if (filtros.banco) params = params.set('banco', filtros.banco);
    if (filtros.pageIndex !== undefined) params = params.set('page', String(filtros.pageIndex));
    if (filtros.pageSize !== undefined) params = params.set('size', String(filtros.pageSize));
    if (filtros.sortBy) params = params.set('sortBy', String(filtros.sortBy));
    if (filtros.sortDirection) params = params.set('sortDir', filtros.sortDirection);
    if (filtros.busqueda) params = params.set('cuenta', filtros.busqueda);

    return this.http
      .get<ApiPage<ApiMovimientoBancario> | ApiMovimientoBancario[]>(`${this.baseUrl}/movimientos`, {
        params,
      })
      .pipe(
        map((response) => {
          const { items, total } = this.extractPage(response);
          return {
            data: items.map((item) => this.mapMovimiento(item)),
            total,
          };
        }),
        catchError(error => throwError(() => error)),
        delay(200),
      );
  }

  getMovimientoById(id: number): Observable<MovimientoBancario | null> {


    return this.http
      .get<ApiMovimientoBancario>(`${this.baseUrl}/movimientos/${id}`)
      .pipe(
        map((item) => this.mapMovimiento(item)),
        catchError(error => throwError(() => error)),
      );
  }

  getDetalleConciliacion(id: number): Observable<ConciliacionDetalle | null> {


    return forkJoin({
      movimiento: this.getMovimientoById(id),
      conciliaciones: this.getConciliaciones(0, 200, id),
    })
      .pipe(
        map(({ movimiento, conciliaciones }) => {
          if (!movimiento) {
            return null;
          }

          const coincidencias = conciliaciones.flatMap((item) => {
            const found: ConciliacionDetalle['coincidencias'] = [];

            if (item.ordenCompraId) {
              found.push({
                tipo: 'OC',
                codigo: `OC-${item.ordenCompraId}`,
                fecha: item.fecha ?? movimiento.fechaPago,
                valor: movimiento.valor,
                score: 100,
              });
            }

            if (item.solicitudId) {
              found.push({
                tipo: 'Solicitud',
                codigo: `SOL-${item.solicitudId}`,
                fecha: item.fecha ?? movimiento.fechaPago,
                valor: movimiento.valor,
                score: 98,
              });
            }

            if (item.egresoId) {
              found.push({
                tipo: 'Egreso',
                codigo: `EGR-${item.egresoId}`,
                fecha: item.fecha ?? movimiento.fechaPago,
                valor: movimiento.valor,
                score: 100,
              });
            }

            return found;
          });

          const estadoPago = this.normalizeEstado(
            movimiento.estadoPago,
          );

          return {
            movimiento,
            estado:
              estadoPago === 'Completo' ||
              estadoPago === 'Conciliado' ||
              coincidencias.some((coinc) => coinc.tipo === 'Egreso')
                ? 'COMPLETO'
                : 'REVISION',
            coincidencias,
            conciliadoManual: false,
          } as ConciliacionDetalle;
        }),
        catchError(error => throwError(() => error)),
      );
  }



  vincularOc(movimientoId: number, ocCodigo: string): Observable<ConciliacionResultado> {


    const ordenCompraId = Number(ocCodigo.replace(/\D/g, ''));
    const payload: ConciliarManualRequest = {
      movimientoId,
      ordenCompraId: Number.isFinite(ordenCompraId) && ordenCompraId > 0 ? ordenCompraId : undefined,
      observaciones: `Vinculacion OC ${ocCodigo}`,
    };

    return this.http
      .post<unknown>(`${this.baseUrl}/conciliar`, payload)
      .pipe(
        map(() => ({
          ok: true,
          mensaje: `OC ${ocCodigo} vinculada correctamente`,
        })),
        catchError(error => throwError(() => error)),
      );
  }

  generarEgreso(request: CrearEgresoRequest): Observable<Egreso> {


    return this.getMovimientoById(request.movimientoId).pipe(
      switchMap((movimiento) => {
        if (!movimiento || !movimiento.cuenta?.trim()) return throwError(() => new Error('El movimiento y su cuenta bancaria son obligatorios para generar el egreso.'));
        const payload: ApiCrearEgresoRequest = {
          numero: `EGR-${Date.now()}`,
          empresaUt: movimiento.empresaUt,
          cuenta: movimiento.cuenta,
          valor: request.valor,
          fecha: new Date().toISOString().slice(0, 10),
          descripcion: request.observaciones || 'Generado desde modulo tesoreria',
          beneficiario: request.proveedor,
        };

        return this.http.post<ApiEgreso>(`${this.baseUrl}/egresos`, payload);
      }),
      map((egreso) => this.mapEgreso(egreso, request)),
      catchError(error => throwError(() => error)),
    );
  }

  marcarConciliadoManual(movimientoId: number): Observable<ConciliacionResultado> {


    const payload: ConciliarManualRequest = {
      movimientoId,
      observaciones: 'Conciliacion manual desde modulo tesoreria',
    };

    return this.http
      .post<unknown>(`${this.baseUrl}/conciliar`, payload)
      .pipe(
        map(() => ({
          ok: true,
          mensaje: 'Movimiento conciliado manualmente',
        })),
        catchError(error => throwError(() => error)),
      );
  }

  conciliarAutomatica(): Observable<ConciliacionResultado> {


    return this.http.post<unknown>(`${this.baseUrl}/conciliar/automatica`, {}).pipe(
      map(() => ({
        ok: true,
        mensaje: 'Conciliacion automatica ejecutada',
      })),
      catchError(() =>
        of({
          ok: false,
          mensaje: 'No fue posible ejecutar la conciliacion automatica',
        }),
      ),
    );
  }

  private bancos$?: Observable<string[]>;
  private empresasUt$?: Observable<string[]>;

  getBancos(forzar = false): Observable<string[]> {
    if (forzar || !this.bancos$) {
      this.bancos$ = this.getMovimientosPendientes({}).pipe(
        map((result) => [...new Set(result.data.map((item) => item.banco).filter(Boolean))].sort()),
        catchError(err => {
          this.bancos$ = undefined;
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.bancos$;
  }

  getEmpresasUt(forzar = false): Observable<string[]> {
    if (forzar || !this.empresasUt$) {
      this.empresasUt$ = this.getMovimientosPendientes({}).pipe(
        map((result) => [...new Set(result.data.map((item) => item.empresaUt).filter(Boolean))].sort()),
        catchError(err => {
          this.empresasUt$ = undefined;
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.empresasUt$;
  }

  getControlDiario(movimiento?: MovimientoBancario | null): Observable<ControlDiarioPago[]> {


    return this.http
      .get<ApiPage<ApiControlDiario> | ApiControlDiario[]>(`${this.baseUrl}/control-diario`)
      .pipe(
        map((response) => this.extractPage(response).items.map((item) => this.mapControlDiario(item))),
        catchError(error => throwError(() => error)),
        delay(200),
      );
  }

  guardarControlDiario(rows: ControlDiarioPago[]): Observable<ConciliacionResultado> {


    if (!rows.length) {
      return of({
        ok: true,
        mensaje: 'No hay datos para guardar',
      });
    }

    const requests = rows.map((row) => {
      const totalIngresos = row.ingresosCliente + row.ingresosApi + row.otrosIngresos;
      const totalEgresos =
        row.pagosProveedores +
        row.pagosPresupuesto +
        row.pagosNomina +
        row.rechazos +
        row.gastosBancarios;

      const payload: ApiCrearControlDiarioRequest = {
        fecha: row.fecha,
        banco: row.banco,
        cuenta: row.cuenta,
        empresaUt: row.empresaUt,
        saldoInicial: row.saldoInicial,
        ingresosClientes: row.ingresosCliente,
        ingresosApi: row.ingresosApi,
        otrosIngresos: row.otrosIngresos,
        totalIngresos,
        pagosProveedores: row.pagosProveedores,
        pagosPresupuesto: row.pagosPresupuesto,
        pagosNomina: row.pagosNomina,
        rechazos: row.rechazos,
        gastosBancarios: row.gastosBancarios,
        observaciones: row.observaciones,
      };

      return this.http.post<unknown>(`${this.baseUrl}/control-diario`, payload);
    });

    return forkJoin(requests).pipe(
      map(() => ({
        ok: true,
        mensaje: 'Control diario guardado correctamente',
      })),
      catchError(() =>
        of({
          ok: false,
          mensaje: 'No fue posible guardar el control diario',
        }),
      ),
    );
  }



  // ═══════════════════════════════════════════════════════════════
  // MOVIMIENTOS DIARIOS DE PAGO (Control Diario por Banco)
  // ═══════════════════════════════════════════════════════════════

  getMovimientosDiarioPago(bancoId: number, fechaDesde?: string, fechaHasta?: string, tipoOrigen?: string): Observable<ApiMovimientoDiarioPago[]> {
    let params = new HttpParams();
    if (fechaDesde) params = params.set('fechaDesde', fechaDesde);
    if (fechaHasta) params = params.set('fechaHasta', fechaHasta);
    if (tipoOrigen) params = params.set('tipoOrigen', tipoOrigen);

    return this.http
      .get<ApiMovimientoDiarioPago[]>(`${this.baseUrl}/movimientos-diario-pago/${bancoId}`, { params })
      .pipe(
        catchError(() => of([])),
      );
  }

  crearMovimientoDiarioPago(dto: ApiCrearMovimientoDiarioPagoRequest): Observable<ApiMovimientoDiarioPago | null> {
    return this.http
      .post<ApiMovimientoDiarioPago>(`${this.baseUrl}/movimientos-diario-pago`, dto)
      .pipe(
        catchError(() => of(null)),
      );
  }

  actualizarMovimientoDiarioPago(id: number, dto: ApiCrearMovimientoDiarioPagoRequest): Observable<ApiMovimientoDiarioPago | null> {
    return this.http
      .put<ApiMovimientoDiarioPago>(`${this.baseUrl}/movimientos-diario-pago/${id}`, dto)
      .pipe(
        catchError(() => of(null)),
      );
  }

  eliminarMovimientoDiarioPago(id: number): Observable<boolean> {
    return this.http
      .delete(`${this.baseUrl}/movimientos-diario-pago/${id}`)
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      );
  }

  /**
   * Upload comprobante files for a movimiento diario pago.
   * Sends files to the backend which stores them in the S3 bucket.
   */
  uploadComprobantesMovimiento(movimientoId: number, archivos: File[]): Observable<string[]> {
    const formData = new FormData();
    archivos.forEach((archivo) => {
      formData.append('archivos', archivo, archivo.name);
    });
    return this.http
      .post<string[]>(`${this.baseUrl}/movimientos-diario-pago/${movimientoId}/comprobantes`, formData)
      .pipe(
        catchError(() => of([])),
      );
  }

  /**
   * Create movimiento with optional comprobante files (multipart).
   */
  crearMovimientoDiarioPagoConArchivos(
    dto: ApiCrearMovimientoDiarioPagoRequest,
    archivos: File[],
  ): Observable<ApiMovimientoDiarioPago | null> {
    if (archivos.length === 0) {
      return this.crearMovimientoDiarioPago(dto);
    }

    return this.crearMovimientoDiarioPago(dto).pipe(
      switchMap((result) => {
        if (!result) return of(null);
        return this.uploadComprobantesMovimiento(result.id, archivos).pipe(
          map(() => result),
          catchError(() => of(result)),
        );
      }),
    );
  }

  getFechasUnicasMovimientoDiarioPago(bancoId: number): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.baseUrl}/movimientos-diario-pago/${bancoId}/fechas`)
      .pipe(
        catchError(() => of([])),
      );
  }





  private roundMoney(value: number): number {
    return Math.round(value / 1000) * 1000;
  }

  getEgresos(page = 0, size = 20): Observable<PagedResult<Egreso>> {


    const params = new HttpParams().set('page', String(page)).set('size', String(size));

    return this.http
      .get<ApiPage<ApiEgreso> | ApiEgreso[]>(`${this.baseUrl}/egresos`, { params })
      .pipe(
        map((response) => {
          const { items, total } = this.extractPage(response);
          return {
            data: items.map((item) => this.mapEgreso(item)),
            total,
          };
        }),
        catchError(() => of({ data: [], total: 0 })),
      );
  }

  getCuentasBancarias(activa?: boolean): Observable<ApiCuentaBancaria[]> {


    let params = new HttpParams();
    if (activa !== undefined) {
      params = params.set('activa', String(activa));
    }

    return this.http
      .get<ApiCuentaBancaria[] | ApiPage<ApiCuentaBancaria>>(`${this.baseUrl}/cuentas-bancarias`, {
        params,
      })
      .pipe(
        map((response) => this.extractPage(response).items),
        catchError(() => of([])),
      );
  }



  private getConciliaciones(
    page = 0,
    size = 20,
    movimientoId?: number,
  ): Observable<ApiConciliacion[]> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));

    if (movimientoId) {
      params = params.set('movimientoId', String(movimientoId));
    }

    return this.http
      .get<ApiPage<ApiConciliacion> | ApiConciliacion[]>(`${this.baseUrl}/conciliaciones`, { params })
      .pipe(
        map((response) => {
          const items = this.extractPage(response).items;
          if (movimientoId && items.some((item) => item.movimientoId !== undefined)) {
            return items.filter((item) => item.movimientoId === movimientoId);
          }

          return items;
        }),
        catchError(() => of([])),
      );
  }

  private extractPage<T>(
    response: ApiPage<T> | T[] | null | undefined,
  ): { items: T[]; total: number } {
    if (Array.isArray(response)) {
      return { items: response, total: response.length };
    }

    if (!response) {
      return { items: [], total: 0 };
    }

    const items =
      response.content ?? response.data ?? response.items ?? [];

    return {
      items,
      total: response.page?.totalElements ?? response.totalElements ?? response.total ?? items.length,
    };
  }

  private mapMovimiento(item: ApiMovimientoBancario): MovimientoBancario {
    const estadoGeneral = this.normalizeEstado(item.estado);

    return {
      id: item.id,
      tipoMovimiento: item.tipoMovimiento,
      fechaPago: item.fecha ?? item.fechaPago ?? new Date().toISOString().slice(0, 10),
      empresaUt: item.empresaUt ?? 'N/A',
      banco: item.banco,
      cuenta: item.cuenta,
      valor: Number(item.valor ?? 0),
      estadoOc: this.normalizeEstado(item.estadoOc ?? item.estado ?? estadoGeneral),
      estadoEgreso: this.normalizeEstado(item.estadoEgreso ?? item.estado ?? estadoGeneral),
      estadoPago: this.normalizeEstado(item.estadoPago ?? item.estado ?? estadoGeneral),
      referencia: item.referencia ?? `MOV-${item.id}`,
      concepto: item.concepto ?? item.tipoRequerimiento ?? 'N/A',
      proveedor: item.proveedor ?? item.nombreProveedor ?? 'N/A',
      archivoOcUrl: item.archivoOcUrl ?? null,
      archivoEgresoUrl: item.archivoEgresoUrl ?? null,
      archivoPagoUrl: item.archivoPagoUrl ?? null,
    };
  }

  private mapControlDiario(item: ApiControlDiario): ControlDiarioPago {
    return {
      id: item.id,
      fecha: item.fecha,
      banco: item.banco,
      cuenta: item.cuenta,
      empresaUt: item.empresaUt,
      saldoInicial: Number(item.saldoInicial ?? 0),
      ingresosCliente: Number(item.ingresosClientes ?? item.ingresosCliente ?? 0),
      ingresosApi: Number(item.ingresosApi ?? 0),
      otrosIngresos: Number(item.otrosIngresos ?? 0),
      pagosProveedores: Number(item.pagosProveedores ?? 0),
      pagosPresupuesto: Number(item.pagosPresupuesto ?? 0),
      pagosNomina: Number(item.pagosNomina ?? 0),
      rechazos: Number(item.rechazos ?? 0),
      gastosBancarios: Number(item.gastosBancarios ?? 0),
      saldoBancario: Number(item.saldoBancario ?? item.saldoFinal ?? 0),
      observaciones: item.observaciones ?? '',
    };
  }

  private mapEgreso(api: ApiEgreso, fallback?: CrearEgresoRequest): Egreso {
    return {
      id: api.id,
      movimientoId: fallback?.movimientoId ?? 0,
      numeroEgreso: api.numero,
      fecha: api.fecha,
      valor: Number(api.valor ?? fallback?.valor ?? 0),
      proveedor: api.beneficiario ?? fallback?.proveedor ?? 'N/A',
      observaciones: api.descripcion ?? fallback?.observaciones,
    };
  }

  private normalizeEstado(value?: string): EstadoMovimiento {
    const estado = (value || '').toUpperCase();

    if (estado === 'PENDIENTE') return 'Pendiente';
    if (estado === 'CONCILIADO') return 'Conciliado';
    if (estado === 'COMPLETO') return 'Completo';
    if (estado === 'ERROR') return 'Error';
    if (estado === 'DUPLICADO') return 'Duplicado';

    return 'Pendiente';
  }

  getSolicitudesViaticosTesoreria(): Observable<SolicitudViaticosTesoreria[]> {
    return this.http
      .get<SolicitudViaticosTesoreria[]>(`${this.baseUrl}/viaticos/tesoreria-bandeja`)
      .pipe(catchError(() => of([])));
  }

  getSolicitudViaticosTesoreriaById(id: number): Observable<SolicitudViaticosTesoreria | null> {
    return this.http
      .get<SolicitudViaticosDetalleApi>(`${this.baseUrl}/viaticos/${id}`)
      .pipe(map(v => ({
        ...v, solicitudViaticosId: v.id, numeroViatico: `VIA-${v.id}`,
        empresa: v.nombreEmpresa, area: v.areaDependencia, solicitante: v.nombreCompleto,
        fecha: v.fechaCreacion, totalSolicitud: v.totalGeneral, estado: v.estado,
        tipoSolicitud: v.tipoSolicitudViaticos, registroContableId: v.tramiteCompraId,
      })), catchError(() => of(null)));
  }

  subirComprobantePagoViaticos(
    solicitudViaticosId: number,
    file: File,
  ): Observable<{ url: string; s3Key: string; nombre: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string; s3Key: string; nombre: string }>(
      `${this.baseUrl}/viaticos/${solicitudViaticosId}/comprobante-pago`,
      formData,
    );
  }

  subirDocumentoEgresoViaticos(
    solicitudViaticosId: number,
    file: File,
  ): Observable<{ url: string; s3Key: string; nombre: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string; s3Key: string; nombre: string }>(
      `${this.baseUrl}/viaticos/${solicitudViaticosId}/documento-egreso`,
      formData,
    );
  }

  finalizarPagoViaticos(
    solicitudViaticosId: number,
    payload: {
      valorPagado: number;
      bancoComprobantePago?: string | null;
      numeroCuentaComprobantePago?: string | null;
      nombreTitularComprobantePago?: string | null;
      confirmarValorNoConcuerda?: boolean;
      conceptoComprobantePago?: string | null;
      descripcionEsperada?: string | null;
      overrideMotivo?: string | null;
      overrideUsuario?: string | null;
    },
  ): Observable<SolicitudViaticosTesoreria> {
    return this.http.post<SolicitudViaticosTesoreria>(
      `${this.baseUrl}/viaticos/${solicitudViaticosId}/finalizar-pago`,
      payload,
    );
  }
}

export interface SolicitudViaticosTesoreria {
  solicitudViaticosId: number;
  numeroViatico: string;
  tipoSolicitud?: 'ADELANTO' | 'SOLICITUD' | string;
  empresa: string;
  area: string;
  solicitante: string;
  fecha: string;
  fechaMaximaEvento?: string | null;
  proveedor?: string | null;
  totalSolicitud: number;
  estado: string;
  bancoCuenta?: string | null;
  tipoCuentaBancaria?: string | null;
  numeroCuentaBancaria?: string | null;
  nombreTitularCuenta?: string | null;
  certificadoBancarioUrl?: string | null;
  numeroOrdenEgreso?: string | null;
  montoDesembolsoAprobado?: number | null;
  comprobantePagoUrl?: string | null;
  comprobantePagoNombre?: string | null;
  registroContableId?: number | null;
  valorComprobantePago?: number | null;
}

interface ApiPage<T> {
  content?: T[];
  items?: T[];
  data?: T[];
  totalElements?: number;
  total?: number;
  page?: {
    size?: number;
    number?: number;
    totalElements?: number;
    totalPages?: number;
  };
}

interface ApiMovimientoBancario {
  id: number;
  fecha?: string;
  fechaPago?: string;
  banco: string;
  cuenta: string;
  valor: number;
  referencia: string;
  tipoMovimiento: string;
  empresaUt?: string;
  estado?: string;
  estadoOc?: string;
  estadoEgreso?: string;
  estadoPago?: string;
  concepto?: string;
  tipoRequerimiento?: string;
  proveedor?: string;
  nombreProveedor?: string;
  archivoOcUrl?: string;
  archivoEgresoUrl?: string;
  archivoPagoUrl?: string;
}

interface ConciliarManualRequest {
  movimientoId: number;
  ordenCompraId?: number;
  solicitudId?: number;
  egresoId?: number;
  observaciones?: string;
}

interface ApiConciliacion {
  id: number;
  movimientoId: number;
  ordenCompraId?: number;
  solicitudId?: number;
  egresoId?: number;
  estado?: string;
  observaciones?: string;
  fecha?: string;
}

interface ApiEgreso {
  id: number;
  numero: string;
  empresaUt: string;
  cuenta: string;
  valor: number;
  fecha: string;
  descripcion?: string;
  beneficiario?: string;
}

interface ApiCrearEgresoRequest {
  numero: string;
  empresaUt: string;
  cuenta: string;
  valor: number;
  fecha: string;
  descripcion: string;
  beneficiario: string;
}

interface ApiControlDiario {
  id: number;
  fecha: string;
  banco: string;
  cuenta: string;
  empresaUt: string;
  saldoInicial: number;
  ingresosClientes?: number;
  ingresosCliente?: number;
  ingresosApi: number;
  otrosIngresos: number;
  pagosProveedores: number;
  pagosPresupuesto: number;
  pagosNomina: number;
  rechazos: number;
  gastosBancarios: number;
  saldoFinal?: number;
  saldoBancario?: number;
  observaciones?: string;
}

interface ApiCrearControlDiarioRequest {
  fecha: string;
  banco: string;
  cuenta: string;
  empresaUt: string;
  saldoInicial: number;
  ingresosClientes: number;
  ingresosApi: number;
  otrosIngresos: number;
  totalIngresos: number;
  pagosProveedores: number;
  pagosPresupuesto: number;
  pagosNomina: number;
  rechazos: number;
  gastosBancarios: number;
  observaciones: string;
}

interface ApiCuentaBancaria {
  id: number;
  banco: string;
  numeroCuenta: string;
  empresaUt: string;
  activa: boolean;
}

export interface ApiMovimientoDiarioPago {
  id: number;
  bancoId: number;
  fecha: string;
  banco: string;
  ultimosDigitos: string;
  empresaUt: string;
  saldoInicial: number;
  ingresosCliente: number;
  ingresosArl: number;
  otrosIngresos: number;
  totalIngresos: number;
  nEgreso: string;
  pagoProveedores: number;
  pagoPresupuesto: number;
  pagosNominas: number;
  rechazos: number;
  gastosBancarios: number;
  totalEgresos: number;
  saldoFinal: number;
  observaciones: string;
  tipoOrigen: string;
  solicitudId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCrearMovimientoDiarioPagoRequest {
  bancoId: number;
  fecha: string;
  banco: string;
  ultimosDigitos: string;
  empresaUt: string;
  saldoInicial: number;
  ingresosCliente: number;
  ingresosArl: number;
  otrosIngresos: number;
  nEgreso: string;
  pagoProveedores: number;
  pagoPresupuesto: number;
  pagosNominas: number;
  rechazos: number;
  gastosBancarios: number;
  observaciones: string;
  tipoOrigen?: string;
  solicitudId?: number | null;
}

/** Contrato del detalle de Viáticos, distinto al DTO de su bandeja. */
interface SolicitudViaticosDetalleApi extends Partial<SolicitudViaticosTesoreria> {
  id: number; nombreEmpresa: string; areaDependencia: string; nombreCompleto: string;
  fechaCreacion: string; totalGeneral: number; estado: string;
  tipoSolicitudViaticos?: string; tramiteCompraId?: number;
}
