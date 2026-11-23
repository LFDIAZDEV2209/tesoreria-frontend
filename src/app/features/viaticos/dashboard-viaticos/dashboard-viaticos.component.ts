import {
  Component,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { NgApexchartsModule } from 'ng-apexcharts';
import { TesoreriaService } from '../../tesoreria/services/tesoreria.service';
import {
  SolicitudViaticos,
  EstadoViatico,
  ESTADO_VIATICO_LABELS,
  ESTADO_VIATICO_COLORS,
  StatsViaticos,
} from '../models/viaticos.model';

@Component({
  selector: 'app-dashboard-viaticos',
  standalone: true,
  imports: [CommonModule, RouterModule, NgApexchartsModule],
  templateUrl: './dashboard-viaticos.component.html',
  styleUrls: ['./dashboard-viaticos.component.scss'],
  animations: [
    trigger('pageIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('400ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1 })),
      ]),
    ]),
    trigger('fadeUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(28px)' }),
        animate('480ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('fadeUpDelay', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(24px)' }),
        animate('480ms 120ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('fadeUpDelay2', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(24px)' }),
        animate('480ms 240ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('staggerCards', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(30px) scale(0.96)' }),
          stagger(65, animate('420ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))),
        ], { optional: true }),
      ]),
    ]),
    trigger('rowsIn', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateX(-10px)' }),
          stagger(50, animate('300ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1, transform: 'translateX(0)' }))),
        ], { optional: true }),
      ]),
    ]),
  ],
})
export class DashboardViaticosComponent implements OnInit {
  loading = signal(true);
  solicitudes = signal<SolicitudViaticos[]>([]);

