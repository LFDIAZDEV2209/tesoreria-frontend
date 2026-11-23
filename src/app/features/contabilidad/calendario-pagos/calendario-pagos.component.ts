import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CalendarioPagosService } from './services/calendario-pagos.service';
import {
  EventoPago,
  DiaCalendario,
  TipoCalendario,
  EstadoEventoPago,
  ESTADO_EVENTO_CONFIG,
  NOMBRES_MESES,
  NOMBRES_DIAS,
} from './models/calendario-pagos.model';

@Component({
  selector: 'app-calendario-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendario-pagos.component.html',
  styleUrls: ['./calendario-pagos.component.scss'],
})
export class CalendarioPagosComponent implements OnInit {
  // ── Config ──
  readonly NOMBRES_MESES = NOMBRES_MESES;
  readonly NOMBRES_DIAS = NOMBRES_DIAS;
  readonly ESTADO_CONFIG = ESTADO_EVENTO_CONFIG;

  // ── State ──
  loading = signal(false);
  tipoCalendario = signal<TipoCalendario>('PROGRAMADOS');
  mesActual = signal(new Date().getMonth());
  anioActual = signal(new Date().getFullYear());

  eventosProgramados = signal<EventoPago[]>([]);
  eventosVistoBueno = signal<EventoPago[]>([]);

  eventoSeleccionado = signal<EventoPago | null>(null);
  showDetalle = signal(false);

  // ── Stats ──
  statsProgramados = computed(() => {
    const evts = this.eventosProgramados().filter((e) => e.estado !== 'CANCELADO');
    return {
      total: evts.length,
      pendientes: evts.filter((e) => e.estado === 'PENDIENTE').length,
      programados: evts.filter((e) => e.estado === 'PROGRAMADO').length,
      pagados: evts.filter((e) => e.estado === 'PAGADO').length,
      vencidos: evts.filter((e) => e.estado === 'VENCIDO').length,
      montoTotal: evts.reduce((s, e) => s + e.monto, 0),
    };
  });

  statsVistoBueno = computed(() => {
    const evts = this.eventosVistoBueno().filter((e) => e.estado !== 'CANCELADO');
    return {
      total: evts.length,
      pendientes: evts.filter((e) => e.estado === 'PENDIENTE').length,
      programados: evts.filter((e) => e.estado === 'PROGRAMADO').length,
      pagados: evts.filter((e) => e.estado === 'PAGADO').length,
      vencidos: evts.filter((e) => e.estado === 'VENCIDO').length,
      montoTotal: evts.reduce((s, e) => s + e.monto, 0),
    };
  });

  currentStats = computed(() =>
    this.tipoCalendario() === 'PROGRAMADOS'
      ? this.statsProgramados()
      : this.statsVistoBueno()
  );

  // ── Computed: eventos activos (filtra cancelados) ──
  eventosActivos = computed(() => {
    const evts =
      this.tipoCalendario() === 'PROGRAMADOS'
        ? this.eventosProgramados()
        : this.eventosVistoBueno();
    // No mostrar cancelados en el calendario
    return evts.filter((e) => e.estado !== 'CANCELADO');
  });

  // ── Computed: dias del calendario ──
  diasCalendario = computed<DiaCalendario[]>(() => {
    const anio = this.anioActual();
    const mes = this.mesActual();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);

    const dias: DiaCalendario[] = [];

    // Días del mes anterior para llenar la primera semana
    const diaSemanaInicio = primerDia.getDay(); // 0 = Dom
    for (let i = diaSemanaInicio - 1; i >= 0; i--) {
      const fecha = new Date(anio, mes, -i);
      dias.push({
        fecha,
        esHoy: fecha.getTime() === hoy.getTime(),
        esMesActual: false,
        eventos: this.getEventosPorFecha(fecha),
      });
    }

    // Días del mes actual
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const fecha = new Date(anio, mes, d);
      dias.push({
        fecha,
        esHoy: fecha.getTime() === hoy.getTime(),
        esMesActual: true,
        eventos: this.getEventosPorFecha(fecha),
      });
    }

    // Días del siguiente mes para completar la grilla (6 filas × 7 = 42)
    const restantes = 42 - dias.length;
    for (let i = 1; i <= restantes; i++) {
      const fecha = new Date(anio, mes + 1, i);
      dias.push({
        fecha,
        esHoy: fecha.getTime() === hoy.getTime(),
        esMesActual: false,
        eventos: this.getEventosPorFecha(fecha),
      });
    }

    return dias;
  });

  // ── Computed: lista de eventos del mes actual (para vista lista) ──
  eventosDelMes = computed(() => {
    const mes = this.mesActual();
    const anio = this.anioActual();
    return this.eventosActivos()
      .filter((e) => {
        const f = new Date(e.fecha + 'T00:00:00');
        return f.getMonth() === mes && f.getFullYear() === anio;
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  });

  constructor(
    private calendarioService: CalendarioPagosService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.calendarioService.getTodosLosEventos().subscribe({
      next: ({ programados, vistoBueno }) => {
        this.eventosProgramados.set(programados);
        this.eventosVistoBueno.set(vistoBueno);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  // ── Navigation ──
  mesAnterior(): void {
    if (this.mesActual() === 0) {
      this.mesActual.set(11);
      this.anioActual.set(this.anioActual() - 1);
    } else {
      this.mesActual.set(this.mesActual() - 1);
    }
  }

  mesSiguiente(): void {
    if (this.mesActual() === 11) {
      this.mesActual.set(0);
      this.anioActual.set(this.anioActual() + 1);
    } else {
      this.mesActual.set(this.mesActual() + 1);
    }
  }

  irAHoy(): void {
    const hoy = new Date();
    this.mesActual.set(hoy.getMonth());
    this.anioActual.set(hoy.getFullYear());
  }

  // ── Interaction ──
  selectEvento(evento: EventoPago): void {
    this.eventoSeleccionado.set(evento);
    this.showDetalle.set(true);
  }

  cerrarDetalle(): void {
    this.showDetalle.set(false);
    this.eventoSeleccionado.set(null);
  }

  navegarARegistro(evento: EventoPago): void {
    if (evento.registroContableId) {
      this.router.navigate(['/contabilidad/tramitar', evento.registroContableId]);
    }
  }

  volverAGestion(): void {
    this.router.navigate(['/contabilidad/gestion']);
  }

  // ── Helpers ──
  private getEventosPorFecha(fecha: Date): EventoPago[] {
    const fechaStr = this.dateToString(fecha);
    return this.eventosActivos().filter((e) => e.fecha === fechaStr);
  }

  private dateToString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  formatMonto(monto: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(monto);
  }

  formatFecha(fechaStr: string): string {
    if (!fechaStr) return '';
    const d = new Date(fechaStr + 'T00:00:00');
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getEstadoConfig(estado: EstadoEventoPago) {
    return ESTADO_EVENTO_CONFIG[estado] || ESTADO_EVENTO_CONFIG['PENDIENTE'];
  }

  trackByEventoId(_: number, e: EventoPago): number {
    return e.id;
  }

  trackByDiaFecha(index: number, d: DiaCalendario): number {
    return d.fecha.getTime();
  }
}
