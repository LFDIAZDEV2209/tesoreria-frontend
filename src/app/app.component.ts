import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './layout/sidebar/sidebar.component';
import { PresupuestoToastService } from './features/presupuesto/services/presupuesto-toast.service';
import { TopTableScrollService } from './shared/top-table-scroll.service';
import { signal } from '@angular/core';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent],
  template: `
    <ng-container
      *ngIf="isLoginPage(); then loginLayout; else mainLayout"
    ></ng-container>

    <ng-template #loginLayout>
      <router-outlet></router-outlet>
    </ng-template>

    <ng-template #mainLayout>
      <div
        class="flex min-h-screen bg-gradient-to-br from-[#fdfdfd] via-[#f4f4f4] to-[#e8edf5] text-[#213053] [overflow-x:clip]"
      >
        <button *ngIf="menuMovilAbierto()" type="button" class="nexa-menu-fondo"
          aria-label="Cerrar menú de navegación" (click)="menuMovilAbierto.set(false)"></button>
        <app-sidebar id="nexa-navegacion" [class.nexa-menu-abierto]="menuMovilAbierto()"></app-sidebar>
        <main
          class="nexa-contenido flex-1 md:ml-64 transition-all duration-300 min-w-0 [overflow-x:clip]"
        >
          <div class="md:hidden p-3 bg-white border-b">
            <button type="button" class="rounded-lg border px-4 py-2" aria-controls="nexa-navegacion"
              [attr.aria-expanded]="menuMovilAbierto()" (click)="menuMovilAbierto.set(!menuMovilAbierto())">Menú</button>
          </div>
          <router-outlet></router-outlet>
        </main>
      </div>

      <!-- Toast global del Gestor Presupuestal (sobrevive a la navegación,
           igual que el sonner del gestor original) -->
      <div class="gp-toast"
           [class.gp-toast--error]="toastService.toast().tipo === 'error'"
           *ngIf="toastService.toast().visible">
        <span class="gp-toast-check"
              [class.gp-toast-check--error]="toastService.toast().tipo === 'error'">
          <svg *ngIf="toastService.toast().tipo !== 'error'" width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
               stroke-linejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <svg *ngIf="toastService.toast().tipo === 'error'" width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
               stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </span>
        <span>{{ toastService.toast().mensaje }}</span>
      </div>
    </ng-template>
  `,
  styles: [`
    .nexa-menu-fondo { display: none; }
    @media (min-width: 768px) {
      app-sidebar.nexa-sidebar-colapsado + .nexa-contenido { margin-left: 5rem; }
      app-sidebar:not(.nexa-sidebar-colapsado) + .nexa-contenido { margin-left: 16rem; }
    }
    @media (max-width: 767px) {
      app-sidebar { display: none; }
      app-sidebar.nexa-menu-abierto { display: block; }
      .nexa-contenido { margin-left: 0; }
      .nexa-menu-fondo { display: block; position: fixed; inset: 0; background: #0f172a80; z-index: 39; }
    }
    .gp-toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      /* Encima de cualquier diálogo GP (backdrops a 100, ver nexa.scss):
         los avisos de éxito o error de una acción con modal abierta
         nunca quedan detrás. */
      z-index: 200;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 14px;
      font-size: 13px;
      font-weight: 600;
      color: #213053;
      background: #FFFFFF;
      border: 1px solid rgba(4, 92, 148, 0.14);
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08);
      animation: gpToastIn 0.22s ease-out;
    }
    .gp-toast-check {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      color: #FFFFFF;
      background: #059669;
      flex-shrink: 0;
    }
    .gp-toast--error { border-color: rgba(225, 29, 72, 0.22); }
    .gp-toast-check--error { background: #E11D48; }
    @keyframes gpToastIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .gp-toast { animation: none; }
    }
  `],
})
export class AppComponent {
  title = 'Tesorería';
  menuMovilAbierto = signal(false);
  isLoginPage = signal(false);

  constructor(
    private router: Router,
    public toastService: PresupuestoToastService,
    topTableScroll: TopTableScrollService,
  ) {
    topTableScroll.iniciar();
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        // Presupuesto comparte el menú y el contenedor de Nexa.
        this.isLoginPage.set(event.urlAfterRedirects === '/login');
        this.menuMovilAbierto.set(false);
      });
  }
}
