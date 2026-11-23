import { PagosProyectadosPageComponent } from './pagos-proyectados-page.component';
import { PagoProyectado } from '../../models/presupuesto.model';

describe('GP-008: edición de provisiones anteriores', () => {
  let pagina: PagosProyectadosPageComponent;
  let permisos: string[];
  let superAdmin: boolean;
  const pendiente = { id: 1, moduloOrigen: 'manual', estado: 'proyectado', aprobado: false, fechaProyectada: '2025-01-10' } as PagoProyectado;
  beforeEach(() => {
    permisos = ['pagos.operar', 'pagos.eliminar']; superAdmin = false;
    pagina = Object.create(PagosProyectadosPageComponent.prototype);
    pagina.ctx = {
      permisos: () => ({ permisos, superAdmin }),
      rolGp: () => superAdmin ? 'superadmin' : 'contador',
      tienePermiso: (p: string) => permisos.includes(p),
      puedeCorregirMes: () => false, puedeEditarMes: () => false,
    } as any;
  });
  it('permite editar y eliminar una provisión anterior sin aprobar', () => {
    expect(pagina.puedeModificar(pendiente)).toBeTrue();
    expect(pagina.puedeModificar(pendiente, true)).toBeTrue();
    expect(pagina.puedeModificar({...pendiente, moduloOrigen: 'importado'})).toBeTrue();
  });
  it('no extiende la excepción a movimientos de otros módulos', () => {
    expect(pagina.puedeModificar({...pendiente, moduloOrigen: 'proveedores'})).toBeFalse();
  });
  it('bloquea aprobados, pagados y cancelados también para superadmin', () => {
    superAdmin = true;
    for (const pago of [{...pendiente, aprobado:true}, {...pendiente, estado:'pagado'}, {...pendiente, estado:'cancelado'}]) {
      expect(pagina.puedeModificar(pago as PagoProyectado)).toBeFalse();
      expect(pagina.puedeModificar(pago as PagoProyectado, true)).toBeFalse();
    }
  });
  it('respeta revocación de permisos y consulta histórica', () => {
    permisos = []; expect(pagina.puedeModificar(pendiente)).toBeFalse();
    expect(pagina.puedeModificar(pendiente, true)).toBeFalse();
    permisos = ['pagos.operar']; expect(pagina.puedeModificar(pendiente, true)).toBeTrue();
    pagina.modoHistorico = true; expect(pagina.puedeModificar(pendiente)).toBeFalse();
    expect(pagina.puedeModificar(pendiente, true)).toBeFalse();
  });
  it('contador elimina manuales e importados anteriores con permiso de operar solamente', () => {
    permisos = ['pagos.operar'];
    for (const moduloOrigen of ['manual', 'importado']) {
      expect(pagina.puedeModificar({...pendiente, moduloOrigen}, true)).toBeTrue();
      for (const cambio of [{aprobado:true}, {estado:'pagado'}, {estado:'cancelado'}]) {
        expect(pagina.puedeModificar({...pendiente, moduloOrigen, ...cambio} as PagoProyectado, true)).toBeFalse();
      }
    }
    expect(pagina.puedeModificar({...pendiente, moduloOrigen:'proveedores'}, true)).toBeFalse();
  });
  it('la edición y eliminación de provisiones es exclusive del rol Contador', () => {
    // Gerencia (pagos.eliminar) y superadmin dejan de tocar provisiones:
    // solo el rol Contador retiene editar/eliminar.
    for (const rolGp of ['gerente', 'superadmin', 'tesorero', 'editor_contable']) {
      (pagina.ctx as any).rolGp = () => rolGp;
      expect(pagina.puedeModificar(pendiente)).withContext(rolGp).toBeFalse();
      expect(pagina.puedeModificar(pendiente, true)).withContext(rolGp).toBeFalse();
    }
    (pagina.ctx as any).rolGp = () => 'contador';
    permisos = ['pagos.eliminar'];
    expect(pagina.puedeModificar(pendiente, true)).toBeTrue();
    permisos = []; expect(pagina.puedeModificar(pendiente, true)).toBeFalse();
  });
});
