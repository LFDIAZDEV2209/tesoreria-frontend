import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GpAuthInterceptor } from '../../../core/interceptors/gp-auth.interceptor';
import { PresupuestoContextService } from './presupuesto-context.service';
import { PresupuestoService } from './presupuesto.service';

describe('Exportación anual de documentos: contrato HTTP', () => {
  let http: HttpTestingController;
  let api: PresupuestoService;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [
      provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
      {provide: HTTP_INTERCEPTORS, useClass: GpAuthInterceptor, multi: true},
      {provide: PresupuestoContextService, useValue: {empresaId: () => 99, mesConsulta: () => '2026-10'}},
    ]});
    http = TestBed.inject(HttpTestingController);
    api = new PresupuestoService(TestBed.inject(HttpClient), {} as any, {} as any);
  });

  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  for (const [modulo, ruta] of [
    ['proveedores', 'proveedores'], ['anticipos', 'anticipos'],
    ['cx_pagar', 'cuentas-pagar'], ['cx_cobrar', 'cuentas-cobrar'], ['impuestos', 'impuestos'],
    ['provisiones', 'pagos-proyectados/provisiones'],
  ]) {
    it(`descarga ${modulo} con empresa, año y filtros explícitos sin limitarlo al mes operativo`, () => {
      const libro = new Blob(['documentos del servidor'], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      let descargado: Blob | undefined;
      api.exportarModuloAnual(modulo, 35, {anio: 2026, categoria: 'FRUVER', busqueda: '900123'}).subscribe(blob => descargado = blob);

      const req = http.expectOne(r => r.url === `/api/gp/${ruta}/anual/exportar`);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      expect(req.request.params.get('empresaId')).toBe('35');
      expect(req.request.params.get('anio')).toBe('2026');
      expect(req.request.params.get('categoria')).toBe('FRUVER');
      expect(req.request.params.get('busqueda')).toBe('900123');
      expect(req.request.params.keys().sort()).toEqual(['anio', 'busqueda', 'categoria', 'empresaId']);
      req.flush(libro);
      expect(descargado).toBe(libro);
    });
  }

  it('omite el año y filtros vacíos al solicitar documentos de todos los meses', () => {
    api.exportarModuloAnual('cx_cobrar', 35, {anio: null, categoria: '', busqueda: ''}).subscribe();
    const req = http.expectOne(r => r.url === '/api/gp/cuentas-cobrar/anual/exportar');
    expect(req.request.params.keys()).toEqual(['empresaId']);
    expect(req.request.params.get('empresaId')).toBe('35');
    req.flush(new Blob());
  });

  it('admite una descarga sin objeto de filtros y conserva todos los años', () => {
    api.exportarModuloAnual('proveedores', 35).subscribe();
    const req = http.expectOne(r => r.url === '/api/gp/proveedores/anual/exportar');
    expect(req.request.params.keys()).toEqual(['empresaId']);
    req.flush(new Blob());
  });

  it('el interceptor retira parámetros mensuales heredados de una descarga anual', () => {
    TestBed.inject(HttpClient).get('/api/gp/proveedores/anual/exportar', {
      params: {empresaId: 35, vistaMes: true, periodoConsulta: '2026-09'}, responseType: 'blob',
    }).subscribe();
    const req = http.expectOne(r => r.url === '/api/gp/proveedores/anual/exportar');
    expect(req.request.params.keys()).toEqual(['empresaId']);
    expect(req.request.params.get('empresaId')).toBe('35');
    req.flush(new Blob());
  });
});
