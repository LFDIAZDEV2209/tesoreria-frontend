import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { GpNotificacionesComponent } from './gp-notificaciones.component';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { Notificacion } from '../../models/presupuesto.model';

describe('Notificaciones GP', () => {
  let api: jasmine.SpyObj<PresupuestoService>;
  let ctx: PresupuestoContextService;
  const aviso: Notificacion = {id: 1, tipo: 'pago_aprobado', mensaje: 'Pago autorizado empresa A',
    leida: false, creadoPor: 'gerencia', createdAt: null};
  beforeEach(() => {
    api = jasmine.createSpyObj('PresupuestoService', ['notificaciones', 'marcarNotificacionLeida', 'marcarTodasNotificacionesLeidas']);
    api.notificaciones.and.returnValue(of([aviso]));
    api.marcarTodasNotificacionesLeidas.and.returnValue(of(undefined));
    ctx = new PresupuestoContextService(api);
    ctx.empresaId.set(1);
    ctx.permisos.set({gerencia: false, superAdmin: false, puedeAprobar: false, permisos: ['admin.notificaciones']});
    TestBed.configureTestingModule({imports: [GpNotificacionesComponent], providers: [
      {provide: PresupuestoService, useValue: api}, {provide: PresupuestoContextService, useValue: ctx}]});
  });
  it('muestra avisos reales y conecta leer todas con empresa activa', fakeAsync(() => {
    const fixture = TestBed.createComponent(GpNotificacionesComponent);
    fixture.detectChanges(); tick(0);
    fixture.componentInstance.abierto.set(true); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(aviso.mensaje);
    fixture.componentInstance.leerTodas();
    expect(api.marcarTodasNotificacionesLeidas).toHaveBeenCalledWith(1);
    fixture.destroy();
  }));
  it('descarta respuesta antigua al cambiar empresa', fakeAsync(() => {
    const antigua = new Subject<Notificacion[]>();
    api.notificaciones.and.callFake(id => id === 1 ? antigua : of([]));
    const fixture = TestBed.createComponent(GpNotificacionesComponent);
    fixture.detectChanges(); tick(0);
    ctx.empresaId.set(2); fixture.detectChanges(); tick(0);
    antigua.next([aviso]);
    expect(fixture.componentInstance.avisos()).toEqual([]);
    expect(api.notificaciones).toHaveBeenCalledWith(2);
    fixture.destroy();
  }));
});
