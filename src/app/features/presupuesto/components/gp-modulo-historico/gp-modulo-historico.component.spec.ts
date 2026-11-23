import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { HistoricoModuloFuenteService,HistoricoModuloVista } from '../../services/historico-modulo-fuente.service';
import { ModuloPageComponent } from '../../pages/modulo-page/modulo-page.component';
import { PagosProyectadosPageComponent } from '../../pages/pagos-proyectados/pagos-proyectados-page.component';
import { GpModuloHistoricoComponent } from './gp-modulo-historico.component';

const datos=():HistoricoModuloVista=>({historico:{id:152,empresaId:56,empresaNombre:'Conservada',periodo:'2026-10',generadoEn:'2026-10-06T10:00:00-05:00',usuarioId:1,usuarioNombre:'Gerente',versionFormato:1,sha256:'hash'},presentacion:{empresa:{id:56,name:'Conservada'},categorias:['FRUVER','OTROS'],filas:Array.from({length:31},(_,i)=>({id:i+1,nit:String(i),nombre:'Tercero '+i,categoria:i%2?'OTROS':'FRUVER',fecha:'2025-03-15',comprobante:'FACT-'+i,saldo:100,debito:100,credito:0,aprobada:true}))}});
describe('Vistas originales en solo lectura',()=>{
  let http:HttpTestingController,ctx:PresupuestoContextService;
  beforeEach(()=>{
    ctx=new PresupuestoContextService({} as any);ctx.empresaId.set(99);
    TestBed.configureTestingModule({imports:[GpModuloHistoricoComponent,NoopAnimationsModule],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{provide:PresupuestoContextService,useValue:ctx},{provide:AuthorizationService,useValue:{hasAnyRole:()=>true,isSuperAdmin:()=>true}}]});
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>{http.verify();TestBed.resetTestingModule();});
  for(const [modulo,codigo] of [['proveedores','proveedores'],['anticipos','anticipos'],['cuentas-pagar','cx_pagar'],['cuentas-cobrar','cx_cobrar'],['impuestos','impuestos']]){
    it('mantiene métricas, gráfica y tabla de '+modulo+' con filtros y paginación del cierre',async()=>{
      const f=TestBed.createComponent(GpModuloHistoricoComponent);f.componentRef.setInput('modulo',modulo);f.componentRef.setInput('datos',datos());f.detectChanges();await f.whenStable();f.detectChanges();
      const child=f.debugElement.query(By.directive(ModuloPageComponent)),page=child.componentInstance as ModuloPageComponent;
      expect(page.cfg.modulo).toBe(codigo);expect(page.resumen()?.totalSaldo).toBe(3100);expect(page.resumen()?.totalMovimientos).toBe(31);
      expect(f.nativeElement.querySelector('app-gp-kpi')).not.toBeNull();expect(f.nativeElement.querySelector('apx-chart')).not.toBeNull();expect(f.nativeElement.querySelector('.gp-thead')).not.toBeNull();
      expect(f.nativeElement.textContent).not.toContain('Importar período');expect(f.nativeElement.textContent).not.toContain('Limpiar workspace');expect(page.ctx.tienePermiso('modulos.categorizar')).toBeFalse();
      page.paginar(1);expect(page.pagina()?.content[0].id).toBe(16);page.onFiltro({campo:'categoria',valor:'OTROS'});expect(page.pagina()?.totalElements).toBe(15);
      const api=child.injector.get(PresupuestoService);await expectAsync(firstValueFrom(api.limpiarModulo(codigo,56))).toBeRejectedWithError('El histórico es de solo lectura.');
      expect(ctx.empresaId()).toBe(99);http.expectNone(()=>true);f.destroy();
    });
  }
  for(const modulo of ['otros-pagos','pagos-proyectados'])it('mantiene KPI y tarjetas de '+modulo+' sin edición ni permisos de Superadmin',async()=>{
    const foto=datos();foto.presentacion.filas=[{id:1,nit:'1',nombre:'Pago congelado',categoria:'FRUVER',modulo_origen:modulo==='otros-pagos'?'manual':'proveedores',monto_proyectado:500,fecha_proyectada:'2026-10-09',estado:'proyectado',aprobado:true,notas:'Nota original'}];
    const f=TestBed.createComponent(GpModuloHistoricoComponent);f.componentRef.setInput('modulo',modulo);f.componentRef.setInput('datos',foto);f.detectChanges();await f.whenStable();f.detectChanges();
    const page=f.debugElement.query(By.directive(PagosProyectadosPageComponent)).componentInstance as PagosProyectadosPageComponent;
    expect(f.nativeElement.querySelectorAll('app-gp-kpi').length).toBe(5);expect(page.resumen()?.proximos7Dias).toBe(500);expect(page.resumen()?.vencidos).toBe(0);expect(page.hoy).toBe('2026-10-06');
    expect(f.nativeElement.querySelector('.gp-payment-card')).not.toBeNull();expect(page.puedeOperar()).toBeFalse();expect(page.puedeAprobar).toBeFalse();expect(page.superadmin()).toBeFalse();
    page.abrirGrupo(page.gruposPagos()[0].id);f.detectChanges();expect(f.nativeElement.querySelector('input[name=numeroEgreso]')).toBeNull();
    http.expectNone(()=>true);f.destroy();
  });
  it('el cambio de fotografía reconstruye la vista y borra los valores anteriores',async()=>{
    const f=TestBed.createComponent(GpModuloHistoricoComponent);f.componentRef.setInput('modulo','anticipos');f.componentRef.setInput('datos',datos());f.detectChanges();await f.whenStable();
    const otra=datos();otra.historico={...otra.historico,id:269,periodo:'2026-09'};otra.presentacion.filas=[];
    f.componentRef.setInput('datos',otra);f.detectChanges();await f.whenStable();f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sin datos conservados');expect(f.nativeElement.textContent).not.toContain('Tercero 0');http.expectNone(()=>true);f.destroy();
  });
});

