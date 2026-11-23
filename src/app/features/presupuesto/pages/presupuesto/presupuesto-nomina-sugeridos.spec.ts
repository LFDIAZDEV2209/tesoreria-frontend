import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject, throwError } from 'rxjs';
import { PresupuestoPageComponent } from './presupuesto-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { FilaNomina, Mensual } from '../../models/presupuesto.model';
import { mapMensual } from '../../services/gp-mapper';

describe('Sugeridos de nómina', () => {
  let page: PresupuestoPageComponent, ctx: PresupuestoContextService, api: any;
  const actual = () => page.mensual()!.filasNomina[0];
  beforeEach(() => {
    // El page inyecta GpAnticipoLegalizacionService: el TestBed necesita HttpClient.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = jasmine.createSpyObj('API', ['setSugeridoNomina', 'mensual']);
    api.setSugeridoNomina.and.callFake((_empresa: number, _campo: string, pagoSugerido: number, mesesSeleccionados: string[] | null) => of({pagoSugerido, mesesSeleccionados}));
    ctx = new PresupuestoContextService(api);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, {set: (id: number | null) => empresa = id}) as any;
    ctx.permisos.set({gerencia:true, superAdmin:false, puedeAprobar:true, permisos:['presupuesto.pago_sugerido_nomina']});
    page = TestBed.runInInjectionContext(() => new PresupuestoPageComponent(ctx, api, {} as any));
    TestBed.flushEffects(); ctx.empresaId.set(44);
    const fila: FilaNomina = {concepto:'Nómina administrativa', campo:'nomina_admon', total:600.6,
      aprobados:{'2026-03':true,'2026-05':true,'2026-06':true}, valores:{'2026-03':100.1,'2026-05':200.2,'2026-06':300.3},pagoSugerido:0,saldoPendiente:600.6};
    page.mensual.set({meses:['2026-03','2026-05','2026-06'],filasNomina:[fila,
      {...fila,concepto:'Planilla',campo:'planilla_seguridad_social',total:20,saldoPendiente:20,valores:{'2026-03':20}},
      {concepto:'Beneficio a Empleados (Total Nómina)',total:620.6,valores:{},pagoSugerido:0,saldoPendiente:620.6},
    ]} as Mensual);
    spyOn(page,'cargar').and.resolveTo();
  });
  afterEach(() => {page.ngOnDestroy(); TestBed.resetTestingModule();});
  it('excluye pagados o no aprobados y permite limpiar la selección', () => {
    actual().aprobados!['2026-06']=false;
    spyOn(page,'mesesVisibles').and.returnValue(['2026-03','2026-05','2026-06']);
    page.sugerirTablaNomina();
    expect(actual().pagoSugerido).toBe(300.3);
    page.alternarMesNomina(actual(),'2026-06');
    expect(actual().pagoSugerido).toBe(300.3);
    page.sugerirTablaNomina(true);
    expect(actual().pagoSugerido).toBe(0);
    expect(page.mesesNomina(actual())).toEqual([]);
  });
  it('suma y limpia toda la nómina sin enviar la fila de total como concepto', () => {
    spyOn(page,'mesesVisibles').and.returnValue(['2026-03','2026-05','2026-06']);
    page.sugerirTablaNomina();
    expect(actual().pagoSugerido).toBe(600.6);
    expect(page.mensual()!.filasNomina[2].pagoSugerido).toBe(620.6);
    expect(api.setSugeridoNomina).toHaveBeenCalledTimes(2);
    page.sugerirTablaNomina(true);
    expect(page.mensual()!.filasNomina.every(f => f.pagoSugerido === 0)).toBeTrue();
  });
  it('suma únicamente marzo y mayo, permite quitar ambos y actualiza el total sin recargar', () => {
    page.alternarMesNomina(actual(),'2026-05');
    page.alternarMesNomina(actual(),'2026-03');
    expect(actual().pagoSugerido).toBe(300.3);
    expect(actual().saldoPendiente).toBe(300.3);
    expect(page.mesesNomina(actual())).toEqual(['2026-03','2026-05']);
    expect(page.mensual()!.filasNomina[2].saldoPendiente).toBe(320.3);
    expect(page.mensual()!.filasNomina[1].pagoSugerido).toBe(0);
    page.alternarMesNomina(actual(),'2026-03');
    expect(actual().pagoSugerido).toBe(200.2);
    page.alternarMesNomina(actual(),'2026-05');
    expect(actual().pagoSugerido).toBe(0);
    expect(actual().saldoPendiente).toBe(600.6);
    expect(page.cargar).not.toHaveBeenCalled();expect(api.mensual).not.toHaveBeenCalled();
  });
  it('rechaza el importe manual y conserva los meses y el importe calculado', () => {
    page.alternarMesNomina(actual(),'2026-03');
    page.guardarSugeridoNomina(actual(),50);
    expect(actual().pagoSugerido).toBe(100.1);
    expect(actual().saldoPendiente).toBe(500.5);
    expect(page.mesesNomina(actual())).toEqual(['2026-03']);
    expect(api.setSugeridoNomina).toHaveBeenCalledTimes(1);
  });
  it('si falla el guardado restaura el importe, la selección y los totales', () => {
    page.alternarMesNomina(actual(),'2026-03');
    api.setSugeridoNomina.and.returnValue(throwError(() => ({error:{message:'Sin conexión'}})));
    page.alternarMesNomina(actual(),'2026-05');
    expect(actual().pagoSugerido).toBe(100.1);
    expect(actual().saldoPendiente).toBe(500.5);
    expect(page.mesesNomina(actual())).toEqual(['2026-03']);
    expect(page.guardandoNomina()['nomina_admon']).toBeFalse();
    expect(page.erroresNomina()['nomina_admon']).toContain('Sin conexión');
  });
  it('ignora respuestas de otra empresa y bloquea doble guardado simultáneo', () => {
    const respuesta = new Subject<any>();api.setSugeridoNomina.and.returnValue(respuesta);
    page.alternarMesNomina(actual(),'2026-03');page.alternarMesNomina(actual(),'2026-05');
    expect(api.setSugeridoNomina).toHaveBeenCalledTimes(1);
    ctx.empresaId.set(45);page.mensual.set(null);
    respuesta.next({pagoSugerido:100.1,mesesSeleccionados:['2026-03']});
    expect(page.mensual()).toBeNull();
  });
  it('no permite seleccionar la fila total ni escribir en un histórico o sin permiso', () => {
    page.alternarMesNomina(page.mensual()!.filasNomina[2],'2026-03');
    page.modoHistorico=true;page.alternarMesNomina(actual(),'2026-03');
    page.modoHistorico=false;ctx.permisos.set({gerencia:false,superAdmin:false,puedeAprobar:false,permisos:[]});
    page.guardarSugeridoNomina(actual(),10);
    expect(api.setSugeridoNomina).not.toHaveBeenCalled();
  });
  it('recupera la suma y meses del backend, y acepta históricos anteriores sin estas columnas', () => {
    const filas=mapMensual({filas_nomina:[{campo:'nomina_admon',total:600.6,pago_sugerido:300.3,saldo_pendiente:300.3,meses_seleccionados:['2026-03','2026-05']},{total:20}]}).filasNomina;
    expect(filas[0].pagoSugerido).toBe(300.3);expect(page.mesesNomina(filas[0])).toEqual(['2026-03','2026-05']);
    expect(filas[1].pagoSugerido).toBe(0);expect(filas[1].saldoPendiente).toBe(20);
  });
});
