import { Observable } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TesoreriaService } from './tesoreria.service';
import { ControlEgresosService } from '../../../features/contabilidad/control-egresos/control-egresos.service';
describe('Tesorería: errores reales de API', () => {
 let service: TesoreriaService;
 let http: HttpTestingController;
 beforeEach(() => {
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),TesoreriaService]});
  service=TestBed.inject(TesoreriaService); http=TestBed.inject(HttpTestingController);
 });
 afterEach(()=>http.verify());
 for(const caso of [
  {nombre:'listado', ruta:'/movimientos', ejecutar:(s:TesoreriaService)=>s.getMovimientosPendientes({})},
  {nombre:'detalle', ruta:'/movimientos/1', ejecutar:(s:TesoreriaService)=>s.getMovimientoById(1)},
  {nombre:'vincular orden', ruta:'/conciliar', ejecutar:(s:TesoreriaService)=>s.vincularOc(1,'OC-2')},
  {nombre:'conciliación manual', ruta:'/conciliar', ejecutar:(s:TesoreriaService)=>s.marcarConciliadoManual(1)},
 ]) {
  it(caso.nombre+' no devuelve datos ni éxito simulado ante 403',()=>{
   let estado=0;
   (caso.ejecutar(service) as Observable<unknown>).subscribe({next:()=>fail('Una API denegada no puede producir datos o éxito'),error:e=>estado=e.status});
   http.expectOne(r=>r.url.endsWith(caso.ruta)).flush({message:'Sin permiso'},{status:403,statusText:'Forbidden'});
   expect(estado).toBe(403);
  });
 }
 it('no inventa un egreso cuando falla su registro',()=>{
  let estado=0;
  service.generarEgreso({movimientoId:1,proveedor:'Proveedor',valor:125}).subscribe({
   next:()=>fail('No debe generar un ID ficticio'),error:e=>estado=e.status});
  http.expectOne(r=>r.url.endsWith('/movimientos/1')).flush({id:1,cuenta:'12345',valor:125,fecha:'2026-09-21',banco:'Banco',estado:'PENDIENTE',tipoMovimiento:'TRANSFERENCIA'});
  http.expectOne(r=>r.url.endsWith('/egresos')).flush({message:'No registrado'},{status:500,statusText:'Error'});
  expect(estado).toBe(500);
 });
 it('no registra un egreso con una cuenta bancaria inventada',()=>{
  let error=false;
  service.generarEgreso({movimientoId:1,proveedor:'Proveedor',valor:125}).subscribe({next:()=>fail('No debe registrar'),error:()=>error=true});
  http.expectOne(r=>r.url.endsWith('/movimientos/1')).flush({id:1,cuenta:'',valor:125,fecha:'2026-09-21'});
  http.expectNone(r=>r.url.endsWith('/egresos'));
  expect(error).toBeTrue();
 });
 it('un error al verificar duplicados no se transforma en existe:false',()=>{
  let estado=0;
  TestBed.inject(ControlEgresosService).checkDuplicado('EGR-1','9011',125,'2026-09-21').subscribe({
    next:()=>fail('No se pudo verificar, no equivale a ausencia de duplicados'), error:e=>estado=e.status});
  http.expectOne(r=>r.url.endsWith('/check-duplicado')).flush({message:'Sin permiso'},{status:403,statusText:'Forbidden'});
  expect(estado).toBe(403);
 });
 it('adapta el detalle real de Viáticos al abrir una URL sin estado de navegación',()=>{
  service.getSolicitudViaticosTesoreriaById(1).subscribe(v=>{
   expect(v?.solicitudViaticosId).toBe(1); expect(v?.empresa).toBe('Empresa A');
   expect(v?.totalSolicitud).toBe(1500); expect(v?.valorComprobantePago).toBe(1500);
   expect(v?.numeroCuentaBancaria).toBe('12345');
  });
  http.expectOne(r=>r.url.endsWith('/viaticos/1')).flush({id:1,nombreEmpresa:'Empresa A',
   areaDependencia:'Pruebas',nombreCompleto:'Solicitante',fechaCreacion:'2026-09-21',
   totalGeneral:1500,valorComprobantePago:1500,numeroCuentaBancaria:'12345',estado:'PAGADO'});
 });

});
