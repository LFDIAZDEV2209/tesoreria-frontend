import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { ModuloAnual } from '../../models/modulo-anual.model';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { GpModuloAnualComponent } from './gp-modulo-anual.component';

const consolidado = (): ModuloAnual => ({
  empresaId: 1, anio: null, anios: [2026], meses: ['2026-02', '2026-01'],
  filas: [
    { nit: '900.100-5', nombre: 'Alimentos Unión SAS', categoria: 'FRUVER',
      valores: { '2026-01': { saldo: 100, debito: 120, credito: 20 }, '2026-02': { saldo: 200, debito: 210, credito: 10 } },
      totalAnio: { saldo: 300, debito: 330, credito: 30 } },
    { nit: '901', nombre: 'Distribuidora Sur', categoria: 'LACTEOS',
      valores: { '2026-01': { saldo: -40, debito: 10, credito: 50 } },
      totalAnio: { saldo: -40, debito: 10, credito: 50 } },
    { nit: null, nombre: 'Auxiliar Norte', categoria: null,
      valores: { '2026-02': { saldo: 25, debito: 30, credito: 5 } },
      totalAnio: { saldo: 25, debito: 30, credito: 5 } },
  ],
  totalesMes: { '2026-01': { saldo: 60, debito: 130, credito: 70 }, '2026-02': { saldo: 225, debito: 240, credito: 15 } },
  totalGeneral: { saldo: 285, debito: 370, credito: 85 },
});

describe('Filtros del consolidado de todos los meses', () => {
  let fixture: ComponentFixture<GpModuloAnualComponent>;
  let component: GpModuloAnualComponent;
  let empresaId: ReturnType<typeof signal<number | null>>;
  let api: jasmine.SpyObj<PresupuestoService>;

  beforeEach(async () => {
    empresaId = signal<number | null>(1);
    api = jasmine.createSpyObj<PresupuestoService>('PresupuestoService', ['moduloAnual', 'provisionesAnual']);
    api.moduloAnual.and.returnValue(of(consolidado()));
    api.provisionesAnual.and.returnValue(of(consolidado()));
    TestBed.configureTestingModule({
      imports: [GpModuloAnualComponent, NoopAnimationsModule],
      providers: [
        { provide: PresupuestoService, useValue: api },
        { provide: PresupuestoContextService, useValue: { empresaId, nombreEmpresa: () => 'Empresa de prueba' } },
        { provide: PresupuestoToastService, useValue: { error: jasmine.createSpy('error') } },
      ],
    });
    fixture = TestBed.createComponent(GpModuloAnualComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('modulo', 'proveedores');
    fixture.autoDetectChanges();
    await fixture.whenStable();
  });

  afterEach(() => { fixture.destroy(); TestBed.resetTestingModule(); });

  async function buscar(texto: string): Promise<void> {
    const input = fixture.nativeElement.querySelector('app-gp-filtros input[type="text"]') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('muestra la barra mensual y busca por nombre o NIT sin nuevas consultas', async () => {
    expect(fixture.nativeElement.querySelector('app-gp-filtros')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeNull();
    await buscar('  UNIÓN  ');
    expect(component.filasFiltradas().map(fila => fila.nombre)).toEqual(['Alimentos Unión SAS']);
    expect(fixture.nativeElement.querySelectorAll('.anual-tabla tbody tr').length).toBe(1);
    await buscar('900.100');
    expect(component.terceros()).toBe(1);
    expect(api.moduloAnual).toHaveBeenCalledTimes(1);
    expect(component.categorias()).toEqual(['FRUVER', 'LACTEOS']);
  });

  it('combina categoría y búsqueda, y conserva totales coherentes al cambiar de importe', async () => {
    component.onFiltro({ campo: 'categoria', valor: 'LACTEOS' });
    await buscar('sur');
    expect(component.terceros()).toBe(1);
    expect(component.totalGeneral()).toBe(-40);
    expect(component.promedioMes()).toBe(-20);
    expect(component.totalesMesFiltrados()['2026-02']).toEqual({ saldo: 0, debito: 0, credito: 0 });
    expect(component.mejorMes()).toEqual({ mes: '2026-02', valor: 0 });
    component.medida.set('debito');
    expect(component.totalGeneral()).toBe(10);
    expect(component.mejorMes()).toEqual({ mes: '2026-01', valor: 10 });
    component.medida.set('credito');
    await fixture.whenStable();
    expect(component.totalGeneral()).toBe(50);
    const celdas = fixture.nativeElement.querySelectorAll('.anual-tabla tfoot td') as NodeListOf<HTMLTableCellElement>;
    expect(Array.from(celdas, celda => celda.textContent?.trim())).toEqual([component.cp(50), component.cp(0), component.cp(50)]);
  });

  it('distingue una búsqueda sin coincidencias y permite recuperar todos los terceros', async () => {
    await buscar('tercero inexistente');
    expect(component.terceros()).toBe(0);
    expect(component.tercerosTotal()).toBe(3);
    expect(component.totalGeneral()).toBe(0);
    expect(component.mejorMes()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Sin resultados');
    expect(fixture.nativeElement.textContent).not.toContain('Sin movimientos en este periodo');
    const limpiar = fixture.nativeElement.querySelector('app-gp-empty-state button') as HTMLButtonElement;
    limpiar.click();
    await fixture.whenStable();
    expect(component.busqueda()).toBe('');
    expect(component.categoria()).toBe('');
    expect(component.terceros()).toBe(3);
    expect(component.totalGeneral()).toBe(285);
    expect(fixture.nativeElement.querySelectorAll('.anual-tabla tbody tr').length).toBe(3);
  });

  it('filtra secciones de provisiones y limpia filtros al cambiar de empresa o módulo', async () => {
    const provisiones = consolidado();
    provisiones.filas[0] = { ...provisiones.filas[0], seccion: 'PÓLIZAS', categoria: 'OTROS' };
    api.provisionesAnual.and.returnValue(of(provisiones));
    component.onFiltro({ campo: 'categoria', valor: 'FRUVER' });
    fixture.componentRef.setInput('modulo', 'provisiones');
    await fixture.whenStable();
    expect(component.categoria()).toBe('');
    expect(component.categorias()).toEqual(['LACTEOS', 'PÓLIZAS']);
    component.onFiltro({ campo: 'categoria', valor: 'PÓLIZAS' });
    expect(component.filasFiltradas().map(fila => fila.nit)).toEqual(['900.100-5']);
    component.busqueda.set('unión');
    empresaId.set(2);
    await fixture.whenStable();
    expect(component.busqueda()).toBe('');
    expect(component.categoria()).toBe('');
    expect(api.provisionesAnual).toHaveBeenCalledWith(2, null);
  });
});
