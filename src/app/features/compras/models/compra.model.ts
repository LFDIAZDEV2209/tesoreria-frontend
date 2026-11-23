/**
 * Modelo de Gestión de Compras – Bandeja de Entrada G. Compras
 */

export type EstadoCompra =
  | 'PENDIENTE'
  | 'REALIZADO'
  | 'TRAMITE'
  | 'EN_PROCESO'
  | 'EN_CONTABILIDAD'
  | 'ESPERANDO_CONTABILIDAD'
  | 'APROBADO_CONTABILIDAD'
  | 'COMPLETADO'
  | 'RECHAZADO_JEFE'
  | 'ESPERANDO_VISTO_BUENO';

export const ESTADO_COMPRA_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  REALIZADO: 'Realizado',
  TRAMITE: 'En Trámite',
  EN_PROCESO: 'En Trámite',
  EN_CONTABILIDAD: 'En Trámite',
  ESPERANDO_CONTABILIDAD: 'En Trámite',
  APROBADO_CONTABILIDAD: 'Realizado',
  COMPLETADO: 'Realizado',
  RECHAZADO_JEFE: 'Rechazado',
  ESPERANDO_VISTO_BUENO: 'Esperando VoBo'
};

/** Semáforo basado en días transcurridos vs SLA */
export type SemaforoColor = 'verde' | 'amarillo' | 'rojo';

export interface SolicitudCompra {
  id: number;
  codigoSolicitud: string;          // S-001, S-002…
  fechaSolicitud: string;           // DD/MM/AAAA
  solicitante: string;
  areaSolicitante: string;
  diasTranscurridos: number;
  slaDias: number;
  estado: EstadoCompra;
  evidenciaUrl?: string;
  ordenCompraUrl?: string;
  vistoBuenoUrl?: string;
  observaciones?: string;
  cargo?: string;
  correoElectronico?: string;
  telefonoContacto?: string;
  tipoRequerimiento?: string;
  otroRequerimiento?: string;
  esCompra?: boolean;
  empresaCentroCostos?: string;
  datosAdicionales?: string;        // JSON string
  creadoPor?: string;
  fechaCreacion?: string;
  // Datos de rechazo del jefe de compras
  motivoRechazo?: string;
  observacionesRechazo?: string;
  fechaRechazo?: string;
  revisadoPorRechazo?: string;
}

export interface StatsCompras {
  totalSolicitudes: number;
  pendientes: number;
  realizadas: number;
  enTramite: number;
  promedioSla: number;
  areasMasActivas: number;
}

/**
 * Calcula el color del semáforo según:
 *   🟢 Verde   → diasTranscurridos ≤ 2
 *   🟡 Amarillo → 3 ≤ diasTranscurridos < (slaDias − 1)
 *   🔴 Rojo    → diasTranscurridos > slaDias − 1
 */
export function calcularSemaforo(diasTranscurridos: number, slaDias: number): SemaforoColor {
  const umbralRojo = slaDias - 1;
  if (diasTranscurridos <= 2) return 'verde';
  if (diasTranscurridos >= 3 && diasTranscurridos < umbralRojo) return 'amarillo';
  return 'rojo';
}
