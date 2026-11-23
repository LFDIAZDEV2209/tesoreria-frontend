import { ComponentRef, Directive, DoCheck, ElementRef, HostListener, Injector, NgZone, OnDestroy, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Subscription } from 'rxjs';
import { SelectBuscablePanelComponent } from './select-buscable-panel.component';

/** Conserva el select y su ControlValueAccessor: también admite ngValue y formularios reactivos. */
@Directive({ selector: 'select', standalone: true })
export class SelectBuscableDirective implements DoCheck, OnDestroy {
  private readonly element = inject<ElementRef<HTMLSelectElement>>(ElementRef);
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private ref?: OverlayRef;
  private panel?: ComponentRef<SelectBuscablePanelComponent>;
  private observer?: MutationObserver;
  private subscriptions = new Subscription();
  private ultimaVista = '';
  private get select() { return this.element.nativeElement; }
  @HostListener('mousedown', ['$event']) evitarNativo(event: MouseEvent): void { if (event.button === 0 && !this.select.disabled) event.preventDefault(); }
  @HostListener('click', ['$event']) click(event: MouseEvent): void {
    if (this.select.disabled) return;
    event.preventDefault(); event.stopPropagation(); this.ref ? this.cerrar(true) : this.abrir();
  }
  @HostListener('keydown', ['$event']) teclado(event: KeyboardEvent): void {
    if (this.select.disabled || event.ctrlKey || event.metaKey || event.key === 'Tab') return;
    const texto = event.key.length === 1 && event.key !== ' ' ? event.key : '';
    if (texto || ['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); this.abrir(texto); }
  }
  private abrir(texto = ''): void {
    if (this.ref || this.select.disabled) return;
    const posicion = this.overlay.position().flexibleConnectedTo(this.element)
      .withPositions([{originX:'start',originY:'bottom',overlayX:'start',overlayY:'top',offsetY:4},
        {originX:'start',originY:'top',overlayX:'start',overlayY:'bottom',offsetY:-4}])
      .withPush(true).withViewportMargin(8).withFlexibleDimensions(true);
    this.ref = this.overlay.create({positionStrategy:posicion,hasBackdrop:true,backdropClass:'cdk-overlay-transparent-backdrop',
      width:Math.min(Math.max(this.select.getBoundingClientRect().width,260),window.innerWidth-16),
      maxHeight:'90vh',scrollStrategy:this.overlay.scrollStrategies.reposition()});
    this.panel = this.ref.attach(new ComponentPortal(SelectBuscablePanelComponent, null, this.injector));
    this.panel.instance.nombre = this.select.getAttribute('aria-label') || Array.from(this.select.labels ?? []).map(l => {
      const copia = l.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('select').forEach(s => s.remove());
      return copia.textContent?.trim();
    }).join(' ') || this.select.name || 'opciones';
    this.panel.instance.multiple = this.select.multiple;
    this.select.setAttribute('aria-expanded','true');
    this.select.setAttribute('aria-controls',this.panel.instance.listaId);
    this.sincronizar();
    if (texto) this.panel.instance.buscar(texto);
    else this.panel.instance.activo.set(Math.max(0,this.panel.instance.visibles().findIndex(o => o.seleccionada && !o.deshabilitada)));
    this.subscriptions = new Subscription();
    this.subscriptions.add(this.panel.instance.elegir.subscribe(indice => this.elegir(indice)));
    this.subscriptions.add(this.panel.instance.cerrar.subscribe(foco => this.cerrar(foco)));
    this.subscriptions.add(this.ref.backdropClick().subscribe(() => this.cerrar(false)));
    this.observer = new MutationObserver(() => this.zone.run(() => this.sincronizar()));
    this.observer.observe(this.select,{childList:true,subtree:true,characterData:true,attributes:true});
    this.panel.changeDetectorRef.detectChanges();
  }
  ngDoCheck(): void { if (this.panel) this.sincronizar(); }
  private sincronizar(): void {
    if (!this.panel) return;
    if (this.select.disabled || !this.select.isConnected) { this.cerrar(false); return; }
    const opciones = Array.from(this.select.options).map((o,indice) => ({indice,texto:o.label,
      grupo:o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : '',
      deshabilitada:o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled),seleccionada:o.selected}));
    const vista = JSON.stringify(opciones);
    if (vista !== this.ultimaVista) { this.ultimaVista = vista; this.panel.instance.opciones.set(opciones); }
  }
  private elegir(indice: number): void {
    const opcion = this.select.options[indice];
    if (!opcion || this.select.disabled || opcion.disabled || (opcion.parentElement instanceof HTMLOptGroupElement && opcion.parentElement.disabled)) return;
    if (this.select.multiple) opcion.selected = !opcion.selected; else this.select.selectedIndex = indice;
    this.select.dispatchEvent(new Event('input',{bubbles:true}));
    this.select.dispatchEvent(new Event('change',{bubbles:true}));
    if (this.select.multiple) this.sincronizar(); else this.cerrar(true);
  }
  private cerrar(foco: boolean, tocar = true): void {
    if (!this.ref) return;
    this.observer?.disconnect(); this.observer = undefined; this.subscriptions.unsubscribe();
    const ref = this.ref; this.ref = undefined; this.panel = undefined; this.ultimaVista = '';
    this.select.removeAttribute('aria-controls'); this.select.setAttribute('aria-expanded','false');
    ref?.dispose();
    if (foco && this.select.isConnected) this.select.focus();
    if (tocar) this.select.dispatchEvent(new Event('blur'));
  }
  ngOnDestroy(): void { this.cerrar(false, false); }
}
