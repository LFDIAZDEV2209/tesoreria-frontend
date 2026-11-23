export const CATEGORIAS_PAE: string[] = [
  'FRUVER', 'ABARROTES', 'PROTEINAS', 'LACTEOS', 'PANIFICADO', 'ASEO', 'AGUA',
  'DULCERIA', 'DOTACIONES', 'GASTOS MEDICOS', 'GASTOS DE GESTION', 'TRANSPORTE',
  'SERVICIOS TELEFONIA', 'PRESTAMOS', 'PRESTAMOS RECIBIDOS', 'OTROS PRESTAMOS',
  'ANTICIPOS PROVEEDORES', 'OTROS ANTICIPOS', 'CUENTAS POR COBRAR', 'EXTERNOS',
  'POLIZAS', 'IMPUESTOS', 'ESTAMPILLAS', 'OTROS',
];

/** Fila del consolidado que agrupa movimientos sin categoría del catálogo
 *  (NULL o un nombre que ya no existe). Mismo texto que el backend; esa
 *  fila no admite Pago Sugerido ni notas. */
export const CATEGORIA_SIN_CLASIFICAR = '(Sin categoría)';

export interface ModuloConfig {
  modulo: string;
  titulo: string;
  puc: string;
  icono: string;
  color: string;
  descripcion: string;
}

export const MODULOS_CFG: ModuloConfig[] = [
  { modulo: 'proveedores', titulo: 'Proveedores', puc: '22050501', icono: 'users', color: '#0F766E', descripcion: 'Cuenta 22050501 — deuda con proveedores' },
  { modulo: 'anticipos', titulo: 'Anticipos', puc: '13300501', icono: 'clock', color: '#7C3AED', descripcion: 'Cuenta 13300501 — anticipos entregados' },
  { modulo: 'cx_pagar', titulo: 'Cuentas por Pagar', puc: '23359501', icono: 'credit-card', color: '#C2410C', descripcion: 'Cuenta 23359501 — cuentas por pagar' },
  { modulo: 'cx_cobrar', titulo: 'Cuentas por Cobrar', puc: '13809502', icono: 'hand-coins', color: '#059669', descripcion: 'Cuenta 13809502 — cuentas por cobrar' },
  { modulo: 'impuestos', titulo: 'Impuestos, Estampillas y Seguros', puc: 'Varias cuentas', icono: 'bank', color: '#D97706', descripcion: 'Impuestos, estampillas y seguros' },
];

export interface Empresa {
  id: number; name: string; nit?: string; ciudad?: string; responsable?: string | null;
}

export interface MaestroProveedor {
  id: number; nit: string; nombre: string; categoria: string | null;
  categoriaDetalle: string | null; pagoSugerido: number | null; observacion: string | null;
}

export interface Movimiento {
  periodo?: string | null;
  id: number; modulo: string; cuentaPuc: string; nit: string; nombre: string;
  categoria: string | null; categoriaDetalle: string | null; comprobante: string | null;
  fecha: string | null; fechaVencimiento: string | null; detalle: string | null;
  debito: number; credito: number; saldo: number; aprobada: boolean | null;
  /** P7: valor legalizado vigente ya descontado del saldo (solo Anticipos). */
  legalizado?: number | null;
}

export interface ResumenCategoria {
  categoria: string | null; debito: number; credito: number; saldo: number; proveedores: number;
}

export interface ResumenModulo {
  resumen: ResumenCategoria[]; totalDebito: number; totalCredito: number;
  totalSaldo: number; totalProveedores: number; totalMovimientos: number;
}

export interface PageResponse<T> {
  content: T[]; page: number; size: number; totalElements: number; totalPages: number;
}

export interface ProveedorPreview {
  nit: string; nombre: string; saldoFinal: number; categoria: string | null; categoriaDetalle: string | null;
}

/** Mes omitido en una carga: periodo "2026-10" + razón de bloqueo. */
export interface PeriodoOmitidoImportacion {
  periodo: string; filas: number; razon: string;
}

/** Factura que NO se cargó porque ya tiene pagos aprobados (escudito). */
export interface FacturaOmitidaImportacion {
  nit: string; nombre: string; comprobante: string | null; motivo: string;
}

