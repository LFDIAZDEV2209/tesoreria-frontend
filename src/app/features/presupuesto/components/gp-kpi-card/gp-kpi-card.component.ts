import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { formatoCOP } from '../../models/presupuesto.model';

/** Paleta oscura del gestor original (globals.css, tema .dark). */
const COLORES: Record<string, string> = {
  default: '#5B8DE6',
  success: '#34A882',
  warning: '#E0AD42',
  danger: '#E87A74',
};

/**
 * KPI idéntico al KPICard del gestor: barra de acento superior, label
 * uppercase a la izquierda, ícono en recuadro de color a la derecha y valor
 * grande en mono con conteo animado 0 → valor.
 */
@Component({
  selector: 'app-gp-kpi-card',
  standalone: true,
  imports: [CommonModule, GpIconComponent],
  template: `
    <div class="kpi-card">
      <div class="kpi-bar" [style.background]="'linear-gradient(90deg, ' + color + ', transparent 85%)'"></div>
      <div class="kpi-body">
        <div class="kpi-head">
          <span class="kpi-label">{{ label }}</span>
          <div class="kpi-icon" [style.background]="color">
            <app-gp-icon [name]="icon" [size]="18"></app-gp-icon>
          </div>
        </div>
        <p class="kpi-value">{{ display }}</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .kpi-card {
      position: relative;
      overflow: hidden;
      background: #121B2E;
      border: 1px solid rgb(148 163 184 / 0.10);
      border-radius: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.04);
      transition: box-shadow 0.2s ease, border-color 0.2s ease;
      cursor: default;
    }
    .kpi-card:hover {
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.05);
      border-color: rgb(148 163 184 / 0.16);
    }
    .kpi-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      border-radius: 16px 16px 0 0;
    }
    .kpi-body { padding: 24px 20px 20px; }
    .kpi-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      line-height: 1;
      color: #5E6B80;
    }
    .kpi-icon {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #FFFFFF;
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.16);
    }
    .kpi-value {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      line-height: 1;
      color: #E5EAF2;
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `],
})
export class GpKpiCardComponent implements OnChanges {
  @Input() label = '';
  @Input() value: number | null | undefined = 0;
  @Input() icon = 'sigma';
  @Input() variante: 'default' | 'success' | 'warning' | 'danger' = 'default';

  display = formatoCOP(0);
  private rafId: number | null = null;

  get color(): string {
    return COLORES[this.variante] ?? COLORES['default'];
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['value'] !== undefined) {
      this.animar(this.value ?? 0);
    }
  }

  private animar(destino: number): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (typeof requestAnimationFrame === 'undefined') {
      this.display = formatoCOP(destino);
      return;
    }
    const duracion = 900;
    const inicio = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / duracion);
      const e = 1 - Math.pow(1 - k, 4);
      this.display = formatoCOP(destino * e);
      if (k < 1) {
        this.rafId = requestAnimationFrame(paso);
      } else {
        this.display = formatoCOP(destino);
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(paso);
  }
}
