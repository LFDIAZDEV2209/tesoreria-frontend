import { GpAnticipoLegalizacionService } from '../../services/gp-anticipo-legalizacion.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { of, Subject, throwError } from 'rxjs';
import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PresupuestoPageComponent } from './presupuesto-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

// La página inyecta GpAnticipoLegalizacionService (panel de legalizaciones de
// anticipos), que depende de HttpClient: todos los describes construyen la
// página directamente, así que el proveedor se declara una sola vez aquí.
beforeEach(() => {
  TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
});

describe('Permisos de edición del presupuesto mensual', () => {
  afterEach(() => TestBed.resetTestingModule());
  beforeEach(() => {
    // El page inyecta GpAnticipoLegalizacionService (legalizaciones P7): el
    // injector del TestBed necesita HttpClient aunque estos tests no llaman HTTP.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('revocar editar períodos bloquea las celdas aunque el usuario sea operativo', () => {
    const ctx = new PresupuestoContextService({} as any); ctx.mesActivo.set('2026-09');ctx.estadosMes.set([{periodo:'2026-09',aprobado:false}]);
    const permisos = {gerencia:false,superAdmin:false,puedeAprobar:false,permisos:['presupuesto.editar_periodos']};
    ctx.permisos.set(permisos);
    const page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx, {} as any, {hasAnyRole:()=>false} as any));
    expect(page.puedeOperar()).toBeTrue();
    ctx.permisos.set({...permisos,permisos:[]});
    expect(page.puedeOperar()).toBeFalse();
    ctx.permisos.set(null);
    expect(page.puedeOperar()).toBeFalse();
    expect(page.puedeAprobar).toBeFalse();
  });
  it('editar sugeridos no concede editar períodos ni contrato', () => {
    const ctx = new PresupuestoContextService({} as any); ctx.mesActivo.set('2026-09');ctx.estadosMes.set([{periodo:'2026-09',aprobado:false}]);
    ctx.permisos.set({gerencia:true,superAdmin:false,puedeAprobar:true,permisos:['presupuesto.pago_sugerido_categoria']});
    const page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx, {} as any, {hasAnyRole:()=>true} as any));
    expect(page.puedeOperar()).toBeFalse();
    expect(ctx.tienePermiso('presupuesto.pago_sugerido_categoria')).toBeTrue();
    expect(ctx.tienePermiso('presupuesto.editar_contrato')).toBeFalse();
  });
});


