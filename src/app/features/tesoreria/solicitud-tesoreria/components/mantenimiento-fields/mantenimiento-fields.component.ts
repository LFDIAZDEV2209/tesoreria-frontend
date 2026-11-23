import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-mantenimiento-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './mantenimiento-fields.component.html',
  styleUrls: ['../_shared-form.scss']
})
export class MantenimientoFieldsComponent {
  @Input() formGroup!: FormGroup;

  tiposActivo = ['Equipo', 'Infraestructura', 'Vehículo', 'Sistema'];
  tiposMantenimiento = ['Preventivo', 'Correctivo', 'Urgente / Emergencia', 'Mejora / Adecuación'];
  nivelesImpacto = [
    { value: 'DETIENE_OPERACION', label: 'Detiene operación' },
    { value: 'AFECTA_PARCIALMENTE', label: 'Afecta parcialmente' },
    { value: 'NO_AFECTA', label: 'No afecta' }
  ];

  selectOption(controlName: string, value: string): void {
    this.formGroup.get(controlName)?.setValue(value);
  }

  toggleBoolean(controlName: string): void {
    const current = this.formGroup.get(controlName)?.value;
    this.formGroup.get(controlName)?.setValue(!current);
  }
}
