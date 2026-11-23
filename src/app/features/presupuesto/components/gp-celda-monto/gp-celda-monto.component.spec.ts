import { TestBed } from '@angular/core/testing';
import { GpCeldaMontoComponent } from './gp-celda-monto.component';

describe('Celda presupuestal: edición real del importe', () => {
  it('muestra separadores de miles durante la escritura', () => {
    const {input,cambios} = preparar();
    input.value='1234567'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('1.234.567');
    expect(cambios).toEqual([]);
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([1234567]);
  });
  it('seguir tecleando tras el separador de miles no colapsa el número a decimales', () => {
    const {input,cambios} = preparar();
    input.value='1.234'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('1.234');
    // El siguiente dígito llega como "1.2345": es miles + dígito nuevo
    // (no un decimal con 4 cifras); antes se convertía en "1,23".
    input.value='1.2345'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('12.345');
    expect(input.selectionStart).toBe(6);
    input.value='12.3456'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('123.456');
    input.value='123.4567'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('1.234.567');
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([1234567]);
  });
  it('acepta decimales con coma sobre montos con separador de miles', () => {
    const {input,cambios} = preparar();
    input.value='1.234,'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('1.234,');
    // El cursor queda DESPUÉS de la coma para seguir con los decimales.
    expect(input.selectionStart).toBe(6);
    input.value='1.234,5'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('1.234,5');
    expect(input.selectionStart).toBe(7);
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([1234.5]);
  });
  it('el punto con 1-2 cifras sigue siendo decimal', () => {
    const {input,cambios} = preparar();
    input.value='12.5'; input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('12,5');
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([12.5]);
  });
  function preparar() {
    const fixture = TestBed.createComponent(GpCeldaMontoComponent);
    fixture.componentRef.setInput('valor', 100);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const cambios: (number | null)[] = [];
    fixture.componentInstance.commit.subscribe(v => cambios.push(v));
    input.dispatchEvent(new Event('focus'));
    return {fixture, input, cambios};
  }
  it('guarda al salir el importe escrito, en lugar del valor anterior', () => {
    const {input, cambios} = preparar();
    input.value = '2.500'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([2500]);
  });
  it('vaciar la celda elimina el valor anterior', () => {
    const {input, cambios} = preparar();
    input.value = ''; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([null]);
  });
  it('una recarga de otra celda no sobrescribe el importe que se está editando', () => {
    const {fixture, input, cambios} = preparar();
    input.value = '180000'; input.dispatchEvent(new Event('input'));
    fixture.componentRef.setInput('valor', 200);
    fixture.detectChanges();
    expect(input.value).toBe('180.000');
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([180000]);
  });
  it('Escape conserva el valor original', () => {
    const {fixture, input, cambios} = preparar();
    input.value = '2500'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    input.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.texto).toBe('100');
    expect(cambios).toEqual([]);
  });
  it('entrar y salir sin editar no guarda, incluso con moneda y centavos', () => {
    const {fixture, input, cambios} = preparar();
    input.dispatchEvent(new Event('blur'));
    fixture.componentRef.setInput('valor', 100.75);
    fixture.componentRef.setInput('moneda', true);
    fixture.detectChanges();
    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([]);
  });
  it('reescribir el mismo importe no guarda y repetir blur no duplica una escritura', () => {
    const {input, cambios} = preparar();
    input.value = '100'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([]);
    input.dispatchEvent(new Event('focus'));
    input.value = '200'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur')); input.dispatchEvent(new Event('blur'));
    expect(cambios).toEqual([200]);
  });
  it('Escape restaura la vista previa sin guardar', () => {
    const {fixture, input, cambios} = preparar();
    const previas: (number|null)[] = [];
    fixture.componentInstance.cambio.subscribe(v => previas.push(v));
    input.value = '2500'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    input.dispatchEvent(new Event('blur'));
    expect(previas).toEqual([2500, 100]);
    expect(cambios).toEqual([]);
  });
  it('Enter no envía formularios al confirmar un importe', () => {
    const {input} = preparar();
    const enter = new KeyboardEvent('keydown', {key:'Enter', cancelable:true});
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBeTrue();
  });
});
