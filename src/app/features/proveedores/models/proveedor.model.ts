export type FormaPago = 'TRANSFERENCIA' | 'CHEQUE' | 'TARJETA' | 'CAJA_MENOR' | 'NEQUI' | 'DAVIPLATA';

export type TipoPersona =
  | 'PERSONA_NATURAL_DECLARANTE'
  | 'PERSONA_NATURAL_NO_DECLARANTE'
  | 'PERSONA_JURIDICA';
export type TipoContribuyente =
  | 'REGIMEN_COMUN'
  | 'REGIMEN_SIMPLE'
  | 'GRAN_CONTRIBUYENTE'
  | 'NO_RESPONSABLE_IVA';

/** Cuenta bancaria adicional de un proveedor */
export interface CuentaBancaria {
  banco: string;
  numeroCuenta: string;
  tipoCuenta?: 'AHORROS' | 'CORRIENTE';
  esPrincipal?: boolean;
}

export interface Proveedor {
  id?: number;
  nombreProveedor: string;
  nit: string;
  direccion: string;
  telefono: string;
  correoElectronico: string;
  nombreRepresentanteLegal: string;
  cedulaRepresentanteLegal: string;
  condicionesPago: string;
  numeroCuenta: string;
  banco: string;
  formaPago: FormaPago;
  concepto: string;
  numeroComprobante: string;
  // Información Tributaria
  tipoPersona?: TipoPersona;
  tipoContribuyente?: TipoContribuyente;
  actividadEconomica?: string;
  responsableIva?: boolean;
  autorretenedor?: boolean;
  sujetoRetencion?: boolean;
  /** Porcentaje de retención de ICA */
  reteIca?: number;
  // Configuración de Retención
  configuracionRetencionId?: number;
  conceptoRetencion?: string;
  tipoOperacionRetencion?: string;
  tipoPersonaRetencion?: string;
  // ReteICA
  reteicaTarifaId?: number;
  reteicaMunicipio?: string;
  reteicaActividadEconomica?: string;
  reteicaTarifaPorMil?: number;
  rutUrl?: string;
  camaraComercioUrl?: string;
  ccRepresentanteUrl?: string;
  rutRepresentanteUrl?: string;
  estadosFinancierosUrl?: string;
  certificadoBancarioUrl?: string;
  /** Cuentas bancarias adicionales */
  cuentasBancarias?: CuentaBancaria[];
  estado?: string;
  creadoPor?: string;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}

export interface ProveedorRequest {
  nombreProveedor: string;
  nit: string;
  direccion: string;
  telefono: string;
  correoElectronico: string;
  nombreRepresentanteLegal: string;
  cedulaRepresentanteLegal: string;
  condicionesPago: string;
  numeroCuenta: string;
  banco: string;
  formaPago: string;
  concepto: string;
  numeroComprobante: string;
  // Información Tributaria
  tipoPersona?: string;
  tipoContribuyente?: string;
  actividadEconomica?: string;
  responsableIva?: boolean;
  autorretenedor?: boolean;
  sujetoRetencion?: boolean;
  // Configuración de Retención
  configuracionRetencionId?: number;
  conceptoRetencion?: string;
  // ReteICA
  reteicaTarifaId?: number;
}

export interface StatsProveedores {
  totalProveedores: number;
  proveedoresActivos: number;
  proveedoresInactivos: number;
  proveedoresMes: number;
}

export const FORMAS_PAGO: { value: FormaPago; label: string; icon: string }[] =
  [
    { value: 'TRANSFERENCIA', label: 'Transferencia', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📝' },
    { value: 'TARJETA', label: 'Tarjeta', icon: '💳' },
    { value: 'CAJA_MENOR', label: 'Caja menor', icon: '💰' },
    { value: 'NEQUI', label: 'Nequi', icon: '📱' },
    { value: 'DAVIPLATA', label: 'Daviplata', icon: '📱' },
  ];

export const TIPOS_CUENTA: { value: string; label: string }[] = [
  { value: 'AHORROS', label: 'Ahorros' },
  { value: 'CORRIENTE', label: 'Corriente' },
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

export const CONCEPTOS_PROVEEDOR: string[] = [
  'Compra de hardware',
  'Compra de software',
  'Servicios profesionales',
  'Mantenimiento',
  'Suministros de oficina',
  'Materia prima',
  'Transporte y logística',
  'Servicios generales',
  'Arrendamiento',
  'Publicidad y marketing',
  'Consultoría',
  'Otro',
];

export const TIPOS_PERSONA: {
  value: TipoPersona;
  label: string;
  icon: string;
}[] = [
  { value: 'PERSONA_JURIDICA', label: 'Persona Jurídica', icon: '🏢' },
  {
    value: 'PERSONA_NATURAL_DECLARANTE',
    label: 'Persona Natural Declarante',
    icon: '👤',
  },
  {
    value: 'PERSONA_NATURAL_NO_DECLARANTE',
    label: 'Persona Natural No Declarante',
    icon: '👤',
  },
];

export const TIPOS_CONTRIBUYENTE: {
  value: TipoContribuyente;
  label: string;
}[] = [
  { value: 'REGIMEN_COMUN', label: 'Régimen Común' },
  { value: 'REGIMEN_SIMPLE', label: 'Régimen Simple de Tributación' },
  { value: 'GRAN_CONTRIBUYENTE', label: 'Gran Contribuyente' },
  { value: 'NO_RESPONSABLE_IVA', label: 'No Responsable de IVA' },
];
