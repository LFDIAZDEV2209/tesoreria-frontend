import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { ConciliacionDetalleComponent } from './conciliacion-detalle.component';

describe('Conciliación: identidad explícita del movimiento', () => {
  for (const id of ['', 'abc', '0', '-1', '1.5', '9007199254740992']) {
    it(`rechaza el ID ${id || 'vacío'} sin consultar un movimiento alternativo`, () => {
      const api = jasmine.createSpyObj('api', ['getDetalleConciliacion']);
      const router = { navigate: jasmine.createSpy('navigate') };
      const c = new ConciliacionDetalleComponent({snapshot: {paramMap: {get: () => id}}} as any,
        router as any, new FormBuilder(), api, {} as any, {markForCheck() {}} as any);
      c.ngOnInit();
      expect(api.getDetalleConciliacion).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledOnceWith(['/tesoreria/bandeja']);
    });
  }
  it('consulta exclusivamente el ID válido solicitado', () => {
    const api = jasmine.createSpyObj('api', ['getDetalleConciliacion']);
    api.getDetalleConciliacion.and.returnValue(of(null));
    const c = new ConciliacionDetalleComponent({snapshot: {paramMap: {get: () => '56'}}} as any,
      {} as any, new FormBuilder(), api, {} as any, {markForCheck() {}} as any);
    c.ngOnInit();
    expect(api.getDetalleConciliacion).toHaveBeenCalledOnceWith(56);
  });
});
