import { HttpEventType } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { EgresoRegistrado } from '../../../../features/contabilidad/control-egresos/control-egresos.model';
import { ControlEgresosService } from '../../../../features/contabilidad/control-egresos/control-egresos.service';
import { PresupuestoContextService } from '../../../../features/presupuesto/services/presupuesto-context.service';
import { EgresoFinancieroService, EstadoFinanciero, SoporteFinanciero, CuentaFinanciera } from '../../services/egreso-financiero.service';

/**
 * Módulo Tesorería: adjunta el comprobante de pago, lo compara con el
 * documento de egreso y, si coincide, registra el pago y queda conciliado.
 */
@Component({
  selector: 'app-pago-egreso',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pago-egreso.component.html',
  styleUrl: '../egreso-financiero/egreso-financiero.component.scss',
})
export class PagoEgresoComponent implements OnInit {
  @Input({ required: true }) egreso!: EgresoRegistrado;
  @Output() volver = new EventEmitter<void>();
  @Output() actualizado = new EventEmitter<void>();

  readonly ctx = inject(PresupuestoContextService);
  private api = inject(EgresoFinancieroService);
  private docs = inject(ControlEgresosService);

  readonly estado = signal<EstadoFinanciero | null>(null);
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly mensaje = signal('');

  archivo: File | null = null;
  readonly progresoArchivo = signal<number | null>(null);
  readonly cargandoArchivo = signal(false);
  readonly cuentas = signal<CuentaFinanciera[]>([]);
  bancoSeleccionado: number | null = null;
  confirmarPago = false;
  motivo = '';
  readonly anulandoId = signal<number | null>(null);
  fechaConciliacion = '';
  referenciaConciliacion = '';
  importeConciliacion: number | null = null;
  readonly hoy = new Date().toISOString().slice(0, 10);

  ngOnInit(): void {
    if (this.ctx.permisos() === null) this.ctx.cargarPermisos();
    this.cargar();
  }

