import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TramitarRequisicionCsService } from '../services/tramitar-requisicion-cs.service';
import { TramiteRequisicion } from '../models/tramitar-requisicion-cs.model';
import { OtpCsService } from '../services/otp-cs.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { forkJoin } from 'rxjs';

type TabType = 'todos' | 'pendientes' | 'rechazados' | 'aceptados';
type BulkAction = 'APROBADO' | 'RECHAZADO';

@Component({
  selector: 'app-bandeja-visto-bueno-cs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bandeja-visto-bueno-cs.component.html',
  styleUrls: ['./bandeja-visto-bueno-cs.component.scss'],
})
export class BandejaVistoBuenoCsComponent implements OnInit, OnDestroy {
  tramitesPendientes = signal<TramiteRequisicion[]>([]);
  tramitesRechazados = signal<TramiteRequisicion[]>([]);
  tramitesAceptados = signal<TramiteRequisicion[]>([]);
  loading = signal(true);
  activeTab = signal<TabType>('todos');
  busqueda = signal('');

  // Toast
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  // ─── Selection mode ────────────────────────────────────────────────
  selectionMode = signal(false);
  selectedIds = signal<Set<number>>(new Set());
  bulkProcessing = signal(false);
  showBulkConfirm = signal(false);
  bulkAction = signal<BulkAction | null>(null);
  bulkObservaciones = signal('');

  selectedCount = computed(() => this.selectedIds().size);

  allPendientesSelected = computed(() => {
    const filtered = this.pendientesFiltrados();
    if (filtered.length === 0) return false;
    const sel = this.selectedIds();
    return filtered.every((t) => sel.has(t.id!));
  });

  somePendientesSelected = computed(() => {
    const filtered = this.pendientesFiltrados();
    const sel = this.selectedIds();
    const count = filtered.filter((t) => sel.has(t.id!)).length;
    return count > 0 && count < filtered.length;
  });

  tramitesTodos = computed(() => [
    ...this.tramitesPendientes(),
    ...this.tramitesRechazados(),
    ...this.tramitesAceptados(),
  ]);

  todosFiltrados = computed(() => this.filtrar(this.tramitesTodos()));
  pendientesFiltrados = computed(() => this.filtrar(this.tramitesPendientes()));
  rechazadosFiltrados = computed(() => this.filtrar(this.tramitesRechazados()));
  aceptadosFiltrados = computed(() => this.filtrar(this.tramitesAceptados()));

  // ─── Pre-OTP confirmation (shows email, asks to send code) ─────────
  showPreOtpModal = signal(false);
  userEmail = signal('');
  userEmailMasked = signal('');

  // ─── OTP verification ──────────────────────────────────────────────
  showOtpModal = signal(false);
  otpCodigo = signal('');
  otpSending = signal(false);
  otpVerifying = signal(false);
  otpEmailMasked = signal('');
  otpError = signal('');
  otpResendCooldown = signal(0);
  private otpTimer: ReturnType<typeof setInterval> | null = null;

  // ─── Expand / collapse card ────────────────────────────────────────
  expandedId = signal<number | null>(null);

  // ─── Computed helpers for template ─────────────────────────────────
  currentFilteredList = computed(() => {
    switch (this.activeTab()) {
      case 'todos':       return this.todosFiltrados();
      case 'pendientes':  return this.pendientesFiltrados();
      case 'rechazados':  return this.rechazadosFiltrados();
      case 'aceptados':   return this.aceptadosFiltrados();
    }
  });

  getTabForTramite(tramite: TramiteRequisicion): 'pendientes' | 'rechazados' | 'aceptados' {
    if (this.tramitesPendientes().some(t => t.id === tramite.id)) return 'pendientes';
    if (this.tramitesRechazados().some(t => t.id === tramite.id)) return 'rechazados';
    return 'aceptados';
  }

