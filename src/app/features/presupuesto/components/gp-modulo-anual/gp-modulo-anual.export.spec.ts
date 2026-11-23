import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { ModuloAnual } from '../../models/modulo-anual.model';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { GpModuloAnualComponent } from './gp-modulo-anual.component';

const datos = (): ModuloAnual => ({
  empresaId: 35, anio: null, anios: [2026], meses: ['2026-02', '2026-03'],
  filas: [{nombre: 'Proveedor de prueba', nit: '900123', categoria: 'FRUVER',
    valores: {'2026-02': {debito: 100, credito: 0, saldo: 100}, '2026-03': {debito: 200, credito: 0, saldo: 200}},
    totalAnio: {debito: 300, credito: 0, saldo: 300}}],
  totalesMes: {'2026-02': {debito: 100, credito: 0, saldo: 100}, '2026-03': {debito: 200, credito: 0, saldo: 200}},
  totalGeneral: {debito: 300, credito: 0, saldo: 300},
});

describe('Todos los meses: descarga de documentos', () => {
  let fixture: ComponentFixture<GpModuloAnualComponent>;
  let api: jasmine.SpyObj<PresupuestoService>;
  let toast: jasmine.SpyObj<PresupuestoToastService>;
  let crearUrl: jasmine.Spy;
  let revocarUrl: jasmine.Spy;
  let descargas: {href: string; nombre: string}[];
  let empresa: ReturnType<typeof signal<number | null>>;
  let libro: Blob;

  beforeEach(() => {
    empresa = signal<number | null>(35);
    libro = new Blob(['archivo detallado recibido del servidor'], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    api = jasmine.createSpyObj<PresupuestoService>('PresupuestoService', ['moduloAnual', 'provisionesAnual', 'exportarModuloAnual']);
    api.moduloAnual.and.returnValue(of(datos()));
    api.provisionesAnual.and.returnValue(of(datos()));
    api.exportarModuloAnual.and.returnValue(of(libro));
    toast = jasmine.createSpyObj<PresupuestoToastService>('PresupuestoToastService', ['error']);
    descargas = [];
    crearUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:documentos');
    revocarUrl = spyOn(URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function(this: HTMLAnchorElement) {
      descargas.push({href: this.href, nombre: this.download});
    });
    TestBed.configureTestingModule({imports: [GpModuloAnualComponent], providers: [
      {provide: PresupuestoService, useValue: api},
      {provide: PresupuestoToastService, useValue: toast},
      {provide: PresupuestoContextService, useValue: {empresaId: empresa, nombreEmpresa: () => 'Empresa de prueba'}},
    ]}).overrideComponent(GpModuloAnualComponent, {set: {template: '', imports: []}});
  });

  afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });

  function crear(modulo = 'proveedores'): GpModuloAnualComponent {
    fixture = TestBed.createComponent(GpModuloAnualComponent);
    fixture.componentRef.setInput('modulo', modulo);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  for (const modulo of ['proveedores', 'anticipos', 'cx_pagar', 'cx_cobrar', 'impuestos', 'provisiones']) {
    it(`descarga los documentos de ${modulo} sin construir un libro del resumen por tercero`, async () => {
      const componente = crear(modulo);
      componente.anio.set(2026);
      componente.categoria.set('FRUVER');
      componente.busqueda.set('900123');
      componente.medida.set('credito');

      await componente.exportar();

      expect(api.exportarModuloAnual).toHaveBeenCalledOnceWith(modulo, 35, {anio: 2026, categoria: 'FRUVER', busqueda: '900123'});
      expect(crearUrl).toHaveBeenCalledOnceWith(libro);
      expect(descargas).toEqual([{href: 'blob:documentos', nombre: `${modulo}-35-2026-documentos.xlsx`}]);
      expect(revocarUrl).toHaveBeenCalledOnceWith('blob:documentos');
      expect(componente.exportando()).toBeFalse();
      expect(toast.error).not.toHaveBeenCalled();
    });
  }

  it('solicita todos los años y nombra la descarga sin usar el mes operativo', async () => {
    const componente = crear();
    await componente.exportar();
    expect(api.exportarModuloAnual).toHaveBeenCalledOnceWith('proveedores', 35, {anio: null, categoria: undefined, busqueda: undefined});
    expect(descargas[0].nombre).toBe('proveedores-35-todos-documentos.xlsx');
  });

  it('mantiene el indicador y evita descargas duplicadas mientras espera el archivo', async () => {
    const pendiente = new Subject<Blob>();
    api.exportarModuloAnual.and.returnValue(pendiente);
    const componente = crear();
    const descarga = componente.exportar();
    expect(componente.exportando()).toBeTrue();
    await componente.exportar();
    expect(api.exportarModuloAnual).toHaveBeenCalledTimes(1);
    expect(crearUrl).not.toHaveBeenCalled();

    pendiente.next(libro);
    pendiente.complete();
    await descarga;
    expect(crearUrl).toHaveBeenCalledOnceWith(libro);
    expect(componente.exportando()).toBeFalse();
  });

  it('informa un error de descarga y permite volver a intentarlo', async () => {
    const pendiente = new Subject<Blob>();
    api.exportarModuloAnual.and.returnValue(pendiente);
    const componente = crear();
    const descarga = componente.exportar();
    pendiente.error({status: 500});
    await descarga;

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(componente.exportando()).toBeFalse();
    expect(crearUrl).not.toHaveBeenCalled();
    expect(descargas).toEqual([]);
    api.exportarModuloAnual.and.returnValue(of(libro));
    await componente.exportar();
    expect(api.exportarModuloAnual).toHaveBeenCalledTimes(2);
    expect(crearUrl).toHaveBeenCalledOnceWith(libro);
  });

  it('no solicita archivos cuando no hay datos cargados', async () => {
    const componente = crear();
    componente.datos.set(null);
    await componente.exportar();
    expect(api.exportarModuloAnual).not.toHaveBeenCalled();
    expect(crearUrl).not.toHaveBeenCalled();
    expect(componente.exportando()).toBeFalse();
  });
});
