import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { HistoricosService } from '../../services/historicos.service';
import { HistoricoConsulta, mesBogota } from '../../models/historico.model';
import { HistoricoPresupuestoComponent } from './historico-presupuesto.component';
import { GpPeriodoService } from '../../services/gp-periodo.service';
import { HistoricosPageComponent } from './historicos-page.component';
import { HistoricosCompararComponent } from './historicos-comparar.component';
import { HistoricoDetalleComponent } from './historico-detalle.component';
import { PresupuestoPageComponent } from '../presupuesto/presupuesto-page.component';

const foto = (): HistoricoConsulta => ({
  historico:{id:7,empresaId:44,empresaNombre:'Empresa conservada',periodo:'2026-09',generadoEn:'2026-09-30T23:45:00-05:00',usuarioId:1,usuarioNombre:'Gerente',versionFormato:1,sha256:'hash'},
  vista:{empresa:{id:44,name:'Empresa conservada'},contrato:{numero_contrato:'CONTRATO HISTÓRICO',valor_inicial_contrato:100000000},
    mensual:{contrato:{numero_contrato:'CONTRATO HISTÓRICO',valor_inicial_contrato:100000000},meses:['2026-09','2026-10'],
      filas_contrato:[{concepto:'Valor Facturado',editable:true,campo:'valor_facturado',valores:{'2026-09':70000000,'2026-10':85000000}}],
      notas:{'2026-09':'Nota del mes'},proveedores:{detalle:[{nit:'123',nombre:'Proveedor conservado',total:100,pago_sugerido:70,valores:{'2026-09':100}}],total:{'2026-09':100}}},
    consolidado:[{categoria:'OTROS',proveedores:100,total:-100,pago_sugerido:70}],detalle:[{nit:'123',nombre:'Proveedor conservado',proveedores:100,total:-100,pago_sugerido:70}],
    resumenProvisiones:{total_agendado:25,total_aprobado:20,total_pagado:15},categorias:['OTROS']},
  secciones:{movimientos:1,periodos:1,pagos:1},
});

