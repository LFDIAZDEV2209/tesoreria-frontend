import { mapMovimiento } from '../../services/gp-mapper';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GpAnticipoLegalizacionService } from '../../services/gp-anticipo-legalizacion.service';
import { environment } from '../../../../../environments/environment';
import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { ModuloPageComponent } from './modulo-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { MODULOS_CFG } from '../../models/presupuesto.model';

describe('Aislamiento de respuestas de módulos operativos', () => {
  let ctx: PresupuestoContextService;
  let api: any;
  let legal: any;
  let toast: any;
  let page: ModuloPageComponent;
  beforeEach(() => {
    api=jasmine.createSpyObj('PresupuestoService',['resumenModulo','movimientos','asignarCategoria','limpiarModulo','importacionPeriodos']);
    api.resumenModulo.and.returnValue(of({}));
    api.movimientos.and.returnValue(of({content:[],totalElements:0}));
    api.asignarCategoria.and.returnValue(of({}));
    api.importacionPeriodos.and.returnValue(of({}));
    legal=jasmine.createSpyObj('GpAnticipoLegalizacionService',['listar','registrar','contenidosArchivo','quitar']);
    legal.listar.and.returnValue(of([]));
    legal.quitar.and.returnValue(of(void 0));
    toast=jasmine.createSpyObj('PresupuestoToastService',['mostrar','error']);
    ctx=new PresupuestoContextService(api);
    spyOn(ctx,'tienePermiso').and.returnValue(true);
    let empresa: number|null=null;
    ctx.empresaId=Object.assign(()=>empresa,{set:(id:number|null)=>{empresa=id;}}) as any;
    page=TestBed.runInInjectionContext(()=>new ModuloPageComponent(ctx,api,legal,toast,{} as any,{} as any));
    TestBed.flushEffects(); ctx.empresaId.set(35);
  });
  afterEach(()=>{page.ngOnDestroy();TestBed.resetTestingModule();});
  it('conserva el periodo del DTO aunque la fecha corresponda a otro mes', () => {
    const mov = mapMovimiento({id:9,periodo:'2026-07',fecha:'05/08/2026'}, 'anticipos');
    expect(mov.periodo).toBe('2026-07');
    expect(page.mesEtiqueta(mov)).toBe(page.etiquetaMes('2026-07'));
    expect(mapMovimiento({id:9}, 'anticipos').periodo).toBeNull();
  });

  it('usa la fecha como respaldo y omite el mes si no está disponible', () => {
    expect(page.mesEtiqueta({fecha:'15/07/2026'} as any)).toBe(page.etiquetaMes('2026-07'));
    expect(page.mesEtiqueta({fecha:'2026-07-15'} as any)).toBe(page.etiquetaMes('2026-07'));
    expect(page.mesEtiqueta({periodo:null,fecha:null} as any)).toBe('');
    expect(page.mesEtiqueta({fecha:'sin fecha'} as any)).toBe('');
  });

  it('el toast confirma el mes del movimiento y conserva el texto si no hay mes', () => {
    ctx.permisos.set({permisos:['modulos.importar']} as any);
    legal.registrar.and.returnValue(of({}));
    const file = new File(['%PDF-1.7'], 'soporte.pdf', {type:'application/pdf'});
    page.abrirLegalizar({id:9,nombre:'PROVEEDOR',periodo:'2026-07',fecha:'05/08/2026'} as any);
    page.archivoLegalizar.set(file); page.registrarLegalizacion();
    expect(toast.mostrar).toHaveBeenCalledWith(`Comprobante registrado para PROVEEDOR · se aplica en ${page.etiquetaMes('2026-07')}`);
    page.abrirLegalizar({id:9,nombre:'PROVEEDOR'} as any);
    page.archivoLegalizar.set(file); page.registrarLegalizacion();
    expect(toast.mostrar.calls.mostRecent().args[0]).toBe('Comprobante de legalización registrado para PROVEEDOR');
  });

  it('descarta resumen y listado tardíos de otra empresa',()=>{
    const antigua=new Subject<any>(); api.resumenModulo.and.returnValue(antigua);
    page.cargar(); ctx.empresaId.set(36);
    api.resumenModulo.and.returnValue(of({totalSaldo:36}));
    api.movimientos.and.returnValue(of({content:[{id:36}],totalElements:1}));
    page.cargar(); antigua.next({totalSaldo:35});
    expect(page.pagina()?.content[0].id).toBe(36);
    expect(api.movimientos.calls.count()).toBe(2);
  });
  it('la búsqueda más reciente gana aunque la anterior responda después',()=>{
    const antigua=new Subject<any>(); api.movimientos.and.returnValue(antigua);
    page.cargarPagina(35);
    api.movimientos.and.returnValue(of({content:[{id:2}],totalElements:1}));
    page.cargarPagina(35); antigua.next({content:[{id:1}],totalElements:1});
    expect(page.pagina()?.content[0].id).toBe(2);
  });
  it('perder empresa borra los movimientos y no consulta otra',()=>{
    page.pagina.set({content:[{id:35}]} as any); ctx.empresaId.set(null);
    page.cargar(); expect(page.pagina()).toBeNull();
    expect(api.movimientos).not.toHaveBeenCalled();
  });
  it('guarda detalle OTROS por NIT y módulo y lo elimina al cambiar categoría',()=>{
    const mov={nit:'900',categoria:'OTROS',categoriaDetalle:'Anterior'} as any;
    page.onDetalleCategoria(mov,{target:{value:'Transporte especial'}} as any);
    expect(api.asignarCategoria).toHaveBeenCalledWith(35,'900','OTROS','Transporte especial',page.cfg.modulo);
    expect(page.editingNit()).toBe('900');
    page.onCambioCategoria(mov,{target:{value:'ABARROTES'}} as any);
    expect(api.asignarCategoria).toHaveBeenCalledWith(35,'900','ABARROTES',null,page.cfg.modulo);
    expect(page.editingNit()).toBeNull();
  });
  it('no repite el guardado ni permite categorizar con permiso revocado',()=>{
    api.asignarCategoria.and.returnValue(new Subject());
    const mov={nit:'900'} as any;
    page.cambiarCategoriaFila(mov,'OTROS','Uno');
    page.cambiarCategoriaFila(mov,'OTROS','Dos');
    expect(api.asignarCategoria.calls.count()).toBe(1);
    page.cargar();
    (ctx.tienePermiso as jasmine.Spy).and.returnValue(false);
    page.cambiarCategoriaFila(mov,'OTROS','Tres');
    expect(api.asignarCategoria.calls.count()).toBe(1);
  });
  it('una categorización antigua no recarga ni abre un editor en otra empresa',()=>{
    const antigua=new Subject<any>(); api.asignarCategoria.and.returnValue(antigua);
    page.cambiarCategoriaFila({nit:'900'} as any,'OTROS','Empresa A');
    ctx.empresaId.set(36); page.cargar();
    page.editingNit.set('empresa-b'); api.resumenModulo.calls.reset();
    antigua.next({});
    expect(page.editingNit()).toBe('empresa-b');
    expect(api.resumenModulo).not.toHaveBeenCalled();
  });
  it('no escribe detalles sin cambios ni para otra categoría',()=>{
    page.onDetalleCategoria({nit:'900',categoria:'OTROS',categoriaDetalle:'Igual'} as any,{target:{value:'Igual'}} as any);
    page.onDetalleCategoria({nit:'900',categoria:'ABARROTES'} as any,{target:{value:'Texto'}} as any);
    expect(api.asignarCategoria).not.toHaveBeenCalled();
  });

  it('pide detalle antes de persistir OTROS y envía categoría y detalle juntos',()=>{
    const mov={nit:'900',categoria:'ABARROTES',categoriaDetalle:null} as any;
    page.abrirCategoria(mov);
    page.onCambioCategoria(mov,{target:{value:'OTROS'}} as any);
    expect(api.asignarCategoria).not.toHaveBeenCalled();
    expect(page.categoriaOtrosPendiente()).toBe('900');
    page.onDetalleCategoria(mov,{target:{value:'Gasto especial'}} as any);
    expect(api.asignarCategoria).toHaveBeenCalledWith(35,'900','OTROS','Gasto especial',page.cfg.modulo);
  });

  it('envía búsqueda general sin convertirla en NIT exacto y pagina como el origen',()=>{
    page.busqueda.set('Proveedor parcial'); page.cargarPagina(35);
    const filtros=api.movimientos.calls.mostRecent().args[2];
    expect(filtros.busqueda).toBe('Proveedor parcial');
    expect(filtros.nit).toBeUndefined();
    expect(filtros.size).toBe(15);
  });
  it('limpieza exige permiso, confirmación y evita doble envío',()=>{

    api.limpiarModulo.and.returnValue(new Subject());
    (ctx.tienePermiso as jasmine.Spy).and.returnValue(false);
    page.limpiar(); expect(page.confirmarLimpieza()).toBeFalse();
    (ctx.tienePermiso as jasmine.Spy).and.returnValue(true);
    page.limpiar(); expect(page.confirmarLimpieza()).toBeTrue();
    expect(api.limpiarModulo).not.toHaveBeenCalled();
    page.limpiar(true); page.limpiar(true);
    expect(api.limpiarModulo.calls.count()).toBe(1);
  });
  it('ignora finalización de limpieza de una empresa anterior',()=>{

    const respuesta=new Subject<any>(); api.limpiarModulo.and.returnValue(respuesta);
    page.limpiar(); page.limpiar(true); ctx.empresaId.set(36); page.cargar();
    const recargar=spyOn(page,'cargar'); respuesta.next({ok:true});
    expect(recargar).not.toHaveBeenCalled(); expect(page.limpiando()).toBeFalse();
  });

  it('carga los comprobantes de legalización de los anticipos visibles',()=>{
    page.cfg=MODULOS_CFG.find(m=>m.modulo==='anticipos')!;
    legal.listar.and.returnValue(of([{id:5,movimientoId:9,nit:'900',archivoNombre:'legalizacion.pdf'}]));
    api.movimientos.and.returnValue(of({content:[{id:9}],totalElements:1}));
    page.cargarPagina(35);
    expect(legal.listar).toHaveBeenCalledWith(35,[9]);
    expect(page.legalizacionesDe({id:9} as any).length).toBe(1);
    expect(page.legalizacionesDe({id:10} as any).length).toBe(0);
  });

  it('no consulta legalizaciones fuera del módulo Anticipos',()=>{
    api.movimientos.and.returnValue(of({content:[{id:9}],totalElements:1}));
    page.cargarPagina(35);
    expect(legal.listar).not.toHaveBeenCalled();
  });

  it('registra el comprobante y refresca los soportes del anticipo',()=>{
    ctx.permisos.set({permisos:['modulos.importar']} as any);
    page.cfg=MODULOS_CFG.find(m=>m.modulo==='anticipos')!;
    page.pagina.set({content:[{id:9}],totalElements:1} as any);
    const mov={id:9,nombre:'PROVEEDOR UNO'} as any;
    const file={name:'legalizacion.pdf',size:1024} as any;
    legal.registrar.and.returnValue(of({id:6,movimientoId:9}));
    page.abrirLegalizar(mov);
    page.archivoLegalizar.set(file);
    page.valorLegalizar='250.000,50'; page.observacionLegalizar='Factura de mayo';
    page.registrarLegalizacion();
    expect(legal.registrar).toHaveBeenCalledWith(35,9,file,250000.5,'Factura de mayo');
    expect(page.legalizarAbierto()).toBeTrue();
    expect(page.archivoLegalizar()).toBeNull();
    expect(toast.mostrar).toHaveBeenCalled();
    expect(legal.listar).toHaveBeenCalledWith(35,[9]);
  });

  it('quita el comprobante y recarga soportes, saldo y datos del módulo',()=>{
    ctx.permisos.set({permisos:['modulos.importar']} as any);
    page.cfg=MODULOS_CFG.find(m=>m.modulo==='anticipos')!;
    page.pagina.set({content:[{id:9}],totalElements:1} as any);
    const l={id:5,movimientoId:9,archivoNombre:'legalizacion.pdf',anulada:false} as any;
    page.quitarConfirm.set(l);
    api.movimientos.and.returnValue(of({content:[{id:9,saldo:100}],totalElements:1}));
    api.resumenModulo.and.returnValue(of({totalSaldo:100}));
    page.quitar();
    expect(legal.quitar).toHaveBeenCalledWith(35,5);
    expect(page.quitarConfirm()).toBeNull();
    expect(toast.mostrar).toHaveBeenCalledWith('Comprobante quitado · legalizacion.pdf');
    expect(legal.listar).toHaveBeenCalledWith(35,[9]);
    expect(page.resumen()?.totalSaldo).toBe(100);
    expect(page.pagina()?.content[0].saldo).toBe(100);
    expect(page.estaLegalizado({id:9} as any)).toBeFalse();
  });

  it('no quita sin selección ni permiso ni un comprobante histórico',()=>{
    page.quitar();
    page.quitarConfirm.set({id:5,anulada:false} as any); page.quitar();
    ctx.permisos.set({permisos:['modulos.importar']} as any);
    page.quitarConfirm.set({id:5,anulada:true} as any); page.quitar();
    expect(legal.quitar).not.toHaveBeenCalled();
  });

  it('la anulada no cuenta para el badge Legalizado del movimiento',()=>{
    page.cfg=MODULOS_CFG.find(m=>m.modulo==='anticipos')!;
    api.movimientos.and.returnValue(of({content:[{id:9}],totalElements:1}));
    legal.listar.and.returnValue(of([
      {id:5,movimientoId:9,archivoNombre:'anulada.pdf',anulada:true,motivoAnulacion:'Error de carga'},
      {id:6,movimientoId:9,archivoNombre:'vigente.pdf',anulada:false},
    ]));
    page.cargarPagina(35);
    const mov={id:9} as any;
    expect(page.estaLegalizado(mov)).toBeTrue();
    expect(page.legalizacionesVigentes(mov).length).toBe(1);
    expect(page.legalizacionesAnuladas(mov).length).toBe(1);
    legal.listar.and.returnValue(of([{id:5,movimientoId:9,archivoNombre:'anulada.pdf',anulada:true}]));
    page.cargarPagina(35);
    expect(page.estaLegalizado(mov)).toBeFalse();
    expect(page.legalizacionesVigentes(mov).length).toBe(0);
  });

  it('formatea miles y limita a dos decimales sin perder la coma al escribir', () => {

    expect(page.formatearValorMiles('1500000,50')).toBe('1.500.000,50');
    expect(page.formatearValorMiles('1500000,')).toBe('1.500.000,');
    expect(page.formatearValorMiles('1.500.000,509')).toBe('1.500.000,50');
    expect(page.formatearValorMiles(',5')).toBe('0,5');
    expect(page.formatearValorMiles('')).toBe('');
  });

  it('parsea el importe colombiano y rechaza cero, negativos y texto inválido', () => {

    expect(page.parsearValorMiles('1.500.000,50')).toBe(1500000.5);
    for (const v of ['', '0', '-1', 'abc', '1,234', '1,2,3', 'Infinity']) {
      expect(page.parsearValorMiles(v)).withContext(v).toBeNull();
    }
  });

  it('rechaza importes inválidos antes de registrar y permite dejarlos vacíos', () => {

    ctx.permisos.set({permisos:['modulos.importar']} as any);
    page.abrirLegalizar({id:9,nombre:'Proveedor'} as any);
    page.archivoLegalizar.set(new File(['%PDF-1.7'], 'soporte.pdf', {type: 'application/pdf'}));
    legal.registrar.and.returnValue(of({} as any));
    page.valorLegalizar = '0'; page.registrarLegalizacion();
    expect(legal.registrar).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('El valor legalizado debe ser mayor a cero, o puedes dejarlo vacío.');
    page.valorLegalizar = ''; page.registrarLegalizacion();
    expect(legal.registrar.calls.mostRecent().args[3]).toBeNull();
  });

  it('limpia el importe al abrir el modal y quitar el archivo', () => {

    page.valorLegalizar = '1.000,50'; page.abrirLegalizar({id:9,nombre:'Proveedor'} as any);
    expect(page.valorLegalizar).toBe('');
    page.valorLegalizar = '2.000,50'; page.quitarArchivoLegalizar();
    expect(page.valorLegalizar).toBe('');
  });

  it('abre antes de consultar, muestra el blob y libera la URL al minuto', fakeAsync(() => {

    const respuesta = new Subject<HttpResponse<Blob>>();
    const ventana = {opener: {}, close: jasmine.createSpy('close'), location: {replace: jasmine.createSpy('replace')}};
    spyOn(window, 'open').and.returnValue(ventana as any);
    const blob = new Blob(['%PDF-1.7'], {type: 'application/pdf'});
    spyOn(URL, 'createObjectURL').and.returnValue('blob:comprobante');
    spyOn(URL, 'revokeObjectURL');
    legal.contenidosArchivo.and.callFake(() => { expect(window.open).toHaveBeenCalledWith('about:blank', '_blank'); return respuesta; });
    page.verDocumentoLegalizacion({id:5} as any);
    expect(ventana.opener).toBeNull();
    expect(legal.contenidosArchivo).toHaveBeenCalledWith(35,5);
    respuesta.next(new HttpResponse({body:blob}));
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(ventana.location.replace).toHaveBeenCalledWith('blob:comprobante');
    tick(59999); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    tick(1); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante');
  }));

  it('cierra la pestaña ante respuesta vacía o fallida y error de descarga', () => {

    const ventana = {close: jasmine.createSpy('close')};
    spyOn(window, 'open').and.returnValue(ventana as any);
    for (const respuesta of [new HttpResponse<Blob>(), new HttpResponse({body:new Blob([])}), new HttpResponse({status:500,body:new Blob(['error'])})]) {
      legal.contenidosArchivo.and.returnValue(of(respuesta));
      page.verDocumentoLegalizacion({id:5} as any);
    }
    const fallo = new Subject<HttpResponse<Blob>>();
    legal.contenidosArchivo.and.returnValue(fallo);
    page.verDocumentoLegalizacion({id:5} as any); fallo.error({status:403});
    expect(ventana.close).toHaveBeenCalledTimes(4);
    expect(toast.error).toHaveBeenCalledTimes(4);
    expect(toast.error).toHaveBeenCalledWith('No se pudo abrir el comprobante de legalización. Intenta de nuevo.');
  });

  it('descarta el PDF si cambia la empresa durante la descarga', () => {

    const respuesta = new Subject<HttpResponse<Blob>>();
    const ventana = {close:jasmine.createSpy('close'),location:{replace:jasmine.createSpy('replace')}};
    spyOn(window, 'open').and.returnValue(ventana as any);
    spyOn(URL,'createObjectURL');
    legal.contenidosArchivo.and.returnValue(respuesta);
    page.verDocumentoLegalizacion({id:5} as any); ctx.empresaId.set(36);
    respuesta.next(new HttpResponse({body:new Blob(['%PDF-1.7'])}));
    expect(ventana.close).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('avisa si el navegador bloquea la pestaña del comprobante', () => {

    spyOn(window, 'open').and.returnValue(null);
    spyOn(URL, 'createObjectURL');
    legal.contenidosArchivo.and.returnValue(of(new HttpResponse({body:new Blob(['%PDF-1.7'])})));
    page.verDocumentoLegalizacion({id:5} as any);
    expect(toast.error).toHaveBeenCalledWith('Permite las ventanas emergentes y vuelve a abrir el comprobante.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('evita doble eliminación y Esc respeta la petición en curso', () => {

    ctx.permisos.set({permisos:['modulos.importar']} as any);
    const respuesta = new Subject<void>(); legal.quitar.and.returnValue(respuesta);
    page.quitarConfirm.set({id:5,anulada:false} as any);
    page.quitar(); page.quitar(); page.onEscapeLegalizacion();
    expect(legal.quitar).toHaveBeenCalledTimes(1);
    expect(page.quitarConfirm()).not.toBeNull();
    respuesta.error({status:500});
    expect(page.quitando()).toBeFalse();
    page.onEscapeLegalizacion();
    expect(page.quitarConfirm()).toBeNull();
  });
});


describe('Contrato HTTP de comprobantes de legalización', () => {
  let http: HttpTestingController;
  let api: GpAnticipoLegalizacionService;
  beforeEach(() => {
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    http=TestBed.inject(HttpTestingController); api=TestBed.inject(GpAnticipoLegalizacionService);
  });
  afterEach(() => {http.verify();TestBed.resetTestingModule();});
  it('consulta el stream como respuesta Blob con empresaId', () => {
    const blob=new Blob(['%PDF-1.7'],{type:'application/pdf'});
    api.contenidosArchivo(35,7).subscribe(r => {expect(r.ok).toBeTrue();expect(r.body).toBe(blob);});
    const request=http.expectOne(r => r.url===environment.gpApiUrl+'/anticipos/legalizaciones/7/archivo/contenido');
    expect(request.request.method).toBe('GET'); expect(request.request.params.get('empresaId')).toBe('35');
    expect(request.request.responseType).toBe('blob'); request.flush(blob);
  });
  it('quita con DELETE y empresaId sin motivo ni cuerpo', () => {
    api.quitar(35,7).subscribe();
    const request=http.expectOne(r => r.url===environment.gpApiUrl+'/anticipos/legalizaciones/7');
    expect(request.request.method).toBe('DELETE');expect(request.request.params.get('empresaId')).toBe('35');
    expect(request.request.body).toBeNull();request.flush(null,{status:204,statusText:'No Content'});
  });
});
