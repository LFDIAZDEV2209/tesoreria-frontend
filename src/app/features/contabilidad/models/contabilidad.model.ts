// ── Tipos de Documento ──
export type TipoDocumento =
  | 'FACTURA_ELECTRONICA'
  | 'CUENTA_COBRO'
  | 'DOCUMENTO_EQUIVALENTE';

export type TipoRegistro = 'GASTO' | 'COSTO' | 'ACTIVO_FIJO' | 'DIFERIDO';

export type FormaPagoContabilidad =
  | 'TRANSFERENCIA'
  | 'CHEQUE'
  | 'TARJETA'
  | 'CAJA_MENOR';

export type EstadoContable =
  | 'EN_REVISION'
  | 'CAUSADO'
  | 'CONTABILIZADO'
  | 'PROGRAMADO_PAGO'
  | 'PAGADO'
  | 'DEVUELTO';

// ── Parametrización de cuenta contable ──
export interface CuentaContableParam {
  codigo: string;
  nombre: string;
  tipo: TipoRegistro;
  naturaleza: 'DEBITO' | 'CREDITO';
  descripcion?: string;
  activa: boolean;
}

// ── Resultado OCR de contabilidad ──
export interface OcrContabilidadResult {
  numeroEgreso: string;
  cuentaContable: string;
  debito: number;
  credito: number;
  fecha?: string;
  descripcion?: string;
  proveedor?: string;
  nit?: string;
  empresa?: string;
  observaciones?: string;
  confianzaOCR: number;
  lineas?: LineaEgreso[];
}

// ── Línea de egreso (cada fila del comprobante) ──
export interface LineaEgreso {
  id?: number;
  numero: number;
  cuentaContable: string;
  cuentaContableCodigo?: string;
  tercero: string;
  detalle: string;
  descripcion: string;
  debito: number;
  credito: number;
  origen?: string;
}

// ── Validación de asiento contable ──
export interface ValidacionContable {
  debitoTotal: number;
  creditoTotal: number;
  diferencia: number;
  esCorrecto: boolean;
  mensaje: string;
}

// ── Asociación egreso ↔ orden de compra ──
export interface EgresoOrdenCompra {
  id?: number;
  numeroEgreso: string;
  ordenCompraNumero: string;
  requisicionNumero?: string;
  valorEgreso: number;
  valorOrdenCompra: number;
  valorRequisicion?: number;
  diferenciasEgreso: number;
  diferenciasOc?: number;
  diferenciasOC?: number;
  coincide: boolean;
}

export interface DetalleProveedorContable {
  proveedorNombre: string;
  proveedorNit?: string;
  numeroOC?: string;
  valorOC?: number;
  archivoOcUrl?: string;
  nombreArchivoOC?: string;
}

// ── Interfaces ──
export interface RegistroContable {
  id?: number;
  solicitudCompraId?: number;
  fuente?: 'CONTABILIDAD' | 'COMPRA';

  // 0. Empresa
  empresa?: string;

  // 1. Documento Soporte
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaDocumento: string;
  fechaRecepcion: string;
  proveedorTercero: string;
  nitIdentificacion: string;

  // 2. Valores
  valorBruto: number;
  descuentos: number;
  subtotal: number;
  iva: number;
  reteFuente: number;
  reteIva: number;
  reteIca: number;
  otrosImpuestos: number;
  valorNetoPagar: number;

  // 3. Clasificación Contable
  tipoRegistro: TipoRegistro;
  cuentaContable: string;
  subcuentaAuxiliar: string;
  centroCostos: string;
  proyecto: string;
  lineaUnidadNegocio: string;

  // 4. Activo Fijo
  codigoActivo?: string;
  tipoActivo?: string;
  vidaUtil?: number;
  metodoDepreciacion?: string;
  responsableActivo?: string;
  ubicacionActivo?: string;
  fechaPuestaUso?: string;

  // 5. Proveedor
  proveedorId?: number;
  proveedorNombre?: string;
  proveedorNit?: string;
  detallesProveedores?: DetalleProveedorContable[];

  // 6. Fechas Clave
  fechaCausacion: string;
  fechaVencimiento: string;
  fechaEstimadaPago: string;

  // 7. Datos de Pago
  formaPago: FormaPagoContabilidad;
  bancoCuenta: string;
  numeroComprobante: string;

  // 7. Control
  numeroSolicitudAsociada?: string;
  ordenCompra?: string;
  estado: EstadoContable;
  responsableRegistro: string;
  observaciones?: string;

  // Egreso OCR
  numeroEgreso?: string;
  lineasEgreso?: LineaEgreso[];
  asociacionesEgreso?: EgresoOrdenCompra[];
  totalDebitoLineas?: number;

