import { Empresa } from '../../../models/presupuesto.model';
import { HistoricoConsulta } from '../../../models/historico.model';

/** Fixture exclusiva de las pruebas. La aplicación consulta los históricos guardados en la API. */
export function ejemploSeptiembre(empresa:Empresa,periodo:string):HistoricoConsulta {
  if(!/^[1-9][0-9]{3}-09$/.test(periodo))throw new Error('El ejemplo está disponible únicamente para septiembre.');
  const fila=(concepto:string,valor:number)=>({concepto,valores:{[periodo]:valor},editable:false});
  const vacia=()=>({detalle:[],total:{}});
  const terceros=[
    {nit:'EJEMPLO-001',nombre:'Proveedor de ejemplo · Frutas',categoria:'FRUVER',valores:{[periodo]:12000000},total:12000000,pago_sugerido:3000000,saldo_pendiente:10000000,total_ya_aprobado:2000000,total_ya_pagado:1000000},
    {nit:'EJEMPLO-002',nombre:'Proveedor de ejemplo · Carnes',categoria:'CARNES',valores:{[periodo]:8000000},total:8000000,pago_sugerido:2000000,saldo_pendiente:7000000,total_ya_aprobado:1000000,total_ya_pagado:500000},
  ];
  const contrato={nombre_empresa:empresa.name,numero_contrato:'EJEMPLO-SEPTIEMBRE',fecha_inicial:periodo+'-01',fecha_final:periodo+'-30',fecha_inicial_presupuesto:periodo+'-01',fecha_final_presupuesto:periodo+'-30',valor_inicial_contrato:200000000,dinero_inicial_disponible:30000000,dias_entrega_alimentacion:22};
  return {
    historico:{id:0,empresaId:empresa.id,empresaNombre:empresa.name,periodo,generadoEn:periodo+'-30T12:00:00-05:00',usuarioId:0,usuarioNombre:'Datos de ejemplo',versionFormato:1,sha256:'EJEMPLO-NO-CONSOLIDADO'},
    vista:{empresa:{...empresa},contrato,
      mensual:{contrato,meses:[periodo],filas_contrato:[fila('Valor Total del Contrato',200000000),fila('Valor Facturado',40000000),fila('Agotamiento Presupuestal',160000000),fila('Valores pagados por el ente',35000000),fila('Retenciones en la fuente',2000000),fila('Pendiente por Cobrar',3000000)],
        filas_flujo_caja:[fila('Dinero disponible al inicio',30000000),fila('Entradas bancarias',35000000),fila('Préstamos recibidos',5000000),fila('Gastos financieros',250000),fila('GMF 4x1000',100000),fila('Otros pagos antes del presupuesto',650000),fila('TOTAL DISPONIBLE',69000000)],
        filas_nomina:[{...fila('Salarios administrativos',4000000),total:4000000},{...fila('Salarios operativos',7000000),total:7000000},{...fila('Salarios manipuladoras',6000000),total:6000000},{...fila('Total Nómina',17000000),total:17000000}],filas_estampillas:[],
        proveedores:{detalle:terceros,total:{[periodo]:20000000}},anticipos:vacia(),prestamos:vacia(),cuentas_cobrar:vacia(),impuestos_estampillas_seguros:vacia(),provisiones:vacia(),pagos_proyectados:vacia(),notas:{[periodo]:'Ejemplo solicitado para comparar presupuestos. No es información contable consolidada.'},nomina_aprobada:{}},
      consolidado:terceros.map(t=>({categoria:t.categoria,proveedores:t.total,anticipos:0,cx_pagar:0,cx_cobrar:0,impuestos:0,total:-t.total,pago_sugerido:t.pago_sugerido})),
      detalle:terceros.map(t=>({...t,proveedores:t.total,anticipos:0,cx_pagar:0,cx_cobrar:0,total:-t.total})),resumenProvisiones:{total_agendado:0,total_aprobado:0,total_pagado:0},categorias:['FRUVER','CARNES']},secciones:{},
  };
}
