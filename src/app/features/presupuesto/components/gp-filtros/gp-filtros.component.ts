import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Barra de filtros consistente: búsqueda, categoría, rango de fechas,
 * estado (opcional) y limpieza con chips de activos.
 * Con [hero]=true se renderiza translúcida para posarse sobre una banda navy
 * (mismo estilo que los filtros de la bandeja de tesorería).
 */
@Component({
  selector: 'app-gp-filtros',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  styles: [`
    :host {display:block;min-width:0}
    .gp-filters-inline {display:flex;flex-wrap:wrap;gap:10px;align-items:center;width:100%}
    .gp-filters-inline .gp-filter-search {flex:1;min-width:160px}
    .gp-filters-inline .gp-filter-search input {width:100%!important}
    .gp-filters-inline select {width:200px!important}
    .gp-filters-inline input[type=date] {width:132px!important;font-size:12px!important}
    .gp-filter-dates {display:flex;align-items:center;gap:4px;max-width:100%}
    .gp-filter-dates input {min-width:0}
    @media(max-width:767px){.gp-filters-inline .gp-filter-search{min-width:100%}.gp-filters-inline select{flex:none;width:200px!important}}
    .gp-hero-input {
      padding: 0.5rem 0.875rem;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0.5rem;
      color: #fff;
      font-size: 0.875rem;
      outline: none;
      transition: border 0.2s ease, background 0.2s ease;
      appearance: none;
      cursor: pointer;
    }
    .gp-hero-input::placeholder { color: rgba(255, 255, 255, 0.55); }
    .gp-hero-input:focus { border-color: rgba(255, 255, 255, 0.45); background: rgba(255, 255, 255, 0.14); }
    .gp-hero-input:focus::placeholder { color: rgba(255, 255, 255, 0.7); }
    input[type="date"].gp-hero-input { color-scheme: dark; }
    .gp-hero-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: #FFB71B;
      background: rgba(255, 183, 27, 0.15);
      border: 1px solid rgba(255, 183, 27, 0.3);
      transition: background 0.2s ease;
    }
    .gp-hero-btn:hover { background: rgba(255, 183, 27, 0.25); }
  `],
  template: `
    <div class="flex flex-wrap items-center gap-2.5" [class.gp-filters-inline]="!hero">
      <div class="relative gp-filter-search">
        <svg [ngClass]="hero ? 'w-4 h-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none' : 'w-4 h-4 text-t3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none'"
             fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/>
        </svg>
        <input type="text" [placeholder]="placeholderBusqueda"
               [ngClass]="hero ? 'gp-hero-input !pl-9 !w-64' : 'input-field !py-2.5 !pl-10 !text-sm !w-64'"
               [ngModel]="busqueda" (ngModelChange)="cambiar('busqueda', $event)">
      </div>

      <select *ngIf="categorias.length" aria-label="Categoría"
              [ngClass]="hero ? 'gp-hero-input !w-48' : 'input-field !py-2.5 !text-sm !w-48'"
              [ngModel]="categoria" (ngModelChange)="cambiar('categoria', $event)">
        <option value="" [style.background]="hero ? '#213053' : null" [style.color]="hero ? '#fff' : null">Todas las categorías</option>
        <option *ngFor="let c of categorias" [value]="c"
                [style.background]="hero ? '#213053' : null" [style.color]="hero ? '#fff' : null">{{ c }}</option>
      </select>

      <div *ngIf="mostrarFechas" class="gp-filter-dates">
      <svg class="w-3 h-3 text-t3 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
      <input type="date" title="Fecha inicial" [ngClass]="hero ? 'gp-hero-input !w-36' : 'input-field !py-2.5 !text-sm !w-40'"
             [ngModel]="desde" (ngModelChange)="cambiar('desde', $event)">
      <span [ngClass]="hero ? 'text-white/40' : 'text-gray-300'">—</span>
      <input type="date" title="Fecha final" [ngClass]="hero ? 'gp-hero-input !w-36' : 'input-field !py-2.5 !text-sm !w-40'"
             [ngModel]="hasta" (ngModelChange)="cambiar('hasta', $event)">
      </div>

      <select *ngIf="estados.length" [attr.aria-label]="etiquetaEstado"
              [ngClass]="hero ? 'gp-hero-input !w-44' : 'input-field !py-2.5 !text-sm !w-44'"
              [ngModel]="estado" (ngModelChange)="cambiar('estado', $event)">
        <option value="" [style.background]="hero ? '#213053' : null" [style.color]="hero ? '#fff' : null">{{ etiquetaTodosEstados }}</option>
        <option *ngFor="let e of estados" [value]="e.valor"
                [style.background]="hero ? '#213053' : null" [style.color]="hero ? '#fff' : null">{{ e.label }}</option>
      </select>

      <button *ngIf="hayFiltros" [ngClass]="hero ? 'gp-hero-btn' : 'text-xs text-t3 hover:text-rose-500 transition-colors flex items-center gap-1'"
              (click)="limpiar()">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg>
        Quitar filtros
      </button>

      <div *ngIf="chips.length" class="w-full flex flex-wrap gap-1.5 -mt-0.5">
        <span *ngFor="let chip of chips"
              [ngClass]="hero ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface/10 text-white text-[11px] font-medium border border-white/20' : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-500/5 text-acc text-[11px] font-medium border border-accent-500/15'">
          {{ chip }}
        </span>
      </div>
    </div>
  `,
})
export class GpFiltrosComponent {
  @Input() hero = false;
  @Input() mostrarFechas = true;
  @Input() etiquetaEstado = 'Estado';
  @Input() etiquetaTodosEstados = 'Todos los estados';
  @Input() busqueda = '';
  @Input() categoria = '';
  @Input() desde = '';
  @Input() hasta = '';
  @Input() estado = '';
  @Input() categorias: string[] = [];
  @Input() estados: { valor: string; label: string }[] = [];
  @Input() placeholderBusqueda = 'Buscar por NIT o nombre…';

  @Output() cambio = new EventEmitter<{ campo: string; valor: string }>();
  @Output() limpiarEvent = new EventEmitter<void>();

  cambiar(campo: string, valor: string): void {
    this.cambio.emit({ campo, valor });
  }

  limpiar(): void {
    this.busqueda = '';
    this.categoria = '';
    this.desde = '';
    this.hasta = '';
    this.estado = '';
    this.limpiarEvent.emit();
  }

  get hayFiltros(): boolean {
    return !!(this.busqueda || this.categoria || this.desde || this.hasta || this.estado);
  }

  get chips(): string[] {
    const chips: string[] = [];
    if (this.categoria) chips.push(this.categoria);
    if (this.desde) chips.push(`Desde ${this.desde}`);
    if (this.hasta) chips.push(`Hasta ${this.hasta}`);
    if (this.estado) chips.push(this.estado);
    return chips;
  }
}