describe('Datos auxiliares del histórico anterior',()=>{
  it('exporta las filas y filtra fechas originales sin consultar el gestor actual',async()=>{
    const fuente=new HistoricoModuloFuenteService();fuente.datos=datos();
    fuente.datos.presentacion.filas[0]['fecha']='15/03/2025';
    expect(fuente.filtrar({fechaDesde:'2025-03-01',fechaHasta:'2025-03-31'}).length).toBe(31);
    const blob=await firstValueFrom(fuente.api.exportarModulo('proveedores',56,'OTROS','2025-03-01','2025-03-31'));
    const XLSX=await import('xlsx');const libro=XLSX.read(await blob.arrayBuffer(),{type:'array'});
    const rows=XLSX.utils.sheet_to_json(libro.Sheets['Histórico']) as any[];
    expect(rows.length).toBe(15);expect(rows.every(r=>r.Categoria==='OTROS')).toBeTrue();
  });
  it('agrupa las facturas, descarta ancladas y suma candidatos desde fuentes congeladas',()=>{
    const fuente=new HistoricoModuloFuenteService();fuente.datos=datos();fuente.modulo='pagos-proyectados';
    fuente.datos.presentacion.fuentes={movimientos:[{id:1,nit:'1',nombre:'Proveedor',modulo:'cx_pagar',comprobante:'F-1',saldo:-100,fecha_vencimiento:'2026-09-20'},{id:2,nit:'1',nombre:'Proveedor',modulo:'cx_pagar',comprobante:'F-1',saldo:20,fecha_vencimiento:'2026-09-25'}],pagos:[]};
    expect(fuente.facturas()[0].monto).toBe(80);expect(fuente.facturas()[0].vencida).toBeTrue();expect(fuente.candidatos()[0].disponible).toBe(80);
    fuente.datos.presentacion.fuentes['pagos']=[{movimiento_id:2,nit:'1',monto_proyectado:30,estado:'proyectado'}];
    expect(fuente.facturas()).toEqual([]);expect(fuente.candidatos()[0].disponible).toBe(50);
  });
});
