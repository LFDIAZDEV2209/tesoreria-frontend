/**
 * Adaptadores entre los contratos del Gestor en Tesoreriabd y Angular.
 */

import {
  CandidatoPago, ConfirmarImportacion, Contrato, DetalleConsolidado, Empresa, FacturaSugerida,
  FilaMensual, FilaNomina, ImportacionPeriodoInfo, MaestroProveedor, Mensual, Movimiento, Notificacion,
  PageResponse, PagoProyectado, Periodo, PeriodoOmitidoImportacion, PrevisualizarProveedor,
  PreviewImportacion, ResumenGerencial, ResumenModulo, ResumenPagos, SugerenciaPresupuesto,
} from '../models/presupuesto.model';
import { EstadoSesionGp } from './gp-session.service';

type Any = any;

export function arr(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

export function mapSugerenciaPresupuesto(x: Any): SugerenciaPresupuesto {
  return {
    clave: x.clave, tipo: x.tipo, nit: x.nit ?? null,
    nombre: x.nombre, categoria: x.categoria ?? null,
    pagoSugerido: x.pago_sugerido ?? null, observacion: x.observacion ?? null, modulos: arr(x.modulos),
  };
}

export function pagina<T>(filas: T[], page: number, size: number): PageResponse<T> {
  const total = filas.length;
  const totalPages = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  return { content: filas.slice(page * size, (page + 1) * size), page, size, totalElements: total, totalPages };
}

export function mapEmpresaC(x: Any): Empresa {
  return { id: x.id, responsable: x.responsable ?? null, name: x.nombre ?? x.name ?? '', nit: x.nit, ciudad: x.ciudad };
}

export function mapMovimiento(x: Any, modulo: string): Movimiento {
  return {
    id: x.id, modulo, cuentaPuc: x.cuenta_puc ?? '', nit: x.nit, nombre: x.nombre,
    categoria: x.categoria ?? null, categoriaDetalle: x.categoria_detalle ?? null,
    comprobante: x.comprobante ?? null, fecha: x.fecha ?? null, periodo: x.periodo ?? null,
    fechaVencimiento: x.fecha_vencimiento ?? null, detalle: x.detalle ?? null,
    debito: x.debito ?? 0, credito: x.credito ?? 0, saldo: x.saldo ?? 0,
    legalizado: x.legalizado ?? null,
    aprobada: x.aprobada == null ? null : (x.aprobada === true || x.aprobada === 1 || x.aprobada === '1' || x.aprobada === 'true'),
  };
}

export function mapResumenModulo(rows: Any[]): ResumenModulo {
  const resumen = arr(rows).map((r) => ({
    categoria: r.categoria ?? null, debito: r.total_debito ?? 0,
    credito: r.total_credito ?? 0, saldo: r.total_saldo ?? 0,
    proveedores: r.total_proveedores ?? 0,
  }));
  return {
    resumen,
    totalDebito: resumen.reduce((a, r) => a + r.debito, 0),
    totalCredito: resumen.reduce((a, r) => a + r.credito, 0),
    totalSaldo: resumen.reduce((a, r) => a + r.saldo, 0),
    totalProveedores: resumen.reduce((a, r) => a + r.proveedores, 0),
    totalMovimientos: 0,
  };
}

export function mapPreview(x: Any): PreviewImportacion {
  return {
    importacionId: x.importacion_id ?? null, modulo: x.modulo,
    cuentaPuc: x.cuenta_puc != null ? [x.cuenta_puc] : [],
    totalDebito: x.total_debito ?? 0, totalCredito: x.total_credito ?? 0, totalSaldo: x.total_saldo ?? 0,
    totalMovimientos: x.total_filas ?? x.total_movimientos ?? 0, totalProveedores: x.total_proveedores ?? 0,
    proveedores: arr(x.proveedores).map((p) => ({
      nit: p.nit, nombre: p.nombre, saldoFinal: p.saldo_final ?? 0,
      categoria: p.categoria ?? null, categoriaDetalle: p.categoria_detalle ?? null,
    })),
    sinCategoria: arr(x.sin_categoria),
    puedeConfirmar: !!x.puede_confirmar,
    periodoDetectado: x.periodo_detectado ?? null,
    periodosDetectados: arr(x.periodos_detectados),
    periodosCargados: arr(x.periodos_cargados),
    periodosOmitidos: arr(x.periodos_omitidos).map((o) => ({
      periodo: String(o.periodo ?? ''), filas: Number(o.filas ?? 0) || 0, razon: String(o.razon ?? 'Ya existen pagos aprobados'),
    })),
    facturasOmitidas: arr(x.facturas_omitidas).map((f) => ({
      nit: String(f.nit ?? ''), nombre: String(f.nombre ?? ''),
      comprobante: f.comprobante ?? null, motivo: String(f.motivo ?? 'Ya tiene pagos aprobados por Gerencia.'),
    })),
  };
}

export function omitidosDe(x: Any): PeriodoOmitidoImportacion[] {
  return arr(x?.periodos_omitidos).map((o) => ({
    periodo: String(o.periodo ?? ''), filas: Number(o.filas ?? 0) || 0, razon: String(o.razon ?? 'Ya existen pagos aprobados'),
  }));
}

export function mapConfirmar(x: Any): ConfirmarImportacion {
  return {
    confirmada: x.confirmada ?? x.ok ?? true,
    totalFilas: x.total_filas ?? 0,
    totalProveedores: x.total_proveedores ?? 0,
    proveedoresSinCategoria: arr(x.sin_categoria ?? x.proveedores_sin_categoria),
    periodosCargados: arr(x.periodos_cargados),
    periodosOmitidos: omitidosDe(x),
  };
}

/** Última importación de un módulo (badge de mes detectado en la tabla). */
export function mapInfoImportacion(x: Any): ImportacionPeriodoInfo {
  return {
    importacionId: x.importacion_id ?? null, nombreArchivo: x.nombre_archivo ?? null,
    totalFilas: x.total_filas ?? null, confirmada: x.confirmada ?? null,
    creadoPor: x.creado_por ?? null, createdAt: x.created_at ?? null,
    periodosCargados: arr(x.periodos_cargados),
    periodosOmitidos: omitidosDe(x),
  };
}

export function mapMaestro(x: Any): MaestroProveedor {
  return {
    id: x.id, nit: x.nit, nombre: x.nombre, categoria: x.categoria ?? null,
    categoriaDetalle: x.categoria_detalle ?? null,
    pagoSugerido: x.pago_sugerido ?? null, observacion: x.observacion ?? null,
  };
}

export function mapContrato(x: Any): Contrato {
  return {
    nombreEmpresa: x.nombre_empresa ?? null, numeroContrato: x.numero_contrato ?? null,
    fechaInicial: x.fecha_inicial ?? null, fechaFinal: x.fecha_final ?? null,
    valorInicialContrato: x.valor_inicial_contrato ?? 0,
    diasEntregaAlimentacion: x.dias_entrega_alimentacion ?? null,
    plazoCxcDias: x.plazo_cxc_dias ?? undefined,
    fechaInicialPresupuesto: x.fecha_inicial_presupuesto ?? null,
    fechaFinalPresupuesto: x.fecha_final_presupuesto ?? null,
    dineroInicialDisponible: x.dinero_inicial_disponible ?? 0,
    estadoAprobacion: x.estado_aprobacion ?? null,
    aprobadoPor: x.aprobado_por ?? null, fechaAprobacion: x.fecha_aprobacion ?? null,
    aprobadoEn: x.aprobado_en ?? null,
    motivoRechazo: x.motivo_rechazo ?? null,
  };
}

export function contratoIn(c: Any): Any {
  return {
    nombre_empresa: c.nombreEmpresa, numero_contrato: c.numeroContrato,
    fecha_inicial: c.fechaInicial, fecha_final: c.fechaFinal,
    valor_inicial_contrato: c.valorInicialContrato,
    dias_entrega_alimentacion: c.diasEntregaAlimentacion,
    fecha_inicial_presupuesto: c.fechaInicialPresupuesto,
    fecha_final_presupuesto: c.fechaFinalPresupuesto,
    dinero_inicial_disponible: c.dineroInicialDisponible,
    plazo_cxc_dias: c.plazoCxcDias,
  };
}

export function mapSeccionTerceros(s: Any): any {
  return {
    ...mapPaginaSeccion(s),
    detalle: arr(s?.detalle).map((d) => ({
      nit: d.nit, nombre: d.nombre, categoria: d.categoria ?? null,
      categoriaDetalle: d.categoria_detalle ?? null,
      proximaFechaVencimiento: d.proxima_fecha_vencimiento ?? null,
      observacion: d.observacion ?? null,
      valores: d.valores ?? {}, total: d.total ?? 0, aFavor: !!d.a_favor,
      pagoSugerido: d.pago_sugerido ?? 0, saldoPendiente: d.saldo_pendiente ?? 0,
      totalYaAprobado: d.total_ya_aprobado ?? 0, totalYaPagado: d.total_ya_pagado ?? 0,
      pagadoPorMes: d.pagado_por_mes ?? {},
      legalizadoPorMes: d.legalizado_por_mes ?? {},
    })),
    total: s?.total ?? {},
  };
}

export function mapSeccionPagos(s: Any): any {
  return {
    ...mapPaginaSeccion(s),
    detalle: arr(s?.detalle).map((d) => ({
        nit: d.nit ?? null, nombre: d.nombre, categoria: d.categoria ?? null,
        categoriaDetalle: d.categoria_detalle ?? null,
      observacion: d.observacion ?? null, pagoSugerido: d.pago_sugerido ?? null,
      saldoPendiente: d.saldo_pendiente ?? null,
      valores: d.valores ?? {}, total: d.total ?? 0,
      pagadoPorMes: d.pagado_por_mes ?? {}, montoPagado: d.monto_pagado ?? 0, montoPendiente: d.monto_pendiente ?? 0,
    })),
    total: s?.total ?? {},
  };
}

export function mapMensual(x: Any): Mensual {
  return {
    totalesGlobales: x.totales_globales || x.totalesGlobales
      ? {
        totalPagoSugerido: (x.totales_globales ?? x.totalesGlobales).total_pago_sugerido ?? (x.totales_globales ?? x.totalesGlobales).totalPagoSugerido ?? 0,
        totalSugeridoAprobado: (x.totales_globales ?? x.totalesGlobales).total_sugerido_aprobado ?? (x.totales_globales ?? x.totalesGlobales).totalSugeridoAprobado ?? 0,
      } : undefined,
    contrato: mapContrato(x.contrato ?? {}),
    meses: arr(x.meses),
    filasContrato: arr(x.filas_contrato).map(mapFila),
    filasFlujoCaja: arr(x.filas_flujo_caja).map(mapFila),
    filasNomina: arr(x.filas_nomina).map(mapearFilaConcepto),
    // Estampillas (como Nómina): concepto digitado por mes con estado de
    // aprobación por celda (botón aprobar, "Aprobado", "Pagado").
    filasEstampillas: arr(x.filas_estampillas).map(mapearFilaConcepto),
    proveedores: mapSeccionTerceros(x.proveedores),
    anticipos: mapSeccionTerceros(x.anticipos),
    prestamos: mapSeccionTerceros(x.prestamos),
    cuentasCobrar: mapSeccionTerceros(x.cuentas_cobrar),
    impuestosEstampillasSeguros: mapSeccionTerceros(x.impuestos_estampillas_seguros),
    provisiones: mapSeccionPagos(x.provisiones),
    pagosProyectados: mapSeccionPagos(x.pagos_proyectados),
    cobrosProyectados: mapSeccionPagos(x.cobros_proyectados),
    notas: x.notas ?? {},
    nominaAprobada: x.nomina_aprobada ?? {},
    // Resumen por módulo de las cards "Resumen rápido": el backend envía
    // 'aprobado' = total de la sección (todos los meses), 'aprobadoPagos' =
    // lo aprobado por Gerencia y 'agendado'/'pagado' = calendario de pagos.
    resumenAprobados: Object.fromEntries(
      Object.entries(x.resumen_aprobados ?? {}).map(([modulo, fila]: [string, Any]) => [modulo, {
        aprobado: fila?.aprobado ?? 0,
        aprobadoPagos: fila?.aprobado_pagos ?? fila?.aprobadoPagos ?? 0,
        agendado: fila?.agendado ?? 0,
        pagado: fila?.pagado ?? 0,
      }]),
    ),
    cambiosPendientesPagos: x.cambios_pendientes_pagos ?? 0,
  };
}

function mapPaginaSeccion(s: Any): Any {
  return {
    page: s?.page, size: s?.size,
    totalElements: s?.totalElements ?? s?.total_elements,
    totalPages: s?.totalPages ?? s?.total_pages,
    totales: s?.totales ? Object.fromEntries(Object.entries(s.totales).map(([campo, valor]) => [
      campo.replace(/_([a-z])/g, (_: string, letra: string) => letra.toUpperCase()), valor,
    ])) : undefined,
  };
}

function mapFila(f: Any): FilaMensual {
  return { concepto: f.concepto, valores: f.valores ?? {}, editable: f.editable, campo: f.campo ?? null };
}

/** Fila de concepto digitado (Nómina y Estampillas): cumple la misma forma,
 *  con el estado de aprobación/pago que trae el mensual. */
function mapearFilaConcepto(f: Any): FilaNomina {
  return {
    concepto: f.concepto, valores: f.valores ?? {}, editable: f.editable,
    campo: f.campo ?? null, total: f.total ?? 0, aprobados: f.aprobados, pagadoPorMes: f.pagado_por_mes ?? {},
    pagoSugerido: f.pago_sugerido ?? 0,
    saldoPendiente: f.saldo_pendiente ?? ((f.total ?? 0) - (f.pago_sugerido ?? 0)),
    mesesSeleccionados: f.meses_seleccionados ?? null,
  };
}

export function mapPeriodoDesdeMensual(m: Mensual): Periodo[] {
  return m.meses.map((p) => ({
    periodo: p,
    campos: {},
    totalDisponible: 0,
    totalNomina: 0,
    nominaAprobada: !!m.nominaAprobada?.[p],
    notas: m.notas?.[p] ?? null,
  }));
}

export function mapPago(x: Any): PagoProyectado {
  return {
    id: x.id, nit: x.nit ?? null, nombre: x.nombre,
    categoria: x.categoria ?? null, categoriaDetalle: x.categoria_detalle ?? null,
    moduloOrigen: x.modulo_origen ?? null, concepto: x.concepto ?? null,
    montoProyectado: x.monto_proyectado ?? 0, fechaProyectada: x.fecha_proyectada,
    estado: x.estado, fechaPagoReal: x.fecha_pago_real ?? null,
    aprobado: x.aprobado ?? null, aprobadoPor: x.aprobado_por ?? null,
    aprobadoEn: x.aprobado_en ?? null, movimientoId: x.movimiento_id ?? null,
    notas: x.notas ?? null, creadoPor: null,
    numeroEgreso: x.numero_egreso ?? null, numeroEgresoFecha: x.numero_egreso_fecha ?? null,
    updatedAt: x.updated_at ?? null, createdAt: x.created_at ?? null,
  };
}

export function pagoIn(p: Any): Any {
  return {
    nit: p.nit, nombre: p.nombre, categoria: p.categoria,
    categoria_detalle: p.categoriaDetalle, modulo_origen: p.moduloOrigen,
    concepto: p.concepto, monto_proyectado: p.montoProyectado,
    fecha_proyectada: p.fechaProyectada, notas: p.notas, estado: p.estado,
    fecha_pago_real: p.fechaPagoReal,
    numero_egreso: p.numeroEgreso, numero_egreso_fecha: p.numeroEgresoFecha,
  };
}

export function mapCandidato(x: Any): CandidatoPago {
  return {
    nit: x.nit, nombre: x.nombre, categoria: x.categoria ?? null,
    saldoPendiente: x.saldo_total ?? 0, yaProyectado: x.ya_proyectado ?? 0,
    disponible: x.disponible_para_proyectar ?? 0, modulos: arr(x.modulos),
  };
}

export function mapFactura(x: Any): FacturaSugerida {
  return {
    nit: x.nit, nombre: x.nombre, categoria: x.categoria ?? null,
    comprobante: x.comprobante ?? null, fecha: x.fecha ?? null,
    fechaVencimiento: x.fecha_vencimiento ?? null, monto: x.monto ?? 0,
    movimientoId: x.movimiento_id, vencida: !!x.vencida,
  };
}

export function mapResumenPagos(x: Any): ResumenPagos {
  return {
    totalProyectado: x.total_proyectado ?? 0, vencidos: x.total_vencido ?? 0,
    proximos7Dias: x.total_proximos_7_dias ?? 0, proximos30Dias: x.total_proximos_30_dias ?? 0,
      totalPagado: x.total_pagado ?? 0, cantidadPagados: x.cantidad_pagados ?? 0,
      totalAgendado: x.total_agendado ?? 0, totalAprobado: x.total_aprobado ?? 0,
  };
}

export function mapResumenGerencial(x: Any): ResumenGerencial {
  return {
    empresaId: x.contador_id, nombreEmpresa: x.nombre_empresa,
    responsable: x.responsable ?? null, totalAprobado: x.total_aprobado ?? 0,
    totalPendientePago: x.total_pendiente_pago ?? 0, totalPagado: x.total_pagado ?? 0,
    totalDisponible: x.total_disponible ?? null,
  };
}

export function mapConsolidado(x: Any): DetalleConsolidado {
  return {
    nit: x.nit, nombre: x.nombre, categoria: x.categoria ?? null,
    proveedores: x.proveedores ?? 0, anticipos: x.anticipos ?? 0,
    cxPagar: x.cx_pagar ?? 0, cxCobrar: x.cx_cobrar ?? 0, total: x.total ?? 0,
    alertaCruce: x.alerta_cruce ?? null, observacion: x.observacion ?? null, pagoSugerido: x.pago_sugerido ?? null,
  };
}

export function mapNotificacion(x: Any): Notificacion {
  return {
    id: x.id, tipo: x.tipo, mensaje: x.mensaje, leida: !!x.leida,
    creadoPor: x.creado_por ?? null, createdAt: x.created_at ?? null,
  };
}

export function mapPrevisualizar(x: Any): PrevisualizarProveedor {
  const facturasRaw = arr(x.facturas).map((f: Any) => ({
    nit: x.nit ?? '',
    nombre: f.nombre ?? x.nombre ?? '',
    categoria: f.categoria ?? null,
    categoriaDetalle: f.categoria_detalle ?? null,
    comprobante: f.comprobante ?? f.factura ?? f.numero_factura ?? f.numero_documento ?? f.numero ?? f.documento ?? f.consecutivo ?? null,
    fecha: f.fecha ?? null,
    fechaVencimiento: f.fecha_vencimiento ?? null,
    monto: f.monto ?? 0,
    montoAprobar: (x.permite_parcial || x.permiteParcial)
      ? (f.saldo_pendiente ?? f.saldoPendiente ?? f.monto ?? 0) : (f.monto ?? 0),
    saldoPendiente: f.saldo_pendiente ?? f.saldoPendiente ?? f.monto ?? 0,
    movimientoId: f.movimiento_id ?? f.movimientoId ?? f.id ?? 0,
    vencida: !!f.vencida,
  }));

  // Ordenar facturas de la más vieja a la más nueva (ascendente, estable, nulls al final)
  const fechaOrden = (fecha: string | null): number => {
    if (!fecha) return Number.POSITIVE_INFINITY;
    const iso = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const local = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (local) return Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
    return Number.POSITIVE_INFINITY;
  };
  const facturas = [...facturasRaw].sort((a, b) => {
    const fa = fechaOrden(a.fecha ?? a.fechaVencimiento);
    const fb = fechaOrden(b.fecha ?? b.fechaVencimiento);
    return fa === fb ? 0 : fa - fb;
  });

  return {
    nit: x.nit ?? '',
    nombre: x.nombre ?? null,
    // Null cuando el flujo no aplica Sugerido (Anticipos/Cuentas por
    // Cobrar, y Provisiones por beneficiario): en esos no hay tope.
    sugerido: x.pago_sugerido ?? null,
    saldoPendiente: x.restante_sin_usar ?? 0,
    totalAprobar: x.total_a_aprobar ?? 0,
    modulo: x.modulo ?? null,
    permiteParcial: !!(x.permite_parcial || x.permiteParcial),
    totalMovimientosPendientes: x.total_movimientos_pendientes ?? x.total_pendientes ?? x.total_facturas_pendientes ?? undefined,
    facturas,
    primeraFacturaOmitida: x.primera_factura_omitida?.comprobante ?? null,
  };
}

/** Permisos derivados del rol de la sesión del gestor (sin endpoint propio). */
export function permisosDesdeSesion(e: EstadoSesionGp) {
  const TODOS = [
    'presupuesto.ver', 'presupuesto.editar_contrato', 'presupuesto.editar_periodos',
    'presupuesto.aprobar_nomina', 'presupuesto.aprobar_estampillas', 'presupuesto.aprobar', 'presupuesto.resumen_gerencial',
    'modulos.ver', 'modulos.importar', 'modulos.categorizar', 'modulos.limpiar',
    'pagos.ver', 'pagos.operar', 'pagos.aprobar', 'pagos.aprobar_sugeridas',
    'admin.auditoria', 'admin.categorias', 'admin.usuarios', 'admin.notificaciones',
  ];
  const GERENTE = [
    'presupuesto.ver', 'presupuesto.resumen_gerencial', 'presupuesto.observaciones',
    'presupuesto.pago_sugerido_proveedor', 'presupuesto.recalcular_sugeridos',
    'presupuesto.aprobar', 'presupuesto.aprobar_nomina', 'presupuesto.aprobar_estampillas',
    'modulos.ver', 'pagos.ver', 'pagos.aprobar', 'pagos.aprobar_sugeridas', 'pagos.observaciones',
  ];
  const CONTADOR = [
    'presupuesto.ver', 'presupuesto.editar_contrato', 'presupuesto.editar_periodos',
    'modulos.ver', 'modulos.importar', 'modulos.categorizar',
    'modulos.limpiar', 'pagos.ver', 'pagos.operar', 'admin.notificaciones',
  ];
  const LECTURA = ['presupuesto.ver', 'presupuesto.resumen_gerencial', 'modulos.ver', 'pagos.ver'];
  const rol = e.rol;
  let permisos: string[] = [];
  if (!e.autenticado || !rol) permisos = [];
  else if (rol === 'superadmin') permisos = TODOS;
  else if (rol === 'gerente') permisos = e.solo_lectura ? LECTURA : GERENTE;
  else if (rol === 'contador') permisos = CONTADOR;
  if (rol === 'gerente' && !e.puede_aprobar) permisos = permisos.filter(p => !['presupuesto.aprobar', 'presupuesto.aprobar_nomina', 'presupuesto.aprobar_estampillas', 'pagos.aprobar', 'pagos.aprobar_sugeridas'].includes(p));
  if (e.autenticado && e.puede_operar_pagos && !permisos.includes('pagos.operar')) permisos = [...permisos, 'pagos.operar'];
  if (Array.isArray(e.permisos)) permisos = e.autenticado ? e.permisos : [];
  return {
    gerencia: rol === 'gerente' || rol === 'superadmin',
    superAdmin: rol === 'superadmin',
    puedeAprobar: Array.isArray(e.permisos) ? permisos.includes('presupuesto.aprobar') : rol === 'superadmin' || (rol === 'gerente' && e.puede_aprobar),
    rolGp: e.rol_nexa ?? rol ?? undefined,
    permisos,
  };
}
