import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { filasExcelPanorama, importeExcel, PeriodosService } from './periodos.service';
describe('Validación del Excel resumen mensual',()=>{
  it('lee valores colombianos y conserva centavos',()=>{
    expect(importeExcel('$ 1.234.567,89')).toBe(1234567.89);
    expect(importeExcel('1.234')).toBe(1234);
    expect(importeExcel('1234.56')).toBe(1234.56);
    expect(importeExcel('')).toBeNull();
  });
  it('rechaza texto, valores no finitos y fracciones que perderían precisión',()=>{
    for(const valor of ['texto',Infinity,1.001,'$ 1,001',Number.MAX_VALUE])expect(()=>importeExcel(valor)).toThrowError();
    expect(()=>importeExcel('',true)).toThrowError();
  });
  it('acepta encabezados de la referencia y pendiente calculable',()=>{
    const filas=filasExcelPanorama([{'EmpresaId':8,Empresa:'NEXA','Contador':'Contador','Aprobado (total)':'100,50',Pagado:'30,25',Liquidez:'-10,50'}]);
    expect(filas[0]).toEqual({empresaId:8,empresa:'NEXA',contador:'Contador',aprobado:100.5,pagado:30.25,pendiente:null,liquidez:-10.5});
  });
  it('rechaza columnas faltantes, importes vacíos y pendiente inconsistente',()=>{
    expect(()=>filasExcelPanorama([{Empresa:'A',Pagado:10}])).toThrowError();
    expect(()=>filasExcelPanorama([{Empresa:'A',Aprobado:'',Pagado:10}])).toThrowError(/Fila 2/);
    expect(()=>filasExcelPanorama([{Empresa:'A',Aprobado:100,Pendiente:90,Pagado:20}])).toThrowError(/Pendiente/);
    expect(()=>filasExcelPanorama([{Empresa:'A',Aprobado:10,Pagado:20}])).toThrowError();
  });
  it('no interpreta EmpresaId como el nombre de la empresa y admite identificador sin nombre',()=>{
    expect(filasExcelPanorama([{EmpresaId:12,Aprobado:0,Pagado:0}])[0].empresaId).toBe(12);
    expect(()=>filasExcelPanorama([{EmpresaId:'x',Aprobado:0,Pagado:0}])).toThrowError();
  });
});
describe('API de periodos',()=>{
  let http:HttpTestingController,api:PeriodosService;
  beforeEach(()=>{TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});http=TestBed.inject(HttpTestingController);api=TestBed.inject(PeriodosService);});
  afterEach(()=>{http.verify();TestBed.resetTestingModule();});
  it('envía el periodo seleccionado y el archivo sin convertirlo en el mes del sistema',()=>{
    api.importar('2026-09','septiembre.xlsx',[{empresaId:1,empresa:'Empresa',contador:null,aprobado:100,pendiente:60,pagado:40,liquidez:null}]).subscribe();
    const request=http.expectOne(r=>r.url.endsWith('/periodos/2026-09/importar'));
    expect(request.request.method).toBe('POST');expect(request.request.body.archivo).toBe('septiembre.xlsx');request.flush(null);
  });
  it('compara dos meses explícitos, incluso cuando cambian de año',()=>{
    api.comparar('2025-12','2026-01').subscribe();
    const request=http.expectOne(r=>r.url.endsWith('/periodos/comparar'));expect(request.request.params.get('origen')).toBe('2025-12');expect(request.request.params.get('destino')).toBe('2026-01');request.flush({});
  });
});
