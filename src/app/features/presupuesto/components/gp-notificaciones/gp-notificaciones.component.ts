import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { catchError, of, Subject, switchMap, merge, timer } from 'rxjs';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { Notificacion } from '../../models/presupuesto.model';

/**
 * Campana de notificaciones del Gestor: avisos de aprobaciones/rechazos de la
 * empresa activa. Panel con contador de no leídas, acciones rápidas (actualizar
 * y marcar todas) y estado vacío/carga/error claros.
 */
@Component({
  selector: 'app-gp-notificaciones', standalone: true, imports: [CommonModule, GpIconComponent],
  template: `
    <div *ngIf="ctx.tienePermiso('admin.notificaciones') && ctx.empresaId()" class="gp-noti">
      <button type="button" class="gp-noti__trigger" [class.gp-noti__trigger--activo]="abierto()"
        [attr.aria-expanded]="abierto()" aria-haspopup="dialog" [attr.aria-label]="'Notificaciones' + (pendientes() ? ': ' + pendientes() + ' sin leer' : '')"
        (click)="abierto.set(!abierto())">
        <app-gp-icon name="bell" [size]="16" />
        <span class="gp-noti__trigger-txt">Notificaciones</span>
        @if (pendientes() > 0) { <span class="gp-noti__badge" aria-hidden="true">{{ pendientes() > 99 ? '99+' : pendientes() }}</span> }
      </button>

      @if (abierto()) {
        <section class="gp-noti__panel" role="dialog" aria-label="Avisos de la empresa" (keydown.escape)="abierto.set(false)">
          <header class="gp-noti__head">
            <div class="gp-noti__head-txt">
              <strong>{{ ctx.nombreEmpresa() || 'Notificaciones' }}</strong>
              <span>{{ pendientes() ? pendientes() + ' sin leer' : 'Todo al día' }}</span>
            </div>
            <div class="gp-noti__head-acciones">
              <button type="button" class="gp-noti__icono" title="Actualizar" aria-label="Actualizar notificaciones"
                [disabled]="cargando()" (click)="refrescar.next()"><app-gp-icon [name]="cargando() ? 'clock' : 'refresh'" [size]="15" /></button>
              <button type="button" class="gp-noti__icono" title="Marcar todas como leídas" aria-label="Marcar todas como leídas"
                [disabled]="ocupado() || !pendientes()" (click)="leerTodas()"><app-gp-icon name="check-check" [size]="15" /></button>
              <button type="button" class="gp-noti__icono" title="Cerrar" aria-label="Cerrar notificaciones"
                (click)="abierto.set(false)"><app-gp-icon name="x" [size]="15" /></button>
            </div>
          </header>

          @if (error()) {
            <p class="gp-noti__error" role="alert">{{ error() }}
              <button type="button" (click)="refrescar.next()">Reintentar</button></p>
          }

          @if (cargando() && !avisos().length) {
            <ul class="gp-noti__lista" aria-hidden="true">
              @for (fila of [1,2,3]; track fila) { <li class="gp-noti__skeleton"><span></span><span></span></li> }
            </ul>
          } @else if (!avisos().length && !error()) {
            <div class="gp-noti__vacio">
              <span class="gp-noti__vacio-icono"><app-gp-icon name="inbox" [size]="22" /></span>
              <strong>No tienes notificaciones</strong>
              <small>Aquí verás las aprobaciones y avisos de {{ ctx.nombreEmpresa() }}.</small>
            </div>
          } @else if (avisos().length) {
            <ul class="gp-noti__lista">
              @for (aviso of avisos(); track aviso.id) {
                <li class="gp-noti__item" [class.gp-noti__item--nueva]="!aviso.leida">
                  <span class="gp-noti__punto" aria-hidden="true"></span>
                  <div class="gp-noti__cuerpo">
                    <p class="gp-noti__mensaje">{{ aviso.mensaje }}</p>
                    <div class="gp-noti__meta">
                      @if (tiempo(aviso.createdAt)) { <span>{{ tiempo(aviso.createdAt) }}</span> }
                      @if (aviso.creadoPor) { <span class="gp-noti__sep" aria-hidden="true">·</span><span>{{ aviso.creadoPor }}</span> }
                    </div>
                  </div>
                  @if (!aviso.leida) {
                    <button type="button" class="gp-noti__leer" title="Marcar como leída" aria-label="Marcar como leída"
                      [disabled]="ocupado()" (click)="leer(aviso)"><app-gp-icon name="check" [size]="14" /></button>
                  }
                </li>
              }
            </ul>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .gp-noti { position: relative; }
    .gp-noti__trigger {
      display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
      padding: 9px 13px; border-radius: 12px; font-family: inherit;
      font-size: 12px; font-weight: 600; color: var(--tx-1, #213053);
      background: var(--bg-surface, #fff);
      border: 1px solid rgb(var(--bdr-rgb, 33 48 83) / .16);
      transition: border-color .15s ease, box-shadow .15s ease, background .15s ease, color .15s ease;
    }
    .gp-noti__trigger:hover {
      border-color: color-mix(in srgb, var(--acc-solid, #045c94) 38%, transparent);
      box-shadow: 0 2px 10px rgba(33, 48, 83, .08);
    }
    .gp-noti__trigger--activo {
      color: var(--acc-solid, #045c94);
      border-color: color-mix(in srgb, var(--acc-solid, #045c94) 55%, transparent);
      background: color-mix(in srgb, var(--acc-solid, #045c94) 6%, #fff);
    }
    .gp-noti__badge {
      display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px;
      border-radius: 999px; font-size: 10.5px; font-weight: 800; color: #213053;
      background: #ffb71b; box-shadow: 0 2px 6px rgba(255, 183, 27, .45);
    }
    .gp-noti__panel {
      position: absolute; right: 0; top: calc(100% + 9px); z-index: 70;
      width: min(24rem, 90vw); max-height: min(70vh, 34rem);
      display: flex; flex-direction: column; overflow: hidden;
      color: var(--tx-1, #213053); background: var(--bg-surface, #fff);
      border: 1px solid rgb(var(--bdr-rgb, 33 48 83) / .12); border-radius: 18px;
      box-shadow: 0 24px 60px -14px rgba(33, 48, 83, .30), 0 4px 14px rgba(33, 48, 83, .08);
      animation: gpNotiIn .18s ease-out both;
    }
    .gp-noti__head {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 13px 14px 12px; border-bottom: 1px solid rgb(var(--bdr-rgb, 33 48 83) / .08);
      background: linear-gradient(180deg, color-mix(in srgb, var(--acc-solid, #045c94) 4%, #fff), #fff);
    }
    .gp-noti__head-txt { min-width: 0; display: flex; flex-direction: column; }
    .gp-noti__head-txt strong { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gp-noti__head-txt span { font-size: 11px; color: var(--tx-3, #64748b); margin-top: 1px; }
    .gp-noti__head-acciones { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .gp-noti__icono {
      display: grid; place-items: center; width: 30px; height: 30px; padding: 0; cursor: pointer;
      border-radius: 9px; color: var(--tx-2, #475569); background: transparent; border: 1px solid transparent;
      transition: background .12s ease, color .12s ease, border-color .12s ease;
    }
    .gp-noti__icono:hover:not(:disabled) { color: var(--acc-solid, #045c94); background: color-mix(in srgb, var(--acc-solid, #045c94) 8%, transparent); }
    .gp-noti__icono:disabled { opacity: .45; cursor: default; }
    .gp-noti__error {
      margin: 10px 14px 0; padding: 9px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5;
      color: #b91c1c; background: rgba(220, 38, 38, .06); border: 1px solid rgba(220, 38, 38, .16);
    }
    .gp-noti__error button { margin-left: 6px; color: #b91c1c; background: none; border: 0; padding: 0; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
    .gp-noti__lista { list-style: none; margin: 0; padding: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgb(var(--bdr-rgb, 33 48 83) / .25) transparent; }
    .gp-noti__lista::-webkit-scrollbar { width: 6px; }
    .gp-noti__lista::-webkit-scrollbar-thumb { background: rgb(var(--bdr-rgb, 33 48 83) / .22); border-radius: 99px; }
    .gp-noti__item { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; transition: background .12s ease; }
    .gp-noti__item + .gp-noti__item { border-top: 1px solid rgb(var(--bdr-rgb, 33 48 83) / .07); }
    .gp-noti__item:hover { background: color-mix(in srgb, var(--acc-solid, #045c94) 4%, transparent); }
    .gp-noti__item--nueva { background: color-mix(in srgb, var(--acc-solid, #045c94) 4.5%, transparent); }
    .gp-noti__punto { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; background: transparent; }
    .gp-noti__item--nueva .gp-noti__punto { background: var(--acc-solid, #045c94); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc-solid, #045c94) 14%, transparent); }
    .gp-noti__cuerpo { flex: 1; min-width: 0; }
    .gp-noti__mensaje { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--tx-1, #213053); overflow-wrap: anywhere; }
    .gp-noti__item--nueva .gp-noti__mensaje { font-weight: 600; }
    .gp-noti__meta { display: flex; align-items: center; gap: 5px; margin-top: 4px; font-size: 11px; color: var(--tx-3, #64748b); }
    .gp-noti__sep { opacity: .6; }
    .gp-noti__leer {
      display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; cursor: pointer;
      border-radius: 9px; color: var(--acc-solid, #045c94); background: color-mix(in srgb, var(--acc-solid, #045c94) 7%, transparent);
      border: 1px solid color-mix(in srgb, var(--acc-solid, #045c94) 18%, transparent);
      transition: background .12s ease, transform .12s ease;
    }
    .gp-noti__leer:hover:not(:disabled) { background: color-mix(in srgb, var(--acc-solid, #045c94) 14%, transparent); transform: translateY(-1px); }
    .gp-noti__leer:disabled { opacity: .5; cursor: default; }
    .gp-noti__vacio { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; padding: 34px 22px; }
    .gp-noti__vacio-icono { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; margin-bottom: 6px; color: var(--acc-solid, #045c94); background: color-mix(in srgb, var(--acc-solid, #045c94) 9%, transparent); }
    .gp-noti__vacio strong { font-size: 13.5px; }
    .gp-noti__vacio small { font-size: 11.5px; line-height: 1.5; color: var(--tx-3, #64748b); max-width: 30ch; }
    .gp-noti__skeleton { display: flex; flex-direction: column; gap: 7px; padding: 13px 14px; }
    .gp-noti__skeleton + .gp-noti__skeleton { border-top: 1px solid rgb(var(--bdr-rgb, 33 48 83) / .07); }
    .gp-noti__skeleton span { height: 10px; border-radius: 99px; background: linear-gradient(90deg, rgb(var(--bdr-rgb, 33 48 83) / .08) 25%, rgb(var(--bdr-rgb, 33 48 83) / .16) 50%, rgb(var(--bdr-rgb, 33 48 83) / .08) 75%); background-size: 200% 100%; animation: gpNotiShimmer 1.6s ease-in-out infinite; }
    .gp-noti__skeleton span:first-child { width: 82%; }
    .gp-noti__skeleton span:last-child { width: 45%; }
    @keyframes gpNotiIn { from { opacity: 0; transform: translateY(-6px) scale(.985); } to { opacity: 1; transform: none; } }
    @keyframes gpNotiShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media (max-width: 600px) {
      .gp-noti__trigger-txt { display: none; }
      .gp-noti__trigger { padding: 9px 11px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .gp-noti__panel, .gp-noti__skeleton span { animation: none; }
      .gp-noti__trigger, .gp-noti__leer, .gp-noti__item, .gp-noti__icono { transition: none; }
    }
  `],
})
export class GpNotificacionesComponent {
  readonly ctx = inject(PresupuestoContextService);
  private readonly api = inject(PresupuestoService);
  readonly abierto = signal(false);
  readonly avisos = signal<Notificacion[]>([]);
  readonly error = signal('');
  readonly ocupado = signal(false);
  readonly cargando = signal(false);
  readonly pendientes = computed(() => this.avisos().filter(n => !n.leida).length);
  readonly refrescar = new Subject<void>();
  constructor() {
    effect(onCleanup => {
      const empresaId = this.ctx.empresaId();
      const permitido = this.ctx.tienePermiso('admin.notificaciones');
      this.avisos.set([]);
      this.abierto.set(false);
      this.error.set('');
      this.cargando.set(!!empresaId);
      if (!empresaId || !permitido) { this.cargando.set(false); return; }
      const sub = merge(timer(0, 60000), this.refrescar).pipe(
        switchMap(() => this.api.notificaciones(empresaId).pipe(catchError(() => {
          this.error.set('No se pudieron cargar las notificaciones.');
          return of(null);
        })))
      ).subscribe(avisos => {
        this.cargando.set(false);
        if (avisos !== null) { this.avisos.set(avisos); this.error.set(''); }
      });
      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }
  /** Cierra el panel al hacer clic fuera de la campana. */
  @HostListener('document:click', ['$event'])
  cerrarAlFuera(event: MouseEvent): void {
    if (this.abierto() && !(event.target as Element)?.closest('app-gp-notificaciones')) this.abierto.set(false);
  }
  leer(aviso: Notificacion): void { this.marcar(aviso.id); }
  leerTodas(): void { this.marcar(); }
  /** Fecha amigable: "Ahora mismo", "Hace 5 min", "Hoy, 08:44", "Ayer, …". */
  tiempo(iso: string | null): string {
    if (!iso) return '';
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return '';
    const ahora = new Date();
    const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60000);
    if (minutos < 1) return 'Ahora mismo';
    if (minutos < 60) return `Hace ${minutos} min`;
    const hora = (f: Date) => f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    if (fecha.toDateString() === ahora.toDateString()) return `Hoy, ${hora(fecha)}`;
    const ayer = new Date(ahora);
    ayer.setDate(ahora.getDate() - 1);
    if (fecha.toDateString() === ayer.toDateString()) return `Ayer, ${hora(fecha)}`;
    const dias = Math.floor(minutos / 1440);
    if (dias < 7) return `Hace ${dias} días`;
    return fecha.toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: fecha.getFullYear() === ahora.getFullYear() ? undefined : 'numeric',
    });
  }
  private marcar(id?: number): void {
    const empresaId = this.ctx.empresaId();
    if (!empresaId || this.ocupado() || !this.ctx.tienePermiso('admin.notificaciones')) return;
    this.ocupado.set(true);
    const request = id === undefined ? this.api.marcarTodasNotificacionesLeidas(empresaId)
      : this.api.marcarNotificacionLeida(empresaId, id);
    request.subscribe({
      next: () => {
        this.ocupado.set(false);
        if (id !== undefined) this.avisos.update(lista => lista.map(n => n.id === id ? { ...n, leida: true } : n));
        if (this.ctx.empresaId() === empresaId) this.refrescar.next();
      },
      error: () => { this.ocupado.set(false); if (this.ctx.empresaId() === empresaId) this.error.set('No se pudo marcar la notificación.'); },
    });
  }
}
