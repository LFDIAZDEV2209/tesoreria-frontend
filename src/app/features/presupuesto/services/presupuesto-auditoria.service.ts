import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface RegistroAuditoria {
  id: number;
  empresaId: number | null;
  usuarioId: number | null;
  accion: string;
  entidad?: string | null;
  detalle?: string | null;
  usuarioNombre?: string | null;
  createdAt?: string | null;
}

@Injectable({providedIn: 'root'})
export class PresupuestoAuditoriaService {
  private readonly http = inject(HttpClient);
  /** Sin paginado. El servidor limita el acceso; el cliente también filtra si ignora estos parámetros. */
  listar(empresaId: number, filtros: {periodo?: string; usuario?: string} = {}): Observable<RegistroAuditoria[]> {
    let params = new HttpParams().set('empresaId', empresaId);
    if (filtros.periodo?.trim()) params = params.set('periodo', filtros.periodo.trim());
    if (filtros.usuario?.trim()) params = params.set('usuario', filtros.usuario.trim());
    return this.http.get<RegistroAuditoria[]>(`${environment.apiUrl}/presupuesto/auditoria`, {params});
  }
}
