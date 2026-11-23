import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ControlEgresosService } from '../../../../features/contabilidad/control-egresos/control-egresos.service';
import { PresupuestoContextService } from '../../../../features/presupuesto/services/presupuesto-context.service';
import {
  EgresoRegistrado,
  EgresoHistoricoItem,
  HistorialEstadoEgreso,
} from '../../../../features/contabilidad/control-egresos/control-egresos.model';
import { EgresoFinancieroService, EstadoFinanciero } from '../../services/egreso-financiero.service';
import { formatoCOP, formatearFechaCO } from '../../../../features/presupuesto/models/presupuesto.model';

@Component({
  selector: 'app-historico-egresos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './historico-egresos.component.html',
  styleUrls: ['./historico-egresos.component.scss'],
})
export class HistoricoEgresosComponent implements OnInit {
  readonly error = signal('');
  readonly proveedorSeleccionado = signal<string | null>(null);
  readonly detalles = signal<Record<number, EgresoRegistrado>>({});
  readonly financieros = signal<Record<number, EstadoFinanciero>>({});
  readonly proveedores = computed(() => {
    const grupos = new Map<string, { clave: string; nombre: string; nit: string; egresos: EgresoHistoricoItem[]; monto: number; pagados: number }>();
    for (const e of this.items()) {
      const clave = `${e.nit || e.nombre || e.tercero || e.id}`;
      const grupo = grupos.get(clave) ?? { clave, nombre: e.nombre || e.tercero || 'Sin nombre', nit: e.nit || '', egresos: [], monto: 0, pagados: 0 };
      grupo.egresos.push(e);
      grupo.monto += e.monto;
      if (e.estado === 'PAGADO') grupo.pagados++;
      grupos.set(clave, grupo);
    }
    return [...grupos.values()];
  });
  readonly proveedoresPagina = computed(() => this.proveedores().slice(this.pagina() * this.tamano(), (this.pagina() + 1) * this.tamano()));
  readonly pagina = signal(0);
  readonly tamano = signal(20);
  private solicitud = 0;
  readonly items = signal<EgresoHistoricoItem[]>([]);
  readonly cargando = signal(false);
  readonly totalRegistros = signal(0);

  // Fila expandida para ver trazabilidad
  readonly filaExpandidaId = signal<number | null>(null);
  readonly cargandoHistorial = signal<Record<number, boolean>>({});
  readonly historialesMap = signal<Record<number, HistorialEstadoEgreso[]>>({});

  // Filtros
  readonly filtroTexto = signal('');
  readonly filtroEstado = signal('');
  readonly filtroOrigen = signal('');
  readonly filtroDesde = signal('');
  readonly filtroHasta = signal('');
  readonly filtroMontoMin = signal<number | null>(null);
  readonly filtroMontoMax = signal<number | null>(null);
  readonly filtroOrden = signal<'desc' | 'asc'>('desc');

  // Paginación server-side
  page = 0;
  size = 20;

  readonly estadosDisponibles = [
    { id: '', label: 'Todos los estados' },
    { id: 'REGISTRADO', label: 'Registrado' },
    { id: 'EN_REVISION_GERENCIA', label: 'En Revisión (Gerencia)' },
    
    { id: 'ENVIADO_TESORERIA', label: 'En Tesorería' },
    { id: 'PAGADO', label: 'Pagado' },
    { id: 'ELIMINAR_SOLICITADO', label: 'Eliminación Solicitada' },
    { id: 'ELIMINADO', label: 'Eliminado' },
  ];

  readonly origenesDisponibles = [
    { id: '', label: 'Todos los orígenes' },
    { id: 'gp', label: 'Pagos Proyectados' },
    { id: 'contabilidad', label: 'Contabilidad' },
  ];

  readonly totalPaginas = computed(() => {
    return Math.max(1, Math.ceil(this.proveedores().length / this.tamano()));
  });

  readonly sumaMontoFiltrado = computed(() => {
    return this.items().reduce((acc, curr) => acc + (curr.monto || 0), 0);
  });

  readonly hayFiltrosActivos = computed(() => {
    return !!(
      this.filtroTexto() ||
      this.filtroEstado() ||
      this.filtroOrigen() ||
      this.filtroDesde() ||
      this.filtroHasta() ||
      this.filtroMontoMin() != null ||
      this.filtroMontoMax() != null
    );
  });

  private timerDebounce: any = null;

  constructor(
    private service: ControlEgresosService,
    private financiero: EgresoFinancieroService,
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
    this.filtroEstado.set('');
    this.filtroOrigen.set('');
    this.filtroDesde.set('');
    this.filtroHasta.set('');
    this.filtroMontoMin.set(null);
    this.filtroMontoMax.set(null);
    this.filtroOrden.set('desc');
    this.page = 0;
    this.cargar();
  }

