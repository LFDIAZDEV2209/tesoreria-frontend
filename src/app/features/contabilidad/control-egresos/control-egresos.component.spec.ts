import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { of, Subject } from 'rxjs';
import { ControlEgresosComponent } from './control-egresos.component';
describe('Control de egresos: pagos de la empresa', () => {
  function preparar() {
    const ctx = { empresaId: signal<number | null>(1) };
    const api = jasmine.createSpyObj('PresupuestoService', ['pagos']);
    const egresos = jasmine.createSpyObj('ControlEgresosService',
      ['desdePago', 'registrar', 'enviarARevision', 'aprobarRevision', 'rechazarRevision']);
    const componente = TestBed.runInInjectionContext(() => new ControlEgresosComponent(
      { snapshot: { queryParamMap: { get: () => null } } } as any, new FormBuilder(), egresos, {} as any, {} as any, ctx as any, api, {} as any));
    return {ctx, api, egresos, componente};
  }
  it('registra nómina aprobada sin crear proveedor ni exigir NIT individual', () => {
    const {egresos, componente} = preparar();
    egresos.desdePago.and.returnValue(of({id: 121}));
    spyOn(componente, 'loadEgresos');
    const pago = {id: 221, moduloOrigen: 'nomina', montoProyectado: 2500, aprobado: true} as any;
    componente.pagoProyectadoSeleccionado.set(pago);
    expect(componente.form.invalid).toBeTrue();
    componente.guardar();
    expect(egresos.desdePago).toHaveBeenCalledOnceWith(221, null);
    expect(egresos.registrar).not.toHaveBeenCalled();
    expect(componente.viewMode()).toBe('list');
    componente.ngOnDestroy();
  });
  it('identifica nómina por su empresa y concepto sin presentarlos como proveedor', () => {
    const {componente} = preparar();
    expect(componente.nombreEgreso({tipoOperacion: 'NOMINA', empresaNombre: 'Empresa A', conceptoPresupuestal: 'Nómina administrativa'} as any))
      .toBe('Nómina administrativa — Empresa A');
    componente.ngOnDestroy();
  });
  it('incluye pagos posteriores a los primeros cien', () => {
    const {api, componente} = preparar();
    api.pagos.and.callFake((empresa: number, filtro: {page: number}) => of({
      page: filtro.page, totalPages: 2,
      content: filtro.page === 0 ? Array.from({length:100}, (_,i)=>({id:i+1})) : [{id:101}],
    }));
    componente.cargarPagosProyectados();
    expect(componente.pagosProyectados().length).toBe(101);
    expect(componente.pagosProyectados()[100].id).toBe(101);
    expect(componente.isLoadingPagos()).toBeFalse();
    componente.ngOnDestroy();
  });
  it('descarta la respuesta pendiente de A después de seleccionar B', () => {
    const {ctx, api, componente} = preparar();
    const respuestaA = new Subject<any>();
    api.pagos.and.callFake((empresa: number) => empresa === 1 ? respuestaA : of({page:0,totalPages:1,content:[{id:22}]}));
    componente.cargarPagosProyectados();
    ctx.empresaId.set(2);
    componente.cargarPagosProyectados();
    respuestaA.next({page:0,totalPages:1,content:[{id:11}]}); respuestaA.complete();
    expect(componente.pagosProyectados().map(p=>p.id)).toEqual([22]);
    componente.ngOnDestroy();
  });
  it('borra candidatos al perder la selección de empresa', () => {
    const {ctx, api, componente} = preparar();
    api.pagos.and.returnValue(of({page:0,totalPages:1,content:[{id:11}]}));
    componente.cargarPagosProyectados(); ctx.empresaId.set(null); componente.cargarPagosProyectados();
    expect(componente.pagosProyectados()).toEqual([]);
    expect(componente.isLoadingPagos()).toBeFalse();
    componente.ngOnDestroy();
  });

  it('el contador envía a revisión de Gerencia Financiera (no directo a Tesorería)', () => {
    const {egresos, componente} = preparar();
    egresos.enviarARevision.and.returnValue(of({id: 76}));
    spyOn(componente, 'loadEgresos');
    componente.enviarARevision({id: 76, numeroFactura: 'GP-76'} as any);
    expect(egresos.enviarARevision).toHaveBeenCalledOnceWith(76);
    expect(componente.enviandoId()).toBeNull();
    componente.ngOnDestroy();
  });

  it('Gerencia Financiera aprueba (pasa a Tesorería) y rechaza con observación', () => {
    const {egresos, componente} = preparar();
    egresos.aprobarRevision.and.returnValue(of({id: 77}));
    egresos.rechazarRevision.and.returnValue(of({id: 78}));
    spyOn(componente, 'loadEgresos');
    componente.aprobarRevision({id: 77, numeroFactura: 'GP-77'} as any);
    expect(egresos.aprobarRevision).toHaveBeenCalledOnceWith(77);
    componente.abrirRechazoRevision({id: 78, numeroFactura: 'GP-78'} as any);
    componente.motivoRechazo.set('Falta el soporte de la factura');
    componente.confirmarRechazoRevision();
    expect(egresos.rechazarRevision).toHaveBeenCalledOnceWith(78, 'Falta el soporte de la factura');
    expect(componente.rechazandoRevision()).toBeNull();
    // Sin observación no se envía el rechazo.
    egresos.rechazarRevision.calls.reset();
    componente.abrirRechazoRevision({id: 79, numeroFactura: 'GP-79'} as any);
    componente.confirmarRechazoRevision();
    expect(egresos.rechazarRevision).not.toHaveBeenCalled();
    componente.ngOnDestroy();
  });
});
