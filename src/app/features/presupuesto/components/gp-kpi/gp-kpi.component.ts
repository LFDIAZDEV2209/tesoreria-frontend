import { Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, AfterViewInit, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { formatoCOP, formatoMiles, formatoPct, formatoCOPShort } from '../../models/presupuesto.model';

/** Rango de tamaño del valor en las tarjetas KPI (auto-ajuste). */
const TAM_MAXIMO = 24;
const TAM_MINIMO = 13;

/** KPI del Gestor Presupuestal — mismo lenguaje visual que la bandeja de Tesorería. */
@Component({
  selector: 'app-gp-kpi',
  standalone: true,
  imports: [CommonModule, GpIconComponent],
  template: `
    <div class="kpi-card" [ngClass]="cardClass">
      <div class="kpi-icon" [ngClass]="iconClass">
        <app-gp-icon [name]="icon" [size]="24"></app-gp-icon>
      </div>
      <div class="kpi-content">
        <span class="kpi-label">{{ label }}</span>
        <div class="kpi-value-row">
          <span class="kpi-value" #valorEl [title]="tooltipTitulo">{{ display }}</span>
          <span *ngIf="pill" class="kpi-trend" [ngClass]="pillClass">{{ pill }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .kpi-card {
      background: #fff;
      border-radius: 1rem;
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 3px 15px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.8);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      cursor: default;
    }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
      transition: left 0.6s;
    }
    .kpi-card:hover {
      transform: translateY(-4px) scale(1.01);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.06);
    }
    .kpi-card:hover::before { left: 100%; }
    .kpi-card:hover .kpi-icon { transform: scale(1.08) rotate(3deg); }
    .kpi-icon {
      width: 3rem;
      height: 3rem;
      border-radius: 0.875rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
      color: #fff;
    }
    :host ::ng-deep .kpi-icon svg { width: 1.5rem; height: 1.5rem; stroke-width: 2.5; }
    .kpi-icon--teal    { background: linear-gradient(135deg, #0D9488 0%, #14B8A6 100%); }
    .kpi-icon--warning { background: linear-gradient(135deg, #e07210 0%, #f59e0b 100%); }
    .kpi-icon--success { background: linear-gradient(135deg, #059669 0%, #10b981 100%); }
    .kpi-icon--danger  { background: linear-gradient(135deg, #DC2626 0%, #EF4444 100%); }
    .kpi-icon--gold    { background: linear-gradient(135deg, #FFB71B 0%, #FFD35C 100%); }
    .kpi-content { flex: 1; min-width: 0; }
    .kpi-label {
      display: block;
      font-size: 0.688rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(33, 48, 83, 0.6);
      margin-bottom: 0.375rem;
    }
    .kpi-value-row { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
    .kpi-value {
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1;
      color: #213053;
      letter-spacing: -0.02em;
    }
    .kpi-trend {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.688rem;
      font-weight: 600;
      padding: 0.2rem 0.4rem;
      border-radius: 0.375rem;
    }
    .kpi-trend--up      { background: rgba(16, 185, 129, 0.1); color: #059669; }
    .kpi-trend--neutral { background: rgba(100, 116, 139, 0.1); color: #64748b; }
    .kpi-trend--warning { background: rgba(245, 158, 11, 0.1); color: #b45309; }
    .kpi-trend--down    { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    .kpi-card--teal    { border-left: 3px solid #14B8A6; }
    .kpi-card--warning { border-left: 3px solid #f59e0b; }
    .kpi-card--success { border-left: 3px solid #10b981; }
    .kpi-card--danger  { border-left: 3px solid #ef4444; }
    .kpi-card--hero {
      background: linear-gradient(135deg, #213053 0%, #045C94 100%);
      border-left: 3px solid #FFB71B;
    }
    .kpi-card--hero .kpi-label { color: rgba(255, 255, 255, 0.75); }
    .kpi-card--hero .kpi-value { color: #fff; }
    .kpi-card--hero .kpi-trend { background: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.85); }
    @media (max-width: 1024px) { .kpi-value { font-size: 1.375rem; } }
    @media (max-width: 768px) {
      .kpi-card { padding: 1rem; }
      .kpi-icon { width: 2.5rem; height: 2.5rem; }
      :host ::ng-deep .kpi-icon svg { width: 1.25rem; height: 1.25rem; }
      .kpi-value { font-size: 1.25rem; }
    }
  `],
})
export class GpKpiComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() label = '';
  @Input() value: number | null | undefined = 0;
  @Input() tipo: 'moneda' | 'conteo' | 'porcentaje' = 'moneda';
  @Input() variante: 'default' | 'success' | 'danger' | 'warning' = 'default';
  @Input() icon = 'sigma';
  @Input() sub = '';
  @Input() destacado = false;
  /** variación % con signo: >0 verde, <0 rojo. */
  @Input() trend?: number | null;
  @Input() trendText = '';

  @ViewChild('valorEl', { static: true }) valorEl?: ElementRef<HTMLElement>;

  display = '';
  pill = '';
  private rafId: number | null = null;
  private ro?: ResizeObserver;
  /** true cuando la cifra completa no cabe ni al tamaño mínimo. */
  private compacto = false;
  private animando = false;

  constructor(private zone: NgZone, private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.ajustarFuente());
      this.ro.observe(this.host.nativeElement);
    }
    this.ajustarFuente();
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  /**
   * Ajusta el valor para que una cifra larga nunca se corte: mide el texto en
   * un medidor oculto (sin tocar el elemento visible, así el ResizeObserver no
   * entra en bucle) y aplica el mayor tamaño que quepa; si ni al mínimo cabe,
   * cae al formato compacto ("-$4,9B") conservando el valor completo en el
   * tooltip.
   */
  private ajustarFuente(): void {
    const el = this.valorEl?.nativeElement;
    const caja = el?.parentElement;
    if (!el || !caja) return;
    const disponible = caja.clientWidth - 2;
    if (disponible <= 0) return;

    const estilos = getComputedStyle(el);
    const medidor = document.createElement('span');
    medidor.style.position = 'absolute';
    medidor.style.visibility = 'hidden';
    medidor.style.whiteSpace = 'nowrap';
    medidor.style.pointerEvents = 'none';
    medidor.style.fontFamily = estilos.fontFamily;
    medidor.style.fontWeight = estilos.fontWeight;
    medidor.style.letterSpacing = estilos.letterSpacing;
    caja.appendChild(medidor);

    const completo = this.textoCompleto();
    const corto = this.textoCorto();
    let tam = this.medirTamano(medidor, completo, disponible);
    let texto = completo;
    let compacto = false;
    if (tam <= TAM_MINIMO && corto) {
      const tamCorto = this.medirTamano(medidor, corto, disponible);
      if (tamCorto > tam) {
        tam = tamCorto;
        texto = corto;
        compacto = true;
      }
    }
    medidor.remove();

    this.compacto = compacto;
    el.style.fontSize = `${tam}px`;
    if (!this.animando && el.textContent !== texto) {
      el.textContent = texto;
      this.display = texto;
    }
  }

  /** Mayor tamaño (TAM_MINIMO..TAM_MAXIMO) al que `texto` cabe en `disponible`. */
  private medirTamano(medidor: HTMLElement, texto: string, disponible: number): number {
    medidor.textContent = texto;
    let tam = TAM_MAXIMO;
    medidor.style.fontSize = `${tam}px`;
    while (tam > TAM_MINIMO && medidor.getBoundingClientRect().width > disponible) {
      tam -= 1;
      medidor.style.fontSize = `${tam}px`;
    }
    return tam;
  }

  /** Texto final con la cifra completa (o "—" si no hay valor). */
  private textoCompleto(): string {
    if (this.value === null || this.value === undefined) return '—';
    return this.formato()(this.value);
  }

  /** Versión abreviada para tarjetas angostas; null si el tipo no la admite. */
  private textoCorto(): string | null {
    if (this.tipo !== 'moneda' || this.value === null || this.value === undefined) return null;
    return formatoCOPShort(this.value);
  }

  get tooltipTitulo(): string {
    if (this.value === null || this.value === undefined) return '';
    if (this.tipo === 'moneda') return formatoCOP(this.value);
    if (this.tipo === 'porcentaje') return formatoPct(this.value);
    return formatoMiles(this.value);
  }

  get cardClass(): string[] {
    const mapa: Record<string, string> = {
      default: 'kpi-card--teal',
      success: 'kpi-card--success',
      danger: 'kpi-card--danger',
      warning: 'kpi-card--warning',
    };
    return [mapa[this.variante] ?? 'kpi-card--teal', ...(this.destacado ? ['kpi-card--hero'] : [])];
  }

  get iconClass(): string[] {
    if (this.destacado) return ['kpi-icon--gold'];
    const mapa: Record<string, string> = {
      default: 'kpi-icon--teal',
      success: 'kpi-icon--success',
      danger: 'kpi-icon--danger',
      warning: 'kpi-icon--warning',
    };
    return [mapa[this.variante] ?? 'kpi-icon--teal'];
  }

  get pillClass(): string {
    if (this.trend !== null && this.trend !== undefined) {
      return this.trend > 0 ? 'kpi-trend--up' : this.trend < 0 ? 'kpi-trend--down' : 'kpi-trend--neutral';
    }
    return 'kpi-trend--neutral';
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['value'] !== undefined || cambios['tipo'] !== undefined) {
      this.animarDisplay();
    }
    if (cambios['trendText'] === undefined && this.trendText === '' && this.trend !== null && this.trend !== undefined) {
      this.trendText = `${this.trend > 0 ? '+' : ''}${this.trend}%`;
    }
    if (this.trend !== null && this.trend !== undefined) {
      this.pill = this.trendText;
    } else {
      this.pill = this.sub;
    }
  }

  private formato(): (v: number) => string {
    if (this.tipo === 'moneda') return formatoCOP;
    if (this.tipo === 'porcentaje') return formatoPct;
    return formatoMiles;
  }

  /** Formato efectivo: compacto cuando la cifra completa no cabe en la tarjeta. */
  private fmtValor(): (v: number) => string {
    if (this.compacto && this.tipo === 'moneda') return formatoCOPShort;
    return this.formato();
  }

  /** Conteo animado 0 → valor (ease-out); respeta prefers-reduced-motion.
   *  Corre FUERA de la zona de Angular y escribe el texto directo en el DOM:
   *  un rAF a 60fps dentro de la zona dispara change detection global cada
   *  frame (la causa principal del lag de esta página). */
  private animarDisplay(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.animando = false;
    const el = this.valorEl?.nativeElement ?? null;

    const pintar = (texto: string): void => {
      this.display = texto;
      if (el) el.textContent = texto;
      this.ajustarFuente();
    };

    if (this.value === null || this.value === undefined) {
      pintar('—');
      return;
    }
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pintar(this.formato()(this.value));
      return;
    }
    const destino = this.value;
    const duracion = 750;
    const inicio = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / duracion);
      const e = 1 - Math.pow(1 - k, 3);
      this.display = this.fmtValor()(Math.round(destino * e));
      if (el) el.textContent = this.display;
      if (k < 1) {
        this.rafId = requestAnimationFrame(paso);
      } else {
        this.rafId = null;
        this.animando = false;
        this.ajustarFuente();
      }
    };
    this.animando = true;
    this.display = this.fmtValor()(0);
    if (el) el.textContent = this.display;
    this.ajustarFuente();
    this.rafId = this.zone.runOutsideAngular(() => requestAnimationFrame(paso));
  }
}
