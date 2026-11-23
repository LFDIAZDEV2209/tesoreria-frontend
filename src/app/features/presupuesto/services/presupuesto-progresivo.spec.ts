import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/services/auth.service';
import { GpSessionService } from './gp-session.service';
import { PresupuestoService } from './presupuesto.service';

describe('Contrato HTTP del presupuesto progresivo', () => {
  let api: PresupuestoService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: {} }, { provide: GpSessionService, useValue: {} },
    ] });
    api = TestBed.inject(PresupuestoService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('solicita sólo el resumen al entrar y conserva los totales sin descargar detalles', () => {
    api.mensual(51, false, true).subscribe(m => {
      expect(m.proveedores.detalle).toEqual([]);
      expect(m.proveedores.totalElements).toBe(201);
      expect(m.totalesGlobales?.totalPagoSugerido).toBe(1234.56);
    });
    const req = http.expectOne(r => r.url.endsWith('/presupuesto/mensual'));
    expect(req.request.params.get('empresaId')).toBe('51');
    expect(req.request.params.get('resumen')).toBe('true');
    req.flush({ proveedores: { detalle: [], total_elements: 201 }, totales_globales: { total_pago_sugerido: 1234.56 } });
    http.expectNone(r => r.url.includes('/secciones/'));
  });

  it('envía los filtros y página al servidor y conserva totales de toda la selección', () => {
    api.mensualSeccion(51, 'proveedores', { page: 2, size: 50, categoria: 'OTROS', busqueda: 'proveedor' }).subscribe(s => {
      expect(s.totalElements).toBe(123); expect(s.page).toBe(2);
      expect(s.detalle.length).toBe(1); expect(s.totales?.['pagoSugerido']).toBe(400.75);
    });
    const req = http.expectOne(r => r.url.endsWith('/presupuesto/mensual/secciones/proveedores'));
    expect(req.request.params.keys().sort()).toEqual(['busqueda', 'categoria', 'empresaId', 'page', 'size']);
    expect(req.request.params.get('page')).toBe('2'); expect(req.request.params.get('size')).toBe('50');
    expect(req.request.params.get('busqueda')).toBe('proveedor'); expect(req.request.params.get('categoria')).toBe('OTROS');
    req.flush({ detalle: [{ nit: '1', nombre: 'proveedor', total: 300 }], total_elements: 123, page: 2, total_pages: 3, totales: { pago_sugerido: 400.75 } });
  });

  it('mantiene compatible la descarga completa mensual y los importes de pagos paginados', () => {
    api.mensual(51).subscribe();
    const mensual = http.expectOne(r => r.url.endsWith('/presupuesto/mensual'));
    expect(mensual.request.params.has('resumen')).toBeFalse(); mensual.flush({});
    api.mensualSeccion(51, 'provisiones').subscribe(s => {
      expect(s.totales?.['montoPagado']).toBe(100.25);
      expect(s.totales?.['montoPendiente']).toBe(200.5);
      expect(s.detalle[0].total).toBe(300.75);
    });
    const pagos = http.expectOne(r => r.url.endsWith('/presupuesto/mensual/secciones/provisiones'));
    pagos.flush({ detalle: [{ nombre: 'Beneficiario', total: 300.75 }], totales: { monto_pagado: 100.25, monto_pendiente: 200.5 } });
  });

  it('aborta categorías sin lectores y conserva el catálogo completado en caché', () => {
    const cancelada = api.categorias().subscribe();
    const antigua = http.expectOne(r => r.url.endsWith('/categorias/lista'));
    cancelada.unsubscribe(); expect(antigua.cancelled).toBeTrue();
    const resultados: string[][] = [];
    const primera = api.categorias().subscribe(valores => resultados.push(valores));
    api.categorias().subscribe(valores => resultados.push(valores));
    const compartida = http.expectOne(r => r.url.endsWith('/categorias/lista'));
    primera.unsubscribe(); expect(compartida.cancelled).toBeFalse();
    compartida.flush(['OTROS']);
    api.categorias().subscribe(valores => resultados.push(valores));
    http.expectNone(r => r.url.endsWith('/categorias/lista'));
    expect(resultados).toEqual([['OTROS'], ['OTROS']]);
  });
});
