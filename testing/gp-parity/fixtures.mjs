// Datos sintéticos exclusivos de las pruebas. Todas las solicitudes API se interceptan.
export const session = { autenticado: true, usuario_id: 10, nombre: 'Cuenta de prueba local', username: 'prueba', rol: 'superadmin', debe_cambiar_password: false, multiples_empresas: true, puede_aprobar: true, solo_lectura: false, puede_operar_pagos: true };
export const empresas = [{ id: 1, nombre: 'Empresa de prueba', username: 'fixture', responsable: 'Contador de prueba' }];
const section = () => ({ detalle: [], total: {}, categorias: [] });
export const mensual = { contrato: {}, meses: [], filas_contrato: [], filas_flujo_caja: [], filas_nomina: [], filas_estampillas: [], proveedores: section(), anticipos: section(), prestamos: section(), cuentas_cobrar: section(), impuestos_estampillas_seguros: section(), provisiones: section(), pagos_proyectados: section(), notas: {} };
export const contratoPrueba = {nombre_empresa:'Empresa de prueba',numero_contrato:'PRUEBA-2026',fecha_inicial:'2026-01-01',fecha_final:'2026-02-28',valor_inicial_contrato:10000000,dinero_inicial_disponible:500000,dias_entrega_alimentacion:40,estado_aprobacion:'aprobado',aprobado_por:'Gerencia de prueba',fecha_aprobacion:'2026-09-01'};
const valores = {'2026-01':120000,'2026-02':130000};
const tercero = {nit:'900999001',nombre:'Proveedor de prueba',categoria:'FRUVER',valores,total:250000,pago_sugerido:100000,saldo_pendiente:150000,total_ya_aprobado:80000,total_ya_pagado:10000};
export const mensualPrueba = {...mensual,contrato:contratoPrueba,meses:['2026-01','2026-02'],filas_contrato:[{concepto:'Total Contrato',valores:{'2026-01':10000000,'2026-02':10000000}},{concepto:'Valor Facturado',campo:'valor_facturado',valores,editable:true},{concepto:'Pendiente por Cobrar',valores:{'2026-01':1000000,'2026-02':2000000}},{concepto:'Agotamiento Presupuestal',valores:{'2026-01':9000000,'2026-02':8500000}}],filas_flujo_caja:[{concepto:'TOTAL DISPONIBLE',valores}],filas_nomina:[{concepto:'Salarios',campo:'salarios',valores,editable:true,total:250000},{concepto:'Total Nómina',valores,total:250000}],proveedores:{detalle:[tercero],total:valores},notas:{'2026-01':'Nota sintética'}};
export function respuestaApi(url,populated=false) {
  const p = url.pathname.replace(/^\/api\/gp/, '/api');
  if(p==='/api/periodos/seleccion')return {anios:[{anio:2026,meses:Array.from({length:12},(_,i)=>({periodo:'2026-'+String(i+1).padStart(2,'0'),creado:true,estado:'VACIO',empresasConDatos:0,empresasCerradas:0}))}],historicos:{}};
  if(populated) {
    if(p==='/api/presupuesto/contrato')return contratoPrueba;
    if(p==='/api/presupuesto/mensual')return mensualPrueba;
    if(p==='/api/presupuesto/')return [{categoria:'FRUVER',proveedores:250000,anticipos:0,cx_pagar:0,cx_cobrar:0,impuestos:0,total:-250000}];
    if(p==='/api/presupuesto/detalle')return [{...tercero,proveedores:250000,anticipos:0,cx_pagar:0,cx_cobrar:0,impuestos:0,total:-250000}];
    if(p==='/api/proveedores/')return [{...tercero,id:1,fecha:'2026-01-15',comprobante:'PRUEBA-1',saldo:250000,aprobada:true}];
    if(p==='/api/proveedores/resumen')return [{categoria:'FRUVER',total_saldo:250000,total_proveedores:1}];
    if(p==='/api/pagos-proyectados/')return [{id:1,nit:tercero.nit,nombre:tercero.nombre,categoria:'FRUVER',modulo_origen:url.searchParams.get('origen')==='manual'?'manual':'proveedores',estado:'proyectado',aprobado:true,monto_proyectado:250000,fecha_proyectada:'2026-10-15'}];
    if(p==='/api/presupuesto/resumen-gerencial')return [{contador_id:1,nombre_empresa:'Empresa de prueba',responsable:'Contador de prueba',total_aprobado:100000,total_pagado:10000,total_pendiente_pago:90000,total_disponible:120000}];
  }
  if (p.endsWith('/auth/estado')) return session;
  if (p.endsWith('/auth/contadores')) return empresas;
  if (p.endsWith('/categorias/lista')) return ['FRUVER', 'OTROS'];
  if (p.endsWith('/categorias/admin/todas')) return [{id:1,nombre:'FRUVER',activa:true},{id:2,nombre:'OTROS',activa:true}];
  if (p.endsWith('/presupuesto/contrato')) return {};
  if (p.endsWith('/presupuesto/mensual')) return mensual;
  if (p.endsWith('/pagos-proyectados/resumen')) return { total_agendado:0, total_aprobado:0, total_proyectado:populated?250000:0, total_pagado:0, cantidad_pagados:0, total_ejecutado:0, total_pendiente:0, total_vencido:0, total_proximos_7_dias:0, total_proximos_30_dias:0, por_estado:{}, por_categoria:[], por_mes:[] };
  if (p.endsWith('/auditoria/')) return {entradas:[],total:0};
  return [];
}
