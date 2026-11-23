import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { PageResponse } from '../models/presupuesto.model';
import { Historico, HistoricoComparacion, HistoricoConsulta } from '../models/historico.model';

@Injectable({providedIn: 'root'})
export class HistoricosService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.gpApiUrl + '/historicos';
  listar(empresaId: number, page = 0, size = 20, anio = '') {
    const params: Record<string, string | number> = {empresaId, page, size};
    if (anio) params['anio'] = anio;
    return this.http.get<PageResponse<Historico>>(this.url, {params});
  }
  consolidar(empresaId: number, periodo: string) {
    return this.http.post<Historico>(this.url + '/consolidar', {periodo}, {params: {empresaId}});
  }
  consultar(empresaId: number, id: number) {
    return this.http.get<HistoricoConsulta>(this.url + '/' + id, {params: {empresaId}});
  }
  registros(empresaId: number, id: number, seccion: string, busqueda: string, page: number) {
    return this.http.get<PageResponse<Record<string, unknown>>>(this.url + '/' + id + '/registros', {params: {empresaId, seccion, busqueda, page, size: 20}});
  }
  comparar(empresaId: number, origen: string, destino: string, seccion: string, estado: string, busqueda: string, page: number) {
    return this.http.get<HistoricoComparacion>(this.url + '/comparar', {params: {empresaId, origen, destino, seccion, estado, busqueda, page, size: 20}});
  }
}
