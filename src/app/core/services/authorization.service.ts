import { Injectable, signal, computed } from '@angular/core';
import { AuthService } from './auth.service';
import { RoleName, ROLE_HIERARCHY, SUPERVISOR_ALLOWED_ROLES, SUPER_ADMIN_ONLY_ROLES, DOCUMENT_ADMIN_PERMISSIONS, Permission } from '../models/role.model';
import { LoginResponse } from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthorizationService {

  private currentUser = signal<LoginResponse | null>(null);

  constructor(private authService: AuthService) {
    this.currentUser.set(this.authService.getCurrentUser());
  }

  refreshUser(): void {
    this.currentUser.set(this.authService.getCurrentUser());
  }

  getCurrentUserRoles(): string[] {
    const user = this.authService.getCurrentUser();
    if (!user?.roles) return [];
    return user.roles.map(r => r.name);
  }

  hasRole(roleName: string): boolean {
    return this.getCurrentUserRoles().includes(roleName);
  }

  hasAnyRole(roleNames: string[]): boolean {
    const userRoles = this.getCurrentUserRoles();
    return roleNames.some(role => userRoles.includes(role));
  }

  isSuperAdmin(): boolean {
    return this.hasRole('SUPER_ADMIN');
  }

  isAdmin(): boolean {
    return this.hasRole('ADMIN');
  }

  isDocumentAdmin(): boolean {
    return this.hasRole('DOCUMENT_ADMIN');
  }

  isSupervisor(): boolean {
    return this.hasRole('SUPERVISOR');
  }

  isUser(): boolean {
    return this.hasAnyRole(['USER', 'USER_NIVEL_1', 'USER_NIVEL_2', 'USER_NIVEL_3']);
  }

  getHighestRole(): string {
    const roles = this.getCurrentUserRoles();
    let highestRole = 'USER';
    let highestLevel = 0;

    roles.forEach(role => {
      const level = ROLE_HIERARCHY[role] || 0;
      if (level > highestLevel) {
        highestLevel = level;
        highestRole = role;
      }
    });

    return highestRole;
  }

  getRoleLevel(roleName: string): number {
    return ROLE_HIERARCHY[roleName] || 0;
  }

  canManageRole(targetRole: string): boolean {
    const userHighestRole = this.getHighestRole();
    const userLevel = this.getRoleLevel(userHighestRole);
    const targetLevel = this.getRoleLevel(targetRole);

    if (this.isSuperAdmin()) {
      return true;
    }

    // Solo SUPER_ADMIN puede gestionar roles de SUPER_ADMIN
    if (SUPER_ADMIN_ONLY_ROLES.includes(targetRole as RoleName)) {
      return false;
    }

    if (this.isAdmin()) {
      return targetLevel < userLevel && !['SUPER_ADMIN', 'ADMIN'].includes(targetRole);
    }

    if (this.isSupervisor()) {
      return SUPERVISOR_ALLOWED_ROLES.includes(targetRole as RoleName);
    }

    // DOCUMENT_ADMIN no puede gestionar roles
    if (this.isDocumentAdmin()) {
      return false;
    }

    return false;
  }

  getAllowedRolesToCreate(): RoleName[] {
    if (this.isSuperAdmin()) {
      // Solo SUPER_ADMIN puede crear otros SUPER_ADMIN
      return ['SUPER_ADMIN', 'ADMIN', 'DOCUMENT_ADMIN', 'SUPERVISOR', 'USER', 'USER_NIVEL_1', 'USER_NIVEL_2', 'USER_NIVEL_3'];
    }

    if (this.isAdmin()) {
      // ADMIN puede crear todos los roles EXCEPTO SUPER_ADMIN
      return ['ADMIN', 'DOCUMENT_ADMIN', 'SUPERVISOR', 'USER', 'USER_NIVEL_1', 'USER_NIVEL_2', 'USER_NIVEL_3'];
    }

    if (this.isSupervisor()) {
      return [...SUPERVISOR_ALLOWED_ROLES];
    }

    // DOCUMENT_ADMIN no puede crear usuarios
    return [];
  }

  canCreateUsers(): boolean {
    return this.isSuperAdmin() || this.isAdmin() || this.isSupervisor();
  }

  // Verifica si el usuario puede crear un rol específico
  canCreateRole(targetRole: string): boolean {
    // Solo SUPER_ADMIN puede crear SUPER_ADMIN
    if (SUPER_ADMIN_ONLY_ROLES.includes(targetRole as RoleName)) {
      return this.isSuperAdmin();
    }
    return this.getAllowedRolesToCreate().includes(targetRole as RoleName);
  }

  // Permisos específicos para DOCUMENT_ADMIN
  getDocumentAdminPermissions(): typeof DOCUMENT_ADMIN_PERMISSIONS {
    return DOCUMENT_ADMIN_PERMISSIONS;
  }

  // Verifica si el usuario tiene acceso a la lista de empleados (lectura)
  canViewEmployeeList(): boolean {
    return this.isSuperAdmin() || this.isAdmin() || this.isSupervisor() || this.isDocumentAdmin();
  }

  // Verifica si el usuario tiene acceso a validación documental
  canViewDocumentValidation(): boolean {
    return this.isSuperAdmin() || this.isAdmin() || this.isSupervisor() || this.isDocumentAdmin();
  }

  // Verifica si el usuario tiene acceso a reportes
  canViewReports(): boolean {
    return this.isSuperAdmin() || this.isAdmin() || this.isSupervisor() || this.isDocumentAdmin();
  }

  canEditSalary(employeeId: number | string | null | undefined): boolean {
    const currentUser = this.authService.getCurrentUser();

    if (this.isSuperAdmin() || this.isAdmin()) {
      return true;
    }

    if (this.isSupervisor()) {
      if (currentUser?.employeeId && employeeId) {
        // SUPERVISOR NO puede editar su propio salario
        return currentUser.employeeId.toString() !== employeeId.toString();
      }
      return true;
    }

    return false;
  }

  canEditFinancialFields(employeeId: number | string | null | undefined): boolean {
    // Bloquea edición de TODOS los campos financieros si SUPERVISOR está editando su propio perfil
    const currentUser = this.authService.getCurrentUser();

    if (this.isSuperAdmin() || this.isAdmin()) {
      return true;
    }

    if (this.isSupervisor()) {
      if (currentUser?.employeeId && employeeId) {
        // SUPERVISOR NO puede editar sus propios campos financieros
        return currentUser.employeeId.toString() !== employeeId.toString();
      }
      return true;
    }

    return false;
  }

  canEditOwnSalary(): boolean {
    if (this.isSuperAdmin() || this.isAdmin()) {
      return true;
    }
    return false;
  }

  isEditingOwnEmployee(employeeId: number | string | null | undefined): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.employeeId || !employeeId) {
      return false;
    }
    return currentUser.employeeId.toString() === employeeId.toString();
  }

  getPermissions(): Permission {
    return {
      canCreateUsers: this.canCreateUsers(),
      allowedRolesToCreate: this.getAllowedRolesToCreate(),
      canEditOwnSalary: this.canEditOwnSalary(),
      canEditOthersSalary: this.isSuperAdmin() || this.isAdmin() || this.isSupervisor(),
      canAccessAllModules: this.isSuperAdmin() || this.isAdmin() || this.isSupervisor()
    };
  }

  canAccessModule(module: string): boolean {
    const adminModules = ['dashboard', 'employees', 'structure', 'users', 'document-validation'];
    const supervisorModules = ['dashboard', 'employees', 'structure', 'users', 'kpis', 'certificates', 'documents', 'reports', 'document-validation'];
    const documentAdminModules = ['employees', 'document-validation', 'reports']; // Solo lectura de empleados
    const userModules = ['kpis', 'certificates', 'documents', 'reports'];

    if (this.isSuperAdmin() || this.isAdmin()) {
      return true;
    }

    if (this.isSupervisor()) {
      return supervisorModules.includes(module);
    }

    if (this.isDocumentAdmin()) {
      return documentAdminModules.includes(module);
    }

    return userModules.includes(module);
  }

  canEditUser(targetUserId: number | string | null | undefined): boolean {
    const currentUser = this.authService.getCurrentUser();

    if (this.isSuperAdmin()) {
      return true;
    }

    if (currentUser?.userId && targetUserId) {
      if (currentUser.userId.toString() === targetUserId.toString()) {
        return false;
      }
    }

    return this.isAdmin() || this.isSupervisor();
  }

  canDeleteUser(targetUserId: number | string | null | undefined): boolean {
    return this.canEditUser(targetUserId) && (this.isSuperAdmin() || this.isAdmin());
  }

  canAssignRole(roleName: string): boolean {
    return this.getAllowedRolesToCreate().includes(roleName as RoleName);
  }
}
