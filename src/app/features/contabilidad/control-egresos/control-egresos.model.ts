export interface FacturaEgreso {
  pagoId?: number;
  /** "Factura CC-17-20260020" o el nombre del beneficiario. */
  concepto?: string | null;
  monto?: number;
  /** Fecha proyectada "YYYY-MM-DD". */
  fecha?: string | null;
  /** proyectado | pagado | cancelado */
  estado?: string | null;
  aprobado?: boolean;
}

export interface EgresoRegistrado {
  numeroEgreso?: string | null;
  soporteEgresoNombre?: string | null;
  soporteEgresoKey?: string | null;
  id?: number;
  numeroFactura: string;
  nitProveedor: string;
  proveedorNombre?: string;
  valor: number;
  reteFuente?: number;
  reteFuenteTarifa?: number;
  reteFuenteBaseMinima?: number;
  reteFuenteOrigen?: string;
  reteIca?: number;
  reteIcaTarifa?: number;
  reteIcaOrigen?: string;
  valorNetoPagar?: number;
  tipoOperacion?: string;
  /** Tarifa ICA por mil leída del comprobante (se envía al guardar) */
  tarifaIcaPorMil?: number;
  /** Ajuste manual de retenciones (se envían al guardar) */
  reteFuenteManual?: number;
  reteIcaManual?: number;
  fecha: string;
  cuenta?: string;
  estado?: string;
  observaciones?: string;
  creadoPor?: string;
  solicitadoPor?: string;
  causalEliminacion?: string;
  /** Observación de Gerencia Financiera al rechazar un egreso en revisión. */
  motivoRevision?: string;
  pagoProyectadoId?: number;
  /** Facturas (pagos proyectados) que cubre el egreso: un egreso por proveedor. */
  pagosProyectadosIds?: number[] | null;
  /** Detalle de las facturas cubiertas (consulta por id). */
  facturas?: FacturaEgreso[] | null;
  empresaId?: number;
  empresaNombre?: string;
  conceptoPresupuestal?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CotizacionEgreso {
  reteFuente: number;
  reteFuenteTarifa?: number;
  reteFuenteBaseMinima?: number;
  reteFuenteOrigen?: string;
  reteIca: number;
  reteIcaTarifa?: number;
  reteIcaOrigen?: string;
  valorNetoPagar: number;
  tipoOperacion?: string;
}

export interface CheckDuplicadoResponse {
  existe: boolean;
  registro?: EgresoRegistrado;
  /** La factura ya existe en otros registros (distinto NIT/valor/fecha) */
  facturaDuplicada?: boolean;
  otrosRegistros?: EgresoRegistrado[];
}

/** Causales de cancelación o eliminación de egresos */
export const CAUSALES_ELIMINACION: string[] = [
  'Egreso creado por error',
  'Egreso duplicado',
  'Valor incorrecto',
  'Beneficiario incorrecto',
  'Cuenta bancaria incorrecta',
  'Concepto incorrecto',
  'Soporte inválido',
  'Soporte inexistente',
  'Factura anulada',
  'Operación anulada',
  'Pago no autorizado',
  'Falta de aprobación',
  'Cambio en el valor a pagar',
  'Nota crédito aplicada',
  'Obligación cancelada',
  'Servicio o producto no adquirido',
  'Error contable',
  'Error de parametrización',
  'Centro de costo incorrecto',
  'Cuenta contable incorrecta',
  'Datos del proveedor incorrectos',
  'Pago rechazado por la entidad financiera',
  'Cuenta bancaria inactiva o bloqueada',
  'Cambio de beneficiario',
  'Solicitud de cancelación del área responsable',
  'Registro generado fuera del proceso autorizado',
  'Registro generado en período incorrecto',
  'Incumplimiento de requisitos documentales',
  'Inconsistencia entre factura y egreso',
  'Reversión de la operación',
  'Cambio en las condiciones de pago',
  'Error en la fecha de pago',
  'Error en el tipo de moneda',
  'Error en la tasa de cambio',
  'Egreso no corresponde a la operación',
  'Egreso generado por error del sistema',
  'Egreso generado por carga masiva incorrecta',
  'Proveedor no autorizado',
  'Operación sujeta a revisión o auditoría',
  'Otra causal debidamente justificada',
];

export interface HistorialEstadoEgreso {
  id?: number;
  estadoAnterior: string | null;
  estadoNuevo: string;
  usuario: string | null;
  comentario: string | null;
  fecha: string;
}

export interface EgresoHistoricoItem {
  id: number;
  fecha: string;
  comprobante: string | null;
  numeroEgreso?: string | null;
  nombre?: string | null;
  tercero?: string | null;
  nit?: string | null;
  monto: number;
  estado: string;
  origen: string;
  observaciones?: string | null;
  historialEstados?: HistorialEstadoEgreso[];
}

export interface HistoricoEgresosResponse {
  total: number;
  page: number;
  items: EgresoHistoricoItem[];
}
