import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OverlayContainer } from '@angular/cdk/overlay';
import { SelectBuscableDirective } from './select-buscable.directive';

@Component({standalone:true,imports:[FormsModule,ReactiveFormsModule,SelectBuscableDirective],template:`
  <label>Banco<select id="banco" [(ngModel)]="banco" (change)="cambios = cambios + 1"><option value="">Todos</option>
    @for (b of bancos; track b.id) { <option [ngValue]="b">{{ b.nombre }}</option> }
    <option disabled value="bloqueado">Banco bloqueado</option>
    <optgroup label="Suspendidos" disabled><option value="suspendido">Banco suspendido</option></optgroup>
  </select></label>
  <select id="estado" aria-label="Estado" [formControl]="estado" required><option value="">Seleccione</option><option value="activo">Activo</option><option value="cerrado">Cerrado</option></select>
  <select id="varios" multiple [formControl]="varios"><option value="a">Anticipos</option><option value="b">Provisiones</option></select>
`})
class HostSelectComponent {
  bancos=[{id:1,nombre:'Banco Bogotá'},{id:2,nombre:'Bancolombia'}];
  banco: unknown=''; cambios=0;
  estado=new FormControl(''); varios=new FormControl<string[]>([]);
}

describe('Selectores con búsqueda de la plataforma',()=>{
  let fixture: ComponentFixture<HostSelectComponent>, overlay: HTMLElement;
  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[HostSelectComponent]}).compileComponents();
    fixture=TestBed.createComponent(HostSelectComponent);
    fixture.detectChanges(); await fixture.whenStable();
    overlay=TestBed.inject(OverlayContainer).getContainerElement();
  });
  afterEach(()=>{fixture?.destroy();TestBed.inject(OverlayContainer).ngOnDestroy();TestBed.resetTestingModule();});
  function abrir(id='banco') { const select=fixture.nativeElement.querySelector('#'+id) as HTMLSelectElement; select.click(); fixture.detectChanges(); return select; }
  function buscar(texto:string) { const input=overlay.querySelector('input')!; input.value=texto;input.dispatchEvent(new Event('input',{bubbles:true}));fixture.detectChanges();return input; }
  function opciones() { return Array.from(overlay.querySelectorAll<HTMLButtonElement>('[role=option]')); }

  it('busca sin tildes dentro del desplegable y conserva objetos ngValue y change',async()=>{
    const select=abrir();const input=buscar('bogota');
    expect(input.getAttribute('aria-label')).toBe('Buscar en Banco');
    expect(opciones().map(o=>o.textContent?.trim())).toEqual(['Banco Bogotá']);
    opciones()[0].click();fixture.detectChanges();await fixture.whenStable();
    expect(fixture.componentInstance.banco).toBe(fixture.componentInstance.bancos[0]);
    expect(fixture.componentInstance.cambios).toBe(1);
    expect(select.selectedOptions[0].textContent?.trim()).toBe('Banco Bogotá');
    expect(overlay.querySelector('input')).toBeNull();
  });
  it('navega con teclado y conserva validación y touched de formularios reactivos',()=>{
    const select=fixture.nativeElement.querySelector('#estado') as HTMLSelectElement;
    select.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));fixture.detectChanges();
    const input=buscar('activo');input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(fixture.componentInstance.estado.value).toBe('activo');
    expect(fixture.componentInstance.estado.valid).toBeTrue();expect(fixture.componentInstance.estado.touched).toBeTrue();
    expect(document.activeElement).toBe(select);
  });
  it('no abre controles deshabilitados ni permite opciones deshabilitadas',()=>{
    fixture.componentInstance.estado.disable();fixture.detectChanges();abrir('estado');expect(overlay.querySelector('input')).toBeNull();
    abrir();buscar('bloqueado');expect(opciones()[0].disabled).toBeTrue();opciones()[0].click();expect(fixture.componentInstance.cambios).toBe(0);
    buscar('suspendido');expect(opciones()[0].disabled).toBeTrue();
  });
  it('permite selección múltiple sin perder selecciones al buscar',()=>{
    abrir('varios');buscar('anti');opciones()[0].click();fixture.detectChanges();
    buscar('prov');opciones()[0].click();fixture.detectChanges();
    expect(fixture.componentInstance.varios.value).toEqual(['a','b']);
    buscar('anti');opciones()[0].click();fixture.detectChanges();expect(fixture.componentInstance.varios.value).toEqual(['b']);
  });
  it('actualiza opciones dinámicas y permite cerrar sin cambiar el valor',()=>{
    abrir();fixture.componentInstance.bancos.push({id:3,nombre:'Banco Nuevo'});fixture.detectChanges();
    const input=buscar('nuevo');expect(opciones().length).toBe(1);
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));fixture.detectChanges();
    expect(overlay.querySelector('input')).toBeNull();expect(fixture.componentInstance.banco).toBe('');
    abrir();buscar('inexistente');expect(overlay.textContent).toContain('No hay opciones que coincidan.');
  });
  it('elimina el desplegable al destruir la página',()=>{
    abrir();fixture.destroy();expect(overlay.querySelector('input')).toBeNull();
  });
});
