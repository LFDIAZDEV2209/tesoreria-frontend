import { HttpEventType } from '@angular/common/http';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { EgresoRegistrado, FacturaEgreso } from '../../../../features/contabilidad/control-egresos/control-egresos.model';
import { ControlEgresosService } from '../../../../features/contabilidad/control-egresos/control-egresos.service';
import { PresupuestoContextService } from '../../../../features/presupuesto/services/presupuesto-context.service';

/**
 * Cargue de C. Egreso: se adjunta ÚNICAMENTE el comprobante de egreso
 * (un solo documento) y se envía a aprobación de Gerencia Financiera.
 * El pago (comprobante de pago + comparación) vive en el módulo Tesorería.
 */
@Component({
  selector: 'app-egreso-financiero',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './egreso-financiero.component.html',
  styleUrl: './egreso-financiero.component.scss',
})
export class EgresoFinancieroComponent implements OnInit {
  @Input({ required: true }) egreso!: EgresoRegistrado;
  readonly ctx = inject(PresupuestoContextService);
  private api = inject(ControlEgresosService);

  readonly actual = signal<EgresoRegistrado | null>(null);
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly mensaje = signal('');
  readonly archivo = signal<File | null>(null);
  readonly progreso = signal<number | null>(null);
  readonly subiendo = signal(false);
  /** Zona de arrastre activa (drag & drop del comprobante). */
  readonly arrastrando = signal(false);

  get e(): EgresoRegistrado {
    return this.actual() ?? this.egreso;
  }

  get estado(): string {
    return this.e.estado ?? 'REGISTRADO';
  }

  get estadoTexto(): string {
    switch (this.estado) {
      case 'REGISTRADO': return 'Pendiente de envío a aprobación';
      case 'EN_REVISION_GERENCIA': return 'En revisión de Gerencia Financiera';
      case 'ENVIADO_TESORERIA': return 'Aprobado · pendiente de pago';
      case 'PAGADO': return 'Pagado · conciliado';
      default: return this.estado;
    }
  }

  get tieneDocumento(): boolean {
    return !!this.e.soporteEgresoKey;
  }

  get puedeCargar(): boolean {
    return this.estado === 'REGISTRADO' && this.ctx.tienePermiso('egresos.treasury.upload_receipt');
  }

  get puedeEnviar(): boolean {
    return this.estado === 'REGISTRADO' && this.tieneDocumento && this.ctx.tienePermiso('egresos.enviar_tesoreria');
  }

  get enRevision(): boolean {
    return this.estado === 'EN_REVISION_GERENCIA';
  }

  get aprobado(): boolean {
    return this.estado === 'ENVIADO_TESORERIA' || this.estado === 'PAGADO';
  }

  get nombreDocumento(): string {
    return this.e.soporteEgresoNombre || 'Comprobante de egreso';
  }

  /** Todas las facturas aprobadas del proveedor que cubre este egreso. */
  get facturas(): FacturaEgreso[] {
    return this.e?.facturas ?? [];
  }

  get totalFacturas(): number {
    return this.facturas.reduce((total, f) => total + Number(f.monto ?? 0), 0);
  }

  estadoFactura(f: FacturaEgreso): string {
    switch (f.estado) {
      case 'pagado': return 'Pagada';
      case 'cancelado': return 'Cancelada';
      default: return f.aprobado ? 'Aprobada' : 'Proyectada';
    }
  }

  claseEstadoFactura(f: FacturaEgreso): string {
    switch (f.estado) {
      case 'pagado': return 'is-pagada';
      case 'cancelado': return 'is-cancelada';
      default: return f.aprobado ? 'is-aprobada' : 'is-proyectada';
    }
  }

  /** "2026-04-08" -> "08/04/2026" (legible en la lista de facturas). */
  fechaCorta(fecha: string | null | undefined): string {
    if (!fecha || fecha.length < 10) return fecha || '—';
    const [a, m, d] = fecha.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }

  ngOnInit(): void {
    if (this.ctx.permisos() === null) this.ctx.cargarPermisos();
    this.cargar();
  }

  cargar(): void {
    if (!this.e.id) return;
    this.ocupado.set(true);
    this.error.set('');
    this.api.obtenerPorId(this.e.id).pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: (r) => { if (r) this.actual.set(r); },
      error: () => this.error.set('No se pudo cargar el egreso.'),
    });
  }

  seleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.procesarArchivo(file);
  }

  /** Resalta la zona mientras el archivo pasa por encima. */
  arrastrarSobreArchivo(evento: DragEvent): void {
    evento.preventDefault();
    if (!this.subiendo()) this.arrastrando.set(true);
  }

  salirArrastreArchivo(): void {
    this.arrastrando.set(false);
  }

  /** Suelta el comprobante sobre la zona: mismo proceso del botón. */
  soltarArchivo(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    this.procesarArchivo(evento.dataTransfer?.files?.[0] ?? null);
  }

  /** Validación local (tipo y 20 MB) antes de subir el comprobante. */
  private procesarArchivo(file: File | null): void {
    if (!file || this.subiendo()) return;
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      this.error.set('Adjunta el comprobante de egreso en PDF, PNG o JPG.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.error.set('El comprobante de egreso supera el máximo de 20 MB.');
      return;
    }
    this.archivo.set(file);
    this.subirDocumento();
  }

  subirDocumento(): void {
    const file = this.archivo();
    if (!file || !this.e.id || this.subiendo()) return;
    this.error.set('');
    this.mensaje.set('');
    this.subiendo.set(true);
    this.progreso.set(0);
    this.api.adjuntarSoporte(this.e.id, file).pipe(
      finalize(() => {
        this.subiendo.set(false);
        this.progreso.set(null);
        this.archivo.set(null);
      }),
    ).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.progreso.set(event.total ? Math.round((100 * event.loaded) / event.total) : null);
          return;
        }
        if (event.type === HttpEventType.Response && event.body) {
          this.mensaje.set('Comprobante de egreso cargado. Ya puedes enviarlo a aprobación.');
          this.cargar();
        }
      },
      error: (err) => this.error.set(
        err?.error?.detail || err?.error?.message || 'No se pudo cargar el comprobante de egreso.',
      ),
    });
  }

  verDocumento(): void {
    if (!this.e.id || !this.tieneDocumento) return;
    this.api.verSoporte(this.e.id).subscribe({
      next: (r) => window.open(r.url, '_blank', 'noopener,noreferrer'),
      error: () => this.error.set('No se pudo abrir el comprobante de egreso.'),
    });
  }

  enviarAprobacion(): void {
    if (!this.puedeEnviar || !this.e.id) return;
    if (!confirm(`¿Enviar el egreso ${this.e.numeroEgreso || this.e.numeroFactura} a aprobación de Gerencia Financiera?`)) return;
    this.ocupado.set(true);
    this.error.set('');
    this.mensaje.set('');
    this.api.enviarARevision(this.e.id).pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: (r) => {
        this.actual.set(r);
        this.mensaje.set('Egreso enviado a aprobación de Gerencia Financiera.');
      },
      error: (err) => this.error.set(
        err?.error?.message || err?.error?.detail || 'No se pudo enviar el egreso a aprobación.',
      ),
    });
  }

  formatear(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(valor));
  }
}
