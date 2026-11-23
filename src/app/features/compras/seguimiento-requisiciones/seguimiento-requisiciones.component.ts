import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TramitarRequisicionService } from '../tramitar-requisicion/services/tramitar-requisicion.service';
import { ComprasService } from '../services/compras.service';
import { SolicitudCompra } from '../models/compra.model';
import {
  TramiteRequisicion,
  TrackingTimeline,
  TrackingStep,
} from '../tramitar-requisicion/models/tramitar-requisicion.model';

interface PipelineStep {
  label: string;
  key: string;
  icon: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    label: 'Solicitud de Requerimientos',
    key: 'solicitud',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    label: 'Gestión de Compra',
    key: 'gestion',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    label: 'Visto Bueno Jefe de Planeación',
    key: 'visto_bueno',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  {
    label: 'Cadena de Suministros',
    key: 'cadena',
    icon: 'M4 6h16M4 10h16M4 14h7',
  },
  {
    label: 'Contabilidad',
    key: 'contabilidad',
    icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    label: 'Tesorería',
    key: 'tesoreria',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  },
];

const STEP_DESCRIPTIONS = [
  'Solicitud inicial del área',
  'Generación de órdenes de compra',
  'Aprobación del jefe de planeación',
  'Revisión por cadena de suministros',
  'Revisión y registro contable',
  'Pago y cierre del trámite',
];

@Component({
  selector: 'app-seguimiento-requisiciones',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './seguimiento-requisiciones.component.html',
  styleUrls: ['./seguimiento-requisiciones.component.scss'],
})
export class SeguimientoRequisicionesComponent implements OnInit {
  tramites = signal<TramiteRequisicion[]>([]);
  loading = signal(true);
  pipelineSteps = PIPELINE_STEPS;

  // ─── Expand / Collapse ────────────────────────────
  expandedTramiteId = signal<number | null>(null);

  // ─── Detail Modal ─────────────────────────────────
  detailModalTramite = signal<TramiteRequisicion | null>(null);
  detailModalOpen = signal(false);

  // ─── Tracking Historial ───────────────────────────
  tramiteHistorial = signal<Map<number, TrackingStep[]>>(new Map());
  tramiteTimelines = signal<Map<number, TrackingTimeline>>(new Map());
  loadingTracking = signal<Set<number>>(new Set());

  // ─── Filtering & Search ───────────────────────────
  searchTerm = signal('');
  activeFilter = signal<string>('all');
  sortAsc = signal(false);

