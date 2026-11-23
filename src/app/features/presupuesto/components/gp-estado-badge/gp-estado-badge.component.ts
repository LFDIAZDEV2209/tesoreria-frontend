import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GpIconComponent } from '../gp-icon/gp-icon.component';

/** Badge de estado: icono + texto + color (nunca solo color). */
@Component({
  selector: 'app-gp-estado-badge',
  standalone: true,
  imports: [CommonModule, GpIconComponent],
  template: `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
          [ngClass]="clases">
      <app-gp-icon [name]="icono" [size]="12"></app-gp-icon>
      {{ texto }}
    </span>
  `,
})
export class GpEstadoBadgeComponent {

  @Input() estado = '';

  private static defs: Record<string, { texto: string; icono: string; clases: string }> = {
    aprobado: { texto: 'Aprobado', icono: 'check', clases: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    rechazado: { texto: 'Rechazado', icono: 'alert', clases: 'bg-rose-50 text-rose-700 border-rose-200' },
    pendiente: { texto: 'Pendiente de aprobación', icono: 'clock', clases: 'bg-amber-50 text-amber-700 border-amber-200' },
    'presupuesto pendiente': { texto: 'Pendiente de aprobación', icono: 'clock', clases: 'bg-amber-50 text-amber-700 border-amber-200' },
    proyectado: { texto: 'Proyectado', icono: 'calendar', clases: 'bg-accent-500/10 text-acc border-accent-500/20' },
    pagado: { texto: 'Pagado', icono: 'check', clases: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelado: { texto: 'Cancelado', icono: 'x', clases: 'bg-elevated text-t3 border-bdr/15' },
    eliminado: { texto: 'Eliminado', icono: 'trash', clases: 'bg-rose-50 text-rose-700 border-rose-200' },
    'sin-alerta': { texto: 'Sin alerta', icono: 'shield', clases: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    alerta: { texto: 'Revisar saldo o cruce', icono: 'alert', clases: 'bg-amber-50 text-amber-700 border-amber-200' },
  };

  get texto(): string {
    return GpEstadoBadgeComponent.defs[this.estado]?.texto ?? this.estado;
  }

  get icono(): string {
    return GpEstadoBadgeComponent.defs[this.estado]?.icono ?? 'clock';
  }

  get clases(): string {
    return GpEstadoBadgeComponent.defs[this.estado]?.clases ?? 'bg-elevated text-t2 border-bdr/15';
  }
}