describe('Presupuesto mensual y empresa de la respuesta', () => {
  let ctx: PresupuestoContextService;
  let api: any;
  let page: PresupuestoPageComponent;
  beforeEach(() => {
    // Inyección de GpAnticipoLegalizacionService (P7): el TestBed pide HttpClient.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = jasmine.createSpyObj('PresupuestoService', ['contrato','mensual','consolidado','detalleConsolidado','resumenPagos','mesesCerrados','categorias']);
    api.categorias.and.returnValue(of([]));
    api.mesesCerrados.and.returnValue(of([]));
    api.resumenPagos.and.returnValue(of({}));
    api.contrato.and.returnValue(of(null));
    api.mensual.and.returnValue(of(null));
    api.consolidado.and.returnValue(of([]));
    api.detalleConsolidado.and.returnValue(of({content:[],totalPages:1}));
    ctx = new PresupuestoContextService(api);ctx.mesActivo.set('2026-09');ctx.estadosMes.set([{periodo:'2026-09',aprobado:false}]);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, {set:(id:number|null) => {empresa=id;}}) as any;
    page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx,api,{} as any));
    TestBed.flushEffects();
    ctx.empresaId.set(35);
  });
  afterEach(() => { page.ngOnDestroy(); TestBed.resetTestingModule(); });
  it('no reemplaza el contrato B por una respuesta tardía A', async () => {
    const antigua = new Subject<any>(); api.mensual.and.returnValue(antigua);
    const cargaA = page.cargar();
    ctx.empresaId.set(36);
    api.mensual.and.returnValue(of({contrato:{numeroContrato:'B'}, meses:[]}));
    await page.cargar();
    expect(antigua.observed).toBeFalse();
    antigua.next({contrato:{numeroContrato:'A'}, meses:[]}); await cargaA;
    expect(page.contrato()?.numeroContrato).toBe('B');
  });
  it('carga solo la página visible del detalle: la paginación vive en el backend', async () => {
    const rows=Array.from({length:25},(_,i)=>({nit:String(i+1)}));
    api.detalleConsolidado.and.returnValue(of({content:rows,totalElements:201,totalPages:9,nombres:['Uno']}));
    await page.cargar();
    expect(api.detalleConsolidado).not.toHaveBeenCalled();
    await page.cargarSeccion('terceros');
    expect(api.detalleConsolidado).toHaveBeenCalledWith(35, jasmine.objectContaining({page:0, size:25}));
    expect(page.detalle().length).toBe(25);
    expect(page.detalleTotalElementos()).toBe(201);
    expect(page.detallePaginas()).toBe(9);
    expect(page.detalleNombres()).toEqual(['Uno']);
  });
  it('cancela el filtro anterior y conserva el detalle del filtro más reciente', async () => {
    const anterior = new Subject<any>(), actual = new Subject<any>();
    api.detalleConsolidado.and.returnValues(anterior, actual);
    const cargaAnterior = page.onDetalleFiltro({ campo: 'busqueda', valor: 'anterior' });
    const cargaActual = page.onDetalleFiltro({ campo: 'busqueda', valor: 'actual' });
    expect(anterior.observed).toBeFalse();
    await cargaAnterior;
    expect(page.detalleCargando()).toBeTrue();
    actual.next({ content: [{ nit: 'actual' }], totalElements: 1, totalPages: 1 });
    await cargaActual;
    anterior.next({ content: [{ nit: 'anterior' }], totalElements: 1, totalPages: 1 });
    expect(page.detalle()[0].nit).toBe('actual');
    expect(page.detalleCargando()).toBeFalse();
    expect(page.errorObservacion()).toBeNull();
  });
  it('cancela el detalle pendiente al destruir la pantalla', async () => {
    const pendiente = new Subject<any>();
    api.detalleConsolidado.and.returnValue(pendiente);
    const carga = page.cargarDetalle();
    page.ngOnDestroy();
    await carga;
    expect(pendiente.observed).toBeFalse();
    expect(page.errorObservacion()).toBeNull();
  });
  it('oculta contrato y PDF si se pierde la empresa autorizada', async () => {
    page.contrato.set({numeroContrato:'A'} as any);
    ctx.empresaId.set(null);
    await page.cargar();
    expect(page.contrato()).toBeNull();
    expect(page.mensual()).toBeNull();
    expect(api.contrato).not.toHaveBeenCalled();
  });
  it('un saldo neto en cero no oculta tablas que contienen información',async()=>{
    api.consolidado.and.returnValue(of([{categoria:'OTROS',total:0,proveedores:100,cxCobrar:100}]));
    api.mensual.and.returnValue(of({meses:['2026-09']}));
    await page.cargar();expect(page.bannerCategorias).toBeFalse();
    expect(api.consolidado).not.toHaveBeenCalled();
    await page.cargarSeccion('consolidado');
    expect(page.consolidado().length).toBe(1);
  });
  it('abre el mes del selector global sin saltar al último mes del contrato',async()=>{
    ctx.periodo.set('2026-09');
    page.ngOnDestroy();
    page=TestBed.runInInjectionContext(()=>new PresupuestoPageComponent(ctx,api,{} as any,{snapshot:{queryParamMap:{get:()=> '2026-09'}}} as any));
    api.mensual.and.returnValue(of({meses:['2026-09','2026-10']}));
    await page.cargar();expect(page.mesActivo()).toBe('2026-09');
  });
  it('conserva todas las tablas aunque el mes activo quede fuera de los datos recibidos',async()=>{
    ctx.periodo.set('2027-01');
    page.ngOnDestroy();
    page=TestBed.runInInjectionContext(()=>new PresupuestoPageComponent(ctx,api,{} as any,{snapshot:{queryParamMap:{get:()=> '2027-01'}}} as any));
    api.mensual.and.returnValue(of({meses:['2026-09','2026-10']}));
    await page.cargar();expect(page.mensual()?.meses).toEqual(['2026-09','2026-10']);expect(page.errorObservacion()).toBeNull();
  });
  it('un cierre antiguo posterior al contrato muestra la matriz realmente conservada',()=>{
    page.modoHistorico=true;page.periodoHistorico='2026-10';
    page.mensual.set({meses:['2025-03','2026-07']} as any);
    expect(page.mesesVisibles()).toEqual(['2025-03','2026-07']);
    expect(page.rangoHistoricoConservado()).toContain('Mar 2025 a Jul 2026');
    expect(page.mesesVisibles()).not.toContain('2026-10');
  });
});

