import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting,HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute,convertToParamMap,provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { signal } from '@angular/core';
import { PresupuestoContextService } from '../../../services/presupuesto-context.service';
import { GpPeriodoService } from '../../../services/gp-periodo.service';
import { AuthorizationService } from '../../../../../core/services/authorization.service';
import { CompararPresupuestosPageComponent,mesAnterior } from './comparar-presupuestos-page.component';
import { ejemploSeptiembre } from './ejemplo-septiembre';

describe('Dos presupuestos independientes',()=>{
  let api:HttpTestingController,ctx:PresupuestoContextService,periodos:any,params:BehaviorSubject<any>;
  const foto=(periodo:string)=>{const foto=ejemploSeptiembre({id:56,name:'Empresa'},'2026-09');foto.historico={...foto.historico,id:152,periodo};foto.vista.contrato={...foto.vista.contrato,numero_contrato:'CIERRE-'+periodo};return foto;};
  beforeEach(()=>{
    ctx=new PresupuestoContextService({} as any);ctx.empresaId.set(56);ctx.empresas.set([{id:56,name:'Empresa'}]);ctx.periodo.set('2026-10');
    periodos={historicos:signal({'2026-10':152,'2026-09':269}),loading:signal(false),error:signal(''),recargar:()=>{}};
    params=new BehaviorSubject(convertToParamMap({origen:'2026-10',destino:'2026-09'}));
    TestBed.configureTestingModule({imports:[CompararPresupuestosPageComponent,NoopAnimationsModule],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      {provide:ActivatedRoute,useValue:{queryParamMap:params}},{provide:PresupuestoContextService,useValue:ctx},{provide:GpPeriodoService,useValue:periodos},{provide:AuthorizationService,useValue:{hasAnyRole:()=>true}}]});
    api=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>{api.verify();TestBed.resetTestingModule();});
  it('consulta octubre y septiembre guardados en paneles separados sin generar ni escribir datos',async()=>{
    const f=TestBed.createComponent(CompararPresupuestosPageComponent);f.detectChanges();
    api.expectOne(r=>r.url.endsWith('/2026-10/historico/presupuesto')).flush(foto('2026-10'));
    api.expectOne(r=>r.url.endsWith('/2026-09/historico/presupuesto')).flush(foto('2026-09'));
    await f.whenStable();f.detectChanges();
    expect(f.componentInstance.paneles().map(p=>p.periodo)).toEqual(['2026-10','2026-09']);
    expect(f.componentInstance.paneles().every(p=>!!p.foto)).toBeTrue();
    expect(f.nativeElement.querySelectorAll('.gp-compare-panel').length).toBe(2);
    expect(f.nativeElement.textContent).toContain('Histórico consolidado');
    expect(f.nativeElement.querySelector('.gp-example-option')).toBeNull();
    expect(f.nativeElement.querySelectorAll('app-historico-presupuesto input:not([disabled])').length).toBe(0);f.destroy();
  });
  it('otro mes queda vacío y las respuestas anteriores no reemplazan la nueva selección',async()=>{
    const f=TestBed.createComponent(CompararPresupuestosPageComponent);f.detectChanges();
    const antigua=api.expectOne(r=>r.url.endsWith('/2026-10/historico/presupuesto'));
    api.expectOne(r=>r.url.endsWith('/2026-09/historico/presupuesto')).flush(foto('2026-09'));
    params.next(convertToParamMap({origen:'2026-10',destino:'2026-08'}));f.detectChanges();
    api.expectOne(r=>r.url.endsWith('/2026-10/historico/presupuesto')).flush(foto('2026-10'));
    antigua.flush(foto('2026-10'));await f.whenStable();f.detectChanges();
    expect(f.componentInstance.paneles()[1].periodo).toBe('2026-08');expect(f.componentInstance.paneles()[1].foto).toBeNull();
    expect(f.nativeElement.textContent).toContain('Sin datos en Agosto de 2026');f.destroy();
  });
  it('rechaza una respuesta que corresponde a otro mes',async()=>{
    const f=TestBed.createComponent(CompararPresupuestosPageComponent);f.detectChanges();
    api.expectOne(r=>r.url.endsWith('/2026-10/historico/presupuesto')).flush(foto('2026-09'));
    api.expectOne(r=>r.url.endsWith('/2026-09/historico/presupuesto')).flush(foto('2026-09'));
    await f.whenStable();f.detectChanges();expect(f.componentInstance.paneles()[0].foto).toBeNull();expect(f.componentInstance.paneles()[0].error).not.toBe('');f.destroy();
  });
  it('septiembre sin histórico permanece vacío y no se genera un ejemplo para otra empresa',async()=>{
    periodos.historicos.set({'2026-10':152});
    const f=TestBed.createComponent(CompararPresupuestosPageComponent);f.detectChanges();
    api.expectOne(r=>r.url.endsWith('/2026-10/historico/presupuesto')).flush(foto('2026-10'));
    await f.whenStable();f.detectChanges();expect(f.componentInstance.paneles()[1].foto).toBeNull();
    expect(f.nativeElement.textContent).toContain('Sin datos en Septiembre de 2026');f.destroy();
  });
  it('la fixture de pruebas no cambia la empresa y el mes anterior respeta el cambio de año',()=>{
    const empresa={id:56,name:'Empresa'};const muestra=ejemploSeptiembre(empresa,'2026-09');expect(muestra.vista.mensual['meses']).toEqual(['2026-09']);
    expect(muestra.historico.id).toBe(0);expect(empresa).toEqual({id:56,name:'Empresa'});expect(()=>ejemploSeptiembre(empresa,'2026-08')).toThrow();expect(mesAnterior('2026-01')).toBe('2025-12');
  });
});
