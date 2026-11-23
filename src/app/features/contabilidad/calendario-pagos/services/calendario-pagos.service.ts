import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import {
  EventoPago,
  EstadoEventoPago,
  TipoCalendario,
} from '../models/calendario-pagos.model';
import { RegistroContable } from '../../models/contabilidad.model';
import { TramiteRequisicion } from '../../../compras/tramitar-requisicion/models/tramitar-requisicion.model';

@Injectable({ providedIn: 'root' })
export class CalendarioPagosService {
  private contabilidadUrl = `${environment.apiUrl}/contabilidad`;
  private tramitesUrl = `${environment.apiUrl}/tramites-requisicion`;

  constructor(private http: HttpClient) {}

  /**
   * Obtiene eventos de pagos programados (desde registros contables con fecha estimada de pago)
   */
  getPagosProgramados(): Observable<EventoPago[]> {
    return this.http.get<RegistroContable[]>(this.contabilidadUrl).pipe(
      map((registros) =>
        registros
          .filter(
            (r) =>
              r.fechaEstimadaPago &&
              r.estado !== 'DEVUELTO'
          )
          .map((r) => this.mapRegistroToEvento(r))
      ),
      catchError(() => of([]))
    );
  }

  /**
   * Obtiene pagos derivados de OC aprobadas con visto bueno del jefe de compras.
   * Filtra trámites cancelados/rechazados automáticamente.
   */
  getPagosVistoBueno(): Observable<EventoPago[]> {
    return this.http.get<TramiteRequisicion[]>(this.tramitesUrl).pipe(
      map((tramites) =>
        tramites
          .filter(
            (t) =>
              t.vistoBuenoJefe &&
              (t.vistoBuenoJefe.estado === 'APROBADO' ||
                t.vistoBuenoJefe.estado === 'ACEPTADO_CON_NOVEDAD') &&
              t.estadoTramite !== 'RECHAZADO_JEFE'
          )
          .flatMap((t) => this.mapTramiteToEventos(t))
      ),
      catchError(() => of([]))
    );
  }

  /**
   * Obtiene todos los eventos combinados
   */
  getTodosLosEventos(): Observable<{ programados: EventoPago[]; vistoBueno: EventoPago[] }> {
    return forkJoin({
      programados: this.getPagosProgramados(),
      vistoBueno: this.getPagosVistoBueno(),
    });
  }

  // ── Mappers ──

  private mapRegistroToEvento(r: RegistroContable): EventoPago {
    return {
      id: r.id || 0,
      titulo: `${r.tipoDocumento === 'FACTURA_ELECTRONICA' ? 'Factura' : r.tipoDocumento === 'CUENTA_COBRO' ? 'Cuenta de Cobro' : 'Doc.'} ${r.numeroDocumento}`,
      fecha: r.fechaEstimadaPago,
      monto: r.valorNetoPagar,
      proveedorNombre: r.proveedorNombre || r.proveedorTercero || 'Sin proveedor',
      proveedorNit: r.nitIdentificacion,
      numeroDocumento: r.numeroDocumento,
      ordenCompra: r.ordenCompra,
      estado: this.mapEstadoContableToEventoPago(r.estado),
      tipo: 'PROGRAMADOS',
      registroContableId: r.id,
      formaPago: r.formaPago,
      observaciones: r.observaciones,
      creadoPor: r.creadoPor,
      fechaCreacion: r.fechaCreacion,
    };
  }

  private mapTramiteToEventos(t: TramiteRequisicion): EventoPago[] {
    const eventos: EventoPago[] = [];
    const isCancelado =
      t.estadoTramite === 'RECHAZADO_JEFE';

    for (const oc of t.ordenesCargadas) {
      // Si la OC tiene fechas de pago a crédito, crear un evento por cada fecha
      if (oc.tipoPago === 'CREDITO' && oc.creditoFechasPago && oc.creditoFechasPago.length > 0) {
        for (const cuota of oc.creditoFechasPago) {
          eventos.push({
            id: t.id || 0,
            titulo: `OC ${oc.numeroOC} — Cuota`,
            fecha: cuota.fechaPago,
            monto: cuota.monto || oc.valorTotal / oc.creditoFechasPago!.length,
            proveedorNombre: oc.proveedor || 'Sin proveedor',
            proveedorNit: oc.nitProveedor,
            numeroDocumento: oc.numeroOC,
            ordenCompra: oc.numeroOC,
            estado: isCancelado ? 'CANCELADO' : this.determinarEstadoFecha(cuota.fechaPago),
            tipo: 'VISTO_BUENO',
            tramiteId: t.id,
            solicitudCompraId: t.solicitudCompraId,
            observaciones: cuota.observacion,
            creadoPor: t.requisicion?.solicitante,
            fechaCreacion: t.fechaCreacion,
          });
        }
      } else {
        // Pago único — usar fecha de emisión + condiciones de pago
        const fechaPago = oc.fechaEmision || new Date().toISOString().slice(0, 10);
        eventos.push({
          id: t.id || 0,
          titulo: `OC ${oc.numeroOC}`,
          fecha: fechaPago,
          monto: oc.valorTotal,
          proveedorNombre: oc.proveedor || 'Sin proveedor',
          proveedorNit: oc.nitProveedor,
          numeroDocumento: oc.numeroOC,
          ordenCompra: oc.numeroOC,
          estado: isCancelado ? 'CANCELADO' : this.determinarEstadoFecha(fechaPago),
          tipo: 'VISTO_BUENO',
          tramiteId: t.id,
          solicitudCompraId: t.solicitudCompraId,
          creadoPor: t.requisicion?.solicitante,
          fechaCreacion: t.fechaCreacion,
        });
      }
    }

    return eventos;
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

  private determinarEstadoFecha(fechaStr: string): EstadoEventoPago {
    if (!fechaStr) return 'PENDIENTE';
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fechaStr + 'T00:00:00');
    if (fecha < hoy) return 'VENCIDO';
    return 'PROGRAMADO';
  }
}
