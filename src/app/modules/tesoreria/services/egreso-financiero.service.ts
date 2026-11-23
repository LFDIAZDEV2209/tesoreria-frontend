import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
export interface SoporteFinanciero { id: number; estado: string; nombre: string; diferencias: string; bancoId: number | null; fecha: string; referencia: string; montoOk?: boolean | null; cuentaOk?: boolean | null; beneficiarioOk?: boolean | null; descripcionOk?: boolean | null; valorExtraido?: number | null; valorEsperado?: number | null; bancoExtraido?: string | null; cuentaExtraida?: string | null; beneficiarioExtraido?: string | null; fechaExtraida?: string | null; referenciaExtraida?: string | null; }
export interface EstadoFinanciero { egresoId: number; pagoId: number; empresaId: number; estado: string; movimientoId: number | null; conciliacionId: number | null; comprobanteId: number | null; comprobantes: SoporteFinanciero[]; }
export interface CuentaFinanciera { id: number; empresaId: number; banco: string; numeroCuenta: string; titular: string; }
@Injectable({providedIn: 'root'})
export class EgresoFinancieroService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/tesoreria/egresos-registrados`;
  estado(id: number) { return this.http.get<EstadoFinanciero>(`${this.base}/${id}/financiero`); }
  cuentas(empresaId: number) { return this.http.get<CuentaFinanciera[]>(`${this.base}/cuentas`, {params: {empresaId}}); }
  adjuntar(id: number, archivo: File) {
    const datos = new FormData(); datos.append('archivo', archivo);
    return this.http.post<SoporteFinanciero>(`${this.base}/${id}/comprobantes`, datos, {observe: 'events', reportProgress: true});
  }
  pagar(id: number, comprobanteId: number, bancoId?: number | null) { return this.http.post<EstadoFinanciero>(`${this.base}/${id}/pagar`, {comprobanteId, bancoId: bancoId ?? null}); }
  conciliar(id: number, movimientoId: number, fecha: string, referencia: string, importe: number) {
    return this.http.post<EstadoFinanciero>(`${this.base}/${id}/conciliar`, {movimientoId, fecha, referencia, importe});
  }
  anular(id: number, comprobanteId: number, motivo: string) { return this.http.post<void>(`${this.base}/${id}/comprobantes/${comprobanteId}/anular`, {motivo}); }
  descargar(id: number, comprobanteId: number) { return this.http.get<{url: string}>(`${this.base}/${id}/comprobantes/${comprobanteId}/descargar`); }
}
