/**
 * Modelo de Solicitud de Tesorería - Módulo Tesorería Empresa Demo
 */

export type TipoRequerimiento =
  | 'MANTENIMIENTO'
  | 'VIATICOS'
  | 'MATERIA_PRIMA'
  | 'FUMIGACION'
  | 'PRESUPUESTO'
  | 'COMPRA_INSUMOS'
  | 'SERVICIOS_GENERALES'
  | 'COMPRA_HARDWARE'
  | 'DOTACION'
  | 'MESA_AYUDA'
  | 'OTRO';

export const TIPO_REQUERIMIENTO_LABELS: Record<TipoRequerimiento, string> = {
  MANTENIMIENTO: 'Mantenimiento',
  VIATICOS: 'Viáticos',
  MATERIA_PRIMA: 'Materia Prima',
  FUMIGACION: 'Fumigación',
  PRESUPUESTO: 'Presupuesto',
  COMPRA_INSUMOS: 'Compra de Insumos',
  SERVICIOS_GENERALES: 'Servicios Generales',
  COMPRA_HARDWARE: 'Compra de Hardware',
  DOTACION: 'Dotación',
  MESA_AYUDA: 'Mesa de Ayuda',
  OTRO: 'Otro (Especificar)'
};

export interface SolicitudTesoreria {
  id?: number;
  fechaSolicitud: string;
  areaDepartamento: string;
  empresaCentroCostos?: string;
  cargo: string;
  nombre: string;
  correoElectronico: string;
  telefonoContacto: string;
  tipoRequerimiento: TipoRequerimiento;
  otroRequerimiento?: string;
  esCompra: boolean;
  observaciones: string;
  datosAdicionales?: string;         // JSON con datos dinámicos según tipo
  evidenciaUrl?: string;
  vistoBuenoUrl?: string;
  estado?: string;
  creadoPor?: string;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}

export interface SolicitudRequest {
  fechaSolicitud: string;
  areaDepartamento: string;
  empresaCentroCostos?: string;
  cargo: string;
  nombre: string;
  correoElectronico: string;
  telefonoContacto: string;
  tipoRequerimiento: TipoRequerimiento;
  otroRequerimiento?: string;
  esCompra: boolean;
  observaciones: string;
  datosAdicionales?: any;            // Datos dinámicos según tipo de requerimiento
}

// ═══════════════════════════════════════════════════════
// INTERFACES PARA DATOS ADICIONALES POR TIPO
// ═══════════════════════════════════════════════════════

export interface MantenimientoData {
  tipoActivo: string;
  codigoActivo: string;
  nombreActivo: string;
  ubicacionExacta: string;
  marcaModelo: string;
  tipoMantenimiento: string;
  fallaDetectada: string;
  sintomaObservado: string;
  detalleProblema: string;
  equipoDetenido: boolean;
  nivelCriticidad: string;
  fechaRequerida: string;
  franjaHoraria: string;
  impactoOperativo: string;
  requiereCompra: boolean;
  presupuestoEstimado: number;
  centroCostos: string;
  proyecto: string;
}

export interface ViaticoItem {
  concepto: string;
  fecha: string;
  detalleFactura: string;
  valorConIva: number;
  fotoFactura?: File | null;
}

export interface ViaticosData {
  items: ViaticoItem[];
}

export interface PresupuestoData {
  tipoPpto: string;
  conceptoGasto: string;
  justificacion: string;
  alcanceEsperado: string;
  beneficioEsperado: string;
  tipoFinanciero: string;
  centroCostos: string;
  proyecto: string;
  presupuestoEstimado: number;
  moneda: string;
  incluyeImpuestos: boolean;
  nivelUrgencia: string;
  impacto: string;
  proveedorSugerido: boolean;
  nombreProveedor: string;
  requiereCotizaciones: number;
  tipoProveedor: string;
  fechaRequerida: string;
  vigenciaPresupuesto: string;
}

export interface MateriaPrimaData {
  datosOCR: string;  // JSON con hojas, kvPairs, textoPlano extraídos por Textract
}

export interface FumigacionData {
  sedeEdificio: string;
  areaEspecifica: string;
  metrajeAproximado: number;
  nivelInfestacion: string;
  tiposControl: string[];
  motivo: string;
  descripcionProblema: string;
  riesgo: string;
  nivelUrgencia: string;
  tipoFinanciero: string;
  centroCostos: string;
  presupuestoEstimado: number;
  contempladoPresupuesto: boolean;
  proveedorSugerido: string;
  proveedorCertificado: boolean;
  numCotizaciones: number;
  tipoServicio: string;
}

export interface ServiciosGeneralesData {
  sedeUbicacion: string;
  tipoServicio: string;
  areaEspecifica: string;
  descripcionServicio: string;
  alcance: string;
  motivo: string;
  impacto: string;
  prioridad: string;
  centroCostos: string;
  presupuestoEstimado: number;
  estaPresupuestado: boolean;
  requiereProveedorExterno: boolean;
  responsableEjecucion: string;
  fechaRequerida: string;
  horarioPreferido: string;
}