  cargar(): void {
    if (!this.egreso.id) return;
    this.error.set('');
    this.ocupado.set(true);
    this.api.estado(this.egreso.id).pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: (e) => {
        this.estado.set(e);
        this.prefillConciliacion();
        this.cargarCuentas(e.empresaId);
      },
      error: (err) => this.fallo(err),
    });
  }

  private prefillConciliacion(): void {
    const e = this.estado();
    if (!e || e.estado !== 'PAGADO' || e.conciliacionId) return;
    const s = this.soporte ?? this.ultimoComprobante;
    if (!this.fechaConciliacion) this.fechaConciliacion = s?.fecha || this.hoy;
    if (!this.referenciaConciliacion) this.referenciaConciliacion = s?.referencia || '';
    if (this.importeConciliacion === null || this.importeConciliacion === undefined) this.importeConciliacion = this.neto;
  }

  get pendiente(): boolean { return this.estado()?.estado === 'ENVIADO_TESORERIA'; }
  get soporte(): SoporteFinanciero | undefined {
    const e = this.estado();
    if (!e?.comprobanteId) return undefined;
    return e.comprobantes.find((s) => s.id === e.comprobanteId);
  }
  get ultimoComprobante(): SoporteFinanciero | undefined { return this.estado()?.comprobantes?.[0]; }
  get soporteAprobado(): boolean { return this.soporte?.estado === 'APROBADO'; }
  get neto(): number { return Number(this.egreso.valorNetoPagar ?? ((this.egreso.valor ?? 0) - (this.egreso.reteFuente ?? 0) - (this.egreso.reteIca ?? 0))); }
  get cargandoEstado(): boolean { return !this.estado() && !this.error(); }
  get puedeAdjuntar(): boolean { return this.pendiente && this.ctx.tienePermiso('egresos.treasury.upload_receipt'); }
  get puedePagar(): boolean { return this.pendiente && this.soporteAprobado && this.ctx.tienePermiso('egresos.treasury.process_payment'); }
  get conciliacionPendiente(): boolean { const e = this.estado(); return !!e && e.estado === 'PAGADO' && !e.conciliacionId; }
  get puedeConciliar(): boolean { return this.conciliacionPendiente && this.ctx.tienePermiso('bancos.conciliar'); }
  /** El comprobante no dejó cuenta de salida: hay que elegirla para registrar el pago. */
  get requiereCuentaSalida(): boolean { return this.puedePagar && !this.soporte?.bancoId; }
  get conciliado(): boolean { return this.estado()?.estado === 'CONCILIADO'; }
  get historial(): SoporteFinanciero[] { return (this.estado()?.comprobantes ?? []).slice(1); }
  get tieneDocumentoEgreso(): boolean { return !!this.egreso.soporteEgresoKey; }
  get nombreDocumentoEgreso(): string { return this.egreso.soporteEgresoNombre || 'Documento de egreso'; }

  abrirDocumentoEgreso(): void {
    if (!this.egreso.id || !this.tieneDocumentoEgreso) return;
    this.docs.verSoporte(this.egreso.id).subscribe({
      next: (r) => window.open(r.url, '_blank', 'noopener,noreferrer'),
      error: () => this.error.set('No se pudo abrir el documento de egreso.'),
    });
  }

  seleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
  }

  diferencias(s: SoporteFinanciero): string[] {
    try {
      const parsed = JSON.parse(s.diferencias || '[]');
      return Array.isArray(parsed) ? parsed : ['No se pudo leer el resultado de validación.'];
    } catch { return ['No se pudo leer el resultado de validación.']; }
  }

  adjuntar(): void {
    if (!this.archivo || this.ocupado()) return;
    if (this.archivo.size > 50 * 1024 * 1024) { this.error.set('El comprobante supera 50 MB.'); return; }
    this.iniciar();
    this.cargandoArchivo.set(true);
    this.progresoArchivo.set(0);
    this.api.adjuntar(this.egreso.id!, this.archivo).pipe(
      finalize(() => { this.ocupado.set(false); this.cargandoArchivo.set(false); this.progresoArchivo.set(null); }),
    ).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.progresoArchivo.set(event.total ? Math.round((100 * event.loaded) / event.total) : null);
          return;
        }
        if (event.type === HttpEventType.Response && event.body) {
          this.archivo = null;
          if (event.body.estado === 'APROBADO') {
            this.autoPagar(event.body);
          } else {
            this.mensaje.set('Comprobante de pago rechazado: revisa las diferencias y vuelve a intentarlo.');
          }
          this.cargar();
        }
      },
      error: (err) => this.fallo(err),
    });
  }

  pagar(): void {
    if (!this.puedePagar || !this.confirmarPago || this.ocupado()) return;
    if (!this.soporte) return;
    if (this.requiereCuentaSalida && !this.bancoSeleccionado) {
      this.error.set('Selecciona la cuenta bancaria de salida del pago.');
      return;
    }
    this.iniciar();
    const bancoId = this.soporte.bancoId ? null : this.bancoSeleccionado;
    this.api.pagar(this.egreso.id!, this.soporte.id, bancoId).pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: (e) => {
        this.estado.set(e);
        this.confirmarPago = false;
        this.mensaje.set('Pago registrado y conciliado: el proceso del egreso quedó completo.');
        this.actualizado.emit();
      },
      error: (err) => this.fallo(err),
    });
  }

  /** Comprobante aprobado: si hay cuenta de salida, el pago y la conciliación se registran de una vez. */
  private autoPagar(s: SoporteFinanciero): void {
    if (!this.ctx.tienePermiso('egresos.treasury.process_payment')) {
      this.mensaje.set('Comprobante de pago aprobado.');
      return;
    }
    const bancoId = s.bancoId ? null : this.bancoSeleccionado;
    if (!s.bancoId && !bancoId) {
      this.mensaje.set('Comprobante de pago aprobado: selecciona la cuenta de salida y registra el pago.');
      return;
    }
    this.mensaje.set('Comprobante de pago aprobado: registrando el pago y la conciliación…');
    this.api.pagar(this.egreso.id!, s.id, bancoId).pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: () => {
        this.mensaje.set('Pago registrado y conciliado: el proceso del egreso quedó completo.');
        this.cargar();
        this.actualizado.emit();
      },
      error: (err) => { this.fallo(err); this.cargar(); },
    });
  }

  conciliar(): void {
    const id = this.estado()?.movimientoId;
    if (!id || !this.fechaConciliacion || !this.referenciaConciliacion.trim() || !this.importeConciliacion || this.ocupado()) return;
    this.iniciar();
    this.api.conciliar(this.egreso.id!, id, this.fechaConciliacion, this.referenciaConciliacion.trim(), this.importeConciliacion).pipe(
      finalize(() => this.ocupado.set(false)),
    ).subscribe({
      next: (e) => {
        this.estado.set(e);
        this.mensaje.set('Conciliación registrada.');
        this.actualizado.emit();
      },
      error: (err) => this.fallo(err),
    });
  }

  abrirAnulacion(s: SoporteFinanciero): void { this.motivo = ''; this.anulandoId.set(s.id); }
  cancelarAnulacion(): void { this.anulandoId.set(null); this.motivo = ''; }
  anular(s: SoporteFinanciero): void {
    if (!this.motivo.trim() || this.ocupado()) return;
    this.iniciar();
    this.api.anular(this.egreso.id!, s.id, this.motivo.trim()).pipe(finalize(() => this.ocupado.set(false))).subscribe({
      next: () => {
        this.anulandoId.set(null);
        this.motivo = '';
        this.mensaje.set('Comprobante anulado. Sube el comprobante correcto.');
        this.cargar();
      },
      error: (err) => this.fallo(err),
    });
  }

  descargar(s: SoporteFinanciero): void {
    this.api.descargar(this.egreso.id!, s.id).subscribe({
      next: (r) => window.open(r.url, '_blank', 'noopener,noreferrer'),
      error: (err) => this.fallo(err),
    });
  }

  etiquetaComprobante(estadoComprobante: string): string {
    switch (estadoComprobante) {
      case 'APROBADO': return 'Aprobado';
      case 'RECHAZADO': return 'Rechazado';
      case 'ANULADO': return 'Anulado';
      default: return estadoComprobante;
    }
  }

  claseComprobante(estadoComprobante: string): string {
    switch (estadoComprobante) {
      case 'APROBADO': return 'ef-badge--ok';
      case 'RECHAZADO': return 'ef-badge--fail';
      case 'ANULADO': return 'ef-badge--muted';
      default: return '';
    }
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

  get valorEsperadoUI(): string { return this.formatear(this.soporte?.valorEsperado ?? this.neto); }
  get valorComprobanteUI(): string { return this.formatear(this.soporte?.valorExtraido); }
  get diferenciaValorUI(): string {
    const s = this.soporte;
    if (!s || s.valorExtraido === null || s.valorExtraido === undefined) return '';
    return this.formatear(Number(s.valorEsperado ?? this.neto) - Number(s.valorExtraido));
  }
  estadoCheck(campo: boolean | null | undefined): 'ok' | 'fail' | 'neutral' {
    if (campo === true) return 'ok';
    if (campo === false) return 'fail';
    return 'neutral';
  }

  private iniciar(): void { this.error.set(''); this.mensaje.set(''); this.ocupado.set(true); }
  private fallo(err: any): void { this.error.set(err?.error?.detail ?? err?.error?.message ?? 'No se pudo completar la operación.'); }
  private cargarCuentas(empresaId: number | null | undefined): void {
    if (empresaId == null || this.cuentas().length) return;
    this.api.cuentas(empresaId).subscribe({
      next: (cuentas) => {
        this.cuentas.set(cuentas);
        if (cuentas.length === 1 && !this.bancoSeleccionado) this.bancoSeleccionado = cuentas[0].id;
      },
      error: () => this.cuentas.set([]),
    });
  }
}
