import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GpIconComponent } from '../gp-icon/gp-icon.component';

export type GpEstadoTono = 'info' | 'warn' | 'ok' | 'error';

/**
 * Estado vacío / informativo del Gestor: qué ocurre → por qué → qué puede
 * hacer el usuario. Se usa tanto para "sin datos" como para "mes no creado",
 * consultas en curso, etc. Las acciones se proyectan con el atributo
 * `acciones`:  <button acciones class="btn-primary">…</button>
 */
@Component({
  selector: 'app-gp-empty-state',
  standalone: true,
  imports: [CommonModule, GpIconComponent],
  template: `
    <div class="gp-estado" [class.gp-estado--cargando]="cargando" [attr.aria-busy]="cargando || null">
      <span class="gp-estado__icono" [ngClass]="'gp-estado__icono--' + tono" aria-hidden="true">
        @if (cargando) { <span class="gp-estado__spinner"></span> }
        @else { <app-gp-icon [name]="icono" [size]="30" [strokeWidth]="1.7" /> }
      </span>
      <h3 class="gp-estado__titulo">{{ titulo }}</h3>
      @if (descripcion) { <p class="gp-estado__desc">{{ descripcion }}</p> }
      @if (pista && !cargando) {
        <span class="gp-estado__pista"><app-gp-icon [name]="iconoPista" [size]="13" />{{ pista }}</span>
      }
      <div class="gp-estado__acciones"><ng-content select="[acciones]"></ng-content></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .gp-estado {
      display: flex; flex-direction: column; align-items: center; text-align: center;
      gap: 6px; width: 100%; max-width: 580px; margin: 0 auto; padding: 38px 32px 34px;
      border-radius: 16px; border-style: dashed; border-width: 1.5px;
      border-color: color-mix(in srgb, var(--acc-solid, #045c94) 24%, transparent);
      background:
        radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--acc-solid, #045c94) 7%, transparent) 0%, transparent 62%),
        var(--bg-surface, #fff);
      box-shadow: var(--sh-card, 0 3px 15px rgba(33, 48, 83, .05), 0 1px 3px rgba(0, 0, 0, .03));
      animation: gpEstadoIn .3s ease both;
    }
    .gp-estado__icono {
      position: relative; display: grid; place-items: center;
      width: 66px; height: 66px; border-radius: 20px;
    }
    .gp-estado__icono::after {
      content: ''; position: absolute; inset: -9px; border-radius: 27px;
      background: currentColor; opacity: .07; pointer-events: none;
    }
    .gp-estado__icono--info { color: var(--acc-solid, #045c94); background: color-mix(in srgb, var(--acc-solid, #045c94) 12%, transparent); }
    .gp-estado__icono--warn { color: var(--warn-solid, #b45309); background: color-mix(in srgb, var(--warn-solid, #b45309) 13%, transparent); }
    .gp-estado__icono--ok { color: var(--ok-solid, #059669); background: color-mix(in srgb, var(--ok-solid, #059669) 12%, transparent); }
    .gp-estado__icono--error { color: var(--err-solid, #dc2626); background: color-mix(in srgb, var(--err-solid, #dc2626) 12%, transparent); }
    .gp-estado__titulo { margin: 16px 0 0; font-size: 17px; font-weight: 700; letter-spacing: -.01em; color: var(--tx-1, #213053); }
    .gp-estado__desc { margin: 2px 0 0; max-width: 46ch; font-size: 13.5px; line-height: 1.65; color: var(--tx-2, #475569); }
    .gp-estado__pista {
      display: inline-flex; align-items: center; gap: 6px; margin-top: 12px;
      padding: 5px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
      color: var(--tx-2, #475569); background: var(--bg-elevated, #f2f5fa);
      border: 1px solid rgb(var(--bdr-rgb, 33 48 83) / .1);
    }
    .gp-estado__acciones { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px; margin-top: 20px; }
    .gp-estado__acciones:empty { display: none; }
    .gp-estado__spinner {
      width: 26px; height: 26px; border-radius: 50%;
      border: 3px solid color-mix(in srgb, currentColor 22%, transparent);
      border-top-color: currentColor; animation: gpEstadoSpin .8s linear infinite;
    }
    @keyframes gpEstadoSpin { to { transform: rotate(360deg); } }
    @keyframes gpEstadoIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media (max-width: 600px) { .gp-estado { padding: 28px 18px 26px; } }
    @media (prefers-reduced-motion: reduce) {
      .gp-estado, .gp-estado__spinner { animation: none; }
    }
  `],
})
export class GpEmptyStateComponent {
  @Input() icono = 'file';
  @Input() titulo = 'Sin datos todavía';
  @Input() descripcion = '';
  /** Color del ícono según el contexto: info (azul), warn (ámbar), ok, error. */
  @Input() tono: GpEstadoTono = 'info';
  /** Línea corta de contexto (empresa, período, etc.) que se muestra como chip. */
  @Input() pista = '';
  /** Ícono del chip de contexto: building (empresa), calendar (período), etc. */
  @Input() iconoPista = 'alert-circle';
  /** Reemplaza el ícono por un spinner: consultas en curso con copy informativo. */
  @Input() cargando = false;
}
