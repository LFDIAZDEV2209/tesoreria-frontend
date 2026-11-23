import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

@Component({
  selector: 'app-historicos-tabs', standalone: true, imports: [RouterLink],
  template: `<nav aria-label="Secciones de históricos" class="history-tabs">
    @for (tab of tabs; track tab.id) {
      @if (tab.id === 'periodos' || ctx.tienePermiso('historicos.ver')) {
        <a [routerLink]="tab.route" queryParamsHandling="preserve" [class.active]="active === tab.id"
           [attr.aria-current]="active === tab.id ? 'page' : null">{{ tab.label }}</a>
      }
    }
  </nav>`,
  styles: [`
    :host{display:block;min-width:0;margin:22px 0}
    .history-tabs{display:flex;gap:6px;overflow-x:auto;border-bottom:1px solid #e6ebf2;background:#fff;padding:0 12px}
    a{display:block;flex-shrink:0;padding:12px 18px;border:1px solid transparent;border-bottom:3px solid transparent;border-radius:10px 10px 0 0;color:#4a5870;white-space:nowrap;font-size:13px;font-weight:500;text-decoration:none}
    a:hover{background:#f4f6fa;color:#0b5a8f}
    a.active{background:#eef4fb;color:#0b5a8f;border-color:#cfe0f2;border-bottom-color:#f2b233;font-weight:600}
    a:focus-visible{outline:3px solid #7fb3e6;outline-offset:-3px}
    @media(max-width:600px){.history-tabs{padding:0}a{padding:12px}}
  `],
})
export class HistoricosTabsComponent {
  readonly ctx = inject(PresupuestoContextService);
  @Input() active: 'historicos' | 'periodos' | 'comparar' = 'historicos';
  readonly tabs = [
    {id: 'periodos', route: '/presupuesto/historicos/periodos', label: 'Creación de periodos'},
  ];
}
