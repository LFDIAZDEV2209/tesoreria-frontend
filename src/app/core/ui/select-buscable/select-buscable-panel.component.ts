import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild, computed, signal } from '@angular/core';

export interface OpcionSelect { indice: number; texto: string; grupo: string; deshabilitada: boolean; seleccionada: boolean; }
export function normalizarOpcion(texto: string): string { return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim(); }
let secuencia = 0;

@Component({
  selector: 'app-select-buscable-panel', standalone: true,
  template: `
    <div class="selector-panel" (keydown)="tecla($event)">
      <div class="selector-cabecera">
        <input #buscador type="search" autocomplete="off" role="combobox" aria-expanded="true" aria-autocomplete="list"
          [attr.aria-label]="'Buscar en ' + nombre" placeholder="Buscar…" [attr.aria-controls]="listaId"
          [attr.aria-activedescendant]="opcionActivaId()" [value]="consulta()" (input)="buscar($any($event.target).value)">
        <button type="button" class="selector-cerrar" aria-label="Cerrar opciones" (click)="cerrar.emit(true)">✕</button>
      </div>
      <div #lista class="selector-opciones" role="listbox" [id]="listaId" [attr.aria-label]="nombre" [attr.aria-multiselectable]="multiple">
        @for (opcion of visibles(); track opcion.indice; let i = $index) {
          <button type="button" role="option" tabindex="-1" [id]="listaId + '-' + opcion.indice" [disabled]="opcion.deshabilitada"
            [class.activa]="activo() === i" [class.seleccionada]="opcion.seleccionada" [attr.aria-selected]="opcion.seleccionada"
            (mousedown)="$event.preventDefault()" (click)="elegir.emit(opcion.indice)">
            <span><small [hidden]="!opcion.grupo">{{ opcion.grupo }}</small>{{ opcion.texto || 'Sin selección' }}</span>
            <span aria-hidden="true">{{ opcion.seleccionada ? '✓' : '' }}</span>
          </button>
        } @empty { <p role="status">No hay opciones que coincidan.</p> }
      </div>
      @if (multiple) { <p class="selector-ayuda">Puedes seleccionar varias opciones.</p> }
    </div>`,
  styles: [`
    :host{display:block;width:100%;color:#213053;font-family:inherit}
    .selector-panel{background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 12px 36px #0f172a33;overflow:hidden}
    .selector-cabecera{display:flex;gap:8px;padding:10px;border-bottom:1px solid #e2e8f0}
    input{min-width:0;width:100%;padding:9px 11px;border:1px solid #94a3b8;border-radius:8px;font:inherit;font-size:14px;background:#fff;color:#213053}
    input:focus{outline:2px solid #045c94;outline-offset:1px}
    .selector-cerrar{padding:4px 8px;border:0;background:transparent;color:#475569;cursor:pointer}
    .selector-opciones{max-height:min(280px,45vh);overflow:auto;overscroll-behavior:contain}
    .selector-opciones button{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;width:100%;border:0;text-align:left;font:inherit;font-size:14px;color:inherit;background:#fff;cursor:pointer;overflow-wrap:anywhere}
    .selector-opciones button:hover,.selector-opciones button.activa{background:#eaf4fb}
    .selector-opciones button.seleccionada{color:#045c94;font-weight:600}
    .selector-opciones button:disabled{opacity:.45;cursor:not-allowed}
    small{display:block;font-size:10px;color:#64748b;font-weight:400}[hidden]{display:none}
    p{margin:0;padding:14px;font-size:13px;color:#64748b}
    .selector-ayuda{border-top:1px solid #e2e8f0;padding:8px 12px;font-size:11px}
  `],
})
export class SelectBuscablePanelComponent implements AfterViewInit {
  @Input() nombre = 'opciones';
  @Input() multiple = false;
  @Output() elegir = new EventEmitter<number>();
  @Output() cerrar = new EventEmitter<boolean>();
  @ViewChild('buscador') buscador!: ElementRef<HTMLInputElement>;
  @ViewChild('lista') lista!: ElementRef<HTMLElement>;
  readonly listaId = 'opciones-buscables-' + ++secuencia;
  readonly opciones = signal<OpcionSelect[]>([]);
  readonly consulta = signal('');
  readonly activo = signal(0);
  readonly visibles = computed(() => {
    const palabras = normalizarOpcion(this.consulta()).split(/\s+/);
    return this.opciones().filter(o => palabras.every(p => normalizarOpcion(o.texto + ' ' + o.grupo).includes(p)));
  });
  readonly opcionActivaId = computed(() => {
    const opcion = this.visibles()[this.activo()];
    return opcion ? this.listaId + '-' + opcion.indice : null;
  });
  ngAfterViewInit(): void { this.buscador.nativeElement.focus(); }
  buscar(texto: string): void { this.consulta.set(texto); this.activo.set(this.visibles().findIndex(o => !o.deshabilitada)); }
  tecla(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.cerrar.emit(true); return; }
    if (event.key === 'Tab') { this.cerrar.emit(true); return; }
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      const opcion = this.visibles()[this.activo()];
      if (opcion && !opcion.deshabilitada) this.elegir.emit(opcion.indice);
      return;
    }
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    if ((event.key === 'Home' || event.key === 'End') && this.consulta()) return;
    event.preventDefault(); event.stopPropagation();
    const disponibles = this.visibles().map((o,i) => o.deshabilitada ? -1 : i).filter(i => i >= 0);
    if (!disponibles.length) return;
    const actual = disponibles.indexOf(this.activo());
    const indice = event.key === 'Home' ? 0 : event.key === 'End' ? disponibles.length-1
      : event.key === 'ArrowDown' ? (actual+1)%disponibles.length : (actual <= 0 ? disponibles.length-1 : actual-1);
    this.activo.set(disponibles[indice]);
    queueMicrotask(() => this.lista.nativeElement.querySelector<HTMLElement>('#' + this.opcionActivaId())?.scrollIntoView({block:'nearest'}));
  }
}
