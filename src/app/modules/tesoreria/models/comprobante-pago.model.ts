/** Campos extraídos del comprobante de pago (CP) vía OCR Textract */
export interface ComprobantePagoOcr {
  fecha: string | null;
  oc: string | null;
  egreso: string | null;
  valorPago: number | null;
  referencia: string | null;
  beneficiario: string | null;
  banco: string | null;
  /** Texto plano devuelto por Textract */
  textoCompleto: string;
  /** Pares clave/valor originales */
  keyValuePairs: { key: string; value: string }[];
  /** Tablas estructuradas extraídas por Textract */
  tables: string[][][] | null;

  // ── Campos Bancolombia "PAGO A PROVEEDORES" ──
  empresa: string | null;
  nit: string | null;
  nombrePago: string | null;
  hora: string | null;
  secuencia: string | null;
  tipoPago: string | null;
  cuentaDebitar: string | null;
  impresoPor: string | null;
  totalRegistros: string | null;
  valorTotalPago: string | null;
  registrosProcesados: string | null;
}

export type CondicionPago = 'TOTAL' | 'PARCIAL';

export type EstadoTramite = 'SIN_CARGAR' | 'PROCESANDO' | 'CARGADO' | 'CONCILIADO' | 'ERROR';

export interface ResultadoConciliacion {
  coincideFecha: boolean;
  coincideOc: boolean;
  coincideEgreso: boolean;
  coincideValor: boolean;
  /** true si todos los campos coinciden */
  conciliado: boolean;
  diferencias: string[];
}

export interface TramitePago {
  movimientoId: number;
  estado: EstadoTramite;
  condicionPago: CondicionPago;
  /** Porcentaje pagado (100 para TOTAL) */
  porcentajePago: number;
  /** Valor efectivamente pagado */
  valorPagado: number;
  /** Valor total esperado del movimiento */
  valorTotal: number;
  ocrData: ComprobantePagoOcr | null;
  conciliacion: ResultadoConciliacion | null;
}

// ── Paso actual del wizard ──
export type PasoTramite = 1 | 2 | 3;

// ── Datos del Proveedor registrado en el sistema ──
export interface ProveedorSistema {
  id: number;
  nombreProveedor: string;
  nit: string | null;
  numeroCuenta: string | null;
  banco: string | null;
  formaPago: string | null;
  condicionesPago: string | null;
  correoElectronico: string | null;
  estado: string | null;
}

// ── Resultado de verificación Proveedor CP vs OC vs Sistema ──
export interface VerificacionProveedor {
  proveedorOC: string | null;
  proveedorCP: string | null;
  proveedorSistema: ProveedorSistema | null;

  coincideNombre: boolean;
  coincideBanco: boolean;
  coincideCuenta: boolean;
  todoCorrecto: boolean;

  diferencias: string[];
}

// ── Datos resumidos de Orden de Compra para comparación ──
export interface OrdenCompraResumen {
  id: string;
  numeroOC: string;
  proveedor: string | null;
  valorTotal: number;
  fechaEmision: string | null;
}

// ── Datos resumidos de Egreso para comparación ──
export interface EgresoResumen {
  id: number;
  numero: string;
  beneficiario: string | null;
  valor: number;
  fecha: string | null;
  estado: string | null;
}

// ── Resultado de comparación de precios entre OC, Egreso y CP ──
export interface ComparacionPrecios {
  valorOC: number | null;
  valorEgreso: number | null;
  valorCP: number | null;
  valorMovimiento: number;

  coincideOcEgreso: boolean;
  coincideOcCp: boolean;
  coincideEgresoCp: boolean;
  todosCoinciden: boolean;

  diferencias: string[];

  ordenCompra: OrdenCompraResumen | null;
  egreso: EgresoResumen | null;
}
