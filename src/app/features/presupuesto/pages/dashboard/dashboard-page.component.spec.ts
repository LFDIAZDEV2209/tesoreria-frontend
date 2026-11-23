import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

describe('Consolidado del dashboard', () => {
  let api: any;
  let ctx: PresupuestoContextService;
  let page: DashboardPageComponent;
  beforeEach(() => {
    api = jasmine.createSpyObj('API', ['mensual', 'resumenPagos', 'consolidado', 'detalleConsolidado', 'pagos']);
    api.mensual.and.returnValue(of({contrato:{},meses:[]}));
    api.resumenPagos.and.returnValue(of({}));
    api.consolidado.and.returnValue(of([]));
    api.detalleConsolidado.and.returnValue(of({content:[],totalPages:0}));
    api.pagos.and.returnValue(of({content:[],totalPages:0}));
    ctx = new PresupuestoContextService(api);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, {set: (id: number | null) => {empresa=id;}}) as any;
    page = TestBed.runInInjectionContext(() => new DashboardPageComponent(ctx, api));
    TestBed.flushEffects(); ctx.empresaId.set(35);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('mapea CxP y CxC sin perder saldo ni alterar signos del consolidado', () => {
    page.consolidado.set([{categoria:'A',proveedores:-20,anticipos:5,cxPagar:-10,cxCobrar:8,impuestos:4,total:-17}] as any);
    expect(page.saldoModuloTxt('cx_pagar')).toBe(10);
    expect(page.saldoModuloTxt('cx_cobrar')).toBe(8);
    expect(page.saldoModuloTxt('proveedores')).toBe(20);
    expect(page.consolidado()[0].total).toBe(-17);
  });
  it('considera los terceros de páginas posteriores al ordenar alertas', async () => {
    const rows = Array.from({length:201},(_,i)=>({nit:String(i),total:i===200?-100000:1}));
    api.detalleConsolidado.and.callFake((_e: number,f: any) =>
      of({content:rows.slice(f.page*200,(f.page+1)*200),totalPages:2}));
    api.pagos.and.callFake((_e: number,f: any) =>
      of({content:rows.slice(f.page*200,(f.page+1)*200).map((_,i)=>({id:f.page*200+i})),totalPages:2}));
    await page.cargar();
    expect(page.detalle().length).toBe(201);
    expect(page.pagos().length).toBe(201);
    expect(page.topAlertas()[0].nit).toBe('200');
  });
  it('vacía datos al perder acceso a la empresa', async () => {
    await page.cargar(); expect(page.mensual()).not.toBeNull();
    ctx.empresaId.set(null); await page.cargar();
    expect(page.mensual()).toBeNull();
    expect(page.detalle()).toEqual([]);
    expect(page.loading()).toBeFalse();
  });
  it('una consulta anterior no pisa una recarga más reciente de la misma empresa', async () => {
    const antigua = new Subject<any>();
    api.consolidado.and.returnValue(antigua);
    const pendiente=page.cargar();
    api.consolidado.and.returnValue(of([{categoria:'Actual'}]));
    await page.cargar();
    antigua.next([{categoria:'Anterior'}]); await pendiente;
    expect(page.consolidado()[0].categoria).toBe('Actual');
  });
  it('descarta respuestas de otra empresa y de una página destruida', async () => {
    const antigua=new Subject<any>();
    api.consolidado.and.returnValue(antigua);
    const pendiente=page.cargar(); ctx.empresaId.set(36);
    antigua.next([{categoria:'Ajena'}]); await pendiente;
    expect(page.consolidado()).toEqual([]);
    api.consolidado.and.returnValue(antigua);
    const destruida=page.cargar(); page.ngOnDestroy();
    antigua.next([{categoria:'Destruida'}]); await destruida;
    expect(page.consolidado()).toEqual([]);
  });
  it('no publica resultados parciales si falla una página', async () => {
    api.detalleConsolidado.and.callFake((_e: number,f: any) =>
      f.page===0?of({content:[{nit:'1'}],totalPages:2}):throwError(()=>new Error('Fallo')));
    await page.cargar();
    expect(page.detalle()).toEqual([]);
    expect(page.mensual()).toBeNull();
    expect(page.error()).toBeTruthy();
  });
});