  constructor(
    private tramiteService: TramitarRequisicionCsService,
    private router: Router,
    private otpService: OtpCsService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  ngOnDestroy(): void {
    if (this.otpTimer) {
      clearInterval(this.otpTimer);
      this.otpTimer = null;
    }
  }

  cargarDatos(): void {
    this.loading.set(true);
    forkJoin({
      pendientes: this.tramiteService.getBandejaVistoBueno(),
      rechazados: this.tramiteService.getBandejaRechazados(),
      aceptados: this.tramiteService.getBandejaAceptados(),
    }).subscribe({
      next: ({ pendientes, rechazados, aceptados }) => {
        this.tramitesPendientes.set(pendientes);
        this.tramitesRechazados.set(rechazados);
        this.tramitesAceptados.set(aceptados);
        this.loading.set(false);
      },
      error: () => {
        this.displayToast('Error al cargar la bandeja', 'error');
        this.loading.set(false);
      },
    });
  }

  setTab(tab: TabType): void {
    this.activeTab.set(tab);
  }

  onBusqueda(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  revisarTramite(tramite: TramiteRequisicion): void {
    this.router.navigate(['/cadena-suministros/visto-bueno', tramite.solicitudCompraId]);
  }

  // ─── Selection mode ──────────────────────────────────────────────────────────

  toggleSelectionMode(): void {
    const entering = !this.selectionMode();
    this.selectionMode.set(entering);
    if (!entering) {
      this.selectedIds.set(new Set());
    }
  }

  onCardClick(tramite: TramiteRequisicion): void {
    if (this.selectionMode() && this.activeTab() === 'pendientes') {
      this.toggleSelect(tramite.id!);
    } else {
      this.toggleExpand(tramite.id!);
    }
  }

  toggleSelect(id: number): void {
    const current = new Set(this.selectedIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedIds.set(current);
  }

  isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  selectAll(): void {
    const ids = this.pendientesFiltrados()
      .filter((t) => t.id != null)
      .map((t) => t.id!);
    this.selectedIds.set(new Set(ids));
  }

  toggleSelectAll(): void {
    if (this.allPendientesSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectAll();
    }
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  exitSelectionMode(): void {
    this.selectionMode.set(false);
    this.selectedIds.set(new Set());
  }

  // ─── Bulk actions ────────────────────────────────────────────────────────────

  openBulkConfirm(action: BulkAction): void {
    this.bulkAction.set(action);
    this.bulkObservaciones.set('');
    this.showBulkConfirm.set(true);
  }

  closeBulkConfirm(): void {
    this.showBulkConfirm.set(false);
    this.bulkAction.set(null);
    this.bulkObservaciones.set('');
  }

  executeBulkAction(): void {
    const action = this.bulkAction();
    if (!action || this.selectedIds().size === 0) return;

    if (action === 'APROBADO') {
      this.showBulkConfirm.set(false);
      const user = this.authService.getCurrentUser();
      const email = user?.email || '';
      this.userEmail.set(email);
      this.userEmailMasked.set(this.maskEmail(email));
      this.showPreOtpModal.set(true);
    } else {
      this.doExecuteBulk();
    }
  }

  confirmSendOtp(): void {
    this.otpSending.set(true);
    this.otpError.set('');
    this.otpCodigo.set('');

    this.otpService.solicitarOtp('VISTO_BUENO').subscribe({
      next: (res) => {
        this.otpSending.set(false);
        this.showPreOtpModal.set(false);
        this.otpEmailMasked.set(res.emailEnmascarado);
        this.showOtpModal.set(true);
        this.startResendCooldown();
      },
      error: () => {
        this.otpSending.set(false);
        this.showPreOtpModal.set(false);
        this.displayToast('Error al enviar el código de verificación', 'error');
      },
    });
  }

  closePreOtpModal(): void {
    this.showPreOtpModal.set(false);
  }

  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email || 'correo no disponible';
    const [local, domain] = email.split('@');
    if (local.length <= 3) return local.charAt(0) + '***@' + domain;
    return local.substring(0, 3) + '***@' + domain;
  }

  private doExecuteBulk(): void {
    const ids = Array.from(this.selectedIds());
    const action = this.bulkAction();
    if (!action || ids.length === 0) return;

    this.bulkProcessing.set(true);

    const estado = action === 'APROBADO' ? 'APROBADO' : 'RECHAZADO';
    const obs = this.bulkObservaciones().trim() || undefined;

    const requests = ids.map((tramiteId) =>
      this.tramiteService.registrarVistoBueno(tramiteId, {
        estado,
        observaciones: obs,
        revisadoPor: 'Jefe de Compras',
      }),
    );

    forkJoin(requests).subscribe({
      next: () => {
        const label = action === 'APROBADO' ? 'aprobados' : 'rechazados';
        this.displayToast(
          `${ids.length} trámite${ids.length > 1 ? 's' : ''} ${label} exitosamente`,
          'success',
        );
        this.closeBulkConfirm();
        this.clearSelection();
        this.bulkProcessing.set(false);
        this.cargarDatos();
      },
      error: () => {
        this.displayToast(
          'Error al procesar la acción masiva. Algunos trámites pueden no haberse actualizado.',
          'error',
        );
        this.bulkProcessing.set(false);
        this.cargarDatos();
      },
    });
  }

  // ─── OTP verification ──────────────────────────────────────────────────────

  sendOtpCode(): void {
    this.otpSending.set(true);
    this.otpError.set('');
    this.otpCodigo.set('');

    this.otpService.solicitarOtp('VISTO_BUENO').subscribe({
      next: (res) => {
        this.otpSending.set(false);
        this.otpEmailMasked.set(res.emailEnmascarado);
        this.showOtpModal.set(true);
        this.startResendCooldown();
      },
      error: () => {
        this.otpSending.set(false);
        this.displayToast('Error al enviar el código de verificación', 'error');
      },
    });
  }

  resendOtpCode(): void {
    if (this.otpResendCooldown() > 0) return;
    this.sendOtpCode();
  }

  verifyOtpAndSubmit(): void {
    const code = this.otpCodigo().trim();
    if (code.length < 6) {
      this.otpError.set('Ingrese el código de 6 dígitos');
      return;
    }

    this.otpVerifying.set(true);
    this.otpError.set('');

    this.otpService.verificarOtp(code, 'VISTO_BUENO').subscribe({
      next: (res) => {
        this.otpVerifying.set(false);
        if (res.valido) {
          this.closeOtpModal();
          this.doExecuteBulk();
        } else {
          this.otpError.set(res.mensaje || 'Código inválido o expirado');
        }
      },
      error: () => {
        this.otpVerifying.set(false);
        this.otpError.set('Error al verificar el código. Intente de nuevo.');
      },
    });
  }

  closeOtpModal(): void {
    this.showOtpModal.set(false);
    this.otpCodigo.set('');
    this.otpError.set('');
    if (this.otpTimer) {
      clearInterval(this.otpTimer);
      this.otpTimer = null;
    }
  }

  onOtpInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\D/g, '').slice(0, 6);
    this.otpCodigo.set(cleaned);
    input.value = cleaned;
  }

  private startResendCooldown(): void {
    this.otpResendCooldown.set(60);
    if (this.otpTimer) clearInterval(this.otpTimer);
    this.otpTimer = setInterval(() => {
      const val = this.otpResendCooldown();
      if (val <= 1) {
        this.otpResendCooldown.set(0);
        if (this.otpTimer) {
          clearInterval(this.otpTimer);
          this.otpTimer = null;
        }
      } else {
        this.otpResendCooldown.set(val - 1);
      }
    }, 1000);
  }

  private filtrar(lista: TramiteRequisicion[]): TramiteRequisicion[] {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return lista;
    return lista.filter(
      (t) =>
        t.requisicion.numeroRequisicion.toLowerCase().includes(q) ||
        t.requisicion.solicitante.toLowerCase().includes(q) ||
        t.requisicion.areaCentroCosto.toLowerCase().includes(q) ||
        t.requisicion.descripcionBreve?.toLowerCase().includes(q),
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  toggleExpand(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  getTotalTramites(): number {
    return (
      this.tramitesPendientes().length +
      this.tramitesRechazados().length +
      this.tramitesAceptados().length
    );
  }

  getAvatarLetter(tramite: TramiteRequisicion): string {
    const name = tramite.requisicion?.solicitante;
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  formatCurrency(value: number | undefined): string {
    if (!value) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  /**
   * Returns a simplified display label based on which bandeja the tramite belongs to.
   * Pendiente | Completado | Rechazado
   */
  getSimpleEstadoLabel(tramite: TramiteRequisicion): string {
    const tab = this.getTabForTramite(tramite);
    switch (tab) {
      case 'pendientes':  return 'Pendiente';
      case 'rechazados':  return 'Rechazado';
      case 'aceptados':   return 'Completado';
    }
  }

  getEstadoConfig(estado: string): {
    label: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    barClass: string;
  } {
    const map: Record<
      string,
      {
        label: string;
        bgClass: string;
        textClass: string;
        borderClass: string;
        barClass: string;
      }
    > = {
      EN_PROCESO: {
        label: 'Pendiente',
        bgClass: 'bg-amber-50',
        textClass: 'text-amber-700',
        borderClass: 'border-amber-200',
        barClass: 'bg-amber-400',
      },
      ESPERANDO_VISTO_BUENO: {
        label: 'Pendiente',
        bgClass: 'bg-amber-50',
        textClass: 'text-amber-700',
        borderClass: 'border-amber-200',
        barClass: 'bg-amber-400',
      },
      RECHAZADO_JEFE: {
        label: 'Rechazado',
        bgClass: 'bg-red-50',
        textClass: 'text-red-700',
        borderClass: 'border-red-200',
        barClass: 'bg-red-500',
      },
      APROBADO_JEFE: {
        label: 'Completado',
        bgClass: 'bg-green-50',
        textClass: 'text-green-700',
        borderClass: 'border-green-200',
        barClass: 'bg-green-400',
      },
      ACEPTADO_CON_NOVEDAD: {
        label: 'Completado',
        bgClass: 'bg-green-50',
        textClass: 'text-green-700',
        borderClass: 'border-green-200',
        barClass: 'bg-green-400',
      },
      EN_CONTABILIDAD: {
        label: 'Completado',
        bgClass: 'bg-green-50',
        textClass: 'text-green-700',
        borderClass: 'border-green-200',
        barClass: 'bg-green-400',
      },
      APROBADO_CONTABILIDAD: {
        label: 'Completado',
        bgClass: 'bg-green-50',
        textClass: 'text-green-700',
        borderClass: 'border-green-200',
        barClass: 'bg-green-400',
      },
      COMPLETADO: {
        label: 'Completado',
        bgClass: 'bg-green-50',
        textClass: 'text-green-700',
        borderClass: 'border-green-200',
        barClass: 'bg-green-400',
      },
    };
    return (
      map[estado] ?? {
        label: 'Pendiente',
        bgClass: 'bg-amber-50',
        textClass: 'text-amber-700',
        borderClass: 'border-amber-200',
        barClass: 'bg-amber-400',
      }
    );
  }

  calcularTiempoEspera(fechaISO: string | undefined): string {
    if (!fechaISO) return '—';
    const diff = Date.now() - new Date(fechaISO).getTime();
    const h = Math.floor(diff / (1000 * 60 * 60));
    if (h < 1) return 'hace menos de 1h';
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    return `hace ${d} día${d !== 1 ? 's' : ''}`;
  }

  getTotalValor(tramite: TramiteRequisicion): number {
    return tramite.ordenesCargadas.reduce((s, o) => s + (o.valorTotal || 0), 0);
  }

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
