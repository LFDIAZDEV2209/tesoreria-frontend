import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EstadoMovimiento } from '../../models/movimiento-bancario.model';

@Component({
  selector: 'app-estado-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './estado-badge.component.html',
  styleUrl: './estado-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadoBadgeComponent {
  @Input({ required: true }) estado!: EstadoMovimiento;

  get badgeClass(): string {
    const base = 'badge';
    const map: Record<EstadoMovimiento, string> = {
      Pagado: `${base} badge--completo`,
      Pendiente: `${base} badge--pendiente`,
      Conciliado: `${base} badge--conciliado`,
      Completo: `${base} badge--completo`,
      Error: `${base} badge--error`,
      Duplicado: `${base} badge--duplicado`,
    };

    return map[this.estado] ?? `${base} badge--default`;
  }
}
