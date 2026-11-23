/**
 * Modelos para Calendario de Pagos
 * ─────────────────────────────────
 * Dos vistas:
 *   1. Pagos Programados (programar pagos desde tesorería)
 *   2. Pagos Realizados (pagos ya ejecutados / OC aprobadas por jefe de compras)
 */

export type TipoCalendario = 'PROGRAMADOS' | 'VISTO_BUENO';

export type EstadoEventoPago =
  | 'PENDIENTE'
  | 'PROGRAMADO'
  | 'PAGADO'
  | 'VENCIDO'
  | 'CANCELADO';

export interface EventoPago {
  id: number;
  titulo: string;
  fecha: string;              // YYYY-MM-DD
  monto: number;
  proveedorNombre: string;
  proveedorNit?: string;
  numeroDocumento?: string;
  ordenCompra?: string;
  estado: EstadoEventoPago;
  tipo: TipoCalendario;
  // Referencia al registro contable o tramite
  registroContableId?: number;
  tramiteId?: number;
  solicitudCompraId?: number;
  // Info adicional
  formaPago?: string;
  observaciones?: string;
  creadoPor?: string;
  fechaCreacion?: string;
  // Campos para movimientos diarios (pagos realizados)
  bancoNombre?: string;
  bancoId?: number;
  comprobantesUrls?: string[];
  totalIngresos?: number;
  totalEgresos?: number;
  movimientoDiarioId?: number;
}

export interface DiaCalendario {
  fecha: Date;
  esHoy: boolean;
  esMesActual: boolean;
  eventos: EventoPago[];
}

export interface MesCalendario {
  anio: number;
  mes: number;            // 0-11
  nombreMes: string;
  dias: DiaCalendario[];
}

export const ESTADO_EVENTO_CONFIG: Record<
  EstadoEventoPago,
  { label: string; color: string; bgClass: string; icon: string }
> = {
  PENDIENTE: {
    label: 'Pendiente',
    color: '#f59e0b',
    bgClass: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: '⏳',
  },
  PROGRAMADO: {
    label: 'Programado',
    color: '#8b5cf6',
    bgClass: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: '📅',
  },
  PAGADO: {
    label: 'Pagado',
    color: '#10b981',
    bgClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: '✅',
  },
  VENCIDO: {
    label: 'Vencido',
    color: '#ef4444',
    bgClass: 'bg-red-100 text-red-800 border-red-300',
    icon: '⚠️',
  },
  CANCELADO: {
    label: 'Cancelado',
    color: '#6b7280',
    bgClass: 'bg-gray-100 text-gray-500 border-gray-300 line-through',
    icon: '❌',
  },
};

export const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
