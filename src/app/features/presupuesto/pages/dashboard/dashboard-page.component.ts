import { Component, computed, effect, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { firstValueFrom } from 'rxjs';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { gpStagger, gpPop } from '../../animations/gp-animations';
import { GpKpiComponent } from '../../components/gp-kpi/gp-kpi.component';
import { GpEstadoBadgeComponent } from '../../components/gp-estado-badge/gp-estado-badge.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpEmpresaSelectorComponent } from '../../components/gp-empresa-selector/gp-empresa-selector.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpBadgeCategoriaComponent } from '../../components/gp-badge-categoria/gp-badge-categoria.component';
import { MODULOS_CFG, Mensual, ResumenPagos, ConsolidadoFila, DetalleConsolidado, PagoProyectado, formatoCOP, formatoCOPShort, formatoMiles, formatoPct } from '../../models/presupuesto.model';
import { msj } from '../modulo-page/modulo-page.component';

@Component({
  selector: 'app-gp-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, NgApexchartsModule, GpKpiComponent, GpEstadoBadgeComponent,
    GpSkeletonComponent, GpErrorStateComponent, GpEmptyStateComponent,
    GpEmpresaSelectorComponent, GpIconComponent, GpBadgeCategoriaComponent,
    GpPageHeaderComponent,
  ],
  animations: [gpStagger, gpPop],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
})
export class DashboardPageComponent implements OnInit, OnDestroy {

  private solicitudCarga = 0;
  loading = signal(true);
  error = signal<string | null>(null);
  mensual = signal<Mensual | null>(null);
  resumenPagos = signal<ResumenPagos | null>(null);
  consolidado = signal<ConsolidadoFila[]>([]);
  detalle = signal<DetalleConsolidado[]>([]);
  pagos = signal<PagoProyectado[]>([]);
  modulos = MODULOS_CFG;

  constructor(
    public ctx: PresupuestoContextService,
    private service: PresupuestoService,
  ) {
    effect(() => {
      const empresaId = this.ctx.empresaId();
      untracked(() => this.cargar());
    });
  }

  ngOnInit(): void {
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
  }

  ngOnDestroy(): void { this.solicitudCarga++; }

  async cargar(): Promise<void> {
    const empresaId = this.ctx.empresaId();
    const solicitud = ++this.solicitudCarga;
    const vigente = () => solicitud === this.solicitudCarga && empresaId === this.ctx.empresaId();
    this.mensual.set(null); this.resumenPagos.set(null);
    this.consolidado.set([]); this.detalle.set([]); this.pagos.set([]);
    this.error.set(null); this.loading.set(empresaId !== null);
    if (empresaId === null) return;
    try {
      const [mensual, resumenPagos, consolidado, primera, primeros] = await Promise.all([
        firstValueFrom(this.service.mensual(empresaId)),
        firstValueFrom(this.service.resumenPagos(empresaId)),
        firstValueFrom(this.service.consolidado(empresaId)),
        firstValueFrom(this.service.detalleConsolidado(empresaId, { page: 0, size: 200 })),
        firstValueFrom(this.service.pagos(empresaId, { page: 0, size: 200, sortBy: 'fechaProyectada' })),
      ]);
      if (!vigente()) return;
      const detalle = [...primera.content], pagos = [...primeros.content];
      // Paginas restantes en tandas de 4 (paralelas, orden preservado): el
      // dashboard antes recogia paginas seriales de detalle y de pagos.
      const maxPaginas = Math.max(primera.totalPages, primeros.totalPages);
      const restantes = Array.from({ length: Math.max(0, maxPaginas - 1) }, (_, i) => i + 1);
      for (let i = 0; i < restantes.length; i += 4) {
        const tanda = restantes.slice(i, i + 4);
        const lotes = await Promise.all(tanda.map((page) => Promise.all([
          page < primera.totalPages ? firstValueFrom(this.service.detalleConsolidado(empresaId, { page, size: 200 })) : Promise.resolve(null),
          page < primeros.totalPages ? firstValueFrom(this.service.pagos(empresaId, { page, size: 200, sortBy: 'fechaProyectada' })) : Promise.resolve(null),
        ])));
        if (!vigente()) return;
        for (const [terceros, calendario] of lotes) {
          if (terceros) detalle.push(...terceros.content);
          if (calendario) pagos.push(...calendario.content);
        }
      }
      this.mensual.set(mensual); this.resumenPagos.set(resumenPagos);
      this.consolidado.set(consolidado); this.detalle.set(detalle); this.pagos.set(pagos);
      this.loading.set(false);
    } catch (e) {
      if (!vigente()) return;
      this.error.set(msj(e)); this.loading.set(false);
    }
  }
  // ── Derivados ─────────────────────────────────────────────────────────────

