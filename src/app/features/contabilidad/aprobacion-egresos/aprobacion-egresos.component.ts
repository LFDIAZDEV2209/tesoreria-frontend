import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ControlEgresosService } from '../control-egresos/control-egresos.service';
import { EgresoRegistrado } from '../control-egresos/control-egresos.model';
import { AuthService } from '../../../core/services/auth.service';
import { PresupuestoContextService } from '../../presupuesto/services/presupuesto-context.service';
import { GpPermisoDirective } from '../../presupuesto/directives/gp-permiso.directive';

@Component({
  selector: 'app-aprobacion-egresos',
  standalone: true,
  imports: [CommonModule, FormsModule, GpPermisoDirective],
  templateUrl: './aprobacion-egresos.component.html',
  styleUrls: ['./aprobacion-egresos.component.scss'],
})
export class AprobacionEgresosComponent implements OnInit {
  solicitudes = signal<EgresoRegistrado[]>([]);
  isLoading = signal(false);
  procesandoId = signal<number | null>(null);

  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  searchTerm = signal('');

  /** Permiso real (matriz de roles): aprobar/rechazar eliminaciones. */
  puedeResolver = computed(() =>
    this.ctx.tienePermiso('egresos.deletion.approve') || this.ctx.tienePermiso('egresos.deletion.reject'));

  filtered = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const all = this.solicitudes();
    if (!q) return all;
    return all.filter(
      (e) =>
        e.numeroFactura?.toLowerCase().includes(q) ||
        e.nitProveedor?.toLowerCase().includes(q) ||
        e.proveedorNombre?.toLowerCase().includes(q) ||
        e.solicitadoPor?.toLowerCase().includes(q),
    );
  });

  constructor(
    private controlEgresosService: ControlEgresosService,
    private authService: AuthService,
    public ctx: PresupuestoContextService,
  ) {}

  ngOnInit(): void {
    if (this.ctx.permisos() === null) this.ctx.cargarPermisos();
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.controlEgresosService.listarSolicitudesEliminacion().subscribe({
      next: (data) => {
        this.solicitudes.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  aprobar(e: EgresoRegistrado): void {
    if (!e.id) return;
    if (!confirm(`¿Aprobar la eliminación del egreso ${e.numeroFactura}? Se marcará como ELIMINADO.`)) {
      return;
    }
    this.procesandoId.set(e.id);
    this.controlEgresosService.resolverEliminacion(e.id, true).subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.load();
        this.displayToast(`Egreso ${e.numeroFactura} eliminado`, 'success');
      },
      error: (err) => {
        this.procesandoId.set(null);
        this.displayToast(err?.error?.message || 'No se pudo aprobar.', 'error');
      },
    });
  }

  rechazar(e: EgresoRegistrado): void {
    if (!e.id) return;
    if (!confirm(`¿Rechazar la eliminación del egreso ${e.numeroFactura}? Volverá a REGISTRADO.`)) {
      return;
    }
    this.procesandoId.set(e.id);
    this.controlEgresosService.resolverEliminacion(e.id, false).subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.load();
        this.displayToast(`Egreso ${e.numeroFactura} devuelto a registrados`, 'success');
      },
      error: (err) => {
        this.procesandoId.set(null);
        this.displayToast(err?.error?.message || 'No se pudo rechazar.', 'error');
      },
    });
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  private displayToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }
}
