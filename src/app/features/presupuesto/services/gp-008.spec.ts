import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClient, provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { GpAuthInterceptor } from '../../../core/interceptors/gp-auth.interceptor';
import { PresupuestoService } from './presupuesto.service';
import { PresupuestoContextService } from './presupuesto-context.service';
import { PresupuestoAuditoriaService } from './presupuesto-auditoria.service';
import { ModuloPageComponent } from '../pages/modulo-page/modulo-page.component';
import { GpModuloAnualComponent } from '../components/gp-modulo-anual/gp-modulo-anual.component';
import { PresupuestoToastService } from './presupuesto-toast.service';
import { of, Subject } from 'rxjs';

describe('GP-008 contratos HTTP', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({providers: [
      provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      {provide: HTTP_INTERCEPTORS, useClass: GpAuthInterceptor, multi: true},
      {provide: PresupuestoContextService, useValue: {empresaId: () => 35, mesConsulta: () => '2025-01'}},
    ]});
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
  it('conserva empresaId y no filtra por el mes de consulta en los seis endpoints anuales', () => {
    const api = new PresupuestoService(TestBed.inject(HttpClient), {} as any, {} as any);
    for (const [modulo, ruta] of [['proveedores','proveedores'], ['anticipos','anticipos'], ['cx_pagar','cuentas-pagar'], ['cx_cobrar','cuentas-cobrar'], ['impuestos','impuestos'], ['provisiones','pagos-proyectados/provisiones']]) {
      (modulo === 'provisiones' ? api.provisionesAnual(35,2026) : api.moduloAnual(modulo,35,2026)).subscribe();
      const req = http.expectOne(r => r.url === `/api/gp/${ruta}/anual`);
      expect(req.request.params.get('empresaId')).toBe('35');
      expect(req.request.params.get('anio')).toBe('2026');
      expect(req.request.params.has('vistaMes')).toBeFalse();
      expect(req.request.params.has('periodoConsulta')).toBeFalse();
      req.flush({});
    }
  });
  it('consulta auditoría sin filtros vacíos ni paginación inexistente', () => {
    TestBed.inject(PresupuestoAuditoriaService).listar(35).subscribe();
    const req = http.expectOne(r => r.url === '/api/presupuesto/auditoria');
    expect(req.request.params.get('empresaId')).toBe('35');
    expect(req.request.params.keys()).toEqual(['empresaId']); req.flush([]);
  });
  it('envía periodo y usuario no vacíos para versiones del backend que admitan filtros', () => {
    const api=TestBed.inject(PresupuestoAuditoriaService);
    api.listar(91,{periodo:'2025-02',usuario:' gpqa.contador '}).subscribe();
    const req=http.expectOne(r=>r.url==='/api/presupuesto/auditoria');
    expect(req.request.params.get('empresaId')).toBe('91');
    expect(req.request.params.get('periodo')).toBe('2025-02');
    expect(req.request.params.get('usuario')).toBe('gpqa.contador');
    expect(req.request.params.keys().sort()).toEqual(['empresaId','periodo','usuario']);
    req.flush([]);
    api.listar(91,{periodo:'',usuario:'  '}).subscribe();
    const vacio=http.expectOne(r=>r.url==='/api/presupuesto/auditoria');
    expect(vacio.request.params.keys()).toEqual(['empresaId']); vacio.flush([]);
  });
  it('omite anio al consultar todos los años de módulos y provisiones', () => {
    const api = new PresupuestoService(TestBed.inject(HttpClient), {} as any, {} as any);
    api.moduloAnual('proveedores',35).subscribe();
    api.provisionesAnual(35,null).subscribe();
    for (const url of ['/api/gp/proveedores/anual','/api/gp/pagos-proyectados/provisiones/anual']) {
      const req=http.expectOne(r=>r.url===url);
      expect(req.request.params.has('anio')).toBeFalse();
      req.flush({empresaId:35,anio:null,anios:[],meses:[],filas:[],totalesMes:{},totalGeneral:{debito:0,credito:0,saldo:0}});
    }
  });
  it('alternar mensual/anual/mensual conserva el periodo y retira parámetros mensuales del anual', () => {
    const client=TestBed.inject(HttpClient);
    for (const anual of [false,true,false]) {
      const url='/api/gp/proveedores/'+(anual?'anual':'');
      client.get(url,{params:{empresaId:35,vistaMes:true,periodoConsulta:'2026-09'}}).subscribe();
      const req=http.expectOne(r=>r.url===url);
      expect(req.request.params.get(anual?'empresaId':'como')).toBe('35');
      expect(req.request.params.get('vistaMes')).toBe(anual?null:'true');
      expect(req.request.params.get('periodoConsulta')).toBe(anual?null:'2025-01');
      req.flush({});
    }
  });
  it('PUT usa snake_case y empresa explícita; DELETE consume ok sin depender del contexto', () => {
    const api = new PresupuestoService(TestBed.inject(HttpClient), {} as any, {} as any);
    api.actualizarPago(92,123,{montoProyectado:12.34,fechaProyectada:'2025-01-10',categoria:'OTROS'}).subscribe(p=>{
      expect(p.estado).toBe('proyectado'); expect(p.aprobado).toBeFalse(); expect(p.montoProyectado).toBe(12.34);
    });
    const put=http.expectOne(r=>r.method==='PUT');
    expect(put.request.url).toBe('/api/gp/pagos-proyectados/123');
    expect(put.request.params.get('como')).toBe('92');
    expect(put.request.body.monto_proyectado).toBe(12.34);
    expect(put.request.body.fecha_proyectada).toBe('2025-01-10');
    expect(put.request.body.montoProyectado).toBeUndefined();
    put.flush({id:123,estado:'proyectado',aprobado:false,modulo_origen:'manual',monto_proyectado:12.34});
    api.eliminarPago(92,123).subscribe(r=>expect(r).toBeUndefined());
    const del=http.expectOne(r=>r.method==='DELETE');
    expect(del.request.params.get('como')).toBe('92'); del.flush({ok:true});
  });
});

