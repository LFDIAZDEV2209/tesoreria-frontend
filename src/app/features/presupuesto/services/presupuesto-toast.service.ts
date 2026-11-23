import { Injectable, signal } from '@angular/core';

export type PresupuestoToastTipo = 'success' | 'error';

export interface PresupuestoToastEstado {
  mensaje: string;
  visible: boolean;
  tipo: PresupuestoToastTipo;
}

/**
 * Toast global del Gestor Presupuestal — igual que el sonner del gestor
 * original: sobrevive a la navegación entre módulos (p. ej. al entrar a una
 * empresa desde "Todas las Empresas" el aviso sigue visible en Pagos
 * Proyectados). El host se renderiza una sola vez en AppComponent.
 */
@Injectable({ providedIn: 'root' })
export class PresupuestoToastService {

  toast = signal<PresupuestoToastEstado>({ mensaje: '', visible: false, tipo: 'success' });

  private timer: ReturnType<typeof setTimeout> | null = null;

  mostrar(mensaje: string, tipo: PresupuestoToastTipo = 'success', duracionMs = 3000): void {
    if (this.timer) clearTimeout(this.timer);
    this.toast.set({ mensaje, visible: true, tipo });
    this.timer = setTimeout(
      () => this.toast.set({ mensaje: '', visible: false, tipo: 'success' }),
      duracionMs,
    );
  }

  error(mensaje: string, duracionMs = 4000): void {
    this.mostrar(mensaje, 'error', duracionMs);
  }
}
