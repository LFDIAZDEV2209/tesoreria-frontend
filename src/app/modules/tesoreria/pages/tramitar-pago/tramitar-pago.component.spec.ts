import { TestBed } from '@angular/core/testing';
import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TramitarPagoComponent } from './tramitar-pago.component';

describe('Tramitar pago: datos y estados persistidos', () => {
  function preparar() {
    const egresos = jasmine.createSpyObj('egresos', ['marcarPagado', 'checkDuplicado']);
    egresos.marcarPagado.and.returnValue(of({ estado: 'PAGADO' }));
    egresos.checkDuplicado.and.returnValue(of({ existe: false }));
    const proveedores = { buscarPorNit: () => of(null) };
    const component = TestBed.runInInjectionContext(() => new TramitarPagoComponent(
      {} as any, {} as any, {} as any, { markForCheck() {} } as any,
      {} as any, {} as any, {} as any, egresos, proveedores as any));
    return { component, egresos };
  }

  it('un trámite sin detalles no adquiere proveedores ficticios', () => {
    const { component } = preparar();
    (component as any).buildFromTramiteData({ detalles: [] }, 17);
    expect(component.detalles).toEqual([]);
    expect(component.totalProveedores).toBe(0);
    expect(component.comprobanteStatus.size).toBe(0);
  });

  it('un archivo adjunto no implica un porcentaje de coincidencia inventado', () => {
    const { component } = preparar();
    (component as any).buildFromTramiteData({ detalles: [{
      proveedorRelacionId: 23, archivosEgresoDetalle: [{ tipo: 'PAGO', nombre: 'soporte.pdf' }],
    }] }, 17);
    expect(component.comprobanteStatus.get(0)?.matchPorcentaje).toBeNull();
  });

  it('un estado conciliado no inventa lectura OCR ni coincidencias bancarias', () => {
    const { component } = preparar();
    (component as any).buildFromTramiteData({ estadoPago: 'Conciliado', detalles: [{
      proveedorRelacionId: 23, valorPagado: 90,
      archivosEgresoDetalle: [{ tipo: 'PAGO', nombre: 'soporte.pdf' }],
    }] }, 17);
    const estado = component.comprobanteStatus.get(0);
    expect(estado?.ocrData).toBeNull();
    expect(estado?.verificacionBancaria).toBeNull();
    expect(estado?.matchPorcentaje).toBeNull();
    expect(estado?.valorPagado).toBe(90);
    expect(component.procesoFinalizado).toBeTrue();
  });

  it('marcar pagado no declara conciliación ni altera el estado de la orden', fakeAsync(() => {
    const { component } = preparar();
    (component as any).buildFromTramiteData({ detalles: [] }, 17);
    (component as any).finalizarEgresoContador();
    expect(component.movimiento?.estadoPago).toBe('Pagado');
    expect(component.movimiento?.estadoEgreso).toBe('Pagado');
    expect(component.movimiento?.estadoOc).toBe('Pendiente');
    expect(component.procesoFinalizado).toBeTrue();
    tick(10000);
  }));

  it('reconoce un pago ya persistido para impedir repetirlo desde la pantalla', () => {
    const { component } = preparar();
    (component as any).buildFromEgresoContadorData({ id: 17, estado: 'PAGADO', valor: 100 }, 17);
    expect(component.movimiento?.estadoPago).toBe('Pagado');
    expect(component.procesoFinalizado).toBeTrue();
  });
  it('abre por URL el egreso correcto sin probar un viatico con el mismo ID', () => {
    const { component } = preparar();
    (component as any).route = {snapshot: {
      paramMap: {get: () => '194'}, queryParamMap: {get: () => 'egreso-contador'},
    }};
    const cargarEgreso = spyOn(component as any, 'cargarEgresoContador');
    const cargarViatico = spyOn(component as any, 'cargarViaticos');
    component.ngOnInit();
    expect(cargarEgreso).toHaveBeenCalledOnceWith(194);
    expect(cargarViatico).not.toHaveBeenCalled();
  });

  for (const respuesta of [of(null), throwError(() => ({ status: 403 })), throwError(() => ({ status: 404 }))]) {
    it('un viático explícito no abre otra entidad cuando falta o se deniega', () => {
      const { component } = preparar();
      (component as any).route = { snapshot: {
        paramMap: { get: () => '194' }, queryParamMap: { get: () => 'viaticos' },
      } };
      (component as any).tesoreriaService = { getSolicitudViaticosTesoreriaById: () => respuesta };
      const navigate = jasmine.createSpy('navigate');
      (component as any).router = { navigate };
      (component as any).snackBar = { open: jasmine.createSpy('open') };
      const cargarOtro = spyOn(component as any, 'cargarMovimiento');
      component.ngOnInit();
      expect(cargarOtro).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledOnceWith(['/tesoreria/bandeja']);
      expect(component.movimiento).toBeFalsy();
      expect(component.loading).toBeFalse();
    });
  }

  it('viático pagado conserva importe real y no declara conciliación ni OCR', () => {
    const { component } = preparar();
    (component as any).buildFromViaticosData({estado:'PAGADO', totalSolicitud:1500,
      montoDesembolsoAprobado:1500, valorComprobantePago:1500, comprobantePagoUrl:'soporte.pdf'},1);
    expect(component.estadoLabelHeader).toBe('Pagado');
    expect(component.totalPagado).toBe(1500);
    expect(component.movimiento?.estadoOc).toBe('Pendiente');
    expect(component.movimiento?.estadoEgreso).toBe('Pagado');
    expect(component.comprobanteStatus.get(0)?.ocrData).toBeNull();
    expect(component.procesoFinalizado).toBeTrue();
  });

  it('aprobar un viático no equivale a pagar ni conciliar', () => {
    const { component } = preparar();
    (component as any).buildFromViaticosData({estado:'APROBADA', totalSolicitud:1500},1);
    expect(component.movimiento?.estadoPago).toBe('Pendiente');
    expect(component.procesoFinalizado).toBeFalse();
    expect(component.totalPagado).toBe(0);
  });

});
