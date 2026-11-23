import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User, UserRequest } from '../models/user.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private readonly baseUrl = `${environment.apiUrl}/users`;
  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  constructor(private http: HttpClient) {}

  /**
   * Crear un nuevo usuario
   */
  createUser(userRequest: UserRequest): Observable<User> {
    return this.http.post<User>(this.baseUrl, userRequest, this.httpOptions);
  }

  /**
   * Obtener usuario por ID
   */
  getUserById(id: string): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/${id}`, this.httpOptions);
  }

  /**
   * Obtener usuario por username
   */
  getUserByUsername(username: string): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/username/${username}`, this.httpOptions);
  }

  /**
   * Obtener todos los usuarios
   */
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.baseUrl, this.httpOptions);
  }

  /**
   * Actualizar usuario
   */
  updateUser(id: string, userRequest: Partial<UserRequest>): Observable<User> {
    // Filtrar campos undefined/null para no enviar datos innecesarios
    const cleanedRequest = Object.keys(userRequest).reduce((acc, key) => {
      const value = (userRequest as any)[key];
      if (value !== undefined && value !== null && value !== '') {
        (acc as any)[key] = value;
      }
      return acc;
    }, {});

    return this.http.put<User>(`${this.baseUrl}/${id}`, cleanedRequest, this.httpOptions);
  }

  /**
   * Actualizar rol del usuario
   */
  updateUserRole(id: string, roleName: string): Observable<User> {
    const updateData = {
      roleName: roleName
    };
    return this.http.put<User>(`${this.baseUrl}/${id}/role`, updateData, this.httpOptions);
  }

  /**
   * Asignar empleado a usuario
   */
  assignEmployee(userId: string, employeeId: string): Observable<User> {
    return this.http.put<User>(`${this.baseUrl}/${userId}/employee/${employeeId}`, {}, this.httpOptions);
  }

  /**
   * Desactivar usuario
   */
  deactivateUser(id: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}/deactivate`, {}, this.httpOptions);
  }

  /**
   * Asignar rol a usuario
   */
  assignRole(userId: string, roleId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${userId}/assign-role/${roleId}`, {}, this.httpOptions);
  }

  /**
   * Remover rol de usuario
   */
  removeRole(userId: string, roleId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${userId}/roles/${roleId}`, this.httpOptions);
  }

  /**
   * Eliminar usuario (hard delete)
   */
  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, this.httpOptions);
  }

  /**
   * Crear usuario para carga masiva de empleados
   * Crea un usuario con nivel 1 y contraseña temporal marcado para cambio obligatorio
   */
  createUserForBulkUpload(userRequest: UserRequest): Observable<User> {
    const bulkUserRequest: UserRequest = {
      ...userRequest,
      level: 1, // Nivel 1 por defecto para carga masiva
      active: true, // Activo por defecto
      requirePasswordChange: true // Obligar cambio en primer login
    };
    return this.createUser(bulkUserRequest);
  }
}
