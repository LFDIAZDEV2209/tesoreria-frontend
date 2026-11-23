import { Component, HostListener, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { gpDropdown, gpListItem } from '../../animations/gp-animations';

/** Paleta sobria para los avatares de empresa — se asigna determinística
 * por nombre, así cada empresa "se ve" igual en todas las páginas. */
const AVATAR_COLORS: [string, string][] = [
  ['#045C94', '#0E7DC1'],
  ['#0F766E', '#14B8A6'],
  ['#7C3AED', '#8B5CF6'],
  ['#B45309', '#F59E0B'],
  ['#BE185D', '#EC4899'],
  ['#4338CA', '#6366F1'],
  ['#15803D', '#22C55E'],
  ['#B91C1C', '#EF4444'],
];

/**
 * Selector de empresa del Gestor Presupuestal — dropdown animado con
 * avatar por empresa (iniciales + color determinístico), indicador de la
 * activa y cierre por clic fuera / Escape.
 */
@Component({
  selector: 'app-gp-empresa-selector',
  standalone: true,
  imports: [CommonModule, GpIconComponent],
  animations: [gpDropdown, gpListItem],
  template: `
    <p *ngIf="ctx.error()" role="alert" class="text-sm text-red-700">{{ ctx.error() }}</p>
    <div class="relative" *ngIf="ctx.empresas().length > 1 || siempreVisible" (keydown.escape)="abrir.set(false)">
      <button type="button"
              class="gp-emp-btn"
              (click)="toggle()"
              [class.gp-emp-btn--abierta]="abrir()"
              aria-haspopup="listbox"
              [attr.aria-expanded]="abrir()">
        <span class="gp-emp-avatar"
              [style.background]="colorActual()[0] ? 'linear-gradient(135deg,' + colorActual()[0] + ',' + colorActual()[1] + ')' : 'rgba(4,92,148,.10)'">
          {{ actual() ? iniciales(actual()!.name) : '' }}
        </span>
        <span class="gp-emp-nombre">
          <span class="gp-emp-nombre__label">Empresa</span>
          <span class="gp-emp-nombre__valor">{{ actual()?.name ?? 'Elegir empresa…' }}</span>
        </span>
        <span class="gp-emp-chevron" [class.gp-emp-chevron--abierta]="abrir()">
          <app-gp-icon name="chevron-down" [size]="14"></app-gp-icon>
        </span>
      </button>

      <!-- Dropdown -->
      <div *ngIf="abrir()" @gpDropdown
           class="gp-emp-dropdown"
           role="listbox"
           aria-label="Cambiar de empresa">
        <div class="gp-emp-dropdown__head">
          <app-gp-icon name="building" [size]="12"></app-gp-icon>
          Cambiar de empresa
        </div>
        <div class="gp-emp-dropdown__lista" role="presentation">
          @for (e of ctx.empresas(); track e.id; let i = $index) {
            <button type="button"
                    class="gp-emp-opcion"
                    role="option"
                    [attr.aria-selected]="e.id === ctx.empresaId()"
                    [class.gp-emp-opcion--activa]="e.id === ctx.empresaId()"
                    [@gpListItem]="{ tiempo: 120 + i * 35 }"
                    (click)="elegir(e.id)">
              <span class="gp-emp-opcion__avatar"
                    [style.background]="'linear-gradient(135deg,' + colorDe(e.name)[0] + ',' + colorDe(e.name)[1] + ')'">
                {{ iniciales(e.name) }}
              </span>
              <span class="gp-emp-opcion__txt">
                <span class="gp-emp-opcion__nombre">{{ e.name }}</span>
                <span class="gp-emp-opcion__meta" *ngIf="e.nit">{{ e.nit }}</span>
              </span>
              <span class="gp-emp-opcion__check" *ngIf="e.id === ctx.empresaId()">
                <app-gp-icon name="check" [size]="13"></app-gp-icon>
              </span>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ── Trigger ── */
    .gp-emp-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.4rem 0.75rem 0.4rem 0.45rem;
      background: #ffffff;
      border: 1px solid #e3e9f2;
      border-radius: 0.9rem;
      cursor: pointer;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(27, 48, 83, 0.05);
    }
    .gp-emp-btn:hover,
    .gp-emp-btn--abierta {
      border-color: rgba(4, 92, 148, 0.35);
      box-shadow: 0 4px 14px rgba(4, 92, 148, 0.12), 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .gp-emp-btn--abierta { background: #f8fbff; }

    .gp-emp-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: 0.65rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 0.65rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      flex-shrink: 0;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 3px 8px rgba(15, 23, 42, 0.18);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .gp-emp-btn:hover .gp-emp-avatar { transform: scale(1.06); }

    .gp-emp-nombre { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; }
    .gp-emp-nombre__label {
      font-size: 0.58rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-weight: 700;
      color: #94a3b8;
    }
    .gp-emp-nombre__valor {
      font-size: 0.82rem;
      font-weight: 700;
      color: #213053;
      max-width: 190px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gp-emp-chevron {
      display: inline-flex;
      color: #94a3b8;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease;
      flex-shrink: 0;
    }
    .gp-emp-chevron--abierta { transform: rotate(180deg); color: #045c94; }

    /* ── Dropdown ── */
    .gp-emp-dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      z-index: 60;
      width: 290px;
      background: #ffffff;
      border: 1px solid #e3e9f2;
      border-radius: 1rem;
      overflow: hidden;
      box-shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.25), 0 4px 14px rgba(27, 48, 83, 0.08);
    }
    .gp-emp-dropdown__head {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.6rem 0.9rem;
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #64748b;
      background: #f8fafc;
      border-bottom: 1px solid #eef2f7;
    }
    .gp-emp-dropdown__lista {
      padding: 0.4rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      max-height: 300px;
      overflow-y: auto;
    }

    .gp-emp-opcion {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
      padding: 0.5rem 0.55rem;
      border: 1px solid transparent;
      border-radius: 0.7rem;
      background: transparent;
      cursor: pointer;
      text-align: left;
      font: inherit;
      transition: background 0.16s ease, border-color 0.16s ease;
    }
    .gp-emp-opcion:hover {
      background: #f2f7ff;
      border-color: rgba(4, 92, 148, 0.14);
    }
    .gp-emp-opcion--activa {
      background: rgba(4, 92, 148, 0.06);
      border-color: rgba(4, 92, 148, 0.22);
    }

    .gp-emp-opcion__avatar {
      width: 1.9rem;
      height: 1.9rem;
      border-radius: 0.6rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 0.6rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      flex-shrink: 0;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
    }

    .gp-emp-opcion__txt { flex: 1; min-width: 0; line-height: 1.2; }
    .gp-emp-opcion__nombre {
      display: block;
      font-size: 0.8rem;
      font-weight: 700;
      color: #213053;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gp-emp-opcion__meta {
      display: block;
      font-size: 0.62rem;
      color: #94a3b8;
      font-family: ui-monospace, monospace;
      margin-top: 0.1rem;
    }

    .gp-emp-opcion__check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: 999px;
      background: linear-gradient(135deg, #045c94, #0e7dc1);
      color: #fff;
      flex-shrink: 0;
      animation: gpCheckPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    @keyframes gpCheckPop {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `],
})
export class GpEmpresaSelectorComponent implements OnInit {

