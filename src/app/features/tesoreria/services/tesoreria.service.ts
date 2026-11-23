import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  SolicitudTesoreria,
  SolicitudRequest,
  AreaDepartamento,
  Cargo,
  StatsTesoreria,
  EmpleadoPeopleNet,
  EmpresaPeopleNet,
  AreaPeopleNet,
} from '../models/solicitud.model';
import { Employee } from '../../../core/models/user.model';

@Injectable({
  providedIn: 'root',
})
export class TesoreriaService {
  private readonly baseUrl = `${environment.apiUrl}/tesoreria`;
  private readonly employeesUrl = `${environment.apiUrl}/employees`;
  private readonly peoplenetUrl = `${environment.apiUrl}/peoplenet`;
  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json',
    }),
  };

  constructor(private http: HttpClient) {}

  // ========================
  // Solicitudes
  // ========================

  /**
   * Crear una nueva solicitud de tesorería
   */
  createSolicitud(
    solicitud: SolicitudRequest,
    evidencia?: File,
    vistoBueno?: File,
  ): Observable<SolicitudTesoreria> {
    const formData = new FormData();
    // Serializar datosAdicionales a JSON string para el backend
    const payload = {
      ...solicitud,
      datosAdicionales: solicitud.datosAdicionales
        ? JSON.stringify(solicitud.datosAdicionales)
        : undefined,
    };
    formData.append(
      'solicitud',
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    );
    if (evidencia) {
      formData.append('evidencia', evidencia);
    }
    if (vistoBueno) {
      formData.append('vistoBueno', vistoBueno);
    }
    return this.http.post<SolicitudTesoreria>(this.baseUrl, formData);
  }

  /**
   * Obtener todas las solicitudes
   */
  getSolicitudes(): Observable<SolicitudTesoreria[]> {
    return this.http.get<SolicitudTesoreria[]>(this.baseUrl, this.httpOptions);
  }

  /**
   * Obtener solicitud por ID
   */
  getSolicitudById(id: number): Observable<SolicitudTesoreria> {
    return this.http.get<SolicitudTesoreria>(
      `${this.baseUrl}/${id}`,
      this.httpOptions,
    );
  }

  // ========================
  // Datos de PeopleNet (Empleados)
  // ========================

  /**
   * Obtener empleados (para autocompletar nombre, correo, teléfono)
   */
  getEmployees(): Observable<Employee[]> {
    return this.http.get<Employee[]>(this.employeesUrl, this.httpOptions);
  }

  /**
   * Buscar empleado por ID / DM código
   */
  getEmployeeById(id: string): Observable<Employee> {
    return this.http.get<Employee>(
      `${this.employeesUrl}/${id}`,
      this.httpOptions,
    );
  }

  // ========================
  // Catálogos
  // ========================

  /**
   * Obtener áreas/departamentos desde la BD
   */
  getAreas(): Observable<AreaDepartamento[]> {
    return this.http.get<AreaDepartamento[]>(
      `${environment.apiUrl}/areas`,
      this.httpOptions,
    );
  }

  /**
   * Obtener cargos desde la BD
   */
  getCargos(): Observable<Cargo[]> {
    return this.http.get<Cargo[]>(
      `${environment.apiUrl}/positions`,
      this.httpOptions,
    );
  }

  /**
   * Obtener estadísticas de tesorería para el dashboard
   */
  getStats(): Observable<StatsTesoreria> {
    return this.http.get<StatsTesoreria>(
      `${this.baseUrl}/stats`,
      this.httpOptions,
    );
  }

  // ========================
  // PeopleNet — Datos de empleados/empresa
  // ========================

  /**
   * Obtener lista de empresas desde la tabla companies
   */
  getEmpresas(): Observable<EmpresaPeopleNet[]> {
    return this.http.get<EmpresaPeopleNet[]>(
      `${this.peoplenetUrl}/empresas`,
      this.httpOptions,
    );
  }

  /**
   * Obtener todas las áreas
   */
  getAllAreas(): Observable<AreaPeopleNet[]> {
    return this.http.get<AreaPeopleNet[]>(
      `${this.peoplenetUrl}/areas`,
      this.httpOptions,
    );
  }

  /**
   * Obtener áreas de una empresa por ID
   */
  getAreasByEmpresa(empresaId: number): Observable<AreaPeopleNet[]> {
    return this.http.get<AreaPeopleNet[]>(
      `${this.peoplenetUrl}/areas/empresa/${empresaId}`,
      this.httpOptions,
    );
  }

  /**
   * Buscar empleados por nombre, email o cédula (autocomplete)
   */
  searchEmpleados(query: string): Observable<EmpleadoPeopleNet[]> {
    if (!query || query.trim().length < 2) return of([]);
    const params = new HttpParams().set('q', query.trim());
    return this.http.get<EmpleadoPeopleNet[]>(
      `${this.peoplenetUrl}/empleados/search`,
      { ...this.httpOptions, params },
    );
  }

  /**
   * Obtener empleado por ID
   */
  getEmpleadoPeopleNet(id: number): Observable<EmpleadoPeopleNet> {
    return this.http.get<EmpleadoPeopleNet>(
      `${this.peoplenetUrl}/empleados/${id}`,
      this.httpOptions,
    );
  }

  /**
   * Obtener empleado por número de documento
   */
  getEmpleadoByDocumento(idNumber: string): Observable<EmpleadoPeopleNet> {
    return this.http.get<EmpleadoPeopleNet>(
      `${this.peoplenetUrl}/empleados/documento/${idNumber}`,
      this.httpOptions,
    );
  }

  // ========================
  // Bandeja de Solicitudes
  // ========================

  /**
   * Obtener todas las solicitudes de la bandeja (pendientes, enviadas, rechazadas)
   */
  obtenerBandejaSolicitudes(): Observable<SolicitudTesoreria[]> {
    return this.http.get<SolicitudTesoreria[]>(
      `${this.baseUrl}/bandeja-solicitudes`,
      this.httpOptions,
    );
  }

  /**
   * Obtener solicitudes pendientes de envío a compras (endpoint paginado legacy)
   */
  obtenerSolicitudesPendientesEnvio(): Observable<SolicitudTesoreria[]> {
    return this.http.get<SolicitudTesoreria[]>(
      `${this.baseUrl}/solicitudes-pendientes-envio`,
      this.httpOptions,
    );
  }

  /**
   * Enviar solicitudes a compras (cambiar su estado)
   */
  enviarSolicitudesACompras(solicitudIds: number[]): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/enviar-a-compras`,
      { solicitudIds },
      this.httpOptions,
    );
  }

  /**
   * Revisar (aprobar o rechazar) una solicitud individual
   */
  revisarSolicitud(
    id: number,
    accion: 'APROBAR' | 'RECHAZAR',
    observaciones?: string,
  ): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/${id}/revisar`,
      { accion, observaciones },
      this.httpOptions,
    );
  }

  /**
   * Obtener historial de una solicitud
   */
  getHistorial(id: number): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.baseUrl}/${id}/historial`,
      this.httpOptions,
    );
  }

  // ========================
  // Solicitud de Viáticos
  // ========================

  /**
   * Crear solicitud de viáticos con soportes
   */
  createSolicitudViaticos(formData: FormData): Observable<any> {
    return this.http.post(`${this.baseUrl}/viaticos`, formData);
  }

  /**
   * Obtener solicitudes de viáticos del usuario actual
   */
  getSolicitudesViaticosUsuario(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/viaticos/mis-solicitudes`, this.httpOptions);
  }

  getTimelineSolicitudViaticos(id: number): Observable<ViaticosTimelineResponse> {
    return this.http.get<ViaticosTimelineResponse>(
      `${this.baseUrl}/viaticos/${id}/timeline`,
      this.httpOptions,
    );
  }

  /**
   * Obtener todas las solicitudes de viáticos (admin/revisor)
   */
  getSolicitudesViaticosAll(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/viaticos`, this.httpOptions);
  }

  /**
   * Obtener solicitudes de viáticos para gerencia (filtrables por estado)
   */
  getSolicitudesViaticosGerencia(estado?: string): Observable<any[]> {
    let url = `${this.baseUrl}/viaticos/gerencia`;
    if (estado) {
      url += `?estado=${encodeURIComponent(estado)}`;
    }
    return this.http.get<any[]>(url, this.httpOptions);
  }

  /**
   * Aprobar o rechazar una solicitud de viáticos (gerencia)
   */
  decidirSolicitudViaticos(
    id: number,
    accion: 'APROBAR' | 'RECHAZAR',
    observaciones: string,
    revisadoPor?: string,
  ): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/viaticos/${id}/decision`,
      { accion, observaciones, revisadoPor },
      this.httpOptions,
    );
  }
}

export interface ViaticosTimelineEvento {
  titulo: string;
  estado: string;
  fecha: string | null;
  detalle: string | null;
}

export interface ViaticosTimelineResponse {
  solicitudId: number;
  estadoActual: string;
  respuestaContabilidad?: string | null;
  observacionesContabilidad?: string | null;
  numeroOrdenEgreso?: string | null;
  montoDesembolsoAprobado?: number | null;
  eventos: ViaticosTimelineEvento[];
}