  // ─── Pagination ───────────────────────────────────
  currentPage = signal(1);
  pageSize = signal(10);
  pageSizeOptions = [5, 10, 25, 50];
  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredTramites().length / this.pageSize())),
  );
  paginatedTramites = computed(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    return this.filteredTramites().slice(start, start + size);
  });

  filteredTramites = computed(() => {
    let items = this.tramites();
    const term = this.searchTerm().toLowerCase().trim();
    const filter = this.activeFilter();

    if (term) {
      items = items.filter(
        (t) =>
          (t.requisicion.numeroRequisicion || '')
            .toLowerCase()
            .includes(term) ||
          (t.requisicion.solicitante || '').toLowerCase().includes(term) ||
          (t.requisicion.areaCentroCosto || '').toLowerCase().includes(term) ||
          (t.requisicion.tipoCompra || '').toLowerCase().includes(term),
      );
    }

    if (filter !== 'all') {
      if (filter === 'ESPERANDO_VISTO_BUENO') {
        items = items.filter((t) => t.estadoTramite === 'ESPERANDO_VISTO_BUENO');
      } else if (filter === 'EN_CADENA_SUMINISTROS') {
        items = items.filter((t) => t.estadoTramite === 'EN_CADENA_SUMINISTROS');
      } else if (filter === 'EN_CONTABILIDAD') {
        items = items.filter(
          (t) =>
            t.estadoTramite === 'EN_CONTABILIDAD' ||
            t.estadoTramite === 'ESPERANDO_CONTABILIDAD' ||
            t.estadoTramite === 'APROBADO_CONTABILIDAD',
        );
      } else if (filter === 'EN_TESORERIA') {
        items = items.filter((t) => t.estadoTramite === 'EN_TESORERIA');
      } else if (filter === 'COMPLETADO') {
        items = items.filter((t) => t.estadoTramite === 'COMPLETADO');
      } else if (filter === 'RECHAZADO_JEFE') {
        items = items.filter(
          (t) =>
            t.estadoTramite === 'RECHAZADO_JEFE' ||
            t.estadoTramite === 'RECHAZADO',
        );
      } else {
        items = items.filter((t) => t.estadoTramite === filter);
      }
    }

    return this.sortAsc()
      ? [...items].sort((a, b) => (a.id || 0) - (b.id || 0))
      : [...items].sort((a, b) => (b.id || 0) - (a.id || 0));
  });

  // ─── Main Tab (Requisiciones vs Solicitudes) ────
  activeMainTab = signal<'requisiciones' | 'solicitudes'>('requisiciones');

  // ─── Solicitudes de Tesorería ─────────────────────
  solicitudes = signal<SolicitudCompra[]>([]);
  loadingSolicitudes = signal(false);
  solSearchTerm = signal('');
  solActiveFilter = signal<string>('all');
  solCurrentPage = signal(1);
  solPageSize = signal(10);

  filteredSolicitudes = computed(() => {
    let items = this.solicitudes();
    const term = this.solSearchTerm().toLowerCase().trim();
    const filter = this.solActiveFilter();

    if (term) {
      items = items.filter(
        (s) =>
          (s.codigoSolicitud || '').toLowerCase().includes(term) ||
          (s.solicitante || '').toLowerCase().includes(term) ||
          (s.areaSolicitante || '').toLowerCase().includes(term) ||
          (s.tipoRequerimiento || '').toLowerCase().includes(term),
      );
    }

    if (filter !== 'all') {
      items = items.filter((s) => s.estado === filter);
    }

    return [...items].sort(
      (a, b) => (b.id || 0) - (a.id || 0),
    );
  });

  solTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredSolicitudes().length / this.solPageSize())),
  );

  paginatedSolicitudes = computed(() => {
    const size = this.solPageSize();
    const start = (this.solCurrentPage() - 1) * size;
    return this.filteredSolicitudes().slice(start, start + size);
  });

  constructor(
    private tramiteService: TramitarRequisicionService,
    private comprasService: ComprasService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadTramites();
  }

  loadTramites(): void {
    this.loading.set(true);
    this.tramiteService.getAllTramites().subscribe({
      next: (data) => {
        this.tramites.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadSolicitudes(): void {
    this.loadingSolicitudes.set(true);
    this.comprasService.getSolicitudes().subscribe({
      next: (data) => {
        this.solicitudes.set(data);
        this.loadingSolicitudes.set(false);
      },
      error: () => this.loadingSolicitudes.set(false),
    });
  }

  // ─── Main Tab ─────────────────────────────────────
  setMainTab(tab: 'requisiciones' | 'solicitudes'): void {
    this.activeMainTab.set(tab);
    if (tab === 'solicitudes' && this.solicitudes().length === 0) {
      this.loadSolicitudes();
    }
  }

  // ─── Solicitudes Helpers ──────────────────────────
  onSolSearch(event: Event): void {
    this.solSearchTerm.set((event.target as HTMLInputElement).value);
    this.solCurrentPage.set(1);
  }

  setSolFilter(filter: string): void {
    this.solActiveFilter.set(filter);
    this.solCurrentPage.set(1);
  }

  goToSolPage(page: number): void {
    if (page >= 1 && page <= this.solTotalPages()) {
      this.solCurrentPage.set(page);
    }
  }

  get visibleSolPages(): number[] {
    const total = this.solTotalPages();
    const current = this.solCurrentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  getSolCountByEstado(estado: string): number {
    return this.solicitudes().filter((s) => s.estado === estado).length;
  }

  getSolEstadoLabel(estado: string): string {
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      REALIZADO: 'Realizado',
      TRAMITE: 'En Trámite',
      EN_PROCESO: 'En Proceso',
      ENVIADA_COMPRAS: 'Enviada a Compras',
      RECHAZADA_COMPRAS: 'Rechazada',
      EN_CONTABILIDAD: 'En Contabilidad',
      ESPERANDO_CONTABILIDAD: 'En Contabilidad',
      APROBADO_CONTABILIDAD: 'Aprobado Contabilidad',
      COMPLETADO: 'Completado',
      RECHAZADO_JEFE: 'Rechazado Jefe',
      ESPERANDO_VISTO_BUENO: 'Esperando VoBo',
    };
    return labels[estado] || estado;
  }

  getSolTipoLabel(tipo: string | undefined): string {
    if (!tipo) return '—';
    const labels: Record<string, string> = {
      ANTICIPO: 'Anticipo',
      LEGALIZACION_ANTICIPO: 'Legalización de Anticipo',
      LEGALIZACION_COMPRA: 'Legalización de Compra',
      CAJA_MENOR: 'Caja Menor',
      OTRO: 'Otro',
    };
    return labels[tipo] || tipo;
  }

  getSolSemaforoClass(sol: SolicitudCompra): string {
    if (sol.diasTranscurridos <= 2) return 'seg-sol__semaforo--verde';
    if (sol.diasTranscurridos < sol.slaDias - 1) return 'seg-sol__semaforo--amarillo';
    return 'seg-sol__semaforo--rojo';
  }

  getSolEstadoClass(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'seg-sol__badge--pendiente',
      ENVIADA_COMPRAS: 'seg-sol__badge--enviada',
      RECHAZADA_COMPRAS: 'seg-sol__badge--rechazada',
      REALIZADO: 'seg-sol__badge--realizado',
      TRAMITE: 'seg-sol__badge--tramite',
      EN_PROCESO: 'seg-sol__badge--tramite',
      COMPLETADO: 'seg-sol__badge--completado',
    };
    return map[estado] || 'seg-sol__badge--default';
  }

  // ─── Search & Filter ──────────────────────────────
  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  setFilter(filter: string): void {
    this.activeFilter.set(filter);
    this.currentPage.set(1);
  }
  toggleSort(): void {
    this.sortAsc.set(!this.sortAsc());
  }

  // ─── Pagination ───────────────────────────────────
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  get visiblePages(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  toggleExpand(id: number): void {
    if (this.expandedTramiteId() === id) {
      this.expandedTramiteId.set(null);
    } else {
      this.expandedTramiteId.set(id);
      this.fetchTrackingTimeline(id);
    }
  }

  private fetchTrackingTimeline(tramiteId: number): void {
    // Don't fetch if already loaded
    if (this.tramiteTimelines().has(tramiteId)) return;

    const loading = new Set(this.loadingTracking());
    loading.add(tramiteId);
    this.loadingTracking.set(loading);

    this.tramiteService.getTrackingTimeline(tramiteId).subscribe({
      next: (timeline) => {
        const timelines = new Map(this.tramiteTimelines());
        timelines.set(tramiteId, timeline);
        this.tramiteTimelines.set(timelines);

        const historial = new Map(this.tramiteHistorial());
        historial.set(tramiteId, timeline.pasos);
        this.tramiteHistorial.set(historial);

        const ld = new Set(this.loadingTracking());
        ld.delete(tramiteId);
        this.loadingTracking.set(ld);
      },
      error: () => {
        const ld = new Set(this.loadingTracking());
        ld.delete(tramiteId);
        this.loadingTracking.set(ld);
      },
    });
  }

  getTrackingSteps(tramiteId: number): TrackingStep[] {
    return this.tramiteTimelines().get(tramiteId)?.pasos || [];
  }

  isTrackingLoading(tramiteId: number): boolean {
    return this.loadingTracking().has(tramiteId);
  }

  // ─── Stats ────────────────────────────────────────
  getCountByStatus(status: string): number {
    return this.tramites().filter((t) => t.estadoTramite === status).length;
  }

  // ─── Pipeline (7 pasos) ───────────────────────────
  /**
   * Retorna el índice del paso ACTIVO (0-based).
   * Cuando el trámite está 100% completado retorna 7 (todos done).
   *
   * Mapa de estados → step activo:
   *  0  – EN_PROCESO, sin OC        → Solicitud de Requerimientos
   *  1  – EN_PROCESO, con OC        → Gestión de Compra
   *  2  – VISTO_BUENO               → Visto Bueno Jefe de Compras
   *  3  – ESPERANDO_CONTABILIDAD    → Contabilidad
   *  3  – EN_CONTABILIDAD           → Contabilidad
   *  4  – APROBADO_CONTABILIDAD     → Director Contable
   *  5  – APROBADO_DIRECTOR         → Gerente Financiero
   *  6  – APROBADO_GERENTE          → Tesorería
   *  7  – COMPLETADO                → Finalizado (todos done)
   */
  getPipelineStepIndex(tramite: TramiteRequisicion): number {
    const estado = tramite.estadoTramite;

    if (estado === 'COMPLETADO') return 6;
    if (estado === 'EN_TESORERIA') return 5;
    if (estado === 'APROBADO_CONTABILIDAD') return 5;
    if (estado === 'EN_CONTABILIDAD' || estado === 'ESPERANDO_CONTABILIDAD')
      return 4;
    if (estado === 'EN_CADENA_SUMINISTROS') return 3;
    if (
      estado === 'ESPERANDO_VISTO_BUENO' ||
      estado === 'VISTO_BUENO' ||
      estado === 'RECHAZADO_JEFE'
    )
      return 2;
    if (tramite.ordenesCargadas && tramite.ordenesCargadas.length > 0) return 1;
    return 0;
  }

  getStepDescription(index: number): string {
    return STEP_DESCRIPTIONS[index] || '';
  }

  getCurrentStepName(tramite: TramiteRequisicion): string {
    const step = this.getPipelineStepIndex(tramite);
    if (tramite.estadoTramite === 'RECHAZADO_JEFE') return 'Rechazado';
    if (step >= PIPELINE_STEPS.length) return 'Finalizado';
    return PIPELINE_STEPS[step].label;
  }

  /**
   * Retorna el estado de aprobación/rechazo de un paso.
   * Compara con el historial de vistos buenos cargado para el trámite.
   * Si no hay historial, determina por el estado del trámite.
   */
  getStepStatus(
    tramite: TramiteRequisicion,
    stepIndex: number,
  ): 'APROBADO' | 'RECHAZADO' | 'PENDIENTE' | 'EN_CURSO' {
    const si = this.getPipelineStepIndex(tramite);

    // Si el trámite fue rechazado
    if (
      (tramite.estadoTramite === 'RECHAZADO_JEFE' ||
        tramite.estadoTramite === 'RECHAZADO') &&
      stepIndex === 2
    ) {
      return 'RECHAZADO';
    }

    // Revisa historial si está cargado
    const historial = this.tramiteHistorial().get(tramite.id!);
    if (historial && historial.length > 0) {
      const stepKeyMap: Record<number, string> = {
        0: 'solicitud',
        1: 'gestion',
        2: 'COMPRAS',
        3: 'CADENA',
        4: 'CONTABILIDAD',
        5: 'tesoreria',
      };
      const vistaKey = stepKeyMap[stepIndex];
      const match = historial.find((h) => h.stepKey === vistaKey);
      if (match) {
        if (match.estado === 'RECHAZADO') return 'RECHAZADO';
        if (match.estado === 'APROBADO' || match.estado === 'COMPLETADO')
          return 'APROBADO';
      }
    }

    if (stepIndex < si) return 'APROBADO';
    if (stepIndex === si) return 'EN_CURSO';
    return 'PENDIENTE';
  }

  getProgressPercent(tramite: TramiteRequisicion): string {
    const step = this.getPipelineStepIndex(tramite);
    const total = PIPELINE_STEPS.length; // 7
    const pct = Math.min(100, Math.round((step / total) * 100));
    return pct + '%';
  }

  getProgressLabel(tramite: TramiteRequisicion): string {
    const step = this.getPipelineStepIndex(tramite);
    const total = PIPELINE_STEPS.length;
    if (step >= total) return 'Completado';
    return `Paso ${step + 1} de ${total}`;
  }

  getTimelineWidth(tramite: TramiteRequisicion): string {
    const step = this.getPipelineStepIndex(tramite);
    const total = PIPELINE_STEPS.length;
    if (step >= total) return '100%';
    return Math.round((step / total) * 100) + '%';
  }

  getAvatarLetter(tramite: TramiteRequisicion): string {
    const num = tramite.requisicion.numeroRequisicion;
    if (num && num.length > 0) {
      const match = num.match(/[A-Za-z]/);
      return match ? match[0].toUpperCase() : num.charAt(0);
    }
    return 'R';
  }

  getEstadoLabel(tramite: TramiteRequisicion): string {
    const labels: Record<string, string> = {
      EN_PROCESO: 'En Proceso',
      ESPERANDO_VISTO_BUENO: 'Esperando Visto Bueno',
      VISTO_BUENO: 'Visto Bueno',
      RECHAZADO_JEFE: 'Rechazado por Jefe',
      ACEPTADO_CON_NOVEDAD: 'Aceptado con Novedad',
      EN_CADENA_SUMINISTROS: 'En Cadena de Suministros',
      EN_CONTABILIDAD: 'En Contabilidad',
      ESPERANDO_CONTABILIDAD: 'En Contabilidad',
      APROBADO_CONTABILIDAD: 'Aprobado Contabilidad',
      EN_TESORERIA: 'En Tesorería',
      COMPLETADO: 'Completado',
      RECHAZADO: 'Rechazado',
    };
    return labels[tramite.estadoTramite] || tramite.estadoTramite;
  }

  getEstadoClass(tramite: TramiteRequisicion): string {
    const classes: Record<string, string> = {
      EN_PROCESO: 'bg-blue-100 text-blue-700 border-blue-200',
      ESPERANDO_VISTO_BUENO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      VISTO_BUENO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      EN_CADENA_SUMINISTROS: 'bg-orange-100 text-orange-700 border-orange-200',
      EN_CONTABILIDAD: 'bg-amber-100 text-amber-700 border-amber-200',
      ESPERANDO_CONTABILIDAD: 'bg-amber-100 text-amber-700 border-amber-200',
      APROBADO_CONTABILIDAD: 'bg-violet-100 text-violet-700 border-violet-200',
      EN_TESORERIA: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      COMPLETADO: 'bg-green-100 text-green-700 border-green-200',
      RECHAZADO_JEFE: 'bg-red-100 text-red-700 border-red-200',
      RECHAZADO: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      classes[tramite.estadoTramite] ||
      'bg-gray-100 text-gray-700 border-gray-200'
    );
  }

  formatCurrency(value: number | undefined): string {
    if (!value && value !== 0) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatDateTime(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return (
      d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ' ' +
      d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    );
  }

  getStepStatusLabel(estado: string): string {
    const labels: Record<string, string> = {
      COMPLETADO: 'Completado',
      EN_CURSO: 'En curso',
      PENDIENTE: 'Pendiente',
      RECHAZADO: 'Rechazado',
      APROBADO: 'Aprobado',
    };
    return labels[estado] || estado;
  }

  verTramite(tramite: TramiteRequisicion): void {
    this.openDetailModal(tramite);
  }

  openDetailModal(tramite: TramiteRequisicion): void {
    this.detailModalTramite.set(tramite);
    this.detailModalOpen.set(true);
    // Ensure tracking data is loaded
    if (tramite.id) {
      this.fetchTrackingTimeline(tramite.id);
    }
  }

  closeDetailModal(): void {
    this.detailModalOpen.set(false);
    this.detailModalTramite.set(null);
  }

  irATramitar(tramite: TramiteRequisicion): void {
    if (tramite.solicitudCompraId) {
      this.router.navigate(['/compras/tramitar', tramite.solicitudCompraId]);
    }
  }

  /** Returns the rejection step(s) from the tracking timeline */
  getRejectionSteps(tramiteId: number): TrackingStep[] {
    const steps = this.getTrackingSteps(tramiteId);
    return steps.filter((s) => s.estado === 'RECHAZADO');
  }

  /** Check if the tramite is in a rejected state */
  isRejected(tramite: TramiteRequisicion): boolean {
    return (
      tramite.estadoTramite === 'RECHAZADO_JEFE' ||
      tramite.estadoTramite === 'ACEPTADO_CON_NOVEDAD'
    );
  }

  volver(): void {
    this.router.navigate(['/compras/gestion']);
  }
}