export interface PreviewImportacion {
  importacionId: number | null; modulo: string; cuentaPuc: string[];
  totalDebito: number; totalCredito: number; totalSaldo: number;
  totalMovimientos: number; totalProveedores: number;
  proveedores: ProveedorPreview[]; sinCategoria: string[]; puedeConfirmar: boolean;
  /** Mes dominante de la plantilla ("2026-10") o null si son varios. */
  periodoDetectado: string | null;
  /** Todos los meses que trae el archivo (AAAA-MM). */
  periodosDetectados: string[];
  /** Meses cuyas filas SÍ se cargaron. */
  periodosCargados: string[];
  /** Meses NO cargados con su razón (p. ej. pagos aprobados existentes). */
  periodosOmitidos: PeriodoOmitidoImportacion[];
  /** Facturas omitidas porque ya tienen pagos aprobados (escudito): el
   *  resto de la información del archivo SÍ se reemplaza. */
  facturasOmitidas: FacturaOmitidaImportacion[];
}

export interface ConfirmarImportacion {
  confirmada: boolean; totalFilas: number; totalProveedores: number; proveedoresSinCategoria: string[];
  periodosCargados: string[]; periodosOmitidos: PeriodoOmitidoImportacion[];
}

/** Última importación registrada de un módulo (badge de mes en la tabla). */
export interface ImportacionPeriodoInfo {
  importacionId: number | null; nombreArchivo: string | null; totalFilas: number | null;
  confirmada: boolean | null; creadoPor: string | null; createdAt: string | null;
  periodosCargados: string[]; periodosOmitidos: PeriodoOmitidoImportacion[];
}

export interface MaestroModuloResultado {
  modulo: string;
  movimientos: number;
  proveedores: number;
  sinCategoria: string[];
}

export interface MaestroImportacion {
  advertencias?: string[];
  ok: boolean;
  empresaId: number;
  nombreEmpresa: string | null;
  nombreArchivo: string;
  modulos: MaestroModuloResultado[];
  contrato: Contrato | null;
  periodos: string[];
  pagosProyectados: number;
  impuestosMovimientos: number;
}

export interface Contrato {
  nombreEmpresa: string | null; numeroContrato: string | null;
  fechaInicial: string | null; fechaFinal: string | null;
  valorInicialContrato: number; diasEntregaAlimentacion: number | null; plazoCxcDias?: number;
  fechaInicialPresupuesto: string | null; fechaFinalPresupuesto: string | null;
  dineroInicialDisponible: number; estadoAprobacion: string | null;
  aprobadoPor: string | null; fechaAprobacion: string | null; motivoRechazo: string | null;
  /** Instante de la última aprobación global: corte del "reflejo" de pagos
   *  proyectados (los cambios posteriores esperan la próxima aprobación). */
  aprobadoEn?: string | null;
}

export interface Periodo {
  periodo: string; campos: Record<string, number | null>;
  totalDisponible: number; totalNomina: number; nominaAprobada: boolean;
  notas: string | null;
}

export interface FilaMensual {
  concepto: string; valores: Record<string, number>; editable?: boolean; campo?: string | null;
}

export interface FilaNomina {
  pagadoPorMes?: Record<string, number>;
  pagoSugerido?: number; saldoPendiente?: number; mesesSeleccionados?: string[] | null;
  aprobados?: Record<string, boolean>;
  concepto: string; valores: Record<string, number>; total: number;
  editable?: boolean; campo?: string | null;
}

export interface DetalleTerceroMensual {
  nit: string; nombre: string; categoria: string | null;
  categoriaDetalle?: string | null; proximaFechaVencimiento?: string | null; observacion?: string | null;
  valores: Record<string, number>; total: number; aFavor: boolean;
  pagoSugerido: number; saldoPendiente: number; totalYaAprobado: number; totalYaPagado: number;
  pagadoPorMes?: Record<string, number>;
  /** P7: magnitud legalizada por mes (solo Anticipos). */
  legalizadoPorMes?: Record<string, number>;
}

export interface SeccionPaginada {
  page?: number; size?: number; totalElements?: number; totalPages?: number;
  /** Totales de toda la sección, independientes de la página visible. */
  totales?: Record<string, number>;
}

export interface SeccionTerceros extends SeccionPaginada {
  detalle: DetalleTerceroMensual[]; total: Record<string, number>;
}

export interface DetallePagoMensual {
  pagadoPorMes?: Record<string, number>;
  nit: string | null; nombre: string; categoria: string | null;
  categoriaDetalle?: string | null;
  observacion?: string | null;
  pagoSugerido?: number | null;
  saldoPendiente?: number | null;
  valores: Record<string, number>; total: number; montoPagado: number; montoPendiente: number;
}

export interface SeccionPagos extends SeccionPaginada {
  detalle: DetallePagoMensual[]; total: Record<string, number>;
}

