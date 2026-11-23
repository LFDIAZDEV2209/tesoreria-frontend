import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Observable, of, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { ModuloPageComponent } from './modulo-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

describe('Rendimiento reproducible del módulo operativo', () => {
  let ctx: PresupuestoContextService;
  let api: any;
  let page: ModuloPageComponent;

  beforeEach(() => {
    api = jasmine.createSpyObj('PresupuestoService', ['resumenModulo', 'movimientos', 'importacionPeriodos', 'categorias', 'categoriasHistoricas']);
    api.resumenModulo.and.returnValue(of({}));
    api.movimientos.and.returnValue(of({ content: [], totalElements: 0 }));
    api.importacionPeriodos.and.returnValue(of({}));
    api.categorias.and.returnValue(of(['ABARROTES']));
    api.categoriasHistoricas.and.returnValue(of(['ABARROTES']));
    ctx = new PresupuestoContextService(api);
    ctx.empresas.set([{ id: 35 }] as any);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, { set: (id: number | null) => { empresa = id; } }) as any;
    page = TestBed.runInInjectionContext(() => new ModuloPageComponent(ctx, api, {} as any, {} as any, { snapshot: { data: { modulo: 'proveedores' } } } as any, {} as any));
    TestBed.flushEffects();
    ctx.empresaId.set(35);
  });

  afterEach(() => { page.ngOnDestroy(); TestBed.resetTestingModule(); });

  it('pide una sola vez el catálogo y lo comparte con ambos selectores', () => {
    page.ngOnInit();
    expect(api.categorias.calls.count()).toBe(1);
    expect(api.categoriasHistoricas).not.toHaveBeenCalled();
    expect(page.categorias).toEqual(['ABARROTES']);
    expect(page.categoriasHistoricas).toEqual(['ABARROTES']);
  });

  it('resumen de 80 ms y listado de 120 ms terminan juntos en 120 ms virtuales', fakeAsync(() => {
    api.resumenModulo.and.returnValue(timer(80).pipe(map(() => ({}))));
    api.movimientos.and.returnValue(timer(120).pipe(map(() => ({ content: [], totalElements: 0 }))));
    page.cargar();
    tick(119);
    expect(page.loading()).toBeTrue();
    tick(1);
    expect(page.loading()).toBeFalse();
  }));

  it('cancela las tres lecturas pendientes al cambiar de empresa y al destruir', () => {
    let canceladas = 0;
    api.resumenModulo.and.returnValue(new Observable(() => () => { canceladas++; }));
    api.movimientos.and.returnValue(new Observable(() => () => { canceladas++; }));
    api.importacionPeriodos.and.returnValue(new Observable(() => () => { canceladas++; }));
    page.cargar();
    ctx.empresaId.set(36);
    page.cargar();
    expect(canceladas).toBe(3);
    page.ngOnDestroy();
    expect(canceladas).toBe(6);
  });

  it('espera el resumen cuando tarda más que el listado', fakeAsync(() => {
    api.resumenModulo.and.returnValue(timer(200).pipe(map(() => ({ totalSaldo: 35 }))));
    api.movimientos.and.returnValue(timer(80).pipe(map(() => ({ content: [], totalElements: 0 }))));
    page.cargar();
    tick(80);
    expect(page.pagina()).not.toBeNull();
    expect(page.loading()).toBeTrue();
    tick(120);
    expect(page.loading()).toBeFalse();
    expect(page.resumen()?.totalSaldo).toBe(35);
  }));

  it('cancelar una búsqueda conserva la consulta independiente de resumen', () => {
    let resumenCancelado = false, listadoCancelado = false;
    api.resumenModulo.and.returnValue(new Observable(() => () => { resumenCancelado = true; }));
    api.movimientos.and.returnValue(new Observable(() => () => { listadoCancelado = true; }));
    page.cargar();
    page.busqueda.set('nuevo');
    page.cargarPagina(35);
    expect(listadoCancelado).toBeTrue();
    expect(resumenCancelado).toBeFalse();
  });
});
