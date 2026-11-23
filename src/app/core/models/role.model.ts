export interface Role {
  id: string | number;
  name: string;
  description?: string;
}

export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'DOCUMENT_ADMIN' | 'SUPERVISOR' | 'USER' | 'USER_NIVEL_1' | 'USER_NIVEL_2' | 'USER_NIVEL_3';

export const ROLE_HIERARCHY: { [key: string]: number } = {
  'SUPER_ADMIN': 100,
  'ADMIN': 80,
  'DOCUMENT_ADMIN': 70,
  'SUPERVISOR': 60,
  'USER_NIVEL_3': 40,
  'USER_NIVEL_2': 30,
  'USER_NIVEL_1': 20,
  'USER': 10
};

export const SUPERVISOR_ALLOWED_ROLES: RoleName[] = ['USER', 'USER_NIVEL_1', 'USER_NIVEL_2', 'USER_NIVEL_3'];

// Roles que solo el SUPER_ADMIN puede crear
export const SUPER_ADMIN_ONLY_ROLES: RoleName[] = ['SUPER_ADMIN'];

// Permisos del rol DOCUMENT_ADMIN (Admin de Documentos)
export const DOCUMENT_ADMIN_PERMISSIONS = {
  canViewEmployeeList: true,
  canViewDocumentValidation: true,
  canViewReports: true,
  canManageEmployees: false,
  canManageUsers: false,
  canManageKPIs: false
};

export interface Permission {
  canCreateUsers: boolean;
  allowedRolesToCreate: RoleName[];
  canEditOwnSalary: boolean;
  canEditOthersSalary: boolean;
  canAccessAllModules: boolean;
}
