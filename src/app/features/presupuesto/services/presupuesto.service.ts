import { ModuloAnual } from '../models/modulo-anual.model';
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Observable, of, forkJoin, throwError } from 'rxjs';
import { map, catchError, switchMap, filter, tap, shareReplay } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import {
  PageResponse, Movimiento, ResumenModulo, MaestroProveedor, Contrato, Periodo,
  Mensual, SeccionTerceros, SeccionPagos, ConsolidadoFila, DetalleConsolidado, DetalleConsolidadoPagina, PagoProyectado, CandidatoPago,
  FacturaSugerida, ResumenPagos, ResumenGerencial, Notificacion, PreviewImportacion,
  ConfirmarImportacion, Empresa, MaestroImportacion, PermisosGp, PrevisualizarProveedor,
  ImportacionPeriodoInfo, UsuarioGp, CandidatoUsuario, RolNexa, CrearUsuarioGpInput, ResetPasswordGp,
  EstadisticasUsuariosGp, DistribucionPagos, DistribucionEmpresa, SugerenciaPresupuesto,
  HistoricoAprobacionesResponse,
} from '../models/presupuesto.model';
import { GpSessionService } from './gp-session.service';
import {
  arr, mapCandidato, mapConfirmar, mapConsolidado, mapContrato, mapEmpresaC,
  mapFactura, mapInfoImportacion, mapMaestro, mapMensual, mapMovimiento, mapNotificacion, mapPago,
  mapPeriodoDesdeMensual, mapPrevisualizar, mapPreview, mapResumenGerencial,
  mapResumenModulo, mapResumenPagos, pagina, pagoIn,
  permisosDesdeSesion, contratoIn, mapSugerenciaPresupuesto, mapSeccionTerceros, mapSeccionPagos,
} from './gp-mapper';

// API del Gestor integrada en Tesoreriabd.
const GP = environment.gpApiUrl;

/** Respuesta al subir el documento de egreso desde Pagos Proyectados. */
export interface DocumentoEgresoSubido {
  key: string;
  nombre: string | null;
  url: string;
  /** Texto leído por Textract (null si el OCR no pudo leer el documento). */
  texto: string | null;
  /** Número de egreso detectado en el documento (null si no se detectó). */
  numeroEgreso: string | null;
}

type Any = any;

@Injectable({ providedIn: 'root' })
export class PresupuestoService {

  private categorias$?: Observable<string[]>;

  constructor(private http: HttpClient, private auth: AuthService, private gpSession: GpSessionService) {
    this.auth?.cambiosSesion$?.subscribe(() => {
      this.limpiarCacheCategorias();
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('gp:sesion-expirada', () => {
        this.limpiarCacheCategorias();
      });
    }
  }

  comprobantesPago(empresaId: number, mes: string, seccion: string, nit?: string, concepto?: string): Observable<{nombre:string;url:string}[]> {
    return this.http.get<{nombre:string;url:string}[]>(`${GP}/presupuesto/comprobantes-pago`, {params:{empresaId,mes,seccion,...(nit ? {nit}:{}),...(concepto ? {concepto}:{})}});
  }

  aprobarMes(empresaId: number, periodo: string): Observable<void> {
    return this.http.put<void>(`${GP}/periodos/${periodo}/aprobar`, {}, {params:{empresaId}});
  }

  mesesCerrados(empresaId: number): Observable<string[]> {
    return this.http.get<string[]>(`${GP}/historicos/cierres`, {params: {empresaId}});
  }

  guardarEgresoGrupo(empresaId: number, pagoIds: number[], numeroEgreso: string, fechaEgreso: string,
                     soporteKey?: string | null, soporteNombre?: string | null): Observable<unknown> {
    return this.http.put(`${GP}/pagos-proyectados/egreso`,
      {pagoIds, numeroEgreso, fechaEgreso, soporteKey: soporteKey ?? null, soporteNombre: soporteNombre ?? null},
      {params: {empresaId}});
  }

  /**
   * Sube el documento (comprobante) del egreso POR PROVEEDOR desde Pagos
   * Proyectados. El backend lo guarda en S3 y lo lee con Textract para
   * sugerir el número de egreso; queda adjunto al egreso del proveedor que
   * Tesorería ve en su bandeja. Emite eventos para mostrar el progreso.
   */
  subirDocumentoEgreso(empresaId: number, file: File): Observable<HttpEvent<DocumentoEgresoSubido>> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<DocumentoEgresoSubido>(`${GP}/pagos-proyectados/egreso/documento`, body,
      {params: {empresaId}, observe: 'events', reportProgress: true});
  }

  private nombreUsuarioGp(): string | null {
    return this.gpSession.estado()?.nombre ?? null;
  }

  cuentasGp(): Observable<any[]> { return this.http.get<any[]>(`${GP}/usuarios/`); }
  crearCuentaGp(body: Record<string, unknown>): Observable<any> { return this.http.post(`${GP}/usuarios/`, body); }
  editarCuentaGp(id: number, body: Record<string, unknown>): Observable<any> { return this.http.put(`${GP}/usuarios/${id}`, body); }
  eliminarCuentaGp(id: number): Observable<void> { return this.http.delete<void>(`${GP}/usuarios/${id}`); }
  gruposAuditoria(): Observable<string[]> { return this.http.get<string[]>(`${GP}/auditoria/grupos`); }
  auditoriaPaginada(filtros: Record<string, string | number>): Observable<{ entradas: any[]; total: number }> {
    return this.http.get<{ entradas: any[]; total: number }>(`${GP}/auditoria/`, { params: filtros });
  }

