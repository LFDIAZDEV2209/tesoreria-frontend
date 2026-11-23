import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DefaultUrlSerializer, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { GpPeriodoService } from '../../services/gp-periodo.service';
import { GpSessionService } from '../../services/gp-session.service';
import { GpShellComponent } from './gp-shell.component';

const estado = {
  autenticado: true, usuario_id: 7, nombre: 'Usuario sintético', rol: 'contador',
  rol_nexa: 'contador', permisos: ['presupuesto.ver'], multiples_empresas: false,
};

describe('Verificación al entrar al Gestor Presupuestal', () => {
  let http: HttpTestingController;
  const montar = () => TestBed.runInInjectionContext(() => new GpShellComponent());
  const estadoPendiente = () => http.expectOne(r => r.url.endsWith('/auth/estado'));
  const empresasPendientes = () => http.expectOne(r => r.url.endsWith('/auth/contadores'));

  beforeEach(() => {
    localStorage.removeItem('gp_nexa_empresa_id');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { cambiosSesion$: new BehaviorSubject(null) } },
      { provide: GpPeriodoService, useValue: {} },
      { provide: Router, useValue: {
        events: new Subject(), url: '/presupuesto/presupuesto',
        parseUrl: (url: string) => new DefaultUrlSerializer().parse(url),
      } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); localStorage.removeItem('gp_nexa_empresa_id'); });

  it('el primer montaje espera un único estado y carga una sola lista de empresas', () => {
    montar();
    http.expectNone(r => r.url.endsWith('/auth/contadores'));
    estadoPendiente().flush(estado);
    empresasPendientes().flush([{ id: 35, nombre: 'Empresa sintética' }]);
    http.expectNone(r => r.url.endsWith('/auth/estado'));
    expect(TestBed.inject(PresupuestoContextService).empresaId()).toBe(35);
  });

  it('volver a montar consulta permisos y asignaciones frescas sin conservar los anteriores', () => {
    montar(); estadoPendiente().flush(estado);
    empresasPendientes().flush([{ id: 35, nombre: 'Empresa sintética' }]);
    const ctx = TestBed.inject(PresupuestoContextService);
    expect(ctx.permisos()?.permisos).toContain('presupuesto.ver');

    montar();
    const nuevaSesion = estadoPendiente();
    const nuevasEmpresas = empresasPendientes();
    nuevaSesion.flush({ ...estado, permisos: [] });
    nuevasEmpresas.flush([]);
    expect(ctx.permisos()?.permisos).toEqual([]);
    expect(ctx.empresas()).toEqual([]);
    expect(ctx.empresaId()).toBeNull();
    http.expectNone(r => r.url.endsWith('/auth/estado'));
  });

  it('comparte una verificación pendiente al montar de nuevo', () => {
    montar(); estadoPendiente().flush(estado); empresasPendientes().flush([]);
    TestBed.inject(GpSessionService).verificar();
    const pendiente = estadoPendiente();
    montar();
    http.expectNone(r => r.url.endsWith('/auth/estado'));
    pendiente.flush(estado); empresasPendientes().flush([]);
    expect(TestBed.inject(GpSessionService).estado()?.autenticado).toBeTrue();
  });

  it('la revocación de sesión al volver cancela la lista pendiente y borra el contexto', () => {
    montar(); estadoPendiente().flush(estado);
    empresasPendientes().flush([{ id: 35, nombre: 'Empresa sintética' }]);
    montar();
    const nuevaSesion = estadoPendiente();
    const nuevasEmpresas = empresasPendientes();
    nuevaSesion.flush({ ...estado, autenticado: false, permisos: [] });
    const ctx = TestBed.inject(PresupuestoContextService);
    expect(nuevasEmpresas.cancelled).toBeTrue();
    expect(ctx.sesionValidada()).toBeFalse();
    expect(ctx.permisos()).toBeNull();
    expect(ctx.empresas()).toEqual([]);
    expect(ctx.empresaId()).toBeNull();
  });
});