export interface Mensual {
  totalesGlobales?: { totalPagoSugerido: number; totalSugeridoAprobado: number };
  contrato: Contrato; meses: string[];
  filasContrato: FilaMensual[]; filasFlujoCaja: FilaMensual[];
  // Nómina y Estampillas comparten la misma forma: concepto digitado por
  // mes con su campo, y aprobados/pagadoPorMes desde los Pagos Proyectados.
  filasNomina: FilaNomina[]; filasEstampillas: FilaNomina[];
  proveedores: SeccionTerceros; anticipos: SeccionTerceros; prestamos: SeccionTerceros;
  cuentasCobrar: SeccionTerceros; impuestosEstampillasSeguros: SeccionTerceros;
  provisiones: SeccionPagos;
  pagosProyectados: SeccionPagos;
  /** Cobros Proyectados: cuentas por cobrar aprobadas (dinero que entra). */
  cobrosProyectados?: SeccionPagos;
  notas: Record<string, string>;
  nominaAprobada: Record<string, boolean>;
  /** Resumen por módulo para las cards de "Resumen rápido" (claves = valores
   *  de PresupuestoModulo). `aprobado` es el TOTAL DE LA SECCIÓN del módulo
   *  en todos los meses (lo que muestran las cards: consolidados de terceros,
   *  provisiones agendadas y nómina digitada); `aprobadoPagos` es lo que
   *  Gerencia ya aprobó en el módulo (pagos con aprobado=true); `agendado` y
   *  `pagado` son el calendario real de pagos, sin cancelados. */
  resumenAprobados?: Record<string, {
    aprobado: number; aprobadoPagos?: number; agendado?: number; pagado: number;
  }>;
  /** Pagos creados/modificados después de la última aprobación global: se
   *  reflejan (card, sección y KPI) al volver a aprobar el presupuesto. */
  cambiosPendientesPagos?: number;
}

export interface ConsolidadoFila {
  categoria: string; proveedores: number; anticipos: number; cxPagar: number;
  cxCobrar: number; impuestos: number; total: number;
  pagoSugerido: number | null; notas: string | null;
}

export interface DetalleConsolidado {
  nit: string; nombre: string; categoria: string | null; proveedores: number;
  anticipos: number; cxPagar: number; cxCobrar: number; total: number;
  alertaCruce: boolean | null; observacion: string | null; pagoSugerido: number | null;
}

/** Página del detalle por tercero: ya filtrada y ordenada por el backend;
 *  `nombres` alimenta el selector de proveedor exacto sin traer todo. */
export interface DetalleConsolidadoPagina extends PageResponse<DetalleConsolidado> {
  nombres: string[];
}

export interface PagoProyectado {
  id: number; nit: string | null; nombre: string; categoria: string | null;
  categoriaDetalle: string | null; moduloOrigen: string | null; concepto: string | null;
  montoProyectado: number; fechaProyectada: string; estado: string;
  fechaPagoReal: string | null; aprobado: boolean | null; aprobadoPor: string | null;
  aprobadoEn: string | null; movimientoId: number | null; notas: string | null;
  creadoPor: string | null;
  numeroEgreso?: string | null;
  numeroEgresoFecha?: string | null;
  /** Última modificación: lo posterior al corte de aprobación queda
   *  "pendiente de reflejar" hasta la próxima aprobación global. */
  updatedAt?: string | null;
  /** Nacimiento del pago: si es posterior al corte, también está pendiente. */
  createdAt?: string | null;
}

export interface CandidatoPago {
  nit: string; nombre: string; categoria: string | null;
  saldoPendiente: number; yaProyectado: number; disponible: number;
  modulos?: string[];
}

export interface SugerenciaPresupuesto {
  clave: string; tipo: 'tercero' | 'categoria' | 'nomina'; nit: string | null;
  nombre: string; categoria: string | null;
  pagoSugerido: number | null; observacion: string | null;
  modulos?: string[];
}

export interface FacturaSugerida {
  nit: string; nombre: string; categoria?: string | null; categoriaDetalle?: string | null; comprobante: string | null;
  fecha: string | null; fechaVencimiento: string | null; monto: number;
  montoAprobar?: number; saldoPendiente?: number;
  /** True cuando la factura se aprobó PARCIAL (residuo del Pago Sugerido):
   *  el resto queda pendiente para una próxima aprobación. */
  parcial?: boolean;
  movimientoId: number; movimientoIds?: number[]; vencida: boolean;
}

