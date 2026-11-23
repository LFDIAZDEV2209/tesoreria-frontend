import { Observable, Subscriber, Subscription } from 'rxjs';

interface ConsultaPendiente {
  activa: boolean;
  terminada: boolean;
  suscripcion: Subscription;
  iniciar: () => void;
  cancelar: () => void;
}

/** Cola de lecturas de una página. No guarda respuestas ni decide qué consultar. */
export class PresupuestoColaConsultas {
  private readonly pendientes: ConsultaPendiente[] = [];
  private readonly trabajos = new Set<ConsultaPendiente>();
  private activas = 0;
  private despachando = false;

  constructor(private readonly concurrencia = 2) {
    if (!Number.isInteger(concurrencia) || concurrencia < 1) throw new Error('La concurrencia debe ser un entero positivo.');
  }

  /** La fábrica sólo se ejecuta cuando hay cupo y sigue existiendo un lector. */
  ejecutar<T>(consulta: () => Observable<T>): Observable<T> {
    return new Observable<T>(lector => {
      const trabajo: ConsultaPendiente = {
        activa: false, terminada: false, suscripcion: new Subscription(), iniciar: () => {}, cancelar: () => lector.complete(),
      };
      const terminar = () => {
        if (trabajo.terminada) return;
        trabajo.terminada = true;
        this.trabajos.delete(trabajo);
        if (trabajo.activa) this.activas--;
        else {
          const indice = this.pendientes.indexOf(trabajo);
          if (indice >= 0) this.pendientes.splice(indice, 1);
        }
        // Aborta el HTTP activo antes de conceder su cupo a otra lectura.
        trabajo.suscripcion.unsubscribe();
        this.despachar();
      };
      trabajo.iniciar = () => {
        trabajo.activa = true;
        this.activas++;
        const respuesta = new Subscriber<T>({
          next: valor => lector.next(valor),
          error: (error: unknown) => { lector.error(error); terminar(); },
          complete: () => { lector.complete(); terminar(); },
        });
        trabajo.suscripcion.add(respuesta);
        try { consulta().subscribe(respuesta); }
        catch (error) { respuesta.error(error); }
      };
      // También cubre firstValueFrom: puede cancelar al recibir el primer valor,
      // incluso si la fábrica produce una respuesta síncrona desde una caché.
      this.trabajos.add(trabajo);
      lector.add(terminar);
      this.pendientes.push(trabajo);
      this.despachar();
    });
  }

  /** Cambiar de empresa cancela el lote completo antes de liberar otro HTTP pendiente. */
  cancelarTodas(): void {
    const despachando = this.despachando;
    this.despachando = true;
    try { for (const trabajo of [...this.trabajos]) trabajo.cancelar(); }
    finally { this.despachando = despachando; }
    this.despachar();
  }

  private despachar(): void {
    if (this.despachando) return;
    this.despachando = true;
    try {
      while (this.activas < this.concurrencia && this.pendientes.length) {
        const trabajo = this.pendientes.shift()!;
        if (!trabajo.terminada) trabajo.iniciar();
      }
    } finally { this.despachando = false; }
  }
}
