import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TesoreriaService } from '../services/tesoreria.service';
import { AuthService } from 'src/app/core/services/auth.service';

export interface SolicitudViaticosGerencia {
  id: number;
  tipoSolicitudViaticos?: 'SOLICITUD_VIATICOS' | 'ADELANTO_VIATICOS' | string;
  tipoEmpresa: string;
  nombreEmpresa: string;
  nit: string;
  centroCosto: string;
  areaDependencia: string;
  ciudad: string;
  nombreCompleto: string;
  cargo: string;
  correoElectronico: string;
  telefonoExt: string;
  items: ItemGastoGerencia[];
  subtotalBase: number;
  totalIva: number;
  totalGeneral: number;
  soportePrincipalUrl: string;
  soportesAdicionalesUrls: string;
  observaciones: string;
  estado: string;
  creadoPor: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  revisadoPor?: string;
  observacionesGerencia?: string;
  fechaDecision?: string;
  tramiteCompraId?: number;
}

export interface ItemGastoGerencia {
  tipoViatico: string;
  fechaGasto: string;
  fechaMaximaEvento?: string;
  conceptoDetallado: string;
  observacionItem?: string;
  valorBase: number;
  aplicaIva: boolean;
  porcentajeIva: number;
  valorIva: number;
  valorTotal: number;
  soporteUrl?: string;
}

type TabType = 'pendientes' | 'aprobadas' | 'rechazadas';

@Component({
  selector: 'app-gerencia-viaticos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gerencia-viaticos.component.html',
  styleUrls: ['./gerencia-viaticos.component.scss'],
})
export class GerenciaViaticosComponent implements OnInit {

  // ─── State ────────────────────────────────────────────
  solicitudesPendientes = signal<SolicitudViaticosGerencia[]>([]);
  solicitudesAprobadas  = signal<SolicitudViaticosGerencia[]>([]);
  solicitudesRechazadas = signal<SolicitudViaticosGerencia[]>([]);

  loading    = signal(true);
  activeTab  = signal<TabType>('pendientes');
  busqueda   = signal('');
  expandedId = signal<number | null>(null);
  viewMode   = signal<'cards' | 'table'>('cards');

  // Toast
  showToast    = signal(false);
  toastMessage = signal('');
  toastType    = signal<'success' | 'error' | 'warning' | 'info'>('success');
  private toastTimer: any;

  // ─── Modal de decisión ────────────────────────────────
  showDecisionModal    = signal(false);
  decisionSolicitud    = signal<SolicitudViaticosGerencia | null>(null);
  decisionAccion       = signal<'APROBAR' | 'RECHAZAR' | null>(null);
  decisionObservaciones = signal('');
  decisionProcessing   = signal(false);
  showConfirmRechazo   = signal(false);

  // ─── Modal de detalle completo ────────────────────────
  showDetalleModal    = signal(false);
  detalleSolicitud    = signal<SolicitudViaticosGerencia | null>(null);
  detalleTab          = signal<'info' | 'items'>('info');
  soportesAdicionalesArr = signal<string[]>([]);

  // ─── Computed ─────────────────────────────────────────
  pendientesFiltrados = computed(() => this.filtrar(this.solicitudesPendientes()));
  aprobadasFiltrados  = computed(() => this.filtrar(this.solicitudesAprobadas()));
  rechazadasFiltrados = computed(() => this.filtrar(this.solicitudesRechazadas()));

  totalSolicitudes = computed(() =>
    this.solicitudesPendientes().length +
    this.solicitudesAprobadas().length +
    this.solicitudesRechazadas().length
  );

  currentList = computed(() => {
    switch (this.activeTab()) {
      case 'pendientes': return this.pendientesFiltrados();
      case 'aprobadas':  return this.aprobadasFiltrados();
      case 'rechazadas': return this.rechazadasFiltrados();
    }
  });

  constructor(
    private tesoreriaService: TesoreriaService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarSolicitudes();
  }