  /** Orden genérico en cliente sobre objetos camelCase mapeados. */
  private static ordenar<T>(filas: T[], sortBy?: string, sortDir?: string): T[] {
    if (!sortBy) return filas;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filas].sort((a: Any, b: Any) => {
      const va = a[sortBy], vb = b[sortBy];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  // ── Empresas (workspaces del gestor) ──
  empresas(forzar = false): Observable<Empresa[]> {
    // Sin caché: el shell revalida asignaciones al montar el módulo
    // (conforme al diseño de sesión/carlos). Single-flight queda en la sesión.
    if (forzar) { /* forzar se mantiene por compatibilidad de firma */ }
    return this.http.get<Any[]>(`${GP}/auth/contadores`).pipe(
      map(rows => arr(rows).map(mapEmpresaC)),
    );
  }

  /** Permisos efectivos derivados del rol de la sesión del gestor. */
  permisosGp(forzar = false): Observable<PermisosGp> {
    return this.gpSession.consultarEstado(forzar).pipe(
      map((e) => permisosDesdeSesion(e as any)),
    );
  }

  /** Limpia SOLO el mes indicado (o el habilitado si no se indica). */
  limpiarModulo(modulo: string, empresaId: number, periodo?: string | null): Observable<{ ok: boolean }> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (periodo) params = params.set('periodo', periodo);
    return this.http.delete<Any>(`${GP}/demo/${modulo}`, { params }).pipe(map(() => ({ ok: true })));
  }

  /** Limpia el workspace del presupuesto: conserva Contrato y Flujo de Caja. */
  limpiarPresupuesto(empresaId: number): Observable<unknown> {
    return this.http.delete(`${GP}/demo/bulk/clear`, {params: new HttpParams().set('empresaId', empresaId)});
  }

  /** Limpia el workspace de pagos proyectados: conserva Contrato y Flujo de Caja. */
  limpiarWorkspace(empresaId: number): Observable<{
    pagosEliminados: number; sugeridosReiniciados: number;
  }> {
    return this.http.delete<Any>(`${GP}/pagos-proyectados/bulk/limpiar-workspace`, {params: new HttpParams().set('empresaId', empresaId)}).pipe(
      map((r) => ({
        pagosEliminados: r.pagos_eliminados ?? 0,
        sugeridosReiniciados: r.sugeridos_reiniciados ?? 0,
      })),
    );
  }

  /** Limpia las provisiones (otros pagos) del mes indicado: elimina las sin
   *  pagar; las ya pagadas se conservan. */
  limpiarProvisiones(empresaId: number, periodo: string): Observable<{
    provisionesEliminadas: number; provisionesPagadas: number; provisionesDelMes: number;
  }> {
    return this.http.delete<Any>(`${GP}/pagos-proyectados/provisiones/limpiar`, {
      params: new HttpParams().set('empresaId', empresaId).set('periodo', periodo),
    }).pipe(
      map((r) => ({
        provisionesEliminadas: r.provisiones_eliminadas ?? 0,
        provisionesPagadas: r.provisiones_pagadas ?? 0,
        provisionesDelMes: r.provisiones_del_mes ?? 0,
      })),
    );
  }

  // ── Usuarios y Accesos (solo superadmin) ──

  private mapUsuario(u: Any): UsuarioGp {
    return {
      id: u.id, username: u.username, email: null, nombreCompleto: u.nombre,
      employeeId: null, activo: !!u.activo, roles: [u.rol],
      puedeAprobar: u.rol === 'gerente' ? !!u.puede_aprobar : null,
      empresaIds: arr(u.empresa_ids),
      requirePasswordChange: !!u.debe_cambiar_password,
    };
  }

  usuariosGp(params: {
    busqueda?: string; filtro?: string; page?: number; size?: number;
  } = {}): Observable<PageResponse<UsuarioGp>> {
    return this.http.get<Any[]>(`${GP}/usuarios/`).pipe(
      map((rows) => {
        let filas = arr(rows);
        if (params.busqueda) {
          const q = params.busqueda.toLowerCase();
          filas = filas.filter((u) =>
            String(u.username).toLowerCase().includes(q) || String(u.nombre).toLowerCase().includes(q));
        }
        if (params.filtro && params.filtro !== 'todos') {
          if (params.filtro === 'activos') filas = filas.filter((u) => u.activo);
          else if (params.filtro === 'inactivos') filas = filas.filter((u) => !u.activo);
          else filas = filas.filter((u) => u.rol === params.filtro);
        }
        filas.sort((a, b) => String(a.rol).localeCompare(String(b.rol)) || String(a.nombre).localeCompare(String(b.nombre)));
        return pagina(filas.map((u) => this.mapUsuario(u)), params.page ?? 0, params.size ?? 12);
      }),
    );
  }

  estadisticasUsuariosGp(): Observable<EstadisticasUsuariosGp> {
    return this.http.get<Any[]>(`${GP}/usuarios/`).pipe(
      map((rows) => {
        const filas = arr(rows);
        return {
          total: filas.length,
          activos: filas.filter((u) => u.activo).length,
          clavesTemporales: filas.filter((u) => u.debe_cambiar_password).length,
          sinEmpresa: filas.filter((u) => u.rol === 'contador' && !u.es_workspace
            && arr(u.empresa_ids).length === 0).length,
        };
      }),
    );
  }

  candidatosUsuarios(search?: string, page = 0, size = 8): Observable<PageResponse<CandidatoUsuario>> {
    return this.http.get<PageResponse<CandidatoUsuario>>(`${GP}/usuarios/candidatos`, {
      params: { search: search || '', page, size },
    });
  }

  rolesUsuarios(): Observable<RolNexa[]> {
    return of([
      { id: 1, name: 'contador', description: 'Contador' },
      { id: 2, name: 'gerente', description: 'Gerencia' },
      { id: 3, name: 'superadmin', description: 'Superadmin' },
    ]);
  }

  crearUsuarioGp(body: CrearUsuarioGpInput): Observable<UsuarioGp> {
    return this.http.post<Any>(`${GP}/usuarios/`, {
      nombre: body.username,
      username: body.username,
      email: body.email,
      employee_id: body.employeeId,
      password: body.password,
      rol: body.rol,
      es_workspace: false,
    }).pipe(
      switchMap((r) => body.empresaIds?.length
        ? this.http.put<Any>(`${GP}/usuarios/${r.id}/empresas`, { empresa_ids: body.empresaIds })
        : of(r)),
      map((r) => this.mapUsuario(r)),
    );
  }

  asignarEmpresasGp(usuarioId: number, empresaIds: number[]): Observable<UsuarioGp> {
    return this.http.put<Any>(`${GP}/usuarios/${usuarioId}/empresas`, { empresa_ids: empresaIds }).pipe(
      map((r) => this.mapUsuario(r)),
    );
  }

  actualizarUsuarioGp(usuarioId: number, body: { puedeAprobar?: boolean | null; activo?: boolean; rol?: string }): Observable<UsuarioGp> {
    const payload: Any = {};
    if (body.activo !== undefined) payload.activo = body.activo;
    if (body.rol) payload.rol = body.rol;
    if (body.puedeAprobar !== undefined && body.puedeAprobar !== null) payload.puede_aprobar = body.puedeAprobar;
    return this.http.put<Any>(`${GP}/usuarios/${usuarioId}`, payload).pipe(
      map((r) => this.mapUsuario(r)),
    );
  }

  /** Reset de clave: genera la temporal en cliente y la manda al gestor. */
  resetearPasswordGp(usuarioId: number): Observable<ResetPasswordGp> {
    const temporal = this.generarTemporal();
    return this.http.put<Any>(`${GP}/usuarios/${usuarioId}`, { password: temporal }).pipe(
      map((r) => ({ username: r.username ?? '', password: temporal })),
    );
  }

  private generarTemporal(): string {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const valores = new Uint32Array(10);
    crypto.getRandomValues(valores);
    return Array.from(valores, (v) => abc[v % abc.length]).join('') + '1!';
  }

  // ── Categorías / maestro ──
  aprobarConceptoNomina(empresaId: number, periodo: string, campo: string): Observable<unknown> {
    return this.http.put(`${GP}/presupuesto/periodos/${periodo}/nomina/${campo}/aprobar`, {});
  }

  /** Espejo del de Nómina: crea un Pago Proyectado con origen "impuestos". */
  aprobarConceptoEstampillas(empresaId: number, periodo: string, campo: string): Observable<unknown> {
    return this.http.put(`${GP}/presupuesto/periodos/${periodo}/estampillas/${campo}/aprobar`, {});
  }

  importarEstructura(empresaId: number, body: Record<string, unknown>): Observable<{ok: boolean; resumen: Record<string, number>; total_movimientos: number; total_proveedores: number}> {
    return this.http.post<{ok: boolean; resumen: Record<string, number>; total_movimientos: number; total_proveedores: number}>(`${GP}/importacion/estructura`, body, {params: new HttpParams().set('empresaId', empresaId)});
  }

  categorias(forzar = false): Observable<string[]> {
    if (forzar || !this.categorias$) {
      this.categorias$ = this.http.get<string[]>(`${GP}/categorias/lista`).pipe(
        catchError(err => {
          this.categorias$ = undefined;
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    }
    return this.categorias$;
  }

  limpiarCacheCategorias(): void {
    this.categorias$ = undefined;
  }

  categoriasHistoricas(): Observable<string[]> {
    return this.categorias();
  }

  administrarCategorias(): Observable<{id: number; nombre: string; activa: boolean}[]> {
    return this.http.get<Any[]>(`${GP}/categorias/admin/todas`).pipe(
      map((rows) => arr(rows).map((c) => ({ id: c.id, nombre: c.nombre, activa: !!c.activa }))),
    );
  }

  crearCategoria(nombre: string): Observable<unknown> {
    return this.http.post(`${GP}/categorias/admin`, { nombre }).pipe(
      tap(() => this.limpiarCacheCategorias()),
    );
  }

  cambiarEstadoCategoria(id: number, activa: boolean): Observable<unknown> {
    return this.http.put(`${GP}/categorias/admin/${id}`, { activa }).pipe(
      tap(() => this.limpiarCacheCategorias()),
    );
  }

  renombrarCategoria(id: number, nombre: string): Observable<unknown> {
    return this.http.put(`${GP}/categorias/admin/${id}`, { nombre }).pipe(
      tap(() => this.limpiarCacheCategorias()),
    );
  }

  catalogoProveedores(): Observable<{ id: number; nit: string; nombre: string; categoria: string | null; categoria_detalle: string | null; activo: boolean }[]> {
    return this.http.get<any[]>(`${GP}/categorias/`);
  }

  crearProveedorCatalogo(body: { nit: string; nombre: string; categoria: string; categoria_detalle?: string | null }): Observable<unknown> {
    return this.http.post(`${GP}/categorias/crear`, body).pipe(
      tap(() => this.limpiarCacheCategorias()),
    );
  }

  actualizarProveedorCatalogo(id: number, body: { nombre?: string; categoria?: string | null; categoria_detalle?: string | null; activo?: boolean }): Observable<unknown> {
    return this.http.put(`${GP}/categorias/proveedor/${id}`, body).pipe(
      tap(() => this.limpiarCacheCategorias()),
    );
  }

  maestros(empresaId: number, busqueda?: string): Observable<MaestroProveedor[]> {
    return this.http.get<Any[]>(`${GP}/categorias/`).pipe(
      map((rows) => {
        let filas = arr(rows).map(mapMaestro);
        if (busqueda) {
          const q = busqueda.toLowerCase();
          filas = filas.filter((f) => f.nit.toLowerCase().includes(q) || f.nombre.toLowerCase().includes(q));
        }
        return filas;
      }),
    );
  }

  asignarCategoria(empresaId: number, nit: string, categoria: string, categoriaDetalle: string | null, modulo?: string): Observable<MaestroProveedor> {
    return this.http.put<Any>(`${GP}/categorias/asignar`, {
      nit, categoria, categoria_detalle: categoriaDetalle, modulo,
    }).pipe(
      tap(() => this.limpiarCacheCategorias()),
      map((r) => ({
        id: 0, nit: r.nit, nombre: r.nombre ?? '', categoria: r.categoria ?? null,
        categoriaDetalle: r.categoria_detalle ?? null, pagoSugerido: null, observacion: null,
      }))
    );
  }

  // ── Módulos financieros (5) ──
  private rutaModulo(modulo: string): string {
    const mapa: Record<string, string> = { cx_pagar: 'cuentas-pagar', cx_cobrar: 'cuentas-cobrar' };
    return mapa[modulo] ?? modulo;
  }

  movimientos(modulo: string, empresaId: number, filtros: {categoria?: string; nit?: string; busqueda?: string; fechaDesde?: string; fechaHasta?: string; page?: number; size?: number; sortBy?: string; sortDir?: string;}): Observable<PageResponse<Movimiento>> {
    let params = new HttpParams().set('empresaId', empresaId).set('page', filtros.page ?? 0).set('size', filtros.size ?? 50);
    for (const [key,value] of Object.entries(filtros)) if (value !== undefined && value !== '') params = params.set(key,String(value));
    return this.http.get<Any>(`${GP}/${this.rutaModulo(modulo)}/`,{params}).pipe(map(result => ({...result, content: arr(result.content).map(r => mapMovimiento(r,modulo))})));
  }

  resumenModulo(modulo: string, empresaId: number): Observable<ResumenModulo> {
    return this.http.get<Any[]>(`${GP}/${this.rutaModulo(modulo)}/resumen`,{params:{empresaId}}).pipe(map(rows=>({...mapResumenModulo(rows),totalMovimientos:arr(rows).reduce((total,row)=>total+Number(row.movimientos??0),0)})));
  }

  exportarModulo(modulo: string, empresaId: number, categoria?: string, fechaDesde?: string, fechaHasta?: string): Observable<Blob> {
    let p = new HttpParams();
    if (categoria) p = p.set('categoria', categoria);
    return this.http.get(`${GP}/${this.rutaModulo(modulo)}/exportar`, { params: p, responseType: 'blob' });
  }

  descargarPlantilla(modulo: string, empresaId: number): Observable<Blob> {
    return this.http.get(`${GP}/importacion/plantilla`, {
      params: new HttpParams().set('modulo', modulo),
      responseType: 'blob',
    });
  }

  previewImportacion(modulo: string, empresaId: number, archivo: File, onProgress?: (pct: number) => void): Observable<PreviewImportacion | null> {
    const form = new FormData();
    form.append('file', archivo); // el gestor espera el campo 'file'
    const params = new HttpParams().set('modulo', modulo);
    return this.http.post<Any>(`${GP}/importacion/preview`, form, {
      params,
      reportProgress: true,
      observe: 'events',
    }).pipe(
      map((event: HttpEvent<Any>) => {
        if (event.type === HttpEventType.UploadProgress) {
          onProgress?.(event.total ? Math.round((event.loaded / event.total) * 100) : 0);
        }
        if (event.type === HttpEventType.Response) return mapPreview(event.body as Any);
        return null as unknown as PreviewImportacion;
      }),
    );
  }

  confirmarImportacion(empresaId: number, importacionId: number): Observable<ConfirmarImportacion> {
    return this.http.post<Any>(`${GP}/importacion/confirmar/${importacionId}`, null).pipe(
      map((r) => mapConfirmar(r)),
    );
  }

  /** Última importación del módulo: mes detectado, meses cargados/omitidos. */
  importacionPeriodos(modulo: string, empresaId: number): Observable<ImportacionPeriodoInfo> {
    return this.http.get<Any>(`${GP}/importacion/info`, {
      params: new HttpParams().set('empresaId', empresaId).set('modulo', modulo),
    }).pipe(map((r) => mapInfoImportacion(r)));
  }

  importarMaestro(empresaId: number, archivo: File, onProgress?: (pct: number) => void): Observable<MaestroImportacion | null> {
    const body = new FormData(); body.append('file', archivo);
    return this.http.post<MaestroImportacion>(`${GP}/importacion/maestro`, body, {
      params: { empresaId }, observe: 'events', reportProgress: true,
    }).pipe(tap(event => {
      if (event.type === HttpEventType.UploadProgress) onProgress?.(event.total ? Math.round(event.loaded * 100 / event.total) : 0);
    }), filter(event => event.type === HttpEventType.Response),
      map(event => event.type === HttpEventType.Response ? event.body : null));
  }

  // ── Contrato / periodos / mensual ──
  contrato(empresaId: number): Observable<Contrato> {
    return this.http.get<Any>(`${GP}/presupuesto/contrato`, {
      params: new HttpParams().set('empresaId', empresaId),
    }).pipe(map((r) => mapContrato(r)));
  }

  guardarContrato(empresaId: number, body: Partial<Contrato>): Observable<Contrato> {
    return this.http.put<Any>(`${GP}/presupuesto/contrato`, contratoIn(body)).pipe(map((r) => mapContrato(r)));
  }

  periodos(empresaId: number): Observable<Periodo[]> {
    // El gestor no lista periodos: se derivan de la vista mensual.
    return this.mensual(empresaId).pipe(map((m) => mapPeriodoDesdeMensual(m)));
  }

  guardarPeriodo(empresaId: number, periodo: string, campo: string, valor: number | null): Observable<Periodo> {
    return this.http.put<Any>(`${GP}/presupuesto/periodos/${periodo}`, { [campo]: valor }).pipe(
      map((r) => ({
        periodo: r.periodo ?? periodo, campos: {}, totalDisponible: r.total_disponible ?? 0,
        totalNomina: r.total_nomina ?? 0, nominaAprobada: false, notas: r.notas ?? null,
      })),
    );
  }

  guardarNotasPeriodo(empresaId: number, periodo: string, notas: string): Observable<Periodo> {
    return this.http.put<Any>(`${GP}/presupuesto/periodos/${periodo}`, { notas }).pipe(
      map((r) => ({
        periodo: r.periodo ?? periodo, campos: {}, totalDisponible: r.total_disponible ?? 0,
        totalNomina: r.total_nomina ?? 0, nominaAprobada: false, notas: r.notas ?? notas,
      })),
    );
  }

  guardarValorCuentasCobrar(
    empresaId: number, nit: string, periodo: string, valor: number | null,
    nombre: string, categoria: string | null,
  ): Observable<Any> {
    return this.http.put<Any>(
      `${GP}/presupuesto/periodos/${periodo}/cuentas-cobrar/${encodeURIComponent(nit)}` +
      `?empresaId=${empresaId}`,
      { valor: valor ?? 0, nombre, categoria },
    );
  }

  /** csv del mensual con refresco fresco: `refrescar` agrega un buster `_t`
   *  para que el navegador/IIS no sirva la respuesta anterior desde caché
   *  tras un PUT (causa de "hay que recargar para ver el cambio" en producción). */
  mensual(empresaId: number, refrescar = false, resumen = false): Observable<Mensual> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (refrescar) params = params.set('_t', String(Date.now()));
    if (resumen) params = params.set('resumen', true);
    return this.http.get<Any>(`${GP}/presupuesto/mensual`, { params }).pipe(map((r) => mapMensual(r)));
  }

  /** Sólo los terceros de la sección y página solicitadas; los totales son globales. */
  mensualSeccion(empresaId: number, seccion: string, filtros: {page?: number; size?: number; busqueda?: string; categoria?: string; nombre?: string} = {}): Observable<SeccionTerceros | SeccionPagos> {
    let params = new HttpParams().set('empresaId', empresaId).set('page', filtros.page ?? 0).set('size', filtros.size ?? 50);
    if (filtros.busqueda) params = params.set('busqueda', filtros.busqueda);
    if (filtros.categoria) params = params.set('categoria', filtros.categoria);
    if (filtros.nombre) params = params.set('nombre', filtros.nombre);
    return this.http.get<Any>(`${GP}/presupuesto/mensual/secciones/${encodeURIComponent(seccion)}`, { params }).pipe(
      map(r => ['pagosProyectados', 'cobrosProyectados', 'provisiones'].includes(seccion) ? mapSeccionPagos(r) : mapSeccionTerceros(r)),
    );
  }

  exportarPresupuestoExcel(empresaId: number): Observable<Blob> {
    return this.http.get(`${GP}/presupuesto/mensual/excel`, { params: new HttpParams().set('empresaId', empresaId), responseType: 'blob' });
  }

  aprobar(empresaId: number): Observable<Contrato> {
    return this.http.put<Any>(`${GP}/presupuesto/aprobar`,
      { aprobado_por: this.nombreUsuarioGp() },
      { params: new HttpParams().set('empresaId', empresaId) }).pipe(
      map((r) => mapContrato(r)),
    );
  }

  rechazar(empresaId: number, motivo: string): Observable<Contrato> {
    return this.http.put<Any>(`${GP}/presupuesto/rechazar`, {
      aprobado_por: this.nombreUsuarioGp(), motivo,
    }, { params: new HttpParams().set('empresaId', empresaId) }).pipe(map((r) => mapContrato(r)));
  }

  resumenGerencial(): Observable<ResumenGerencial[]> {
    return this.http.get<Any[]>(`${GP}/presupuesto/resumen-gerencial`).pipe(
      map((rows) => arr(rows).map(mapResumenGerencial)),
    );
  }

  // ── Distribución de pagos ("Saldo en Bancos") — sin equivalente en el gestor ──
  distribucionPagos(): Observable<DistribucionPagos> {
    return this.http.get<DistribucionPagos>(`${GP}/presupuesto/distribucion-pagos`);
  }

  aprobarDistribucion(empresaId: number, aprobado: boolean, items: string[], monto: number): Observable<DistribucionEmpresa> {
    return this.http.put<DistribucionEmpresa>(`${GP}/presupuesto/distribucion-pagos/${empresaId}/aprobar`, { aprobado, items, monto });
  }

  // ── Consolidado (en el gestor: /presupuesto/ y /presupuesto/detalle) ──
  consolidado(empresaId: number): Observable<ConsolidadoFila[]> {
    return this.http.get<Any[]>(`${GP}/presupuesto/`).pipe(
      map((rows) => arr(rows).map((r) => ({
        categoria: r.categoria, proveedores: r.proveedores ?? 0, anticipos: r.anticipos ?? 0,
        cxPagar: r.cx_pagar ?? 0, cxCobrar: r.cx_cobrar ?? 0, impuestos: r.impuestos ?? 0,
        total: r.total ?? 0, pagoSugerido: r.pago_sugerido ?? null, notas: r.notas ?? null,
      }))),
    );
  }

  /** Detalle por tercero PAGINADO en el backend: filtros (búsqueda libre,
   *  categoría, nombre exacto y alerta de cruce) y orden del total viajan
   *  como parámetros, así el navegador no carga ni ordena toda la cartera. */
  detalleConsolidado(empresaId: number, filtros: {busqueda?: string; categoria?: string; nombre?: string; alerta?: string; orden?: 'asc' | 'desc'; page?: number; size?: number} = {}): Observable<DetalleConsolidadoPagina> {
    let params = new HttpParams().set('empresaId', empresaId).set('page', filtros.page ?? 0).set('size', filtros.size ?? 100);
    for (const [key, value] of Object.entries(filtros)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Any>(`${GP}/presupuesto/detalle`, { params }).pipe(
      map((r) => ({ ...r, content: arr(r.content).map(mapConsolidado), nombres: arr(r.nombres) })),
    );
  }

  setPagoSugeridoCategoria(empresaId: number, categoria: string, pagoSugerido: number | null, notas: string | null): Observable<ConsolidadoFila> {
    return this.http.put<Any>(`${GP}/presupuesto/pago-sugerido`, {
      categoria, pago_sugerido: pagoSugerido, notas,
    }).pipe(map((r) => ({
      categoria: r.categoria, proveedores: r.proveedores ?? 0, anticipos: r.anticipos ?? 0,
      cxPagar: r.cx_pagar ?? 0, cxCobrar: r.cx_cobrar ?? 0, impuestos: r.impuestos ?? 0,
      total: r.total ?? 0, pagoSugerido: r.pago_sugerido ?? null, notas: r.notas ?? null,
    })));
  }

  setPagoSugeridoProveedor(empresaId: number, nit: string, pagoSugerido: number | null, forzarCancelacion: boolean): Observable<DetalleConsolidado> {
    return this.http.put<Any>(`${GP}/presupuesto/proveedores/${nit}/pago-sugerido`, {
      pago_sugerido: pagoSugerido, forzar_cancelacion: forzarCancelacion,
    }).pipe(map((r) => mapConsolidado(r)));
  }

  /** Saldo Sugerido de COBROS (Cuentas por Cobrar): columna y validaciones
   *  propias, separadas del Pago Sugerido de egresos. */
  setPagoSugeridoCobro(empresaId: number, nit: string, pagoSugerido: number | null, forzarCancelacion: boolean): Observable<DetalleConsolidado> {
    return this.http.put<Any>(`${GP}/presupuesto/proveedores/${nit}/pago-sugerido-cobro`, {
      pago_sugerido: pagoSugerido, forzar_cancelacion: forzarCancelacion,
    }).pipe(map((r) => mapConsolidado(r)));
  }

  setObservacion(empresaId: number, nit: string, observacion: string | null): Observable<DetalleConsolidado> {
    return this.http.put<Any>(`${GP}/presupuesto/proveedores/${nit}/observacion`, { observacion }).pipe(
      map((r) => mapConsolidado(r)),
    );
  }

  /** Refresco del módulo Proveedores (Gerencia) — no modifica Pagos Sugeridos. */
  recalcularSugeridos(empresaId: number): Observable<any[]> {
    return this.http.put<Any[]>(`${GP}/presupuesto/proveedores/recalcular-sugeridos`, null).pipe(map((r) => arr(r)));
  }

  // ── Pagos proyectados ──
  pagos(empresaId: number, filtros: {vistaMes?:boolean; estado?: string; origen?: 'manual' | 'aprobado'; nit?: string; fechaDesde?: string; fechaHasta?: string; page?: number; size?: number; sortBy?: string; sortDir?: string;}): Observable<PageResponse<PagoProyectado>> {
    let params = new HttpParams().set('empresaId',empresaId).set('page',filtros.page??0).set('size',filtros.size??50);
    for(const [key,value] of Object.entries(filtros)) if(value!==undefined && value!=='') params=params.set(key,String(value));
    return this.http.get<Any>(`${GP}/pagos-proyectados/`,{params}).pipe(map(result=>({...result,content:arr(result.content).map(mapPago)})));
  }

  candidatos(empresaId: number, vistaMes = false): Observable<CandidatoPago[]> {
    return this.http.get<Any[]>(`${GP}/pagos-proyectados/candidatos`, {params:{empresaId,...(vistaMes ? {vistaMes:true} : {})}}).pipe(
      map((rows) => arr(rows).map(mapCandidato)),
    );
  }

  facturasSugeridas(empresaId: number, vistaMes = false): Observable<FacturaSugerida[]> {
    return this.http.get<Any[]>(`${GP}/pagos-proyectados/sugeridos`, {params:{empresaId,...(vistaMes ? {vistaMes:true} : {})}}).pipe(
      map((rows) => arr(rows).map(mapFactura)),
    );
  }

  eliminarFacturaSugerida(empresaId: number, id: number): Observable<void> {
    return this.http.delete<void>(`${GP}/pagos-proyectados/sugeridos/facturas/${id}`, {params: {empresaId}});
  }

  aprobacionMasiva(empresaId: number, ids: number[], aprobado: boolean): Observable<{actualizados: Any[]; errores: {pago_id: number; mensaje: string}[]}> {
    return this.http.put<{actualizados: Any[]; errores: {pago_id: number; mensaje: string}[]}>(
      `${GP}/pagos-proyectados/sugeridos/aprobacion-masiva`, {pago_ids: ids, aprobado}, {params: {empresaId}});
  }

  setSugeridoNomina(empresaId: number, campo: string, monto: number, meses: string[] | null): Observable<{pagoSugerido: number; mesesSeleccionados: string[] | null}> {
    return this.http.put<Any>(`${GP}/presupuesto/nomina/${campo}/sugerido`, {monto, meses},
      {params: new HttpParams().set('empresaId', empresaId)}).pipe(map(r => ({
        pagoSugerido: r.pago_sugerido, mesesSeleccionados: r.meses_seleccionados ?? null,
      })));
  }

  sugerenciasPresupuesto(empresaId: number, vistaMes = false): Observable<SugerenciaPresupuesto[]> {
    return this.http.get<Any[]>(`${GP}/pagos-proyectados/sugerencias-presupuesto`, {
      params: new HttpParams().set('empresaId', empresaId).set('vistaMes',vistaMes),
    }).pipe(map(rows => arr(rows).map(mapSugerenciaPresupuesto)));
  }

  /** El gestor aprueba por movimiento_id: resuelve nit+comprobante → ids. */
  aprobarSugeridos(empresaId: number, pagos: { nit: string; comprobante: string }[]): Observable<{ aprobados: number; errores: { nit: string; comprobante: string; error: string }[] }> {
    return new Observable((obs) => {
      this.facturasSugeridas(empresaId).subscribe({
        next: (sugeridas) => {
          const ids: number[] = [];
          const errores: { nit: string; comprobante: string; error: string }[] = [];
          for (const p of pagos) {
            const match = sugeridas.find((s) => s.nit === p.nit && (s.comprobante ?? '') === p.comprobante);
            if (match) ids.push(match.movimientoId);
            else errores.push({ nit: p.nit, comprobante: p.comprobante, error: 'Factura no encontrada entre las sugeridas.' });
          }
          if (!ids.length) { obs.next({ aprobados: 0, errores }); obs.complete(); return; }
          this.http.put<Any>(`${GP}/pagos-proyectados/sugeridos/aprobar`, { movimiento_ids: ids }).subscribe({
            next: (r) => {
              const aprobadosPorId = new Map<number, Any>(arr(r.aprobados).map((a) => [a.movimiento_id ?? a.id, a]));
              const erroresApi = arr(r.errores).map((e) => {
                const original = pagos.find((_, i) => ids[i] === e.movimiento_id) ?? pagos[0];
                return { nit: original?.nit ?? '', comprobante: original?.comprobante ?? '', error: e.mensaje ?? 'Error' };
              });
              obs.next({ aprobados: aprobadosPorId.size, errores: [...errores, ...erroresApi] });
              obs.complete();
            },
            error: (err) => obs.error(err),
          });
        },
        error: (err) => obs.error(err),
      });
    });
  }

  resumenPagos(empresaId: number, origen?: 'manual' | 'aprobado', vistaMes = false, modulo?: 'cx_cobrar'): Observable<ResumenPagos> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (origen) params = params.set('origen', origen);
    if(vistaMes) params=params.set('vistaMes','true');
    if (modulo) params = params.set('modulo', modulo);
    return this.http.get<Any>(`${GP}/pagos-proyectados/resumen`, { params }).pipe(map((r) => mapResumenPagos(r)));
  }

  crearPago(empresaId: number, body: Partial<PagoProyectado>): Observable<PagoProyectado> {
    return this.http.post<Any>(`${GP}/pagos-proyectados/`, pagoIn(body), {params: {empresaId}}).pipe(map((r) => mapPago(r)));
  }

  actualizarPago(empresaId: number, pagoId: number, body: Partial<PagoProyectado>): Observable<PagoProyectado> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/${pagoId}`, pagoIn(body), {params: {empresaId}}).pipe(map((r) => mapPago(r)));
  }

  marcarPagado(empresaId: number, pagoId: number, fechaPagoReal: string): Observable<PagoProyectado> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/${pagoId}/pagar`, { fecha_pago_real: fechaPagoReal }).pipe(
      map((r) => mapPago(r)),
    );
  }

  aprobarPago(empresaId: number, pagoId: number, aprobado: boolean): Observable<PagoProyectado> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/${pagoId}/aprobar`, { aprobado }).pipe(map((r) => mapPago(r)));
  }

  eliminarPago(empresaId: number, pagoId: number): Observable<void> {
    return this.http.delete<{ok: boolean}>(`${GP}/pagos-proyectados/${pagoId}`, {params: {empresaId}}).pipe(map(() => undefined));
  }

  /**
   * Cobros proyectados (modulo_origen = cx_cobrar): viven en la misma tabla
   * de pagos, pero la vista vw_gp_pagos los excluye porque son ingresos.
   * El endpoint del Gestor los lista con origen=cx_cobrar.
   */
  cobrosProyectados(empresaId: number): Observable<PagoProyectado[]> {
    return this.http
      .get<Any>(`${GP}/pagos-proyectados`, {
        params: new HttpParams().set('empresaId', empresaId).set('origen', 'cx_cobrar'),
      })
      .pipe(map((r) => arr(r).map(mapPago)));
  }

  actualizarNotasPago(empresaId: number, pagoId: number, notas: string | null): Observable<PagoProyectado> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/${pagoId}`, { notas }, {params: {empresaId}}).pipe(map((r) => mapPago(r)));
  }

  ajustarCxCobrar(empresaId: number, nit: string, mes: string, valor: number): Observable<unknown> {
    return this.http.put(`${GP}/presupuesto/cuentas-cobrar/${encodeURIComponent(nit)}/valor`,
      { mes, valor });
  }

  /** Previsualiza la aprobación con Pago Sugerido; `modulo` filtra las
   *  facturas del maestro del tercero (la sección Impuestos aprueba solo
   *  sus movimientos). SIN módulo se seleccionan proveedores + cx_pagar. */
  previsualizarProveedor(empresaId: number, nit: string, modulo?: string): Observable<PrevisualizarProveedor> {
    return this.http.get<Any>(`${GP}/pagos-proyectados/proveedores/${nit}/previsualizar-sugerido`,
      modulo ? { params: { modulo } } : undefined).pipe(
      map((r) => mapPrevisualizar(r)),
    );
  }

  aprobarProveedorSugerido(empresaId: number, nit: string, modulo?: string): Observable<{ totalAprobado: number; facturasAprobadas: number; primeraFacturaOmitida: string | null; error: string | null }> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/proveedores/${nit}/aprobar-sugerido`, {},
      modulo ? { params: { modulo } } : undefined).pipe(
      map((r) => ({
        totalAprobado: r.total_aprobado ?? 0,
        facturasAprobadas: r.facturas_aprobadas ?? 0,
        primeraFacturaOmitida: r.primera_factura_omitida?.comprobante ?? null,
        error: null,
      })),
    );
  }

  /** Aprobación de tercero por módulo (Anticipos "anticipos" / Cuentas por
   *  Cobrar "cx_cobrar" / Impuestos "impuestos" / CxP "cx_pagar"): saldo pendiente
   *  del tercero en ese módulo. */
  previsualizarTerceroModulo(empresaId: number, modulo: string, nit: string): Observable<PrevisualizarProveedor> {
    return this.http.get<Any>(`${GP}/pagos-proyectados/${encodeURIComponent(modulo)}/${encodeURIComponent(nit)}/previsualizar`).pipe(
      map((r) => mapPrevisualizar(r)),
    );
  }

  /** Previsualización PARCIAL del tercero en un módulo: una factura
   *  (movimiento) por fila con montos editables hasta su saldo. Base del
   *  reparto del cupo sugerido (Otras Cuentas por Pagar y Cuentas por Cobrar). */
  previsualizarParcial(empresaId: number, modulo: string, nit: string): Observable<PrevisualizarProveedor> {
    return this.http.get<Any>(`${GP}/pagos-proyectados/${encodeURIComponent(modulo)}/${encodeURIComponent(nit)}/previsualizar-parcial`).pipe(
      map((r) => mapPrevisualizar(r)),
    );
  }

  aprobarTerceroModulo(empresaId: number, modulo: string, nit: string): Observable<{ totalAprobado: number; facturasAprobadas: number; error: string | null }> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/${encodeURIComponent(modulo)}/${encodeURIComponent(nit)}/aprobar`, {}).pipe(
      map((r) => ({
        totalAprobado: r.total_aprobado ?? 0,
        facturasAprobadas: r.facturas_aprobadas ?? 0,
        error: null,
      })),
    );
  }

  /**
   * Aprobación parcial por movimiento (módulos cx_pagar / impuestos).
   * Llama a PUT /api/gp/pagos-proyectados/{modulo}/{nit}/aprobar-parcial con body {"aprobaciones":[{"movimiento_id":N,"monto":X}]}.
   */
  aprobarParcial(
    empresaId: number,
    modulo: string,
    nit: string,
    aprobaciones: Array<{ movimiento_id: number; monto: number }>
  ): Observable<{ totalAprobado: number; facturasAprobadas: number; error: string | null }> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/${encodeURIComponent(modulo)}/${encodeURIComponent(nit)}/aprobar-parcial`, { aprobaciones }).pipe(
      map((r) => ({
        totalAprobado: r?.total_aprobado ?? 0,
        facturasAprobadas: r?.facturas_aprobadas ?? aprobaciones.length,
        error: null,
      })),
      catchError((err) => throwError(() => err)),
    );
  }

  /**
   * Histórico de aprobaciones del GP (solo consulta con filtros server-side).
   * GET /api/gp/historicos/aprobaciones
   */
  obtenerHistoricoAprobaciones(filtros: {
    empresaId?: number;
    desde?: string;
    hasta?: string;
    tercero?: string;
    modulo?: string;
    estado?: string;
    montoMin?: number;
    montoMax?: number;
    orden?: 'asc' | 'desc';
    page?: number;
    size?: number;
  }): Observable<HistoricoAprobacionesResponse> {
    let params = new HttpParams();
    if (filtros.empresaId != null) params = params.set('empresaId', String(filtros.empresaId));
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.tercero) params = params.set('texto', filtros.tercero);
    if (filtros.modulo) params = params.set('modulo', filtros.modulo);
    if (filtros.estado) params = params.set('estado', filtros.estado);
    if (filtros.montoMin != null) params = params.set('monto_min', String(filtros.montoMin));
    if (filtros.montoMax != null) params = params.set('monto_max', String(filtros.montoMax));
    const ordenBackend = filtros.orden === 'asc' ? 'fecha_asc' : 'fecha_desc';
    params = params.set('orden', ordenBackend);
    if (filtros.page != null) params = params.set('page', String(filtros.page));
    if (filtros.size != null) params = params.set('size', String(filtros.size));

    return this.http.get<Any>(`${GP}/historicos/aprobaciones`, { params }).pipe(
      map((r) => ({
        total: r?.total ?? 0,
        page: r?.page ?? (filtros.page ?? 0),
        items: (r?.items ?? []).map((it: Any) => ({
          id: it.id,
          fechaAprobacion: it.aprobado_en ?? it.fecha_aprobacion ?? it.creado_en ?? '',
          nit: it.nit ?? '',
          nombre: it.nombre_tercero ?? it.nombre ?? it.tercero ?? '',
          monto: it.monto ?? 0,
          modulo: it.modulo_origen ?? it.modulo ?? '',
          comprobante: it.comprobante ?? null,
          estado: it.estado ?? 'proyectado',
          aprobadoPor: it.aprobado_por ?? it.usuario ?? null,
        })),
      })),
      catchError(() => of({ total: 0, page: 0, items: [] })),
    );
  }

  /** Aprobación de Provisiones por beneficiario (nit, o nombre si el pago
   *  no trae NIT): aprueba todas las provisiones pendientes de ese tercero. */
  previsualizarProvisionesBeneficiario(empresaId: number, id: { nit?: string | null; nombre?: string | null }): Observable<PrevisualizarProveedor> {
    let params = new HttpParams();
    if (id.nit) params = params.set('nit', id.nit);
    if (id.nombre) params = params.set('nombre', id.nombre);
    return this.http.get<Any>(`${GP}/pagos-proyectados/provisiones/beneficiario/previsualizar`, { params }).pipe(
      map((r) => mapPrevisualizar(r)),
    );
  }

  aprobarProvisionesBeneficiario(empresaId: number, id: { nit?: string | null; nombre?: string | null }): Observable<{ totalAprobado: number; pagosAprobados: number; error: string | null }> {
    return this.http.put<Any>(`${GP}/pagos-proyectados/provisiones/beneficiario/aprobar`, {
      nit: id.nit ?? null, nombre: id.nombre ?? null,
    }).pipe(
      map((r) => ({
        totalAprobado: r.total_aprobado ?? 0,
        pagosAprobados: r.facturas_aprobadas ?? r.pagos_aprobados ?? 0,
        error: null,
      })),
    );
  }

  descargarPlantillaPagos(empresaId: number): Observable<Blob> {
    return this.http.get(`${GP}/pagos-proyectados/plantilla`, { responseType: 'blob' });
  }

  importarPagosExcel(
    empresaId: number,
    archivo: File,
    onProgress?: (pct: number) => void,
  ): Observable<{ importados: number; errores: { fila: number; mensaje: string }[] }> {
    type Resultado = { importados: number; errores: { fila: number; mensaje: string }[] };
    const form = new FormData();
    form.append('file', archivo);
    return this.http
      .post<Any>(`${GP}/pagos-proyectados/importar`, form, { reportProgress: true, observe: 'events' })
      .pipe(
        map((ev): Resultado | null => {
          if (ev.type === HttpEventType.UploadProgress) {
            onProgress?.(ev.total ? Math.round((100 * ev.loaded) / ev.total) : 0);
            return null;
          }
          if (ev.type !== HttpEventType.Response) return null;
          const r = (ev as HttpResponse<Any>).body ?? {};
          return {
            importados: r.importados ?? 0,
            // El backend envía el motivo en `error` (ErrorFila); algunos módulos usan `mensaje`.
            errores: arr(r.errores).map((e: Any) => ({ fila: e.fila, mensaje: e.mensaje ?? e.error ?? '' })),
          };
        }),
        filter((r): r is Resultado => r !== null),
      );
  }

  // ── Auditoría / notificaciones ──
  moduloAnual(modulo: string, empresaId: number, anio: number | null = null): Observable<ModuloAnual> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (anio !== null) params = params.set('anio', anio);
    return this.http.get<ModuloAnual>(`${GP}/${this.rutaModulo(modulo)}/anual`, { params });
  }

  exportarModuloAnual(modulo: string, empresaId: number, filtros: { anio?: number | null; categoria?: string; busqueda?: string } = {}): Observable<Blob> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (filtros.anio != null) params = params.set('anio', filtros.anio);
    if (filtros.categoria) params = params.set('categoria', filtros.categoria);
    if (filtros.busqueda?.trim()) params = params.set('busqueda', filtros.busqueda.trim());
    const ruta = modulo === 'provisiones' ? 'pagos-proyectados/provisiones' : this.rutaModulo(modulo);
    return this.http.get(`${GP}/${ruta}/anual/exportar`, { params, responseType: 'blob' });
  }

  provisionesAnual(empresaId: number, anio: number | null = null): Observable<ModuloAnual> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (anio !== null) params = params.set('anio', anio);
    return this.http.get<ModuloAnual>(`${GP}/pagos-proyectados/provisiones/anual`, { params });
  }

  auditoriaGlobal(): Observable<any[]> {
    return this.http.get<Any>(`${GP}/auditoria/`).pipe(map((r) => arr(r.entradas)));
  }

  auditoria(empresaId: number): Observable<{ id: number; accion: string; entidad: string | null; detalle: string | null; usuarioNombre: string | null; createdAt: string | null }[]> {
    return this.http.get<Any>(`${GP}/auditoria/`, {
      params: new HttpParams().set('contador_id', empresaId),
    }).pipe(
      map((r) => arr(r.entradas).map((e) => ({
        id: e.id, accion: e.accion_texto ?? e.accion, entidad: e.entidad ?? null,
        detalle: e.detalle ?? null, usuarioNombre: e.usuario ?? null, createdAt: e.fecha ?? null,
      }))),
    );
  }

  notificaciones(empresaId: number): Observable<Notificacion[]> {
    return this.http.get<Any[]>(`${GP}/notificaciones/`).pipe(
      map((rows) => arr(rows).map(mapNotificacion)),
    );
  }

  marcarNotificacionLeida(empresaId: number, id: number): Observable<void> {
    return this.http.put<Any>(`${GP}/notificaciones/${id}/leida`, {}).pipe(map(() => undefined as void));
  }

  marcarTodasNotificacionesLeidas(empresaId: number): Observable<void> {
    return this.http.put(`${GP}/notificaciones/leer-todas`, {}).pipe(map(() => undefined as void));
  }
}
