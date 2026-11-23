import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-item-gasto-modal',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './item-gasto-modal.component.html',
  styleUrls: ['./item-gasto-modal.component.scss'],
})
export class ItemGastoModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() addItem = new EventEmitter<any>();

  tiposViatico = ['Transporte', 'Alimentación', 'Hospedaje', 'Representación', 'Otros'];

  tipoViatico = signal('');
  fechaGasto = signal(new Date().toISOString().split('T')[0]);
  conceptoDetallado = signal('');
  valorBase = signal(0);
  aplicaIva = signal(false);
  porcentajeIva = signal(19);

  get valorIva(): number {
    if (!this.aplicaIva()) return 0;
    return Math.round(this.valorBase() * this.porcentajeIva() / 100);
  }

  get valorTotal(): number {
    return this.valorBase() + this.valorIva;
  }

  get canAdd(): boolean {
    return (
      this.tipoViatico() !== '' &&
      this.fechaGasto() !== '' &&
      this.conceptoDetallado().trim() !== '' &&
      this.valorBase() > 0
    );
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  onAdd(): void {
    if (!this.canAdd) return;
    this.addItem.emit({
      tipoViatico: this.tipoViatico(),
      fechaGasto: this.fechaGasto(),
      conceptoDetallado: this.conceptoDetallado(),
      valorBase: this.valorBase(),
      aplicaIva: this.aplicaIva(),
      porcentajeIva: this.porcentajeIva(),
      valorIva: this.valorIva,
      valorTotal: this.valorTotal,
    });
  }

  onCancel(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }
}
