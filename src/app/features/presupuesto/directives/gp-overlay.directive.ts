import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/** Sitúa los diálogos bajo el tema GP, fuera de las capas de animación de cada página. */
@Directive({selector: '[gpOverlay]', standalone: true})
export class GpOverlayDirective implements OnInit, OnDestroy {
  private readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  private moved = false;

  ngOnInit(): void {
    const shell = this.element.closest('.gp-app');
    if (shell && this.element.parentElement !== shell) {
      shell.appendChild(this.element);
      this.moved = true;
    }
  }

  ngOnDestroy(): void { if (this.moved) this.element.remove(); }
}
