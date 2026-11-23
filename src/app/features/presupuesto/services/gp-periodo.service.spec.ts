import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { GpPeriodoService } from './gp-periodo.service';
import { PresupuestoContextService } from './presupuesto-context.service';

describe('Control mensual sin filtro de lectura',()=>{
  let ctx:PresupuestoContextService,api:HttpTestingController,service:GpPeriodoService;
  beforeEach(()=>{
    ctx=new PresupuestoContextService({} as any);ctx.empresaId.set(56);
    TestBed.configureTestingModule({providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{provide:PresupuestoContextService,useValue:ctx}]});
    service=TestBed.inject(GpPeriodoService);api=TestBed.inject(HttpTestingController);TestBed.flushEffects();
  });
  afterEach(()=>{api.verify();TestBed.resetTestingModule();});
  const datos={anios:[],historicos:{'2026-09':152},periodoActivo:'2026-10',estadosMes:[{periodo:'2026-09',aprobado:true},{periodo:'2026-10',aprobado:false}],datosEmpresa:['2026-08'],presupuestosEmpresa:['2026-08'],pagosEmpresa:['2026-08']};
  it('habilita el mes creado y conserva los datos de meses anteriores',()=>{
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush(datos);
    expect(ctx.mesActivo()).toBe('2026-10');expect(ctx.periodo()).toBe('2026-10');
    expect(service.creado()).toBeTrue();expect(service.tieneDatos()).toBeTrue();expect(service.tienePresupuesto()).toBeTrue();expect(service.tienePagos()).toBeTrue();
    expect(service.cerrado()).toBeFalse();
  });
  it('un histórico no equivale a la aprobación del mes',()=>{
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({...datos,historicos:{'2026-10':152}});
    expect(service.cerrado()).toBeFalse();
  });
  it('al aprobar el mes operativo pierde edición y Gerencia puede corregir',()=>{
    ctx.permisos.set({rolGp:'contador',gerencia:false,superAdmin:false,puedeAprobar:false,permisos:['presupuesto.editar_periodos']});
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({...datos,estadosMes:[{periodo:'2026-10',aprobado:true}]});
    expect(service.cerrado()).toBeTrue();expect(ctx.puedeEditarMes('2026-10')).toBeFalse();
    ctx.permisos.set({rolGp:'gerente',gerencia:true,superAdmin:false,puedeAprobar:true,permisos:['presupuesto.editar_periodos']});
    expect(ctx.puedeEditarMes('2026-10')).toBeTrue();
  });
  it('descarta una respuesta del gestor anterior',()=>{
    const viejo=api.expectOne(r=>r.url.endsWith('/periodos/seleccion'));
    ctx.empresaId.set(57);TestBed.flushEffects();
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({...datos,periodoActivo:'2026-11',estadosMes:[]});
    expect(viejo.cancelled).toBeTrue();expect(ctx.mesActivo()).toBe('2026-11');
  });
  it('permite reintentar una consulta fallida',()=>{
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({}, {status:500,statusText:'Error'});
    expect(service.error()).not.toBe('');service.recargar();
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush(datos);expect(service.error()).toBe('');
  });
  it('una recarga posterior vuelve al servidor, conservando los datos mientras espera',()=>{
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush(datos);
    const anteriores=service.datosEmpresa(); service.recargar();
    expect(service.datosEmpresa()).toBe(anteriores);
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({...datos,datosEmpresa:['2026-11']});
    expect(service.datosEmpresa()).toEqual(['2026-11']);
  });
  it('una escritura invalida la selección pendiente de la misma empresa',()=>{
    const anterior=api.expectOne(r=>r.url.endsWith('/periodos/seleccion'));
    service.recargar(true); expect(anterior.cancelled).toBeTrue();
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush(datos);
  });
  it('cerrar sesión cancela la selección pendiente y elimina los datos de la empresa',()=>{
    const anterior=api.expectOne(r=>r.url.endsWith('/periodos/seleccion'));
    ctx.limpiarSesion();ctx.sesionValidada.set(false);TestBed.flushEffects();
    expect(anterior.cancelled).toBeTrue();expect(service.datosEmpresa()).toEqual([]);
    api.expectNone(r=>r.url.endsWith('/periodos/seleccion'));
  });
  it('conserva los meses del catálogo cuando el servidor aún no devuelve el control mensual',()=>{
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({anios:[{anio:2026,meses:[{periodo:'2026-08',creado:true},{periodo:'2026-09',creado:true}]}],historicos:{},datosEmpresa:[]});
    expect(ctx.estadosMes().map(m=>m.periodo)).toEqual(['2026-08','2026-09']);
    expect(ctx.mesActivo()).toBe('2026-09');
  });
  it('los registros anteriores siguen visibles aunque el control mensual esté vacío',()=>{
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({anios:[{anio:2026,meses:[{periodo:'2026-08',creado:true}]}],historicos:{},datosEmpresa:['2026-09'],estadosMes:[],periodoActivo:null});
    expect(ctx.estadosMes().map(m=>m.periodo)).toEqual(['2026-09']);
    expect(ctx.mesActivo()).toBeNull();
  });

  it('un mes quitado de la empresa no reaparece desde el catálogo compartido',()=>{
    api.expectOne(r=>r.url.endsWith('/periodos/seleccion')).flush({anios:[{anio:2026,meses:[{periodo:'2026-08',creado:true}]}],historicos:{},estadosMes:[],periodoActivo:null});
    expect(ctx.estadosMes()).toEqual([]);
  });

});
