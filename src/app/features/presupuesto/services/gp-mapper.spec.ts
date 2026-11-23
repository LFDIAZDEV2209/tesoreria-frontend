import { mapConsolidado, mapSugerenciaPresupuesto, permisosDesdeSesion } from './gp-mapper';
import { EstadoSesionGp } from './gp-session.service';

describe('Sugerencias del presupuesto', () => {
  it('conserva el importe confirmado por el endpoint de sugerido, incluido cero', () => {
    expect(mapConsolidado({nit:'123', pago_sugerido:74254170}).pagoSugerido).toBe(74254170);
    expect(mapConsolidado({nit:'123', pago_sugerido:0}).pagoSugerido).toBe(0);
    expect(mapConsolidado({nit:'123', pago_sugerido:null}).pagoSugerido).toBeNull();
    expect(mapConsolidado({nit:'123'}).pagoSugerido).toBeNull();
  });
  it('distingue un sugerido de cero de una observación sin monto', () => {
    expect(mapSugerenciaPresupuesto({ pago_sugerido: 0 }).pagoSugerido).toBe(0);
    const nota = mapSugerenciaPresupuesto({ observacion: 'Consultar antes de pagar' });
    expect(nota.pagoSugerido).toBeNull();
    expect(nota.observacion).toBe('Consultar antes de pagar');
  });
});

describe('Permisos efectivos de Nexa', () => {
  it('identifica Tesorería por el rol de Nexa aunque el rol compatible sea contador', () => {
    const estado = {autenticado:true,rol:'contador',rol_nexa:'tesorero',permisos:['pagos.ver','pagos.pagar']} as EstadoSesionGp;
    const resultado = permisosDesdeSesion(estado);
    expect(resultado.rolGp).toBe('tesorero');
    expect(resultado.permisos).toContain('pagos.pagar');
    expect(resultado.permisos).not.toContain('pagos.operar');
  });
  it('respeta una revocación del servidor aunque el perfil sea superadmin', () => {
    const estado = { autenticado: true, rol: 'superadmin', puede_aprobar: true, permisos: ['presupuesto.ver'] } as EstadoSesionGp;
    const resultado = permisosDesdeSesion(estado);
    expect(resultado.permisos).toEqual(['presupuesto.ver']);
    expect(resultado.puedeAprobar).toBeFalse();
  });

  it('conserva los permisos operativos personalizados sin ampliar por el rol visual', () => {
    const estado = { autenticado: true, rol: 'contador', permisos: ['pagos.ver', 'pagos.operar'] } as EstadoSesionGp;
    expect(permisosDesdeSesion(estado).permisos).toEqual(['pagos.ver', 'pagos.operar']);
  });
});
