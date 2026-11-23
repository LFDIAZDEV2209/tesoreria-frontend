import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  RegistroContable,
  ContabilidadRequest,
  StatsContabilidad,
  ContabilidadArchivos,
  CuentaContableParam,
  CUENTAS_CONTABLES_CATALOGO,
  SolicitudViaticosContabilidad,
} from '../models/contabilidad.model';

@Injectable({ providedIn: 'root' })
export class ContabilidadService {
  private baseUrl = `${environment.apiUrl}/contabilidad`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<RegistroContable[]> {
    return this.http
      .get<RegistroContable[]>(this.baseUrl)
      .pipe(catchError(() => of([])));
  }

  getById(id: number): Observable<RegistroContable> {
    return this.http.get<RegistroContable>(`${this.baseUrl}/${id}`);
  }

  search(termino: string): Observable<RegistroContable[]> {
    return this.http
      .get<RegistroContable[]>(`${this.baseUrl}/search`, {
        params: { termino },
      })
      .pipe(catchError(() => of([])));
  }

  filter(params: {
    estado?: string;
    tipoDocumento?: string;
    tipoRegistro?: string;
    proveedorId?: number;
  }): Observable<RegistroContable[]> {
    const queryParams: any = {};
    if (params.estado) queryParams.estado = params.estado;
    if (params.tipoDocumento) queryParams.tipoDocumento = params.tipoDocumento;
    if (params.tipoRegistro) queryParams.tipoRegistro = params.tipoRegistro;
    if (params.proveedorId)
      queryParams.proveedorId = params.proveedorId.toString();

    return this.http
      .get<RegistroContable[]>(`${this.baseUrl}/filter`, {
        params: queryParams,
      })
      .pipe(catchError(() => of([])));
  }

  create(
    registro: ContabilidadRequest,
    archivos: ContabilidadArchivos,
  ): Observable<RegistroContable> {
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
    // Retrocompatibilidad
    if (archivos.ordenCompra)
      formData.append('ordenCompra', archivos.ordenCompra);
    if (archivos.cotizacionAprobada)
      formData.append('cotizacionAprobada', archivos.cotizacionAprobada);
    if (archivos.actaRecibido)
      formData.append('actaRecibido', archivos.actaRecibido);
    if (archivos.soporteAlmacen)
      formData.append('soporteAlmacen', archivos.soporteAlmacen);
    // Otros soportes múltiples
    (archivos.otrosSoportes || []).forEach((f, i) =>
      formData.append(`otroSoporte_${i}`, f),
    );

    return this.http.post<RegistroContable>(this.baseUrl, formData);
  }

  update(
    id: number,
    registro: ContabilidadRequest,
    archivos: ContabilidadArchivos,
  ): Observable<RegistroContable> {
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
    // Retrocompatibilidad
    if (archivos.ordenCompra)
      formData.append('ordenCompra', archivos.ordenCompra);
    if (archivos.cotizacionAprobada)
      formData.append('cotizacionAprobada', archivos.cotizacionAprobada);
    if (archivos.actaRecibido)
      formData.append('actaRecibido', archivos.actaRecibido);
    if (archivos.soporteAlmacen)
      formData.append('soporteAlmacen', archivos.soporteAlmacen);
    // Otros soportes múltiples
    (archivos.otrosSoportes || []).forEach((f, i) =>
      formData.append(`otroSoporte_${i}`, f),
    );

    return this.http.put<RegistroContable>(`${this.baseUrl}/${id}`, formData);
  }

  updateEstado(id: number, estado: string): Observable<RegistroContable> {
    return this.http.patch<RegistroContable>(
      `${this.baseUrl}/${id}/estado`,
      null,
      {
        params: { estado },
      },
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getStats(): Observable<StatsContabilidad> {
    return this.http.get<StatsContabilidad>(`${this.baseUrl}/stats`).pipe(
      catchError(() =>
        of({
          totalRegistros: 0,
          registrosEnRevision: 0,
          registrosCausados: 0,
          registrosContabilizados: 0,
          registrosProgramados: 0,
          registrosPagados: 0,
          registrosDevueltos: 0,
          registrosMes: 0,
        } as StatsContabilidad),
      ),
    );
  }

  checkEgresoDuplicado(numero: string): Observable<{ existe: boolean; registro?: RegistroContable }> {
    return this.http.get<{ existe: boolean; registro?: RegistroContable }>(
      `${this.baseUrl}/check-egreso`,
      { params: { numero } }
    ).pipe(catchError(() => of({ existe: false })));
  }

  getSolicitudesViaticosContabilidad(): Observable<SolicitudViaticosContabilidad[]> {
    return this.http
      .get<SolicitudViaticosContabilidad[]>(
        `${environment.apiUrl}/tesoreria/viaticos/contabilidad-bandeja`,
      )
      .pipe(catchError(() => of([])));
  }

  getSolicitudViaticosById(id: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/tesoreria/viaticos/${id}`);
  }

  analyzeEgresoDocument(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${environment.apiUrl}/v1/textract/upload-and-analyze`, formData);
  }

  tramitarSolicitudViaticosContabilidad(
    id: number,
    payload: {
      numeroOrdenEgreso: string;
      montoDesembolsoAprobado: number;
      confirmarDiferenciaMonto?: boolean;
      respuestaContabilidad: string;
      observacionesContabilidad?: string;
    },
    itemSupportFiles?: Record<number, File | null>,
  ): Observable<any> {
    const formData = new FormData();
    formData.append(
      'payload',
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    );

    Object.entries(itemSupportFiles ?? {}).forEach(([index, file]) => {
      if (file) {
        formData.append(`itemRespuestaSoporte_${index}`, file);
      }
    });

    return this.http.put<any>(
      `${environment.apiUrl}/tesoreria/viaticos/${id}/tramitar-contabilidad`,
      formData,
    );
  }

  // ── Cuentas Contables Parametrizadas ──
  getCuentasContables(): CuentaContableParam[] {
    return CUENTAS_CONTABLES_CATALOGO.filter((c) => c.activa);
  }

  getCuentaContableByCodigo(codigo: string): CuentaContableParam | undefined {
    return CUENTAS_CONTABLES_CATALOGO.find((c) => c.codigo === codigo);
  }

  buscarCuentasContables(termino: string): CuentaContableParam[] {
    const term = termino.toLowerCase();
    return CUENTAS_CONTABLES_CATALOGO.filter(
      (c) =>
        c.activa &&
        (c.codigo.includes(term) || c.nombre.toLowerCase().includes(term)),
    );
  }
}
