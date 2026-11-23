import { of } from 'rxjs';
import { SubirArchivosComponent } from './subir-archivos.component';

describe('Importación maestro: autorización vigente', () => {
  function preparar() {
    let permitido = true;
    const api = jasmine.createSpyObj('api', ['importarMaestro']);
    api.importarMaestro.and.returnValue(of(null));
    const ctx = { tienePermiso: (codigo: string) => codigo === 'modulos.importar' && permitido,
      empresaId: () => 35 };
    const component = new SubirArchivosComponent(ctx as any, api, {} as any);
    component.archivo.set(new File(['fixture'], 'maestro.xlsx'));
    return { component, api, revocar: () => permitido = false };
  }
  it('sin permiso no abre la confirmación aunque haya archivo y empresa', () => {
    const { component, api, revocar } = preparar(); revocar();
    component.importar();
    expect(component.confirmarAbierto()).toBeFalse();
    expect(api.importarMaestro).not.toHaveBeenCalled();
  });
  it('revocar el permiso con el modal abierto impide enviar el archivo', async () => {
    const { component, api, revocar } = preparar();
    component.importar(); expect(component.confirmarAbierto()).toBeTrue();
    revocar(); await component.confirmarImportacion();
    expect(component.confirmarAbierto()).toBeFalse();
    expect(component.importando()).toBeFalse();
    expect(api.importarMaestro).not.toHaveBeenCalled();
  });
  it('con permiso envía el archivo a la empresa seleccionada una vez', async () => {
    const { component, api } = preparar(); const archivo = component.archivo();
    component.importar(); await component.confirmarImportacion();
    expect(api.importarMaestro).toHaveBeenCalledOnceWith(35, archivo, jasmine.any(Function));
    expect(component.importando()).toBeFalse();
  });
});