describe('Observaciones persistidas por empresa y permiso', () => {
  let ctx: PresupuestoContextService;
  let api: any;
  let page: PresupuestoPageComponent;
  beforeEach(() => {
    // Inyección de GpAnticipoLegalizacionService (P7): el TestBed pide HttpClient.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = jasmine.createSpyObj('API', ['setObservacion']);
    ctx = new PresupuestoContextService(api);ctx.mesActivo.set('2026-09');ctx.estadosMes.set([{periodo:'2026-09',aprobado:false}]);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, {set:(id:number|null)=>{empresa=id;}}) as any;
    ctx.permisos.set({gerencia:false,superAdmin:false,puedeAprobar:false,permisos:['presupuesto.observaciones']});
    page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx,api,{} as any));
    TestBed.flushEffects(); ctx.empresaId.set(35);
    page.detalle.set([{nit:'123',observacion:'Anterior'}] as any);
  });
  afterEach(() => {page.ngOnDestroy(); TestBed.resetTestingModule();});
  const evento = (value:string) => ({target:{value}} as unknown as Event);
  it('publica la observación devuelta por el backend', () => {
    api.setObservacion.and.returnValue(of({nit:'123',observacion:'Guardada'}));
    page.guardarObservacion(page.detalle()[0],evento('Guardada'));
    expect(api.setObservacion).toHaveBeenCalledWith(35,'123','Guardada');
    expect(page.detalle()[0].observacion).toBe('Guardada');
    expect(page.guardandoNotas()['123']).toBeFalse();
  });
  it('revocar permiso impide guardar y no aparenta éxito', () => {
    ctx.permisos.set(null);
    page.guardarObservacion(page.detalle()[0],evento('No autorizada'));
    expect(api.setObservacion).not.toHaveBeenCalled();
    expect(page.detalle()[0].observacion).toBe('Anterior');
  });
  it('muestra el error HTTP sin reemplazar la observación persistida', () => {
    api.setObservacion.and.returnValue(throwError(()=>({error:{message:'Permiso revocado'}})));
    page.guardarObservacion(page.detalle()[0],evento('Intento'));
    expect(page.errorObservacion()).toContain('Permiso revocado');
    expect(page.detalle()[0].observacion).toBe('Anterior');
    expect(page.guardandoNotas()['123']).toBeFalse();
  });
  it('impide dos guardados simultáneos para el mismo tercero', () => {
    api.setObservacion.and.returnValue(new Subject());
    page.guardarObservacion(page.detalle()[0],evento('Primera'));
    page.guardarObservacion(page.detalle()[0],evento('Segunda'));
    expect(api.setObservacion).toHaveBeenCalledTimes(1);
  });
  it('descarta la respuesta al cambiar de empresa aunque coincida el NIT', () => {
    const respuesta = new Subject<any>();
    api.setObservacion.and.returnValue(respuesta);
    page.guardarObservacion(page.detalle()[0],evento('Empresa A'));
    ctx.empresaId.set(36);
    page.detalle.set([{nit:'123',observacion:'Empresa B'}] as any);
    respuesta.next({nit:'123',observacion:'Empresa A'});
    expect(page.detalle()[0].observacion).toBe('Empresa B');
  });
  it('el modal actualiza el detalle y conserva el texto cuando falla', () => {
    page.observacionPago.set({nit:'123',nombre:'Tercero',texto:'Modal'});
    api.setObservacion.and.returnValue(throwError(()=>new Error('Sin conexión')));
    page.guardarObservacionPago();
    expect(page.observacionPago()?.texto).toBe('Modal');
    expect(page.guardandoObservacion()).toBeFalse();
    api.setObservacion.and.returnValue(of({observacion:'Modal'}));
    page.guardarObservacionPago();
    expect(page.observacionPago()).toBeNull();
    expect(page.detalle()[0].observacion).toBe('Modal');
  });
});

describe('Paridad del detalle por tercero (paginado en el backend)', () => {
  let page: PresupuestoPageComponent;
  let api: any;
  const pagina = (content: any[], totalElements: number, totalPages: number, nombres: string[]) => ({
    content, page: 0, size: 100, totalElements, totalPages, nombres,
  });
  beforeEach(() => {
    // Inyección de GpAnticipoLegalizacionService (P7): el TestBed pide HttpClient.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const ctx=new PresupuestoContextService({} as any);
    ctx.empresaId.set(35);
    api=jasmine.createSpyObj('API',['detalleConsolidado']);
    api.detalleConsolidado.and.returnValue(of(pagina([
      {nit:'2',nombre:'Dos',categoria:'ABARROTES',total:20,proveedores:100,anticipos:120,alertaCruce:true},
      {nit:'3',nombre:'Uno adicional',categoria:'FRUVER',total:-5,proveedores:5,anticipos:0,alertaCruce:false},
      {nit:'1',nombre:'Uno',categoria:'ABARROTES',total:-100,proveedores:100,anticipos:0,alertaCruce:false},
    ], 3, 1, ['Dos','Uno','Uno adicional'])));
    page=TestBed.runInInjectionContext(()=>new PresupuestoPageComponent(ctx,api,{} as any));
    TestBed.flushEffects();
  });
  afterEach(()=>{page.ngOnDestroy();TestBed.resetTestingModule();});
  it('muestra la página tal cual la devuelve el backend, sin reordenar en el navegador', async () => {
    await page.onDetalleFiltro({campo:'',valor:''});
    expect(api.detalleConsolidado).toHaveBeenCalled();
    expect(page.detalleFiltrado().map(d=>d.nit)).toEqual(['2','3','1']);
    expect(page.detalleVisible()).toBe(page.detalleFiltrado());
    expect(page.detalleTotalElementos()).toBe(3);
  });
  it('el orden del total viaja al backend y vuelve a la página 0', async () => {
    await page.cambiarOrdenDetalle();
    expect(page.detalleOrden()).toBe('asc');
    expect(page.detallePagina()).toBe(0);
    expect(api.detalleConsolidado.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({orden:'asc', page:0}));
  });
  it('envía categoría, alerta y búsqueda al backend y reinicia la página', async () => {
    await page.onDetalleFiltro({campo:'categoria',valor:'ABARROTES'});
    expect(api.detalleConsolidado.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({categoria:'ABARROTES', page:0}));
    await page.onDetalleFiltro({campo:'estado',valor:'alerta'});
    expect(api.detalleConsolidado.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({alerta:'alerta', page:0}));
    await page.onDetalleFiltro({campo:'busqueda',valor:'Uno'});
    expect(api.detalleConsolidado.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({busqueda:'Uno', page:0}));
  });
  it('proveedor exacto y nombres del selector vienen del servidor', async () => {
    await page.onDetalleFiltro({campo:'nombre',valor:'Uno'});
    expect(api.detalleConsolidado.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({nombre:'Uno'}));
    expect(page.detalleNombres()).toEqual(['Dos','Uno','Uno adicional']);
  });
  it('pagina contra el servidor con los límites de la respuesta', async () => {
    api.detalleConsolidado.and.returnValue(of(pagina([{nit:'7',nombre:'Siete',total:7}], 201, 3, ['Siete'])));
    await page.onDetalleFiltro({campo:'',valor:''});
    expect(page.detallePaginas()).toBe(3);
    expect(page.detalleTotalElementos()).toBe(201);
    await page.irPaginaDetalle(1);
    expect(page.detallePagina()).toBe(1);
    expect(api.detalleConsolidado.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({page:1}));
    await page.irPaginaDetalle(-1);
    expect(page.detallePagina()).toBe(0);
    await page.irPaginaDetalle(-5);
    expect(page.detallePagina()).toBe(0);
    await page.irPaginaDetalle(9);
    expect(page.detallePagina()).toBe(2);
  });
});

