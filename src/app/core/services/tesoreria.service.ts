import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

/**
 * DTO para crear una solicitud de tesorería
 */
export interface SolicitudRequestDTO {
  descripcion: string;
  monto: number;
  tipo: string;
  observaciones?: string;
  solicitanteId: number;
  areaId: number;
}

/**
 * DTO de respuesta para una solicitud
 */
export interface SolicitudResponseDTO {
  id: number;
  descripcion: string;
  monto: number;
  tipo: string;
  observaciones?: string;
  solicitanteId: number;
  areaId: number;
  evidenciaUrl?: string;
  vistoBuenoUrl?: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  fechaCreacion: string;
  fechaModificacion?: string;
}

/**
 * DTO con estadísticas del dashboard
 */
export interface StatsTesoreriaDTO {
  totalSolicitudes: number;
  solicitudesPendientes: number;
  solicitudesAprobadas: number;
  solicitudesRechazadas: number;
  montoTotal: number;
  montoAprobado: number;
}

/**
 * DTO para empleados en el catálogo
 */
export interface EmployeeDTO {
  id: number;
  fullName: string;
  email: string;
  corporateEmail?: string;
  phone?: string;
}

/**
 * DTO para áreas/departamentos
 */
export interface AreaDTO {
  id: number;
  name: string;
}

/**
 * DTO para posiciones/cargos
 */
export interface PositionDTO {
  id: number;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class TesoreriaService {
  private readonly baseUrl = `${environment.apiUrl}/tesoreria`;
  private readonly employeesUrl = `${environment.apiUrl}/employees`;
  private readonly areasUrl = `${environment.apiUrl}/areas`;
  private readonly positionsUrl = `${environment.apiUrl}/positions`;

  constructor(private http: HttpClient) {}

  /**
   * Crear una nueva solicitud de tesorería con archivos adjuntos
   */
  createSolicitud(
    solicitud: SolicitudRequestDTO,
    evidenciaFile?: File,
    vistoBuenoFile?: File
  ): Observable<SolicitudResponseDTO> {
    const formData = new FormData();
    
    // Agregar datos de la solicitud como JSON
    formData.append('solicitud', new Blob([JSON.stringify(solicitud)], { type: 'application/json' }));
    
    // Agregar archivos si existen
    if (evidenciaFile) {
      formData.append('evidencia', evidenciaFile, evidenciaFile.name);
    }
    if (vistoBuenoFile) {
      formData.append('vistoBueno', vistoBuenoFile, vistoBuenoFile.name);
    }

    return this.http.post<SolicitudResponseDTO>(this.baseUrl, formData);
  }

  /**
   * Obtener todas las solicitudes
   */
  getSolicitudes(): Observable<SolicitudResponseDTO[]> {
    return this.http.get<SolicitudResponseDTO[]>(this.baseUrl);
  }

  /**
   * Obtener una solicitud por ID
   */
  getSolicitudById(id: number): Observable<SolicitudResponseDTO> {
    return this.http.get<SolicitudResponseDTO>(`${this.baseUrl}/${id}`);
  }

  /**
   * Obtener estadísticas del dashboard
   */
  getStats(): Observable<StatsTesoreriaDTO> {
    return this.http.get<StatsTesoreriaDTO>(`${this.baseUrl}/stats`);
  }

  /**
   * Obtener lista de empleados para el catálogo
   */
  getEmployees(): Observable<EmployeeDTO[]> {
    return this.http.get<EmployeeDTO[]>(this.employeesUrl);
  }

  /**
   * Obtener un empleado por ID
   */
  getEmployeeById(id: number): Observable<EmployeeDTO> {
    return this.http.get<EmployeeDTO>(`${this.employeesUrl}/${id}`);
  }

  /**
   * Obtener lista de áreas/departamentos
   */
  getAreas(): Observable<AreaDTO[]> {
    return this.http.get<AreaDTO[]>(this.areasUrl);
  }

  /**
   * Obtener lista de posiciones/cargos
   */
  getPositions(): Observable<PositionDTO[]> {
    return this.http.get<PositionDTO[]>(this.positionsUrl);
  }
}
