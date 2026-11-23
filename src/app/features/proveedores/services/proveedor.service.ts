import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Proveedor, StatsProveedores } from '../models/proveedor.model';

@Injectable({ providedIn: 'root' })
export class ProveedorService {

  private baseUrl = `${environment.apiUrl}/proveedores`;
  private headers = new HttpHeaders({ 'Content-Type': 'application/json' });

  constructor(private http: HttpClient) {}

  getProveedores(): Observable<Proveedor[]> {
    return this.http.get<Proveedor[]>(this.baseUrl).pipe(
      catchError(() => of([]))
    );
  }

  getProveedorById(id: number): Observable<Proveedor> {
    return this.http.get<Proveedor>(`${this.baseUrl}/${id}`);
  }

  searchProveedores(nombre: string): Observable<Proveedor[]> {
    return this.http.get<Proveedor[]>(`${this.baseUrl}/search`, {
      params: { nombre }
    });
  }

  /** Proveedor por NIT (incluye datos bancarios). Null si no existe. */
  buscarPorNit(nit: string): Observable<Proveedor | null> {
    return this.http.get<Proveedor>(`${this.baseUrl}/buscar-por-nit`, {
      params: { nit }
    }).pipe(catchError(() => of(null)));
  }

  createProveedor(proveedor: any, archivos: { rut?: File; camaraComercio?: File; ccRepresentante?: File; certificadoBancario?: File; rutRepresentante?: File; estadosFinancieros?: File }): Observable<Proveedor> {
    const formData = new FormData();
    formData.append('proveedor', new Blob([JSON.stringify(proveedor)], { type: 'application/json' }));

    if (archivos.rut) {
      formData.append('rut', archivos.rut);
    }
    if (archivos.camaraComercio) {
      formData.append('camaraComercio', archivos.camaraComercio);
    }
    if (archivos.ccRepresentante) {
      formData.append('ccRepresentante', archivos.ccRepresentante);
    }
    if (archivos.certificadoBancario) {
      formData.append('certificadoBancario', archivos.certificadoBancario);
    }
    if (archivos.rutRepresentante) {
      formData.append('rutRepresentante', archivos.rutRepresentante);
    }
    if (archivos.estadosFinancieros) {
      formData.append('estadosFinancieros', archivos.estadosFinancieros);
    }

    return this.http.post<Proveedor>(this.baseUrl, formData);
  }

  updateProveedor(id: number, proveedor: any, archivos: { rut?: File; camaraComercio?: File; ccRepresentante?: File; certificadoBancario?: File; rutRepresentante?: File; estadosFinancieros?: File }): Observable<Proveedor> {
    const formData = new FormData();
    formData.append('proveedor', new Blob([JSON.stringify(proveedor)], { type: 'application/json' }));

    if (archivos.rut) {
      formData.append('rut', archivos.rut);
    }
    if (archivos.camaraComercio) {
      formData.append('camaraComercio', archivos.camaraComercio);
    }
    if (archivos.ccRepresentante) {
      formData.append('ccRepresentante', archivos.ccRepresentante);
    }
    if (archivos.certificadoBancario) {
      formData.append('certificadoBancario', archivos.certificadoBancario);
    }
    if (archivos.rutRepresentante) {
      formData.append('rutRepresentante', archivos.rutRepresentante);
    }
    if (archivos.estadosFinancieros) {
      formData.append('estadosFinancieros', archivos.estadosFinancieros);
    }

    return this.http.put<Proveedor>(`${this.baseUrl}/${id}`, formData);
  }

  toggleEstado(id: number): Observable<Proveedor> {
    return this.http.patch<Proveedor>(`${this.baseUrl}/${id}/toggle-estado`, {});
  }

  deleteProveedor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  getStats(): Observable<StatsProveedores> {
    return this.http.get<StatsProveedores>(`${this.baseUrl}/stats`).pipe(
      catchError(() => of({ totalProveedores: 0, proveedoresActivos: 0, proveedoresInactivos: 0, proveedoresMes: 0 }))
    );
  }
}
