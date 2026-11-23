import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject, throwError } from 'rxjs';
import { PresupuestoPageComponent } from './presupuesto-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { Mensual } from '../../models/presupuesto.model';

describe('Presupuesto progresivo y paginado', () => {
  let page: PresupuestoPageComponent, ctx: PresupuestoContextService, api: any;
  const seccion = (nit = '1', totalElements = 1, page = 0) => ({ detalle: [{ nit, nombre: nit, categoria: null, total: 10, valores: {}, pagoSugerido: 0, saldoPendiente: 10, totalYaAprobado: 0, totalYaPagado: 0, aFavor: false, montoPagado: 0, montoPendiente: 10 }], total: {}, totalElements, totalPages: Math.ceil(totalElements / 50), page });
  const resumen = () => ({ contrato: { numeroContrato: 'A' }, meses: ['2026-09'], proveedores: { detalle: [], total: {}, totalElements: 101 }, anticipos: { detalle: [], total: {} }, prestamos: { detalle: [], total: {} }, cuentasCobrar: { detalle: [], total: {} }, impuestosEstampillasSeguros: { detalle: [], total: {} }, pagosProyectados: { detalle: [], total: {} }, provisiones: { detalle: [], total: {} } } as unknown as Mensual);
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = jasmine.createSpyObj('API', ['mensual', 'mensualSeccion', 'consolidado', 'detalleConsolidado', 'categorias', 'setPagoSugeridoProveedor']);
    api.mensual.and.callFake(() => of(resumen())); api.mensualSeccion.and.returnValue(of(seccion()));
    api.categorias.and.returnValue(of(['OTROS'])); api.consolidado.and.returnValue(of([]));
    api.detalleConsolidado.and.returnValue(of({ content: [], totalElements: 0, totalPages: 1 }));
    ctx = new PresupuestoContextService(api);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, { set: (id: number | null) => { empresa = id; } }) as any;
    page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx, api, {} as any));
    TestBed.flushEffects(); ctx.empresaId.set(51);
  });
  afterEach(() => { page.ngOnDestroy(); TestBed.resetTestingModule(); });

  it('carga inicialmente sólo el resumen y conserva el catálogo, consolidado y detalle sin consultar', async () => {
    await page.cargar();
    expect(api.mensual).toHaveBeenCalledOnceWith(51, false, true);
    expect(api.mensualSeccion).not.toHaveBeenCalled(); expect(api.categorias).not.toHaveBeenCalled();
    expect(api.consolidado).not.toHaveBeenCalled(); expect(api.detalleConsolidado).not.toHaveBeenCalled();
    expect(page.contrato()?.numeroContrato).toBe('A');
    expect(page.contadorCorto('proveedores')).toBe('101');
    expect(page.contadorSeccion('proveedores')).toBe('101 terceros');
  });

  it('mantiene los indicadores activos hasta recibir el resumen y cada sección', async () => {
    const inicial = new Subject<Mensual>(); api.mensual.and.returnValue(inicial);
    const carga = page.cargar(); expect(page.loading()).toBeTrue();
    inicial.next(resumen()); await carga; expect(page.loading()).toBeFalse();
    const proveedores = new Subject<any>(); api.mensualSeccion.and.returnValue(proveedores);
    const consulta = page.cargarSeccion('proveedores');
    expect(page.estadoSeccion('proveedores').cargando).toBeTrue();
    expect(page.estadoSeccion('anticipos').cargando).toBeFalse();
    proveedores.next(seccion()); await consulta;
    expect(page.estadoSeccion('proveedores').cargando).toBeFalse();
  });

  it('deduplica llamadas concurrentes y no vuelve a consultar una sección ya cargada', async () => {
    await page.cargar(); const respuesta = new Subject<any>(); api.mensualSeccion.and.returnValue(respuesta);
    const primera = page.cargarSeccion('proveedores'); const segunda = page.cargarSeccion('proveedores');
    expect(segunda).toBe(primera); expect(api.mensualSeccion).toHaveBeenCalledTimes(1);
    respuesta.next(seccion()); await primera; await page.cargarSeccion('proveedores');
    expect(api.mensualSeccion).toHaveBeenCalledTimes(1); expect(page.estadoSeccion('proveedores').cargado).toBeTrue();
  });

  it('mantiene dos consultas de sección activas y spinner en la tercera que espera cupo', async () => {
    await page.cargar();
    const proveedores = new Subject<any>(), prestamos = new Subject<any>(), anticipos = new Subject<any>();
    api.mensualSeccion.and.callFake((_empresa: number, id: string) => ({ proveedores, prestamos, anticipos } as any)[id]);
    const consultas = [page.cargarSeccion('proveedores'), page.cargarSeccion('prestamos'), page.cargarSeccion('anticipos')];
    expect(api.mensualSeccion.calls.allArgs().map((args: any[]) => args[1])).toEqual(['proveedores', 'prestamos']);
    expect(page.estadoSeccion('anticipos').cargando).toBeTrue();
    expect(page.estadoSeccion('anticipos').cargado).toBeFalse();
    expect(page.estadoSeccion('impuestos').cargando).toBeFalse();
    proveedores.next(seccion('proveedor')); prestamos.next(seccion('prestamo')); anticipos.next(seccion('anticipo'));
    await Promise.all(consultas);
    expect(api.mensualSeccion.calls.allArgs().map((args: any[]) => args[1])).toEqual(['proveedores', 'prestamos', 'anticipos']);
    expect(page.estadoSeccion('anticipos').cargado).toBeTrue();
    expect(api.detalleConsolidado).not.toHaveBeenCalled(); expect(api.consolidado).not.toHaveBeenCalled();
  });

  it('cancela las secciones activas y pendientes al cambiar de empresa sin iniciarlas después', async () => {
    await page.cargar();
    const respuestas = [new Subject<any>(), new Subject<any>()];
    api.mensualSeccion.and.returnValues(...respuestas);
    const consultas = [page.cargarSeccion('proveedores'), page.cargarSeccion('prestamos'), page.cargarSeccion('anticipos')];
    expect(api.mensualSeccion).toHaveBeenCalledTimes(2);
    ctx.empresaId.set(52); await page.cargar(); await Promise.all(consultas);
    expect(respuestas.every(respuesta => !respuesta.observed)).toBeTrue();
    expect(api.mensualSeccion).toHaveBeenCalledTimes(2);
    expect(page.estadoSeccion('anticipos').cargado).toBeFalse();
    expect(page.estadoSeccion('anticipos').error).toBeNull();
    expect(api.mensual).toHaveBeenCalledWith(52, false, true);
  });

  it('cancela la respuesta de la empresa anterior y conserva sólo la nueva', async () => {
    await page.cargar(); const antigua = new Subject<any>(); api.mensualSeccion.and.returnValue(antigua);
    const consulta = page.cargarSeccion('proveedores'); ctx.empresaId.set(52); await page.cargar();
    expect(antigua.observed).toBeFalse(); await consulta;
    expect(page.datosSeccion('proveedores').detalle).toEqual([]); expect(page.estadoSeccion('proveedores').error).toBeNull();
  });

  it('permite reintentar un error de sección sin recargar las demás', async () => {
    await page.cargar(); api.mensualSeccion.and.returnValue(throwError(() => new Error('Fallo de red')));
    await page.cargarSeccion('provisiones'); expect(page.estadoSeccion('provisiones').error).toBeTruthy();
    api.mensualSeccion.and.returnValue(of(seccion())); await page.cargarSeccion('provisiones', true);
    expect(page.estadoSeccion('provisiones').error).toBeNull(); expect(page.estadoSeccion('provisiones').cargado).toBeTrue();
    expect(api.mensual).toHaveBeenCalledTimes(1);
  });

  it('cancela la búsqueda anterior, espera 300 ms y envía filtros al servidor', fakeAsync(() => {
    page.cargar(); flushMicrotasks(); const antigua = new Subject<any>(); api.mensualSeccion.and.returnValue(antigua);
    page.cargarSeccion('proveedores'); page.cambiarFiltroSeccion('proveedores', 'busqueda', 'nuevo');
    expect(antigua.observed).toBeFalse(); api.mensualSeccion.and.returnValue(of(seccion('nuevo')));
    tick(299); expect(api.mensualSeccion).toHaveBeenCalledTimes(1);
    tick(1); flushMicrotasks(); expect(api.mensualSeccion).toHaveBeenCalledWith(51, 'proveedores', { page: 0, size: 50, busqueda: 'nuevo', categoria: '' });
    expect(page.datosSeccion('proveedores').detalle[0].nit).toBe('nuevo'); tick(250);
  }));

  it('retira una búsqueda en cola y consulta sólo sus filtros más recientes al obtener cupo', fakeAsync(() => {
    page.cargar(); flushMicrotasks();
    const proveedores = new Subject<any>(), prestamos = new Subject<any>(), anticipos = new Subject<any>();
    api.mensualSeccion.and.callFake((_empresa: number, id: string) => ({ proveedores, prestamos, anticipos } as any)[id]);
    page.cargarSeccion('proveedores'); page.cargarSeccion('prestamos'); page.cargarSeccion('anticipos');
    page.cambiarFiltroSeccion('anticipos', 'busqueda', 'vigente');
    tick(300); flushMicrotasks();
    expect(api.mensualSeccion).toHaveBeenCalledTimes(2);
    proveedores.next(seccion('1'));
    expect(api.mensualSeccion.calls.mostRecent().args).toEqual([51, 'anticipos', { page: 0, size: 50, busqueda: 'vigente', categoria: '' }]);
    prestamos.next(seccion('2')); anticipos.next(seccion('3')); flushMicrotasks(); tick(250);
    expect(api.mensualSeccion).toHaveBeenCalledTimes(3);
    expect(page.estadoSeccion('anticipos').cargando).toBeFalse();
    expect(page.estadoSeccion('anticipos').busqueda).toBe('vigente');
  }));

  it('pide sólo la página siguiente y muestra los totales globales del servidor', async () => {
    await page.cargar(); api.mensualSeccion.and.returnValue(of({ ...seccion('1', 101), totales: { total: 5000 } }));
    await page.cargarSeccion('proveedores'); await page.paginaSeccion('proveedores', 1);
    expect(api.mensualSeccion).toHaveBeenCalledWith(51, 'proveedores', jasmine.objectContaining({ page: 1, size: 50 }));
    expect(page.sumaTerceros('proveedores', 'total')).toBe(5000);
  });

  it('no cambia las filas ni los totales filtrados al actualizar el resumen global', async () => {
    await page.cargar();
    (page as any).cambiarEstadoSeccion('proveedores', { busqueda: 'único', categoria: 'OTROS', pagina: 1 });
    const filtrada = { ...seccion('único', 51, 1), total: { '2026-09': 10 }, totales: { total: 10 } };
    api.mensualSeccion.and.returnValue(of(filtrada)); await page.cargarSeccion('proveedores');
    const nuevo = { ...resumen(), totalesGlobales: { totalPagoSugerido: 800, totalSugeridoAprobado: 600 } };
    (page as any).aplicarResumen(nuevo);
    expect(page.datosSeccion('proveedores')).toBe(filtrada);
    expect(page.estadoSeccion('proveedores').pagina).toBe(1);
    expect(page.estadoSeccion('proveedores').total).toBe(51);
    expect(page.sumaTerceros('proveedores', 'total')).toBe(10);
    expect(page.mensual()?.totalesGlobales).toEqual(nuevo.totalesGlobales);
    expect(api.mensualSeccion).toHaveBeenCalledTimes(1);
  });

  it('refresca sólo las secciones visitadas y conserva sus filtros y página', async () => {
    await page.cargar();
    (page as any).cambiarEstadoSeccion('proveedores', { cargado: true, busqueda: 'visible', categoria: 'OTROS', pagina: 1 });
    (page as any).refrescarSeccionesVisitadas(['proveedores', 'anticipos', 'consolidado', 'terceros']);
    await page.cargarSeccion('proveedores');
    expect(api.mensualSeccion).toHaveBeenCalledOnceWith(51, 'proveedores', { page: 1, size: 50, busqueda: 'visible', categoria: 'OTROS' });
    expect(api.consolidado).not.toHaveBeenCalled(); expect(api.detalleConsolidado).not.toHaveBeenCalled();
  });

  it('conserva la tabla consultada cuando falla un refresco y permite reintentar', async () => {
    await page.cargar(); await page.cargarSeccion('proveedores');
    const anterior = page.datosSeccion('proveedores');
    api.mensualSeccion.and.returnValue(throwError(() => new Error('Temporal')));
    await page.cargarSeccion('proveedores', true);
    expect(page.seccionLista('proveedores')).toBeTrue();
    expect(page.datosSeccion('proveedores')).toBe(anterior);
    expect(page.estadoSeccion('proveedores').cargando).toBeFalse();
    expect(page.estadoSeccion('proveedores').error).toBeTruthy();
    api.mensualSeccion.and.returnValue(of(seccion('actualizada')));
    await page.cargarSeccion('proveedores', true);
    expect(page.datosSeccion('proveedores').detalle[0].nit).toBe('actualizada');
    expect(page.estadoSeccion('proveedores').error).toBeNull();
  });

  it('Aprobar todo recupera todas las páginas de esa sección, sin cargar otras', async () => {
    await page.cargar();
    (page as any).cambiarEstadoSeccion('proveedores', { busqueda: 'filtro visible', categoria: 'OTROS' });
    api.mensualSeccion.and.callFake((_empresa: number, _seccion: string, filtros: { page: number; size: number }) => of({
      ...seccion('', 201, filtros.page), totalPages: 3,
      detalle: Array.from({ length: filtros.page < 2 ? 100 : 1 }, (_, i) => seccion(String(filtros.page * 100 + i)).detalle[0]),
    }));
    const filas = await (page as any).detalleCompletoSeccion('proveedores');
    expect(filas.length).toBe(201); expect(filas[0].nit).toBe('0'); expect(filas[200].nit).toBe('200');
    expect(api.mensualSeccion.calls.allArgs()).toEqual([
      [51, 'proveedores', { page: 0, size: 100 }],
      [51, 'proveedores', { page: 1, size: 100 }],
      [51, 'proveedores', { page: 2, size: 100 }],
    ]);
    expect(api.mensual).toHaveBeenCalledTimes(1);
  });

  it('usa el detalle completo ya disponible para acciones de tabla sin repetir consultas', async () => {
    await page.cargar(); await page.cargarSeccion('proveedores');
    api.mensualSeccion.calls.reset();
    const filas = await (page as any).detalleCompletoSeccion('proveedores');
    expect(filas.length).toBe(1); expect(api.mensualSeccion).not.toHaveBeenCalled();
  });
});
