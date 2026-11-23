/**
 * Modelos para Tramitar Requisición — Proceso de 5 pasos
 * ─────────────────────────────────────────────────────────
 * Paso 1: Requisición de Compra (solo consulta)
 * Paso 2: Órdenes de Compra (carga masiva + OCR)
 * Paso 3: Comparativa Planeación vs OC (validación de productos + conversión de unidades) → Envía a Jefe de Compras
 * Paso 4: Recepción del Recurso (bloqueado hasta respuesta de contabilidad)
 * Paso 5: Entrega del Recurso
 */

// ═══ PASO 1: Requisición de Compra ═══
export interface RequisicionCompra {
  numeroRequisicion: string;
  fecha: string;
  solicitante: string;
  areaCentroCosto: string;
  tipoCompra: string;
  descripcionBreve: string;
  valorEstimado?: number;
  // Datos extendidos de la solicitud original
  cargo?: string;
  correoElectronico?: string;
  telefonoContacto?: string;
  tipoRequerimiento?: string;
  otroRequerimiento?: string;
  esCompra?: boolean;
  empresaCentroCostos?: string;
  evidenciaUrl?: string;
  vistoBuenoUrl?: string;
  datosAdicionales?: string; // JSON string con datos específicos del tipo
  estado?: string;
  creadoPor?: string;
  fechaCreacion?: string;
}

// ═══ PASO 2: Cotizaciones ═══
export type EstadoProveedor = 'SELECCIONADO' | 'NO_SELECCIONADO' | 'PENDIENTE';

export interface ItemCotizacion {
  descripcion: string;
  cantidad: number;
  unidad?: string;
  precioUnitario: number;
  subtotal: number;
}

export interface Cotizacion {
  id: number;
  numeroRequisicion: string;
  proveedor: string;
  valorCotizadoSinIva: number;
  ivaPorcentaje: number;
  valorTotalCotizado: number;
  moneda: string;
  fechaCotizacion: string;
  archivoCotizacion?: File | string; // File (upload) o url (guardado)
  estadoProveedor: EstadoProveedor;

  // --- Datos adicionales del proveedor ---
  nitProveedor?: string;
  direccionProveedor?: string;
  telefonoProveedor?: string;
  correoProveedor?: string;
  contactoProveedor?: string;
  ciudadProveedor?: string;

  // --- Datos de la cotización ---
  numeroCotizacion?: string;
  vigenciaCotizacion?: string;
  condicionesPago?: string;
  tiempoEntrega?: string;
  garantia?: string;
  observaciones?: string;
  formaPago?: string;

  // --- Valores desglosados ---
  subtotal?: number;
  descuento?: number;
  retencion?: number;
  valorIva?: number;

  // --- Ítems / productos ---
  items?: ItemCotizacion[];

  // --- Metadatos del documento ---
  tipoDocumento?: string;
  facturaReferencia?: string;
  vencimiento?: string;
  valorEnLetras?: string;
}

// ═══ PASO 3: Comparativo y Selección ═══
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

// ═══ TIPO DE PAGO ═══
export type TipoPago = 'CONTADO' | 'CREDITO' | 'CONTRA_ENTREGA';

// ═══ CLASIFICACIÓN DE ARCHIVOS (paso intermedio para CONTADO) ═══
export type TipoDocumentoArchivo = 'OC' | 'FACTURA';

export interface ArchivoSinClasificar {
  id: string;
  archivo: File;
  nombreArchivo: string;
  tamanoArchivo: number;
  tipoDocumento: TipoDocumentoArchivo | null;
  parejaOcId?: string; // Para facturas: ID del archivo OC al que está asociada
}

// ═══ FECHAS DE PAGO A CRÉDITO ═══
export interface FechaPagoCredito {
  id: string;
  fechaPago: string; // YYYY-MM-DD
  monto?: number; // Monto parcial (opcional — si no se indica, se divide equitativamente)
  observacion?: string; // Nota del usuario
  esEstimada: boolean; // true = calculada automáticamente, false = editada manualmente
}

// ═══ PASO 2: Órdenes de Compra (Carga Masiva + OCR) ═══
export type EstadoEscaneo = 'pendiente' | 'escaneando' | 'completado' | 'error';

