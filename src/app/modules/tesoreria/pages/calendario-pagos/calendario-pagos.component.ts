import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CalendarioPagosService } from './services/calendario-pagos.service';
import { ProveedorService } from '../../../../features/proveedores/services/proveedor.service';
import { Proveedor } from '../../../../features/proveedores/models/proveedor.model';
import {
  EventoPago,
  DiaCalendario,
  TipoCalendario,
  EstadoEventoPago,
  ESTADO_EVENTO_CONFIG,
  NOMBRES_MESES,
  NOMBRES_DIAS,
} from './models/calendario-pagos.model';

export type FiltroRango = 'mes' | 'semana' | 'dia' | 'rango';

@Component({
  selector: 'app-calendario-pagos',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './calendario-pagos.component.html',
  styleUrls: ['./calendario-pagos.component.scss'],
})
export class CalendarioPagosComponent implements OnInit {
  // ── Config ──
  readonly NOMBRES_MESES = NOMBRES_MESES;
  readonly NOMBRES_DIAS = NOMBRES_DIAS;
  readonly ESTADO_CONFIG = ESTADO_EVENTO_CONFIG;
  readonly todayMonth = new Date().getMonth();
  readonly todayYear = new Date().getFullYear();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    this.cerrarPickerSiClickFuera(event);
  }

  // ── State ──
  loading = signal(false);
  tipoCalendario = signal<TipoCalendario>('PROGRAMADOS');
  mesActual = signal(new Date().getMonth());
  anioActual = signal(new Date().getFullYear());

  eventosProgramados = signal<EventoPago[]>([]);
  eventosRealizados = signal<EventoPago[]>([]);

  eventoSeleccionado = signal<EventoPago | null>(null);
  showDetalle = signal(false);

  // ── Filtros realizados ──
  filtroRango = signal<FiltroRango>('mes');
  filtroFechaDesde = signal<string>('');
  filtroFechaHasta = signal<string>('');
  filtroBanco = signal<string>('');
  filtroProveedor = signal<string>('');
  bancosDisponibles = signal<string[]>([]);
  showFiltros = signal(true);

  // ── Comprobantes Modal ──
  showComprobantesModal = signal(false);
  comprobantesEvento = signal<EventoPago | null>(null);
  comprobantesUrls = signal<string[]>([]);
  loadingComprobantes = signal(false);

  // ── Month/Year Picker ──
  showMonthYearPicker = signal(false);
  pickerAnio = signal(new Date().getFullYear());

  // ── Programar Pago Modal State ──
  showProgramarPago = signal(false);
  fechaProgramar = signal<string>('');
  montoProgramar = signal<number | null>(null);
  proveedorProgramar = signal<string>('');
  proveedorNitProgramar = signal<string>('');
  observacionesProgramar = signal<string>('');
  proveedoresList = signal<Proveedor[]>([]);
  proveedoresFiltrados = signal<Proveedor[]>([]);
  showProveedoresDropdown = signal(false);
  guardandoPago = signal(false);
  pagoGuardadoExito = signal(false);

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

  statsRealizados = computed(() => {
    const evts = this.eventosRealizados().filter((e) => e.estado !== 'CANCELADO');
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
      : this.statsRealizados()
  );

  // ── Computed: eventos activos (filtra cancelados + filtros cliente) ──
  eventosActivos = computed(() => {
    let evts =
      this.tipoCalendario() === 'PROGRAMADOS'
        ? this.eventosProgramados()
        : this.eventosRealizados();
    // No mostrar cancelados en el calendario
    evts = evts.filter((e) => e.estado !== 'CANCELADO');

    // Aplicar filtros de proveedor (client-side)
    const prov = this.filtroProveedor().toLowerCase().trim();
    if (prov) {
      evts = evts.filter(
        (e) =>
          e.proveedorNombre?.toLowerCase().includes(prov) ||
          e.observaciones?.toLowerCase().includes(prov) ||
          e.titulo?.toLowerCase().includes(prov)
      );
    }

    return evts;
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
    const rango = this.filtroRango();

    let filtered = this.eventosActivos();

    if (rango === 'semana') {
      // Current week (Mon-Sun)
      const hoy = new Date();
      const dayOfWeek = hoy.getDay();
      const monday = new Date(hoy);
      monday.setDate(hoy.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      filtered = filtered.filter((e) => {
        const f = new Date(e.fecha + 'T00:00:00');
        return f >= monday && f <= sunday;
      });
    } else if (rango === 'dia') {
      const hoy = new Date().toISOString().slice(0, 10);
      filtered = filtered.filter((e) => e.fecha === hoy);
    } else if (rango === 'rango') {
      const desde = this.filtroFechaDesde();
      const hasta = this.filtroFechaHasta();
      if (desde) {
        filtered = filtered.filter((e) => e.fecha >= desde);
      }
      if (hasta) {
        filtered = filtered.filter((e) => e.fecha <= hasta);
      }
    } else {
      // 'mes' — default
      filtered = filtered.filter((e) => {
        const f = new Date(e.fecha + 'T00:00:00');
        return f.getMonth() === mes && f.getFullYear() === anio;
      });
    }

    return filtered.sort((a, b) => a.fecha.localeCompare(b.fecha));
  });

  constructor(
    private calendarioService: CalendarioPagosService,
    private proveedorService: ProveedorService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.loadProveedores();
    this.loadBancosDisponibles();
  }

  loadData(): void {
    this.loading.set(true);

    // Build filter params for realized payments
    const filtros: any = {};
    if (this.filtroFechaDesde()) filtros.fechaDesde = this.filtroFechaDesde();
    if (this.filtroFechaHasta()) filtros.fechaHasta = this.filtroFechaHasta();
    if (this.filtroBanco()) filtros.banco = this.filtroBanco();

    this.calendarioService.getTodosLosEventos(filtros).subscribe({
      next: ({ programados, realizados }) => {
        this.eventosProgramados.set(programados);
        this.eventosRealizados.set(realizados);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  loadBancosDisponibles(): void {
    this.calendarioService.getBancosDisponibles().subscribe({
      next: (bancos) => this.bancosDisponibles.set(bancos),
      error: () => this.bancosDisponibles.set([]),
    });
  }

  loadProveedores(): void {
    this.proveedorService.getProveedores().subscribe({
      next: (proveedores) => {
        this.proveedoresList.set(proveedores);
        this.proveedoresFiltrados.set(proveedores);
      },
      error: () => {
        this.proveedoresList.set([]);
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

  // ── Month/Year Picker ──
  toggleMonthYearPicker(): void {
    if (!this.showMonthYearPicker()) {
      this.pickerAnio.set(this.anioActual());
    }
    this.showMonthYearPicker.set(!this.showMonthYearPicker());
  }

  pickerAnioAnterior(): void {
    this.pickerAnio.set(this.pickerAnio() - 1);
  }

  pickerAnioSiguiente(): void {
    this.pickerAnio.set(this.pickerAnio() + 1);
  }

  seleccionarMes(mesIndex: number): void {
    this.mesActual.set(mesIndex);
    this.anioActual.set(this.pickerAnio());
    this.showMonthYearPicker.set(false);
  }

  cerrarPickerSiClickFuera(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.month-year-picker-container')) {
      this.showMonthYearPicker.set(false);
    }
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

  volverABandeja(): void {
    this.router.navigate(['/tesoreria/bandeja']);
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

  // ── Programar Pago Methods ──

  abrirProgramarPago(dia: DiaCalendario): void {
    if (!dia.esMesActual) return;
    const fechaStr = this.dateToString(dia.fecha);
    this.fechaProgramar.set(fechaStr);
    this.montoProgramar.set(null);
    this.proveedorProgramar.set('');
    this.proveedorNitProgramar.set('');
    this.observacionesProgramar.set('');
    this.showProveedoresDropdown.set(false);
    this.pagoGuardadoExito.set(false);
    this.showProgramarPago.set(true);
  }

  cerrarProgramarPago(): void {
    this.showProgramarPago.set(false);
    this.pagoGuardadoExito.set(false);
  }

  filtrarProveedores(event: Event): void {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    this.proveedorProgramar.set((event.target as HTMLInputElement).value);
    this.proveedorNitProgramar.set('');
    if (query.length > 0) {
      const filtered = this.proveedoresList().filter(
        (p) =>
          p.nombreProveedor.toLowerCase().includes(query) ||
          p.nit.toLowerCase().includes(query)
      );
      this.proveedoresFiltrados.set(filtered);
      this.showProveedoresDropdown.set(true);
    } else {
      this.proveedoresFiltrados.set(this.proveedoresList());
      this.showProveedoresDropdown.set(false);
    }
  }

  seleccionarProveedor(proveedor: Proveedor): void {
    this.proveedorProgramar.set(proveedor.nombreProveedor);
    this.proveedorNitProgramar.set(proveedor.nit);
    this.showProveedoresDropdown.set(false);
  }

  get formProgramarValido(): boolean {
    return !!(
      this.fechaProgramar() &&
      this.montoProgramar() &&
      this.montoProgramar()! > 0 &&
      this.proveedorProgramar().trim().length > 0
    );
  }

  guardarPagoProgramado(): void {
    if (!this.formProgramarValido) return;

    this.guardandoPago.set(true);

    const nuevoPago: EventoPago = {
      id: Date.now(),
      titulo: `Pago programado — ${this.proveedorProgramar()}`,
      fecha: this.fechaProgramar(),
      monto: this.montoProgramar()!,
      proveedorNombre: this.proveedorProgramar(),
      proveedorNit: this.proveedorNitProgramar() || undefined,
      estado: 'PROGRAMADO',
      tipo: 'PROGRAMADOS',
      observaciones: this.observacionesProgramar() || undefined,
      creadoPor: 'Tesorería',
      fechaCreacion: new Date().toISOString().slice(0, 10),
    };

    // Add to local list immediately
    const currentProgramados = [...this.eventosProgramados()];
    currentProgramados.push(nuevoPago);
    this.eventosProgramados.set(currentProgramados);

    // Try to persist via service
    this.calendarioService.guardarPagoProgramado(nuevoPago).subscribe({
      next: (saved) => {
        // Update with server-assigned ID if available
        if (saved && saved.id) {
          const updated = currentProgramados.map((e) =>
            e.id === nuevoPago.id ? { ...e, id: saved.id } : e
          );
          this.eventosProgramados.set(updated);
        }
        this.guardandoPago.set(false);
        this.pagoGuardadoExito.set(true);
        setTimeout(() => {
          this.cerrarProgramarPago();
        }, 1200);
      },
      error: () => {
        // Already added locally, just close
        this.guardandoPago.set(false);
        this.pagoGuardadoExito.set(true);
        setTimeout(() => {
          this.cerrarProgramarPago();
        }, 1200);
      },
    });
  }

  formatFechaLarga(fechaStr: string): string {
    if (!fechaStr) return '';
    const d = new Date(fechaStr + 'T00:00:00');
    return d.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  // ── Filtros ──

  aplicarFiltros(): void {
    this.loadData();
  }

  limpiarFiltros(): void {
    this.filtroFechaDesde.set('');
    this.filtroFechaHasta.set('');
    this.filtroBanco.set('');
    this.filtroProveedor.set('');
    this.filtroRango.set('mes');
    this.loadData();
  }

  cambiarRango(rango: FiltroRango): void {
    this.filtroRango.set(rango);
    // Auto-set date ranges for week and day
    if (rango === 'semana') {
      const hoy = new Date();
      const dayOfWeek = hoy.getDay();
      const monday = new Date(hoy);
      monday.setDate(hoy.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      this.filtroFechaDesde.set(this.dateToString(monday));
      this.filtroFechaHasta.set(this.dateToString(sunday));
    } else if (rango === 'dia') {
      const hoy = this.dateToString(new Date());
      this.filtroFechaDesde.set(hoy);
      this.filtroFechaHasta.set(hoy);
    } else if (rango === 'mes') {
      this.filtroFechaDesde.set('');
      this.filtroFechaHasta.set('');
    }
    this.loadData();
  }

  toggleFiltros(): void {
    this.showFiltros.set(!this.showFiltros());
  }

  // ── Comprobantes Modal ──

  abrirComprobantes(evento: EventoPago): void {
    this.comprobantesEvento.set(evento);
    this.showComprobantesModal.set(true);

    // If we already have URLs from the mapping
    if (evento.comprobantesUrls && evento.comprobantesUrls.length > 0) {
      this.comprobantesUrls.set(evento.comprobantesUrls);
      return;
    }

    // Otherwise fetch from backend
    if (evento.movimientoDiarioId) {
      this.loadingComprobantes.set(true);
      this.calendarioService.getComprobantes(evento.movimientoDiarioId).subscribe({
        next: (urls) => {
          this.comprobantesUrls.set(urls);
          this.loadingComprobantes.set(false);
        },
        error: () => {
          this.comprobantesUrls.set([]);
          this.loadingComprobantes.set(false);
        },
      });
    } else {
      this.comprobantesUrls.set([]);
    }
  }

  cerrarComprobantes(): void {
    this.showComprobantesModal.set(false);
    this.comprobantesEvento.set(null);
    this.comprobantesUrls.set([]);
  }

  getComprobanteFileName(url: string): string {
    try {
      const path = new URL(url).pathname;
      const parts = path.split('/');
      return decodeURIComponent(parts[parts.length - 1]) || 'Comprobante';
    } catch {
      return 'Comprobante';
    }
  }

  getComprobanteIcon(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('.pdf')) return '📄';
    if (lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.webp')) return '🖼️';
    return '📎';
  }

  isComprobanteImage(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.webp') || lower.includes('.gif');
  }

  /** Helper: get the filter label for events list header */
  getFilterRangeLabel(): string {
    const rango = this.filtroRango();
    if (rango === 'semana') return 'esta semana';
    if (rango === 'dia') return 'hoy';
    if (rango === 'rango') {
      const desde = this.filtroFechaDesde();
      const hasta = this.filtroFechaHasta();
      if (desde && hasta) return `${this.formatFecha(desde)} — ${this.formatFecha(hasta)}`;
      if (desde) return `desde ${this.formatFecha(desde)}`;
      if (hasta) return `hasta ${this.formatFecha(hasta)}`;
      return 'rango personalizado';
    }
    return `${this.NOMBRES_MESES[this.mesActual()]} ${this.anioActual()}`;
  }
}