  // 8. Adjuntos (URLs persistidas)
  facturaElectronicaUrl?: string;
  ordenCompraUrl?: string;
  vistoBuenoUrl?: string;
  documentoCausacionUrl?: string;
  otrosSoportesUrls?: string[];
  // Retrocompatibilidad
  cotizacionAprobadaUrl?: string;
  actaRecibidoUrl?: string;
  soporteAlmacenUrl?: string;

  // Auditoría
  creadoPor?: string;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}

export interface ContabilidadRequest {
  solicitudCompraId?: number;
  empresa?: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fechaDocumento: string;
  fechaRecepcion: string;
  proveedorTercero: string;
  nitIdentificacion: string;
  valorBruto: number;
  descuentos: number;
  subtotal: number;
  iva: number;
  reteFuente: number;
  reteIva: number;
  reteIca: number;
  otrosImpuestos: number;
  valorNetoPagar: number;
  tipoRegistro: string;
  cuentaContable: string;
  subcuentaAuxiliar: string;
  centroCostos: string;
  proyecto: string;
  lineaUnidadNegocio: string;
  codigoActivo?: string;
  tipoActivo?: string;
  vidaUtil?: number;
  metodoDepreciacion?: string;
  responsableActivo?: string;
  ubicacionActivo?: string;
  fechaPuestaUso?: string;
  proveedorId?: number;
  fechaCausacion: string;
  fechaVencimiento: string;
  fechaEstimadaPago: string;
  formaPago: string;
  bancoCuenta: string;
  numeroComprobante: string;
  numeroSolicitudAsociada?: string;
  ordenCompra?: string;
  estado?: string;
  responsableRegistro: string;
  observaciones?: string;
  numeroEgreso?: string;
  lineasEgreso?: LineaEgreso[];
  asociacionesEgreso?: EgresoOrdenCompra[];
}

export interface StatsContabilidad {
  totalRegistros: number;
  registrosCausados: number;
  registrosContabilizados: number;
  registrosProgramados: number;
  registrosPagados: number;
  registrosMes: number;
}

export interface SolicitudViaticosContabilidad {
  solicitudViaticosId: number;
  numeroViatico: string;
  tipoSolicitud?: 'ADELANTO' | 'SOLICITUD' | string;
  empresa: string;
  area: string;
  solicitante: string;
  fecha: string;
  fechaMaximaEvento?: string | null;
  proveedor?: string | null;
  totalSolicitud: number;
  estado: 'PENDIENTE' | 'CONTABILIZADO' | string;
  registroContableId?: number | null;
}

export interface ContabilidadArchivos {
  facturaElectronica?: File | null; // Factura XML/PDF — carga manual
  vistoBueno?: File | null; // Soporte Visto Bueno / Acta — carga manual o desde OC
  documentoCausacion?: File | null; // Documento de causación
  otrosSoportes?: File[]; // Múltiples archivos adicionales (cotizaciones, etc.)
  // Retrocompatibilidad
  ordenCompra?: File | null;
  cotizacionAprobada?: File | null;
  actaRecibido?: File | null;
  soporteAlmacen?: File | null;
}

// ── Cuentas contables parametrizadas (catálogo) ──
export const CUENTAS_CONTABLES_CATALOGO: CuentaContableParam[] = [
  {
    codigo: '1105',
    nombre: 'Caja',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1110',
    nombre: 'Bancos',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1305',
    nombre: 'Clientes',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '2205',
    nombre: 'Proveedores nacionales',
    tipo: 'COSTO',
    naturaleza: 'CREDITO',
    activa: true,
  },
  {
    codigo: '2335',
    nombre: 'Costos y gastos por pagar',
    tipo: 'COSTO',
    naturaleza: 'CREDITO',
    activa: true,
  },
  {
    codigo: '2365',
    nombre: 'Retención en la fuente',
    tipo: 'GASTO',
    naturaleza: 'CREDITO',
    activa: true,
  },
  {
    codigo: '2367',
    nombre: 'Impuesto IVA retenido',
    tipo: 'GASTO',
    naturaleza: 'CREDITO',
    activa: true,
  },
  {
    codigo: '2368',
    nombre: 'Impuesto ICA retenido',
    tipo: 'GASTO',
    naturaleza: 'CREDITO',
    activa: true,
  },
  {
    codigo: '5105',
    nombre: 'Gastos de personal',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '5110',
    nombre: 'Honorarios',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '5115',
    nombre: 'Impuestos',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '5120',
    nombre: 'Arrendamientos',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '5135',
    nombre: 'Servicios',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '5140',
    nombre: 'Gastos legales',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '5195',
    nombre: 'Diversos',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '5199',
    nombre: 'Provisiones',
    tipo: 'GASTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '6135',
    nombre: 'Costos de servicios',
    tipo: 'COSTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '7105',
    nombre: 'Costos materia prima',
    tipo: 'COSTO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1520',
    nombre: 'Maquinaria y equipo',
    tipo: 'ACTIVO_FIJO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1524',
    nombre: 'Equipo de oficina',
    tipo: 'ACTIVO_FIJO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1528',
    nombre: 'Equipo de computación',
    tipo: 'ACTIVO_FIJO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1540',
    nombre: 'Flota y equipo de transporte',
    tipo: 'ACTIVO_FIJO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1705',
    nombre: 'Gastos pagados por anticipado',
    tipo: 'DIFERIDO',
    naturaleza: 'DEBITO',
    activa: true,
  },
  {
    codigo: '1710',
    nombre: 'Cargos diferidos',
    tipo: 'DIFERIDO',
    naturaleza: 'DEBITO',
    activa: true,
  },
];