export interface OrdenCompraCargada {
  id: string;
  archivo: File | string;
  archivoUrl?: string; // URL persistida en S3 tras la carga
  nombreArchivo: string;
  tamanoArchivo: number;
  estadoEscaneo: EstadoEscaneo;
  progresoEscaneo: number; // 0-100

  // Tipo de pago asignado a esta OC
  tipoPago?: TipoPago;

  // Datos extraídos por OCR
  numeroOC: string;
  proveedor: string;
  proveedorId?: number;
  proveedorNombreOriginalOcr?: string;
  requiereSeleccionProveedor?: boolean;
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
  confianzaOCR: number; // 0-100 confidence

  // ═══ Documento de Facturación (solo CONTADO — opcional) ═══
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
  /** Mensaje de escaneo fallido (p. ej. factura duplicada que NO se adjuntó). */
  facturaMensaje?: string;

  // Observación (requerida si no se adjunta documento de facturación en CONTADO)
  observacionDocFacturacion?: string;

  // Comparación inline OC vs Factura (auto-calculada)
  comparacionCoincide?: boolean;
  comparacionDiferencia?: number;
  comparacionPorcentaje?: number;
  comparacionDetalles?: DetalleDiferencia[];

  // ═══ Datos de crédito (solo cuando tipoPago === 'CREDITO') ═══
  creditoFechasPago?: FechaPagoCredito[]; // Cuotas / fechas de pago
  creditoObservacionesOC?: string; // Texto completo de observaciones extraído por OCR
  creditoFechaEntrega?: string; // F.ENTREGA detectada
  creditoPlazosDias?: number; // Plazo en días (30, 60, 90…)
  creditoConsumoDesde?: string; // CONSUMO fecha inicio
  creditoConsumoHasta?: string; // CONSUMO fecha fin
  creditoNumeroDoc?: string; // N° DOC
  creditoCobertura?: string; // COBERTURA
  creditoDireccionEntrega?: string; // Dirección de entrega detectada
  creditoContactoEntrega?: string; // Persona / teléfono de confirmación
}

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

// ═══ FACTURA (Documento de Facturación para compras a contado) ═══
export interface FacturaCargada {
  id: string;
  archivo: File | string;
  nombreArchivo: string;
  tamanoArchivo: number;
  estadoEscaneo: EstadoEscaneo;
  progresoEscaneo: number;

  // Datos extraídos por OCR
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

  // Referencia a la OC asociada
  ordenCompraAsociadaId?: string;
}

// ═══ RESULTADO OCR PARA FACTURAS (parser especializado) ═══
export interface FacturaOcrResult {
  estadoEscaneo: EstadoEscaneo;
  progresoEscaneo: number;
  facturaNumero: string;
  proveedor: string;
  nitProveedor: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  valorAntesIva: number;
  ivaPorcentaje: number;
  valorIva: number;
  valorTotal: number;
  descripcionItems?: string;
  condicionesPago?: string;
  retencionFuente?: number;
  retencionICA?: number;
  confianzaOCR: number;
}

// ═══ COMPARACIÓN OC vs FACTURA ═══
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

export interface DetalleDiferencia {
  campo: string;
  valorOC: string | number;
  valorFactura: string | number;
  estado: 'coincide' | 'diferente' | 'advertencia';
}

// ═══ PASO 3: Recepción del Recurso ═══
export type EstadoRecepcion = 'COMPLETA' | 'PARCIAL' | 'RECHAZADA';

export interface RecepcionRecurso {
  numeroOC: string;
  fechaRecepcion: string;
  recibidoPor: string;
  estadoRecepcion: EstadoRecepcion;
  observaciones: string;
  archivoEvidencia?: File | string;
}

// ═══ PASO 4: Entrega del Recurso ═══
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

// ═══ ESTADO GENERAL DEL TRÁMITE ═══
export type EstadoPaso = 'pendiente' | 'activo' | 'completado' | 'bloqueado';

export interface PasoTramite {
  numero: number;
  titulo: string;
  subtitulo: string;
  icono: string;
  estado: EstadoPaso;
}

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

