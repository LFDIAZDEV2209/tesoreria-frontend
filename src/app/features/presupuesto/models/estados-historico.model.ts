export interface EstadoTransicion {
  id: number;
  entidad: string;
  entidad_id: number;
  etiqueta: string;
  modulo: string;
  periodo: string;
  tercero: string;
  tercero_nombre: string;
  monto: number;
  estado_anterior: string;
  estado_nuevo: string;
  usuario: string;
  observacion: string;
  created_at: string;
  estado_actual: string;
}

export interface HistoricoEstadosResponse {
  total: number;
  page: number;
  size: number;
  content: EstadoTransicion[];
}

/** Etiqueta legible del estado unificado del historial. */
export const ETIQUETA_ESTADO: Record<string, string> = {
  sugerido: 'Sugerido (pendiente de aprobación)',
  aprobado: 'Aprobado',
  pagado: 'Pagado',
  cancelado: 'Cancelado (rechazo)',
  eliminado: 'Eliminado',
};

export const ICONO_ESTADO: Record<string, string> = {
  sugerido: 'clock',
  aprobado: 'check',
  pagado: 'check-check',
  cancelado: 'x',
  eliminado: 'trash',
};

/** El badge compartido reconoce aprobado/pendiente/pagado/cancelado/rechazado. */
export function badgeEstado(estado: string): string {
  switch (estado) {
    case 'sugerido': return 'pendiente';
    case 'eliminado': return 'cancelado';
    default: return estado;
  }
}

export const ETIQUETA_MODULO: Record<string, string> = {
  proveedores: 'Proveedores',
  anticipos: 'Anticipos',
  cx_pagar: 'Cuentas por pagar',
  cx_cobrar: 'Cuentas por cobrar',
  impuestos: 'Impuestos, estampillas y seguros',
  nomina: 'Nómina',
  manual: 'Provisiones (manual)',
  importado: 'Importado',
};

export const ESTADOS_FILTRO: { valor: string; etiqueta: string }[] = [
  { valor: 'sugerido', etiqueta: 'Sugeridos / pendientes' },
  { valor: 'aprobado', etiqueta: 'Aprobados' },
  { valor: 'pagado', etiqueta: 'Pagados' },
  { valor: 'cancelado', etiqueta: 'Cancelados' },
  { valor: 'eliminado', etiqueta: 'Eliminados' },
];

export const MODULOS_FILTRO: { valor: string; etiqueta: string }[] =
  Object.entries(ETIQUETA_MODULO).map(([valor, etiqueta]) => ({ valor, etiqueta }));

const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const horaCorta = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });

export function fechaEstado(valor: string): string {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fechaCorta.format(fecha) + ', ' + horaCorta.format(fecha);
}