// ── Constantes para dropdowns ──
export const TIPOS_DOCUMENTO: {
  value: TipoDocumento;
  label: string;
  icon: string;
}[] = [
  { value: 'FACTURA_ELECTRONICA', label: 'Factura electrónica', icon: '🧾' },
  { value: 'CUENTA_COBRO', label: 'Cuenta de cobro', icon: '📄' },
  {
    value: 'DOCUMENTO_EQUIVALENTE',
    label: 'Documento equivalente',
    icon: '📋',
  },
];

export const TIPOS_REGISTRO: {
  value: TipoRegistro;
  label: string;
  icon: string;
}[] = [
  { value: 'GASTO', label: 'Gasto', icon: '💸' },
  { value: 'COSTO', label: 'Costo', icon: '📊' },
  { value: 'ACTIVO_FIJO', label: 'Activo fijo', icon: '🏗️' },
  { value: 'DIFERIDO', label: 'Diferido', icon: '📅' },
];

export const FORMAS_PAGO_CONTABILIDAD: {
  value: FormaPagoContabilidad;
  label: string;
  icon: string;
}[] = [
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: '🏦' },
  { value: 'CHEQUE', label: 'Cheque', icon: '📝' },
  { value: 'TARJETA', label: 'Tarjeta', icon: '💳' },
  { value: 'CAJA_MENOR', label: 'Caja menor', icon: '💰' },
];

export const ESTADOS_CONTABLES: {
  value: EstadoContable;
  label: string;
  icon: string;
  color: string;
}[] = [
  { value: 'EN_REVISION', label: 'En revisión', icon: '🔍', color: '#6b7280' },
  { value: 'CAUSADO', label: 'Causado', icon: '📌', color: '#f59e0b' },
  {
    value: 'CONTABILIZADO',
    label: 'Contabilizado',
    icon: '✅',
    color: '#3b82f6',
  },
  {
    value: 'PROGRAMADO_PAGO',
    label: 'Programado para pago',
    icon: '📅',
    color: '#8b5cf6',
  },
  { value: 'PAGADO', label: 'Pagado', icon: '💚', color: '#10b981' },
  { value: 'DEVUELTO', label: 'Devuelto', icon: '↩️', color: '#ef4444' },
];

export const ESTADOS_LABELS: Record<EstadoContable, string> = {
  EN_REVISION: 'En revisión',
  CAUSADO: 'Causado',
  CONTABILIZADO: 'Contabilizado',
  PROGRAMADO_PAGO: 'Programado para pago',
  PAGADO: 'Pagado',
  DEVUELTO: 'Devuelto',
};

export const TIPOS_ACTIVO: string[] = [
  'Equipo de cómputo',
  'Mobiliario y equipo de oficina',
  'Vehículos',
  'Maquinaria y equipo',
  'Edificios y construcciones',
  'Terrenos',
  'Equipo de comunicación',
  'Herramientas',
  'Otro',
];

export const METODOS_DEPRECIACION: string[] = [
  'Línea recta',
  'Reducción de saldos',
  'Suma de dígitos',
  'Unidades de producción',
  'Doble declinación',
];

export const BANCOS_COLOMBIA: string[] = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Banco Popular',
  'Banco AV Villas',
  'Banco Caja Social',
  'Scotiabank Colpatria',
  'Banco Itaú',
  'Banco Agrario',
  'Banco GNB Sudameris',
  'Banco Falabella',
  'Banco Pichincha',
  'Banco Serfinanza',
  'Bancoomeva',
  'Banco W',
  'Nequi',
  'Daviplata',
  'Otro',
];

export const CENTROS_COSTOS: string[] = [
  'Administración',
  'Operaciones',
  'Comercial',
  'Tecnología',
  'Recursos Humanos',
  'Financiero',
  'Producción',
  'Logística',
  'Calidad',
  'Otro',
];
