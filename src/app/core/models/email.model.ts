/**
 * DTOs para la gestión de notificaciones y envío de emails
 * Utilizados en la comunicación con el backend para envío de credenciales y notificaciones
 */

/**
 * DTO para envío de credenciales de usuario (carga masiva)
 * Utilizado cuando se crea un nuevo usuario en carga masiva de empleados
 */
export interface CredencialesUsuarioDto {
  destinatario: string;        // Email del empleado
  nombreUsuario: string;       // Nombre completo del empleado
  username: string;            // Username para login
  passwordTemporal: string;    // Contraseña temporal generada
  asunto?: string;             // Asunto del email (opcional, backend usa valor por defecto)
}

/**
 * Respuesta genérica de email
 * Utilizada para las respuestas de todos los endpoints de email
 */
export interface EmailResponse {
  success: boolean;
  message: string;
  timestamp?: Date;
  errorDetails?: string;
}

/**
 * DTO para notificación de asignación de KPIs
 * Reutilizable para futuras implementaciones
 */
export interface NotificacionAsignacionDto {
  destinatario: string;
  nombreUsuario: string;
  asunto: string;
  empleados: Array<{
    nombre: string;
    codigo: string;
  }>;
}

/**
 * DTO para notificación de KPIs sin asignar
 * Reutilizable para futuras implementaciones
 */
export interface KpisSinAsignarDto {
  destinatario: string;
  nombreUsuario: string;
  asunto: string;
  empleados: Array<{
    nombre: string;
    cargo: string;
    estado: string;
  }>;
  nombreRemitente: string;
  cargoRemitente: string;
}

/**
 * DTO para notificación de KPIs sin evaluar
 * Reutilizable para futuras implementaciones
 */
export interface KpisSinEvaluarDto {
  destinatario: string;
  nombreUsuario: string;
  asunto: string;
  empleados: Array<{
    nombre: string;
    cargo: string;
    kpisPendientes: string[];
  }>;
  nombreRemitente: string;
  cargoRemitente: string;
}
