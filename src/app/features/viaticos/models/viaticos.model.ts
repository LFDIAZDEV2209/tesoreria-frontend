export type EstadoViatico =
  | 'EN_REVISION_GERENCIA'
  | 'EN_REVISION_CONTABILIDAD'
  | 'REVISION_TESORERIA'
  | 'APROBADA'
  | 'PAGADO'
  | 'RADICADO'
  | 'EN_REVISION'
  | 'DEVUELTO'
  | 'APROBADO'
  | 'PENDIENTE'
  | 'RECHAZADA';

export const ESTADO_VIATICO_LABELS: Record<EstadoViatico, string> = {
  EN_REVISION_GERENCIA: 'En revisión de gerencia',
  EN_REVISION_CONTABILIDAD: 'En revisión de contabilidad',
  REVISION_TESORERIA: 'Revisión tesorería',
  APROBADA: 'Aprobada',
  PAGADO: 'Pagado',
  RADICADO: 'Radicado',
  EN_REVISION: 'En revisión de gerencia',
  DEVUELTO: 'Devuelto',
  APROBADO: 'Aprobada',
  PENDIENTE: 'En revisión de gerencia',
  RECHAZADA: 'Devuelta',
};

export const ESTADO_VIATICO_COLORS: Record<EstadoViatico, string> = {
  EN_REVISION_GERENCIA:    '#E0A458',
  EN_REVISION_CONTABILIDAD:'#DEB87A',
  REVISION_TESORERIA:      '#7BB8D6',
  APROBADA:                '#7DC4A8',
  PAGADO:                  '#10B981',
  RADICADO:   '#7BB8D6',   // pastel azul
  EN_REVISION:'#DEB87A',   // pastel dorado
  DEVUELTO:   '#DE9090',   // pastel rojo
  APROBADO:   '#7DC4A8',   // pastel verde
  PENDIENTE:  '#DEB87A',   // pastel dorado (igual que EN_REVISION)
  RECHAZADA:  '#DE9090',   // pastel rojo (igual que DEVUELTO)
};

export interface ItemGastoViatico {
  id?: number;
  tipoViatico: string;
  fechaGasto: string;
  conceptoDetallado: string;
  valorBase: number;
  aplicaIva: boolean;
  porcentajeIva: number;
  valorIva: number;
  valorTotal: number;
}

export interface SolicitudViaticos {
  id?: number;
  codigo?: string;
  tipoEmpresa: string;
  nombreEmpresa: string;
  nit: string;
  centroCosto: string;
  areaDependencia: string;
  ciudad: string;
  nombreCompleto: string;
  cargo: string;
  correoElectronico: string;
  telefonoExt: string;
  items: ItemGastoViatico[];
  observaciones: string;
  estado: EstadoViatico;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  creadoPor?: string;
  soportePrincipalUrl?: string;
  soportesAdicionalesUrls?: string[];
  numeroOrdenEgreso?: string;
  montoDesembolsoAprobado?: number;
  respuestaContabilidad?: string;
  observacionesContabilidad?: string;
  comprobantePagoNombre?: string;
  valorComprobantePago?: number;
  fechaTramiteTesoreria?: string;
  tramitadoTesoreriaPor?: string;
}

export interface StatsViaticos {
  total: number;
  enRevision: number;
  devueltas: number;
  aprobadas: number;
  totalMes: number;
  promedioSolicitud: number;
  porTipo: { tipo: string; total: number }[];
  porEstado: { estado: string; cantidad: number }[];
}
