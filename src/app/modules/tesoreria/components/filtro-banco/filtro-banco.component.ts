import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-filtro-banco',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './filtro-banco.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltroBancoComponent {
  @Input() bancos: string[] = [];
  @Input() bancoSeleccionado: string | null = null;
  @Output() bancoChange = new EventEmitter<string | null>();

  onBancoChange(value: string): void {
    this.bancoChange.emit(value || null);
  }
}