  stats = computed<StatsViaticos>(() => {
    const list = this.solicitudes();
    const total = list.length;

    const enRevision = list.filter(s => s.estado === 'EN_REVISION' || s.estado === 'PENDIENTE').length;
    const devueltas = list.filter(s => s.estado === 'DEVUELTO' || s.estado === 'RECHAZADA').length;
    const aprobadas = list.filter(s => s.estado === 'APROBADO' || s.estado === 'APROBADA').length;

    const now = new Date();
    const mesActual = list.filter(s => {
      if (!s.fechaCreacion) return false;
      const d = new Date(s.fechaCreacion);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const totalMes = mesActual.reduce((sum, s) => sum + this.getTotalSolicitud(s), 0);
    const promedioSolicitud = total > 0
      ? list.reduce((sum, s) => sum + this.getTotalSolicitud(s), 0) / total
      : 0;

    // Por tipo: sumar totales por tipoViatico de los items
    const tipoMap = new Map<string, number>();
    list.forEach(s => {
      s.items?.forEach(item => {
        const t = item.tipoViatico || 'Otro';
        tipoMap.set(t, (tipoMap.get(t) || 0) + item.valorTotal);
      });
    });
    const porTipo = Array.from(tipoMap.entries()).map(([tipo, total]) => ({ tipo, total }));

    // Por estado
    const estadoMap = new Map<string, number>();
    list.forEach(s => {
      estadoMap.set(s.estado, (estadoMap.get(s.estado) || 0) + 1);
    });
    const porEstado = Array.from(estadoMap.entries()).map(([estado, cantidad]) => ({ estado, cantidad }));

    return { total, enRevision, devueltas, aprobadas, totalMes, promedioSolicitud, porTipo, porEstado };
  });

  solicitudesRecientes = computed(() =>
    [...this.solicitudes()]
      .sort((a, b) => new Date(b.fechaCreacion || 0).getTime() - new Date(a.fechaCreacion || 0).getTime())
      .slice(0, 5)
  );

  private readonly PASTEL_COLORS = ['#8DC3E3', '#8DD4B5', '#F0C27F', '#F0A0A0', '#C0ADDF', '#87CFD6'];

  barChartOptions = computed(() => {
    const data = this.stats().porTipo;
    return {
      series: [{ name: 'Monto (COP)', data: data.map(d => d.total) }] as any,
      chart: {
        type: 'bar' as const,
        height: 268,
        toolbar: { show: false },
        animations: {
          enabled: true,
          easing: 'easeinout' as const,
          speed: 800,
          animateGradually: { enabled: true, delay: 130 },
          dynamicAnimation: { enabled: true, speed: 380 },
        },
        fontFamily: 'inherit',
        background: 'transparent',
      },
      plotOptions: {
        bar: {
          borderRadius: 9,
          borderRadiusApplication: 'end' as const,
          columnWidth: '52%',
          distributed: true,
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => this.formatCurrencyShort(val),
        style: { fontSize: '10px', fontWeight: '700', colors: ['#374151'] },
        offsetY: -8,
      },
      xaxis: {
        categories: data.map(d => d.tipo),
        labels: {
          style: { fontSize: '11px', colors: '#6b7280', fontFamily: 'inherit' },
          trim: false,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          formatter: (val: number) => this.formatCurrencyShort(val),
          style: { fontSize: '10px', colors: '#9ca3af', fontFamily: 'inherit' },
        },
      },
      grid: {
        borderColor: 'rgba(33,48,83,0.07)',
        strokeDashArray: 5,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        padding: { top: 8, right: 8, bottom: 0, left: 8 },
      },
      fill: {
        type: 'solid',
        opacity: 0.88,
      },
      stroke: { show: false },
      tooltip: {
        theme: 'light',
        y: { formatter: (val: number) => this.formatCurrency(val) },
      },
      colors: this.PASTEL_COLORS,
      legend: { show: false },
    };
  });

  donutChartOptions = computed(() => {
    const data = this.stats().porEstado;
    return {
      series: data.map(d => d.cantidad) as any,
      chart: {
        type: 'donut' as const,
        height: 268,
        animations: {
          enabled: true,
          easing: 'easeinout' as const,
          speed: 950,
          animateGradually: { enabled: true, delay: 100 },
          dynamicAnimation: { enabled: true, speed: 400 },
        },
        fontFamily: 'inherit',
        background: 'transparent',
      },
      labels: data.map(d => this.getEstadoLabel(d.estado)),
      colors: data.map(d => this.getEstadoColor(d.estado)),
      plotOptions: {
        pie: {
          donut: {
            size: '62%',
            labels: {
              show: true,
              name: {
                show: true,
                fontSize: '12px',
                fontFamily: 'inherit',
                color: '#6b7280',
                offsetY: -14,
              },
              value: {
                show: true,
                fontSize: '28px',
                fontFamily: 'inherit',
                fontWeight: 900,
                color: '#213053',
                offsetY: 8,
                formatter: (val: string) => val,
              },
              total: {
                show: true,
                showAlways: true,
                label: 'solicitudes',
                fontSize: '11px',
                fontFamily: 'inherit',
                color: '#9ca3af',
                formatter: (w: any) =>
                  w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0).toString(),
              },
            },
          },
        },
      },
      dataLabels: { enabled: false },
      legend: {
        show: true,
        position: 'bottom' as const,
        fontSize: '12px',
        fontFamily: 'inherit',
        fontWeight: '500',
        markers: { width: 9, height: 9, radius: 3 },
        itemMargin: { horizontal: 10, vertical: 6 },
        formatter: (seriesName: string, opts: any) => {
          const pct = ((opts.w.globals.seriesPercent?.[opts.seriesIndex]?.[0]) || 0).toFixed(0);
          return `${seriesName} — ${pct}%`;
        },
      },
      stroke: { width: 3, colors: ['#f8fafc'] },
      tooltip: {
        theme: 'light',
        y: { formatter: (val: number) => `${val} solicitud${val !== 1 ? 'es' : ''}` },
      },
      responsive: [
        { breakpoint: 480, options: { chart: { height: 240 }, legend: { position: 'bottom' } } },
      ],
    };
  });

  constructor(
    private tesoreriaService: TesoreriaService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  private cargarDatos(): void {
    this.loading.set(true);
    this.tesoreriaService.getSolicitudesViaticosUsuario().subscribe({
      next: (data) => {
        this.solicitudes.set(
          data.map((item: any) => ({
            id: item.id,
            codigo: item.codigo,
            tipoEmpresa: item.tipoEmpresa,
            nombreEmpresa: item.nombreEmpresa,
            nit: item.nit,
            centroCosto: item.centroCosto,
            areaDependencia: item.areaDependencia,
            ciudad: item.ciudad,
            nombreCompleto: item.nombreCompleto,
            cargo: item.cargo,
            correoElectronico: item.correoElectronico,
            telefonoExt: item.telefonoExt,
            items: (item.items ?? []).map((i: any) => ({
              id: i.id,
              tipoViatico: i.tipoViatico,
              fechaGasto: i.fechaGasto,
              conceptoDetallado: i.conceptoDetallado,
              valorBase: Number(i.valorBase ?? 0),
              aplicaIva: Boolean(i.aplicaIva),
              porcentajeIva: Number(i.porcentajeIva ?? 0),
              valorIva: Number(i.valorIva ?? 0),
              valorTotal: Number(i.valorTotal ?? 0),
            })),
            observaciones: item.observaciones,
            estado: item.estado,
            fechaCreacion: item.fechaCreacion,
            fechaActualizacion: item.fechaActualizacion,
            creadoPor: item.creadoPor,
            soportePrincipalUrl: item.soportePrincipalUrl,
            numeroOrdenEgreso: item.numeroOrdenEgreso,
            montoDesembolsoAprobado: Number(item.montoDesembolsoAprobado ?? 0),
            respuestaContabilidad: item.respuestaContabilidad,
            observacionesContabilidad: item.observacionesContabilidad,
          }) as SolicitudViaticos)
        );
        this.loading.set(false);
      },
      error: () => {
        this.solicitudes.set([]);
        this.loading.set(false);
      },
    });
  }

  getTotalSolicitud(s: SolicitudViaticos): number {
    return s.items?.reduce((sum, i) => sum + i.valorTotal, 0) ?? 0;
  }

  getTiposPrincipales(s: SolicitudViaticos): string {
    const tipos = [...new Set(s.items?.map(i => i.tipoViatico) ?? [])];
    return tipos.slice(0, 3).join(', ') || '—';
  }

  getBarHeight(value: number): number {
    const max = Math.max(...this.stats().porTipo.map(t => t.total), 1);
    return Math.max((value / max) * 160, 4);
  }

  getBarColor(index: number): string {
    return this.PASTEL_COLORS[index % this.PASTEL_COLORS.length];
  }

  getEstadoColor(estado: string): string {
    return ESTADO_VIATICO_COLORS[estado as EstadoViatico] ?? '#94a3b8';
  }

  getEstadoBg(estado: string): string {
    const color = this.getEstadoColor(estado);
    return color + '18';
  }

  getEstadoLabel(estado: string): string {
    return ESTADO_VIATICO_LABELS[estado as EstadoViatico] ?? estado;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  formatCurrencyShort(value: number): string {
    if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return '$' + (value / 1_000).toFixed(0) + 'K';
    return '$' + value.toFixed(0);
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  irANuevaSolicitud(): void {
    this.router.navigate(['/tesoreria/solicitud']);
  }

  irABandeja(): void {
    this.router.navigate(['/viaticos/mis-solicitudes']);
  }
}