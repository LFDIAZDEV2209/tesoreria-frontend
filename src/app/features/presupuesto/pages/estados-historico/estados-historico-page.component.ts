import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { EstadosHistoricoService } from '../../services/estados-historico.service';
import { mensajeError } from '../../services/gp-errores';
import { formatoCOP } from '../../models/presupuesto.model';
import { periodoHistorico } from '../../models/historico.model';
import {
  ETIQUETA_ESTADO, ETIQUETA_MODULO, ESTADOS_FILTRO, ICONO_ESTADO, MODULOS_FILTRO,
  badgeEstado, fechaEstado, EstadoTransicion,
} from '../../models/estados-historico.model';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { GpEstadoBadgeComponent } from '../../components/gp-estado-badge/gp-estado-badge.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';

interface GrupoPeriodo { periodo: string; titulo: string; transiciones: EstadoTransicion[]; }

@Component({
  selector: 'app-estados-historico-page',
  standalone: true,
  imports: [CommonModule, FormsModule, GpPageHeaderComponent, GpEmptyStateComponent,
    GpErrorStateComponent, GpSkeletonComponent, GpEstadoBadgeComponent, GpIconComponent],
  templateUrl: './estados-historico-page.component.html',
  styleUrl: './estados-historico-page.component.scss',
})
export class EstadosHistoricoPageComponent {

  readonly ctx = inject(PresupuestoContextService);
  private readonly api = inject(EstadosHistoricoService);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly filas = signal<EstadoTransicion[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly size = signal(50);

  readonly filtroModulo = signal('');
  readonly filtroEstado = signal('');
  readonly filtroPeriodo = signal('');
  readonly busqueda = signal('');
  readonly pagosPorPagina: number[] = [25, 50, 100];
  readonly modulos = MODULOS_FILTRO;
  readonly estados = ESTADOS_FILTRO;

  private solicitud = 0;
  private timerBusqueda: ReturnType<typeof setTimeout> | null = null;

  readonly opcionPeriodos = computed(() => {
    const periodos = new Set<string>(this.filas().map(f => f.periodo).filter(p => !!p));
    if (this.filtroPeriodo()) periodos.add(this.filtroPeriodo());
    return [...periodos].sort((a, b) => b.localeCompare(a));
  });

  readonly grupos = computed<GrupoPeriodo[]>(() => {
    const mapa = new Map<string, EstadoTransicion[]>();
    for (const fila of this.filas()) {
      const clave = fila.periodo ?? '';
      const actuales = mapa.get(clave);
      if (actuales) actuales.push(fila);
      else mapa.set(clave, [fila]);
    }
    return [...mapa.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([periodo, transiciones]) => ({
        periodo,
        titulo: periodo ? periodoHistorico(periodo) : 'Sin período',
        transiciones,
      }));
  });

  readonly hayFiltrosActivos = computed(() => !!(this.filtroModulo() || this.filtroEstado()
    || this.filtroPeriodo() || this.busqueda()));

  readonly paginasTotales = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));

  constructor() {
    effect(() => {
      this.ctx.empresaId();
      untracked(() => { this.page.set(0); this.cargar(); });
    });
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
  }

  async cargar(): Promise<void> {
    const empresaId = this.ctx.empresaId();
    if (!empresaId) {
      this.filas.set([]);
      this.total.set(0);
      this.error.set(null);
      this.cargando.set(false);
      return;
    }
    const solicitud = ++this.solicitud;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const respuesta = await firstValueFrom(this.api.listar(empresaId, {
        periodo: this.filtroPeriodo() || undefined,
        modulo: this.filtroModulo() || undefined,
        estado: this.filtroEstado() || undefined,
        tercero: this.busqueda() || undefined,
        page: this.page(),
        size: this.size(),
      }));
      if (solicitud !== this.solicitud || empresaId !== this.ctx.empresaId()) return;
      this.filas.set(respuesta.content ?? []);
      this.total.set(respuesta.total ?? 0);
    } catch (e) {
      if (solicitud !== this.solicitud) return;
      this.error.set(mensajeError(e, 'No se pudo consultar el histórico de estados. Intenta de nuevo.'));
    } finally {
      if (solicitud === this.solicitud) this.cargando.set(false);
    }
  }

  recargar(): void { this.page.set(0); void this.cargar(); }

  setModulo(valor: string): void { this.filtroModulo.set(valor); this.recargar(); }
  setEstado(valor: string): void { this.filtroEstado.set(valor); this.recargar(); }
  setPeriodo(valor: string): void { this.filtroPeriodo.set(valor); this.recargar(); }

  setBusqueda(valor: string): void {
    this.busqueda.set(valor);
    if (this.timerBusqueda) clearTimeout(this.timerBusqueda);
    this.timerBusqueda = setTimeout(() => this.recargar(), 400);
  }

  limpiarFiltros(): void {
    this.filtroModulo.set('');
    this.filtroEstado.set('');
    this.filtroPeriodo.set('');
    this.busqueda.set('');
    this.recargar();
  }

  cambiarPagina(nueva: number): void {
    if (nueva < 0 || nueva >= this.paginasTotales() || this.cargando()) return;
    this.page.set(nueva);
    void this.cargar();
  }

  cambiarSize(valor: number): void { this.size.set(valor); this.recargar(); }

  etiquetaEstado(estado: string): string {
    return ETIQUETA_ESTADO[estado] ?? (estado ? estado[0].toUpperCase() + estado.slice(1) : 'Creado');
  }
  tituloPeriodo(periodo: string): string { return periodoHistorico(periodo); }
  iconoEstado(estado: string): string { return ICONO_ESTADO[estado] ?? 'clock'; }
  tonoEstado(estado: string): string { return ['pagado', 'aprobado'].includes(estado) ? 'ok' : estado; }
  badge(estado: string): string { return badgeEstado(estado); }
  modulo(modulo: string): string { return ETIQUETA_MODULO[modulo] ?? modulo; }
  fecha(valor: string): string { return fechaEstado(valor); }
  monto(valor: number | null | undefined): string { return valor == null ? '' : formatoCOP(valor); }
}
