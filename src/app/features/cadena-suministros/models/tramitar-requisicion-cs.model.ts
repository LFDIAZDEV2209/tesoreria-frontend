/**
 * Modelos para Cadena de Suministros – Bandeja de Visto Bueno
 * ─────────────────────────────────────────────────────────────
 * Copia independiente de los modelos de compras para que las
 * modificaciones en este módulo no afecten al módulo de compras.
 */

// ═══ Requisición de Compra ═══
export interface RequisicionCompra {
  numeroRequisicion: string;
  fecha: string;
  solicitante: string;
  areaCentroCosto: string;
  tipoCompra: string;
  descripcionBreve: string;
  valorEstimado?: number;
  cargo?: string;
  correoElectronico?: string;
  telefonoContacto?: string;
  tipoRequerimiento?: string;
  otroRequerimiento?: string;
  esCompra?: boolean;
  empresaCentroCostos?: string;
  evidenciaUrl?: string;
  vistoBuenoUrl?: string;
  datosAdicionales?: string;
  estado?: string;
  creadoPor?: string;
  fechaCreacion?: string;
}

// ═══ Tipo de Pago ═══
export type TipoPago = 'CONTADO' | 'CREDITO' | 'CONTRA_ENTREGA';

// ═══ Escaneo ═══
export type EstadoEscaneo = 'pendiente' | 'escaneando' | 'completado' | 'error';

// ═══ Fechas de Pago a Crédito ═══
export interface FechaPagoCredito {
  id: string;
  fechaPago: string;
  monto?: number;
  observacion?: string;
  esEstimada: boolean;
}

// ═══ Detalle Diferencia ═══
export interface DetalleDiferencia {
  campo: string;
  valorOC: string | number;
  valorFactura: string | number;
  estado: 'coincide' | 'diferente' | 'advertencia';
}

// ═══ Orden de Compra Cargada ═══
export interface OrdenCompraCargada {
  id: string;
  archivo: File | string;
  archivoUrl?: string;
  nombreArchivo: string;
  tamanoArchivo: number;
  estadoEscaneo: EstadoEscaneo;
  progresoEscaneo: number;
  tipoPago?: TipoPago;
  numeroOC: string;
  proveedor: string;
  nitProveedor?: string;
  fechaEmision: string;
  valorAntesIva: number;
  ivaPorcentaje: number;
  valorIva: number;
  valorTotal: number;
  responsableCompra: string;
  descripcionItems?: string;
  condicionesPago?: string;
  tiempoEntrega?: string;
  confianzaOCR: number;
  facturaArchivo?: File | string;
  facturaNombreArchivo?: string;
  facturaTamanoArchivo?: number;
  facturaEstadoEscaneo?: EstadoEscaneo;
  facturaProgresoEscaneo?: number;
  facturaNumero?: string;
  facturaProveedor?: string;
  facturaNitProveedor?: string;
  facturaFechaEmision?: string;
  facturaValorAntesIva?: number;
  facturaIvaPorcentaje?: number;
  facturaValorIva?: number;
  facturaValorTotal?: number;
  facturaDescripcionItems?: string;
  facturaConfianzaOCR?: number;
  observacionDocFacturacion?: string;
  comparacionCoincide?: boolean;
  comparacionDiferencia?: number;
  comparacionPorcentaje?: number;
  comparacionDetalles?: DetalleDiferencia[];
  creditoFechasPago?: FechaPagoCredito[];
  creditoObservacionesOC?: string;
  creditoFechaEntrega?: string;
  creditoPlazosDias?: number;
  creditoConsumoDesde?: string;
  creditoConsumoHasta?: string;
  creditoNumeroDoc?: string;
  creditoCobertura?: string;
  creditoDireccionEntrega?: string;
  creditoContactoEntrega?: string;
}

// ═══ Cotización ═══
export interface Cotizacion {
  id: number;
  numeroRequisicion: string;
  proveedor: string;
  valorCotizadoSinIva: number;
  ivaPorcentaje: number;
  valorTotalCotizado: number;
  moneda: string;
  fechaCotizacion: string;
  archivoCotizacion?: File | string;
  estadoProveedor: 'SELECCIONADO' | 'NO_SELECCIONADO' | 'PENDIENTE';
}

// ═══ Comparativo ═══
export type CriterioSeleccion = 'PRECIO' | 'TIEMPO' | 'CALIDAD' | 'OTRO';

export interface ComparativoSeleccion {
  numeroRequisicion: string;
  cotizaciones: Cotizacion[];
  criterioSeleccion: CriterioSeleccion;
  proveedorSeleccionado: string;
  justificacionBreve: string;
  aprobador: string;
  aprobado: boolean;
}