describe('Contrato: plazo CxC, rango y guardado aislado',()=>{
  let ctx: PresupuestoContextService;
  let api: any;
  let page: PresupuestoPageComponent;
  beforeEach(()=>{
    // Inyección de GpAnticipoLegalizacionService (P7): el TestBed pide HttpClient.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api=jasmine.createSpyObj('API',['guardarContrato']);api.guardarContrato.and.returnValue(of({plazoCxcDias:45}));
    ctx=new PresupuestoContextService(api); ctx.mesActivo.set('2026-09');ctx.estadosMes.set([{periodo:'2026-09',aprobado:false}]);
    let empresa:number|null=null;
    ctx.empresaId=Object.assign(()=>empresa,{set:(id:number|null)=>{empresa=id;}}) as any;
    ctx.permisos.set({gerencia:false,superAdmin:false,puedeAprobar:false,permisos:['presupuesto.editar_contrato']});
    page=TestBed.runInInjectionContext(()=>new PresupuestoPageComponent(ctx,api,{} as any));
    TestBed.flushEffects();ctx.empresaId.set(35);
    spyOn(page,'cargar').and.resolveTo();
  });
  afterEach(()=>{page.ngOnDestroy();TestBed.resetTestingModule();});
  it('envía fechas explícitas cuando presupuesto y contrato comparten rango',()=>{
    page.guardarContratoModal('CERT','2026-09-01','2026-11-30','1000','30','100','60');
    expect(api.guardarContrato).toHaveBeenCalledWith(35,jasmine.objectContaining({plazoCxcDias:60,fechaInicialPresupuesto:'2026-09-01',fechaFinalPresupuesto:'2026-11-30'}));
  });
  it('conserva rango independiente y reconoce al reabrir si coinciden ambas fechas',()=>{
    page.contrato.set({fechaInicial:'2026-09-01',fechaFinal:'2026-11-30',fechaInicialPresupuesto:'2026-09-01',fechaFinalPresupuesto:'2026-11-30'} as any);
    page.abrirModalContrato();expect(page.usarMismasFechas()).toBeTrue();
    page.contrato.set({...page.contrato(),fechaFinalPresupuesto:'2026-12-31'} as any);
    page.abrirModalContrato();expect(page.usarMismasFechas()).toBeFalse();
    page.guardarContratoModal('CERT','2026-09-01','2026-11-30','1000','30','100','30');
    expect(api.guardarContrato).toHaveBeenCalledWith(35,jasmine.objectContaining({fechaFinalPresupuesto:'2026-12-31',plazoCxcDias:30}));
  });
  it('rechaza plazo vacío, decimal y fuera de rango antes de enviar',()=>{
    for(const plazo of ['', '29','61','45.5'])page.guardarContratoModal('CERT','2026-09-01','2026-11-30','1000','30','100',plazo);
    expect(api.guardarContrato).not.toHaveBeenCalled();expect(page.errorContrato()).toContain('30 y 60');
  });
  it('doble guardado y revocación no producen escrituras adicionales',()=>{
    api.guardarContrato.and.returnValue(new Subject());
    page.guardarContrato({plazoCxcDias:45});page.guardarContrato({plazoCxcDias:60});
    expect(api.guardarContrato.calls.count()).toBe(1);
    page.guardando.set(false);ctx.permisos.set(null);page.guardarContrato({plazoCxcDias:30});
    expect(api.guardarContrato.calls.count()).toBe(1);
  });
  it('respuesta de empresa anterior no reemplaza el contrato ni cierra formulario nuevo',()=>{
    const respuesta=new Subject<any>();api.guardarContrato.and.returnValue(respuesta);
    page.guardarContrato({plazoCxcDias:45});ctx.empresaId.set(36);
    page.contrato.set({numeroContrato:'B'} as any);page.modalContrato.set(true);
    respuesta.next({numeroContrato:'A'});
    expect(page.contrato()?.numeroContrato).toBe('B');expect(page.modalContrato()).toBeTrue();
  });
  it('error de validación del servidor queda visible para corregir sin cerrar',()=>{
    api.guardarContrato.and.returnValue(throwError(()=>({error:{message:'Fecha inválida'}})));
    page.modalContrato.set(true);page.guardarContrato({fechaInicial:'2026-02-30'});
    expect(page.errorContrato()).toBe('Fecha inválida');expect(page.guardando()).toBeFalse();expect(page.modalContrato()).toBeTrue();
  });
  it('aviso de vencimiento distingue hoy, futuro y atraso sin desfase horario',()=>{
    jasmine.clock().install();jasmine.clock().mockDate(new Date(2026,8,22,10));
    try {
      expect(page.textoVencimiento('2026-09-22')).toEqual({texto:'Vence hoy',vencida:false});
      expect(page.textoVencimiento('2026-09-23')).toEqual({texto:'Faltan 1 día',vencida:false});
      expect(page.textoVencimiento('2026-09-20')).toEqual({texto:'Vencida hace 2 días',vencida:true});
      expect(page.textoVencimiento('2026-02-30')).toBeNull();
    }finally{jasmine.clock().uninstall();}
  });
});


