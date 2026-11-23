import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ComprasService } from '../services/compras.service';
import { TramitarRequisicionService } from '../tramitar-requisicion/services/tramitar-requisicion.service';
import { TramiteRequisicion } from '../tramitar-requisicion/models/tramitar-requisicion.model';
import {
  SolicitudCompra,
  StatsCompras,
  EstadoCompra,
  ESTADO_COMPRA_LABELS,
  calcularSemaforo,
  SemaforoColor,
} from '../models/compra.model';

@Component({
  selector: 'app-gestion-compras',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, RouterLink],
  templateUrl: './gestion-compras.component.html',
  styleUrls: ['./gestion-compras.component.scss'],
})
export class GestionComprasComponent implements OnInit {
  // ───── Data ─────────────────────────────
  solicitudes = signal<SolicitudCompra[]>([]);
  filteredSolicitudes = signal<SolicitudCompra[]>([]);
  stats = signal<StatsCompras>({
    totalSolicitudes: 0,
    pendientes: 0,
    realizadas: 0,
    enTramite: 0,
    promedioSla: 0,
    areasMasActivas: 0,
  });

  // ───── Filters ──────────────────────────
  searchTerm = '';
  filterEstado = '';
  openMenuId = signal<number | null>(null);

  // ───── Pagination ───────────────────────
  currentPage = signal(1);
  pageSize = signal(10);
  pageSizeOptions = [5, 10, 25, 50];
  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredSolicitudes().length / this.pageSize())),
  );
  paginatedSolicitudes = computed(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    return this.filteredSolicitudes().slice(start, start + size);
  });

  // ───── Detail modal ─────────────────────
  showDetail = signal(false);
  selectedSolicitud = signal<SolicitudCompra | null>(null);

  // ───── Rejection info modal ─────────────
  showRechazoModal = signal(false);
  rechazoSolicitud = signal<SolicitudCompra | null>(null);
  rechazoTramite = signal<TramiteRequisicion | null>(null);
  rechazoLoading = signal(false);
  rechazoActionLoading = signal(false);
  rechazoMotivo = signal('');
  rechazoObservaciones = signal('');
  rechazoRevisadoPor = signal('');
  rechazoFecha = signal('');

  // ───── Toast ────────────────────────────
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  constructor(
    private comprasService: ComprasService,
    private tramiteService: TramitarRequisicionService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  // =====================================================
  // Data loading
  // =====================================================

  private loadData(): void {
    this.comprasService.getStats().subscribe({
      next: (s) => this.stats.set(s),
    });

    // Load solicitudes and enrich with tramite state
    this.comprasService.getSolicitudes().subscribe({
      next: (data) => {
        // Fetch all tramites to cross-reference states
        this.tramiteService.getAllTramites().subscribe({
          next: (tramites) => {
            const enriched = data.map((s) => {
              const tramite = tramites.find(
                (t) => t.solicitudCompraId === s.id,
              );
              if (tramite) {
                // Map tramite estado to solicitud if more specific
                const tramiteEstado = tramite.estadoTramite;
                if (
                  tramiteEstado === 'RECHAZADO_JEFE' ||
                  tramiteEstado === 'ESPERANDO_VISTO_BUENO'
                ) {
                  return { ...s, estado: tramiteEstado as any };
                }
                if (
                  tramiteEstado === 'EN_CONTABILIDAD' ||
                  tramiteEstado === 'ESPERANDO_CONTABILIDAD' ||
                  tramiteEstado === 'APROBADO_CONTABILIDAD' ||
                  tramiteEstado === 'EN_PROCESO' ||
                  tramiteEstado === 'APROBADO_JEFE' ||
                  tramiteEstado === 'ACEPTADO_CON_NOVEDAD'
                ) {
                  return { ...s, estado: tramiteEstado as any };
                }
              }
              return s;
            });
            this.solicitudes.set(enriched);
            this.filteredSolicitudes.set(enriched);
          },
          error: () => {
            // If tramites fail to load, just use solicitudes as-is
            this.solicitudes.set(data);
            this.filteredSolicitudes.set(data);
          },
        });
      },
    });
  }

  refreshData(): void {
    this.loadData();
  }

  // =====================================================
  // Filtering
  // =====================================================

  filterSolicitudes(): void {
    let result = this.solicitudes();

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.codigoSolicitud.toLowerCase().includes(term) ||
          s.solicitante.toLowerCase().includes(term) ||
          s.areaSolicitante.toLowerCase().includes(term),
      );
    }

    if (this.filterEstado) {
      result = result.filter((s) => {
        const lbl = ESTADO_COMPRA_LABELS[s.estado] || 'Pendiente';
        if (this.filterEstado === 'PENDIENTE') return lbl === 'Pendiente';
        if (this.filterEstado === 'REALIZADO') return lbl === 'Realizado';
        if (this.filterEstado === 'TRAMITE') return lbl === 'En Trámite';
        if (this.filterEstado === 'RECHAZADO') return lbl === 'Rechazado';
        if (this.filterEstado === 'ESPERANDO_VOBO')
          return lbl === 'Esperando VoBo';
        return s.estado === this.filterEstado;
      });
    }

    this.filteredSolicitudes.set(result);
    this.currentPage.set(1);
  }

  // =====================================================
  // Pagination
  // =====================================================

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

  // =====================================================
  // Semáforo helper
  // =====================================================

  getSemaforo(s: SolicitudCompra): SemaforoColor {
    return calcularSemaforo(s.diasTranscurridos, s.slaDias);
  }

  getSemaforoClass(color: SemaforoColor): string {
    switch (color) {
      case 'verde':
        return 'semaforo-verde';
      case 'amarillo':
        return 'semaforo-amarillo';
      case 'rojo':
        return 'semaforo-rojo';
    }
  }

  getSemaforoTooltip(color: SemaforoColor): string {
    switch (color) {
      case 'verde':
        return '≤ 2 días — En tiempo';
      case 'amarillo':
        return 'Cerca del SLA — Precaución';
      case 'rojo':
        return 'Excede SLA — Urgente';
    }
  }

  // =====================================================
  // Estado helpers
  // =====================================================

  getEstadoLabel(estado: EstadoCompra): string {
    return ESTADO_COMPRA_LABELS[estado] || 'Pendiente';
  }

  getEstadoClass(estado: EstadoCompra): string {
    const label = ESTADO_COMPRA_LABELS[estado] || 'Pendiente';
    switch (label) {
      case 'Pendiente':
        return 'estado-pendiente';
      case 'Realizado':
        return 'estado-realizado';
      case 'En Trámite':
        return 'estado-tramite';
      case 'Rechazado':
        return 'estado-rechazado';
      case 'Esperando VoBo':
        return 'estado-esperando-vobo';
      default:
        return 'estado-pendiente';
    }
  }

  isRechazado(s: SolicitudCompra): boolean {
    return s.estado === 'RECHAZADO_JEFE';
  }

  isEsperandoVoBo(s: SolicitudCompra): boolean {
    return s.estado === 'ESPERANDO_VISTO_BUENO';
  }

  // =====================================================
  // Computed stats for cards
  // =====================================================

  get pendientesCount(): number {
    return this.solicitudes().filter((s) => {
      const lbl = ESTADO_COMPRA_LABELS[s.estado] || 'Pendiente';
      return lbl === 'Pendiente';
    }).length;
  }

  get realizadasCount(): number {
    return this.solicitudes().filter((s) => {
      const lbl = ESTADO_COMPRA_LABELS[s.estado] || 'Pendiente';
      return lbl === 'Realizado';
    }).length;
  }

  get enTramiteCount(): number {
    return this.solicitudes().filter((s) => {
      const lbl = ESTADO_COMPRA_LABELS[s.estado] || 'Pendiente';
      return lbl === 'En Trámite';
    }).length;
  }

  get promedioSla(): number {
    const items = this.solicitudes();
    if (!items.length) return 0;
    return (
      Math.round(
        (items.reduce((acc, s) => acc + s.slaDias, 0) / items.length) * 10,
      ) / 10
    );
  }

  get promedioDias(): number {
    const items = this.solicitudes();
    if (!items.length) return 0;
    return (
      Math.round(
        (items.reduce((acc, s) => acc + s.diasTranscurridos, 0) /
          items.length) *
          10,
      ) / 10
    );
  }

  get areasCount(): number {
    return new Set(this.solicitudes().map((s) => s.areaSolicitante)).size;
  }

  get rechazadosCount(): number {
    return this.solicitudes().filter((s) => s.estado === 'RECHAZADO_JEFE')
      .length;
  }

  get esperandoVoBoCount(): number {
    return this.solicitudes().filter(
      (s) => s.estado === 'ESPERANDO_VISTO_BUENO',
    ).length;
  }

  // =====================================================
  // Detail Modal
  // =====================================================

  openDetail(s: SolicitudCompra): void {
    this.selectedSolicitud.set(s);
    this.showDetail.set(true);
    this.openMenuId.set(null);
  }

  closeDetail(): void {
    this.showDetail.set(false);
    this.selectedSolicitud.set(null);
  }

  // =====================================================
  // Actions
  // =====================================================

  verEvidencia(s: SolicitudCompra): void {
    this.openDetail(s);
  }

  verOrdenCompra(s: SolicitudCompra): void {
    this.openDetail(s);
  }

  tramitarRequisicion(s: SolicitudCompra): void {
    this.openMenuId.set(null);
    this.router.navigate(['/compras/tramitar', s.id]);
  }

  toggleMenu(id: number | null): void {
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  // =====================================================
  // Rejection actions
  // =====================================================

  /**
   * Open the rejection info modal for a rejected solicitud.
   * Loads the tramite data to get rejection details.
   */
  verRechazo(s: SolicitudCompra): void {
    this.openMenuId.set(null);
    this.rechazoSolicitud.set(s);
    this.rechazoLoading.set(true);
    this.showRechazoModal.set(true);
    this.rechazoTramite.set(null);
    this.rechazoMotivo.set('');
    this.rechazoObservaciones.set('');
    this.rechazoRevisadoPor.set('');
    this.rechazoFecha.set('');

    this.tramiteService.getTramiteBySolicitudId(s.id).subscribe({
      next: (tramite) => {
        this.rechazoTramite.set(tramite);
        // Intentar obtener datos del mapa embebido
        const vb = tramite?.vistoBuenoJefe;
        if (vb && vb.motivoRechazo) {
          this.rechazoMotivo.set(vb.motivoRechazo);
          this.rechazoObservaciones.set(vb.observaciones || '');
          this.rechazoRevisadoPor.set(vb.revisadoPor || 'Jefe de Compras');
          this.rechazoFecha.set(vb.fechaRevision || '');
          this.rechazoLoading.set(false);
        } else if (tramite?.id) {
          // Fallback: buscar visto-bueno directamente con causaciones
          this.tramiteService.getVistoBuenoActual(tramite.id).subscribe({
            next: (vbActual) => {
              if (vbActual) {
                const causaRechazo = vbActual.causaciones?.find(
                  (c) => c.tipo === 'RECHAZO',
                );
                this.rechazoMotivo.set(
                  causaRechazo?.motivo || 'No hay causal registrada',
                );
                this.rechazoObservaciones.set(vbActual.observaciones || '');
                this.rechazoRevisadoPor.set(
                  vbActual.revisadoPor || 'Jefe de Compras',
                );
                this.rechazoFecha.set(vbActual.fechaRevision || '');
              }
              this.rechazoLoading.set(false);
            },
            error: () => this.rechazoLoading.set(false),
          });
        } else {
          this.rechazoLoading.set(false);
        }
      },
      error: () => {
        this.rechazoLoading.set(false);
      },
    });
  }

  closeRechazoModal(): void {
    this.showRechazoModal.set(false);
    this.rechazoSolicitud.set(null);
    this.rechazoTramite.set(null);
  }

  /**
   * Resend the rejected tramite back to the jefe de compras for review.
   */
  reenviarAJefe(): void {
    const tramite = this.rechazoTramite();
    if (!tramite?.id) return;

    this.rechazoActionLoading.set(true);
    this.tramiteService.reenviarAJefeCompras(tramite.id).subscribe({
      next: () => {
        this.rechazoActionLoading.set(false);
        this.closeRechazoModal();
        this.displayToast(
          'Requisición reenviada al Jefe de Compras exitosamente',
          'success',
        );
        this.loadData();
      },
      error: () => {
        this.rechazoActionLoading.set(false);
        this.displayToast('Error al reenviar la requisición', 'error');
      },
    });
  }

  /**
   * Return the rejected tramite back to solicitud de compra (EN_PROCESO).
   */
  devolverASolicitud(): void {
    const tramite = this.rechazoTramite();
    if (!tramite?.id) return;

    this.rechazoActionLoading.set(true);
    this.tramiteService.devolverASolicitud(tramite.id).subscribe({
      next: () => {
        this.rechazoActionLoading.set(false);
        this.closeRechazoModal();
        this.displayToast(
          'Requisición devuelta a solicitud de compra',
          'success',
        );
        this.loadData();
      },
      error: () => {
        this.rechazoActionLoading.set(false);
        this.displayToast('Error al devolver la requisición', 'error');
      },
    });
  }

  // =====================================================
  // Toast
  // =====================================================

  private displayToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 3500);
  }
}
