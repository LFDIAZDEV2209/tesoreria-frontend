import { mensajeError } from './gp-errores';

describe('mensajeError', () => {
  it('conserva los mensajes de negocio que envía el backend', () => {
    expect(mensajeError({ status: 500, error: { detail: 'La clave debe tener al menos 8 caracteres.' } }))
      .toBe('La clave debe tener al menos 8 caracteres.');
    expect(mensajeError({ status: 400, error: { message: 'El NIT ya existe en el catálogo.' } }))
      .toBe('El NIT ya existe en el catálogo.');
  });

  it('oculta detalles técnicos de Hibernate/SQL tras un mensaje entendible', () => {
    const hibernate = mensajeError({
      status: 500,
      error: { detail: 'Could not initialize proxy [com.example.Tesoreria.entity.Employee#3764] - no session', title: 'Error interno del servidor' },
    });
    expect(hibernate).not.toContain('proxy');
    expect(hibernate).not.toContain('session');
    expect(hibernate).toContain('servidor');

    const sql = mensajeError({ status: 500, error: { detail: 'java.sql.SQLSyntaxErrorException: Table kpisdb.foo doesn\'t exist' } });
    expect(sql).not.toContain('SQL');
    expect(sql).toContain('servidor');
  });

  it('resume los errores de validación con lista de campos', () => {
    expect(mensajeError({ status: 400, error: { detail: [{ msg: 'El nombre es obligatorio' }, { msg: 'El NIT es inválido' }] } }))
      .toBe('El nombre es obligatorio. El NIT es inválido');
  });

  it('traduce estados HTTP comunes', () => {
    expect(mensajeError({ status: 403 })).toContain('permisos');
    expect(mensajeError({ status: 0 })).toContain('conectar');
    expect(mensajeError({ status: 404 })).toContain('No encontramos');
    expect(mensajeError({ status: 409 })).toContain('estado del registro cambió');
  });

  it('reconoce el timeout del cliente HTTP', () => {
    expect(mensajeError({ name: 'TimeoutError', message: 'Timeout has occurred' })).toContain('tardó demasiado');
  });

  it('usa el respaldo de la pantalla y nunca devuelve vacío', () => {
    expect(mensajeError(undefined, 'No se pudo consultar el histórico.')).toBe('No se pudo consultar el histórico.');
    expect(mensajeError({})).toBeTruthy();
    expect(mensajeError({ status: 502 })).toContain('no está disponible');
  });
});
