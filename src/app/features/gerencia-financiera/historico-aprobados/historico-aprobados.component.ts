import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PresupuestoService } from '../../presupuesto/services/presupuesto.service';
import { PresupuestoContextService } from '../../presupuesto/services/presupuesto-context.service';
import { HistoricoAprobacionItem, formatoCOP, formatearFechaCO } from '../../presupuesto/models/presupuesto.model';

@Component({
  selector: 'app-historico-aprobados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './historico-aprobados.component.html',
  styleUrls: ['./historico-aprobados.component.scss'],
})
export class HistoricoAprobadosComponent implements OnInit {
  readonly items = signal<HistoricoAprobacionItem[]>([]);
  readonly cargando = signal(false);
  readonly totalRegistros = signal(0);

  // Filtros
  readonly filtroTexto = signal('');
  readonly filtroModulo = signal('');
  readonly filtroEstado = signal('');
  readonly filtroDesde = signal('');
  readonly filtroHasta = signal('');
  readonly filtroMontoMin = signal<number | null>(null);
  readonly filtroMontoMax = signal<number | null>(null);
  readonly filtroOrden = signal<'desc' | 'asc'>('desc');

  // Paginación server-side
  page = 0;
  size = 20;

  readonly modulosDisponibles = [
    { id: '', label: 'Todos los módulos' },
    { id: 'proveedores', label: 'Proveedores' },
    { id: 'cx_pagar', label: 'Cuentas por Pagar' },
    { id: 'impuestos', label: 'Impuestos' },
    { id: 'anticipos', label: 'Anticipos' },
    { id: 'cx_cobrar', label: 'Cuentas por Cobrar' },
    { id: 'prestamos', label: 'Préstamos' },
    { id: 'provisiones', label: 'Provisiones' },
    { id: 'nomina', label: 'Nómina' },
    { id: 'estampillas', label: 'Estampillas' },
  ];

  readonly estadosDisponibles = [
    { id: '', label: 'Todos los estados' },
    { id: 'proyectado', label: 'Proyectado / Aprobado' },
    { id: 'pagado', label: 'Pagado' },
    { id: 'cancelado', label: 'Cancelado' },
  ];

  readonly totalPaginas = computed(() => {
    return Math.max(1, Math.ceil(this.totalRegistros() / this.size));
  });

  readonly sumaMontoFiltrado = computed(() => {
    return this.items().reduce((acc, curr) => acc + (curr.monto || 0), 0);
  });

  readonly hayFiltrosActivos = computed(() => {
    return !!(
      this.filtroTexto() ||
      this.filtroModulo() ||
      this.filtroEstado() ||
      this.filtroDesde() ||
      this.filtroHasta() ||
      this.filtroMontoMin() != null ||
      this.filtroMontoMax() != null
    );
  });

  private timerDebounce: any = null;

  constructor(
    private service: PresupuestoService,
    private route: ActivatedRoute,
    public ctx: PresupuestoContextService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(() => {
      this.page = 0;
      this.cargar();
    });
  }

  onInputTexto(valor: string): void {
    this.filtroTexto.set(valor);
    clearTimeout(this.timerDebounce);
    this.timerDebounce = setTimeout(() => {
      this.page = 0;
      this.cargar();
    }, 350);
  }

  onFiltroChange(): void {
    this.page = 0;
    this.cargar();
  }

  limpiarFiltros(): void {
    this.filtroTexto.set('');
    this.filtroModulo.set('');
    this.filtroEstado.set('');
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroMontoMin.set(null);
    this.filtroMontoMax.set(null);
    this.filtroOrden.set('desc');
    this.page = 0;
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    const empresaId = Number(this.route.snapshot.queryParamMap.get('empresaId')) || this.ctx.empresaId() || undefined;
    try {
      const resp = await firstValueFrom(
        this.service.obtenerHistoricoAprobaciones({
          empresaId,
          desde: this.filtroDesde() || undefined,
          hasta: this.filtroHasta() || undefined,
          tercero: this.filtroTexto() || undefined,
          modulo: this.filtroModulo() || undefined,
          estado: this.filtroEstado() || undefined,
          montoMin: this.filtroMontoMin() ?? undefined,
          montoMax: this.filtroMontoMax() ?? undefined,
          orden: this.filtroOrden(),
          page: this.page,
          size: this.size,
        }),
      );
      this.items.set(resp.items);
      this.totalRegistros.set(resp.total);
    } catch (e) {
      console.error('Error al cargar histórico de aprobaciones:', e);
      this.items.set([]);
      this.totalRegistros.set(0);
    } finally {
      this.cargando.set(false);
    }
  }

  formatearFecha(f: string | null | undefined): string {
    return formatearFechaCO(f);
  }

  cambiarPagina(delta: number): void {
    const nueva = this.page + delta;
    if (nueva >= 0 && nueva < this.totalPaginas()) {
      this.page = nueva;
      this.cargar();
    }
  }

  cambiarSize(nuevoSize: number): void {
    this.size = Number(nuevoSize);
    this.page = 0;
    this.cargar();
  }

  formatear(v: number | null | undefined): string {
    return formatoCOP(v);
  }

  moduloColorClass(mod: string): string {
    const m = (mod || '').toLowerCase();
    if (m.includes('prov')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (m.includes('cx_pagar')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (m.includes('impuest')) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (m.includes('antici')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (m.includes('prest')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (m.includes('nom')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-50 text-slate-700 border-slate-200';
  }

  estadoColorClass(est: string): string {
    const e = (est || '').toUpperCase();
    if (e === 'APROBADO') return 'bg-emerald-100 text-emerald-800';
    if (e === 'PAGADO') return 'bg-blue-100 text-blue-800';
    if (e === 'ANULADO') return 'bg-rose-100 text-rose-800';
    return 'bg-amber-100 text-amber-800';
  }
}
