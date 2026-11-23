import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { PresupuestoPageComponent } from './presupuesto-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { DetalleTerceroMensual, Mensual } from '../../models/presupuesto.model';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { PresupuestoService } from '../../services/presupuesto.service';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';

describe('Sugeridos por selección de meses', () => {
  let page: PresupuestoPageComponent, ctx: PresupuestoContextService, api: any;
  const fila = (nit = '123', total = 369515830): DetalleTerceroMensual => ({
    nit, nombre: 'Tercero de prueba', categoria: 'OTROS', total, aFavor: false,
    valores: {'2026-03': 103497000, '2026-05': 207292937},
    pagoSugerido: 0, saldoPendiente: total, totalYaAprobado: 0, totalYaPagado: 0,
  });
  const actual = (sec = 'prestamos') => page.seccionTerceros(sec).detalle[0] as DetalleTerceroMensual;
  beforeEach(() => {
    // El componente inyecta servicios que dependen de HttpClient: la prueba
    // construye la página fuera de un módulo propio, así que se declaran aquí.
    TestBed.configureTestingModule({providers:[provideHttpClient(), provideHttpClientTesting()]});
    api = jasmine.createSpyObj('API', ['setPagoSugeridoProveedor', 'setPagoSugeridoCobro', 'setPagoSugeridoCategoria', 'mensual', 'previsualizarProveedor', 'previsualizarParcial', 'aprobarProveedorSugerido', 'previsualizarTerceroModulo', 'aprobarTerceroModulo', 'aprobarParcial']);
    api.setPagoSugeridoProveedor.and.callFake((_empresa: number, nit: string, pagoSugerido: number|null) => of({nit, pagoSugerido}));
    api.setPagoSugeridoCobro.and.callFake((_empresa: number, nit: string, pagoSugerido: number|null) => of({nit, pagoSugerido}));
    api.setPagoSugeridoCategoria.and.callFake((_empresa: number, categoria: string, pagoSugerido: number|null, notas: string|null) => of({categoria, pagoSugerido, notas}));
    ctx = new PresupuestoContextService(api);
    let empresa: number|null = null;
    ctx.empresaId = Object.assign(() => empresa, {set: (id: number|null) => {empresa = id;}}) as any;
    ctx.permisos.set({gerencia:true, superAdmin:false, puedeAprobar:true,
      permisos:['presupuesto.pago_sugerido_proveedor', 'presupuesto.pago_sugerido_categoria']});
    page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx, api, {} as any));
    const toast = TestBed.inject(PresupuestoToastService);
    if (!(toast.mostrar as jasmine.Spy).calls) {
      spyOn(toast, 'mostrar'); spyOn(toast, 'error');
    }
    TestBed.flushEffects(); ctx.empresaId.set(44);
    page.mensual.set({meses:['2026-03', '2026-05'],
      proveedores:{detalle:[fila('123', 400000000)], total:{}},
      prestamos:{detalle:[fila(), fila('456')], total:{}}, impuestosEstampillasSeguros:{detalle:[fila()], total:{}},
      cuentasCobrar:{detalle:[fila(), fila('456')], total:{}},
      anticipos:{detalle:[], total:{}}, pagosProyectados:{detalle:[], total:{}},
    } as unknown as Mensual);
    spyOn(page, 'cargar').and.resolveTo();
  });
  afterEach(() => { page.ngOnDestroy(); TestBed.resetTestingModule(); });

  it('suma todas las filas de la tabla y limpia la columna aunque exista un filtro', () => {
    const confirmacion = spyOn(window, 'confirm').and.returnValue(true);
    api.mensual.and.callFake(() => of(page.mensual()));
    spyOn(page, 'mesesVisibles').and.returnValue(['2026-03','2026-05']);
    page.filtroTerceros.set('No coincide');
    page.sugerirTabla('prestamos');
    expect(page.seccionTerceros('prestamos').detalle.map((f: DetalleTerceroMensual) => f.pagoSugerido)).toEqual([310789937,310789937]);
    expect(api.setPagoSugeridoProveedor).toHaveBeenCalledTimes(2);
    page.sugerirTabla('prestamos', true);
    expect(page.seccionTerceros('prestamos').detalle.map((f: DetalleTerceroMensual) => f.pagoSugerido)).toEqual([0,0]);
    expect(page.mesesSeleccionados('prestamos','123')).toEqual([]);
    expect(confirmacion).toHaveBeenCalledTimes(1);
    expect(api.setPagoSugeridoProveedor.calls.allArgs().slice(2).every((args: any[]) => args[3] === true)).toBeTrue();
  });

  it('cancelar la confirmación masiva conserva todos los sugeridos y no envía cambios', () => {
    actual().pagoSugerido = 100;
    const confirmacion = spyOn(window, 'confirm').and.returnValue(false);
    page.sugerirTabla('prestamos', true);
    expect(confirmacion).toHaveBeenCalledTimes(1);
    expect(actual().pagoSugerido).toBe(100);
    expect(api.setPagoSugeridoProveedor).not.toHaveBeenCalled();
  });

  it('un conflicto durante la limpieza confirmada no abre avisos por fila y recupera el valor', () => {
    actual().pagoSugerido = 100;
    const confirmacion = spyOn(window, 'confirm').and.returnValue(true);
    api.setPagoSugeridoProveedor.and.returnValue(throwError(() => ({status:409})));
    page.sugerirTabla('prestamos', true);
    expect(confirmacion).toHaveBeenCalledTimes(1);
    expect(api.setPagoSugeridoProveedor).toHaveBeenCalledWith(44,'123',0,true);
    expect(actual().pagoSugerido).toBe(100);
  });

  it('suma masiva con filas que bajan el Sugerido pregunta UNA vez y fuerza la cancelación sin avisos por fila', () => {
    spyOn(page, 'mesesVisibles').and.returnValue(['2026-03','2026-05']);
    actual().pagoSugerido = 400000000;
    page.seccionTerceros('prestamos').detalle[1].pagoSugerido = 350000000;
    const confirmacion = spyOn(window, 'confirm').and.returnValue(true);
    // Con el consentimiento único cada fila se fuerza directamente (forzar=true).
    api.setPagoSugeridoProveedor.and.returnValues(
      of({nit:'123', pagoSugerido:310789937}), of({nit:'456', pagoSugerido:310789937}));
    api.mensual.and.returnValue(of(page.mensual()));
    page.sugerirTabla('prestamos');
    expect(confirmacion).toHaveBeenCalledTimes(1);
    const llamadas = api.setPagoSugeridoProveedor.calls.allArgs();
    expect(llamadas.map((a: any[]) => [a[1], a[2], a[3]])).toEqual([
      ['123', 310789937, true], ['456', 310789937, true],
    ]);
  });

  it('rechazar la confirmación de la suma masiva omite solo las filas que bajan el Sugerido', () => {
    spyOn(page, 'mesesVisibles').and.returnValue(['2026-03','2026-05']);
    actual().pagoSugerido = 400000000; // fila 123 baja; fila 456 queda en 0
    const confirmacion = spyOn(window, 'confirm').and.returnValue(false);
    page.sugerirTabla('prestamos');
    expect(confirmacion).toHaveBeenCalledTimes(1);
    expect(api.setPagoSugeridoProveedor.calls.allArgs().map((a: any[]) => a[1])).toEqual(['456']);
  });

  it('permite sumar una fila sin modificar las otras y conserva la fila si falla el guardado', () => {
    spyOn(page, 'mesesVisibles').and.returnValue(['2026-03','2026-05']);
    page.sugerirFilaCompleta('prestamos', actual());
    expect(page.seccionTerceros('prestamos').detalle[1].pagoSugerido).toBe(0);
    api.setPagoSugeridoProveedor.and.returnValue(throwError(() => ({error:{message:'Sin conexión'}})));
    page.sugerirFilaCompleta('prestamos', actual(), true);
    expect(actual().pagoSugerido).toBe(310789937);
    expect(page.erroresSugeridos()['123']).toContain('Sin conexión');
  });

  it('ejecuta acciones masivas en cuentas por cobrar y las bloquea en histórico', () => {
    spyOn(page, 'mesesVisibles').and.returnValue(['2026-03','2026-05']);
    page.sugerirTabla('cuentasCobrar');
    // CxC guarda en el proceso de COBROS: nunca llama al de egresos.
    expect(api.setPagoSugeridoCobro).toHaveBeenCalledTimes(2);
    expect(api.setPagoSugeridoProveedor).not.toHaveBeenCalled();
    expect(page.seccionTerceros('cuentasCobrar').detalle.map((f: DetalleTerceroMensual) => f.pagoSugerido)).toEqual([310789937,310789937]);
    api.setPagoSugeridoCobro.calls.reset();
    page.modoHistorico = true;
    page.sugerirTabla('cuentasCobrar');
    expect(api.setPagoSugeridoCobro).not.toHaveBeenCalled();
  });

  const preview = (nit: string, total: number, comprobantes: string[]): any => ({
    nit, nombre: 'Tercero de prueba', sugerido: 100, saldoPendiente: Math.max(0, 100 - total),
    totalAprobar: total, primeraFacturaOmitida: null,
    facturas: comprobantes.map((c, i) => ({ movimientoid: i + 1, nombre: 'Tercero', comprobante: c, monto: Math.round(total / comprobantes.length) })),
  });

  it('Aprobar todo: UN solo modal y UN solo mensaje para todo el lote', async () => {
    actual().pagoSugerido = 100;
    page.seccionTerceros('prestamos').detalle[1].pagoSugerido = 50;
    api.previsualizarProveedor.and.callFake((_e: number, nit: string) => of(nit === '123'
      ? preview('123', 100, ['F-1'])
      : preview('456', 60, ['F-2A', 'F-2B'])));
    api.aprobarProveedorSugerido.and.callFake((_e: number, nit: string) => of({
      nit, totalAprobado: nit === '123' ? 100 : 60, facturasAprobadas: nit === '123' ? 1 : 2, primeraFacturaOmitida: null }));
    await page.previsualizarAprobacionTabla('prestamos');
    // Un solo lote con los pagos de TODOS los terceros ordenados por NIT.
    expect(page.aprobacionTabla()?.filasFacturas.map((f: any) => f.nit)).toEqual(['123', '456']);
    expect(page.totalFacturasTabla()).toBe(3);
    const confirmacion = spyOn(window, 'confirm');
    const toast = TestBed.inject(PresupuestoToastService) as any;
    await page.confirmarAprobacionTabla();
    expect(api.aprobarProveedorSugerido.calls.argsFor(0)[1]).toBe('123');
    expect(api.aprobarProveedorSugerido.calls.argsFor(1)[1]).toBe('456');
    // Un único mensaje de cierre en el toast; ninguna confirmación por pago.
    expect(toast.mostrar).toHaveBeenCalledTimes(1);
    expect((toast.mostrar as jasmine.Spy).calls.mostRecent().args[0]).toContain('3 pagos');
    expect(confirmacion).not.toHaveBeenCalled();
    expect(page.aprobacionTabla()).toBeNull();
  });

  it('Aprobar todo sin sugeridos o sin facturas pendientes no abre el lote', async () => {
    const toast = TestBed.inject(PresupuestoToastService) as any;
    await page.previsualizarAprobacionTabla('prestamos');
    expect((toast.error as jasmine.Spy)).toHaveBeenCalledWith('No hay Pago Sugerido en esta tabla.');
    actual().pagoSugerido = 100;
    api.previsualizarProveedor.and.returnValue(of(preview('123', 0, [])));
    await page.previsualizarAprobacionTabla('prestamos');
    expect((toast.error as jasmine.Spy)).toHaveBeenCalledWith('No hay facturas pendientes por aprobar en esta tabla.');
    expect(page.aprobacionTabla()).toBeNull();
    expect(api.aprobarProveedorSugerido).not.toHaveBeenCalled();
  });

  it('Cuentas por Cobrar reparte el Saldo Sugerido en parciales (individual)', async () => {
    expect(page.aprobacionSugeridoCol('cuentasCobrar')).toBeTrue();
    expect(page.aprobacionSaldoCol('cuentasCobrar')).toBeTrue();
    actual('cuentasCobrar').pagoSugerido = 100;
    expect(page.deshabilitarAprobarFila('cuentasCobrar', actual('cuentasCobrar'), 'sugerido')).toBeFalse();
    // Como Otras Cuentas por Pagar: la factura de 8.818.200 no cabe entera
    // en el cupo de 100 — antes no aprobaba nada; ahora aprueba un parcial
    // de 100 repartido sobre la más antigua.
    const parcial = { ...preview('123', 8818200, ['C-1']), permiteParcial: true };
    parcial.facturas = parcial.facturas.map((f: any, i: number) => ({ ...f, movimientoId: i + 1, saldoPendiente: 8818200 }));
    api.previsualizarParcial.and.returnValue(of(parcial));
    await page.previsualizarAprobacionFila('cuentasCobrar', actual('cuentasCobrar'), 'sugerido');
    expect(api.previsualizarParcial).toHaveBeenCalledWith(44, 'cx_cobrar', '123');
    expect(api.previsualizarProveedor).not.toHaveBeenCalled();
    expect(page.previewModulo()).toBe('cx_cobrar');
    expect(page.previewCupoSugerido()).toBeTrue();
    expect(page.preview()?.facturas[0].montoAprobar).toBe(100);
    expect(page.preview()?.totalAprobar).toBe(100);
    // El cupo que SÍ cubre la factura completa la aprueba entera (el decimal
    // del cupo no deja centavos por fuera cuando alcanza).
    actual('cuentasCobrar').pagoSugerido = 9000000;
    await page.previsualizarAprobacionFila('cuentasCobrar', actual('cuentasCobrar'), 'sugerido');
    expect(page.preview()?.facturas[0].montoAprobar).toBe(8818200);
    expect(page.preview()?.totalAprobar).toBe(8818200);
    spyOn(window, 'alert');
    api.aprobarParcial.and.returnValue(of({totalAprobado: 8818200, facturasAprobadas: 1, error: null}));
    await page.confirmarAprobacionSugerido();
    expect(api.aprobarParcial).toHaveBeenCalledWith(44, 'cx_cobrar', '123', [{ movimiento_id: 1, monto: 8818200 }]);
  });

  it('el escudo del Total en Cuentas por Cobrar conserva la aprobación por saldo', async () => {
    api.previsualizarTerceroModulo.and.returnValue(of(preview('123', 50, ['C-9'])));
    await page.previsualizarAprobacionFila('cuentasCobrar', actual('cuentasCobrar'), 'saldo');
    expect(api.previsualizarTerceroModulo).toHaveBeenCalledWith(44, 'cx_cobrar', '123');
    expect(page.previewModulo()).toBe('cx_cobrar');
  });

  it('Aprobar todo del Sugerido en Cuentas por Cobrar reparte el cupo por tercero', async () => {
    actual('cuentasCobrar').pagoSugerido = 100;
    api.previsualizarParcial.and.callFake((_e: number, _m: string, nit: string) => of({
      ...preview(nit, 8818200, ['C-' + nit]), permiteParcial: true }));
    await page.previsualizarAprobacionTabla('cuentasCobrar', 'sugerido');
    expect(api.previsualizarParcial).toHaveBeenCalledWith(44, 'cx_cobrar', '123');
    expect(api.previsualizarProveedor).not.toHaveBeenCalled();
    expect(page.aprobacionTabla()?.moduloBd).toBe('proveedores');
    expect(page.aprobacionTabla()?.moduloAprobar).toBe('cx_cobrar');
    expect(page.aprobacionTabla()?.filasFacturas.map((f: any) => f.nit)).toEqual(['123']);
    expect(page.aprobacionTabla()?.filasFacturas[0].facturas[0].montoAprobar).toBe(100);
    api.aprobarParcial.and.returnValue(of({totalAprobado: 100, facturasAprobadas: 1, error: null}));
    await page.confirmarAprobacionTabla();
    expect(api.aprobarParcial).toHaveBeenCalledWith(44, 'cx_cobrar', '123', [jasmine.objectContaining({ monto: 100 })]);
  });

  it('Aprobar todo del Total en Cuentas por Cobrar conserva el lote por saldo', async () => {
    api.previsualizarTerceroModulo.and.callFake((_e: number, _m: string, nit: string) => of(preview(nit, 20, ['C-' + nit])));
    await page.previsualizarAprobacionTabla('cuentasCobrar', 'saldo');
    expect(api.previsualizarProveedor).not.toHaveBeenCalled();
    expect(page.aprobacionTabla()?.moduloBd).toBe('cx_cobrar');
    expect(page.aprobacionTabla()?.filasFacturas.map((f: any) => f.nit)).toEqual(['123','456']);
  });

  it('Anticipos no tiene flujo de aprobación (ni saldo ni sugerido)', () => {
    expect(page.aprobacionSaldoCol('anticipos')).toBeFalse();
    expect(page.aprobacionSugeridoCol('anticipos')).toBeFalse();
    expect(page.apmovSeccion('anticipos')).toBeNull();
  });

  it('Otras Cuentas por Pagar aprueba el saldo sugerido (individual y masivo) con pagos parciales', async () => {
    expect(page.aprobacionSaldoCol('prestamos')).toBeTrue();
    actual('prestamos').pagoSugerido = 100;
    // Individual: el escudo del Sugerido reparte el cupo (100) sobre la
    // factura de 450M — se aprueba un pago parcial, no el total.
    const parcial = { ...preview('123', 450000000, ['CC-12-20260015']), permiteParcial: true };
    api.previsualizarTerceroModulo.and.returnValue(of(parcial));
    await page.previsualizarAprobacionFila('prestamos', actual('prestamos'), 'sugerido');
    expect(api.previsualizarTerceroModulo).toHaveBeenCalledWith(44, 'cx_pagar', '123');
    expect(api.previsualizarProveedor).not.toHaveBeenCalled();
    expect(page.previewModulo()).toBe('cx_pagar');
    expect(page.preview()?.permiteParcial).toBeTrue();
    expect(page.preview()?.facturas[0].montoAprobar).toBe(100);
    expect(page.preview()?.totalAprobar).toBe(100);
    expect(page.previewCupoSugerido()).toBeTrue();
    // El escudo del Total aprueba el saldo completo (sin reparto por cupo).
    api.previsualizarTerceroModulo.and.returnValue(of({ ...preview('123', 450000000, ['CC-12-20260015']), permiteParcial: true }));
    await page.previsualizarAprobacionFila('prestamos', actual('prestamos'), 'saldo');
    expect(page.previewCupoSugerido()).toBeFalse();
    expect(page.preview()?.facturas[0].montoAprobar).toBeUndefined();
    // Masivo del Sugerido: lote con el cupo repartido por tercero.
    api.previsualizarTerceroModulo.calls.reset();
    api.previsualizarTerceroModulo.and.callFake((_e: number, _m: string, nit: string) => of({ ...preview(nit, 450000000, ['CC-1']), permiteParcial: true }));
    await page.previsualizarAprobacionTabla('prestamos', 'sugerido');
    expect(api.previsualizarTerceroModulo).toHaveBeenCalledWith(44, 'cx_pagar', '123');
    expect(page.aprobacionTabla()?.moduloBd).toBe('cx_pagar');
    expect(page.aprobacionTabla()?.filasFacturas[0].facturas[0].montoAprobar).toBe(100);
    api.aprobarParcial.and.returnValue(of({totalAprobado: 100, facturasAprobadas: 1, error: null}));
    await page.confirmarAprobacionTabla();
    expect(api.aprobarParcial).toHaveBeenCalledWith(44, 'cx_pagar', '123', jasmine.any(Array));
  });

  it('suma marzo y mayo del ejemplo, resta las etiquetas y termina en cero sin recargar', () => {
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    page.alternarMesSugerido('prestamos', actual(), '2026-05');
    expect(actual().pagoSugerido).toBe(310789937);
    expect(actual().saldoPendiente).toBe(58725893);
    expect(page.mesesSeleccionados('prestamos', '123')).toEqual(['2026-03', '2026-05']);
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    expect(actual().pagoSugerido).toBe(207292937);
    page.alternarMesSugerido('prestamos', actual(), '2026-05');
    expect(actual().pagoSugerido).toBe(0);
    expect(page.mesesSeleccionados('prestamos', '123')).toEqual([]);
    expect(api.setPagoSugeridoProveedor.calls.allArgs().map((a: any[]) => a[2])).toEqual([103497000, 310789937, 207292937, 0]);
    expect(page.cargar).not.toHaveBeenCalled();
    expect(api.mensual).not.toHaveBeenCalled();
  });
  for (const seccion of ['proveedores', 'prestamos', 'impuestos', 'prestamos']) {
    it('permite seleccionar meses en ' + seccion, () => {
      page.alternarMesSugerido(seccion, actual(seccion), '2026-03');
      expect(actual(seccion).pagoSugerido).toBe(103497000);
      expect(page.mesesSeleccionados(seccion, '123')).toEqual(['2026-03']);
    });
  }
  it('sincroniza el sugerido del NIT solo dentro de su proceso y no toca Cuentas por Cobrar', () => {
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    expect(actual('proveedores').saldoPendiente).toBe(296503000);
    expect(page.seccionTerceros('prestamos').detalle[1].pagoSugerido).toBe(0);
    page.alternarMesSugerido('proveedores', actual('proveedores'), '2026-05');
    expect(page.mesesSeleccionados('prestamos', '123')).toEqual([]);
    expect(page.mesesSeleccionados('proveedores', '123')).toEqual(['2026-05']);
    // Procesos separados: el sugerido de egresos no se refleja en CxC
    // (ni su valor ni su saldo pendiente).
    expect(page.seccionTerceros('cuentasCobrar').detalle[0].pagoSugerido).toBe(0);
    expect(page.seccionTerceros('cuentasCobrar').detalle[0].saldoPendiente).toBe(369515830);
    expect(page.seccionTerceros('cuentasCobrar').detalle[1].pagoSugerido).toBe(0);
    expect(page.puedeSugerir('cuentasCobrar')).toBeTrue();
    expect(page.puedeEditarSugerido('cuentasCobrar')).toBeTrue();
  });
  it('editar el saldo sugerido de Cuentas por Cobrar no toca las secciones de egresos', () => {
    page.guardarPagoSugeridoProveedor(actual('cuentasCobrar'), 45000000, 'cuentasCobrar');
    expect(api.setPagoSugeridoCobro).toHaveBeenCalledWith(44, '123', 45000000, false);
    expect(api.setPagoSugeridoProveedor).not.toHaveBeenCalled();
    expect(page.seccionTerceros('cuentasCobrar').detalle[0].pagoSugerido).toBe(45000000);
    expect(page.seccionTerceros('cuentasCobrar').detalle[0].saldoPendiente).toBe(324515830);
    // Egresos intactos: ni valor sugerido ni saldo pendiente cambian.
    expect(page.seccionTerceros('prestamos').detalle[0].pagoSugerido).toBe(0);
    expect(page.seccionTerceros('proveedores').detalle[0].pagoSugerido).toBe(0);
    expect(actual('prestamos').saldoPendiente).toBe(369515830);
  });
  it('editar manualmente reemplaza la suma y retira las etiquetas', () => {
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    page.guardarPagoSugeridoProveedor(actual(), 500);
    expect(actual().pagoSugerido).toBe(500);
    expect(page.mesesSeleccionados('prestamos', '123')).toEqual([]);
  });
  it('no guarda valores iguales ni permite meses inexistentes, vacíos o sin permiso', () => {
    page.guardarPagoSugeridoProveedor(actual(), 0);
    page.alternarMesSugerido('prestamos', actual(), '2026-02');
    page.alternarMesSugerido('anticipos', actual(), '2026-03');
    ctx.permisos.set({gerencia:false, superAdmin:false, puedeAprobar:false, permisos:[]});
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    page.guardarPagoSugeridoProveedor(actual(), 100);
    expect(api.setPagoSugeridoProveedor).not.toHaveBeenCalled();
  });
  it('conserva centavos sin acumular errores de coma flotante', () => {
    actual().valores = {'2026-03':0.1, '2026-05':0.2};
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    page.alternarMesSugerido('prestamos', actual(), '2026-05');
    expect(actual().pagoSugerido).toBe(0.3);
  });
  it('un fallo de escritura restaura importe, saldo y etiquetas sin perder el filtro', () => {
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    page.filtroTerceros.set('Tercero de prueba');
    api.setPagoSugeridoProveedor.and.returnValue(throwError(() => ({error:{message:'Sin conexión'}})));
    page.alternarMesSugerido('prestamos', actual(), '2026-05');
    expect(actual().pagoSugerido).toBe(103497000);
    expect(actual().saldoPendiente).toBe(266018830);
    expect(page.mesesSeleccionados('prestamos', '123')).toEqual(['2026-03']);
    expect(page.erroresSugeridos()['123']).toContain('Sin conexión');
    expect(page.guardandoSugeridos()['123']).toBeFalse();
    expect(page.filtroTerceros()).toBe('Tercero de prueba');
    expect(page.cargar).not.toHaveBeenCalled();
  });
  it('cancelar la confirmación mantiene el sugerido aprobado, sin una segunda escritura', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    actual().pagoSugerido = 310789937;
    api.setPagoSugeridoProveedor.and.returnValue(throwError(() => ({status:409})));
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    expect(actual().pagoSugerido).toBe(310789937);
    expect(api.setPagoSugeridoProveedor).toHaveBeenCalledTimes(1);
    expect(page.mesesSeleccionados('prestamos', '123')).toEqual([]);
  });
  it('si falla la cancelación forzada restaura también las etiquetas', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    actual().pagoSugerido = 310789937;
    api.setPagoSugeridoProveedor.and.returnValues(throwError(() => ({status:409})), throwError(() => ({error:{message:'No permitido'}})));
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    expect(api.setPagoSugeridoProveedor.calls.mostRecent().args[3]).toBeTrue();
    expect(actual().pagoSugerido).toBe(310789937);
    expect(page.guardandoSugeridos()['123']).toBeFalse();
    expect(page.erroresSugeridos()['123']).toBe('No permitido');
  });
  it('impide escrituras simultáneas del mismo NIT y descarta respuestas de otra empresa', () => {
    const respuesta = new Subject<any>(); api.setPagoSugeridoProveedor.and.returnValue(respuesta);
    page.alternarMesSugerido('prestamos', actual(), '2026-03');
    page.alternarMesSugerido('prestamos', actual(), '2026-05');
    expect(api.setPagoSugeridoProveedor).toHaveBeenCalledTimes(1);
    ctx.empresaId.set(45); page.mensual.set({prestamos:{detalle:[fila()]}} as any);
    respuesta.next({pagoSugerido:103497000});
    expect(actual().pagoSugerido).toBe(0);
  });
  it('notas sin cambios no guardan y editar categoría conserva los totales sin recargar', () => {
    const categoria = {categoria:'OTROS', pagoSugerido:10, notas:'Nota', proveedores:200, total:200} as any;
    page.consolidado.set([categoria]);
    page.setNotasCategoria(categoria, 'Nota'); page.setPagoSugeridoCategoria(categoria, 10);
    expect(api.setPagoSugeridoCategoria).not.toHaveBeenCalled();
    page.setPagoSugeridoCategoria(categoria, 20);
    expect(page.consolidado()[0].pagoSugerido).toBe(20);
    expect(page.consolidado()[0].total).toBe(200);
    expect(page.cargar).not.toHaveBeenCalled();
  });
});

