import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Role, RoleName } from '../models/role.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RoleService {

  private readonly baseUrl = `${environment.apiUrl}/roles`;
  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  // Mapeo de niveles del empleado a roles
  private readonly levelToRoleMap: { [key: string]: RoleName } = {
    'Junior': 'USER',
    'Semi-Senior': 'USER',
    'Senior': 'ADMIN',
    'Líder': 'ADMIN',
    'Gerente': 'ADMIN',
    'Director': 'SUPER_ADMIN'
  };

  constructor(private http: HttpClient) {}

  /**
   * Obtener todos los roles disponibles
   */
  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(this.baseUrl, this.httpOptions);
  }

  /**
   * Obtener rol por nombre (soporta SUPER_ADMIN, ADMIN, USER, USER_NIVEL_1, USER_NIVEL_2, USER_NIVEL_3)
   */
  getRoleByName(name: string | RoleName): Observable<Role> {
    return this.getRoles().pipe(
      map((roles: Role[]) => {
        const role = roles.find(r => r.name === name);
        if (!role) {
          throw new Error(`Rol ${name} no encontrado`);
        }
        return role;
      })
    );
  }

  /**
   * Mapea el nivel del empleado a un rol
   * @param level - Nivel del empleado (Junior, Senior, Gerente, etc.)
   * @returns RoleName correspondiente
   */
  mapLevelToRole(level?: string): RoleName {
    if (!level) return 'USER'; // Default role
    return this.levelToRoleMap[level] || 'USER';
  }

  /**
   * Obtiene el rol basado en el nivel del empleado
   * @param level - Nivel del empleado
   * @returns Observable del rol correspondiente
   */
  getRoleByLevel(level?: string): Observable<Role> {
    const roleName = this.mapLevelToRole(level);
    return this.getRoleByName(roleName);
  }
}
