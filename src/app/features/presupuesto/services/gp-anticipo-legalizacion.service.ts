import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Legalización de anticipos de meses anteriores (módulo Anticipos del Gestor):
 * registra el comprobante con el que el proveedor soporta el anticipo y lo
 * deja consultable. Es una capacidad sólo del backend Java (/api/gp): el valor
 * legalizado se descuenta del saldo del anticipo en el presupuesto.
 *
 * Tipos locales a propósito: no tocan models/presupuesto.model.ts ni gp-mapper.
 */
const GP = environment.gpApiUrl;

export interface LegalizacionAnticipo {
  id: number;
  movimientoId: number;
  nit: string;
  nombreTercero: string | null;
  /** Mes del anticipo (YYYY-MM). */
  periodo: string | null;
  valorLegalizado: number | null;
  observacion: string | null;
  archivoNombre: string | null;
  archivoTipo: string | null;
  archivoBytes: number | null;
  creadoPor: string | null;
  creadoEn: string | null;
  /** La anulación conserva el registro: el comprobante sigue consultable. */
  anulada: boolean;
  motivoAnulacion: string | null;
  anuladoPor: string | null;
  anuladoEn: string | null;
}

/** Anticipo de cualquier mes con el estado de su legalización (repositorio). */
export interface AnticipoLegalizadoFila {
  movimientoId: number;
  periodo: string | null;
  nit: string | null;
  nombre: string | null;
  comprobante: string | null;
  fecha: string | null;
  saldo: number;
  categoria: string | null;
  total: number;
  vigentes: number;
  anuladas: number;
  ultimaLegalizacion: string | null;
}

/** Totales del filtro base del repositorio (sin el estado). */
export interface ResumenLegalizacionAnticipos {
  total: number;
  legalizados: number;
  pendientes: number;
  saldoLegalizado: number;
  saldoPendiente: number;
  valorLegalizado: number;
}

export interface RepositorioAnticiposLegalizados {
  content: AnticipoLegalizadoFila[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  /** Catálogo de meses con anticipos, para los selectores del filtro. */
  periodos: string[];
  resumen: ResumenLegalizacionAnticipos;
}

export type EstadoLegalizacionFiltro = 'todos' | 'legalizados' | 'pendientes';

export interface FiltrosRepositorioLegalizaciones {
  texto?: string;
  desde?: string;
  hasta?: string;
  estado?: EstadoLegalizacionFiltro;
  page?: number;
  size?: number;
}

@Injectable({ providedIn: 'root' })
export class GpAnticipoLegalizacionService {

  constructor(private http: HttpClient) {}

  /** Legalizaciones de los movimientos visibles (o todas las del workspace). */
  listar(empresaId: number, movimientoIds?: number[]): Observable<LegalizacionAnticipo[]> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (movimientoIds && movimientoIds.length) {
      params = params.set('movimientoIds', movimientoIds.join(','));
    }
    return this.http.get<LegalizacionAnticipo[]>(`${GP}/anticipos/legalizaciones`, { params });
  }

  /** Legalizaciones de un tercero (panel "Legalizado" del presupuesto). */
  listarPorNit(empresaId: number, nit: string): Observable<LegalizacionAnticipo[]> {
    const params = new HttpParams().set('empresaId', empresaId).set('nit', nit);
    return this.http.get<LegalizacionAnticipo[]>(`${GP}/anticipos/legalizaciones`, { params });
  }

  /**
   * Repositorio "Anticipos legalizados": anticipos de TODOS los meses con el
   * estado de su legalización, filtrable por proveedor/comprobante, rango de
   * meses y estado. El mismo endpoint alimenta la decisión de qué anticipo de
   * un mes anterior legalizar.
   */
  repositorio(empresaId: number, filtros: FiltrosRepositorioLegalizaciones = {}): Observable<RepositorioAnticiposLegalizados> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (filtros.texto?.trim()) params = params.set('texto', filtros.texto.trim());
    if (filtros.desde) params = params.set('desde', filtros.desde);
    if (filtros.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros.estado && filtros.estado !== 'todos') params = params.set('estado', filtros.estado);
    params = params.set('page', String(filtros.page ?? 0)).set('size', String(filtros.size ?? 20));
    return this.http.get<RepositorioAnticiposLegalizados>(`${GP}/anticipos/legalizaciones/repositorio`, { params });
  }

  /** Registra el comprobante de legalización de un anticipo. */
  registrar(empresaId: number, movimientoId: number, archivo: File,
            valorLegalizado: number | null, observacion: string | null): Observable<LegalizacionAnticipo> {
    const form = new FormData();
    form.append('archivo', archivo);
    let params = new HttpParams()
      .set('empresaId', empresaId)
      .set('movimientoId', movimientoId);
    if (valorLegalizado != null) params = params.set('valorLegalizado', String(valorLegalizado));
    if (observacion && observacion.trim()) params = params.set('observacion', observacion.trim());
    return this.http.post<LegalizacionAnticipo>(`${GP}/anticipos/legalizaciones`, form, { params });
  }

  /** Bytes del comprobante servidos por el backend (stream): evita la presigned URL que falla por bucket policy. */
  contenidosArchivo(empresaId: number, id: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${GP}/anticipos/legalizaciones/${id}/archivo/contenido`,
      { params: new HttpParams().set('empresaId', empresaId), responseType: 'blob', observe: 'response' });
  }

  /** Quita definitivamente el registro y su comprobante del almacenamiento. */
  quitar(empresaId: number, id: number): Observable<void> {
    return this.http.delete<void>(`${GP}/anticipos/legalizaciones/${id}`,
      { params: new HttpParams().set('empresaId', empresaId) });
  }
}
