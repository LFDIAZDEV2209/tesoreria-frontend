import { Directive, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, booleanAttribute, inject } from '@angular/core';

@Directive({
  selector: '[appGpCargaVisible]',
  standalone: true
})
export class GpCargaVisibleDirective implements OnChanges, OnDestroy {
  private readonly elemento = inject(ElementRef<HTMLElement>);
  private readonly zona = inject(NgZone);
  private observador?: IntersectionObserver;
  private emitido = false;

  /** Un panel contraído no necesita datos aunque su cabecera sea visible. */
  @Input({ transform: booleanAttribute }) appGpCargaVisible = true;
  @Output() readonly gpAproximarse = new EventEmitter<void>();

  ngOnChanges(): void {
    this.observador?.disconnect();
    if (!this.appGpCargaVisible || this.emitido || typeof IntersectionObserver === 'undefined') return;
    this.zona.runOutsideAngular(() => {
      this.observador = new IntersectionObserver(entradas => {
        if (this.emitido || !entradas.some(entrada => entrada.isIntersecting)) return;
        this.emitido = true;
        this.observador?.disconnect();
        this.zona.run(() => this.gpAproximarse.emit());
      }, { rootMargin: '300px 0px', threshold: 0 });
      this.observador.observe(this.elemento.nativeElement);
    });
  }

  ngOnDestroy(): void { this.observador?.disconnect(); }

}