describe('Consulta del presupuesto histórico con su interfaz real', () => {
  let http: HttpTestingController; let ctx: PresupuestoContextService;
  beforeEach(() => {
    ctx = new PresupuestoContextService({} as any); ctx.empresaId.set(99);
    ctx.permisos.set({gerencia:true,superAdmin:true,puedeAprobar:true,permisos:['historicos.ver']});
    TestBed.configureTestingModule({imports:[HistoricoPresupuestoComponent,NoopAnimationsModule],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      {provide:PresupuestoContextService,useValue:ctx},{provide:AuthorizationService,useValue:{hasAnyRole:()=>true}}]});
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  it('muestra la fotografía sin peticiones al gestor actual y sin controles de edición, incluso para Superadmin', async () => {
    const fixture = TestBed.createComponent(HistoricoPresupuestoComponent); fixture.componentRef.setInput('consulta',foto()); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    const child = fixture.debugElement.query(By.directive(PresupuestoPageComponent)); const page = child.componentInstance as PresupuestoPageComponent;
    expect(page.contrato()?.valorInicialContrato).toBe(100000000);
    expect(page.mensual()?.filasContrato[0].valores['2026-09']).toBe(70000000);
    expect(page.detalle()[0].pagoSugerido).toBe(70); expect(page.resumenProvisiones().pagado).toBe(15);
    expect(page.esGerencia).toBeFalse(); expect(page.puedeAprobar).toBeFalse(); expect(page.puedeOperar()).toBeFalse();
    expect(page.mesActivo()).toBe('2026-09'); expect(ctx.empresaId()).toBe(99);
    page.togglePestana('todos'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-gp-celda-monto').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Solo lectura');
    expect(fixture.nativeElement.textContent).not.toContain('Editar contrato');
    expect(fixture.nativeElement.textContent).not.toContain('Descargar Excel');
    http.expectNone(() => true);
    const localApi = child.injector.get(PresupuestoService);
    await expectAsync(firstValueFrom(localApi.aprobar(44))).toBeRejectedWithError('El histórico es de solo lectura.');
    await page.cargar(); http.expectNone(() => true);
    fixture.destroy();
  });
  it('la fecha relativa de vencimiento permanece en el día de captura', async () => {
    const fixture = TestBed.createComponent(HistoricoPresupuestoComponent); fixture.componentRef.setInput('consulta',foto()); fixture.detectChanges(); await fixture.whenStable();
    const page = fixture.debugElement.query(By.directive(PresupuestoPageComponent)).componentInstance as PresupuestoPageComponent;
    expect(page.textoVencimiento('2026-09-30')?.texto).toBe('Vence hoy'); fixture.destroy();
  });
  it('al cambiar de histórico de la misma empresa reemplaza los valores sin mezclar fotografías', async () => {
    const fixture = TestBed.createComponent(HistoricoPresupuestoComponent); fixture.componentRef.setInput('consulta',foto()); fixture.detectChanges(); await fixture.whenStable();
    const otra = foto(); otra.historico = {...otra.historico,id:8,periodo:'2026-10'};
    otra.vista.contrato = {...otra.vista.contrato,numero_contrato:'OTRO CIERRE',valor_inicial_contrato:120000000};
    fixture.componentRef.setInput('consulta',otra); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.debugElement.query(By.directive(PresupuestoPageComponent)).componentInstance as PresupuestoPageComponent;
    expect(page.contrato()?.valorInicialContrato).toBe(120000000); expect(page.contrato()?.numeroContrato).toBe('OTRO CIERRE');
    expect(page.mesActivo()).toBe('2026-10'); expect(ctx.empresaId()).toBe(99); http.expectNone(() => true); fixture.destroy();
  });
});

describe('Pantallas de históricos: permisos, comparación y aislamiento', () => {
  let ctx: PresupuestoContextService; let api: jasmine.SpyObj<HistoricosService>;
  beforeEach(() => {
    ctx = new PresupuestoContextService({} as any); ctx.empresaId.set(44); ctx.empresas.set([{id:44,name:'Prueba'},{id:45,name:'Otra'}]);
    ctx.permisos.set({gerencia:true,superAdmin:false,puedeAprobar:false,rolGp:'gerente',permisos:['historicos.ver','historicos.crear']});
    api = jasmine.createSpyObj('históricos',['listar','consolidar','comparar','consultar','registros']);
    api.listar.and.returnValue(of({content:[foto().historico],page:0,size:20,totalElements:1,totalPages:1}));
    api.consolidar.and.returnValue(of(foto().historico));
    api.comparar.and.callFake((_empresa, origen, destino) => of({origen:{id:origen,periodo:'2026-09',generadoEn:'2026-09-30'},destino:{id:destino,periodo:mesBogota(),generadoEn:'2026-10-01'},conteos:{MODIFICADO:1},secciones:['resumen'],filas:{content:[{clave:'uno',seccion:'resumen',concepto:'Valor facturado',estado:'MODIFICADO',unidad:'COP',origen:70,destino:85,variacion:15,porcentaje:21.43,cambios:[]}],page:0,size:20,totalElements:1,totalPages:1}}));
    TestBed.configureTestingModule({imports:[HistoricosPageComponent,HistoricosCompararComponent,HistoricoDetalleComponent,NoopAnimationsModule],providers:[provideRouter([]),
      {provide:GpPeriodoService,useValue:{recargar:()=>{}}},{provide:PresupuestoContextService,useValue:ctx},{provide:HistoricosService,useValue:api}]});
  });
  afterEach(() => TestBed.resetTestingModule());
  it('intercambia origen y destino y envía filtros/paginación al backend', async () => {
    const fixture = TestBed.createComponent(HistoricosCompararComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.componentInstance; expect(page.origen).toBe('7'); expect(page.destino).toBe('actual');
    expect(fixture.nativeElement.textContent).toContain('Valor facturado');
    page.intercambiar(); await fixture.whenStable();
    expect(api.comparar.calls.mostRecent().args.slice(0,3)).toEqual([44,'actual','7']);
    page.seccion = 'movimientos'; page.estado = 'ELIMINADO'; page.busqueda = 'FACTURA'; page.cambiarPagina(1); await fixture.whenStable();
    expect(api.comparar.calls.mostRecent().args).toEqual([44,'actual','7','movimientos','ELIMINADO','FACTURA',1]); fixture.destroy();
  });
  it('rechaza referencias iguales y descarta resultados anteriores al cambiar empresa', async () => {
    const fixture = TestBed.createComponent(HistoricosCompararComponent); fixture.detectChanges(); await fixture.whenStable();
    const page = fixture.componentInstance; page.destino = page.origen; await page.comparar(); expect(page.error()).toContain('diferentes');
    const pendiente = new Subject<any>(); api.comparar.and.returnValue(pendiente); page.destino = 'actual'; void page.comparar();
    ctx.empresaId.set(null); fixture.detectChanges(); pendiente.next({filas:{content:['ajeno']}}); await Promise.resolve();
    expect(page.resultado()).toBeNull(); expect(page.periodos()).toEqual([]); fixture.destroy();
  });
  it('cada select incorpora el buscador reutilizable de la plataforma', async () => {
    const fixture = TestBed.createComponent(HistoricosCompararComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select'); select.click(); fixture.detectChanges();
    expect(document.querySelector('.cdk-overlay-container input')).not.toBeNull(); fixture.destroy();
  });
});

describe('API de históricos', () => {
  it('envía la empresa explícita y una única solicitud de consolidación', () => {
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    const api = TestBed.inject(HistoricosService), http = TestBed.inject(HttpTestingController);
    api.consolidar(44,'2026-09').subscribe(); const r = http.expectOne(req => req.url.endsWith('/historicos/consolidar'));
    expect(r.request.method).toBe('POST'); expect(r.request.params.get('empresaId')).toBe('44'); expect(r.request.body).toEqual({periodo:'2026-09'}); r.flush(foto().historico);
    api.consultar(44,7).subscribe(); const get = http.expectOne(req => req.url.endsWith('/historicos/7')); expect(get.request.method).toBe('GET'); get.flush(foto());
    http.verify(); TestBed.resetTestingModule();
  });
});