  // ─── Carga ────────────────────────────────────────────
  cargarSolicitudes(): void {
    this.loading.set(true);
    this.tesoreriaService.getSolicitudesViaticosGerencia().subscribe({
      next: (data: SolicitudViaticosGerencia[]) => {
        this.solicitudesPendientes.set(data.filter((s) => this.isPendienteEstado(s.estado)));
        this.solicitudesAprobadas.set(data.filter((s) => this.isAprobadaEstado(s.estado)));
        this.solicitudesRechazadas.set(data.filter((s) => this.isRechazadaEstado(s.estado)));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error cargando solicitudes de viáticos:', err);
        this.mostrarToast('Error al cargar las solicitudes', 'error');
        this.loading.set(false);
      },
    });
  }

  private filtrar(list: SolicitudViaticosGerencia[]): SolicitudViaticosGerencia[] {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return list;
    return list.filter(s =>
      s.nombreCompleto?.toLowerCase().includes(q) ||
      s.nombreEmpresa?.toLowerCase().includes(q) ||
      s.correoElectronico?.toLowerCase().includes(q) ||
      s.areaDependencia?.toLowerCase().includes(q) ||
      s.ciudad?.toLowerCase().includes(q) ||
      this.getConceptoSolicitud(s).toLowerCase().includes(q)
    );
  }

  // ─── Tab / search ─────────────────────────────────────
  setTab(tab: TabType): void { this.activeTab.set(tab); }

  onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  toggleExpanded(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ─── Modal detalle ────────────────────────────────────
  abrirDetalle(s: SolicitudViaticosGerencia): void {
    this.detalleSolicitud.set(s);
    this.detalleTab.set('info');
    this.parseSoportesAdicionales(s);
    this.showDetalleModal.set(true);
  }

  cerrarDetalle(): void {
    this.showDetalleModal.set(false);
    this.detalleSolicitud.set(null);
  }

  private parseSoportesAdicionales(s: SolicitudViaticosGerencia): void {
    try {
      const arr: string[] = s.soportesAdicionalesUrls
        ? JSON.parse(s.soportesAdicionalesUrls)
        : [];
      this.soportesAdicionalesArr.set(arr);
    } catch {
      this.soportesAdicionalesArr.set([]);
    }
  }

  // ─── Modal de decisión ────────────────────────────────
  abrirDecision(s: SolicitudViaticosGerencia, accion: 'APROBAR' | 'RECHAZAR'): void {
    this.decisionSolicitud.set(s);
    this.decisionAccion.set(accion);
    this.decisionObservaciones.set('');
    this.showConfirmRechazo.set(false);
    this.showDecisionModal.set(true);
  }

  cerrarDecision(): void {
    if (this.decisionProcessing()) return;
    this.showDecisionModal.set(false);
    this.decisionSolicitud.set(null);
    this.decisionAccion.set(null);
  }

  confirmarDecision(): void {
    const accion = this.decisionAccion();
    if (accion === 'RECHAZAR' && !this.decisionObservaciones().trim()) {
      this.mostrarToast('Debe ingresar una observación para rechazar', 'warning');
      return;
    }
    if (accion === 'RECHAZAR' && !this.showConfirmRechazo()) {
      this.showConfirmRechazo.set(true);
      return;
    }
    this.ejecutarDecision();
  }

  private ejecutarDecision(): void {
    const s = this.decisionSolicitud();
    const accion = this.decisionAccion();
    if (!s || !accion) return;

    this.decisionProcessing.set(true);

    const currentUser = this.authService.getCurrentUser();
    const revisadoPor = currentUser?.username ?? currentUser?.email ?? 'gerencia';

    this.tesoreriaService.decidirSolicitudViaticos(s.id, accion, this.decisionObservaciones(), revisadoPor).subscribe({
      next: () => {
        const label = accion === 'APROBAR' ? 'aprobada' : 'rechazada';
        this.decisionProcessing.set(false); // reset BEFORE cerrarDecision (guard checks this)
        this.mostrarToast(`Solicitud ${label} exitosamente`, 'success');
        this.cerrarDecision();
        this.cargarSolicitudes();
        if (accion === 'APROBAR') {
          setTimeout(() => this.router.navigate(['/contabilidad/gestion']), 700);
        }
      },
      error: (err) => {
        console.error('Error al procesar decisión:', err);
        this.mostrarToast('Error al procesar la decisión', 'error');
        this.decisionProcessing.set(false);
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────────
  canDecidir(solicitud: SolicitudViaticosGerencia): boolean {
    return this.isPendienteEstado(solicitud.estado);
  }

  getEstadoTone(estado: string): 'pendiente' | 'aprobada' | 'rechazada' | 'default' {
    if (this.isPendienteEstado(estado)) return 'pendiente';
    if (this.isAprobadaEstado(estado)) return 'aprobada';
    if (this.isRechazadaEstado(estado)) return 'rechazada';
    return 'default';
  }

  getEstadoClass(estado: string): string {
    const tone = this.getEstadoTone(estado);
    if (tone === 'pendiente') return 'estado-pendiente';
    if (tone === 'aprobada') return 'estado-aprobada';
    if (tone === 'rechazada') return 'estado-rechazada';
    return 'estado-default';
  }

  getEstadoLabel(estado: string): string {
    const normalized = this.normalizeEstado(estado);
    switch (normalized) {
      case 'EN_REVISION_GERENCIA':
      case 'PENDIENTE':
        return 'En revisión de gerencia';
      case 'EN_REVISION_CONTABILIDAD':
        return 'En revisión de contabilidad';
      case 'REVISION_TESORERIA':
      case 'EN_TESORERIA':
        return 'Revisión tesorería';
      case 'APROBADA':
        return 'Aprobada';
      case 'RECHAZADA':
        return 'Rechazada';
      default:
        return estado;
    }
  }

  formatCurrency(val: number): string {
    if (val == null) return '$0';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
  }

  getFileNameFromUrl(url: string): string {
    if (!url) return 'Archivo';
    const parts = url.split('/');
    return parts[parts.length - 1] || 'Archivo';
  }

  isImage(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
  }

  isPdf(url: string): boolean {
    return /\.pdf$/i.test(url);
  }

  getConceptoSolicitud(s: SolicitudViaticosGerencia): string {
    return s.tipoSolicitudViaticos === 'ADELANTO_VIATICOS'
      ? 'Adelanto de viaticos'
      : 'Solicitud de viaticos';
  }

  isAdelantoSolicitud(s: SolicitudViaticosGerencia): boolean {
    return s.tipoSolicitudViaticos === 'ADELANTO_VIATICOS';
  }

  hasObservacionItem(item: ItemGastoGerencia): boolean {
    return !!item.observacionItem?.trim();
  }

  getTipoSolicitudLabel(s: SolicitudViaticosGerencia): string {
    return s.tipoSolicitudViaticos === 'ADELANTO_VIATICOS'
      ? 'Anticipo'
      : 'Solicitud';
  }

  getTipoSolicitudClass(s: SolicitudViaticosGerencia): string {
    return s.tipoSolicitudViaticos === 'ADELANTO_VIATICOS'
      ? 'tipo-solicitud-anticipo'
      : 'tipo-solicitud-solicitud';
  }

  private mostrarToast(msg: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    clearTimeout(this.toastTimer);
    this.toastMessage.set(msg);
    this.toastType.set(type);
    this.showToast.set(true);
    this.toastTimer = setTimeout(() => this.showToast.set(false), 4000);
  }

  private normalizeEstado(estado?: string): string {
    return (estado || '').trim().toUpperCase();
  }

  private isPendienteEstado(estado?: string): boolean {
    const normalized = this.normalizeEstado(estado);
    return normalized === 'EN_REVISION_GERENCIA' || normalized === 'PENDIENTE';
  }

  private isAprobadaEstado(estado?: string): boolean {
    const normalized = this.normalizeEstado(estado);
    return (
      normalized === 'EN_REVISION_CONTABILIDAD' ||
      normalized === 'REVISION_TESORERIA' ||
      normalized === 'EN_TESORERIA' ||
      normalized === 'APROBADA'
    );
  }

  private isRechazadaEstado(estado?: string): boolean {
    return this.normalizeEstado(estado) === 'RECHAZADA';
  }
}
