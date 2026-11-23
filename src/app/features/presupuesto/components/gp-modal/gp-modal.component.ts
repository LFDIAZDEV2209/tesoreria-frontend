import { Component, Input, Output, EventEmitter, OnInit, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { gpBackdrop, gpPop } from '../../animations/gp-animations';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { GpOverlayDirective } from '../../directives/gp-overlay.directive';

/**
 * Modal reutilizable: entrada/salida animada, backdrop blur, Esc y clic fuera.
 *
 * Dos cabeceras posibles:
 *   · plana (por defecto) — blanca, para formularios rápidos.
 *   · hero ([hero]="true") — degradado navy → color con eyebrow dorado e
 *     icono en placa, la misma identidad de los encabezados de la plataforma.
 */
@Component({
  selector: 'app-gp-modal',
  standalone: true,
  hostDirectives: [GpOverlayDirective],
  imports: [CommonModule, GpIconComponent],
  animations: [gpBackdrop, gpPop],
  template: `
    <div class="gp-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
         @gpBackdrop (click)="cerrarFuera($event)">
      <div class="modal-glass w-full overflow-hidden flex flex-col max-h-[92dvh]"
           [class]="tamanoClase + (hero ? ' rounded-3xl' : ' rounded-2xl')"
           @gpPop role="dialog" aria-modal="true" [attr.aria-label]="titulo">

        <!-- ── Cabecera hero ── -->
        <div *ngIf="hero; else cabeceraPlana" class="gp-modal-hero" [class]="'gp-modal-hero--' + acento">
          <div class="gp-modal-hero__glow"></div>
          <div class="gp-modal-hero__icono">
            <app-gp-icon [name]="icono" [size]="22"></app-gp-icon>
          </div>
          <div class="min-w-0 flex-1">
            <p *ngIf="subtitulo" class="gp-modal-hero__eyebrow">{{ subtitulo }}</p>
            <h3 class="gp-modal-hero__titulo">{{ titulo }}</h3>
          </div>
          <button type="button" class="gp-modal-hero__cerrar"
                  (click)="cerrar.emit()" [disabled]="cargando" aria-label="Cerrar">
            <app-gp-icon name="x" [size]="17"></app-gp-icon>
          </button>
        </div>

        <!-- ── Cabecera plana ── -->
        <ng-template #cabeceraPlana>
          <div class="px-6 py-4 border-b border-bdr/10 flex items-center justify-between gap-3 flex-shrink-0">
            <div class="min-w-0">
              <h3 class="text-base font-bold text-t1 flex items-center gap-2">
                <span class="gp-dialog-title-mark"></span>
                {{ titulo }}
              </h3>
              <p *ngIf="subtitulo" class="text-xs text-t3 mt-0.5">{{ subtitulo }}</p>
            </div>
            <button type="button" class="gp-dialog-close w-8 h-8 rounded-xl text-t2 transition-all flex items-center justify-center flex-shrink-0"
                    (click)="cerrar.emit()" [disabled]="cargando" aria-label="Cerrar">
              <app-gp-icon name="x" [size]="17"></app-gp-icon>
            </button>
          </div>
        </ng-template>

        <div class="px-6 py-5 overflow-auto flex-shrink min-h-0 bg-surface">
          <ng-content></ng-content>
        </div>
        <div class="px-6 py-4 border-t border-bdr/10 flex justify-end gap-2 flex-shrink-0 bg-surface">
          <button type="button" class="btn-ghost text-sm" (click)="cerrar.emit()" [disabled]="cargando">
            Cancelar
          </button>
          <ng-content select="[pie]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .gp-dialog-backdrop {background:rgba(2,6,23,.7);backdrop-filter:blur(8px)}
    .gp-dialog-title-mark {width:6px;height:20px;flex-shrink:0;border-radius:99px;background:linear-gradient(to bottom,var(--acc-solid),#22D3EE)}
    .gp-dialog-close {background:var(--bg-elevated);border:1px solid rgb(var(--bdr-rgb)/.1)}
    .border-b,.border-t {border-color:rgb(var(--bdr-rgb)/.08)}
    /* ── Cabecera hero con la identidad de la plataforma ── */
    .gp-modal-hero {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px 20px;
      background: linear-gradient(120deg, #213053 0%, #1b2844 52%, #045C94 100%);
      overflow: hidden;
      flex-shrink: 0;
    }
    .gp-modal-hero--gold    { background: linear-gradient(120deg, #213053 0%, #6b4a06 55%, #b45309 100%); }
    .gp-modal-hero--green   { background: linear-gradient(120deg, #213053 0%, #064e3b 55%, #059669 100%); }
    .gp-modal-hero--violet  { background: linear-gradient(120deg, #213053 0%, #3b0764 55%, #7c3aed 100%); }
    .gp-modal-hero--rose    { background: linear-gradient(120deg, #213053 0%, #7f1d1d 55%, #e11d48 100%); }

    .gp-modal-hero__glow {
      position: absolute;
      inset: 0;
      background: radial-gradient(120% 220% at 92% -40%, rgba(255, 183, 27, 0.22) 0%, transparent 58%);
      pointer-events: none;
    }

    .gp-modal-hero__icono {
      position: relative;
      z-index: 1;
      width: 46px;
      height: 46px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #FFB71B;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(4px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 8px 18px rgba(0, 0, 0, 0.22);
    }

    .gp-modal-hero__eyebrow {
      position: relative;
      z-index: 1;
      margin: 0 0 2px;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #FFB71B;
    }

    .gp-modal-hero__titulo {
      position: relative;
      z-index: 1;
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.2;
      color: #ffffff;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
    }

    .gp-modal-hero__cerrar {
      position: relative;
      z-index: 1;
      width: 32px;
      height: 32px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.18s ease;
    }
    .gp-modal-hero__cerrar:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
      transform: translateY(-1px);
    }
    .gp-modal-hero__cerrar:disabled { opacity: 0.5; cursor: default; }
  `],
})
export class GpModalComponent implements OnInit {

  @Input() titulo = '';
  @Input() subtitulo = '';
  @Input() icono = 'layers';
  @Input() ancho: 'sm' | 'md' | 'lg' | 'formulario' | 'contrato' = 'md';
  @Input() cargando = false;
  @Input() cerrableFuera = true;
  /** Cabecera con degradado navy + icono dorado (modales de acción). */
  @Input() hero = false;
  /** Acento de la cabecera hero: azul (por defecto), dorado, verde, violeta o rojo. */
  @Input() acento: 'blue' | 'gold' | 'green' | 'violet' | 'rose' = 'blue';
  @Output() cerrar = new EventEmitter<void>();

  constructor(private host: ElementRef<HTMLElement>) {}

  get tamanoClase(): string {
    return { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', formulario: 'max-w-lg', contrato: 'max-w-xl' }[this.ancho];
  }

  ngOnInit(): void {
    this.host.nativeElement.hidden = false;
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (!this.cargando) this.cerrar.emit();
  }

  /**
   * Cierra solo cuando el clic cae en el PROPIO backdrop: los clics dentro
   * del diálogo burbujean hasta aquí (target ≠ currentTarget) y no deben
   * cerrar el modal — antes cualquier clic interno lo cerraba.
   */
  cerrarFuera(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    if (this.cerrableFuera && !this.cargando) this.cerrar.emit();
  }
}
