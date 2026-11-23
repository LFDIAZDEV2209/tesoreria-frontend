import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { PeriodosPageComponent } from './periodos-page.component';
import { GpPeriodoService } from '../../services/gp-periodo.service';
import { PeriodosService } from '../../services/periodos.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

describe('Creación de períodos y mes habilitado', () => {
  let ctx:PresupuestoContextService, api:any, periodos:any;
  beforeEach(() => {
    ctx=new PresupuestoContextService({} as any);ctx.empresaId.set(44);ctx.mesActivo.set('2026-09');
    ctx.estadosMes.set([{periodo:'2026-09',aprobado:true},{periodo:'2026-08',aprobado:false}]);
    api=jasmine.createSpyObj('periodos',['crearMes','crearAnio','contenidoMes','eliminarMes']);api.crearMes.and.returnValue(of(null));api.crearAnio.and.returnValue(of(null));
    periodos={anios:signal([{anio:2026,meses:[]}]),loading:signal(false),error:signal(''),puedeCrear:signal(true),recargar:jasmine.createSpy('recargar')};
    TestBed.configureTestingModule({imports:[PeriodosPageComponent,NoopAnimationsModule],providers:[provideRouter([]),
      {provide:GpPeriodoService,useValue:periodos},{provide:PresupuestoContextService,useValue:ctx},{provide:PeriodosService,useValue:api}]});
  });
  afterEach(()=>TestBed.resetTestingModule());
  it('muestra los meses creados sin comparaciones ni consolidación',async()=>{
    const f=TestBed.createComponent(PeriodosPageComponent);f.detectChanges();await f.whenStable();f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.month').length).toBe(2);
    expect(f.nativeElement.textContent).toContain('Aprobado');
    expect(f.nativeElement.textContent).not.toContain('consolidado');
    expect(f.nativeElement.querySelector('select[aria-label="Mes del gestor"]')).toBeNull();f.destroy();
  });
  it('crea el nuevo mes en la empresa activa y recarga el control mensual',async()=>{
    const f=TestBed.createComponent(PeriodosPageComponent);const page=f.componentInstance;
    page.abrirCrear();expect(page.nuevoMes).toBe('2026-10');await page.crear('mes');
    expect(api.crearMes).toHaveBeenCalledOnceWith('2026-10',44);expect(periodos.recargar).toHaveBeenCalled();
    expect(page.exito()).toContain('habilitado');f.destroy();
  });
  it('no abre ni crea un mes sin permiso',async()=>{
    periodos.puedeCrear.set(false);const f=TestBed.createComponent(PeriodosPageComponent);f.detectChanges();
    f.componentInstance.abrirMes({periodo:'2026-10',creado:false});await f.componentInstance.crear('mes');
    expect(f.componentInstance.modalCrear()).toBeNull();expect(api.crearMes).not.toHaveBeenCalled();f.destroy();
  });
  it('un mes existente sin aprobar puede habilitarse desde su tarjeta',async()=>{
    const f=TestBed.createComponent(PeriodosPageComponent);f.detectChanges();
    const agosto=f.nativeElement.querySelectorAll('.month')[0] as HTMLButtonElement;
    expect(agosto.disabled).toBeFalse();agosto.click();f.detectChanges();
    expect(f.componentInstance.nuevoMes).toBe('2026-08');
    const confirmar=document.querySelector<HTMLButtonElement>('app-gp-modal button[pie]')!;
    confirmar.click();await f.whenStable();
    expect(api.crearMes).toHaveBeenCalledOnceWith('2026-08',44);f.destroy();
  });
  it('explica por qué no se puede habilitar un mes sin empresa',()=>{
    ctx.empresaId.set(null);const f=TestBed.createComponent(PeriodosPageComponent);
    f.componentInstance.abrirMes({periodo:'2026-10',creado:false});
    expect(f.componentInstance.error()).toContain('Selecciona una empresa');f.destroy();
  });

  it('conserva todo 2026 y solo noviembre de 2027 sin fabricar meses intermedios',()=>{
    ctx.estadosMes.set([...Array.from({length:12},(_,i)=>({periodo:'2026-'+String(i+1).padStart(2,'0'),aprobado:false})),{periodo:'2027-11',aprobado:false}]);
    ctx.mesActivo.set('2027-11');const f=TestBed.createComponent(PeriodosPageComponent);
    expect(f.componentInstance.anios()).toEqual([2027,2026]);
    expect(f.componentInstance.mesesDelAnio(2026).length).toBe(12);
    expect(f.componentInstance.mesesDelAnio(2027).map(m=>m.periodo)).toEqual(['2027-11']);f.destroy();
  });

  it('muestra los datos del mes y bloquea la eliminación',async()=>{
    api.contenidoMes.and.returnValue(of({periodo:'2026-08',datos:[{tipo:'Proveedores',registros:8}]}));
    const f=TestBed.createComponent(PeriodosPageComponent);await f.componentInstance.revisarQuitarMes('2026-08');f.detectChanges();await f.whenStable();f.detectChanges();
    const modal=document.querySelector('app-gp-modal')!;expect(modal.textContent).toContain('Proveedores: 8');
    expect(modal.querySelector('button[pie]')).toBeNull();await f.componentInstance.quitarMes();expect(api.eliminarMes).not.toHaveBeenCalled();f.destroy();
  });
  it('quita un mes vacío después de confirmar y recarga los períodos',async()=>{
    api.contenidoMes.and.returnValue(of({periodo:'2026-08',datos:[]}));api.eliminarMes.and.returnValue(of(null));
    const f=TestBed.createComponent(PeriodosPageComponent);await f.componentInstance.revisarQuitarMes('2026-08');await f.componentInstance.quitarMes();
    expect(api.eliminarMes).toHaveBeenCalledOnceWith('2026-08',44);expect(ctx.estadosMes().some(m=>m.periodo==='2026-08')).toBeFalse();
    expect(periodos.recargar).toHaveBeenCalled();f.destroy();
  });

});
