import { Injectable } from '@angular/core';
import { from, of, throwError } from 'rxjs';
import { Historico } from '../models/historico.model';
import { Empresa, ImportacionPeriodoInfo, Movimiento, PagoProyectado, ResumenModulo, ResumenPagos, CandidatoPago, FacturaSugerida, SugerenciaPresupuesto } from '../models/presupuesto.model';
import { mapMovimiento, mapPago, mapCandidato, mapFactura, mapSugerenciaPresupuesto, pagina } from './gp-mapper';
import { PresupuestoService } from './presupuesto.service';

type Fila=Record<string,any>;
export interface HistoricoModuloVista {
  historico:Historico;
  presentacion:{empresa:Empresa;categorias:string[];filas:Fila[];fuentes?:Record<string,Fila[]>;egresos?:Record<string,Fila[]>};
}
const numero=(valor:unknown)=>Number(valor??0);
const fecha=(valor:unknown)=>{const s=String(valor??'');return /^\d{2}\/\d{2}\/\d{4}/.test(s)?s.slice(6,10)+'-'+s.slice(3,5)+'-'+s.slice(0,2):s.slice(0,10);};
const sumar=(filas:PagoProyectado[])=>filas.reduce((total,p)=>total+p.montoProyectado,0);
const siguiente=(dia:string,dias:number)=>{const d=new Date(dia+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10);};

/** Fuente aislada sin HttpClient. Toda lectura usa la fotografía y toda escritura falla. */
@Injectable()
export class HistoricoModuloFuenteService {
  datos!:HistoricoModuloVista;
  modulo='proveedores';
  get codigo(){return ({'cuentas-pagar':'cx_pagar','cuentas-cobrar':'cx_cobrar'} as Record<string,string>)[this.modulo]??this.modulo;}
  get hoy(){return this.datos.historico.generadoEn.slice(0,10);}
  get categorias(){return [...new Set([...this.datos.presentacion.categorias,...this.datos.presentacion.filas.map(r=>r['categoria']).filter(Boolean)])];}
  get movimientos(){return this.datos.presentacion.filas.map(r=>mapMovimiento(r,this.codigo));}
  get pagos(){return this.datos.presentacion.filas.map(mapPago);}
  private fuentes(seccion:string){return this.datos.presentacion.fuentes?.[seccion]??[];}

