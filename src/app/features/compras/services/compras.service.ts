import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { SolicitudCompra, StatsCompras } from '../models/compra.model';

@Injectable({
  providedIn: 'root'
})
export class ComprasService {

  private readonly baseUrl = `${environment.apiUrl}/compras`;
  private readonly httpOptions = {
    headers: new HttpHeaders({ 'Content-Type': 'application/json' })
  };

  constructor(private http: HttpClient) {}

  // ========================
  // Solicitudes de compra
  // ========================

  getSolicitudes(): Observable<SolicitudCompra[]> {
    return this.http.get<SolicitudCompra[]>(this.baseUrl, this.httpOptions).pipe(
      catchError((err) => {
        console.error('Error loading solicitudes from backend:', err);
        return of([]);
      })
    );
  }

  getSolicitudById(id: number): Observable<SolicitudCompra> {
    return this.http.get<SolicitudCompra>(`${this.baseUrl}/${id}`, this.httpOptions);
  }

  updateEstado(id: number, estado: string): Observable<SolicitudCompra> {
    return this.http.patch<SolicitudCompra>(`${this.baseUrl}/${id}/estado`, { estado }, this.httpOptions);
  }

  // ========================
  // Stats
  // ========================

  getStats(): Observable<StatsCompras> {
    return this.http.get<StatsCompras>(`${this.baseUrl}/stats`, this.httpOptions).pipe(
      catchError((err) => {
        console.error('Error loading stats from backend:', err);
        return of({
          totalSolicitudes: 0,
          pendientes: 0,
          realizadas: 0,
          enTramite: 0,
          promedioSla: 0,
          areasMasActivas: 0
        });
      })
    );
  }

  // ========================
  // Mock / Fallback data
  // ========================

  private getMockStats(): StatsCompras {
    return {
      totalSolicitudes: 47,
      pendientes: 12,
      realizadas: 28,
      enTramite: 7,
      promedioSla: 8.4,
      areasMasActivas: 6
    };
  }

  getMockSolicitudes(): SolicitudCompra[] {
    return [
      { id: 1, codigoSolicitud: 'S-001', fechaSolicitud: '15/01/2026', solicitante: 'Pepo Pérez', areaSolicitante: 'R. Humanos', diasTranscurridos: 3, slaDias: 10, estado: 'PENDIENTE' },
      { id: 2, codigoSolicitud: 'S-002', fechaSolicitud: '16/01/2026', solicitante: 'María López', areaSolicitante: 'Contabilidad', diasTranscurridos: 1, slaDias: 8, estado: 'REALIZADO' },
      { id: 3, codigoSolicitud: 'S-003', fechaSolicitud: '17/01/2026', solicitante: 'Juan García', areaSolicitante: 'Producción', diasTranscurridos: 7, slaDias: 5, estado: 'TRAMITE' },
      { id: 4, codigoSolicitud: 'S-004', fechaSolicitud: '18/01/2026', solicitante: 'Ana Martínez', areaSolicitante: 'Logística', diasTranscurridos: 2, slaDias: 10, estado: 'PENDIENTE' },
      { id: 5, codigoSolicitud: 'S-005', fechaSolicitud: '19/01/2026', solicitante: 'Carlos Ruiz', areaSolicitante: 'Administración', diasTranscurridos: 9, slaDias: 10, estado: 'TRAMITE' },
      { id: 6, codigoSolicitud: 'S-006', fechaSolicitud: '20/01/2026', solicitante: 'Laura Gómez', areaSolicitante: 'Comercial', diasTranscurridos: 4, slaDias: 12, estado: 'REALIZADO' },
      { id: 7, codigoSolicitud: 'S-007', fechaSolicitud: '21/01/2026', solicitante: 'Roberto Díaz', areaSolicitante: 'Sistemas', diasTranscurridos: 11, slaDias: 10, estado: 'PENDIENTE' },
      { id: 8, codigoSolicitud: 'S-008', fechaSolicitud: '22/01/2026', solicitante: 'Sandra Torres', areaSolicitante: 'Tesorería', diasTranscurridos: 1, slaDias: 7, estado: 'REALIZADO' },
      { id: 9, codigoSolicitud: 'S-009', fechaSolicitud: '23/01/2026', solicitante: 'Diego Herrera', areaSolicitante: 'R. Humanos', diasTranscurridos: 5, slaDias: 8, estado: 'TRAMITE' },
      { id: 10, codigoSolicitud: 'S-010', fechaSolicitud: '24/01/2026', solicitante: 'Patricia Vargas', areaSolicitante: 'Producción', diasTranscurridos: 0, slaDias: 10, estado: 'PENDIENTE' },
    ];
  }
}
