import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlinearModulosDirective } from './alinear-modulos.directive';

@Component({
  standalone: true, imports: [AlinearModulosDirective],
  template: `<div appAlinearModulos style="display:grid;grid-template-columns:1fr 1fr;gap:16px;width:800px">
    <article class="gp-compare-panel">
      <section data-compare-slot="1"><div style="height:160px">Contrato izquierdo</div></section>
      <section data-compare-slot="2"><div style="height:40px">Nómina izquierda</div></section>
      <section data-compare-slot="3">Proveedores izquierdos</section>
    </article>
    <article class="gp-compare-panel">
      <section data-compare-slot="1"><div style="height:40px">Contrato derecho</div></section>
      <section data-compare-slot="2"><div style="height:220px">Nómina derecha</div></section>
      <section data-compare-slot="3">Proveedores derechos</section>
    </article>
  </div>`,
})
class ComparativaPrueba {}

describe('Alineación de módulos de la comparativa', () => {
  const rendered = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  it('alinea módulos de alturas distintas y reajusta el espacio cuando cambian los datos', async () => {
    const fixture = TestBed.createComponent(ComparativaPrueba);
    fixture.detectChanges();
    await rendered();
    const host: HTMLElement = fixture.nativeElement;
    const panels = host.querySelectorAll<HTMLElement>('article');
    const top = (side: number, slot: number) => panels[side].querySelector(`[data-compare-slot="${slot}"]`)!.getBoundingClientRect().top;
    expect(top(0, 2)).toBeCloseTo(top(1, 2), 0);
    expect(top(0, 3)).toBeCloseTo(top(1, 3), 0);
    const content = panels[0].querySelector<HTMLElement>('[data-compare-slot="1"] div')!;
    content.style.height = '60px';
    content.textContent = 'Contrato actualizado';
    await rendered();
    expect(top(0, 2)).toBeCloseTo(top(1, 2), 0);
    expect(top(0, 3)).toBeCloseTo(top(1, 3), 0);
    expect(parseFloat(panels[1].querySelector<HTMLElement>('[data-compare-slot="2"]')!.style.marginTop)).toBe(20);
    fixture.destroy();
  });

  it('reserva espacio cuando falta un módulo y elimina los espacios al apilar las columnas', async () => {
    const fixture = TestBed.createComponent(ComparativaPrueba);
    fixture.detectChanges();
    await rendered();
    const host: HTMLElement = fixture.nativeElement;
    const panels = host.querySelectorAll<HTMLElement>('article');
    panels[1].querySelector('[data-compare-slot="2"]')!.remove();
    await rendered();
    const last = Array.from(panels).map(panel => panel.querySelector<HTMLElement>('[data-compare-slot="3"]')!);
    expect(last[0].getBoundingClientRect().top).toBeCloseTo(last[1].getBoundingClientRect().top, 0);
    host.querySelector<HTMLElement>('[appAlinearModulos]')!.style.gridTemplateColumns = '1fr';
    window.dispatchEvent(new Event('resize'));
    await rendered();
    expect(last.every(element => !element.style.marginTop)).toBeTrue();
    fixture.destroy();
  });
});
