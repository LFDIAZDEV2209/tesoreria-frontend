import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-servicios-generales-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './servicios-generales-fields.component.html',
  styleUrls: ['../_shared-form.scss']
})
export class ServiciosGeneralesFieldsComponent {
  @Input() formGroup!: FormGroup;

  tiposServicio = [
    'Aseo / Limpieza', 'Cafetería', 'Mensajería', 'Traslados internos',
    'Apoyo logístico', 'Adecuaciones menores', 'Mantenimiento locativo menor',
    'Suministros (papelería, insumos)'
  ];

  areasEspecificas = ['Oficinas', 'Salas', 'Baños', 'Bodega', 'Zonas comunes'];
  alcances = ['Puntual', 'Programado', 'Permanente'];
  motivos = ['Operativo', 'Evento', 'Contingencia', 'Reposición'];
  impactos = ['Crítico', 'Medio', 'Bajo'];
  responsables = ['Personal interno', 'Contratista', 'Proveedor'];

  selectOption(controlName: string, value: string): void {
    this.formGroup.get(controlName)?.setValue(value);
  }

  toggleBoolean(controlName: string): void {
    const current = this.formGroup.get(controlName)?.value;
    this.formGroup.get(controlName)?.setValue(!current);
  }
}