  private readonly ctxInyectado = inject(PresupuestoContextService);

  /** Inyectable para pruebas; en la plantilla se usa `ctx`. */
  ctx = this.ctxInyectado;

  /** Fuerza a mostrar el selector aunque haya una sola empresa. */
  siempreVisible = false;

  abrir = signal(false);

  toggle(): void {
    this.abrir.update(v => !v);
  }

  actual(): { id: number; name: string; nit?: string; ciudad?: string } | null {
    return this.ctx.empresas().find(e => e.id === this.ctx.empresaId()) ?? null;
  }

  /** Colapsa al hacer clic fuera del componente. */
  @HostListener('document:click', ['$event'])
  onClickFuera(event: MouseEvent): void {
    if (!this.abrir()) return;
    const el = event.target as HTMLElement;
    if (!el.closest('app-gp-empresa-selector')) this.abrir.set(false);
  }

  elegir(id: number): void {
    this.ctx.seleccionarEnUrl(id);
    this.abrir.set(false);
  }

  iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter(p => p.length > 1 && !/^(S\.?A\.?S?|LTDA|UNION|TEMPORAL|DE|DEL|LA|EL|E)$/i.test(p))
      .slice(0, 2)
      .map(p => p[0]!.toUpperCase())
      .join('') || nombre.slice(0, 2).toUpperCase();
  }

  colorDe(nombre: string): [string, string] {
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  colorActual(): [string, string] {
    const a = this.actual();
    return a ? this.colorDe(a.name) : ['#045C94', '#0E7DC1'];
  }

  ngOnInit(): void {
    if (this.ctx.empresas().length === 0) {
      this.ctx.cargar();
    } else if (this.ctx.permisos() === null) {
      this.ctx.cargarPermisos();
    }
  }
}