export interface CompraHardwareData {
  sedeUbicacion: string;
  tipoHardware: string;
  descripcionEquipo: string;
  marcaSugerida: string;
  modeloSugerido: string;
  procesador: string;
  ram: string;
  disco: string;
  pantalla: string;
  sistemaOperativo: string;
  puertosConectividad: string;
  garantiaMinima: string;
  usuarioAsignado: string;
  cargoUsuario: string;
  procesoFuncion: string;
  tipoUso: string;
  motivoCompra: string;
  tipoFinanciero: string;
  centroCostos: string;
  proyecto: string;
  presupuestoEstimado: number;
  estaPresupuestado: boolean;
  vidaUtilEstimada: string;
  proveedorSugerido: string;
  proveedorHomologado: boolean;
  numCotizaciones: number;
  tiempoEntrega: string;
  registrarActivoFijo: boolean;
  codigoActivo: string;
  responsableActivo: string;
  ubicacionFisica: string;
}

export interface DotacionData {
  // Identificación empresa
  empresaRazonSocial: string;
  nit: string;
  sedeSucursal: string;
  centroCostos: string;
  // Tipo de dotación
  tipoDotacion: string;
  // Especificaciones
  tallaCamisa: string;
  tallaPantalon: string;
  tallaCalzado: string;
  genero: string;
  cantidad: number;
  colorReferencia: string;
  caracteristicasEspeciales: string;
  // Motivo
  motivoSolicitud: string;
  justificacion: string;
  // Financiero
  tipoFinanciero: string;
  valorEstimado: number;
  presupuestoDisponible: boolean;
  // Proveedor
  proveedorSugerido: string;
  proveedorHomologado: boolean;
  numCotizaciones: number;
}

export interface MesaAyudaData {
  // Datos generales del ticket
  numeroTicket: string;
  fechaHoraCreacion: string;

  // Información organizacional
  tipoEmpresa: string;
  nombreEmpresa: string;
  nit: string;
  ciudad: string;
  tieneSedeComplejo: boolean;
  torreBloque: string;
  piso: string;
  oficinaArea: string;

  // Información del solicitante
  nombreCompleto: string;
  cargo: string;
  correoElectronico: string;
  telefono: string;

  // Clasificación del requerimiento
  tipoSolicitud: string;
  subClasificacion: string;
  descripcionIncidente: string;
  fechaIncidente: string;
  archivoAdjuntoUrl: string;

  // Priorización
  urgencia: string;
  impacto: string;

  // Gestión del ticket (para el módulo de gestión)
  estado: string;
  nivel: number;
  diagnostico: string;
  resolucion: string;
  fechaResolucion: string;
  asignadoA: string;
  historialAcciones: TicketAccion[];
}

/** Acción registrada en el timeline del ticket */
export interface TicketAccion {
  id: number;
  fecha: string;
  accion: string;
  descripcion: string;
  usuario: string;
  nivel: number;
}

/** Ticket de Mesa de Ayuda completo para el módulo de gestión */
export interface TicketMesaAyuda {
  id: number;
  numeroTicket: string;
  fechaCreacion: string;
  
  // Información organizacional
  tipoEmpresa: string;
  nombreEmpresa: string;
  nit: string;
  ciudad: string;
  tieneSedeComplejo: boolean;
  torreBloque: string;
  piso: string;
  oficinaArea: string;
  
  // Solicitante
  nombreCompleto: string;
  cargo: string;
  correoElectronico: string;
  telefono: string;
  
  // Clasificación
  tipoSolicitud: string;
  subClasificacion: string;
  descripcionIncidente: string;
  fechaIncidente: string;
  archivoAdjuntoUrl: string;
  
  // Priorización
  urgencia: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  impacto: 'INDIVIDUAL' | 'AREA' | 'EMPRESA';
  
  // Estado
  estado: 'ABIERTO' | 'EN_PROGRESO' | 'ESCALADO' | 'RESUELTO' | 'CERRADO';
  nivel: 1 | 2 | 3;
  diagnostico: string;
  resolucion: string;
  fechaResolucion: string;
  asignadoA: string;
  
  // Timeline
  historialAcciones: TicketAccion[];
}

/** Estadísticas para el dashboard de Mesa de Ayuda */
export interface StatsMesaAyuda {
  totalTickets: number;
  ticketsAbiertos: number;
  ticketsEnProgreso: number;
  ticketsResueltos: number;
  ticketsEscalados: number;
  promedioResolucionHoras: number;
  ticketsPorNivel: {
    nivel1: number;
    nivel2: number;
    nivel3: number;
  };
  ticketsPorUrgencia: {
    baja: number;
    media: number;
    alta: number;
    critica: number;
  };
  ticketsPorTipoSolicitud: { tipo: string; cantidad: number }[];
}

export interface StatsTesoreria {
  totalSolicitudes: number;
  solicitudesMes: number;
  pendientes: number;
  aprobadas: number;
  montoTotal: number;
  areas: number;
}

export interface AreaDepartamento {
  id: number;
  nombre: string;
}

export interface Cargo {
  id: number;
  nombre: string;
}

// ══════════════════════════════════════════════════
// PeopleNet — datos provenientes de companies, areas, employees
// ══════════════════════════════════════════════════

export interface EmpresaPeopleNet {
  id: number;
  nombre: string;
  nit: string;
}

export interface AreaPeopleNet {
  id: number;
  nombre: string;
}

export interface EmpleadoPeopleNet {
  id: number;
  fullName: string;
  idNumber: string;
  documentType: string;
  corporateEmail: string;
  phone: string;
  area: string;
  department: string;
  positionName: string;
  companyName: string;
  directManager: string;
  supervisorName: string;
  status: string;
}
