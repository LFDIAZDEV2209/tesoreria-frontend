import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { Contrato, ResumenGerencial, formatoCOP } from '../../models/presupuesto.model';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpKpiComponent } from '../../components/gp-kpi/gp-kpi.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { mensajeError } from '../../services/gp-errores';

/**
 * Aprobación Consolidada — adaptada al backend del gestor:
 * una fila por empresa (resumen-gerencial) con su estado de aprobación
 * (contrato) y las acciones Aprobar / Rechazar del presupuesto mensual.
 */
@Component({
  selector: 'app-aprobacion-consolidada',
  standalone: true,
  imports: [CommonModule, FormsModule, GpPageHeaderComponent, GpIconComponent, GpKpiComponent, GpErrorStateComponent],
  templateUrl: './aprobacion-consolidada.component.html',
  styleUrls: ['./aprobacion-consolidada.component.scss'],
})
export class AprobacionConsolidadaComponent implements OnInit {

  filas = signal<ResumenGerencial[]>([]);
  estados = signal<Map<number, Contrato>>(new Map());
  cargando = signal(true);
  error = signal<string | null>(null);
  aviso = signal<string | null>(null);
  seleccionada = signal<number | null>(null);
  aprobando = signal(false);
  /** Empresa a la que se le está escribiendo el motivo de rechazo. */
  rechazando = signal<number | null>(null);
  motivo = signal('');

  constructor(
    private service: PresupuestoService,
    public ctx: PresupuestoContextService,
  ) {}

  ngOnInit(): void {
    if (this.ctx.permisos() === null) this.ctx.cargarPermisos();
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.service.resumenGerencial().subscribe({
      next: (filas) => {
        this.filas.set(filas);
        if (filas.length === 0) { this.cargando.set(false); return; }
        forkJoin(filas.map((f) => this.service.contrato(f.empresaId))).subscribe({
          next: (contratos) => {
            const mapa = new Map<number, Contrato>();
            filas.forEach((f, i) => mapa.set(f.empresaId, contratos[i]));
            this.estados.set(mapa);
            this.cargando.set(false);
          },
          error: (e) => this.fallo(e),
        });
      },
      error: (e) => this.fallo(e),
    });
  }

  private fallo(e: any): void {
    this.cargando.set(false);
    this.error.set(mensajeError(e, 'No se pudo cargar la aprobación consolidada. Intenta de nuevo.'));
  }

  // ── Derivados ──

  filasOrdenadas = computed(() =>
    [...this.filas()].sort((a, b) => (a.nombreEmpresa ?? '').localeCompare(b.nombreEmpresa ?? '')));

  estadoDe(empresaId: number): Contrato | null {
    return this.estados().get(empresaId) ?? null;
  }

  chipEstado(empresaId: number): { texto: string; clase: string } {
    const estado = this.estadoDe(empresaId)?.estadoAprobacion ?? null;
    if (estado === 'aprobado') return { texto: 'Aprobado', clase: 'chip-ok' };
    if (estado === 'rechazado') return { texto: 'Rechazado', clase: 'chip-danger' };
    return { texto: 'Pendiente', clase: 'chip-warn' };
  }

  totalDisponible = computed(() =>
    this.filas().reduce((a, f) => a + (f.totalDisponible ?? 0), 0));

  aprobadas = computed(() => this.filas().filter(
    (f) => this.estadoDe(f.empresaId)?.estadoAprobacion === 'aprobado').length);

  pendientes = computed(() => this.filas().length - this.aprobadas());

  puedeAprobar = computed(() =>
    (this.ctx.permisos()?.puedeAprobar ?? false)
    && this.ctx.tienePermiso('presupuesto.aprobar'));

  // ── Acciones ──

  seleccionar(empresaId: number): void {
    this.seleccionada.update((id) => (id === empresaId ? null : empresaId));
    this.rechazando.set(null);
    this.aviso.set(null);
  }

  prepararRechazo(empresaId: number, evento: Event): void {
    evento.stopPropagation();
    this.rechazando.set(empresaId);
    this.motivo.set('');
    this.seleccionada.set(empresaId);
  }

  cancelarRechazo(): void {
    this.rechazando.set(null);
    this.motivo.set('');
  }

  async aprobar(empresaId: number): Promise<void> {
    if (this.aprobando()) return;
    this.aprobando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    try {
      const contrato = await new Promise<Contrato>((resolve, reject) =>
        this.service.aprobar(empresaId).subscribe({ next: resolve, error: reject }));
      this.estados.update((m) => new Map(m).set(empresaId, contrato));
      const nombre = this.filas().find((f) => f.empresaId === empresaId)?.nombreEmpresa ?? 'la empresa';
      this.aviso.set(`Presupuesto de ${nombre} aprobado.`);
      this.rechazando.set(null);
    } catch (e: any) {
      this.error.set(mensajeError(e, 'No se pudo aprobar el presupuesto. Intenta de nuevo.'));
    } finally {
      this.aprobando.set(false);
    }
  }

  async confirmarRechazo(empresaId: number): Promise<void> {
    const motivo = this.motivo().trim();
    if (!motivo) { this.error.set('Escribe el motivo del rechazo.'); return; }
    if (this.aprobando()) return;
    this.aprobando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    try {
      const contrato = await new Promise<Contrato>((resolve, reject) =>
        this.service.rechazar(empresaId, motivo).subscribe({ next: resolve, error: reject }));
      this.estados.update((m) => new Map(m).set(empresaId, contrato));
      const nombre = this.filas().find((f) => f.empresaId === empresaId)?.nombreEmpresa ?? 'la empresa';
      this.aviso.set(`Presupuesto de ${nombre} rechazado.`);
      this.rechazando.set(null);
      this.motivo.set('');
    } catch (e: any) {
      this.error.set(mensajeError(e, 'No se pudo rechazar el presupuesto. Intenta de nuevo.'));
    } finally {
      this.aprobando.set(false);
    }
  }

  cp(v: number | null | undefined): string { return formatoCOP(v); }
}