  resumenModulo():ResumenModulo {
    const grupos=new Map<string|null,Movimiento[]>();
    this.movimientos.forEach(m=>grupos.set(m.categoria,[...(grupos.get(m.categoria)??[]),m]));
    const resumen=[...grupos].map(([categoria,filas])=>({categoria,debito:filas.reduce((n,m)=>n+m.debito,0),credito:filas.reduce((n,m)=>n+m.credito,0),saldo:filas.reduce((n,m)=>n+m.saldo,0),proveedores:new Set(filas.map(m=>m.nit).filter(n=>n!=null)).size}));
    return {resumen,totalDebito:resumen.reduce((n,r)=>n+r.debito,0),totalCredito:resumen.reduce((n,r)=>n+r.credito,0),totalSaldo:resumen.reduce((n,r)=>n+r.saldo,0),totalProveedores:resumen.reduce((n,r)=>n+r.proveedores,0),totalMovimientos:this.movimientos.length};
  }
  filtrar(filtros:Fila={}):Movimiento[]{
    let rows=this.movimientos.filter(m=>(!filtros['categoria']||m.categoria===filtros['categoria'])
      &&(!filtros['busqueda']||[m.nit,m.nombre,m.comprobante,m.detalle].join(' ').toLocaleLowerCase('es').includes(String(filtros['busqueda']).toLocaleLowerCase('es')))
      &&(!filtros['fechaDesde']||fecha(m.fecha)>=filtros['fechaDesde'])&&(!filtros['fechaHasta']||fecha(m.fecha)<=filtros['fechaHasta']));
    const campo=filtros['sortBy']||'fecha',dir=filtros['sortDir']==='asc'?1:-1;
    return rows.sort((a,b)=>{const x=(a as any)[campo],y=(b as any)[campo];return (typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??'')))*dir || a.id-b.id;});
  }
  resumenPagos():ResumenPagos {
    const pagos=this.pagos,proyectados=pagos.filter(p=>p.estado==='proyectado'),pagados=pagos.filter(p=>p.estado==='pagado');
    const rango=(dias:number)=>proyectados.filter(p=>fecha(p.fechaProyectada)>=this.hoy&&fecha(p.fechaProyectada)<=siguiente(this.hoy,dias));
    return {totalProyectado:sumar(proyectados),vencidos:sumar(proyectados.filter(p=>!!p.fechaProyectada&&fecha(p.fechaProyectada)<this.hoy)),proximos7Dias:sumar(rango(7)),proximos30Dias:sumar(rango(30)),totalPagado:sumar(pagados),cantidadPagados:pagados.length,totalAgendado:sumar(pagos.filter(p=>p.estado!=='cancelado')),totalAprobado:sumar(pagos.filter(p=>p.estado!=='cancelado'&&!!p.aprobado))};
  }
  candidatos():CandidatoPago[]{
    const congelados=this.datos.presentacion.egresos?.['candidatos'];
    if(congelados)return congelados.map(r=>mapCandidato({...r,saldo_total:r['saldo_total']??r['saldo_pendiente'],disponible_para_proyectar:r['disponible_para_proyectar']??r['disponible']}));
    const porNit=new Map<string,Map<string,Fila>>();
    for(const r of this.fuentes('movimientos')){
      if(!r['nit']||!['proveedores','anticipos','cx_pagar'].includes(r['modulo']))continue;
      const modulos=porNit.get(r['nit'])??new Map<string,Fila>();
      const previo=modulos.get(r['modulo']);modulos.set(r['modulo'],{...r,saldo:numero(previo?.['saldo'])+numero(r['saldo'])});porNit.set(r['nit'],modulos);
    }
    return [...porNit].flatMap(([nit,modulos])=>{
      const deudas=[...modulos.values()].filter(r=>numero(r['saldo'])<0);if(!deudas.length)return [];
      const saldoPendiente=deudas.reduce((n,r)=>n+Math.abs(numero(r['saldo'])),0);
      const yaProyectado=this.fuentes('pagos').filter(p=>p['nit']===nit&&p['estado']!=='cancelado').reduce((n,p)=>n+numero(p['monto_proyectado']),0);
      const disponible=saldoPendiente-yaProyectado;
      return disponible>.01?[{nit,nombre:deudas[0]['nombre'],categoria:deudas.find(r=>r['categoria'])?.['categoria']??null,saldoPendiente,yaProyectado,disponible,modulos:deudas.map(r=>r['modulo']).sort()}]:[];
    }).sort((a,b)=>b.disponible-a.disponible);
  }
  facturas():FacturaSugerida[]{
    const congelados=this.datos.presentacion.egresos?.['sugeridos'];if(congelados)return congelados.map(mapFactura);
    const anclados=new Set(this.fuentes('pagos').filter(p=>p['estado']!=='cancelado').map(p=>p['movimiento_id']));
    const grupos=new Map<string,Fila[]>();
    for(const r of this.fuentes('movimientos').filter(r=>r['modulo']==='cx_pagar'&&numero(r['saldo'])!==0)){
      const key=r['comprobante']?r['nit']+'|'+r['comprobante']:'sin-comprobante:'+r['id'];grupos.set(key,[...(grupos.get(key)??[]),r]);
    }
    return [...grupos.values()].flatMap(rows=>{
      const saldo=rows.reduce((n,r)=>n+numero(r['saldo']),0);if(saldo>=0||rows.some(r=>anclados.has(r['id'])))return [];
      const vencimiento=rows.map(r=>r['fecha_vencimiento']).filter(Boolean).sort((a,b)=>fecha(a).localeCompare(fecha(b)))[0]??null;
      return [mapFactura({...rows[0],monto:Math.abs(saldo),movimiento_id:Math.min(...rows.map(r=>numero(r['id']))),fecha_vencimiento:vencimiento,vencida:!!vencimiento&&fecha(vencimiento)<this.hoy})];
    }).sort((a,b)=>(a.fechaVencimiento??'9999-12-31').localeCompare(b.fechaVencimiento??'9999-12-31')||a.nit.localeCompare(b.nit));
  }
  sugerencias():SugerenciaPresupuesto[]{
    const congelados=this.datos.presentacion.egresos?.['sugerencias'];if(congelados)return congelados.map(mapSugerenciaPresupuesto);
    const origenes=[...this.fuentes('movimientos'),...this.fuentes('pagos')];
    const modulos=(key:string,valor:unknown)=>[...new Set(origenes.filter(r=>r[key]===valor).map(r=>r['modulo']??r['modulo_origen']??'manual'))].sort();
    const resultado:SugerenciaPresupuesto[]=[];
    for(const r of this.fuentes('terceros'))if(r['pago_sugerido']!=null||String(r['observacion']??'').trim())resultado.push({clave:'tercero:'+r['nit'],tipo:'tercero',nit:r['nit'],nombre:r['nombre'],categoria:r['categoria']??null,pagoSugerido:r['pago_sugerido']??null,observacion:r['observacion']??null,modulos:modulos('nit',r['nit'])});
    for(const r of this.fuentes('categorias_presupuesto'))if(r['pago_sugerido']!=null||String(r['notas']??'').trim())resultado.push({clave:'categoria:'+r['categoria'],tipo:'categoria',nit:null,nombre:r['categoria'],categoria:r['categoria'],pagoSugerido:r['pago_sugerido']??null,observacion:r['notas']??null,modulos:modulos('categoria',r['categoria'])});
    for(const r of this.fuentes('nomina_sugeridos'))resultado.push({clave:'nomina:'+r['campo'],tipo:'nomina',nit:null,nombre:r['campo'],categoria:'NÓMINA',pagoSugerido:r['pago_sugerido']??null,observacion:null,modulos:['nomina']});
    return resultado.sort((a,b)=>a.tipo.localeCompare(b.tipo)||a.nombre.localeCompare(b.nombre));
  }

  /** Última importación del módulo conservada en la foto (meses cargados/omitidos). */
  importacionPeriodos():ImportacionPeriodoInfo{
    const filas=(this.datos.presentacion as Record<string,unknown>)['importaciones'] as Fila[]|undefined;
    const ultima=Array.isArray(filas)?filas[0]:undefined;
    if(!ultima)return {importacionId:null,nombreArchivo:null,totalFilas:null,confirmada:null,creadoPor:null,createdAt:null,periodosCargados:[],periodosOmitidos:[]};
    const lista=(v:unknown):unknown[]=>{try{const x=JSON.parse(String(v??''));return Array.isArray(x)?x:[];}catch{return[];}};
    return {
      importacionId:numero(ultima['id'])||null,
      nombreArchivo:String(ultima['nombre_archivo']??'').trim()||null,
      totalFilas:numero(ultima['total_filas'])||null,
      confirmada:!!ultima['confirmada'],
      creadoPor:String(ultima['creado_por']??'').trim()||null,
      createdAt:String(ultima['created_at']??'').trim()||null,
      periodosCargados:lista(ultima['periodos_cargados']).map(p=>String(p)),
      periodosOmitidos:lista(ultima['periodos_omitidos']).map((o)=>{const f=typeof o==='object'&&o?o as Fila:{};return {periodo:String(f['periodo']??''),filas:numero(f['filas']),razon:String(f['razon']??'Ya existen pagos aprobados')};}),
    };
  }
  private async excel(categoria?:string,desde?:string,hasta?:string):Promise<Blob>{
    const XLSX=await import('xlsx');
    const filas=this.filtrar({categoria,fechaDesde:desde,fechaHasta:hasta}).map(m=>({NIT:m.nit,Nombre:m.nombre,Comprobante:m.comprobante,Fecha:m.fecha,Saldo:m.saldo,Categoria:m.categoria,Aprobada:m.aprobada}));
    const libro=XLSX.utils.book_new();XLSX.utils.book_append_sheet(libro,XLSX.utils.json_to_sheet(filas),'Histórico');
    return new Blob([XLSX.write(libro,{type:'array',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  private readonly lecturas:Record<string,(...args:any[])=>unknown>={
    categorias:()=>of([...this.categorias]),categoriasHistoricas:()=>of([...this.categorias]),
    resumenModulo:()=>of(this.resumenModulo()),movimientos:(_modulo,_empresa,filtros={})=>of(pagina(this.filtrar(filtros),filtros.page??0,filtros.size??15)),
    exportarModulo:(_modulo,_empresa,categoria,desde,hasta)=>from(this.excel(categoria,desde,hasta)),
    resumenPagos:()=>of(this.resumenPagos()),pagos:(_empresa,filtros={})=>of(pagina([...this.pagos].sort((a,b)=>a.fechaProyectada.localeCompare(b.fechaProyectada)||a.id-b.id),filtros.page??0,filtros.size??200)),
    candidatos:()=>of(this.candidatos()),facturasSugeridas:()=>of(this.facturas()),sugerenciasPresupuesto:()=>of(this.sugerencias()),
    importacionPeriodos:()=>of(this.importacionPeriodos()),cobrosProyectados:()=>of([]),
    mesesCerrados:()=>of([]),
  };
  readonly api=new Proxy({}, {get:(_target,nombre)=>this.lecturas[String(nombre)]??(()=>throwError(()=>new Error('El histórico es de solo lectura.')))}) as PresupuestoService;
}
