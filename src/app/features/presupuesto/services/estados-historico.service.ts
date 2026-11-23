import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { HistoricoEstadosResponse } from '../models/estados-historico.model';

@Injectable({ providedIn: 'root' })
export class EstadosHistoricoService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.gpApiUrl + '/estados-historico';
  listar(empresaId: number, filtros: { periodo?: string; modulo?: string; estado?: string; tercero?: string; page: number; size: number }) {
    const params: Record<string, string | number> = { empresaId, page: filtros.page, size: filtros.size };
    if (filtros.periodo) params['periodo'] = filtros.periodo;
    if (filtros.modulo) params['modulo'] = filtros.modulo;
    if (filtros.estado) params['estado'] = filtros.estado;
    if (filtros.tercero) params['tercero'] = filtros.tercero;
    return this.http.get<HistoricoEstadosResponse>(this.url, { params });
  }
}
