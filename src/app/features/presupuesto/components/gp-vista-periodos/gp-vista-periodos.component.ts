import { Component, Input, inject } from '@angular/core';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

/**
 * Selector de vista del período: mensual, todos los meses y —sólo para el
 * módulo Anticipos— el repositorio de anticipos legalizados.
 *
 * Las señales se leen con acceso defensivo: varias pruebas montan el contexto
 * como doble plano y no declaran todas las vistas.
 */
@Component({
  selector: 'app-gp-vista-periodos', standalone: true,
  template: `<div class="flex flex-wrap gap-2" role="group" aria-label="Vista de los periodos">
    <button type="button" class="btn-ghost" [class.btn-primary]="vistaMensualActiva" [attr.aria-pressed]="vistaMensualActiva" (click)="irMensual()">Vista mensual</button>
    <button type="button" class="btn-ghost" [class.btn-primary]="vistaCompletaActiva" [attr.aria-pressed]="vistaCompletaActiva" (click)="irTodosLosMeses()">Todos los meses</button>
    @if (mostrarLegalizados) {
      <button type="button" class="btn-ghost" [class.btn-primary]="vistaLegalizadosActiva" [attr.aria-pressed]="vistaLegalizadosActiva"
              (click)="irLegalizados()">Anticipos legalizados</button>
    }
  </div>`,
})
export class GpVistaPeriodosComponent {
  readonly ctx = inject(PresupuestoContextService);
  /** true en el módulo Anticipos: habilita el repositorio de legalizaciones. */
  @Input() mostrarLegalizados = false;

  get vistaMensualActiva(): boolean { return !this.ctx.vistaCompleta() && !this.legalizadosActiva(); }
  get vistaCompletaActiva(): boolean { return this.ctx.vistaCompleta() && !this.legalizadosActiva(); }
  get vistaLegalizadosActiva(): boolean { return this.legalizadosActiva(); }

  irMensual(): void { this.ctx.vistaCompleta.set(false); this.legalizadosSenal()?.set(false); }
  irTodosLosMeses(): void { this.ctx.vistaCompleta.set(true); this.legalizadosSenal()?.set(false); }
  irLegalizados(): void { this.legalizadosSenal()?.set(true); }

  /** Señal real de la vista de legalizados; null en los dobles de prueba. */
  private legalizadosSenal() {
    const senal = (this.ctx as Partial<PresupuestoContextService>).vistaLegalizados;
    return senal && typeof senal.set === 'function' ? senal : null;
  }

  private legalizadosActiva(): boolean {
    const senal = this.legalizadosSenal();
    return senal ? senal() : false;
  }
}
