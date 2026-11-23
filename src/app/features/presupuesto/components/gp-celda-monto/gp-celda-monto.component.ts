import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Celda monetaria editable: miles en vivo, commitea al blur (null si inválido). */
@Component({
  selector: 'app-gp-celda-monto',
  standalone: true,
  imports: [CommonModule],
  template: `
    <input #input
           type="text"
           inputmode="numeric"
           class="w-full bg-transparent text-right text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#045C94]/30 rounded px-1 py-0.5
                  {{ disabled ? 'text-t3 cursor-not-allowed' : 'text-t1 hover:bg-acc/5' }}"
           [value]="moneda && !editando ? dinero : texto"
           [style.min-width.ch]="ajustarAncho ? anchoContenido : null"
           [disabled]="disabled"
           (focus)="editar(input)"
           (blur)="commitar(input.value)"
           (input)="onInput($event)"
           (keydown.enter)="$event.preventDefault(); input.blur()"
           (keydown.escape)="$event.preventDefault(); cancelar(input)"
           title="Editar valor" />
  `,
})
export class GpCeldaMontoComponent implements OnChanges {
  @Input() ajustarAncho = false;
  get anchoContenido(): number {
    return Math.max(12, (this.editando ? this.texto : this.moneda ? this.dinero : this.texto).length + 2);
  }
  @Input() valor: number | null = null;
  @Input() disabled = false;
  @Input() placeholder = '';
  @Input() moneda = false;
  @Input() mostrarCero = false;
  editando = false;
  private modificado = false;
  private valorInicial: number | null = null;
  get dinero(): string {
    return this.valor != null && (this.valor !== 0 || this.mostrarCero)
      ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(this.valor)
      : '—';
  }
  @Output() commit = new EventEmitter<number | null>();
  /** Emite en vivo mientras se digita (sin guardar), para vistas previas. */
  @Output() cambio = new EventEmitter<number | null>();

  texto = '';

  ngOnChanges(): void {
    if (this.editando) return;
    if (this.valor === null || this.valor === undefined) this.texto = this.placeholder;
    else this.texto = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(this.valor);
  }

  onInput(ev: Event): void {
    this.modificado = true;
    const input = ev.target as HTMLInputElement;
    const raw = input.value ?? '';
    this.texto = raw;

    const numero = this.parsearMonto(raw);
    if (numero !== null) {
      const cursor = input.selectionStart ?? input.value.length;
      const digitos = input.value.slice(0, cursor).replace(/[^0-9]/g, '').length;
      const sep = this.detectarSeparadorDecimal(raw);
      const decimalAntesDelCursor = sep !== null && raw.slice(0, cursor).includes(sep);
      if (sep !== null) {
        const idx = raw.lastIndexOf(sep);
        const intPart = raw.slice(0, idx);
        const decPart = raw.slice(idx + 1).replace(/[^0-9]/g, '').slice(0, 2);
        const intClean = intPart.replace(/[^0-9-]/g, '');
        const numInt = parseInt(intClean, 10);
        const formattedInt = isNaN(numInt) ? (intPart.includes('-') ? '-' : '0') : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(numInt);
        this.texto = `${formattedInt},${decPart}`;
      } else {
        const intClean = raw.replace(/[^0-9-]/g, '');
        if (intClean === '' || intClean === '-') {
          this.texto = intClean;
        } else {
          const numInt = parseInt(intClean, 10);
          this.texto = isNaN(numInt) ? '' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(numInt);
        }
      }

      input.value = this.texto;
      // El cursor avanza contando SOLO dígitos: los separadores de miles que
      // inserta el formateo no deben consumir posiciones (antes el cursor
      // quedaba antes del último dígito y el siguiente tecleo se incrustaba
      // dentro del número). Si el usuario ya tecleó el separador decimal,
      // el cursor se deja después de la coma para seguir con los decimales.
      let posicion = 0, vistos = 0;
      while (posicion < this.texto.length && vistos < digitos) {
        if (/[0-9]/.test(this.texto[posicion])) vistos++;
        posicion++;
      }
      if (decimalAntesDelCursor && this.texto[posicion] === ',') posicion++;
      input.setSelectionRange(posicion, posicion);
    }
    this.cambio.emit(numero);
  }

  /** ¿El punto de `s` (sin comas) es separador decimal?
   *  - 4+ dígitos después: es el punto de MILES que el propio formateo
   *    acaba de insertar ("1.234" + "5" → "1.2345"); el usuario no puede
   *    escribir tantos decimales (máximo 2), así que es agrupación.
   *  - 3 dígitos después y patrón de millar (1.234): agrupación.
   *  - resto (1-2 dígitos): decimal. */
  private detectarSeparadorDecimal(s: string): string | null {
    if (s.includes(',')) return ',';
    if (s.includes('.')) {
      const dots = (s.match(/\./g) || []).length;
      if (dots > 1) return null;
      const parts = s.split('.');
      if (parts[1].replace(/[^0-9]/g, '').length >= 4) return null;
      if (parts[0].length <= 3 && parts[1].length === 3 && parts[0] !== '0') {
        return null;
      }
      return '.';
    }
    return null;
  }

  private parsearMonto(texto: string): number | null {
    if (!texto) return null;
    let s = texto.trim();
    if (s === '' || s === '-') return null;

    if (s.includes('.') && s.includes(',')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      const partes = s.split(',');
      if (partes.length === 2) {
        s = partes[0] + '.' + partes[1];
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes('.')) {
      const partes = s.split('.');
      if (partes.length === 2) {
        // Misma regla que detectarSeparadorDecimal: 4+ dígitos tras el punto
        // (o patrón de millar) es agrupación, no decimal.
        if (partes[1].replace(/[^0-9]/g, '').length >= 4
            || (partes[0].length <= 3 && partes[1].length === 3 && !partes[0].startsWith('0'))) {
          s = partes[0] + partes[1];
        } else {
          s = partes[0] + '.' + partes[1];
        }
      } else {
        s = s.replace(/\./g, '');
      }
    }

    s = s.replace(/[^0-9.-]/g, '');
    if (s === '' || s === '-' || s === '.') return null;

    const [entero, decimal] = s.split('.');
    if (decimal !== undefined) {
      s = `${entero}.${decimal.slice(0, 2)}`;
    }

    const num = parseFloat(s);
    return Number.isNaN(num) ? null : num;
  }

  editar(input?: HTMLInputElement): void {
    if (this.disabled || this.editando) return;
    this.editando = true;
    this.modificado = false;
    this.valorInicial = this.valor ?? null;
    // Muestra el valor con sus decimales reales sin redondear a entero
    const plain = this.valor === null || this.valor === undefined
      ? ''
      : new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false }).format(this.valor);
    this.texto = plain;
    // Sincronizar antes de seleccionar: evita que el cambio de formato al
    // enfocar desplace la selección y concatene el importe nuevo al anterior.
    if (input) { input.value = plain; input.select(); }
  }

  commitar(valorVisible: string = this.texto): void {
    if (!this.editando) return;
    this.editando = false;
    const valor = this.parsearMonto(valorVisible);
    // Enfocar solo cambia el formato. No debe guardar ni redondear un valor
    // con centavos que el usuario no modificó.
    if (this.modificado && valor !== this.valorInicial) this.commit.emit(valor);
    this.modificado = false;
    this.ngOnChanges();
  }

  cancelar(input: HTMLInputElement): void {
    this.editando = false;
    this.modificado = false;
    this.cambio.emit(this.valor ?? null);
    this.ngOnChanges();
    input.value = this.texto;
    input.blur();
  }
}
