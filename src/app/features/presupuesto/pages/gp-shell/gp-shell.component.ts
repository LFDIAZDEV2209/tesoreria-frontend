import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GpSessionService } from '../../services/gp-session.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { AuthService } from '../../../../core/services/auth.service';
import { GpNavigationComponent } from '../../components/gp-navigation/gp-navigation.component';
import { GpPeriodoService } from '../../services/gp-periodo.service';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';

@Component({
  selector: 'app-gp-shell', standalone: true,
  imports: [RouterOutlet, GpNavigationComponent, GpEmptyStateComponent, GpIconComponent],
  template: `
    @if (session.verificando() || session.estado() === null) {
      <div class="gate">
        <app-gp-empty-state icono="shield" [cargando]="true" titulo="Validando tu sesión"
          descripcion="Estamos verificando tu acceso al Gestor Presupuestal. Esto toma solo un momento." />
      </div>
    } @else if (session.estado()?.autenticado) {
      <app-gp-navigation>
        <router-outlet />
      </app-gp-navigation>
    } @else {
      <div class="gate">
        <section class="gate-card">
          <span class="gate-icono" aria-hidden="true"><app-gp-icon name="shield" [size]="26" /></span>
          <h1>Gestor Presupuestal</h1>
          <p class="gate-sub">No pudimos validar tu acceso a NEXA.</p>
          <p class="gate-msg" role="alert">{{ session.error() || 'Tu sesión no tiene acceso al Gestor Presupuestal.' }}</p>
          <div class="gate-acciones">
            <button type="button" class="gate-btn gate-btn--primary" [disabled]="session.verificando()" (click)="session.verificar()">
              <app-gp-icon name="refresh" [size]="15" />{{ session.verificando() ? 'Verificando…' : 'Reintentar' }}
            </button>
            <button type="button" class="gate-btn" (click)="auth.logout()">Volver a iniciar sesión en Nexa</button>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .gate { display:flex; justify-content:center; align-items:center; min-height:60vh; padding:1.5rem; }
    .gp-period-status { padding:1.5rem; }
    .gate-card {
      width:100%; max-width:30rem; padding:32px 30px; border-radius:20px; text-align:center;
      background: linear-gradient(180deg, rgba(4,92,148,.05), transparent 55%), #fff;
      border:1px solid rgba(4,92,148,.12);
      box-shadow:0 12px 32px rgba(33,48,83,.08);
    }
    .gate-icono {
      display:inline-grid; place-items:center; width:58px; height:58px; border-radius:18px;
      color:#045c94; background:rgba(4,92,148,.1); border:1px solid rgba(4,92,148,.16);
    }
    .gate-card h1 { margin:14px 0 0; font-size:18px; font-weight:700; color:#213053; }
    .gate-sub { margin:2px 0 0; font-size:13px; color:#64748b; }
    .gate-msg {
      margin:14px 0 0; padding:11px 13px; border-radius:12px; font-size:12.5px; line-height:1.55; text-align:left;
      color:#9f1239; background:rgba(220,38,38,.06); border:1px solid rgba(220,38,38,.16); overflow-wrap:anywhere;
    }
    .gate-acciones { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; margin-top:18px; }
    .gate-btn {
      display:inline-flex; align-items:center; gap:7px; padding:9px 15px; border-radius:10px; cursor:pointer;
      font-family:inherit; font-size:12.5px; font-weight:600; color:#045c94; background:#fff;
      border:1px solid rgba(4,92,148,.24); transition:background .15s ease, transform .15s ease;
    }
    .gate-btn:hover:not(:disabled) { background:#edf5fb; transform:translateY(-1px); }
    .gate-btn--primary { color:#fff; background:linear-gradient(135deg,#213053,#045c94); border:0; }
    .gate-btn--primary:hover:not(:disabled) { background:linear-gradient(135deg,#213053,#045c94); filter:brightness(1.08); }
    .gate-btn:disabled { opacity:.6; cursor:default; }
    @media(max-width:600px){ .gp-period-status{padding:.75rem;} .gate-card{padding:24px 18px;} }
    @media (prefers-reduced-motion: reduce) { .gate-btn { transition:none; } }
  `],
})
export class GpShellComponent {
  readonly session = inject(GpSessionService);
  readonly auth = inject(AuthService);
  readonly context = inject(PresupuestoContextService);
  readonly periodos = inject(GpPeriodoService);
  constructor() {
    const sesionPrevia = this.session.estado()?.autenticado === true;
    // Cada entrada revalida el acceso; los lectores simultáneos comparten el GET pendiente.
    this.session.verificar();
    // Al volver al módulo también se actualizan las asignaciones de empresas.
    // El arranque sin estado continúa cuando responde la verificación compartida.
    if (sesionPrevia) this.context.cargar();
  }
}
