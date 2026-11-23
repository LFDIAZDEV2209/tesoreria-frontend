import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CategoriasComponent } from './categorias.component';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

describe('Administración de categorías', () => {
  let api: jasmine.SpyObj<PresupuestoService>;
  let ctx: PresupuestoContextService;
  beforeEach(() => {
    api = jasmine.createSpyObj('api', ['permisosGp', 'administrarCategorias', 'crearCategoria', 'cambiarEstadoCategoria']);
    api.permisosGp.and.returnValue(of({gerencia: false, superAdmin: false, puedeAprobar: false, permisos: ['admin.categorias']}));
    api.administrarCategorias.and.returnValue(of([{id: 7, nombre: 'FRUVER', activa: true}]));
    api.crearCategoria.and.returnValue(of({}));
    api.cambiarEstadoCategoria.and.returnValue(of({}));
    ctx = new PresupuestoContextService(api);
    TestBed.configureTestingModule({imports: [CategoriasComponent], providers: [
      {provide: PresupuestoService, useValue: api}, {provide: PresupuestoContextService, useValue: ctx},
    ]});
  });
  it('muestra catálogo y desactiva mediante API', () => {
    const fixture = TestBed.createComponent(CategoriasComponent); fixture.detectChanges(); TestBed.flushEffects(); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('[aria-label="Desactivar FRUVER"]');
    expect(button).not.toBeNull(); button.click();
    expect(api.cambiarEstadoCategoria).toHaveBeenCalledWith(7, false);
  });
  it('envía desde el formulario sin navegación nativa y crea por API', () => {
    const fixture = TestBed.createComponent(CategoriasComponent); fixture.detectChanges();
    fixture.componentInstance.abrir(); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'CATEGORIA DE PRUEBA'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    const submit = new Event('submit', {bubbles: true, cancelable: true});
    fixture.nativeElement.querySelector('form').dispatchEvent(submit);
    expect(submit.defaultPrevented).toBeTrue();
    expect(api.crearCategoria).toHaveBeenCalledOnceWith('CATEGORIA DE PRUEBA');
    expect(fixture.componentInstance.nombre.value).toBe('');
  });
  it('revocación oculta acciones e impide solicitudes', () => {
    const fixture = TestBed.createComponent(CategoriasComponent); fixture.detectChanges();
    ctx.permisos.set({gerencia: false, superAdmin: false, puedeAprobar: false, permisos: []}); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    fixture.componentInstance.nombre.setValue('PRUEBA'); fixture.componentInstance.crear();
    expect(api.crearCategoria).not.toHaveBeenCalled();
  });
  it('conserva el formulario y muestra un error del backend', () => {
    api.crearCategoria.and.returnValue(throwError(() => ({error: {message: 'La categoría ya existe.'}})));
    const fixture = TestBed.createComponent(CategoriasComponent); fixture.detectChanges();
    fixture.componentInstance.nombre.setValue('FRUVER'); fixture.componentInstance.crear(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('ya existe');
    expect(fixture.componentInstance.nombre.value).toBe('FRUVER');
  });
});
