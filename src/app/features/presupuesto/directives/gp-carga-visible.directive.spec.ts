import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GpCargaVisibleDirective } from './gp-carga-visible.directive';

@Component({ standalone: true, imports: [GpCargaVisibleDirective], template: '<section [appGpCargaVisible]="abierto" (gpAproximarse)="cargas = cargas + 1"></section>' })
class PanelPrueba { abierto = true; cargas = 0; }

describe('Carga de secciones al aproximarse al viewport', () => {
  let callback: IntersectionObserverCallback;
  let observar: jasmine.Spy, desconectar: jasmine.Spy;
  beforeEach(() => {
    observar = jasmine.createSpy('observe'); desconectar = jasmine.createSpy('disconnect');
    spyOn(window, 'IntersectionObserver').and.callFake((function(fn: IntersectionObserverCallback, opciones: IntersectionObserverInit) {
      callback = fn;
      expect(opciones.rootMargin).toBe('300px 0px');
      return { observe: observar, disconnect: desconectar };
    }) as any);
  });
  afterEach(() => TestBed.resetTestingModule());

  it('consulta una sola vez al entrar y conserva datos al salir y volver a entrar', () => {
    const fixture = TestBed.createComponent(PanelPrueba); fixture.detectChanges();
    expect(fixture.componentInstance.cargas).toBe(0);
    callback([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(fixture.componentInstance.cargas).toBe(0);
    callback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    callback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(fixture.componentInstance.cargas).toBe(1);
    expect(desconectar).toHaveBeenCalled();
  });

  it('no observa un panel contraído; lo observa al abrirlo y libera el observador al destruirlo', () => {
    const fixture = TestBed.createComponent(PanelPrueba); fixture.componentInstance.abierto = false; fixture.detectChanges();
    expect(observar).not.toHaveBeenCalled();
    fixture.componentInstance.abierto = true; fixture.detectChanges();
    expect(observar).toHaveBeenCalledTimes(1);
    fixture.destroy(); expect(desconectar).toHaveBeenCalled();
  });
});
