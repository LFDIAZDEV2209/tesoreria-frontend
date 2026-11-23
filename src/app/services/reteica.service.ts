import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  ReteicaTarifaRequest,
  ReteicaTarifaResponse,
} from '../models/reteica.models';

@Injectable({ providedIn: 'root' })
export class ReteicaService {
  private readonly baseUrl = `${environment.apiUrl}/reteica`;

  constructor(private http: HttpClient) {}

  // ═══════════════════════════════════════════════════
  //  CONSULTAS DE TARIFAS
  // ═══════════════════════════════════════════════════

  getTarifasVigentes(): Observable<ReteicaTarifaResponse[]> {
    return this.http.get<ReteicaTarifaResponse[]>(`${this.baseUrl}/tarifas`);
  }

  getTodasTarifas(): Observable<ReteicaTarifaResponse[]> {
    return this.http.get<ReteicaTarifaResponse[]>(
      `${this.baseUrl}/tarifas/todas`,
    );
  }

  getTarifaById(id: number): Observable<ReteicaTarifaResponse> {
    return this.http.get<ReteicaTarifaResponse>(
      `${this.baseUrl}/tarifas/${id}`,
    );
  }

  getTarifasByAnio(anio: number): Observable<ReteicaTarifaResponse[]> {
    return this.http.get<ReteicaTarifaResponse[]>(
      `${this.baseUrl}/tarifas/anio/${anio}`,
    );
  }

  getTarifasByMunicipio(
    municipio: string,
  ): Observable<ReteicaTarifaResponse[]> {
    const params = new HttpParams().set('q', municipio);
    return this.http.get<ReteicaTarifaResponse[]>(
      `${this.baseUrl}/tarifas/municipio`,
      { params },
    );
  }

  getTarifasByMunicipioAndAnio(
    municipio: string,
    anio: number,
  ): Observable<ReteicaTarifaResponse[]> {
    return this.http.get<ReteicaTarifaResponse[]>(
      `${this.baseUrl}/tarifas/municipio/${municipio}/anio/${anio}`,
    );
  }

  getTarifasByDepartamento(
    departamento: string,
  ): Observable<ReteicaTarifaResponse[]> {
    const params = new HttpParams().set('q', departamento);
    return this.http.get<ReteicaTarifaResponse[]>(
      `${this.baseUrl}/tarifas/departamento`,
      { params },
    );
  }

  // ═══════════════════════════════════════════════════
  //  CATÁLOGOS (para dropdowns / autocomplete)
  // ═══════════════════════════════════════════════════

  getMunicipios(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/municipios`);
  }

  getDepartamentos(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/departamentos`);
  }

  getAniosDisponibles(): Observable<number[]> {
    return this.http.get<number[]>(`${this.baseUrl}/anios`);
  }

  // ═══════════════════════════════════════════════════
  //  CRUD DE TARIFAS
  // ═══════════════════════════════════════════════════

  createTarifa(
    tarifa: ReteicaTarifaRequest,
  ): Observable<ReteicaTarifaResponse> {
    return this.http.post<ReteicaTarifaResponse>(
      `${this.baseUrl}/tarifas`,
      tarifa,
    );
  }

  updateTarifa(
    id: number,
    tarifa: ReteicaTarifaRequest,
  ): Observable<ReteicaTarifaResponse> {
    return this.http.put<ReteicaTarifaResponse>(
      `${this.baseUrl}/tarifas/${id}`,
      tarifa,
    );
  }

  deleteTarifa(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/tarifas/${id}`);
  }

  // ═══════════════════════════════════════════════════
  //  GESTIÓN DE VIGENCIA
  // ═══════════════════════════════════════════════════

  establecerAnioVigente(anio: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/vigencia/${anio}`, {});
  }

  // ═══════════════════════════════════════════════════
  //  ASOCIACIÓN CON PROVEEDORES
  // ═══════════════════════════════════════════════════

  asignarTarifaAProveedor(
    proveedorId: number,
    tarifaId: number,
  ): Observable<void> {
    return this.http.put<void>(
      `${this.baseUrl}/proveedores/${proveedorId}/tarifa/${tarifaId}`,
      {},
    );
  }

  desasociarTarifaDeProveedor(proveedorId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/proveedores/${proveedorId}/tarifa`,
    );
  }

  // ═══════════════════════════════════════════════════
  //  UTILIDAD: Cálculo local de ReteICA
  // ═══════════════════════════════════════════════════

  calcularReteicaLocal(valorPago: number, tarifaPorMil: number): number {
    return valorPago * (tarifaPorMil / 1000);
  }
}
