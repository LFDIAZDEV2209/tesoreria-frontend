import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuditoriaComponent } from './auditoria.component';
import { PresupuestoAuditoriaService, RegistroAuditoria } from '../../services/presupuesto-auditoria.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

describe('Historial: contrato real de auditoría', () => {
  const registro: RegistroAuditoria = {
    id: 1, empresaId: 91, usuarioId: 2, usuarioNombre: 'Gpqa.Contador',
    accion: 'PAGO_ACTUALIZADO', entidad: 'PAGO', createdAt: '2026-10-15T10:00:00',
    detalle: 'periodo=2026-10; periodoAnterior=2025-02; monto=234.56',
  };
  let api: {listar: jasmine.Spy};
  beforeEach(() => {
    api = {listar: jasmine.createSpy().and.returnValue(of([registro]))};
    TestBed.configureTestingModule({imports: [AuditoriaComponent], providers: [
      {provide: PresupuestoAuditoriaService, useValue: api},
      {provide: PresupuestoContextService, useValue: {empresaId: signal(91), empresas: () => [{}]}},
    ]}).overrideComponent(AuditoriaComponent, {set: {template: ''}});
  });
  afterEach(() => TestBed.resetTestingModule());
  it('filtra localmente usuarioNombre y cualquiera de los periodos incluidos en detalle', () => {
    const fixture = TestBed.createComponent(AuditoriaComponent); fixture.detectChanges();
    const pagina = fixture.componentInstance;
    pagina.periodo.set('2025-02'); pagina.usuario.set(' contador '); pagina.cargar();
    expect(api.listar).toHaveBeenCalledWith(91, {periodo:'2025-02', usuario:'contador'});
    expect(pagina.visibles()).toEqual([registro]);
    expect(pagina.periodosRegistro(registro)).toEqual(['2025-02', '2026-10']);
    expect(pagina.detalle(registro.detalle)).toContain('\nperiodoAnterior=2025-02');
    pagina.periodo.set('2026-09'); pagina.cargar(); expect(pagina.visibles()).toEqual([]);
    pagina.limpiar(); expect(pagina.visibles()).toEqual([registro]);
    expect(api.listar).toHaveBeenCalledWith(91, {periodo:'', usuario:''});
  });
  it('no inventa un periodo con createdAt y admite detalle nulo', () => {
    const pagina = TestBed.createComponent(AuditoriaComponent).componentInstance;
    expect(pagina.periodosRegistro({...registro, detalle: null})).toEqual([]);
    expect(pagina.detalle(null)).toBe('Sin detalle adicional');
  });
  it('explica el permiso de auditoría ante un 403 y permite reintentar', () => {
    api.listar.and.returnValue(throwError(() => ({status: 403})));
    const fixture = TestBed.createComponent(AuditoriaComponent); fixture.detectChanges();
    const pagina = fixture.componentInstance;
    pagina.periodo.set('2025-02'); pagina.usuario.set('contador'); pagina.cargar();
    expect(pagina.error()).toContain('permiso de auditoría');
    expect(pagina.loading()).toBeFalse(); expect(pagina.registros()).toEqual([]);
    api.listar.and.returnValue(of([registro])); pagina.cargar();
    expect(pagina.error()).toBe(''); expect(pagina.visibles()).toEqual([registro]);
    expect(api.listar).toHaveBeenCalledWith(91, {periodo:'2025-02',usuario:'contador'});
    pagina.usuario.set('gerencia'); pagina.cargar();
    expect(pagina.visibles()).toEqual([]);
    expect(pagina.registros()).toEqual([registro]);
  });
});
