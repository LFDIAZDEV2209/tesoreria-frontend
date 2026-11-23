import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { NgApexchartsModule } from 'ng-apexcharts';
import { MesaAyudaService } from '../../services/mesa-ayuda.service';
import { StatsMesaAyuda, TicketMesaAyuda } from '../../../tesoreria/models/solicitud.model';

@Component({
  selector: 'app-dashboard-mesa-ayuda',
  standalone: true,
  imports: [CommonModule, RouterModule, NgApexchartsModule],
  templateUrl: './dashboard-mesa-ayuda.component.html',
  styleUrls: ['./dashboard-mesa-ayuda.component.scss'],
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
  ]
})
export class DashboardMesaAyudaComponent implements OnInit {
  stats = signal<StatsMesaAyuda | null>(null);
  recentTickets = signal<TicketMesaAyuda[]>([]);
  loading = signal(true);

  private readonly PASTEL_COLORS = ['#8DC3E3', '#8DD4B5', '#F0C27F', '#F0A0A0', '#C0ADDF', '#87CFD6'];

  urgencyDonutOptions = computed(() => {
    const urgencia = this.stats()?.ticketsPorUrgencia;
    return {
      series: [
        urgencia?.baja || 0,
        urgencia?.media || 0,
        urgencia?.alta || 0,
        urgencia?.critica || 0,
      ] as any,
      chart: {
        type: 'donut' as const,
        height: 240,
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
      labels: ['Baja', 'Media', 'Alta', 'Crítica'],
      colors: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
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
                label: 'tickets',
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
        y: { formatter: (val: number) => `${val} ticket${val !== 1 ? 's' : ''}` },
      },
      responsive: [
        { breakpoint: 480, options: { chart: { height: 200 }, legend: { position: 'bottom' } } },
      ],
    };
  });

  tipoBarOptions = computed(() => {
    const allTipos = this.stats()?.ticketsPorTipoSolicitud ?? [];
    const data = [...allTipos].sort((a, b) => b.cantidad - a.cantidad).slice(0, 6);
    return {
      series: [{ name: 'Tickets', data: data.map(d => d.cantidad) }] as any,
      chart: {
        type: 'bar' as const,
        height: 240,
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
        formatter: (val: number) => val.toString(),
        style: { fontSize: '10px', fontWeight: '700', colors: ['#374151'] },
        offsetY: -8,
      },
      xaxis: {
        categories: data.map(d => this.formatTipoLabel(d.tipo)),
        labels: {
          style: { fontSize: '11px', colors: '#6b7280', fontFamily: 'inherit' },
          trim: false,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          formatter: (val: number) => Math.round(val).toString(),
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
      fill: { type: 'solid', opacity: 0.88 },
      stroke: { show: false },
      tooltip: {
        theme: 'light',
        y: { formatter: (val: number) => `${val} ticket${val !== 1 ? 's' : ''}` },
      },
      colors: this.PASTEL_COLORS,
      legend: { show: false },
    };
  });

  constructor(private mesaAyudaService: MesaAyudaService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    
    this.mesaAyudaService.getStats().subscribe({
      next: (data) => {
        this.stats.set(data);
      }
    });

    this.mesaAyudaService.getAllTickets().subscribe({
      next: (tickets) => {
        // Ordenar por fecha de creación descendente y tomar los 5 más recientes
        const sorted = [...tickets].sort((a, b) => 
          new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
        );
        this.recentTickets.set(sorted.slice(0, 5));
        this.loading.set(false);
      }
    });
  }

  getUrgenciaClass(urgencia: string): string {
    const classes: Record<string, string> = {
      'BAJA': 'badge--success',
      'MEDIA': 'badge--warning',
      'ALTA': 'badge--danger',
      'CRITICA': 'badge--critical'
    };
    return classes[urgencia] || '';
  }

  getEstadoClass(estado: string): string {
    const classes: Record<string, string> = {
      'ABIERTO': 'badge--info',
      'EN_PROGRESO': 'badge--warning',
      'ESCALADO': 'badge--danger',
      'RESUELTO': 'badge--success',
      'CERRADO': 'badge--muted'
    };
    return classes[estado] || '';
  }

  getEstadoLabel(estado: string): string {
    const labels: Record<string, string> = {
      'ABIERTO': 'Abierto',
      'EN_PROGRESO': 'En Progreso',
      'ESCALADO': 'Escalado',
      'RESUELTO': 'Resuelto',
      'CERRADO': 'Cerrado'
    };
    return labels[estado] || estado;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  getPercentage(value: number, total: number): number {
    if (!total) {
      return 0;
    }
    return Math.round((value / total) * 100);
  }

  getTopTipos(limit: number = 5): { tipo: string; cantidad: number }[] {
    const stats = this.stats();
    if (!stats?.ticketsPorTipoSolicitud?.length) {
      return [];
    }

    return [...stats.ticketsPorTipoSolicitud]
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, limit);
  }

  formatTipoLabel(tipo: string): string {
    if (!tipo) {
      return 'Sin tipo';
    }

    return tipo
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