describe('Períodos: respuestas aisladas y confirmación real',()=>{
  let ctx:PresupuestoContextService, page:PresupuestoPageComponent, api:any;
  beforeEach(()=>{
    // Inyección de GpAnticipoLegalizacionService (P7): el TestBed pide HttpClient.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    jasmine.clock().install();
    api=jasmine.createSpyObj('API',['guardarPeriodo','mensual','contrato','aprobar','rechazar']);api.aprobar.and.returnValue(of(null));api.rechazar.and.returnValue(of(null));
    api.guardarPeriodo.and.returnValue(of({}));api.mensual.and.returnValue(of({meses:['2026-09']}));api.contrato.and.returnValue(of({numeroContrato:'A'}));
    ctx=new PresupuestoContextService(api); ctx.mesActivo.set('2026-09');ctx.estadosMes.set([{periodo:'2026-09',aprobado:false}]);
    let empresa:number|null=null;
    ctx.empresaId=Object.assign(()=>empresa,{set:(id:number|null)=>{empresa=id;}}) as any;
    ctx.permisos.set({gerencia:false,superAdmin:false,puedeAprobar:false,permisos:['presupuesto.editar_periodos']});
    page=TestBed.runInInjectionContext(()=>new PresupuestoPageComponent(ctx,api,{} as any));
    TestBed.flushEffects();ctx.empresaId.set(38);spyOn(window,'alert');
  });
  afterEach(()=>{page.ngOnDestroy();jasmine.clock().uninstall();TestBed.resetTestingModule();});
  it('aprobar envía la aprobación global del presupuesto y refleja el contrato',()=>{
    ctx.permisos.set({gerencia:true,superAdmin:false,puedeAprobar:true,rolGp:'gerente',permisos:['presupuesto.aprobar','presupuesto.editar_periodos']});
    api.aprobar.and.returnValue(of({estadoAprobacion:'aprobado',aprobadoPor:'Gerente',motivoRechazo:null}));
    page.aprobar();
    expect(api.aprobar).toHaveBeenCalledOnceWith(38);
    expect(page.estadoAprobacion().tipo).toBe('aprobado');
    expect(page.estadoAprobacion().label).toContain('Gerente');
    expect(page.guardando()).toBeFalse();
  });
  it('rechazar exige motivo y refleja el estado rechazado',()=>{
    ctx.permisos.set({gerencia:true,superAdmin:false,puedeAprobar:true,rolGp:'gerente',permisos:['presupuesto.aprobar']});
    page.rechazar();
    expect(api.rechazar).not.toHaveBeenCalled();
    api.rechazar.and.returnValue(of({estadoAprobacion:'rechazado',motivoRechazo:'Falta soporte'}));
    page.motivoRechazo.set('Falta soporte');
    page.rechazar();
    expect(api.rechazar).toHaveBeenCalledOnceWith(38,'Falta soporte');
    expect(page.estadoAprobacion().tipo).toBe('rechazado');
  });
  it('no envía escritura si se revoca el permiso',()=>{
    ctx.permisos.set(null);page.guardarCampo('2026-09','valorFacturado',100);
    expect(api.guardarPeriodo).not.toHaveBeenCalled();
  });
  it('no modifica el mes aprobado y permite editar el mes nuevo',()=>{
    ctx.mesActivo.set('2026-10');ctx.estadosMes.set([{periodo:'2026-09',aprobado:true},{periodo:'2026-10',aprobado:false}]);
    page.guardarCampo('2026-09','valorFacturado',100);
    expect(api.guardarPeriodo).not.toHaveBeenCalled();
    expect(page.mesCerrado('2026-09')).toBeTrue();
    expect(page.mesCerrado('2026-10')).toBeFalse();
    page.guardarCampo('2026-10','valorFacturado',100);
    expect(api.guardarPeriodo).toHaveBeenCalledWith(38,'2026-10','valorFacturado',100);
  });
  it('muestra éxito solo tras confirmar persistencia y conserva error visible',()=>{
    const save=new Subject<any>();api.guardarPeriodo.and.returnValue(save);
    page.guardarCampo('2026-09','valorFacturado',100);expect(page.ok('2026-09valorFacturado')).toBeFalse();
    save.next({});expect(page.ok('2026-09valorFacturado')).toBeTrue();jasmine.clock().tick(1600);expect(page.ok('2026-09valorFacturado')).toBeFalse();
    api.guardarPeriodo.and.returnValue(throwError(()=>({error:{message:'Período inválido'}})));
    page.guardarCampo('2026-09','valorFacturado',100);expect(window.alert).toHaveBeenCalledWith('Período inválido');
    expect(page.ok('2026-09valorFacturado')).toBeFalse();
  });
  it('ignora guardado y lectura tardíos al cambiar de empresa o destruir la página',()=>{
    const save=new Subject<any>();api.guardarPeriodo.and.returnValue(save);
    page.guardarCampo('2026-09','valorFacturado',100);ctx.empresaId.set(36);save.next({});
    expect(api.mensual).not.toHaveBeenCalled();expect(api.contrato).not.toHaveBeenCalled();
    ctx.empresaId.set(38);api.guardarPeriodo.and.returnValue(of({}));const lectura=new Subject<any>();api.mensual.and.returnValue(lectura);
    page.guardarCampo('2026-09','valorFacturado',100);page.ngOnDestroy();lectura.next({meses:['anterior']});
    expect(page.mensual()).toBeNull();
  });
  it('una lectura anterior no reemplaza el resultado del último guardado',()=>{
    const primera=new Subject<any>(),segunda=new Subject<any>();api.mensual.and.returnValues(primera,segunda);
    page.guardarCampo('2026-09','valorFacturado',100);page.guardarCampo('2026-09','valorFacturado',200);
    segunda.next({meses:['último']});primera.next({meses:['anterior']});
    expect(page.mensual()?.meses).toEqual(['último']);
  });
  it('pinta el valor guardado al instante y el refetch consolidado llega fresco',()=>{
    page.mensual.set({meses:['2026-09'],
      filasContrato:[{concepto:'P',campo:'valorFacturado',valores:{'2026-09':1}}],
      filasFlujoCaja:[{concepto:'F',campo:'otroCampo',valores:{'2026-09':2}}]} as any);
    const save=new Subject<any>(),refetch=new Subject<any>();
    api.guardarPeriodo.and.returnValue(save);api.mensual.and.returnValue(refetch);
    page.guardarCampo('2026-09','valorFacturado',777123);
    save.next({});
    expect(page.mensual()?.filasContrato?.[0].valores['2026-09']).toBe(777123);   // óptica inmediata
    expect(page.mensual()?.filasFlujoCaja?.[0].valores['2026-09']).toBe(2);      // no toca otros campos
    expect(api.mensual).toHaveBeenCalledWith(38, true, true);                    // resumen fresco, sin descargar las tablas ocultas
    refetch.next({meses:['2026-09'],filasContrato:[{concepto:'P',campo:'valorFacturado',valores:{'2026-09':777123}}]});
    expect(page.mensual()?.filasContrato?.[0].valores['2026-09']).toBe(777123);  // consolidado del backend
  });
});


