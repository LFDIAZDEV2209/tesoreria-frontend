export type EstadoMovimiento = 'Pendiente' | 'Pagado' | 'Conciliado' | 'Completo' | 'Error' | 'Duplicado';

export interface ArchivoAdjunto {
  nombre: string;
  url: string;
  tipo: string; // 'OC' | 'EGRESO' | 'PAGO'
}

/** Detalle de proveedor + OC + egreso dentro de una solicitud */
export interface DetalleSolicitudItem {
  proveedorRelacionId?: number;
  proveedorNombre: string;
  proveedorNit?: string;
  proveedorBanco?: string;
  proveedorNumeroCuenta?: string;
  proveedorFormaPago?: string;
  numeroOc?: string;
  archivoOcUrl?: string;
  archivoOcNombre?: string;
  valorOc?: number;
  fechaEmisionOc?: string;
  estadoEgreso: string;
  numeroEgreso?: string;
  valorEgreso?: number;
  archivosEgresoDetalle?: ArchivoAdjunto[];
  // Conciliation fields (persisted when finalizing payment)
  valorPagado?: number;
  matchPorcentaje?: number;
  tipoPago?: string;
  porcentajePago?: number;
  nombreComprobantePago?: string;
}

export interface MovimientoBancario {
  id: number;
  tipoMovimiento: string;
  fechaPago: string;
  empresaUt: string;
  /** Área / departamento del requerimiento */
  areaDepartamento?: string;
  banco: string;
  cuenta: string;
  valor: number;
  estadoOc: EstadoMovimiento;
  estadoEgreso: EstadoMovimiento;
  estadoPago: EstadoMovimiento;
  referencia: string;
  concepto: string;
  proveedor: string;
  archivoOcUrl: string | null;
  archivoEgresoUrl: string | null;
  archivoPagoUrl: string | null;
  /** Archivos múltiples de OC adjuntados desde compras */
  archivosOc?: ArchivoAdjunto[];
  /** Archivos múltiples de egreso adjuntados desde contabilidad */
  archivosEgreso?: ArchivoAdjunto[];
  /** Archivos múltiples de pago adjuntados desde tesorería */
  archivosPago?: ArchivoAdjunto[];
  /** Desglose de proveedores, OC y egresos (solo para Solicitud Compra) */
  detalles?: DetalleSolicitudItem[];
  /** Cantidad total de proveedores */
  totalProveedores?: number;
  /** Cantidad total de órdenes de compra */
  totalOrdenes?: number;
}

export interface FiltroMovimientos {
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  banco?: string | null;
  empresaUt?: string | null;
  busqueda?: string | null;
  pageIndex?: number;
  pageSize?: number;
  sortBy?: keyof MovimientoBancario | string;
  sortDirection?: 'asc' | 'desc' | '';
}

export interface PagedResult<T> {
  data: T[];
  total: number;
}
