import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Reserva espacio entre módulos sin estirar sus tablas ni cambiar sus datos. */
@Directive({ selector: '[appAlinearModulos]', standalone: true })
export class AlinearModulosDirective implements AfterViewInit, OnDestroy {
  private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private mutation?: MutationObserver;
  private resize?: ResizeObserver;
  private frame = 0;
  private width = -1;
  private readonly margins = new Map<HTMLElement, { value: string; priority: string }>();
  private readonly schedule = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.align();
    });
  };

  ngAfterViewInit(): void {
    if (!this.browser) return;
    this.zone.runOutsideAngular(() => {
      this.mutation = new MutationObserver(this.schedule);
      this.mutation.observe(this.host, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'hidden'],
      });
      this.resize = new ResizeObserver(entries => {
        const width = entries[0].contentRect.width;
        if (width !== this.width) { this.width = width; this.schedule(); }
      });
      this.resize.observe(this.host);
      this.host.addEventListener('animationend', this.schedule);
      this.host.addEventListener('transitionend', this.schedule);
      window.addEventListener('resize', this.schedule);
      this.schedule();
    });
  }

  private restore(): void {
    for (const [element, margin] of this.margins) {
      if (margin.value) element.style.setProperty('margin-top', margin.value, margin.priority);
      else element.style.removeProperty('margin-top');
    }
    this.margins.clear();
  }

  private align(): void {
    this.restore();
    const panels = this.host.querySelectorAll<HTMLElement>('.gp-compare-panel');
    if (panels.length !== 2 || panels[0].getBoundingClientRect().left === panels[1].getBoundingClientRect().left) return;
    const slots = Array.from(this.host.querySelectorAll<HTMLElement>('[data-compare-slot]'));
    const keys = [...new Set(slots.map(element => element.dataset['compareSlot']!))]
      .sort((a, b) => Number(a) - Number(b));
    for (const key of keys) {
      const pair = Array.from(panels).map(panel => panel.querySelector<HTMLElement>(`[data-compare-slot="${key}"]`));
      const [left, right] = pair;
      if (!left || !right || !left.getClientRects().length || !right.getClientRects().length) continue;
      const difference = left.getBoundingClientRect().top - right.getBoundingClientRect().top;
      if (Math.abs(difference) < 0.5) continue;
      const earlier = difference > 0 ? right : left;
      this.margins.set(earlier, {
        value: earlier.style.getPropertyValue('margin-top'),
        priority: earlier.style.getPropertyPriority('margin-top'),
      });
      const margin = parseFloat(getComputedStyle(earlier).marginTop) || 0;
      earlier.style.setProperty('margin-top', `${margin + Math.abs(difference)}px`, 'important');
    }
  }

  ngOnDestroy(): void {
    if (!this.browser) return;
    this.mutation?.disconnect();
    this.resize?.disconnect();
    cancelAnimationFrame(this.frame);
    this.host.removeEventListener('animationend', this.schedule);
    this.host.removeEventListener('transitionend', this.schedule);
    window.removeEventListener('resize', this.schedule);
    this.restore();
  }
}
