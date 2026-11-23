import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  RegistroContable,
  ContabilidadRequest,
  StatsContabilidad,
  ContabilidadArchivos,
  CuentaContableParam,
  CUENTAS_CONTABLES_CATALOGO,
  TipoRegistro,
} from '../models/contabilidad.model';

@Injectable({ providedIn: 'root' })
export class TramitarContabilidadService {
  private readonly baseUrl = `${environment.apiUrl}/contabilidad`;
  private cuentasCache: CuentaContableParam[] = [];

  constructor(private http: HttpClient) {}

  // ── Registros contables ──
  getAllRegistros(): Observable<RegistroContable[]> {
    return this.http
      .get<RegistroContable[]>(this.baseUrl)
      .pipe(catchError(() => of([])));
  }

  getRegistroById(id: number): Observable<RegistroContable> {
    return this.http.get<RegistroContable>(`${this.baseUrl}/${id}`);
  }

  searchRegistros(termino: string): Observable<RegistroContable[]> {
    return this.http
      .get<RegistroContable[]>(`${this.baseUrl}/search`, {
        params: { termino },
      })
      .pipe(catchError(() => of([])));
  }

  filterRegistros(params: {
    estado?: string;
    tipoDocumento?: string;
    tipoRegistro?: string;
    proveedorId?: number;
  }): Observable<RegistroContable[]> {
    const queryParams: Record<string, string> = {};
    if (params.estado) queryParams['estado'] = params.estado;
    if (params.tipoDocumento) queryParams['tipoDocumento'] = params.tipoDocumento;
    if (params.tipoRegistro) queryParams['tipoRegistro'] = params.tipoRegistro;
    if (params.proveedorId) queryParams['proveedorId'] = `${params.proveedorId}`;

    return this.http
      .get<RegistroContable[]>(`${this.baseUrl}/filter`, { params: queryParams })
      .pipe(catchError(() => of([])));
  }

  createRegistro(
    registro: ContabilidadRequest,
    archivos: ContabilidadArchivos = {},
  ): Observable<RegistroContable> {
    return this.http.post<RegistroContable>(
      this.baseUrl,
      this.toFormData(registro, archivos),
    );
  }

  updateRegistro(
    id: number,
    registro: ContabilidadRequest,
    archivos: ContabilidadArchivos = {},
  ): Observable<RegistroContable> {
    return this.http.put<RegistroContable>(
      `${this.baseUrl}/${id}`,
      this.toFormData(registro, archivos),
    );
  }

  updateEstadoRegistro(id: number, estado: string): Observable<RegistroContable> {
    return this.http.patch<RegistroContable>(
      `${this.baseUrl}/${id}/estado`,
      null,
      { params: { estado } },
    );
  }

  deleteRegistro(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getStatsRegistros(): Observable<StatsContabilidad> {
    return this.http.get<StatsContabilidad>(`${this.baseUrl}/stats`).pipe(
      catchError(() =>
        of({
          totalRegistros: 0,
          registrosCausados: 0,
          registrosContabilizados: 0,
          registrosProgramados: 0,
          registrosPagados: 0,
          registrosMes: 0,
        }),
      ),
    );
  }

  // ── Cuentas contables (catálogo PUC) ──
  cargarCuentasContables(params?: {
    activa?: boolean;
    tipoRegistro?: TipoRegistro;
    search?: string;
  }): Observable<CuentaContableParam[]> {
    const queryParams: Record<string, string> = {};
    if (params?.activa !== undefined) queryParams['activa'] = `${params.activa}`;
    if (params?.tipoRegistro) queryParams['tipoRegistro'] = params.tipoRegistro;
    if (params?.search) queryParams['search'] = params.search;

    return this.http
      .get<CuentaContableParam[]>(`${this.baseUrl}/cuentas-contables`, {
        params: queryParams,
      })
      .pipe(
        tap((cuentas) => {
          this.cuentasCache = cuentas || [];
        }),
        catchError(() => {
          this.cuentasCache = CUENTAS_CONTABLES_CATALOGO.filter((c) => c.activa);
          return of(this.cuentasCache);
        }),
      );
  }

  getCuentaContable(codigo: string): Observable<CuentaContableParam | null> {
    return this.http
      .get<CuentaContableParam>(`${this.baseUrl}/cuentas-contables/${codigo}`)
      .pipe(catchError(() => of(null)));
  }

  createCuentaContable(cuenta: CuentaContableParam): Observable<CuentaContableParam> {
    return this.http.post<CuentaContableParam>(
      `${this.baseUrl}/cuentas-contables`,
      cuenta,
    );
  }

  updateCuentaContable(
    codigo: string,
    cuenta: Partial<CuentaContableParam>,
  ): Observable<CuentaContableParam> {
    return this.http.put<CuentaContableParam>(
      `${this.baseUrl}/cuentas-contables/${codigo}`,
      cuenta,
    );
  }

  activarCuentaContable(codigo: string, activa: boolean): Observable<void> {
    return this.http.patch<void>(
      `${this.baseUrl}/cuentas-contables/${codigo}/activar`,
      null,
      { params: { activa } },
    );
  }

  // ── Compatibilidad con el componente de trámite actual ──
  getById(id: number): Observable<RegistroContable> {
    return this.getRegistroById(id);
  }

  create(
    registro: ContabilidadRequest,
    archivos: ContabilidadArchivos = {},
  ): Observable<RegistroContable> {
    return this.createRegistro(registro, archivos);
  }

  update(
    id: number,
    registro: ContabilidadRequest,
    archivos: ContabilidadArchivos = {},
  ): Observable<RegistroContable> {
    return this.updateRegistro(id, registro, archivos);
  }

  getCuentasContables(): CuentaContableParam[] {
    if (this.cuentasCache.length) {
      return this.cuentasCache;
    }
    return CUENTAS_CONTABLES_CATALOGO.filter((c) => c.activa);
  }

  getCuentaContableByCodigo(codigo: string): CuentaContableParam | undefined {
    const source = this.getCuentasContables();
    return source.find((c) => c.codigo === codigo);
  }

  buscarCuentasContables(termino: string): CuentaContableParam[] {
    const term = termino.toLowerCase();
    return this.getCuentasContables().filter(
      (c) => c.codigo.includes(term) || c.nombre.toLowerCase().includes(term),
    );
  }

  private toFormData(
    registro: ContabilidadRequest,
    archivos: ContabilidadArchivos,
  ): FormData {
    const formData = new FormData();
    formData.append(
      'registro',
      new Blob([JSON.stringify(registro)], { type: 'application/json' }),
    );

    if (archivos.facturaElectronica)
      formData.append('facturaElectronica', archivos.facturaElectronica);
    if (archivos.vistoBueno) formData.append('vistoBueno', archivos.vistoBueno);
    if (archivos.documentoCausacion)
      formData.append('documentoCausacion', archivos.documentoCausacion);
    if (archivos.ordenCompra) formData.append('ordenCompra', archivos.ordenCompra);
    if (archivos.cotizacionAprobada)
      formData.append('cotizacionAprobada', archivos.cotizacionAprobada);
    if (archivos.actaRecibido) formData.append('actaRecibido', archivos.actaRecibido);
    if (archivos.soporteAlmacen)
      formData.append('soporteAlmacen', archivos.soporteAlmacen);
    (archivos.otrosSoportes || []).forEach((f, i) =>
      formData.append(`otroSoporte_${i}`, f),
    );

    return formData;
  }
}