  async cargar(): Promise<void> {
    const solicitud = ++this.solicitud;
    this.cargando.set(true);
    this.error.set('');
    this.pagina.set(0);
    this.proveedorSeleccionado.set(null);
    const empresaId = Number(this.route.snapshot.queryParamMap.get('empresaId')) || this.ctx.empresaId() || undefined;
    try {
      const consultar = (page: number) => firstValueFrom(
        this.service.obtenerHistoricoEgresos({
          empresaId,
          desde: this.filtroDesde() || undefined,
          hasta: this.filtroHasta() || undefined,
          estado: this.filtroEstado() || undefined,
          origen: this.filtroOrigen() || undefined,
          texto: this.filtroTexto() || undefined,
          montoMin: this.filtroMontoMin() ?? undefined,
          montoMax: this.filtroMontoMax() ?? undefined,
          page,
          size: 200,
          orden: this.filtroOrden(),
        }),
      );
      const resp = await consultar(0);
      if (solicitud !== this.solicitud) return;
      const registros = [...resp.items];
      for (let page = 1; registros.length < resp.total; page++) {
        const siguiente = await consultar(page);
        if (solicitud !== this.solicitud) return;
        if (!siguiente.items.length) throw new Error('Histórico incompleto');
        registros.push(...siguiente.items);
      }
      this.items.set(registros);
      this.totalRegistros.set(resp.total);
    } catch (e) {
      if (solicitud !== this.solicitud) return;
      this.error.set('No se pudo cargar el histórico. Intenta nuevamente.');
      console.error('Error al cargar histórico de egresos:', e);
      this.items.set([]);
      this.totalRegistros.set(0);
    } finally {
      if (solicitud === this.solicitud) this.cargando.set(false);
    }
  }

  formatearFecha(f: string | null | undefined): string {
    return formatearFechaCO(f);
  }

  async toggleExpansion(row: EgresoHistoricoItem): Promise<void> {
    if (this.filaExpandidaId() === row.id) {
      this.filaExpandidaId.set(null);
      return;
    }
    this.filaExpandidaId.set(row.id);
    if (!this.historialesMap()[row.id]) {
      this.cargandoHistorial.update((m) => ({ ...m, [row.id]: true }));
      try {
        const hist = await firstValueFrom(this.service.obtenerHistorialEstados(row.id));
        this.historialesMap.update((m) => ({ ...m, [row.id]: hist }));
      } catch (err) {
        console.error('Error al cargar historial de estados:', err);
        this.historialesMap.update((m) => ({ ...m, [row.id]: [] }));
      } finally {
        this.cargandoHistorial.update((m) => ({ ...m, [row.id]: false }));
      }
    }
  }

  seleccionarProveedor(clave: string): void {
    this.proveedorSeleccionado.set(this.proveedorSeleccionado() === clave ? null : clave);
  }

  async cargarDetalle(row: EgresoHistoricoItem): Promise<void> {
    if (this.filaExpandidaId() === row.id) { this.filaExpandidaId.set(null); return; }
    this.filaExpandidaId.set(row.id);
    this.error.set('');
    this.cargandoHistorial.update(m => ({ ...m, [row.id]: true }));
    try {
      const detalle = await firstValueFrom(this.service.obtenerPorId(row.id));
      if (!detalle) throw new Error('Egreso no disponible');
      this.detalles.update(m => ({ ...m, [row.id]: detalle }));
      const financiero = await firstValueFrom(this.financiero.estado(row.id));
      this.financieros.update(m => ({ ...m, [row.id]: financiero }));
    } catch {
      this.error.set('No se pudo consultar el detalle completo del egreso. Vuelve a abrirlo para reintentar.');
    } finally {
      this.cargandoHistorial.update(m => ({ ...m, [row.id]: false }));
    }
  }

  async abrirComprobante(id: number, pagoId?: number): Promise<void> {
    try {
      const respuesta = await firstValueFrom(pagoId == null ? this.service.verSoporte(id) : this.financiero.descargar(id, pagoId));
      window.open(respuesta.url, '_blank', 'noopener,noreferrer');
    } catch { this.error.set('No se pudo abrir el comprobante. Intenta nuevamente.'); }
  }

  cambiarPagina(delta: number): void {
    const nueva = this.pagina() + delta;
    if (nueva >= 0 && nueva < this.totalPaginas()) {
      this.pagina.set(nueva);
      this.page = nueva;
    }
  }

  cambiarSize(nuevoSize: number): void {
    this.size = Number(nuevoSize);
    this.tamano.set(this.size);
    this.page = 0;
    this.pagina.set(0);
  }

  formatear(v: number | null | undefined): string {
    return formatoCOP(v);
  }

  estadoColorClass(est: string): string {
    const e = (est || '').toUpperCase();
    if (e === 'PAGADO') return 'bg-emerald-100 text-emerald-800';
    if (e === 'APROBADO_GERENCIA') return 'bg-sky-100 text-sky-800';
    if (e === 'EN_TESORERIA') return 'bg-indigo-100 text-indigo-800';
    if (e === 'REVISION') return 'bg-amber-100 text-amber-800';
    if (e === 'DEVUELTO' || e === 'NEGADO') return 'bg-rose-100 text-rose-800';
    if (e.includes('ELIMIN')) return 'bg-slate-200 text-slate-700';
    return 'bg-slate-100 text-slate-700';
  }

  origenColorClass(orig: string): string {
    const o = (orig || '').toLowerCase();
    if (o.includes('proyect')) return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}
