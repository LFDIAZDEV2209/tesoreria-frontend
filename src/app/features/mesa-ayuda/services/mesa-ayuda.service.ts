import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  TicketMesaAyuda,
  TicketAccion,
  StatsMesaAyuda,
  SolicitudTesoreria,
} from '../../tesoreria/models/solicitud.model';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MesaAyudaService {
  private readonly apiUrl = `${environment.apiUrl}/tesoreria`;

  constructor(private http: HttpClient) {}

  // ═══ ESTADÍSTICAS ═══
  getStats(): Observable<StatsMesaAyuda> {
    return this.getAllTickets().pipe(
      map((tickets) => {
        const ticketsPorTipo = new Map<string, number>();
        tickets.forEach((t) => {
          const tipo = t.tipoSolicitud || 'OTRO';
          ticketsPorTipo.set(tipo, (ticketsPorTipo.get(tipo) || 0) + 1);
        });

        return {
          totalTickets: tickets.length,
          ticketsAbiertos: tickets.filter((t) => t.estado === 'ABIERTO').length,
          ticketsEnProgreso: tickets.filter((t) => t.estado === 'EN_PROGRESO').length,
          ticketsResueltos: tickets.filter((t) => t.estado === 'RESUELTO' || t.estado === 'CERRADO').length,
          ticketsEscalados: tickets.filter((t) => t.estado === 'ESCALADO').length,
          promedioResolucionHoras: 0,
          ticketsPorNivel: {
            nivel1: tickets.filter((t) => t.nivel === 1).length,
            nivel2: tickets.filter((t) => t.nivel === 2).length,
            nivel3: tickets.filter((t) => t.nivel === 3).length,
          },
          ticketsPorUrgencia: {
            baja: tickets.filter((t) => t.urgencia === 'BAJA').length,
            media: tickets.filter((t) => t.urgencia === 'MEDIA').length,
            alta: tickets.filter((t) => t.urgencia === 'ALTA').length,
            critica: tickets.filter((t) => t.urgencia === 'CRITICA').length,
          },
          ticketsPorTipoSolicitud: Array.from(ticketsPorTipo.entries()).map(([tipo, cantidad]) => ({
            tipo,
            cantidad,
          })),
        } as StatsMesaAyuda;
      }),
    );
  }

  // ═══ TICKETS ═══
  getTicketsByNivel(nivel: 1 | 2 | 3): Observable<TicketMesaAyuda[]> {
    return this.getAllTickets().pipe(
      map((tickets) => tickets.filter((t) => t.nivel === nivel)),
    );
  }

  getAllTickets(): Observable<TicketMesaAyuda[]> {
    // Use backend filter to avoid loading all solicitudes
    return this.http.get<SolicitudTesoreria[]>(`${this.apiUrl}?tipo=MESA_AYUDA`).pipe(
      map((solicitudes) =>
        solicitudes
          .map((s) => this.toTicket(s))
          .sort((a, b) =>
            new Date(b.fechaCreacion || 0).getTime() -
            new Date(a.fechaCreacion || 0).getTime(),
          ),
      ),
      catchError(() => of([])),
    );
  }

  getTicketById(id: number): Observable<TicketMesaAyuda | undefined> {
    return this.getAllTickets().pipe(map((tickets) => tickets.find((t) => t.id === id)));
  }

  // ═══ ACCIONES SOBRE TICKETS ═══
  // ── Persiste los campos mutables del ticket en el backend ──────────
  private saveTicketToBackend(ticket: TicketMesaAyuda): Observable<TicketMesaAyuda> {
    const fields = {
      asignadoA: ticket.asignadoA || null,
      estado: ticket.estado,
      diagnostico: ticket.diagnostico || null,
      resolucion: ticket.resolucion || null,
      fechaResolucion: ticket.fechaResolucion || null,
      nivel: ticket.nivel,
      historialAcciones: ticket.historialAcciones,
    };
    return this.http.patch<SolicitudTesoreria>(`${this.apiUrl}/${ticket.id}/ticket`, fields).pipe(
      map((response) => this.toTicket(response)),
    );
  }

  asignarTicket(ticketId: number, asignadoA: string): Observable<TicketMesaAyuda> {
    return this.getTicketById(ticketId).pipe(
      switchMap((ticket) => {
        if (!ticket) {
          throw new Error('Ticket no encontrado');
        }
        ticket.asignadoA = asignadoA;
        ticket.estado = 'EN_PROGRESO';
        ticket.historialAcciones.push({
          id: ticket.historialAcciones.length + 1,
          fecha: new Date().toISOString(),
          accion: 'ASIGNACION',
          descripcion: `Ticket asignado a ${asignadoA}`,
          usuario: asignadoA,
          nivel: ticket.nivel,
        });
        return this.saveTicketToBackend(ticket);
      }),
    );
  }

  agregarDiagnostico(ticketId: number, diagnostico: string, usuario: string = 'Agente de soporte'): Observable<TicketMesaAyuda> {
    return this.getTicketById(ticketId).pipe(
      switchMap((ticket) => {
        if (!ticket) {
          throw new Error('Ticket no encontrado');
        }
        ticket.diagnostico = diagnostico;
        ticket.historialAcciones.push({
          id: ticket.historialAcciones.length + 1,
          fecha: new Date().toISOString(),
          accion: 'DIAGNOSTICO',
          descripcion: diagnostico,
          usuario,
          nivel: ticket.nivel,
        });
        return this.saveTicketToBackend(ticket);
      }),
    );
  }

  escalarTicket(ticketId: number, nuevoNivel: 2 | 3, motivo: string, usuario: string = 'Agente de soporte'): Observable<TicketMesaAyuda> {
    return this.getTicketById(ticketId).pipe(
      switchMap((ticket) => {
        if (!ticket) {
          throw new Error('Ticket no encontrado');
        }
        ticket.nivel = nuevoNivel;
        ticket.estado = 'ESCALADO';
        ticket.historialAcciones.push({
          id: ticket.historialAcciones.length + 1,
          fecha: new Date().toISOString(),
          accion: 'ESCALAMIENTO',
          descripcion: `Escalado a nivel ${nuevoNivel}: ${motivo}`,
          usuario,
          nivel: nuevoNivel,
        });
        return this.saveTicketToBackend(ticket);
      }),
    );
  }

  resolverTicket(ticketId: number, resolucion: string, usuario: string = 'Agente de soporte'): Observable<TicketMesaAyuda> {
    return this.getTicketById(ticketId).pipe(
      switchMap((ticket) => {
        if (!ticket) {
          throw new Error('Ticket no encontrado');
        }
        ticket.resolucion = resolucion;
        ticket.estado = 'RESUELTO';
        ticket.fechaResolucion = new Date().toISOString();
        ticket.historialAcciones.push({
          id: ticket.historialAcciones.length + 1,
          fecha: new Date().toISOString(),
          accion: 'RESOLUCION',
          descripcion: resolucion,
          usuario,
          nivel: ticket.nivel,
        });
        return this.saveTicketToBackend(ticket);
      }),
    );
  }

  cerrarTicket(ticketId: number, usuario: string = 'Sistema'): Observable<TicketMesaAyuda> {
    return this.getTicketById(ticketId).pipe(
      switchMap((ticket) => {
        if (!ticket) {
          throw new Error('Ticket no encontrado');
        }
        ticket.estado = 'CERRADO';
        ticket.historialAcciones.push({
          id: ticket.historialAcciones.length + 1,
          fecha: new Date().toISOString(),
          accion: 'CIERRE',
          descripcion: 'Ticket cerrado',
          usuario,
          nivel: ticket.nivel,
        });
        return this.saveTicketToBackend(ticket);
      }),
    );
  }

  agregarComentario(ticketId: number, comentario: string, usuario: string = 'Agente de soporte'): Observable<TicketMesaAyuda> {
    return this.getTicketById(ticketId).pipe(
      switchMap((ticket) => {
        if (!ticket) {
          throw new Error('Ticket no encontrado');
        }
        ticket.historialAcciones.push({
          id: ticket.historialAcciones.length + 1,
          fecha: new Date().toISOString(),
          accion: 'COMENTARIO',
          descripcion: comentario,
          usuario,
          nivel: ticket.nivel,
        });
        return this.saveTicketToBackend(ticket);
      }),
    );
  }

  private toTicket(solicitud: SolicitudTesoreria): TicketMesaAyuda {
    const datos = this.parseDatosAdicionales(solicitud.datosAdicionales);
    const fechaCreacion = solicitud.fechaCreacion || solicitud.fechaSolicitud || new Date().toISOString();
    const historialAcciones = this.buildHistorial(datos, fechaCreacion, solicitud.nombre || 'Sistema');

    return {
      id: Number(solicitud.id),
      numeroTicket: this.asString(datos['numeroTicket']) || `TK-${String(solicitud.id).padStart(8, '0')}`,
      fechaCreacion,
      tipoEmpresa: this.asString(datos['tipoEmpresa']) || 'OTRO',
      nombreEmpresa: this.asString(datos['nombreEmpresa']) || solicitud.empresaCentroCostos || '',
      nit: this.asString(datos['nit']),
      ciudad: this.asString(datos['ciudad']),
      tieneSedeComplejo: Boolean(datos['tieneSedeComplejo']),
      torreBloque: this.asString(datos['torreBloque']),
      piso: this.asString(datos['piso']),
      oficinaArea: this.asString(datos['oficinaArea']) || solicitud.areaDepartamento || '',
      nombreCompleto: this.asString(datos['nombreCompleto']) || solicitud.nombre || '',
      cargo: this.asString(datos['cargo']) || solicitud.cargo || '',
      correoElectronico: this.asString(datos['correoElectronico']) || solicitud.correoElectronico || '',
      telefono: this.asString(datos['telefono']) || solicitud.telefonoContacto || '',
      tipoSolicitud: this.asString(datos['tipoSolicitud']) || 'OTRO',
      subClasificacion: this.asString(datos['subClasificacion']),
      descripcionIncidente: this.asString(datos['descripcionIncidente']) || solicitud.observaciones || '',
      fechaIncidente: this.asString(datos['fechaIncidente']),
      archivoAdjuntoUrl: this.asString(datos['archivoAdjuntoUrl']),
      urgencia: this.asUrgencia(datos['urgencia']),
      impacto: this.asImpacto(datos['impacto']),
      estado: this.asEstado(datos['estado']),
      nivel: this.asNivel(datos['nivel']),
      diagnostico: this.asString(datos['diagnostico']),
      resolucion: this.asString(datos['resolucion']),
      fechaResolucion: this.asString(datos['fechaResolucion']),
      asignadoA: this.asString(datos['asignadoA']),
      historialAcciones,
    };
  }

  private parseDatosAdicionales(raw: unknown): Record<string, any> {
    if (!raw) {
      return {};
    }
    if (typeof raw === 'object') {
      return raw as Record<string, any>;
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, any>)
          : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  private buildHistorial(datos: Record<string, any>, fechaCreacion: string, usuario: string): TicketAccion[] {
    if (Array.isArray(datos['historialAcciones'])) {
      return (datos['historialAcciones'] as unknown[])
        .map((accion, index) => this.toTicketAccion(accion, index, this.asNivel(datos['nivel']), usuario, fechaCreacion))
        .sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime());
    }
    return [
      {
        id: 1,
        fecha: fechaCreacion,
        accion: 'CREACION',
        descripcion: 'Ticket creado',
        usuario,
        nivel: 1,
      },
    ];
  }

  private toTicketAccion(
    raw: unknown,
    index: number,
    nivelFallback: 1 | 2 | 3,
    usuarioFallback: string,
    fechaFallback: string,
  ): TicketAccion {
    const accion = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};

    return {
      id: Number(accion['id']) || index + 1,
      fecha: this.asString(accion['fecha']) || fechaFallback,
      accion: this.asString(accion['accion']).toUpperCase() || 'ACTUALIZACION',
      descripcion: this.asString(accion['descripcion']) || 'Actualización del ticket',
      usuario: this.asString(accion['usuario']) || usuarioFallback,
      nivel: this.asNivel(accion['nivel']) || nivelFallback,
    };
  }

  private asString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private asNivel(value: unknown): 1 | 2 | 3 {
    const nivel = Number(value);
    if (nivel === 2 || nivel === 3) {
      return nivel;
    }
    return 1;
  }

  private asUrgencia(value: unknown): 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA' {
    const normalized = String(value || '').toUpperCase();
    if (normalized === 'BAJA' || normalized === 'MEDIA' || normalized === 'ALTA' || normalized === 'CRITICA') {
      return normalized;
    }
    return 'MEDIA';
  }

  private asImpacto(value: unknown): 'INDIVIDUAL' | 'AREA' | 'EMPRESA' {
    const normalized = String(value || '').toUpperCase();
    if (normalized === 'INDIVIDUAL' || normalized === 'AREA' || normalized === 'EMPRESA') {
      return normalized;
    }
    return 'INDIVIDUAL';
  }

  private asEstado(value: unknown): 'ABIERTO' | 'EN_PROGRESO' | 'ESCALADO' | 'RESUELTO' | 'CERRADO' {
    const normalized = String(value || '').toUpperCase();
    if (
      normalized === 'ABIERTO' ||
      normalized === 'EN_PROGRESO' ||
      normalized === 'ESCALADO' ||
      normalized === 'RESUELTO' ||
      normalized === 'CERRADO'
    ) {
      return normalized;
    }
    return 'ABIERTO';
  }
}
