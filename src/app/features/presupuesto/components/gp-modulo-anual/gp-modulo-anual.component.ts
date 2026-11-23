import { Component, computed, effect, ElementRef, HostListener, inject, input, OnDestroy, signal, untracked, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { ModuloAnual, ImportesAnuales, FilaModuloAnual } from '../../models/modulo-anual.model';
import { formatoCOP } from '../../models/presupuesto.model';
import { periodoHistorico } from '../../models/historico.model';
import { mensajeError } from '../../services/gp-errores';
import { gpPop, gpStagger } from '../../animations/gp-animations';
import { GpSkeletonComponent } from '../gp-skeleton/gp-skeleton.component';
import { GpErrorStateComponent } from '../gp-error-state/gp-error-state.component';
import { GpEmptyStateComponent } from '../gp-empty-state/gp-empty-state.component';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { GpKpiComponent } from '../gp-kpi/gp-kpi.component';
import { GpFiltrosComponent } from '../gp-filtros/gp-filtros.component';

/** Nombre visible del módulo en el banner del consolidado. */
const ETIQUETAS_MODULO: Record<string, string> = {
  proveedores: 'Proveedores', anticipos: 'Anticipos', cx_pagar: 'Cuentas por pagar',
  cx_cobrar: 'Cuentas por cobrar', impuestos: 'Impuestos', provisiones: 'Provisiones',
};

const ETIQUETAS_MEDIDA: Record<keyof ImportesAnuales, string> = {
  saldo: 'Saldo', debito: 'Débito', credito: 'Crédito',
};

/** Máximo de filas que reciben retardo escalonado al entrar (evita colas largas). */
const FILAS_ESCALONADAS = 14;

/**
 * Consolidado de todos los meses por módulo. Sigue el lenguaje visual y de
 * animaciones del módulo Control de Bancos de Tesorería (banner degradado,
 * KPIs compactos, botón oro con barrido, filas escalonadas y columna
 * resaltada al pasar el cursor), adaptado a la identidad Nexa del Gestor.
 */
@Component({
  selector: 'app-gp-modulo-anual', standalone: true,
  imports: [CommonModule, FormsModule, GpSkeletonComponent, GpErrorStateComponent, GpEmptyStateComponent, GpIconComponent, GpKpiComponent, GpFiltrosComponent],
  templateUrl: './gp-modulo-anual.component.html', styleUrls: ['./gp-modulo-anual.component.scss'],
  animations: [gpStagger, gpPop],
})
export class GpModuloAnualComponent implements OnDestroy {
  readonly modulo = input.required<string>();
  readonly ctx = inject(PresupuestoContextService);
  private readonly api = inject(PresupuestoService);
  private readonly toast = inject(PresupuestoToastService);
  readonly datos = signal<ModuloAnual | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly anios = signal<number[]>([]);
  readonly anio = signal<number | null>(null);
  readonly busqueda = signal('');
  readonly categoria = signal('');
  readonly medida = signal<keyof ImportesAnuales>('saldo');
  readonly exportando = signal(false);
  readonly meses = computed(() => [...(this.datos()?.meses ?? [])].sort());
  readonly cp = formatoCOP;
  readonly etiqueta = periodoHistorico;
  readonly hayFiltros = computed(() => !!(this.busqueda().trim() || this.categoria()));
  readonly categorias = computed(() => [...new Set((this.datos()?.filas ?? [])
    .map(fila => this.categoriaFila(fila)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
  readonly filasFiltradas = computed(() => {
    const busqueda = this.busqueda().trim().toLowerCase();
    const categoria = this.categoria();
    return (this.datos()?.filas ?? []).filter(fila =>
      (!categoria || this.categoriaFila(fila) === categoria) &&
      (!busqueda || (fila.nit ?? '').toLowerCase().includes(busqueda) || (fila.nombre ?? '').toLowerCase().includes(busqueda)));
  });
  readonly totalesMesFiltrados = computed<Record<string, ImportesAnuales>>(() => {
    if (!this.hayFiltros()) return this.datos()?.totalesMes ?? {};
    const totales: Record<string, ImportesAnuales> = {};
    for (const mes of this.meses()) {
      totales[mes] = this.sumarImportes(this.filasFiltradas().map(fila => fila.valores[mes]));
    }
    return totales;
  });
  readonly totalFiltrado = computed<ImportesAnuales>(() => this.hayFiltros()
    ? this.sumarImportes(this.filasFiltradas().map(fila => fila.totalAnio))
    : this.datos()?.totalGeneral ?? { saldo: 0, debito: 0, credito: 0 });

  // ── Interacción de la tabla (estilo hoja de cálculo) ──
  /** Índice del mes bajo el cursor: resalta su columna completa. */
  readonly mesHover = signal<number | null>(null);
  /** true cuando la tabla tiene desplazamiento horizontal pendiente. */
  readonly desplazado = signal(false);
  /** true cuando ya se ve el final de la tabla (oculta el degradado guía). */
  readonly alFin = signal(true);
  @ViewChild('scrollTabla') scrollTabla?: ElementRef<HTMLElement>;

  readonly tiposMedida: (keyof ImportesAnuales)[] = ['saldo', 'debito', 'credito'];
  readonly etiquetaMedida = computed(() => ETIQUETAS_MEDIDA[this.medida()]);
  readonly etiquetaModulo = computed(() => ETIQUETAS_MODULO[this.modulo()] ?? 'Consolidado');

  // ── KPIs del consolidado (sobre los terceros filtrados y la medida activa) ──
  readonly totalGeneral = computed(() => this.totalFiltrado()[this.medida()]);
  readonly promedioMes = computed(() => {
    const datos = this.datos();
    if (!datos || !datos.meses.length) return 0;
    return this.totalGeneral() / datos.meses.length;
  });
  readonly mejorMes = computed<{ mes: string; valor: number } | null>(() => {
    const datos = this.datos();
    if (!datos || !datos.meses.length || !this.terceros()) return null;
    let mejor: { mes: string; valor: number } | null = null;
    for (const mes of datos.meses) {
      const valor = this.totalesMesFiltrados()[mes]?.[this.medida()] ?? 0;
      if (!mejor || valor > mejor.valor) mejor = { mes, valor };
    }
    return mejor;
  });
  readonly mejorMesEtiqueta = computed(() => {
    const mejor = this.mejorMes();
    return mejor ? this.etiqueta(mejor.mes) : '';
  });
  readonly terceros = computed(() => this.filasFiltradas().length);
  readonly tercerosTotal = computed(() => this.datos()?.filas?.length ?? 0);
  readonly mesesCargados = computed(() => this.datos()?.meses?.length ?? 0);

  private consulta?: Subscription;
  constructor() {
    effect(() => {
      this.ctx.empresaId(); this.modulo();
      untracked(() => { this.anio.set(null); this.anios.set([]); this.limpiarFiltros(); this.cargar(); });
    }, { allowSignalWrites: true });
  }

  seleccionarAnio(anio: number | null): void { this.anio.set(anio); this.cargar(); }

  onFiltro(evento: { campo: string; valor: string }): void {
    if (evento.campo === 'busqueda') this.busqueda.set(evento.valor);
    if (evento.campo === 'categoria') this.categoria.set(evento.valor);
  }

  limpiarFiltros(): void { this.busqueda.set(''); this.categoria.set(''); }

  /** El consolidado de provisiones identifica sus filas por sección. */
  categoriaFila(fila: FilaModuloAnual): string { return fila.seccion || fila.categoria || ''; }

  private sumarImportes(importes: (ImportesAnuales | undefined)[]): ImportesAnuales {
    return importes.reduce<ImportesAnuales>((total, valor) => ({
      saldo: total.saldo + (valor?.saldo ?? 0),
      debito: total.debito + (valor?.debito ?? 0),
      credito: total.credito + (valor?.credito ?? 0),
    }), { saldo: 0, debito: 0, credito: 0 });
  }

  cargar(): void {
    this.consulta?.unsubscribe(); this.datos.set(null); this.error.set('');
    this.mesHover.set(null); this.desplazado.set(false); this.alFin.set(true);
    const empresa = this.ctx.empresaId();
    if (empresa === null) { this.loading.set(false); return; }
    this.loading.set(true);
    const consulta = this.modulo() === 'provisiones'
      ? this.api.provisionesAnual(empresa, this.anio())
      : this.api.moduloAnual(this.modulo(), empresa, this.anio());
    this.consulta = consulta.subscribe({
      next: datos => {
        this.datos.set(datos);
        this.anios.update(previos => [...new Set([...previos, ...(datos.anios ?? []), ...datos.meses.map(m => Number(m.slice(0, 4)))])].sort((a,b) => b-a));
        this.loading.set(false);
        // El DOM ya tiene la tabla: mide bordes del scroll en el siguiente turno.
        setTimeout(() => this.medirBordes());
      },
      error: e => { this.error.set(e.status === 404 ? 'La vista de todos los meses todavía no está disponible. Puedes reintentar o volver a la vista mensual.' : mensajeError(e)); this.loading.set(false); },
    });
  }

  valor(importes: ImportesAnuales | undefined): number { return importes?.[this.medida()] ?? 0; }

  /** Texto visible de la medida (control segmentado del filtro). */
  etiquetaMedidaDe(medida: keyof ImportesAnuales): string { return ETIQUETAS_MEDIDA[medida]; }

  /** Retardo escalonado de entrada por fila, con tope para tablas largas. */
  retardoFila(indice: number): number { return Math.min(indice, FILAS_ESCALONADAS) * 38; }

  // ── Columna resaltada al pasar el cursor ──
  entrarMes(indice: number): void { if (this.mesHover() !== indice) this.mesHover.set(indice); }
  salirMes(): void { this.mesHover.set(null); }

  // ── Bordes del scroll horizontal (sombra del tercero + degradado guía) ──
  onScrollTabla(event: Event): void { this.aplicarBordes(event.target as HTMLElement); }

  @HostListener('window:resize')
  medirBordes(): void {
    const contenedor = this.scrollTabla?.nativeElement;
    if (contenedor) this.aplicarBordes(contenedor);
  }

  private aplicarBordes(contenedor: HTMLElement): void {
    this.desplazado.set(contenedor.scrollLeft > 2);
    this.alFin.set(contenedor.scrollLeft + contenedor.clientWidth >= contenedor.scrollWidth - 4);
  }

  async exportar(): Promise<void> {
    const datos = this.datos();
    const empresaId = this.ctx.empresaId();
    if (!datos || empresaId === null || datos.empresaId !== empresaId || this.loading() || this.exportando()) return;
    const modulo = this.modulo(), anio = this.anio();
    const categoria = this.categoria() || undefined, busqueda = this.busqueda().trim() || undefined;
    this.exportando.set(true);
    try {
      const blob = await firstValueFrom(this.api.exportarModuloAnual(modulo, empresaId, { anio, categoria, busqueda }));
      const url = URL.createObjectURL(blob);
      try {
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `${modulo}-${empresaId}-${anio ?? 'todos'}-documentos.xlsx`;
        enlace.click();
      } finally { URL.revokeObjectURL(url); }
    } catch { this.toast.error('No se pudo exportar la tabla. Intenta de nuevo.'); }
    finally { this.exportando.set(false); }
  }

  ngOnDestroy(): void { this.consulta?.unsubscribe(); }
}
