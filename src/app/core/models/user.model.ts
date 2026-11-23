export interface User {
  id?: string | number;
  username: string;
  email?: string;
  password?: string;
  active?: boolean;
  level?: number;
  employee?: Employee;  // ✅ NUEVO: Objeto completo del empleado asociado
  employeeId?: string | number;  // ✅ MANTENER: Por compatibilidad
  roles?: Role[];
  createdAt?: Date;
  updatedAt?: Date;
  requirePasswordChange?: boolean;
}

export interface Employee {
  id: number | string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  secondLastName?: string;
  documentType?: string;
  idNumber?: string;
  corporateEmail?: string;
  fullName: string;
  isDirectManager?: boolean;
  directManager?: string;
  [key: string]: any; // Para permitir otros campos del empleado
}

export interface Role {
  id: string | number;
  name: string;
  description?: string;
}

export interface UserRequest {
  username: string;
  email?: string;
  password: string;
  active?: boolean;
  level?: number;
  employee?: Employee;  // ✅ NUEVO
  roles?: Role[];
  requirePasswordChange?: boolean;
}