// ═══ Orden de Compra ═══
export interface OrdenCompra {
  numeroOC: string;
  numeroRequisicion: string;
  proveedor: string;
  valorAntesIva: number;
  ivaPorcentaje: number;
  valorIva: number;
  valorTotal: number;
  fechaEmision: string;
  archivoOC?: File | string;
  responsableCompra: string;
}

// ═══ Factura ═══
export interface FacturaCargada {
  id: string;
  archivo: File | string;
  nombreArchivo: string;
  tamanoArchivo: number;
  estadoEscaneo: EstadoEscaneo;
  progresoEscaneo: number;
  numeroFactura: string;
  proveedor: string;
  nitProveedor?: string;
  fechaEmision: string;
  valorAntesIva: number;
  ivaPorcentaje: number;
  valorIva: number;
  valorTotal: number;
  descripcionItems?: string;
  condicionesPago?: string;
  confianzaOCR: number;
  ordenCompraAsociadaId?: string;
}

// ═══ Comparación OC vs Factura ═══
export interface ComparacionOcFactura {
  ordenCompraId: string;
  facturaId: string;
  numeroOC: string;
  numeroFactura: string;
  proveedorOC: string;
  proveedorFactura: string;
  valorTotalOC: number;
  valorTotalFactura: number;
  diferencia: number;
  porcentajeDiferencia: number;
  coincide: boolean;
  detallesDiferencia: DetalleDiferencia[];
}

// ═══ Recepción del Recurso ═══
export type EstadoRecepcion = 'COMPLETA' | 'PARCIAL' | 'RECHAZADA';

export interface RecepcionRecurso {
  numeroOC: string;
  fechaRecepcion: string;
  recibidoPor: string;
  estadoRecepcion: EstadoRecepcion;
  observaciones: string;
  archivoEvidencia?: File | string;
}

// ═══ Entrega del Recurso ═══
export type EstadoEntrega = 'COMPLETA' | 'PARCIAL';

export interface EntregaRecurso {
  numeroOCRequisicion: string;
  fechaEntrega: string;
  entregadoA: string;
  areaDestino: string;
  estadoEntrega: EstadoEntrega;
  observaciones: string;
  archivoEvidencia?: File | string;
}

// ═══ Visto Bueno ═══
export type EstadoVistoBueno =
  | 'PENDIENTE'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'ACEPTADO_CON_NOVEDAD';

export interface VistoBuenoJefe {
  estado: EstadoVistoBueno;
  motivoRechazo?: string;
  causacionNovedad?: string;
  observaciones?: string;
  novedades?: string;
  fechaRevision?: string;
  revisadoPor?: string;
}

export interface VistoBuenoResponse {
  id: number;
  tramiteId: number;
  estado: EstadoVistoBueno;
  observaciones?: string;
  novedades?: string;
  revisadoPor?: string;
  fechaRevision: string;
}

export interface CausacionCatalogo {
  id: number;
  descripcion: string;
  tipo: 'RECHAZO' | 'ACEPTACION_CON_NOVEDAD';
  activo: boolean;
}

// ═══ Estado del Trámite ═══
export type EstadoTramite =
  | 'EN_PROCESO'
  | 'VISTO_BUENO'
  | 'ESPERANDO_VISTO_BUENO'
  | 'APROBADO_JEFE'
  | 'RECHAZADO_JEFE'
  | 'ACEPTADO_CON_NOVEDAD'
  | 'ESPERANDO_CONTABILIDAD'
  | 'EN_CONTABILIDAD'
  | 'APROBADO_CONTABILIDAD'
  | 'APROBADO_DIRECTOR'
  | 'APROBADO_GERENTE'
  | 'COMPLETADO';

// ═══ TramiteRequisicion (modelo principal) ═══
export interface TramiteRequisicion {
  id?: number;
  solicitudCompraId: number;
  estadoTramite: EstadoTramite;
  pasoActual: number;
  tipoPago?: TipoPago;
  requisicion: RequisicionCompra;
  cotizaciones: Cotizacion[];
  comparativo?: ComparativoSeleccion;
  ordenCompra?: OrdenCompra;
  ordenesCargadas: OrdenCompraCargada[];
  facturasCargadas?: FacturaCargada[];
  comparacionesOcFactura?: ComparacionOcFactura[];
  vistoBuenoJefe?: VistoBuenoJefe;
  recepcion?: RecepcionRecurso;
  entrega?: EntregaRecurso;
  enviadoContabilidad: boolean;
  respuestaContabilidad: boolean;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}
