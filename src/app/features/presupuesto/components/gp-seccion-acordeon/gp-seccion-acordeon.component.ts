import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { gpPop, gpUnfold } from '../../animations/gp-animations';

/**
 * Tarjeta acordeón reutilizable para secciones de tablas.
 * - `abierta` + `(toggle)` = estado controlado por el padre.
 * - Contenido (tabla) proyectado vía <ng-content>.
 * - `modo` cambia el estilo: 'clasica' (listado) | 'interactiva' (tarjeta).
 */
@Component({
  selector: 'app-gp-seccion-acordeon',
  standalone: true,
  imports: [CommonModule, GpIconComponent],
  animations: [gpPop, gpUnfold],
  templateUrl: './gp-seccion-acordeon.component.html',
  styleUrls: ['./gp-seccion-acordeon.component.scss'],
  host: {
    '[class.gp-host--interactiva]': "modo === 'interactiva'",
    '[class.gp-host--abierta]': 'abierta',
  },
})
export class GpSeccionAcordeonComponent {
  @Input() titulo = '';
  @Input() subtitulo = '';
  @Input() icono = 'file';
  @Input() color = '#045C94';
  @Input() contador = '';
  @Input() abierta = false;
  @Input() modo: 'clasica' | 'interactiva' = 'clasica';
  @Output() toggle = new EventEmitter<void>();

  get iconoGradiente(): string {
    return `linear-gradient(135deg, ${this.color}, ${this.color}C8)`;
  }
}
