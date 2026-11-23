import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GpIconComponent } from '../gp-icon/gp-icon.component';

/**
 * Error state amigable del Gestor: título claro, explicación entendible,
 * detalle opcional y acciones (reintentar + acciones extra proyectadas con
 * el atributo `acciones`). Nunca muestra códigos ni textos técnicos solos.
 */
@Component({
  selector: 'app-gp-error-state',
  standalone: true,
  imports: [CommonModule, GpIconComponent],
  template: `
    <div class="gp-error" role="alert">
      <span class="gp-error__icono" aria-hidden="true"><app-gp-icon [name]="icono" [size]="22" /></span>
      <div class="gp-error__cuerpo">
        <h3 class="gp-error__titulo">{{ titulo }}</h3>
        <p class="gp-error__mensaje">{{ mensaje }}</p>
        @if (detalle) { <p class="gp-error__detalle">{{ detalle }}</p> }
        <div class="gp-error__acciones">
          @if (mostrarReintentar) {
            <button type="button" class="gp-error__reintentar" [disabled]="reintentando" (click)="reintentar.emit()">
              <app-gp-icon [name]="reintentando ? 'clock' : 'refresh'" [size]="14" />
              {{ reintentando ? 'Reintentando…' : textoReintentar }}
            </button>
          }
          <ng-content select="[acciones]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .gp-error {
      display: flex; align-items: flex-start; gap: 14px;
      width: 100%; max-width: 760px; margin: 0 auto; padding: 18px 20px;
      border-radius: 16px;
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--err-solid, #dc2626) 7%, var(--bg-surface, #fff)),
        color-mix(in srgb, var(--err-solid, #dc2626) 3%, var(--bg-surface, #fff)));
      border: 1px solid color-mix(in srgb, var(--err-solid, #dc2626) 24%, transparent);
      animation: gpErrorIn .25s ease both;
    }
    .gp-error__icono {
      display: grid; place-items: center; flex-shrink: 0;
      width: 42px; height: 42px; border-radius: 13px;
      color: var(--err-solid, #dc2626);
      background: color-mix(in srgb, var(--err-solid, #dc2626) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--err-solid, #dc2626) 20%, transparent);
    }
    .gp-error__cuerpo { flex: 1; min-width: 0; }
    .gp-error__titulo { margin: 0; font-size: 14.5px; font-weight: 700; color: var(--tx-1, #213053); }
    .gp-error__mensaje { margin: 4px 0 0; font-size: 13px; line-height: 1.6; color: var(--tx-2, #475569); overflow-wrap: anywhere; }
    .gp-error__detalle { margin: 7px 0 0; font-size: 12px; line-height: 1.55; color: var(--tx-3, #64748b); }
    .gp-error__acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 13px; }
    .gp-error__acciones:empty { display: none; }
    .gp-error__reintentar {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 15px; border-radius: 10px; cursor: pointer;
      font-family: inherit; font-size: 12.5px; font-weight: 600;
      color: var(--err-solid, #dc2626);
      background: color-mix(in srgb, var(--err-solid, #dc2626) 8%, var(--bg-surface, #fff));
      border: 1px solid color-mix(in srgb, var(--err-solid, #dc2626) 28%, transparent);
      transition: background .15s ease, box-shadow .15s ease, transform .15s ease;
    }
    .gp-error__reintentar:hover:not(:disabled) {
      background: color-mix(in srgb, var(--err-solid, #dc2626) 15%, var(--bg-surface, #fff));
      transform: translateY(-1px);
    }
    .gp-error__reintentar:disabled { opacity: .6; cursor: default; }
    @keyframes gpErrorIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @media (max-width: 600px) { .gp-error { padding: 14px; gap: 11px; } }
    @media (prefers-reduced-motion: reduce) { .gp-error, .gp-error__reintentar { transition: none; animation: none; } }
  `],
})
export class GpErrorStateComponent {
  @Input() titulo = 'No pudimos cargar la información';
  @Input() mensaje = 'Ocurrió un problema al consultar los datos. Intenta de nuevo.';
  /** Línea extra: qué puede hacer el usuario si el problema continúa. */
  @Input() detalle = '';
  @Input() icono = 'alert';
  @Input() textoReintentar = 'Reintentar';
  @Input() mostrarReintentar = true;
  @Input() reintentando = false;
  @Output() reintentar = new EventEmitter<void>();
}
