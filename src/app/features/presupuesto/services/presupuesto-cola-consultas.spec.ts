import { EMPTY, firstValueFrom, Observable, of, Subject } from 'rxjs';
import { PresupuestoColaConsultas } from './presupuesto-cola-consultas';

describe('Cola de lecturas del presupuesto', () => {
  it('no inicia consultas sin suscriptor y limita a dos peticiones en orden FIFO', () => {
    const cola = new PresupuestoColaConsultas();
    const respuestas = Array.from({ length: 5 }, () => new Subject<number>());
    const iniciadas: number[] = [], recibidas: number[] = [];
    const consultas = respuestas.map((respuesta, i) => cola.ejecutar(() => { iniciadas.push(i); return respuesta; }));
    expect(iniciadas).toEqual([]);
    consultas.forEach(consulta => consulta.subscribe(valor => recibidas.push(valor)));
    expect(iniciadas).toEqual([0, 1]);
    respuestas[1].next(1); respuestas[1].complete();
    expect(iniciadas).toEqual([0, 1, 2]);
    respuestas[0].next(0); respuestas[0].complete();
    expect(iniciadas).toEqual([0, 1, 2, 3]);
    respuestas[2].next(2); respuestas[2].complete();
    respuestas[3].next(3); respuestas[3].complete();
    respuestas[4].next(4); respuestas[4].complete();
    expect(iniciadas).toEqual([0, 1, 2, 3, 4]);
    expect(recibidas).toEqual([1, 0, 2, 3, 4]);
  });

  it('retira una consulta pendiente cancelada sin ejecutarla ni bloquear la siguiente', () => {
    const cola = new PresupuestoColaConsultas();
    const primera = new Subject<void>(), segunda = new Subject<void>();
    const cancelada = jasmine.createSpy('consulta cancelada').and.returnValue(EMPTY);
    const siguiente = jasmine.createSpy('consulta siguiente').and.returnValue(EMPTY);
    cola.ejecutar(() => primera).subscribe(); cola.ejecutar(() => segunda).subscribe();
    const pendiente = cola.ejecutar(cancelada).subscribe(); cola.ejecutar(siguiente).subscribe();
    pendiente.unsubscribe(); primera.complete(); segunda.complete();
    expect(cancelada).not.toHaveBeenCalled(); expect(siguiente).toHaveBeenCalledTimes(1);
  });

  it('aborta la petición activa antes de conceder su cupo a la siguiente', () => {
    const cola = new PresupuestoColaConsultas();
    const segunda = new Subject<void>();
    const orden: string[] = [];
    const activa = cola.ejecutar(() => new Observable<void>(() => () => orden.push('abortada'))).subscribe();
    cola.ejecutar(() => segunda).subscribe();
    cola.ejecutar(() => { orden.push('siguiente'); return EMPTY; }).subscribe();
    activa.unsubscribe(); segunda.complete();
    expect(orden).toEqual(['abortada', 'siguiente']);
  });

  it('cancela todo el contexto sin iniciar trabajos pendientes al liberar los activos', () => {
    const cola = new PresupuestoColaConsultas();
    const primera = new Subject<void>(), segunda = new Subject<void>();
    const pendiente = jasmine.createSpy('otra empresa').and.returnValue(EMPTY);
    const finalizadas = jasmine.createSpy('lecturas finalizadas');
    cola.ejecutar(() => primera).subscribe({ complete: finalizadas });
    cola.ejecutar(() => segunda).subscribe({ complete: finalizadas });
    cola.ejecutar(pendiente).subscribe({ complete: finalizadas });
    cola.cancelarTodas();
    expect(pendiente).not.toHaveBeenCalled(); expect(finalizadas).toHaveBeenCalledTimes(3);
    expect(primera.observed).toBeFalse(); expect(segunda.observed).toBeFalse();
    const nueva = jasmine.createSpy('empresa nueva').and.returnValue(EMPTY);
    cola.ejecutar(nueva).subscribe(); expect(nueva).toHaveBeenCalledTimes(1);
  });

  it('libera el cupo al fallar el HTTP y también si falla la fábrica', () => {
    const cola = new PresupuestoColaConsultas();
    const primera = new Subject<void>(), segunda = new Subject<void>();
    const errores: string[] = [], iniciadas: string[] = [];
    cola.ejecutar(() => primera).subscribe({ error: error => errores.push(error.message) });
    cola.ejecutar(() => segunda).subscribe();
    cola.ejecutar(() => { throw new Error('fábrica'); }).subscribe({ error: error => errores.push(error.message) });
    cola.ejecutar(() => { iniciadas.push('posterior'); return EMPTY; }).subscribe();
    primera.error(new Error('HTTP')); segunda.complete();
    expect(errores).toEqual(['HTTP', 'fábrica']); expect(iniciadas).toEqual(['posterior']);
  });

  it('tolera respuestas síncronas y firstValueFrom sin dejar cupos ocupados', async () => {
    const cola = new PresupuestoColaConsultas();
    expect(await firstValueFrom(cola.ejecutar(() => of(7)))).toBe(7);
    const primera = new Subject<void>(), segunda = new Subject<void>();
    const iniciadas: number[] = [];
    cola.ejecutar(() => primera).subscribe(); cola.ejecutar(() => segunda).subscribe();
    // Las respuestas desde caché no deben provocar recursión por cada pendiente.
    for (let i = 0; i < 2000; i++) cola.ejecutar(() => { iniciadas.push(i); return of(i); }).subscribe();
    primera.complete(); segunda.complete();
    expect(iniciadas.length).toBe(2000); expect(iniciadas[1999]).toBe(1999);
  });
});