export type EstadoTramite =
  | 'EN_PROCESO'
  | 'VISTO_BUENO'
  | 'ESPERANDO_VISTO_BUENO'
  | 'APROBADO_JEFE'
  | 'RECHAZADO_JEFE'
  | 'ACEPTADO_CON_NOVEDAD'
  | 'EN_CADENA_SUMINISTROS'
  | 'ESPERANDO_CONTABILIDAD'
  | 'EN_CONTABILIDAD'
  | 'APROBADO_CONTABILIDAD'
  | 'APROBADO_DIRECTOR'
  | 'APROBADO_GERENTE'
  | 'EN_TESORERIA'
  | 'COMPLETADO'
  | 'RECHAZADO';

// ═══ PROVEEDOR ↔ ORDEN DE COMPRA (asociación por trámite) ═══
export interface ProveedorTramite {
  id?: number;
  tramiteId: number;
  ordenCompraId: string;
  proveedorId: number | null;
  proveedorNombreFinal: string | null;
  proveedorNombreOriginalOcr: string | null;
  requiereSeleccionProveedor: boolean;
  usuarioActualizacion?: string;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  // Datos enriquecidos del catálogo
  proveedorNit?: string | null;
  proveedorNombreCatalogo?: string | null;
  proveedorTelefono?: string | null;
  proveedorCorreo?: string | null;
  proveedorBanco?: string | null;
  proveedorNumeroCuenta?: string | null;
  proveedorFormaPago?: string | null;
  proveedorEstado?: string | null;
}

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
  comparativaPlaneacionOc?: any;
  comparativaBorrador?: any;
  proveedores?: ProveedorTramite[];
  vistoBuenoJefe?: VistoBuenoJefe;
  recepcion?: RecepcionRecurso;
  entrega?: EntregaRecurso;
  // Valores financieros calculados en el backend
  valorTotalOrdenes?: number;
  montoSubtotal?: number;
  ivaPorcentaje?: number;
  ivaValor?: number;
  reteFuenteValor?: number;
  reteIcaValor?: number;
  valorNetoPagar?: number;
  enviadoContabilidad: boolean;
  respuestaContabilidad: boolean;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}

// ═══ CONSTANTES ═══
export const PASOS_TRAMITE: PasoTramite[] = [
  {
    numero: 1,
    titulo: 'Requisición de Compra',
    subtitulo: 'Consulta de datos',
    icono: 'clipboard',
    estado: 'activo',
  },
  {
    numero: 2,
    titulo: 'Órdenes de Compra',
    subtitulo: 'Carga masiva y escaneo OCR',
    icono: 'shopping-cart',
    estado: 'pendiente',
  },
  {
    numero: 3,
    titulo: 'Comparativa Productos',
    subtitulo: 'Planeación vs OC',
    icono: 'chart-bar',
    estado: 'pendiente',
  },
  {
    numero: 4,
    titulo: 'Recepción del Recurso',
    subtitulo: 'Verificación de recepción',
    icono: 'truck',
    estado: 'pendiente',
  },
  {
    numero: 5,
    titulo: 'Entrega del Recurso',
    subtitulo: 'Entrega al solicitante',
    icono: 'hand',
    estado: 'pendiente',
  },
];

export const CRITERIOS_SELECCION: {
  value: CriterioSeleccion;
  label: string;
}[] = [
  { value: 'PRECIO', label: 'Mejor Precio' },
  { value: 'TIEMPO', label: 'Menor Tiempo de Entrega' },
  { value: 'CALIDAD', label: 'Mayor Calidad' },
  { value: 'OTRO', label: 'Otro Criterio' },
];

export const MONEDAS = ['COP', 'USD', 'EUR'];

// ═══ TRACKING TIMELINE ═══
export interface TrackingCausacion {
  id: number;
  vistoBuenoId: number;
  tipo: string;
  motivo: string;
  observaciones?: string;
  esCatalogo?: boolean;
  activo?: boolean;
  orden?: number;
}

export interface TrackingStep {
  stepIndex: number;
  stepKey: string;
  stepLabel: string;
  descripcion: string;
  /** COMPLETADO, EN_CURSO, PENDIENTE, RECHAZADO, APROBADO */
  estado: 'COMPLETADO' | 'EN_CURSO' | 'PENDIENTE' | 'RECHAZADO' | 'APROBADO';
  fecha?: string;
  revisadoPor?: string;
  cargoRevisor?: string;
  observaciones?: string;
  causaciones: TrackingCausacion[];
}

export interface TrackingTimeline {
  tramiteId: number;
  estadoActual: string;
  pasoActual: number;
  pasos: TrackingStep[];
}