export interface ResumenPagos {
  totalProyectado: number; vencidos: number; proximos7Dias: number; proximos30Dias: number;
  totalPagado?: number; cantidadPagados?: number;
  totalAgendado?: number; totalAprobado?: number;
}

export interface ResumenGerencial {
  empresaId: number; nombreEmpresa: string; responsable: string | null;
  totalAprobado: number;
  totalPendientePago: number; totalPagado: number; totalDisponible: number | null;
}

/** Permisos efectivos del usuario en el Gestor Presupuestal. */
export interface PermisosGp {
  gerencia: boolean; superAdmin: boolean; puedeAprobar: boolean;
  /** Rol de negocio del catálogo: contador | gerente | superadmin | tesorero | editor_contable. */
  rolGp?: string;
  /** Permisos concedidos (matriz + puede_aprobar). El backend SIEMPRE revalida. */
  permisos?: string[];
}

/** Usuario del GP para la pantalla admin de superadmin. */
export interface UsuarioGp {
  id: number; username: string; email: string | null; nombreCompleto: string | null;
  employeeId?: number | null;
  activo: boolean; roles: string[]; puedeAprobar: boolean | null; empresaIds: number[];
  requirePasswordChange?: boolean;
}

/** Persona activa de la BD compartida (PeopleNet) sin acceso a NEXA. */
export interface CandidatoUsuario {
  employeeId: number; username?: string | null; tieneCuenta?: boolean; nombreCompleto: string;
  email: string | null; idNumber: string | null; area: string | null; cargo: string | null;
  empresa: string | null;
}

/** Rol NEXA asignable a una cuenta de acceso. */
export interface RolNexa {
  id: number; name: string; description: string | null;
}

/** Tarjetas de resumen de la pantalla "Usuarios y Accesos" (una consulta agregada). */
export interface EstadisticasUsuariosGp {
  total: number; activos: number; clavesTemporales: number; sinEmpresa: number;
}

/** Alta de una cuenta de acceso (superadmin). */
export interface CrearUsuarioGpInput {
  employeeId?: number | null;
  username: string;
  email: string;
  password: string;
  rol: string;
  activo: boolean;
  puedeAprobar: boolean | null;
  empresaIds: number[];
}

/** Contraseña temporal generada al resetear una cuenta. */
export interface ResetPasswordGp {
  username: string; password: string;
}

export interface Notificacion {
  id: number; tipo: string; mensaje: string; leida: boolean;
  creadoPor: string | null; createdAt: string | null;
}

export interface PrevisualizarProveedor {
  nit: string; nombre: string;
  /** Sugerido solo aplica al flujo de Proveedores/CxP/Impuestos; en el flujo
   *  por módulo (Anticipos/Cuentas por Cobrar) y en Provisiones no hay tope. */
  sugerido: number | null; saldoPendiente: number;
  totalAprobar: number; facturas: FacturaSugerida[]; primeraFacturaOmitida: string | null;
  modulo?: string | null;
  permiteParcial?: boolean;
  totalMovimientosPendientes?: number;
}

export interface HistoricoAprobacionItem {
  id?: number;
  fechaAprobacion: string;
  nit: string;
  nombre: string;
  monto: number;
  modulo: string;
  comprobante: string | null;
  estado: string;
  aprobadoPor: string | null;
}

export interface HistoricoAprobacionesResponse {
  total: number;
  page: number;
  items: HistoricoAprobacionItem[];
}

/* ═══════════ Distribución de pagos ("Saldo en Bancos") ═══════════ */

/** Proveedor dentro de la distribución de pagos de una empresa. */
export interface DistribucionTercero {
  nit: string; nombre: string; categoria: string | null;
  total: number; pagoSugerido: number; saldoPendiente: number;
  valoresPorMes: Record<string, number>;
}

/** Columna de una empresa (UT) en la matriz de distribución de pagos. */
export interface DistribucionEmpresa {
  empresaId: number; nombreEmpresa: string; nit: string | null; ciudad: string | null;
  numeroContrato: string | null;
  saldoBancos: number; totalAcumuladoPago: number; disponibleRestante: number;
  impuestos: number; nomina: number; proveedores: number;
  impuestosPorMes: Record<string, number>;
  nominaPorMes: Record<string, number>;
  proveedoresPorMes: Record<string, number>;
  proveedoresDetalle: DistribucionTercero[];
  aprobado: boolean;
  /** Ítems aprobados: "impuestos", "nomina" y/o "prov:<nit>". */
  itemsAprobados: string[];
  /** Saldo aprobado (suma de los ítems marcados). */
  montoAprobado: number;
  aprobadoPor: string | null; fechaAprobacion: string | null;
}

