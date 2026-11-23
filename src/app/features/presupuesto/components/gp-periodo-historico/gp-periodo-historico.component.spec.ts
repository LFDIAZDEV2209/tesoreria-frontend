import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting,HttpTestingController } from '@angular/common/http/testing';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { GpPeriodoHistoricoComponent } from './gp-periodo-historico.component';

describe('Lectura histórica por período',()=>{
  let ctx:PresupuestoContextService,api:HttpTestingController;
  beforeEach(()=>{
    ctx=new PresupuestoContextService({} as any);ctx.empresaId.set(56);ctx.periodo.set('2026-10');
    TestBed.configureTestingModule({imports:[GpPeriodoHistoricoComponent,NoopAnimationsModule],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),{provide:AuthorizationService,useValue:{hasAnyRole:()=>true}},{provide:PresupuestoContextService,useValue:ctx}]});
    api=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>{api.verify();TestBed.resetTestingModule();});
  const respuesta=(periodo:string,nombre:string)=>{const rows=[{id:1,nombre,nit:'123',categoria:'OTROS',saldo:100,fecha:periodo+'-15'}];return {historico:{empresaId:56,periodo,generadoEn:periodo+'-30'},presentacion:{empresa:{id:56,name:'Empresa'},categorias:['OTROS'],filas:rows},filas:{content:rows,page:0,size:50,totalElements:1,totalPages:1}};};
  it('cambiar el mes en la misma empresa borra la tabla anterior y solicita otra fotografía',async()=>{
    const f=TestBed.createComponent(GpPeriodoHistoricoComponent);f.componentRef.setInput('modulo','proveedores');f.componentRef.setInput('empresaId',56);f.componentRef.setInput('periodo','2026-10');f.detectChanges();
    api.expectOne(r=>r.url.endsWith('/2026-10/historico/proveedores')).flush(respuesta('2026-10','Sólo octubre'));f.detectChanges();await f.whenStable();f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sólo octubre');
    ctx.periodo.set('2026-09');f.componentRef.setInput('periodo','2026-09');f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Sólo octubre');
    api.expectOne(r=>r.url.endsWith('/2026-09/historico/proveedores')).flush(respuesta('2026-09','Sólo septiembre'));f.detectChanges();await f.whenStable();f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sólo septiembre');expect(f.nativeElement.textContent).not.toContain('Sólo octubre');f.destroy();
  });
  it('nunca muestra datos de otro período aunque la respuesta HTTP sea exitosa',()=>{
    const f=TestBed.createComponent(GpPeriodoHistoricoComponent);f.componentRef.setInput('modulo','proveedores');f.componentRef.setInput('empresaId',56);f.componentRef.setInput('periodo','2026-09');f.detectChanges();
    api.expectOne(r=>r.url.endsWith('/2026-09/historico/proveedores')).flush(respuesta('2026-10','Datos ajenos al mes'));f.detectChanges();
    expect(f.componentInstance.filas()).toBeNull();expect(f.nativeElement.textContent).not.toContain('Datos ajenos al mes');expect(f.componentInstance.error()).not.toBe('');f.destroy();
  });
  it('en Históricos consulta el cierre por su ID aunque el mes global sea otro y conserva la fecha original',async()=>{
    const f=TestBed.createComponent(GpPeriodoHistoricoComponent);f.componentRef.setInput('modulo','cuentas-pagar');f.componentRef.setInput('empresaId',56);f.componentRef.setInput('periodo','2026-09');f.componentRef.setInput('historicoId',269);f.detectChanges();
    const data=respuesta('2026-09','Factura anterior conservada');data.filas.content[0].fecha='2025-03-15';
    api.expectOne(r=>r.url.endsWith('/historicos/269/modulos/cuentas-pagar')).flush({...data,historico:{...data.historico,id:269}});f.detectChanges();await f.whenStable();f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Factura anterior conservada');expect(f.nativeElement.textContent).toContain('15/03/2025');f.destroy();
  });
});