describe('Tabla de presupuesto: interacción con meses y celdas reales', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('al visitar las secciones muestra todos los meses, conserva el sugerido y aprueba desde la barra de estado', async () => {
    const api = jasmine.createSpyObj('API', ['setPagoSugeridoProveedor', 'mensual', 'mensualSeccion', 'categorias', 'categoriasHistoricas','aprobar']);
    api.categorias.and.returnValue(of([])); api.categoriasHistoricas.and.returnValue(of([]));
    const ctx = new PresupuestoContextService(api);
    ctx.empresas.set([{id:44, nombre:'Empresa de prueba'}] as any);ctx.periodo.set('2026-08');
    let empresa: number|null = null;
    ctx.empresaId = Object.assign(() => empresa, {set: (id:number|null) => {empresa=id;}}) as any;
    ctx.permisos.set({gerencia:true, superAdmin:false, puedeAprobar:false,
      permisos:['presupuesto.pago_sugerido_proveedor']});
    TestBed.configureTestingModule({
      imports: [PresupuestoPageComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        {provide: PresupuestoContextService, useValue: ctx},
        {provide: PresupuestoService, useValue: api},
        {provide: AuthorizationService, useValue: {hasAnyRole: () => false}},
      ],
    });
    const servicioReal = new PresupuestoService(TestBed.inject(HttpClient), {} as any, { estado: () => ({ nombre: 'Gerente' }) } as any);
    api.setPagoSugeridoProveedor.and.callFake((empresa: number, nit: string, pagoSugerido: number, forzar: boolean) =>
      servicioReal.setPagoSugeridoProveedor(empresa, nit, pagoSugerido, forzar));
    api.aprobar.and.callFake((empresa:number)=>servicioReal.aprobar(empresa));
    // La aprobación global recarga el consolidado: el mock responde la forma mínima.
    api.mensual.and.returnValue(of({
      meses:['2026-08','2026-09'], filasContrato:[], filasFlujoCaja:[], filasNomina:[], filasEstampillas:[],
      proveedores:{detalle:[],total:{}}, prestamos:{detalle:[],total:{}}, anticipos:{detalle:[],total:{}},
      impuestosEstampillasSeguros:{detalle:[],total:{}}, cuentasCobrar:{detalle:[],total:{}},
      provisiones:{detalle:[],total:{}}, pagosProyectados:{detalle:[],total:{}}, cobrosProyectados:{detalle:[],total:{}},
      notas:{}, nominaAprobada:{}, resumenAprobados:{},
    } as any));
    const http = TestBed.inject(HttpTestingController);
    const confirmar = (valor: number) => {
      const peticion = http.expectOne('/api/gp/presupuesto/proveedores/123/pago-sugerido');
      expect(peticion.request.method).toBe('PUT');
      expect(peticion.request.body.pago_sugerido).toBe(valor);
      peticion.flush({nit:'123', pago_sugerido:valor});
      fixture.detectChanges();
    };
    const fixture = TestBed.createComponent(PresupuestoPageComponent);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    ctx.empresaId.set(44);
    const datos: DetalleTerceroMensual = {nit:'123', nombre:'Cliente de prueba', categoria:'OTROS',
      total:74254170, aFavor:false, valores:{'2026-08':1873485, '2026-09':72380685},
      pagoSugerido:0, saldoPendiente:74254170, totalYaAprobado:0, totalYaPagado:0};
    const vacia = {detalle:[], total:{}};
    page.contrato.set({fechaInicial:'2026-08-01', fechaFinal:'2026-09-30', valorInicialContrato:1} as any);
    page.mensual.set({meses:['2026-08', '2026-09'], filasContrato:[], filasFlujoCaja:[], filasNomina:[], filasEstampillas:[],
      proveedores:{detalle:[datos], total:datos.valores}, prestamos:vacia, anticipos:vacia, impuestosEstampillasSeguros:vacia,
      cuentasCobrar:vacia, provisiones:vacia, pagosProyectados:vacia,
      notas:{}, nominaAprobada:{}, contrato:page.contrato()!,
    });
    expect(api.mensualSeccion).not.toHaveBeenCalled();
    api.mensualSeccion.and.callFake((_empresa: number, seccion: string) => of((page.mensual() as any)?.[seccion] ?? vacia));
    // Simula la llegada a cada panel: la directiva de visibilidad se prueba
    // por separado, y aquí se verifican celdas y escrituras de tablas reales.
    for (const id of ['proveedores', 'prestamos', 'impuestos', 'cuentasCobrar', 'anticipos', 'provisiones', 'pagos', 'cobros']) {
      await page.cargarSeccion(id);
    }
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    for(const id of ['contrato','flujo','nomina','proveedores','prestamos','impuestos','provisiones','cuentasCobrar','anticipos','pagos']) {
      expect(host.querySelector('#gp-seccion-'+id+' table')).withContext('Tabla de '+id).not.toBeNull();
    }
    expect(api.mensualSeccion).toHaveBeenCalledTimes(8);
    const botones = host.querySelectorAll<HTMLButtonElement>('.gp-mes-sugerido');
    expect(botones.length).toBe(2);
    expect(page.columnasVisibles('proveedores')).toEqual(['2026-08','2026-09']);
    botones[0].click(); fixture.detectChanges();
    confirmar(1873485);
    const input = host.querySelector<HTMLInputElement>('app-gp-celda-monto input')!;
    expect(input.value.replace(/\D/g, '')).toBe('1873485');
    input.dispatchEvent(new Event('focus'));fixture.detectChanges();
    input.dispatchEvent(new Event('blur'));fixture.detectChanges();
    expect(api.setPagoSugeridoProveedor).toHaveBeenCalledTimes(1);
    expect(api.mensual).not.toHaveBeenCalled();
    botones[0].querySelector<HTMLElement>('.gp-mes-quitar')!.click();fixture.detectChanges();
    confirmar(0);
    expect(input.value.replace(/\D/g, '')).toBe('0');
    expect(host.querySelectorAll('.gp-mes-quitar').length).toBe(0);
    ctx.periodo.set('2026-09');fixture.detectChanges();
    expect(page.columnasVisibles('proveedores')).toEqual(['2026-08','2026-09']);
    spyOn(page,'cargar').and.resolveTo();
    ctx.permisos.set({gerencia:true,superAdmin:false,puedeAprobar:true,rolGp:'gerente',permisos:['presupuesto.aprobar','presupuesto.pago_sugerido_proveedor']});
    fixture.detectChanges();
    // El botón de la barra de estado aprueba el presupuesto completo (global).
    const aprobar=Array.from(host.querySelector('[data-compare-slot="3"]')!.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()==='Aprobar')!;
    aprobar.click();fixture.detectChanges();
    const aprobacion=http.expectOne(r=>r.url==='/api/gp/presupuesto/aprobar');
    expect(aprobacion.request.method).toBe('PUT');expect(aprobacion.request.params.get('empresaId')).toBe('44');
    aprobacion.flush({estado_aprobacion:'aprobado',aprobado_por:'Gerente'});
    fixture.detectChanges();
    expect(page.estadoAprobacion().tipo).toBe('aprobado');
    http.verify();
    fixture.destroy();
  });
});
