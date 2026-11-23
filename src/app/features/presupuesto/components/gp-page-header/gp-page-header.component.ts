import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GpIconComponent } from '../gp-icon/gp-icon.component';

@Component({
  selector: 'app-gp-page-header', standalone: true,
  imports: [CommonModule, GpIconComponent],
  template: `
    <header class="gp-nexa-hero">
      <div class="gp-hero-title"><span class="gp-nexa-hero-icon"><app-gp-icon [name]="icono" [size]="27" /></span>
        <div><span class="gp-nexa-eyebrow">{{ eyebrow || 'Gestor Presupuestal' }}</span><h1>{{ titulo }}</h1><p>{{ chip ? 'Cuenta PUC' : descripcion }} <code *ngIf="chip">{{ chip }}</code></p></div>
      </div>
      <div class="module-hero-actions"><ng-content select="[acciones]" /></div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .gp-nexa-hero {display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;padding:24px;background:linear-gradient(110deg,#213053,#1b2844 45%,#045c94);color:#fff;border-radius:16px;box-shadow:0 12px 32px #21305326;margin-bottom:24px}
    .gp-hero-title { display: flex; align-items: center; gap: 16px; }
    .gp-nexa-hero-icon {display:grid;place-items:center;width:52px;height:52px;flex-shrink:0;border-radius:12px;color:#ffb71b;background:#ffffff12;box-shadow:0 4px 16px #00000012}
    .gp-nexa-eyebrow {display:block;color:#ffb71b;font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;margin-bottom:4px}
    h1 {font-size:24px;font-weight:700;line-height:1.3;margin:0;color:#fff}
    p {margin:6px 0 0;font-size:12px;color:#ffffffcc;max-width:620px}
    code { padding: 2px 8px; border: 1px solid #ffffff42; border-radius: 6px; font-size: 12px; }
    .module-hero-actions:empty { display: none; }
    .module-hero-actions {display:flex;align-items:center;flex-wrap:wrap;gap:10px;max-width:100%;padding:0;background:none;border:0;box-shadow:none}
    @media(max-width:640px){h1{font-size:20px}.gp-nexa-hero{padding:20px 16px}.gp-hero-title{gap:12px;min-width:0}.gp-hero-title>div{min-width:0}}
  `],
})
export class GpPageHeaderComponent {
  @Input() icono = 'file';
  @Input() color = '#2563EB';
  @Input() eyebrow = '';
  @Input() titulo = '';
  @Input() descripcion = '';
  @Input() chip = '';
  @Input() foto = '';
}
