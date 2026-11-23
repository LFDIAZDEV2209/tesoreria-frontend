import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import {
  TesoreriaService,
  ViaticosTimelineEvento,
  ViaticosTimelineResponse,
} from '../../tesoreria/services/tesoreria.service';
import {
  SolicitudViaticos,
  EstadoViatico,
  ESTADO_VIATICO_LABELS,
  ESTADO_VIATICO_COLORS,
} from '../models/viaticos.model';

@Component({
  selector: 'app-bandeja-viaticos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './bandeja-viaticos.component.html',
  styleUrls: ['./bandeja-viaticos.component.scss'],
  animations: [
    trigger('pageIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('400ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1 })),
      ]),
    ]),
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('420ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('rowsIn', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(8px)' }),
          stagger(40, animate('280ms cubic-bezier(0.4,0,0.2,1)', style({ opacity: 1, transform: 'translateY(0)' }))),
        ], { optional: true }),
      ]),
    ]),
  ],
})
export class BandejaViaticosComponent implements OnInit {
  private readonly estadoTesoreriaLabels: Record<'PENDIENTE' | 'PAGADO', string> = {
    PENDIENTE: 'Pendiente',
    PAGADO: 'Pagado',
  };

  private readonly estadoTesoreriaColors: Record<'PENDIENTE' | 'PAGADO', string> = {
    PENDIENTE: '#F59E0B',
    PAGADO: '#10B981',
  };

  loading = signal(true);
  solicitudes = signal<SolicitudViaticos[]>([]);
  loadingTimeline = signal(false);
  busqueda = '';
  filtroEstado = signal<'PENDIENTE' | 'PAGADO' | null>(null);
  _busquedaSignal = signal('');
  solicitudSeleccionada = signal<SolicitudViaticos | null>(null);
  timelineSeleccionada = signal<ViaticosTimelineResponse | null>(null);

  readonly estadosDisponibles: { key: 'PENDIENTE' | 'PAGADO'; label: string }[] = [
    { key: 'PENDIENTE', label: 'Pendiente' },
    { key: 'PAGADO', label: 'Pagado' },
  ];

  solicitudesFiltradas = computed(() => {
    let list = this.solicitudes();
    const q = this._busquedaSignal().toLowerCase();
    const estado = this.filtroEstado();

    if (q) {
      list = list.filter(s =>
        s.nombreEmpresa?.toLowerCase().includes(q) ||
        s.nit?.toLowerCase().includes(q) ||
        s.ciudad?.toLowerCase().includes(q) ||
        s.nombreCompleto?.toLowerCase().includes(q) ||
        s.areaDependencia?.toLowerCase().includes(q) ||
        (s.codigo || '').toLowerCase().includes(q)
      );
    }
    if (estado) {
      list = list.filter((s) => this.toEstadoTesoreria(s.estado) === estado);
    }
    return list.sort((a, b) =>
      new Date(b.fechaCreacion || 0).getTime() - new Date(a.fechaCreacion || 0).getTime()
    );
  });

  totalFiltrado = computed(() =>
    this.solicitudesFiltradas().reduce((sum, s) => sum + this.getTotalSolicitud(s), 0)
  );

  miniStats = computed(() => {
    const total = this.solicitudes().length;
    const pendientes = this.solicitudes().filter((s) => this.toEstadoTesoreria(s.estado) === 'PENDIENTE').length;
    const pagadas = this.solicitudes().filter((s) => this.toEstadoTesoreria(s.estado) === 'PAGADO').length;

    return [
      { key: 'TOTAL', label: 'Total', value: total, color: '#3b82f6' },
      { key: 'PENDIENTES', label: 'Pendientes', value: pendientes, color: '#f59e0b' },
      { key: 'PAGADAS', label: 'Pagadas', value: pagadas, color: '#10b981' },
    ];
  });

  constructor(
    public router: Router,
    private tesoreriaService: TesoreriaService,
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
            comprobantePagoNombre: item.comprobantePagoNombre,
            valorComprobantePago: Number(item.valorComprobantePago ?? 0),
            fechaTramiteTesoreria: item.fechaTramiteTesoreria,
            tramitadoTesoreriaPor: item.tramitadoTesoreriaPor,
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

  onBusquedaChange(value: string): void {
    this._busquedaSignal.set(value);
  }

  setFiltroEstado(estado: 'PENDIENTE' | 'PAGADO' | null): void {
    this.filtroEstado.set(estado);
  }

  abrirDetalleSolicitud(solicitud: SolicitudViaticos): void {
    this.solicitudSeleccionada.set(solicitud);
    this.loadingTimeline.set(true);
    this.timelineSeleccionada.set(null);

    if (!solicitud.id) {
      this.loadingTimeline.set(false);
      return;
    }

    this.tesoreriaService.getTimelineSolicitudViaticos(solicitud.id).subscribe({
      next: (timeline) => {
        this.timelineSeleccionada.set(timeline);
        this.loadingTimeline.set(false);
      },
      error: () => {
        this.loadingTimeline.set(false);
      },
    });
  }

  cerrarDetalleSolicitud(): void {
    this.solicitudSeleccionada.set(null);
    this.timelineSeleccionada.set(null);
    this.loadingTimeline.set(false);
  }

  getEventosTimeline(): ViaticosTimelineEvento[] {
    return this.timelineSeleccionada()?.eventos ?? [];
  }

  contarEstado(estado: 'PENDIENTE' | 'PAGADO'): number {
    return this.solicitudes().filter((s) => this.toEstadoTesoreria(s.estado) === estado).length;
  }

  getMiniStatCaption(key: string, value: number): string {
    if (key === 'TOTAL') {
      return 'Base general';
    }
    const total = this.solicitudes().length;
    if (total === 0) {
      return 'Sin datos';
    }
    const percent = Math.round((value / total) * 100);
    return `${percent}% del total`;
  }

  getTotalSolicitud(s: SolicitudViaticos): number {
    return s.items?.reduce((sum, i) => sum + i.valorTotal, 0) ?? 0;
  }

  getTiposUnicos(s: SolicitudViaticos): string[] {
    return [...new Set(s.items?.map(i => i.tipoViatico) ?? [])];
  }

  private toEstadoTesoreria(estado: string | null | undefined): 'PENDIENTE' | 'PAGADO' {
    const normalized = String(estado ?? '').toUpperCase();
    return ['PAGADO', 'APROBADA', 'APROBADO', 'COMPLETADO', 'REALIZADO'].includes(normalized)
      ? 'PAGADO'
      : 'PENDIENTE';
  }

  isEstadoPagado(estado: string | null | undefined): boolean {
    return this.toEstadoTesoreria(estado) === 'PAGADO';
  }

  getEstadoColor(estado: string): string {
    const estadoTesoreria = this.toEstadoTesoreria(estado);
    return this.estadoTesoreriaColors[estadoTesoreria] ?? ESTADO_VIATICO_COLORS[estado as EstadoViatico] ?? '#94a3b8';
  }

  getEstadoBg(estado: string): string {
    return this.getEstadoColor(estado) + '1F';
  }

  getEstadoLabel(estado: string): string {
    const estadoTesoreria = this.toEstadoTesoreria(estado);
    return this.estadoTesoreriaLabels[estadoTesoreria] ?? ESTADO_VIATICO_LABELS[estado as EstadoViatico] ?? estado;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