describe('Resumen de la referencia y meses editables', () => {
  let page: PresupuestoPageComponent;
  beforeEach(() => { // Inyección de GpAnticipoLegalizacionService (P7): el TestBed pide HttpClient.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const ctx = new PresupuestoContextService({} as any); ctx.mesActivo.set('2026-09');ctx.estadosMes.set([{periodo:'2026-09',aprobado:false}]); ctx.periodo.set('2026-01'); page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx, {} as any, {hasAnyRole:()=>false} as any)); });
  afterEach(() => { page.ngOnDestroy(); TestBed.resetTestingModule(); });
  it('las cards leen la sección y "Pagos proyectados" sólo lo aprobado por Gerencia', () => {
    // Con el presupuesto aprobado, las cards leen los consolidados del backend.
    page.contrato.set({ estadoAprobacion: 'aprobado' } as any);
    page.mensual.set({
      meses: ['2026-01'],
      proveedores: {detalle: []}, prestamos: {detalle: []}, impuestosEstampillasSeguros: {detalle: []},
      anticipos: {detalle: []}, pagosProyectados: {detalle: [], total: {'2026-01': 999}},
      resumenAprobados: {
        proveedores: {aprobado: 100, aprobadoPagos: 90, pagado: 30},
        cx_pagar: {aprobado: 50, aprobadoPagos: 45, pagado: 10},
        manual: {aprobado: 15, aprobadoPagos: 15, pagado: 5},
        importado: {aprobado: 5, aprobadoPagos: 5, pagado: 0},
        cx_cobrar: {aprobado: 80, aprobadoPagos: 75, pagado: 20},
        anticipos: {aprobado: 20, aprobadoPagos: 20, pagado: 0},
        nomina: {aprobado: 40, aprobadoPagos: 40, pagado: 4},
      },
    } as any);
    const valores = Object.fromEntries(page.resumenRapido().map(d=>[d.label,d.valor]));
    expect(valores['Proveedores']).toBe(100);
    expect(valores['Cuentas por pagar']).toBe(50);
    expect(valores['Impuestos']).toBe(0);
    expect(valores['Provisiones']).toBe(20);
    expect(valores['Cuentas por cobrar']).toBe(80);
    expect(valores['Anticipos']).toBe(20);
    // "Pagos proyectados" = suma de aprobadoPagos de egresos (incl. nómina; sin cobros de CxC).
    expect(valores['Pagos proyectados']).toBe(215);
    expect(valores['Ya pagado']).toBe(49);
  });
  it('la sección y la card de Pagos proyectados quedan en cero hasta que Gerencia apruebe el presupuesto', () => {
    const filaPago = { nit: '900', nombre: 'PROVEEDOR UNO', categoria: null, categoriaDetalle: null, observacion: null, pagoSugerido: 0, valores: { '2026-01': 999 }, pagadoPorMes: {}, montoPagado: 0, montoPendiente: 999, total: 999, saldoPendiente: 999 };
    page.mensual.set({
      meses: ['2026-01'],
      proveedores: { detalle: [] }, prestamos: { detalle: [] }, impuestosEstampillasSeguros: { detalle: [] },
      anticipos: { detalle: [] }, pagosProyectados: { detalle: [filaPago], total: { '2026-01': 999 } },
      resumenAprobados: {
        proveedores: { aprobado: 100, aprobadoPagos: 90, pagado: 30 },
        manual: { aprobado: 15, aprobadoPagos: 15, pagado: 5 },
      },
    } as any);

    // Sin aprobación (contrato pendiente): sección vacía y card en cero.
    expect(page.presupuestoAprobado()).toBeFalse();
    expect(page.pagosProyectadosVisibles().detalle.length).toBe(0);
    expect(page.totalPagosMes('2026-01', 'pagos')).toBe(0);
    expect(page.contadorSeccion('pagos')).toBe('0 beneficiarios');
    expect(page.contadorCorto('pagos')).toBe('0');
    expect(page.subtituloSeccion('pagos')).toContain('0 beneficiarios');
    let valores = Object.fromEntries(page.resumenRapido().map(d => [d.label, d.valor]));
    expect(valores['Pagos proyectados']).toBe(0);
    // Lo ya pagado es un hecho ejecutado: no depende de la aprobación.
    expect(valores['Ya pagado']).toBe(35);

    // Con la aprobación global, la sección y la card reflejan los pagos.
    page.contrato.set({ estadoAprobacion: 'aprobado' } as any);
    expect(page.pagosProyectadosVisibles().detalle.length).toBe(1);
    expect(page.totalPagosMes('2026-01', 'pagos')).toBe(999);
    expect(page.contadorSeccion('pagos')).toBe('1 beneficiarios');
    valores = Object.fromEntries(page.resumenRapido().map(d => [d.label, d.valor]));
    expect(valores['Pagos proyectados']).toBe(105);

    // Un presupuesto rechazado también deja la sección y la card en cero.
    page.contrato.set({ estadoAprobacion: 'rechazado' } as any);
    expect(page.pagosProyectadosVisibles().detalle.length).toBe(0);
    valores = Object.fromEntries(page.resumenRapido().map(d => [d.label, d.valor]));
    expect(valores['Pagos proyectados']).toBe(0);
  });
  it('el estado aprobado avisa los cambios de pagos pendientes de aprobación', () => {
    page.contrato.set({ estadoAprobacion: 'aprobado', aprobadoPor: 'Gerente', fechaAprobacion: '2026-10-01' } as any);
    page.mensual.set({ meses: ['2026-01'], cambiosPendientesPagos: 3 } as any);
    expect(page.estadoAprobacion().tipo).toBe('aprobado');
    expect(page.estadoAprobacion().label).toContain('3 cambios pendientes de aprobación');

    page.mensual.set({ meses: ['2026-01'], cambiosPendientesPagos: 0 } as any);
    expect(page.estadoAprobacion().label).not.toContain('pendientes de aprobación');
  });
  it('los meses sin información arrancan colapsados y el botón los despliega', () => {
    page.mensual.set({meses:['2026-01','2026-02'],filasContrato:[{valores:{'2026-01':10,'2026-02':0}}]} as any);
    expect(page.mesColapsado('contrato','2026-01')).toBeFalse(); // con dato: abierto
    expect(page.mesColapsado('contrato','2026-02')).toBeTrue();  // sin dato: colapsado automático
    page.toggleMesColapsado('contrato','2026-02');
    expect(page.mesColapsado('contrato','2026-02')).toBeFalse(); // el usuario lo despliega
    page.toggleMesColapsado('contrato','2026-02');
    expect(page.mesColapsado('contrato','2026-02')).toBeTrue();  // y puede volver a ocultarlo
  });
  it('alternarTodosMeses colapsa y expande el bloque completo por encima del automático', () => {
    page.mensual.set({meses:['2026-01','2026-02'],filasContrato:[{valores:{'2026-01':10,'2026-02':0}}]} as any);
    expect(page.mesesTodosColapsados('contrato')).toBeFalse();
    page.alternarTodosMeses('contrato');
    expect(page.mesColapsado('contrato','2026-01')).toBeTrue();
    expect(page.mesColapsado('contrato','2026-02')).toBeTrue();
    expect(page.mesesTodosColapsados('contrato')).toBeTrue();
    page.alternarTodosMeses('contrato');
    expect(page.mesColapsado('contrato','2026-01')).toBeFalse();
    expect(page.mesColapsado('contrato','2026-02')).toBeFalse();
  });
  it('los listados de terceros no recortan los registros a 60 filas', () => {
    const detalle=Array.from({length:75},(_,i)=>({nit:String(i),nombre:'Tercero '+i}));
    page.ctx.mesActivo.set(null);page.ctx.estadosMes.set([]);page.mensual.set({proveedores:{detalle,total:{'2026-01':25,'2026-02':0}},meses:['2026-01','2026-02']} as any);
    expect(page.tercerosFiltrados('proveedores').length).toBe(75);
    // 2026-02 no tiene total: llega colapsado por defecto.
    expect(page.columnasVisibles('proveedores')).toEqual(['2026-01']);
    page.filtroTerceros.set('Tercero 7');
    expect(page.tercerosFiltrados('proveedores').map(d=>d.nit)).toEqual(['7']);
  });
  it('distingue pagos completos y parciales por mes', () => {
    const d = {valores:{'2026-08':100,'2026-09':200}, pagadoPorMes:{'2026-08':100,'2026-09':50}} as any;
    expect(page.estadoPagoMes(d,'2026-08')).toBe('Pagado');
    expect(page.pendienteMes(d,'2026-08')).toBe(0);
    expect(page.estadoPagoMes(d,'2026-09')).toBe('Pago parcial');
    expect(page.pendienteMes(d,'2026-09')).toBe(150);
  });

  it('muestra el mes habilitado aunque todavía no venga con datos en la respuesta mensual',()=>{
    page.mensual.set({meses:['2026-01','2026-02']} as any);
    page.ctx.estadosMes.set([{periodo:'2027-11',aprobado:false}]);page.ctx.mesActivo.set('2027-11');
    // Sin totales en la sección, todos los meses arrancan colapsados (auto).
    expect(page.columnasVisibles('proveedores')).toEqual([]);
    expect(page.mesesVisibles()).toContain('2027-11');
  });

});


describe('Streaming de comprobantes de legalización en presupuesto', () => {
  let ctx: PresupuestoContextService;
  let page: PresupuestoPageComponent;
  let legal: jasmine.SpyObj<GpAnticipoLegalizacionService>;
  let toast: jasmine.SpyObj<PresupuestoToastService>;
  beforeEach(() => {
    legal = jasmine.createSpyObj('GpAnticipoLegalizacionService', ['contenidosArchivo']);
    toast = jasmine.createSpyObj('PresupuestoToastService', ['mostrar','error']);
    TestBed.configureTestingModule({providers:[
      {provide:GpAnticipoLegalizacionService,useValue:legal},
      {provide:PresupuestoToastService,useValue:toast},
    ]});
    ctx = new PresupuestoContextService({} as any);
    page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx,{} as any,{} as any));
    TestBed.flushEffects(); ctx.empresaId.set(35);
  });
  afterEach(() => {page.ngOnDestroy();TestBed.resetTestingModule();});

  it('abre la pestaña antes de pedir los bytes y revoca el blob al minuto', fakeAsync(() => {
    const ventana = {opener:{},close:jasmine.createSpy('close'),location:{replace:jasmine.createSpy('replace')}};
    spyOn(window,'open').and.returnValue(ventana as any);
    spyOn(URL,'createObjectURL').and.returnValue('blob:pdf'); spyOn(URL,'revokeObjectURL');
    legal.contenidosArchivo.and.callFake(() => {
      expect(window.open).toHaveBeenCalledWith('about:blank','_blank');
      return of(new HttpResponse({body:new Blob(['%PDF-1.7'])}));
    });
    page.abrirLegalizacion(7);
    expect(legal.contenidosArchivo).toHaveBeenCalledWith(35,7);
    expect(ventana.opener).toBeNull();
    expect(ventana.location.replace).toHaveBeenCalledWith('blob:pdf');
    tick(60000); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf');
  }));

  it('cierra la pestaña si la respuesta es vacía o falla la descarga', () => {
    const ventana = {close:jasmine.createSpy('close')}; spyOn(window,'open').and.returnValue(ventana as any);
    legal.contenidosArchivo.and.returnValue(of(new HttpResponse({body:new Blob([])})));
    page.abrirLegalizacion(7);
    legal.contenidosArchivo.and.returnValue(throwError(() => ({status:403})));
    page.abrirLegalizacion(7);
    expect(ventana.close).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith('No se pudo abrir el comprobante de legalización. Intenta de nuevo.');
  });

  it('descarta los bytes que llegan después de cambiar de empresa', () => {
    const respuesta = new Subject<HttpResponse<Blob>>();
    const ventana = {close:jasmine.createSpy('close')}; spyOn(window,'open').and.returnValue(ventana as any);
    spyOn(URL,'createObjectURL'); legal.contenidosArchivo.and.returnValue(respuesta);
    page.abrirLegalizacion(7); ctx.empresaId.set(36);
    respuesta.next(new HttpResponse({body:new Blob(['%PDF-1.7'])}));
    expect(ventana.close).toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('informa cuando las ventanas emergentes están bloqueadas', () => {
    spyOn(window,'open').and.returnValue(null);
    legal.contenidosArchivo.and.returnValue(of(new HttpResponse({body:new Blob(['%PDF-1.7'])})));
    page.abrirLegalizacion(7);
    expect(toast.error).toHaveBeenCalledWith('Permite las ventanas emergentes y vuelve a abrir el comprobante.');
  });
});
