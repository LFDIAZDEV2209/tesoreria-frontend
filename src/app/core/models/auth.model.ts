export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  userId: number;
  employeeId?: number | null;
  dependencyId?: number | null;
  username: string;
  email: string;
  roles: Role[];
  employee?: Employee;  // ✅ NUEVO: Objeto completo del empleado
  token?: string | null;
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
  fullName?: string;
  isDirectManager?: boolean;
  directManager?: string;
  [key: string]: any;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
}

export interface AuthState {
  user: LoginResponse | null;
  token?: string;
  isAuthenticated: boolean;
  loading: boolean;
  error?: string;
}
