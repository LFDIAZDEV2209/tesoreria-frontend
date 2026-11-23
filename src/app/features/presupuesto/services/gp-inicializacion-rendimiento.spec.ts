import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DefaultUrlSerializer, NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { GpSessionService } from './gp-session.service';
import { PresupuestoService } from './presupuesto.service';
import { PresupuestoContextService } from './presupuesto-context.service';
import { GpPeriodoService } from './gp-periodo.service';

const estado = { autenticado: true, usuario_id: 7, nombre: 'Prueba sintética', rol: 'contador', permisos: ['presupuesto.ver'], multiples_empresas: false };

describe('Peticiones reales HttpClient de inicialización GP', () => {
  let http: HttpTestingController;
  let api: PresupuestoService;
  let session: GpSessionService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { cambiosSesion$: new BehaviorSubject(null) } }] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PresupuestoService);
    session = TestBed.inject(GpSessionService);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('verificación y dos lectores comparten 1 GET estado pendiente', () => {
    session.verificar();
    api.permisosGp().subscribe();
    api.permisosGp().subscribe();
    const peticiones = http.match(r => r.url.endsWith('/auth/estado'));
    expect(peticiones.length).toBe(1);
    peticiones.forEach(r => r.flush(estado));
  });

  it('dos cargas y dos lectores producen 1 contadores y 1 estado en vuelo', () => {
    const ctx = new PresupuestoContextService(api);
    ctx.cargar(); ctx.cargar(); ctx.cargarPermisos(); ctx.cargarPermisos();
    const empresas = http.match(r => r.url.endsWith('/auth/contadores'));
    const permisos = http.match(r => r.url.endsWith('/auth/estado'));
    expect(empresas.length).toBe(1);
    expect(permisos.length).toBe(1);
    empresas.forEach(r => r.flush([])); permisos.forEach(r => r.flush(estado));
  });

  it('la siguiente consulta vuelve al servidor y aplica una revocación', () => {
    let permisos: any;
    api.permisosGp().subscribe(p => permisos = p);
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush(estado);
    expect(permisos.permisos).toContain('presupuesto.ver');
    api.permisosGp().subscribe(p => permisos = p);
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush({ ...estado, permisos: [] });
    expect(permisos.permisos).toEqual([]);
  });

  it('una respuesta idéntica conserva la referencia del estado de sesión', () => {
    session.verificar(); http.expectOne(r => r.url.endsWith('/auth/estado')).flush(estado);
    const anterior = session.estado();
    api.permisosGp().subscribe();
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush(estado);
    expect(session.estado()).toBe(anterior);
    expect(session.verificando()).toBeFalse();
  });

  it('cambiar identidad cancela la verificación pendiente y permite consultar otra', () => {
    session.verificar();
    const antigua = http.expectOne(r => r.url.endsWith('/auth/estado'));
    (TestBed.inject(AuthService).cambiosSesion$ as BehaviorSubject<any>).next({ id: 8 });
    expect(antigua.cancelled).toBeTrue(); expect(session.estado()).toBeNull();
    session.verificar();
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush({ ...estado, usuario_id: 8 });
    expect(session.estado()?.usuario_id).toBe(8);
  });

  it('la invalidación explícita cancela el estado iniciado antes de una modificación', () => {
    api.permisosGp().subscribe();
    const anterior = http.expectOne(r => r.url.endsWith('/auth/estado'));
    api.permisosGp(true).subscribe();
    expect(anterior.cancelled).toBeTrue();
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush({ ...estado, permisos: [] });
    expect(session.estado()?.permisos).toEqual([]);
  });

  it('una actualización forzada durante el arranque no deja bloqueada la carga de empresas', () => {
    const ctx = new PresupuestoContextService(api, null, null, session);
    ctx.cargar();
    const anterior = http.expectOne(r => r.url.endsWith('/auth/estado'));
    ctx.cargarPermisos(true); expect(anterior.cancelled).toBeTrue();
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush(estado);
    http.expectOne(r => r.url.endsWith('/auth/contadores')).flush([]);
    expect(ctx.cargando()).toBeFalse(); ctx.ngOnDestroy();
  });

  it('un error compartido permite reintentar y no conserva permisos previos', () => {
    let errores = 0;
    api.permisosGp().subscribe({ error: () => errores++ });
    api.permisosGp().subscribe({ error: () => errores++ });
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush({}, { status: 503, statusText: 'Prueba sintética' });
    expect(errores).toBe(2); expect(session.estado()?.autenticado).toBeFalse();
    api.permisosGp().subscribe();
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush(estado);
    expect(session.estado()?.autenticado).toBeTrue();
  });

  it('espera la respuesta de sesión y carga 1 empresa y 1 selección, sin temporizador', () => {
    TestBed.resetTestingModule();
    const events = new Subject<any>();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { cambiosSesion$: new BehaviorSubject(null) } },
      { provide: Router, useValue: { events, parseUrl: (url: string) => new DefaultUrlSerializer().parse(url) } }] });
    http = TestBed.inject(HttpTestingController); api = TestBed.inject(PresupuestoService); session = TestBed.inject(GpSessionService);
    const ctx = TestBed.inject(PresupuestoContextService);
    TestBed.inject(GpPeriodoService); TestBed.flushEffects();
    http.expectNone(r => r.url.endsWith('/periodos/seleccion'));
    session.verificar(); ctx.cargar(); ctx.cargarPermisos();
    http.expectNone(r => r.url.endsWith('/auth/contadores'));
    http.expectOne(r => r.url.endsWith('/auth/estado')).flush(estado);
    TestBed.flushEffects();
    http.expectNone(r => r.url.endsWith('/periodos/seleccion'));
    http.expectOne(r => r.url.endsWith('/auth/contadores')).flush([{ id: 35, nombre: 'Empresa sintética' }]);
    TestBed.flushEffects();
    events.next(new NavigationEnd(1, '/presupuesto/presupuesto', '/presupuesto/presupuesto'));
    const seleccion = http.expectOne(r => r.url.endsWith('/periodos/seleccion'));
    expect(seleccion.request.params.get('empresaId')).toBe('35');
    seleccion.flush({ anios: [], historicos: {}, estadosMes: [] });
    http.expectNone(r => r.url.endsWith('/auth/estado'));
    expect(ctx.sesionValidada()).toBeTrue(); expect(ctx.cargando()).toBeFalse();
    ctx.ngOnDestroy();
  });
});

describe('Selección de períodos por efecto y navegación', () => {
  it('efecto y navegación comparten 1 GET seleccion pendiente de la misma empresa', () => {
    const events = new Subject<any>();
    const ctx = new PresupuestoContextService({} as any); ctx.empresaId.set(35);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: PresupuestoContextService, useValue: ctx }, { provide: Router, useValue: { events } }] });
    TestBed.inject(GpPeriodoService); TestBed.flushEffects();
    events.next(new NavigationEnd(1, '/presupuesto/presupuesto', '/presupuesto/presupuesto'));
    const http = TestBed.inject(HttpTestingController);
    const peticiones = http.match(r => r.url.endsWith('/periodos/seleccion'));
    expect(peticiones.length).toBe(1);
    peticiones.forEach(r => r.flush({ anios: [], historicos: {}, estadosMes: [] }));
    http.verify(); TestBed.resetTestingModule();
  });
});