describe('GP-008 PDF de legalización', () => {
  let pagina: ModuloPageComponent;
  beforeEach(() => {
    pagina = Object.create(ModuloPageComponent.prototype);
    Object.assign(pagina, {seleccionArchivo:0, archivoLegalizar:signal(null), errorArchivoLegalizar:signal(''), validandoArchivoLegalizar:signal(false)});
  });
  async function elegir(file: File) { await pagina.onArchivoLegalizar({target:{files:[file], value:'archivo'}} as any); }
  it('acepta PDF real y rechaza imágenes o archivos renombrados', async () => {
    await elegir(new File(['%PDF-1.7\n'], 'soporte.pdf', {type:'application/pdf'}));
    expect(pagina.archivoLegalizar()?.name).toBe('soporte.pdf');
    await elegir(new File(['imagen'], 'imagen.png', {type:'image/png'}));
    expect(pagina.archivoLegalizar()).toBeNull();
    await elegir(new File(['texto'], 'falso.pdf', {type:'application/pdf'}));
    expect(pagina.archivoLegalizar()).toBeNull();
    expect(pagina.errorArchivoLegalizar()).toContain('PDF válido');
  });
  it('rechaza archivos vacíos o mayores de 10 MB', async () => {
    await elegir(new File([], 'vacio.pdf')); expect(pagina.archivoLegalizar()).toBeNull();
    await elegir(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.pdf'));
    expect(pagina.archivoLegalizar()).toBeNull(); expect(pagina.errorArchivoLegalizar()).toContain('10 MB');
  });
});

describe('GP-008 tabla anual', () => {
  let api: any;
  let empresa: ReturnType<typeof signal<number | null>>;
  beforeEach(() => {
    empresa = signal<number | null>(35);
    api = {moduloAnual:jasmine.createSpy().and.returnValue(of({empresaId:35, anio:null, meses:[], filas:[], totalesMes:{}, totalGeneral:{debito:0,credito:0,saldo:0}}))};
    TestBed.configureTestingModule({imports:[GpModuloAnualComponent, NoopAnimationsModule], providers:[
      {provide:PresupuestoService,useValue:api}, {provide:PresupuestoToastService,useValue:{}},
      {provide:PresupuestoContextService,useValue:{empresaId:empresa,nombreEmpresa:()=>'Empresa de prueba'}},
    ]});
  });
  afterEach(() => TestBed.resetTestingModule());
  it('muestra carga, error con reintento y vacío sin romper la página', () => {
    const respuesta = new Subject<any>(); api.moduloAnual.and.returnValue(respuesta);
    const fixture = TestBed.createComponent(GpModuloAnualComponent); fixture.componentRef.setInput('modulo','proveedores'); fixture.detectChanges(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-gp-skeleton')).not.toBeNull();
    respuesta.error({status:404}); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('todavía no está disponible');
    api.moduloAnual.and.returnValue(of({empresaId:35,meses:[],filas:[],totalesMes:{},totalGeneral:{}}));
    fixture.componentInstance.cargar(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin movimientos');
  });
  it('muestra meses, tercero y totales; mantiene los años al filtrar', () => {
    const monto = {debito:10,credito:2,saldo:8};
    api.moduloAnual.and.returnValue(of({empresaId:35,anio:null,anios:[2025,2026],meses:['2026-01','2025-12'],filas:[{nombre:'Tercero prueba',nit:'900',valores:{'2026-01':monto},totalAnio:monto}],totalesMes:{'2026-01':monto},totalGeneral:monto}));
    const fixture=TestBed.createComponent(GpModuloAnualComponent); fixture.componentRef.setInput('modulo','proveedores'); fixture.detectChanges(); fixture.detectChanges();
    expect(fixture.componentInstance.meses()).toEqual(['2025-12','2026-01']);
    expect(fixture.nativeElement.querySelectorAll('thead th').length).toBe(4);
    expect(fixture.nativeElement.querySelector('tfoot').textContent).toContain('Total por mes');
    expect(fixture.nativeElement.textContent).toContain('Tercero prueba');
    // Con año explícito el backend omite anios; el selector debe conservar el catálogo inicial.
    api.moduloAnual.and.returnValue(of({empresaId:35,anio:2025,meses:[],filas:[],totalesMes:{},totalGeneral:{debito:0,credito:0,saldo:0}}));
    fixture.componentInstance.seleccionarAnio(2025);
    expect(api.moduloAnual).toHaveBeenCalledWith('proveedores',35,2025);
    expect(fixture.componentInstance.anios()).toEqual([2026,2025]);
    fixture.componentInstance.seleccionarAnio(null);
    expect(api.moduloAnual).toHaveBeenCalledWith('proveedores',35,null);
  });
});