/** Matriz completa del módulo (totales + una fila por empresa). */
export interface DistribucionPagos {
  totalSaldoBancos: number; totalAcumuladoPago: number; totalDisponibleRestante: number;
  empresasAprobadas: number; empresasPendientes: number;
  meses: string[]; empresas: DistribucionEmpresa[];
}

/** Ítem aprobable del desglose "Particular". */
export interface ItemAprobar {
  key: string; label: string; detalle?: string; monto: number;
  icono: string; color: string; nivel: 0 | 1;
}

/** Nombre del mes para encabezados: "2026-03" → "MARZO 2026". */
const MESES_ES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export function etiquetaPeriodo(periodo: string | null | undefined): string {
  if (!periodo || periodo.length < 7) return periodo ?? '—';
  const anio = periodo.slice(0, 4);
  const mes = Number(periodo.slice(5, 7));
  const nombre = MESES_ES[mes - 1] ?? periodo;
  return `${nombre} ${anio}`;
}

export const ESTADO_PAGO_LABELS: Record<string, string> = {
  proyectado: 'Proyectado', pagado: 'Pagado', cancelado: 'Cancelado', eliminado: 'Eliminado',
};

export const ESTADO_APROBACION_LABELS: Record<string, string> = {
  aprobado: 'Presupuesto aprobado',
  rechazado: 'Presupuesto rechazado',
};

export const CATEGORIA_COLORS: Record<string, string> = {
  FRUVER: '#10B981', ABARROTES: '#8B5CF6', PROTEINAS: '#F43F5E', LACTEOS: '#38BDF8',
  PANIFICADO: '#B45309', ASEO: '#14B8A6', AGUA: '#3B82F6', DULCERIA: '#F59E0B',
  DOTACIONES: '#A21CAF', 'GASTOS MEDICOS': '#0EA5E9', 'GASTOS DE GESTION': '#6366F1',
  TRANSPORTE: '#0D9488', 'SERVICIOS TELEFONIA': '#7C3AED', PRESTAMOS: '#DC2626',
  'PRESTAMOS RECIBIDOS': '#9F1239', 'OTROS PRESTAMOS': '#BE185D',
  'ANTICIPOS PROVEEDORES': '#4F46E5', 'OTROS ANTICIPOS': '#6D28D9',
  'CUENTAS POR COBRAR': '#059669', EXTERNOS: '#64748B', POLIZAS: '#0891B2',
  IMPUESTOS: '#DB2777', ESTAMPILLAS: '#C026D3', OTROS: '#475569',
};

export const ESTADOS_CONSOLIDADO = [
  { label: 'Todas', valor: '' },
  { label: 'Con alerta', valor: 'alerta' },
  { label: 'Sin alerta', valor: 'sin-alerta' },
];

/* Formatters Intl en caché (crear uno por llamada es carísimo: las tablas
   llaman esto cientos de veces por ciclo de change detection). */
const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtMilesFmt = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCorto = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const fmtPct = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export function formatoCOP(valor: number | null | undefined): string {
  const v = valor ?? 0;
  return fmtCOP.format(v);
}

/**
 * Formato corto para ejes de gráficas, donuts y agregados: mismos criterios
 * es-CO del resto de la plataforma (coma decimal, sin ceros sobrantes) y
 * conserva el signo de los negativos.
 */
export function formatoCOPShort(valor: number | null | undefined): string {
  const n = valor ?? 0;
  const v = Math.abs(n);
  const signo = n < 0 ? '-' : '';
  if (v >= 1_000_000_000) return `${signo}$${fmtCorto.format(v / 1_000_000_000)}B`;
  if (v >= 1_000_000) return `${signo}$${fmtCorto.format(v / 1_000_000)}M`;
  if (v >= 1_000) return `${signo}$${fmtCorto.format(Math.round(v / 1_000))}K`;
  return `${signo}$${fmtCorto.format(Math.round(v))}`;
}

/** Porcentaje con separador decimal es-CO: "44,5%". */
export function formatoPct(valor: number | null | undefined): string {
  return `${fmtPct.format(valor ?? 0)}%`;
}

export function formatoMiles(valor: number | null | undefined): string {
  const v = valor ?? 0;
  return fmtMilesFmt.format(v);
}

/** Formato fecha es-CO (dd/mm/yyyy): evita fechas crudas con horas 00:00:00 */
export function formatearFechaCO(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const m = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha);
  return new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
