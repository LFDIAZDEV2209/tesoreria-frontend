import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../../../../environments/environment';
import {
  EventoPago,
  EstadoEventoPago,
  TipoCalendario,
} from '../models/calendario-pagos.model';
import { RegistroContable } from '../../../../../features/contabilidad/models/contabilidad.model';

/** Interfaz del DTO que devuelve el backend para movimientos diarios */
interface MovimientoDiarioPagoDTO {
  id: number;
  bancoId: number;
  fecha: string;
  banco: string;
  ultimosDigitos: string;
  empresaUt: string;
  saldoInicial: number;
  ingresosCliente: number;
  ingresosArl: number;
  otrosIngresos: number;
  totalIngresos: number;
  nEgreso: string;
  pagoProveedores: number;
  pagoPresupuesto: number;
  pagosNominas: number;
  rechazos: number;
  gastosBancarios: number;
  totalEgresos: number;
  saldoFinal: number;
  observaciones: string;
  tipoOrigen: string;
  solicitudId: number | null;
  comprobantesJson: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarioPagosService {
  private contabilidadUrl = `${environment.apiUrl}/contabilidad`;
  private tesoreriaUrl = `${environment.apiUrl}/tesoreria`;

  constructor(private http: HttpClient) {}

  /**
   * Obtiene eventos de pagos programados (desde registros contables con fecha estimada de pago,
   * estados que NO sean PAGADO ni DEVUELTO)
   */
  getPagosProgramados(): Observable<EventoPago[]> {
    return this.http.get<RegistroContable[]>(this.contabilidadUrl).pipe(
      map((registros) =>
        registros
          .filter(
            (r) =>
              r.fechaEstimadaPago &&
              r.estado !== 'DEVUELTO' &&
              r.estado !== 'PAGADO'
          )
          .map((r) => this.mapRegistroToEvento(r, 'PROGRAMADOS'))
      ),
      catchError(() => of([]))
    );
  }

  /**
   * Obtiene pagos realizados — movimientos diarios de pago (egresos).
   * Fuente: tabla movimiento_diario_pago (control diario de pagos).
   */
  getPagosRealizados(
    fechaDesde?: string,
    fechaHasta?: string,
    banco?: string,
    observaciones?: string
  ): Observable<EventoPago[]> {
    let params = new HttpParams();
    if (fechaDesde) params = params.set('fechaDesde', fechaDesde);
    if (fechaHasta) params = params.set('fechaHasta', fechaHasta);
    if (banco) params = params.set('banco', banco);
    if (observaciones) params = params.set('observaciones', observaciones);

    return this.http
      .get<MovimientoDiarioPagoDTO[]>(`${this.tesoreriaUrl}/movimientos-diario-pago-todos`, { params })
      .pipe(
        map((movimientos) =>
          movimientos
            .filter((m) => m.totalEgresos > 0 || m.totalIngresos > 0)
            .map((m) => this.mapMovimientoDiarioToEvento(m))
        ),
        catchError(() => of([]))
      );
  }

  /**
   * Obtiene todos los eventos combinados con filtros opcionales para realizados
   */
  getTodosLosEventos(filtros?: {
    fechaDesde?: string;
    fechaHasta?: string;
    banco?: string;
    observaciones?: string;
  }): Observable<{ programados: EventoPago[]; realizados: EventoPago[] }> {
    return forkJoin({
      programados: this.getPagosProgramados(),
      realizados: this.getPagosRealizados(
        filtros?.fechaDesde,
        filtros?.fechaHasta,
        filtros?.banco,
        filtros?.observaciones
      ),
    });
  }

  /**
   * Obtiene los nombres de bancos que tienen movimientos.
   */
  getBancosDisponibles(): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.tesoreriaUrl}/movimientos-diario-pago-todos/bancos`)
      .pipe(catchError(() => of([])));
  }

  /**
   * Obtiene las URLs de comprobantes de un movimiento diario.
   */
  getComprobantes(movimientoId: number): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.tesoreriaUrl}/movimientos-diario-pago/${movimientoId}/comprobantes`)
      .pipe(catchError(() => of([])));
  }

  /**
   * Guarda un pago programado manualmente desde el calendario
   */
  guardarPagoProgramado(evento: EventoPago): Observable<EventoPago> {
    return this.http.post<EventoPago>(`${this.contabilidadUrl}/programar-pago`, {
      fecha: evento.fecha,
      monto: evento.monto,
      proveedorNombre: evento.proveedorNombre,
      proveedorNit: evento.proveedorNit,
      observaciones: evento.observaciones,
    }).pipe(
      catchError(() => of(evento))
    );
  }

  // ── Mappers ──

  private mapRegistroToEvento(r: RegistroContable, tipo: TipoCalendario): EventoPago {
    const fechaPago = tipo === 'VISTO_BUENO'
      ? (r.fechaEstimadaPago || r.fechaActualizacion?.substring(0, 10) || r.fechaCreacion?.substring(0, 10) || '')
      : r.fechaEstimadaPago;

    return {
      id: r.id || 0,
      titulo: `${r.tipoDocumento === 'FACTURA_ELECTRONICA' ? 'Factura' : r.tipoDocumento === 'CUENTA_COBRO' ? 'Cuenta de Cobro' : 'Doc.'} ${r.numeroDocumento}`,
      fecha: fechaPago,
      monto: r.valorNetoPagar,
      proveedorNombre: r.proveedorNombre || r.proveedorTercero || 'Sin proveedor',
      proveedorNit: r.nitIdentificacion,
      numeroDocumento: r.numeroDocumento,
      ordenCompra: r.ordenCompra,
      estado: this.mapEstadoContableToEventoPago(r.estado),
      tipo,
      registroContableId: r.id,
      formaPago: r.formaPago,
      observaciones: r.observaciones,
      creadoPor: r.creadoPor,
      fechaCreacion: r.fechaCreacion,
    };
  }

  private mapMovimientoDiarioToEvento(m: MovimientoDiarioPagoDTO): EventoPago {
    // Build a descriptive title
    const parts: string[] = [];
    if (m.pagoProveedores > 0) parts.push('Proveedores');
    if (m.pagoPresupuesto > 0) parts.push('Presupuesto');
    if (m.pagosNominas > 0) parts.push('Nóminas');
    if (m.gastosBancarios > 0) parts.push('Gastos Bancarios');
    if (m.rechazos > 0) parts.push('Rechazos');
    if (m.totalIngresos > 0 && m.totalEgresos === 0) parts.push('Ingresos');
    const titulo = parts.length > 0
      ? `${m.banco} — ${parts.join(', ')}`
      : `${m.banco} — Movimiento`;

    // Parse comprobantes
    let comprobantesUrls: string[] = [];
    if (m.comprobantesJson) {
      try {
        comprobantesUrls = JSON.parse(m.comprobantesJson);
      } catch { /* ignore */ }
    }

    return {
      id: m.id,
      titulo,
      fecha: m.fecha,
      monto: m.totalEgresos > 0 ? m.totalEgresos : m.totalIngresos,
      proveedorNombre: m.observaciones || m.empresaUt || m.banco,
      estado: 'PAGADO',
      tipo: 'VISTO_BUENO',
      bancoNombre: m.banco,
      bancoId: m.bancoId,
      comprobantesUrls,
      totalIngresos: m.totalIngresos,
      totalEgresos: m.totalEgresos,
      movimientoDiarioId: m.id,
      observaciones: m.observaciones,
      creadoPor: m.tipoOrigen === 'AUTOMATICO' ? 'Sistema (Auto)' : 'Manual',
      fechaCreacion: m.createdAt,
      formaPago: m.nEgreso || undefined,
    };
  }

  private mapEstadoContableToEventoPago(estado: string): EstadoEventoPago {
    switch (estado) {
      case 'PROGRAMADO_PAGO':
        return 'PROGRAMADO';
      case 'PAGADO':
        return 'PAGADO';
      case 'DEVUELTO':
        return 'CANCELADO';
      default:
        return 'PENDIENTE';
    }
  }
}
