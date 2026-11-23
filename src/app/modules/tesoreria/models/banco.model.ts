export type TipoCuenta = 'Ahorros' | 'Corriente';
export type EstadoBanco = 'Activo' | 'Inactivo';

/**
 * Documento adjunto a una cuenta bancaria
 * Puede ser: Resolución de apertura, certificado bancario, etc.
 */
export interface DocumentoBanco {
  id?: number;
  nombre: string;
  tipo: 'Resolución' | 'Certificado' | 'Otro';
  url: string;
  fechaCarga?: string;
  tamaño?: number;
}

/**
 * Modelo de Banco - Información completa de una cuenta bancaria
 */
export interface Banco {
  empresaId?: number;
  id: number;
  nombreBanco: string;
  numeroCuenta: string;
  tipoCuenta: TipoCuenta;
  saldoPrincipal: number;
  saldoActual?: number;
  estado: EstadoBanco;
  banco: string; // Nombre del banco (Bancolombia, BBVA, etc)
  titular: string;
  cedula?: string;
  email?: string;
  telefono?: string;
  ciudad?: string;
  sucursal?: string;
  fechaApertura: string;
  fechaCreacion: string;
  fechaActualizacion?: string;
  documentos?: DocumentoBanco[];
  notas?: string;
  activo: boolean;
}

/**
 * DTO para crear/actualizar un banco
 */
export interface BancoRequest {
  empresaId?: number;
  nombreBanco: string;
  numeroCuenta: string;
  tipoCuenta: TipoCuenta;
  saldoPrincipal: number;
  banco: string;
  titular: string;
  cedula?: string;
  email?: string;
  telefono?: string;
  ciudad?: string;
  sucursal?: string;
  fechaApertura: string;
  estado?: EstadoBanco;
  notas?: string;
  activo?: boolean;
}

/**
 * Respuesta del servidor
 */
export interface BancoResponse extends Banco {}

/**
 * Estadísticas de bancos
 */
export interface StatsBancos {
  totalBancos: number;
  bancosActivos: number;
  bancosInactivos: number;
  saldoTotalGlobal: number;
  saldoPromedioCuenta: number;
}