  fechaCorta(mes: string): string {
    const [a, m] = mes.split('-');
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${nombres[Number(m) - 1]} ${a.slice(2)}`;
  }

  ultimoMes(): string | null {
    const meses = this.mensual()?.meses ?? [];
    return meses.length ? meses[meses.length - 1] : null;
  }

  valorConcepto(filas: any[], concepto: string, mes?: string | null): number {
    const m = mes ?? this.ultimoMes();
    return m ? (filas.find((f) => f.concepto === concepto)?.valores?.[m] ?? 0) : 0;
  }

  facturado(): number { return this.valorConcepto(this.mensual()?.filasContrato ?? [], 'Valor Facturado'); }
  cobrado(): number { return this.valorConcepto(this.mensual()?.filasContrato ?? [], 'Valores Pagados por el Ente'); }
  pendiente(): number { return this.valorConcepto(this.mensual()?.filasContrato ?? [], 'Pendiente por Cobrar'); }
  flujoDisponible(): number { return this.valorConcepto(this.mensual()?.filasFlujoCaja ?? [], 'TOTAL DISPONIBLE'); }
  totalContrato(): number { return this.valorConcepto(this.mensual()?.filasContrato ?? [], 'Total Contrato'); }

  totalNomina(): number {
    const mes = this.ultimoMes();
    if (!mes) return 0;
    return (this.mensual()?.filasNomina ?? [])
      .filter((f) => f.concepto.includes('Beneficio'))
      .reduce((acc, f) => acc + ((f.valores as any)?.[mes] ?? 0), 0);
  }

  gastoPorCategorias(): number {
    return this.consolidado().reduce((acc, f) => acc + Math.abs(f.proveedores ?? 0) + Math.abs(f.cxPagar ?? 0), 0);
  }

  porPagarTerceros(): number {
    const m = this.mensual();
    if (!m) return 0;
    return (m.proveedores.detalle ?? []).reduce((a, d) => a + d.total, 0)
      + (m.anticipos.detalle ?? []).reduce((a, d) => a + d.total, 0)
      + (m.prestamos.detalle ?? []).reduce((a, d) => a + d.total, 0);
  }

  totalPorPagar(): number {
    return this.porPagarTerceros() + this.totalNomina();
  }

  pctCobrado(): number {
    const f = this.facturado();
    return f > 0 ? Number(((this.cobrado() / f) * 100).toFixed(1)) : 0;
  }

  /** Porcentaje con formato es-CO ("44,5%") para textos y chips. */
  pctCobradoTxt(): string {
    return formatoPct(this.pctCobrado());
  }

  estadoAprobacion(): string {
    return this.mensual()?.contrato.estadoAprobacion ?? 'pendiente';
  }

  saldoModulo(modulo: keyof ConsolidadoFila): number {
    return this.consolidado().reduce((acc, fila) => acc + Math.abs(Number(fila[modulo]) || 0), 0);
  }

  saldoModuloTxt(modulo: string): number {
    const campos: Record<string, keyof ConsolidadoFila> = {
      proveedores: 'proveedores', anticipos: 'anticipos', cx_pagar: 'cxPagar',
      cx_cobrar: 'cxCobrar', impuestos: 'impuestos',
    };
    return campos[modulo] ? this.saldoModulo(campos[modulo]) : 0;
  }

  rutaModulo(modulo: string): string {
    const rutas: Record<string, string> = {
      proveedores: 'proveedores', anticipos: 'anticipos', cx_pagar: 'cuentas-pagar',
      cx_cobrar: 'cuentas-cobrar', impuestos: 'impuestos',
    };
    return rutas[modulo] ?? 'proveedores';
  }

  pctBar(): number {
    return Math.min(100, this.pctCobrado());
  }

  topAlertas(): DetalleConsolidado[] {
    return [...this.detalle()]
      .sort((a, b) => Math.abs(b.total ?? 0) - Math.abs(a.total ?? 0))
      .slice(0, 5);
  }

  // ── Gráficas ──────────────────────────────────────────────────────────────
  // IMPORTANTE: las opciones son OBJETOS ESTABLES (referencia fija) y los
  // datos son computed: ApexCharts solo se actualiza cuando cambia la fuente.
  // Objetos inline/recreados por ciclo de detección = bucle de actualización.

  private optsBase = {
    fontFamily: 'Poppins, sans-serif',
    toolbar: { show: false },
    animations: { enabled: true, speed: 450 },
  };

  readonly optFacturado: any = {
    chart: { ...this.optsBase, type: 'bar', height: 236 },
    colors: ['#213053', '#045C94'],
    plotOptions: { bar: { columnWidth: '42%', borderRadius: 5 } },
    dataLabels: { enabled: false },
    legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px' },
    grid: { borderColor: '#f1f5f9' },
  };

  readonly optFlujo: any = {
    chart: { ...this.optsBase, type: 'area', height: 236 },
    colors: ['#045C94'],
    stroke: { curve: 'smooth', width: 2.5 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.28, opacityTo: 0.02 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { borderColor: '#f1f5f9' },
  };

  readonly optPagos: any = {
    chart: { ...this.optsBase, type: 'donut', height: 240 },
    colors: ['#045C94', '#10b981', '#cbd5e1'],
    legend: { position: 'bottom', fontSize: '12px' },
    dataLabels: { enabled: false },
  };

  readonly optGastos: any = {
    chart: { ...this.optsBase, type: 'bar', height: 240 },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, columnWidth: '55%' } },
    colors: ['#FFB71B'],
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { borderColor: '#f1f5f9' },
  };

  facturadoData = computed(() => {
    const m = this.mensual();
    if (!m || !m.meses.length) return null;
    const f = (m.filasContrato ?? []).find((x) => x.concepto === 'Valor Facturado');
    const c = (m.filasContrato ?? []).find((x) => x.concepto === 'Valores Pagados por el Ente');
    return {
      series: [
        { name: 'Facturado', data: m.meses.map((mes) => f?.valores?.[mes] ?? 0) },
        { name: 'Cobrado', data: m.meses.map((mes) => c?.valores?.[mes] ?? 0) },
      ],
      xaxis: { categories: m.meses.map((x) => this.fechaCorta(x)), labels: { style: { colors: '#94a3b8', fontSize: '11px' } } },
      yaxis: { labels: { formatter: (v: number) => formatoCOPShort(v) } },
      tooltip: { y: { formatter: (v: number) => formatoCOP(v) } },
    };
  });

  flujoData = computed(() => {
    const m = this.mensual();
    if (!m || !m.meses.length) return null;
    const fila = (m.filasFlujoCaja ?? []).find((x) => x.concepto === 'TOTAL DISPONIBLE');
    return {
      series: [{ name: 'Total disponible', data: m.meses.map((mes) => fila?.valores?.[mes] ?? 0) }],
      xaxis: { categories: m.meses.map((x) => this.fechaCorta(x)), labels: { style: { colors: '#94a3b8', fontSize: '11px' } } },
      yaxis: { labels: { formatter: (v: number) => formatoCOPShort(v) } },
      tooltip: { y: { formatter: (v: number) => formatoCOP(v) } },
    };
  });

  pagosData = computed(() => {
    const pagos = this.pagos();
    const porEstado = (e: string) => pagos.filter((p) => p.estado === e).reduce((a, p) => a + (p.montoProyectado ?? 0), 0);
    const series = [porEstado('proyectado'), porEstado('pagado'), porEstado('cancelado')];
    if (!series.some((v) => v > 0)) return null;
    return {
      series,
      labels: ['Proyectado', 'Pagado', 'Cancelado'],
      tooltip: { y: { formatter: (v: number) => formatoCOP(v) } },
      plotOptions: { pie: { donut: { size: '72%', labels: { show: true, total: { show: true, label: 'Total', formatter: (w: any) => formatoCOPShort(w.globals.seriesTotals[0]) } } } } },
    };
  });

  gastosData = computed(() => {
    const porCategoria = this.consolidado()
      .map((f) => ({ categoria: f.categoria, v: Math.abs(f.proveedores ?? 0) + Math.abs(f.cxPagar ?? 0) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 8);
    if (!porCategoria.length) return null;
    return {
      series: [{ name: 'Por pagar', data: porCategoria.map((x) => x.v) }],
      tooltip: { y: { formatter: (v: number) => formatoCOP(v) } },
      xaxis: {
        categories: porCategoria.map((x) => x.categoria.slice(0, 16)),
        labels: { formatter: (v: string) => formatoCOPShort(Number(v)), style: { colors: '#94a3b8', fontSize: '11px' } },
      },
    };
  });

  cp(v: number | null | undefined): string { return formatoCOP(v); }
  cpShort(v: number | null | undefined): string { return formatoCOPShort(v); }
  fm(v: number | null | undefined): string { return formatoMiles(v); }
  cl(v: number | null | undefined): string { return (v ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600'; }
}
