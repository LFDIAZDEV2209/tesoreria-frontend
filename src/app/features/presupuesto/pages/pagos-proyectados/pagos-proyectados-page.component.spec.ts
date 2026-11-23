import { HttpResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, Subject, throwError } from 'rxjs';
import { PagosProyectadosPageComponent } from './pagos-proyectados-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { ControlEgresosService } from '../../../contabilidad/control-egresos/control-egresos.service';

describe('Proyección de Egresos sin sugeridos', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('retira sugeridos de la pantalla de proyección', async () => {
    const api = {
      contrato: () => of({estadoAprobacion: 'aprobado'}),
      mesesCerrados: () => of([]), categorias: () => of([]), categoriasHistoricas: () => of([]),
      resumenPagos: () => of({}), pagos: () => of({content:[],totalPages:0,totalElements:0}),
      candidatos: () => of([]), facturasSugeridas: () => of([]),
      sugerenciasPresupuesto: () => of([
        {clave:'tercero:1',tipo:'tercero',nit:'1',nombre:'DIAN',categoria:'IMPUESTOS',pagoSugerido:1234,observacion:'Pagar retención'},
        {clave:'categoria:PRESTAMOS',tipo:'categoria',nombre:'PRESTAMOS',categoria:'PRESTAMOS',pagoSugerido:0,observacion:'Esperar autorización'},
        {clave:'tercero:2',tipo:'tercero',nit:'2',nombre:'Provisión',pagoSugerido:null,observacion:'Revisar antes de pagar'},
      ]),
    };
    await TestBed.configureTestingModule({
      imports: [PagosProyectadosPageComponent, NoopAnimationsModule],
      providers: [
        {provide:ActivatedRoute,useValue:{snapshot:{data:{}}}},
        {provide:PresupuestoService,useValue:api},
        {provide:PresupuestoContextService,useValue:{vistaCompleta:()=>false,mesActivo:()=>null,mesConsulta:()=>null,empresaId:()=>35,periodo:()=>'2026-10',nombreEmpresa:()=> 'Empresa de prueba',empresas:()=>[{}],permisos:()=>({superAdmin:false}),tienePermiso:()=>false}},
        {provide:AuthorizationService,useValue:{hasAnyRole:()=>false,isSuperAdmin:()=>false}},
        {provide:PresupuestoToastService,useValue:{}},
        {provide:ControlEgresosService,useValue:{}}, {provide:Router,useValue:{}},
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PagosProyectadosPageComponent);
    fixture.componentInstance.cambiarSeccion('otros');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.gp-budget-suggestions')).toBeNull();
    expect(fixture.componentInstance.pestanaOpts.some(t => t.id === 'sugeridos')).toBeFalse();
  });

  it('sin aprobación global del presupuesto no muestra calendario ni montos', async () => {
    const api = {
      contrato: () => of({estadoAprobacion: null}),
      mesesCerrados: () => of([]), categorias: () => of([]), categoriasHistoricas: () => of([]),
      resumenPagos: () => of({totalProyectado: 5000}),
      pagos: () => of({content:[{id:1,montoProyectado:5000,estado:'proyectado'}],totalPages:1,totalElements:1}),
      candidatos: () => of([]), facturasSugeridas: () => of([]), sugerenciasPresupuesto: () => of([]),
    };
    await TestBed.configureTestingModule({
      imports: [PagosProyectadosPageComponent, NoopAnimationsModule],
      providers: [
        {provide:ActivatedRoute,useValue:{snapshot:{data:{}}}},
        {provide:PresupuestoService,useValue:api},
        {provide:PresupuestoContextService,useValue:{vistaCompleta:()=>false,mesActivo:()=>null,mesConsulta:()=>null,empresaId:()=>35,periodo:()=>'2026-10',nombreEmpresa:()=> 'Empresa de prueba',empresas:()=>[{}],permisos:()=>({superAdmin:false}),tienePermiso:()=>false}},
        {provide:AuthorizationService,useValue:{hasAnyRole:()=>false,isSuperAdmin:()=>false}},
        {provide:PresupuestoToastService,useValue:{}},
        {provide:ControlEgresosService,useValue:{}}, {provide:Router,useValue:{}},
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PagosProyectadosPageComponent);
    await fixture.componentInstance.cargar();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('El presupuesto aún no está aprobado');
    expect(fixture.nativeElement.querySelector('.gp-payment-list')).toBeNull();
    expect(fixture.componentInstance.pagos()).toEqual([]);
  });

  it('marca los pagos por reflejar y el aviso de cambios pendientes', async () => {
    const api = {
      contrato: () => of({estadoAprobacion: 'aprobado', aprobadoEn: '2026-10-01T00:00:00'}),
      mesesCerrados: () => of([]), categorias: () => of([]), categoriasHistoricas: () => of([]),
      resumenPagos: () => of({totalProyectado: 100}),
      pagos: () => of({content: [
        {id:1, nombre:'PROVEEDOR UNO', nit:'900', estado:'proyectado', aprobado:true, moduloOrigen:'proveedores', montoProyectado:100, fechaProyectada:'2026-10-12', aprobadoEn:'2026-10-02T00:00:00'},
      ], totalPages:1, totalElements:1}),
      candidatos: () => of([]), facturasSugeridas: () => of([]), sugerenciasPresupuesto: () => of([]),
    };
    await TestBed.configureTestingModule({
      imports: [PagosProyectadosPageComponent, NoopAnimationsModule],
      providers: [
        {provide:ActivatedRoute,useValue:{snapshot:{data:{}}}},
        {provide:PresupuestoService,useValue:api},
        {provide:PresupuestoContextService,useValue:{vistaCompleta:()=>false,mesActivo:()=>null,mesConsulta:()=>null,empresaId:()=>35,periodo:()=>'2026-10',nombreEmpresa:()=> 'Empresa de prueba',empresas:()=>[{}],permisos:()=>({superAdmin:false}),tienePermiso:()=>false,puedeCorregirMes:()=>true,puedeEditarMes:()=>true}},
        {provide:AuthorizationService,useValue:{hasAnyRole:()=>false,isSuperAdmin:()=>false}},
        {provide:PresupuestoToastService,useValue:{}},
        {provide:ControlEgresosService,useValue:{}}, {provide:Router,useValue:{}},
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PagosProyectadosPageComponent);
    await fixture.componentInstance.cargar();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('1 cambio pendiente de aprobación');
    expect(texto).toContain('Por aprobar de nuevo');
  });

  it('la barra de filtros permite buscar por empresa y cambia el workspace', async () => {
    const ctx = new PresupuestoContextService({permisosGp: () => of(null), empresas: () => of([])} as any);
    const api = {
      contrato: () => of({estadoAprobacion: 'aprobado'}),
      mesesCerrados: () => of([]), categorias: () => of([]), categoriasHistoricas: () => of([]),
      resumenPagos: () => of({}), pagos: () => of({content:[],totalPages:0,totalElements:0}),
      candidatos: () => of([]), facturasSugeridas: () => of([]), sugerenciasPresupuesto: () => of([]),
    };
    await TestBed.configureTestingModule({
      imports: [PagosProyectadosPageComponent, NoopAnimationsModule],
      providers: [
        {provide:ActivatedRoute,useValue:{snapshot:{data:{}}}},
        {provide:PresupuestoService,useValue:api},
        {provide:PresupuestoContextService,useValue:ctx},
        {provide:AuthorizationService,useValue:{hasAnyRole:()=>false,isSuperAdmin:()=>false}},
        {provide:PresupuestoToastService,useValue:{}},
        {provide:ControlEgresosService,useValue:{}}, {provide:Router,useValue:{}},
      ],
    }).compileComponents();
    ctx.permisos.set({gerencia:true, superAdmin:true, puedeAprobar:false, rolGp:'superadmin', permisos:[]} as any);
    ctx.empresas.set([{id:36, name:'BIENESTAR CORPORATIVO'}, {id:37, name:'JERARQUIA'}] as any);
    ctx.empresaId.set(36);
    const fixture = TestBed.createComponent(PagosProyectadosPageComponent);
    fixture.componentInstance.cargar = async () => {};
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select[aria-label="Buscar pagos por empresa"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    select.value = '37';
    select.dispatchEvent(new Event('change', {bubbles:true}));
    fixture.detectChanges();
    expect(ctx.empresaId()).toBe(37);
  });
});

describe('Autorización de acciones de pagos', () => {
  beforeEach(() => TestBed.configureTestingModule({providers:[{provide:ActivatedRoute,useValue:{snapshot:{data:{}}}}]}));
  function pagina(permisos: any) {
    const ctx = new PresupuestoContextService({} as any);
    ctx.permisos.set(permisos);
    return TestBed.runInInjectionContext(() => new PagosProyectadosPageComponent(
      ctx, {} as any, {} as any,
      {hasAnyRole: () => true, isSuperAdmin: () => false} as any, {} as any, {} as any));
  }
  afterEach(() => TestBed.resetTestingModule());
  it('no habilita operar ni aprobar mientras no haya autorización', () => {
    const p = pagina(null);
    expect(p.puedeOperar()).toBeFalse();
    expect(p.puedeAprobar).toBeFalse();
  });
  it('una matriz vacía revoca acciones aunque el rol y flag permitan aprobar', () => {
    const p = pagina({gerencia: true, superAdmin: false, puedeAprobar: true, permisos: []});
    expect(p.puedeOperar()).toBeFalse();
    expect(p.puedeAprobar).toBeFalse();
  });
  it('operar no concede aprobación y la revocación se refleja inmediatamente', () => {
    const p = pagina({gerencia: false, superAdmin: false, puedeAprobar: false, permisos: ['pagos.operar']});
    expect(p.puedeOperar()).toBeTrue();
    expect(p.puedeAprobar).toBeFalse();
    p.ctx.permisos.set({gerencia: false, superAdmin: false, puedeAprobar: false, permisos: []});
    expect(p.puedeOperar()).toBeFalse();
  });
  it('contador puede eliminar provisiones si la matriz efectiva concede ese permiso', () => {
    const p = pagina({rolGp:'contador',permisos:['pagos.operar','pagos.eliminar']});
    expect(p.puedeOperar()).toBeTrue();expect(p.puedeEliminar()).toBeTrue();
  });
  it('contador confirma antes de eliminar una provisión anterior y ve los mensajes 403/409 reales', () => {
    const p = pagina({rolGp:'contador',permisos:['pagos.operar']});
    const api = jasmine.createSpyObj('api', ['eliminarPago']);
    const toast = jasmine.createSpyObj('toast', ['mostrar','error']);
    (p as any).service = api; (p as any).toast = toast;
    spyOn(p,'cargar').and.resolveTo(); p.ctx.empresaId.set(35);
    const pago = {id:1,nombre:'Provisión anterior',moduloOrigen:'manual',estado:'proyectado',aprobado:false,fechaProyectada:'2025-01-10',montoProyectado:234.56} as any;
    for (const [status, message] of [[403,'Tu rol (contador) no tiene el permiso "Eliminar proyecciones".'],[409,'Solo se puede editar o eliminar una provisión en estado PROYECTADO y sin aprobar.']] as const) {
      api.eliminarPago.calls.reset();
      api.eliminarPago.and.returnValue(throwError(() => ({status,error:{code:'PRESUPUESTO_CONFLICT',message}})));
      p.eliminar(pago);
      expect(api.eliminarPago).not.toHaveBeenCalled();
      const confirmacion = p.modalConfirmar()!;
      expect(confirmacion.mensaje).toContain('234,56');
      expect(confirmacion.mensaje).toContain('2025-01-10');
      confirmacion.ejecutar();
      expect(api.eliminarPago).toHaveBeenCalledOnceWith(35,1);
      expect(toast.error).toHaveBeenCalledWith(message);
      expect(p.cargar).not.toHaveBeenCalled();
    }
    api.eliminarPago.calls.reset(); p.eliminar(pago);
    pago.aprobado = true; p.modalConfirmar()!.ejecutar();
    expect(api.eliminarPago).not.toHaveBeenCalled();
  });
  it('solo el rol Contador edita y elimina provisiones (ni Gerencia ni Superadmin)', () => {
    const provision = {id:1,nit:'9',nombre:'Provisión',moduloOrigen:'manual',estado:'proyectado',
      aprobado:false,fechaProyectada:'2026-01-10',montoProyectado:100} as any;
    const pGerente = pagina({rolGp:'gerente',gerencia:true,permisos:['pagos.operar','pagos.eliminar']});
    expect(pGerente.puedeModificar(provision)).toBeFalse();
    expect(pGerente.puedeModificar(provision, true)).toBeFalse();
    const pSuper = pagina({rolGp:'superadmin',superAdmin:true,permisos:['pagos.operar','pagos.eliminar']});
    expect(pSuper.puedeModificar(provision)).toBeFalse();
    expect(pSuper.puedeModificar(provision, true)).toBeFalse();
    const pContador = pagina({rolGp:'contador',permisos:['pagos.operar']});
    expect(pContador.puedeModificar(provision)).toBeTrue();
    expect(pContador.puedeModificar(provision, true)).toBeTrue();
    expect(pContador.motivoEditar(provision)).toBe('');
    expect(pSuper.motivoEditar(provision)).toContain('rol Contador');
  });
  it('aprueba y desaprueba en bloque con la sumatoria de las filas seleccionadas', async () => {
    const p = pagina({rolGp:'gerente',gerencia:true,permisos:['pagos.aprobar']});
    const api = jasmine.createSpyObj('API',['aprobacionMasiva']);
    api.aprobacionMasiva.and.returnValue(of({actualizados:[{},{}],errores:[]}));
    (p as any).service=api;(p as any).toast={mostrar:()=>{},error:()=>{}};
    spyOn(p,'cargar').and.resolveTo();p.ctx.empresaId.set(35);p.seccion.set('cx_pagar');
    p.pagos.set([{id:1,moduloOrigen:'cx_pagar',montoProyectado:100,estado:'proyectado'},
      {id:2,moduloOrigen:'cx_pagar',montoProyectado:200,estado:'proyectado'},
      {id:3,moduloOrigen:'cx_pagar',montoProyectado:500,estado:'pagado'}] as any);
    p.seleccionarTodosPagos();expect(p.totalSeleccionados()).toBe(300);
    await p.cambiarAprobacionMasiva(true);
    expect(api.aprobacionMasiva).toHaveBeenCalledWith(35,[1,2],true);
    p.seleccionarTodosPagos();await p.cambiarAprobacionMasiva(false);
    expect(api.aprobacionMasiva).toHaveBeenCalledWith(35,[1,2],false);
  });
  it('contador puede editar pero no puede confirmar una factura aprobada', () => {
    const p = pagina({rolGp:'contador',permisos:['pagos.operar']});
    p.ctx.empresaId.set(35);
    p.editando.set({id:1,aprobado:true,estado:'proyectado'} as any);
    expect(p.puedeOperar()).toBeTrue();
    expect(p.puedeRegistrarPago()).toBeFalse();
    p.pagar(p.editando()!);
    expect(p.modalConfirmar()).toBeNull();
  });
  it('Tesorería puede confirmar sin permiso de edición y revalida antes de enviar', () => {
    const p = pagina({rolGp:'tesorero',permisos:['pagos.ver','pagos.pagar']});
    p.ctx.empresaId.set(35);
    p.editando.set({id:1,nombre:'Factura',montoProyectado:100,aprobado:true,estado:'proyectado'} as any);
    expect(p.puedeOperar()).toBeFalse();
    expect(p.puedeRegistrarPago()).toBeTrue();
    p.pagar(p.editando()!);
    const confirmar = p.modalConfirmar()!;
    expect(confirmar).not.toBeNull();
    p.ctx.permisos.set({rolGp:'contador',permisos:['pagos.operar']} as any);
    expect(() => confirmar.ejecutar()).not.toThrow(); // El API vacío no debe llegar a invocarse.
  });
  it('explica por qué no se puede pagar ni editar una proyección', () => {
    const p = pagina({rolGp:'tesorero',permisos:['pagos.ver','pagos.pagar']});
    const pago = {id:1, estado:'proyectado', aprobado:false} as any;
    expect(p.motivoPago(pago)).toContain('aprobación de Gerencia');
    expect(p.motivoPago({...pago, aprobado:true})).toBe('');
    expect(p.motivoPago({...pago, aprobado:true, estado:'pagado'})).toContain('ya fue confirmado');
    expect(p.motivoEditar(pago)).toContain('Tesorería');
    expect(p.grupoAprobado({total:100, aprobado:0})).toBeFalse();
    expect(p.grupoAprobado({total:100, aprobado:100})).toBeTrue();
    expect(p.grupoAprobado({total:0, aprobado:0})).toBeFalse();
  });
  it('diasVencido cuenta los días de atraso solo cuando ya se venció', () => {
    const p = pagina({rolGp:'tesorero',permisos:['pagos.ver','pagos.pagar']});
    const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    expect(p.diasVencido(null)).toBeNull();
    expect(p.diasVencido('')).toBeNull();
    expect(p.diasVencido('fecha-invalida')).toBeNull();
    expect(p.diasVencido(diaLocal(new Date()))).toBeNull();
    expect(p.diasVencido(diaLocal(new Date(Date.now() + 86400000)))).toBeNull();
    expect(p.diasVencido(diaLocal(new Date(Date.now() - 3 * 86400000)))).toBe(3);
  });
});


describe('Calendario completo y aislamiento de respuestas', () => {
  let api: any;
  let ctx: PresupuestoContextService;
  let p: PagosProyectadosPageComponent;
  beforeEach(() => {
    TestBed.configureTestingModule({providers:[{provide:ActivatedRoute,useValue:{snapshot:{data:{}}}}]});
    api = jasmine.createSpyObj('PresupuestoService', ['contrato', 'pagos', 'mesesCerrados', 'resumenPagos', 'candidatos', 'facturasSugeridas', 'sugerenciasPresupuesto']);
    api.contrato.and.returnValue(of({estadoAprobacion: 'aprobado'}));
    api.resumenPagos.and.returnValue(of({}));
    api.mesesCerrados.and.returnValue(of([]));
    api.candidatos.and.returnValue(of([]));
    api.facturasSugeridas.and.returnValue(of([]));
    api.sugerenciasPresupuesto.and.returnValue(of([]));
    ctx = new PresupuestoContextService(api);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, {set: (id: number | null) => { empresa = id; }}) as any;
    p = TestBed.runInInjectionContext(() => new PagosProyectadosPageComponent(ctx, api, {} as any, {} as any, {} as any, {} as any));
    TestBed.flushEffects();
    ctx.empresaId.set(35);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('incluye las 201 filas y su importe en filtros y totales', async () => {
    const rows = Array.from({length:201}, (_,i) => ({id:i+1,montoProyectado:10,estado:'proyectado'}));
    api.pagos.and.callFake((_empresa: number, f: any) => of({content:rows.slice(f.page*200,(f.page+1)*200),totalPages:2,totalElements:201}));
    await p.cargar();
    expect(p.pagos().length).toBe(201);
    expect(p.totalFiltrado()).toBe(2010);
    expect(api.pagos.calls.allArgs().map((a: any[]) => a[1].page)).toEqual([0,1]);
  });
  it('no publica la respuesta de A después de seleccionar B', async () => {
    const antigua = new Subject<any>();
    api.pagos.and.returnValue(antigua);
    const cargaA = p.cargar();
    ctx.empresaId.set(36);
    api.pagos.and.returnValue(of({content:[{id:36}],totalPages:1,totalElements:1}));
    await p.cargar();
    antigua.next({content:[{id:35}],totalPages:1,totalElements:1});
    await cargaA;
    expect(p.pagos().map(x => x.id)).toEqual([36]);
    expect(p.error()).toBeNull();
  });
  it('no muestra un calendario parcial si falla una página posterior', async () => {
    api.pagos.and.callFake((_empresa: number, f: any) => f.page===0
      ? of({content:[{id:1}],totalPages:2,totalElements:201})
      : throwError(() => ({error:{message:'Error de página'}})));
    await p.cargar();
    expect(p.pagos()).toEqual([]);
    expect(p.error()).toBeTruthy();
    expect(p.loading()).toBeFalse();
  });
  it('borra datos al perder la empresa autorizada', async () => {
    p.pagos.set([{id:35}] as any);
    p.sugerenciasPresupuesto.set([{clave:'tercero:1'}] as any);
    ctx.empresaId.set(null);
    await p.cargar();
    expect(p.pagos()).toEqual([]);
    expect(p.sugerenciasPresupuesto()).toEqual([]);
    expect(api.pagos).not.toHaveBeenCalled();
  });

  it('muestra sugerencias de impuestos y categorías aun sin pagos o candidatos', async () => {
    const sugerencias = [
      {clave:'tercero:1',tipo:'tercero',nombre:'DIAN',categoria:'IMPUESTOS',pagoSugerido:1234,observacion:'Pagar impuesto'},
      {clave:'categoria:PRESTAMOS',tipo:'categoria',nombre:'PRESTAMOS',pagoSugerido:0,observacion:'Esperar'},
    ];
    api.pagos.and.returnValue(of({content:[],totalPages:0,totalElements:0}));
    api.sugerenciasPresupuesto.and.returnValue(of(sugerencias));
    await p.cargar();
    await p.cargarSugerenciasPresupuesto();
    expect(p.sugerenciasPresupuesto()).toEqual(sugerencias as any);
    expect(api.sugerenciasPresupuesto).toHaveBeenCalledOnceWith(35,false);
  });

  it('conserva todos los pagos, resumen y candidatos cuando los sugeridos fallan con 500', async () => {
    const rows = Array.from({length:201}, (_,i) => ({id:i+1,montoProyectado:10,estado:'proyectado'}));
    api.pagos.and.callFake((_empresa: number, f: any) => of({content:rows.slice(f.page*200,(f.page+1)*200),totalPages:2,totalElements:201}));
    api.resumenPagos.and.returnValue(of({totalProyectado:2010}));
    api.candidatos.and.returnValue(of([{nit:'1'}]));
    api.facturasSugeridas.and.returnValue(of([{nit:'2'}]));
    api.sugerenciasPresupuesto.and.returnValue(throwError(() => ({status:500,error:{message:"Request method 'GET' is not supported"}})));
    await p.cargar();
    expect(p.pagos().length).toBe(201);
    expect(p.totalFiltrado()).toBe(2010);
    expect(p.resumen()?.totalProyectado).toBe(2010);
    expect(p.candidatos().length).toBe(1);
    expect(p.sugeridos().length).toBe(0);
    expect(p.error()).toBeNull();
    expect(p.loading()).toBeFalse();
    expect(p.errorSugerencias()).toBeNull();
    expect(api.sugerenciasPresupuesto).not.toHaveBeenCalled();
    expect(p.cargandoSugerencias()).toBeFalse();
    api.sugerenciasPresupuesto.and.returnValue(of([{clave:'tercero:1'}]));
    await p.cargarSugerenciasPresupuesto();
    expect(p.errorSugerencias()).toBeNull();
    expect(p.sugerenciasPresupuesto().length).toBe(1);
    expect(api.pagos).toHaveBeenCalledTimes(2);
  });

  it('muestra los pagos sin esperar una consulta lenta de sugeridos', async () => {
    const pendiente = new Subject<any>();
    api.pagos.and.returnValue(of({content:[{id:1}],totalPages:1,totalElements:1}));
    api.sugerenciasPresupuesto.and.returnValue(pendiente);
    await p.cargar();
    expect(p.loading()).toBeFalse();
    expect(p.pagos().length).toBe(1);
    expect(p.cargandoSugerencias()).toBeFalse();
    expect(api.sugerenciasPresupuesto).not.toHaveBeenCalled();
    pendiente.next([]);
    await Promise.resolve();
    expect(p.cargandoSugerencias()).toBeFalse();
  });

  it('no muestra el error tardío de una empresa anterior', async () => {
    const anterior = new Subject<any>();
    api.sugerenciasPresupuesto.and.returnValue(anterior);
    const cargaAnterior = p.cargarSugerenciasPresupuesto();
    ctx.empresaId.set(36);
    api.sugerenciasPresupuesto.and.returnValue(of([{clave:'tercero:B'}]));
    await p.cargarSugerenciasPresupuesto();
    anterior.error({status:500});
    await cargaAnterior;
    expect(p.errorSugerencias()).toBeNull();
    expect(p.sugerenciasPresupuesto().map(s => s.clave)).toEqual(['tercero:B']);
  });

  it('descarta las sugerencias tardías de la empresa anterior', async () => {
    const antigua = new Subject<any>();
    api.pagos.and.returnValue(of({content:[],totalPages:0,totalElements:0}));
    api.sugerenciasPresupuesto.and.returnValue(antigua);
    const cargaA = p.cargarSugerenciasPresupuesto();
    ctx.empresaId.set(36);
    api.sugerenciasPresupuesto.and.returnValue(of([{clave:'tercero:B'}]));
    await p.cargarSugerenciasPresupuesto();
    antigua.next([{clave:'tercero:A'}]);
    await cargaA;
    expect(p.sugerenciasPresupuesto().map(s => s.clave)).toEqual(['tercero:B']);
  });

  it('Provisiones no consulta sugerencias ni muestra datos de Proyección de Egresos', async () => {
    Object.defineProperty(p, 'origen', {value:'manual'});
    api.pagos.and.returnValue(of({content:[],totalPages:0,totalElements:0}));
    await p.cargar();
    expect(api.sugerenciasPresupuesto).not.toHaveBeenCalled();
    expect(p.sugerenciasPresupuesto()).toEqual([]);
  });

  it('conserva búsqueda y paginación independientes por sección y reinicia la página al filtrar',()=>{
    p.pagos.set(Array.from({length:24},(_,i)=>({id:i,nit:String(i),nombre:'Tercero '+i,moduloOrigen:i<12?'proveedores':'anticipos',fechaProyectada:'2026-10-01',estado:'proyectado',montoProyectado:10})) as any);
    p.cambiarSeccion('proveedores');p.cambiarPagina('programados',2);expect(p.paginaPagos().filas.length).toBe(2);
    p.cambiarSeccion('anticipos');expect(p.paginaPagos().pagina).toBe(1);
    p.filtrarSeccion('busqueda','Tercero 23');expect(p.paginaPagos().total).toBe(1);
    p.cambiarSeccion('proveedores');expect(p.filtroSeccion().busqueda).toBe('');expect(p.paginaPagos().pagina).toBe(2);
    expect(p.totalSeccion()).toBe(120);
    p.filtrarSeccion('busqueda','Tercero 0');expect(p.paginaPagos().pagina).toBe(1);
    p.cambiarSeccion('anticipos');expect(p.filtroSeccion().busqueda).toBe('Tercero 23');
  });

  it('salta a la sección con egresos cuando la sección abierta está vacía', async () => {
    api.pagos.and.returnValue(of({content:[
      {id:1,nit:'1',nombre:'Provisión',moduloOrigen:'importado',estado:'proyectado',montoProyectado:10,fechaProyectada:'2026-09-01'},
    ],totalPages:1,totalElements:1}));
    expect(p.seccion()).toBe('todos');
    await p.cargar();
    expect(p.seccion()).toBe('todos');
    expect(p.pagosDeSeccion().length).toBe(1);
  });

  it('agrupa por módulo real y conserva pagados y provisiones al consultar todos los egresos',async()=>{
    api.pagos.and.returnValue(of({content:[
      {id:1,nit:'1',nombre:'Provisión',moduloOrigen:'manual',estado:'pagado',montoProyectado:25,fechaProyectada:'2026-10-01'},
      {id:2,nit:'1',nombre:'CxC',moduloOrigen:'cx_cobrar',estado:'proyectado',montoProyectado:35,fechaProyectada:'2026-10-01'},
    ],totalPages:1,totalElements:2}));
    await p.cargar();expect(api.pagos.calls.mostRecent().args[1].origen).toBeUndefined();
    p.cambiarSeccion('provisiones');expect(p.paginaPagos().total).toBe(1);expect(p.totalSeccion()).toBe(25);
    p.cambiarSeccion('cx_cobrar');expect(p.paginaPagos().total).toBe(1);expect(p.totalSeccion()).toBe(35);
    p.filtrarSeccion('estado','pagado');expect(p.paginaPagos().total).toBe(0);
  });

  it('un egreso ELIMINADO no se lista ni cuenta en totales/KPIs; su estado se rotula "Eliminado"',async()=>{
    api.pagos.and.returnValue(of({content:[
      {id:1,nit:'1',nombre:'Provisión viva',moduloOrigen:'manual',estado:'proyectado',montoProyectado:100,fechaProyectada:'2099-01-01'},
      {id:2,nit:'2',nombre:'Provisión eliminada',moduloOrigen:'manual',estado:'eliminado',montoProyectado:50,fechaProyectada:'2099-01-02'},
    ],totalPages:1,totalElements:2}));
    await p.cargar();
    // La fila eliminada desaparece de la lista, de los contadores y de los totales.
    expect(p.pagos().map(x=>x.id)).toEqual([1]);
    expect(p.totalSeccion()).toBe(100);
    expect(p.contadorTab('programados')).toBe(1);
    expect(p.cantidadVencidos()).toBe(0);
    // El histórico de estados (backend) conserva el cambio con estado final
    // "Eliminado"; el front lo rotula igual si llega a mostrarlo.
    expect(p.estadoLabel('eliminado')).toBe('Eliminado');
  });

  it('oculta montos y calendario hasta que Gerencia apruebe el presupuesto global', async () => {
    api.contrato.and.returnValue(of({estadoAprobacion: null}));
    await p.cargar();
    expect(p.pagosBloqueados()).toBeTrue();
    expect(p.pagos()).toEqual([]);
    expect(p.resumen()).toBeNull();
    expect(api.pagos).not.toHaveBeenCalled();
    expect(api.resumenPagos).not.toHaveBeenCalled();
    expect(p.valorProyectado(999)).toBe(0);

    // Con la aprobación global del presupuesto vuelven a consultarse.
    api.contrato.and.returnValue(of({estadoAprobacion: 'aprobado'}));
    api.pagos.and.returnValue(of({content:[{id:1}],totalPages:1,totalElements:1}));
    await p.cargar();
    expect(p.pagosBloqueados()).toBeFalse();
    expect(p.pagos().length).toBe(1);
    expect(p.valorProyectado(999)).toBe(999);
  });

  it('la regla no bloquea Provisiones aunque el presupuesto no esté aprobado', () => {
    Object.defineProperty(p, 'origen', {value: 'manual'});
    p.presupuestoAprobado.set(false);
    expect(p.pagosBloqueados()).toBeFalse();
  });

  it('la vista histórica conserva su snapshot sin bloqueo', () => {
    p.modoHistorico = true;
    p.presupuestoAprobado.set(false);
    expect(p.pagosBloqueados()).toBeFalse();
  });

  it('el reflejo por lotes marca lo posterior al corte y lo limpia al re-aprobar', async () => {
    api.contrato.and.returnValue(of({estadoAprobacion: 'aprobado', aprobadoEn: '2026-10-10T10:00:00'}));
    api.pagos.and.returnValue(of({content: [
      {id:1, nombre:'A', nit:'1', aprobadoEn:'2026-10-09T09:00:00', moduloOrigen:'proveedores', estado:'proyectado', montoProyectado:10, fechaProyectada:'2026-10-12'},
      {id:2, nombre:'A', nit:'1', aprobadoEn:'2026-10-11T09:00:00', moduloOrigen:'proveedores', estado:'proyectado', montoProyectado:20, fechaProyectada:'2026-10-13'},
      {id:3, nombre:'B', nit:'2', aprobadoEn:null, createdAt:'2026-10-11T08:00:00', moduloOrigen:'manual', estado:'proyectado', montoProyectado:5, fechaProyectada:'2026-10-13'},
    ], totalPages:1, totalElements:3}));
    await p.cargar();

    expect(p.corteReflejo()).toBe('2026-10-10T10:00:00');
    expect(p.pendienteReflejo(p.pagos()[0])).toBeFalse(); // aprobado antes del corte
    expect(p.pendienteReflejo(p.pagos()[1])).toBeTrue();  // escudo posterior al corte
    expect(p.pendienteReflejo(p.pagos()[2])).toBeTrue();  // nació después del corte
    expect(p.pagosPendientesReflejo()).toBe(2);
    expect(p.grupoConCambiosPendientes({pagos: p.pagos()})).toBeTrue();

    // Al aprobar de nuevo avanza el corte (simulado): todo queda reflejado.
    p.corteReflejo.set('2026-10-12T00:00:00');
    expect(p.pagosPendientesReflejo()).toBe(0);
    // Sin corte (empresa aprobada heredada, sin marca) nada queda pendiente.
    p.corteReflejo.set(null);
    expect(p.pagosPendientesReflejo()).toBe(0);
  });
});


describe('Guardado manual sin duplicados y transición aprobada', () => {
  let api: any, toast: any, ctx: PresupuestoContextService, p: PagosProyectadosPageComponent;
  beforeEach(() => {
    TestBed.configureTestingModule({providers:[{provide:ActivatedRoute,useValue:{snapshot:{data:{}}}}]});
    api = jasmine.createSpyObj('api', ['contrato', 'crearPago', 'actualizarPago', 'marcarPagado']);
    api.contrato.and.returnValue(of({estadoAprobacion: 'aprobado'}));
    toast = jasmine.createSpyObj('toast', ['mostrar', 'error']);
    ctx = new PresupuestoContextService(api);
    let empresa: number | null = null;
    ctx.empresaId = Object.assign(() => empresa, {set: (id: number | null) => empresa = id}) as any;
    ctx.permisos.set({rolGp:'contador',permisos:['pagos.operar','pagos.pagar'],superAdmin:false} as any);
    p = TestBed.runInInjectionContext(() => new PagosProyectadosPageComponent(ctx,api,toast,{} as any,{} as any,{} as any));
    TestBed.flushEffects();
    ctx.empresaId.set(35);
    spyOn(p,'cargar').and.resolveTo();
    p.abrirCrear(); p.nombre.set('FIXTURE'); p.monto.set('321'); p.fechaProyectada.set('2026-09-22');
  });
  afterEach(() => TestBed.resetTestingModule());
  it('doble clic pendiente crea una sola proyección', async () => {
    const respuesta = new Subject<any>(); api.crearPago.and.returnValue(respuesta);
    const guardado = p.guardarPago(); await p.guardarPago();
    expect(api.crearPago).toHaveBeenCalledTimes(1);
    expect(p.guardandoPago()).toBeTrue();
    respuesta.next({id:1}); await guardado;
    expect(p.guardandoPago()).toBeFalse(); expect(p.modalPago()).toBeFalse();
  });
  it('sin aprobación no crea un pago histórico ni modifica estados', async () => {
    p.yaPagado.set(true); await p.guardarPago();
    expect(p.puedeRegistrarPago()).toBeFalse();
    expect(api.crearPago).not.toHaveBeenCalled(); expect(api.marcarPagado).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
  it('contador no puede eludir la restricción marcando ya pagado en el formulario', async () => {
    ctx.permisos.set({rolGp:'contador',permisos:['pagos.operar']} as any);
    p.abrirEditar({id:8,nombre:'FIXTURE',montoProyectado:321,fechaProyectada:'2026-09-22',estado:'proyectado',aprobado:true} as any);
    p.yaPagado.set(true);
    await p.guardarPago();
    expect(api.actualizarPago).not.toHaveBeenCalled();
    expect(api.marcarPagado).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
  it('una proyección aprobada no se puede editar ni ejecutar desde el formulario de edición', async () => {
    p.abrirEditar({id:8,nombre:'FIXTURE',montoProyectado:321,fechaProyectada:'2026-09-22',estado:'proyectado',aprobado:true} as any);
    p.yaPagado.set(true); p.fechaPagoReal.set('2026-09-21');
    api.actualizarPago.and.returnValue(of({id:8})); api.marcarPagado.and.returnValue(of({id:8,estado:'pagado'}));
    await p.guardarPago();
    expect(api.actualizarPago).not.toHaveBeenCalled();
    expect(api.marcarPagado).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
  it('un conflicto 409 conserva el formulario y muestra el mensaje del backend', async () => {
    p.abrirEditar({id:8,nombre:'FIXTURE',moduloOrigen:'manual',montoProyectado:321,fechaProyectada:'2026-09-22',estado:'proyectado',aprobado:false} as any);
    api.actualizarPago.and.returnValue(throwError(() => ({status:409,error:{code:'PAGO_APROBADO',message:'La provisión ya fue aprobada.'}})));
    await p.guardarPago(true);
    expect(p.modalPago()).toBeTrue(); expect(p.guardandoPago()).toBeFalse();
    expect(toast.error.calls.mostRecent().args[0]).toBe('La provisión ya fue aprobada.');
    expect(p.cargar).not.toHaveBeenCalled();
  });
  it('editar una provisión conserva centavos y acepta importes con formato COP', async () => {
    const pago = {id:8,nombre:'FIXTURE',moduloOrigen:'manual',montoProyectado:234.56,fechaProyectada:'2025-02-10',estado:'proyectado',aprobado:false} as any;
    p.abrirEditar(pago);
    expect(p.montoFormateado()).toBe('234,56');
    api.actualizarPago.and.returnValue(of(pago));
    await p.guardarPago(true);
    expect(api.actualizarPago.calls.mostRecent().args[2].montoProyectado).toBe(234.56);
    p.abrirEditar(pago); p.actualizarMonto('1.234,56');
    expect(p.montoVista()).toContain('1.234,56');
    await p.guardarPago(true);
    expect(api.actualizarPago.calls.mostRecent().args[2].montoProyectado).toBe(1234.56);
    p.actualizarMonto('1.234,'); expect(p.montoFormateado()).toBe('1.234,');
    p.actualizarMonto('1.234,50'); expect(p.montoFormateado()).toBe('1.234,50');
  });
  it('respuesta de A no cierra el formulario nuevo de B ni ejecuta pago posterior', async () => {
    const respuesta = new Subject<any>(); api.actualizarPago.and.returnValue(respuesta);
    p.abrirEditar({id:8,nombre:'A',moduloOrigen:'manual',montoProyectado:321,fechaProyectada:'2026-09-22',estado:'proyectado',aprobado:false} as any);
    const pendiente = p.guardarPago(true);
    ctx.empresaId.set(36); p.abrirCrear(); p.nombre.set('B');
    respuesta.next({id:8}); await pendiente;
    expect(p.modalPago()).toBeTrue(); expect(p.nombre()).toBe('B');
    expect(api.marcarPagado).not.toHaveBeenCalled(); expect(toast.mostrar).not.toHaveBeenCalled();
  });
  it('permisos revocados y formulario de otra empresa no envían escrituras', async () => {
    ctx.permisos.set({permisos:[]} as any); await p.guardarPago();
    ctx.permisos.set({permisos:['pagos.operar']} as any); ctx.empresaId.set(36); await p.guardarPago();
    expect(api.crearPago).not.toHaveBeenCalled();
  });
});


describe('Número de egreso y consolidación', () => {
  let page: PagosProyectadosPageComponent, api: any, toast: any;
  beforeEach(() => {
    TestBed.configureTestingModule({providers:[{provide:ActivatedRoute,useValue:{snapshot:{data:{}}}}]});
    api = jasmine.createSpyObj('api', ['guardarEgresoGrupo','categorias','categoriasHistoricas']);api.categorias.and.returnValue(of([]));api.categoriasHistoricas.and.returnValue(of([]));
    toast = jasmine.createSpyObj('toast', ['mostrar', 'error']);
    const ctx = new PresupuestoContextService(api);
    ctx.empresaId = Object.assign(() => 35, {set: () => {}}) as any;
    ctx.periodo.set('2026-10');
    ctx.permisos.set({rolGp:'superadmin',superAdmin:true,permisos:['pagos.aprobar']} as any);
    page = TestBed.runInInjectionContext(() => new PagosProyectadosPageComponent(ctx, api, toast, {} as any, {} as any, {} as any));
    spyOn(page, 'cargar').and.resolveTo();
    page.pagos.set([{id:8,nit:'1',nombre:'Proveedor',estado:'proyectado',montoProyectado:100,fechaProyectada:'2026-10-08',moduloOrigen:'proveedores'}] as any);
    page.grupoAbierto.set(page.gruposPagos()[0].id);
    page.fechaEgreso = '2026-10-08';
  });
  afterEach(() => TestBed.resetTestingModule());
  it('no guarda sin número', async () => {
    page.numeroEgreso='  '; await page.guardarEgresoGrupo();
    expect(api.guardarEgresoGrupo).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalled();
  });
  it('permite a Superadmin corregir el mes aprobado', async () => {
    page.ctx.estadosMes.set([{periodo:'2026-10',aprobado:true}]); page.numeroEgreso='EG-42';
    api.guardarEgresoGrupo.and.returnValue(of({}));
    expect(page.gruposPagos()[0].consolidado).toBeFalse();
    await page.guardarEgresoGrupo(); expect(api.guardarEgresoGrupo).toHaveBeenCalled();
  });
  it('envía el grupo con el número y fecha', async () => {
    api.guardarEgresoGrupo.and.returnValue(of({})); page.numeroEgreso=' EG-42 ';
    await page.guardarEgresoGrupo();
    expect(api.guardarEgresoGrupo).toHaveBeenCalledOnceWith(35,[8],'EG-42','2026-10-08',null,null);
    expect(page.grupoAbierto()).toBeNull();
  });
  it('sube el documento del egreso, lo lee con Textract y guarda con el adjunto', async () => {
    api.subirDocumentoEgreso = jasmine.createSpy('subirDocumentoEgreso').and.returnValue(of(new HttpResponse({
      body: {key:'documentos-egreso/1.pdf', nombre:'egreso.pdf', url:'https://storage/1', texto:'EGRESO No. 0007', numeroEgreso:'EG-7'},
    })));
    api.guardarEgresoGrupo.and.returnValue(of({}));
    const archivo = new File(['%PDF-1.4'], 'egreso.pdf', {type:'application/pdf'});
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {value:[archivo]});
    page.subirDocumentoEgreso({target:input} as any);
    expect(api.subirDocumentoEgreso).toHaveBeenCalledOnceWith(35, archivo);
    expect(page.numeroEgreso).toBe('EG-7');
    expect(page.documentoEgreso()?.key).toBe('documentos-egreso/1.pdf');
    await page.guardarEgresoGrupo();
    expect(api.guardarEgresoGrupo).toHaveBeenCalledOnceWith(35,[8],'EG-7','2026-10-08','documentos-egreso/1.pdf','egreso.pdf');
  });
  it('alerta cuando el número ya está asignado a otro grupo',async()=>{
    page.pagos.update(pagos=>[...pagos,{id:9,nit:'2',nombre:'Otro',estado:'proyectado',moduloOrigen:'proveedores',montoProyectado:10,fechaProyectada:'2026-09-22',numeroEgreso:'GI-20260717'} as any]);
    page.numeroEgreso='GI-20260717';await page.guardarEgresoGrupo();
    expect(api.guardarEgresoGrupo).not.toHaveBeenCalled();expect(toast.error).toHaveBeenCalledWith('El número de egreso GI-20260717 ya existe.');
  });
  it('no vuelve a enviar un pago ya cargado en comprobantes',async()=>{
    page.egresosVinculados.set({8:{id:900} as any});page.numeroEgreso='EG-42';await page.guardarEgresoGrupo();
    expect(api.guardarEgresoGrupo).not.toHaveBeenCalled();expect(toast.error).toHaveBeenCalled();
  });

});

describe('Importación de provisiones: progreso y motivos del backend', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function montar(respuesta: any, conError = false) {
    const api: any = {
      contrato: () => of({estadoAprobacion: 'aprobado'}), mesesCerrados: () => of([]),
      categorias: () => of([]), categoriasHistoricas: () => of([]),
      resumenPagos: () => of({}), pagos: () => of({content:[],totalPages:0,totalElements:0}),
      candidatos: () => of([]), facturasSugeridas: () => of([]), sugerenciasPresupuesto: () => of([]),
      importarPagosExcel: jasmine.createSpy('importarPagosExcel'),
    };
    api.importarPagosExcel.and.returnValue(
      conError ? throwError(() => ({status: 409, error: {message: 'El mes está cerrado.'}})) : of(respuesta),
    );
    const toast = jasmine.createSpyObj('PresupuestoToastService', ['mostrar', 'error']);
    await TestBed.configureTestingModule({
      imports: [PagosProyectadosPageComponent, NoopAnimationsModule],
      providers: [
        {provide:ActivatedRoute,useValue:{snapshot:{data:{origen:'manual'}}}},
        {provide:PresupuestoService,useValue:api},
        {provide:PresupuestoContextService,useValue:{vistaCompleta:()=>false,mesActivo:()=>null,mesConsulta:()=>null,empresaId:()=>35,periodo:()=>'2026-10',nombreEmpresa:()=> 'Empresa de prueba',empresas:()=>[{}],permisos:()=>({superAdmin:false}),tienePermiso:()=>true}},
        {provide:AuthorizationService,useValue:{hasAnyRole:()=>false,isSuperAdmin:()=>false}},
        {provide:PresupuestoToastService,useValue:toast},
        {provide:ControlEgresosService,useValue:{}}, {provide:Router,useValue:{}},
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PagosProyectadosPageComponent);
    return { fixture, page: fixture.componentInstance, api, toast };
  }

  function importar(page: any, nombre = 'provisiones.xlsx') {
    const input = document.createElement('input');
    const archivo = new File(['x'], nombre);
    Object.defineProperty(input, 'files', {value: [archivo]});
    page.importarExcel({target: input} as any);
  }

  it('usa "importados" del backend y muestra los motivos agrupados en el modal', async () => {
    const { fixture, page, api, toast } = await montar({
      importados: 2,
      errores: [
        {fila: 5, mensaje: 'Solo se puede modificar el mes habilitado o el mes inmediatamente anterior. Habilita este mes en Creación de periodos para editarlo.'},
        {fila: 8, mensaje: 'Solo se puede modificar el mes habilitado o el mes inmediatamente anterior. Habilita este mes en Creación de periodos para editarlo.'},
        {fila: 9, mensaje: 'Monto o fecha inválidos (formato fecha: DD/MM/YYYY)'},
      ],
    });
    importar(page);
    expect(api.importarPagosExcel).toHaveBeenCalled();
    expect(page.importadosImportacion()).toBe(2);
    expect(page.modalErroresImportacion()).toBeTrue();
    expect(page.erroresAgrupados().length).toBe(2);
    expect(page.erroresAgrupados()[0].filas).toEqual([5, 8]);
    expect(toast.mostrar).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Habilita este mes en Creación de periodos');
  });

  it('muestra en toast el mensaje del backend cuando la importación falla por HTTP', async () => {
    const { page, api, toast } = await montar({}, true);
    importar(page);
    expect(page.importando()).toBeFalse();
    expect(api.importarPagosExcel).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('El mes está cerrado.');
  });

  it('confirma las filas importadas y recarga la tabla cuando no hay errores', async () => {
    const { page, api, toast } = await montar({importados: 3, errores: []});
    const recargar = spyOn(page, 'cargar').and.returnValue(Promise.resolve());
    importar(page);
    expect(api.importarPagosExcel).toHaveBeenCalled();
    expect(toast.mostrar).toHaveBeenCalledWith('3 provisiones importadas correctamente.');
    expect(recargar).toHaveBeenCalled();
  });
});
