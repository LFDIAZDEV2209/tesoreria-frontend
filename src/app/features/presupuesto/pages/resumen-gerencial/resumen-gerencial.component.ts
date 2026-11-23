import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { gpFilaTabla, gpPop, gpStagger } from '../../animations/gp-animations';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { ResumenGerencial, formatoCOP } from '../../models/presupuesto.model';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpKpiComponent } from '../../components/gp-kpi/gp-kpi.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { msj } from '../modulo-page/modulo-page.component';

type OrdenCampo = 'nombre' | 'aprobado' | 'pendiente' | 'pagado' | 'liquidez';
type FiltroRapido = 'todas' | 'pendientes' | 'sin-config';

/**
 * "Todas las Empresas" — panorama conjunto para gerencia: empresas activas,
 * aprobado, pagado, pendiente y liquidez de cada contador. Clic en una fila =
 * elegir ese workspace y entrar a Pagos Proyectados.
 */
@Component({
  selector: 'app-resumen-gerencial',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    GpIconComponent, GpKpiComponent, GpSkeletonComponent,
    GpErrorStateComponent, GpEmptyStateComponent, GpPageHeaderComponent,
  ],
  animations: [gpStagger, gpPop, gpFilaTabla],
  templateUrl: './resumen-gerencial.component.html',
  styleUrls: ['./resumen-gerencial.component.scss'],
})
export class ResumenGerencialComponent implements OnInit {

  loading = signal(true);
  error = signal<string | null>(null);
  filas = signal<ResumenGerencial[]>([]);

  busqueda = signal('');
  filtro = signal<FiltroRapido>('todas');
  ordenCampo = signal<OrdenCampo>('aprobado');
  ordenDir = signal<'asc' | 'desc'>('desc');

  constructor(
    private service: PresupuestoService,
    private ctx: PresupuestoContextService,
    private toast: PresupuestoToastService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.resumenGerencial().subscribe({
      next: (filas) => {
        this.filas.set(filas);
        this.loading.set(false);
      },
      error: (e) => { this.error.set(msj(e)); this.loading.set(false); },
    });
  }

  // ── Totales globales ───────────────────────────────────────────────────

  empresas = computed(() => this.filas().length);

  totalAprobado = computed(() =>
    this.filas().reduce((acc, f) => acc + (f.totalAprobado ?? 0), 0));

  totalPagado = computed(() =>
    this.filas().reduce((acc, f) => acc + (f.totalPagado ?? 0), 0));

  totalPendiente = computed(() =>
    this.filas().reduce((acc, f) => acc + (f.totalPendientePago ?? 0), 0));

  totalLiquidez = computed(() =>
    this.filas().reduce((acc, f) => acc + (f.totalDisponible ?? 0), 0));

  /** % de lo aprobado que ya está pagado (0–100, redondeado). */
  pctGlobal = computed(() => {
    const base = this.totalAprobado();
    if (base <= 0) return 0;
    return Math.min(100, Math.round((this.totalPagado() / base) * 100));
  });

  conPendientes = computed(() =>
    this.filas().filter((f) => (f.totalPendientePago ?? 0) > 0).length);

  sinConfigurar = computed(() =>
    this.filas().filter((f) => f.totalDisponible === null).length);

  hayFiltros = computed(() => !!this.busqueda().trim() || this.filtro() !== 'todas');

  // ── Búsqueda + filtros rápidos + orden ─────────────────────────────────

  filtradas = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const filtro = this.filtro();
    const campo = this.ordenCampo();
    const dir = this.ordenDir() === 'asc' ? 1 : -1;

    const datos = this.filas().filter((f) => {
      if (q && !`${f.nombreEmpresa ?? ''} ${f.responsable ?? ''}`.toLowerCase().includes(q)) return false;
      if (filtro === 'pendientes') return (f.totalPendientePago ?? 0) > 0;
      if (filtro === 'sin-config') return f.totalDisponible === null;
      return true;
    });

    return [...datos].sort((a, b) => {
      switch (campo) {
        case 'nombre':
          return (a.nombreEmpresa ?? '').localeCompare(b.nombreEmpresa ?? '') * dir;
        case 'pendiente':
          return ((a.totalPendientePago ?? 0) - (b.totalPendientePago ?? 0)) * dir;
        case 'pagado':
          return ((a.totalPagado ?? 0) - (b.totalPagado ?? 0)) * dir;
        case 'liquidez':
          return ((a.totalDisponible ?? -Infinity) - (b.totalDisponible ?? -Infinity)) * dir;
        default:
          return ((a.totalAprobado ?? 0) - (b.totalAprobado ?? 0)) * dir;
      }
    });
  });

  alternarOrden(campo: OrdenCampo): void {
    if (this.ordenCampo() === campo) {
      this.ordenDir.set(this.ordenDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.ordenCampo.set(campo);
      this.ordenDir.set(campo === 'nombre' ? 'asc' : 'desc');
    }
  }

  flecha(campo: OrdenCampo): string {
    if (this.ordenCampo() !== campo) return '↕';
    return this.ordenDir() === 'asc' ? '↑' : '↓';
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtro.set('todas');
  }

  // ── Helpers de template ────────────────────────────────────────────────

  cp(v: number | null | undefined): string {
    return formatoCOP(v);
  }

  trackEmpresa(_i: number, f: ResumenGerencial): number {
    return f.empresaId;
  }

  inicial(f: ResumenGerencial): string {
    return (f.nombreEmpresa || '?').trim().charAt(0).toUpperCase();
  }

  colorAvatar(f: ResumenGerencial): number {
    return Math.abs(f.empresaId ?? 0) % 6;
  }

  /** % pagado sobre aprobado de una empresa (0–100, redondeado). */
  pctPagado(f: ResumenGerencial): number {
    const base = f.totalAprobado ?? 0;
    if (base <= 0) return 0;
    return Math.min(100, Math.round(((f.totalPagado ?? 0) / base) * 100));
  }

  /** Pequeño desfase por fila para que las barras crezcan en cascada. */
  retrasoBarra(i: number): number {
    return Math.min(i, 12) * 40;
  }

  estado(f: ResumenGerencial): { etiqueta: string; clase: string } {
    if (f.totalDisponible === null) return { etiqueta: 'Sin configurar', clase: 'estado-chip--sin-config' };
    if ((f.totalPendientePago ?? 0) > 0) return { etiqueta: 'Con pendientes', clase: 'estado-chip--pendiente' };
    if ((f.totalPagado ?? 0) > 0) return { etiqueta: 'Al día', clase: 'estado-chip--ok' };
    return { etiqueta: 'Sin movimientos', clase: 'estado-chip--sin-movimiento' };
  }

  /** Igual que el original: elegir la empresa y entrar a Pagos Proyectados. */
  ir(fila: ResumenGerencial): void {
    this.ctx.seleccionar(fila.empresaId);
    this.router.navigate(['/presupuesto/pagos-proyectados']);
    this.toast.mostrar(`Ahora estás viendo ${fila.nombreEmpresa}`);
  }
}
