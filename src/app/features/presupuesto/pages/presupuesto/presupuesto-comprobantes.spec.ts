import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { PresupuestoPageComponent } from './presupuesto-page.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
describe('Comprobantes pagados en presupuesto', () => {
  let page: PresupuestoPageComponent, ctx: PresupuestoContextService, api: any;
  beforeEach(() => {
    TestBed.configureTestingModule({providers:[
      {provide:DomSanitizer,useValue:{bypassSecurityTrustResourceUrl:(url:string)=>url}},
      provideHttpClient(), provideHttpClientTesting(),
    ]});
    api=jasmine.createSpyObj('API',['comprobantesPago']);
    ctx=new PresupuestoContextService(api);
    page=TestBed.runInInjectionContext(()=>new PresupuestoPageComponent(ctx,api,{} as any));
    spyOn(page,'cargar').and.resolveTo();TestBed.flushEffects();ctx.empresaId.set(7);
  });
  afterEach(()=>{page.ngOnDestroy();TestBed.resetTestingModule();});
  it('abre el visor con el documento del pago de la empresa y mes de la celda',()=>{
    api.comprobantesPago.and.returnValue(of([{nombre:'pago.pdf',url:'https://example.test/pago'}]));
    page.verComprobantes('proveedores','2026-08','123');
    expect(api.comprobantesPago).toHaveBeenCalledWith(7,'2026-08','proveedores','123',undefined);
    expect(page.documentoPago()).toBe('https://example.test/pago' as any);
    expect(page.comprobantesAbiertos()).toBeTrue();expect(page.cargandoComprobantes()).toBeFalse();
  });
  it('informa cuando un pago anterior no tiene comprobante de tesorería',()=>{
    api.comprobantesPago.and.returnValue(of([]));page.verComprobantes('nomina','2026-08',undefined,'Planilla seguridad social');
    expect(page.errorComprobante()).toContain('No hay un comprobante');expect(page.documentoPago()).toBeNull();
  });
  it('descarta documentos de una empresa anterior',()=>{
    const respuesta=new Subject<any>();api.comprobantesPago.and.returnValue(respuesta);
    page.verComprobantes('proveedores','2026-08','123');ctx.empresaId.set(8);
    respuesta.next([{nombre:'ajeno.pdf',url:'https://example.test/ajeno'}]);expect(page.documentoPago()).toBeNull();
  });
});
