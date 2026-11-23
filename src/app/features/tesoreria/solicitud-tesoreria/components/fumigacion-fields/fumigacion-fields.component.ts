import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-fumigacion-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './fumigacion-fields.component.html',
  styleUrls: ['../_shared-form.scss']
})
export class FumigacionFieldsComponent {
  @Input() formGroup!: FormGroup;

  areasEspecificas = ['Oficinas', 'Bodega', 'Planta', 'Consultorios', 'Zonas comunes'];

  nivelesInfestacion = [
    { value: 'PREVENTIVO', label: 'Preventivo' },
    { value: 'BAJO', label: 'Bajo' },
    { value: 'MEDIO', label: 'Medio' },
    { value: 'ALTO_CRITICO', label: 'Alto / Crítico' }
  ];

  tiposControl = [
    { value: 'INSECTOS', label: 'Insectos (cucarachas, hormigas, mosquitos)' },
    { value: 'ROEDORES', label: 'Roedores' },
    { value: 'TERMITAS', label: 'Termitas' },
    { value: 'CONTROL_SANITARIO', label: 'Control sanitario general' },
    { value: 'DESINFECCION', label: 'Desinfección / Nebulización' }
  ];

  motivos = [
    { value: 'PREVENTIVO_PROGRAMADO', label: 'Preventivo programado' },
    { value: 'EVIDENCIA_PLAGA', label: 'Evidencia de plaga' },
    { value: 'REQUERIMIENTO_SANITARIO', label: 'Requerimiento sanitario' },
    { value: 'AUDITORIA', label: 'Auditoría / Visita de autoridad' }
  ];

  riesgos = ['Sanitario', 'Operativo', 'Imagen / Cliente'];

  tiposFinanciero = [
    { value: 'GASTO_OPERATIVO', label: 'Gasto operativo' },
    { value: 'CUMPLIMIENTO_NORMATIVO', label: 'Cumplimiento normativo' }
  ];

  tiposServicio = ['Puntual', 'Contrato periódico'];

  selectOption(controlName: string, value: string): void {
    this.formGroup.get(controlName)?.setValue(value);
  }

  toggleBoolean(controlName: string): void {
    const current = this.formGroup.get(controlName)?.value;
    this.formGroup.get(controlName)?.setValue(!current);
  }

  toggleControlArray(controlName: string, value: string): void {
    const current: string[] = this.formGroup.get(controlName)?.value || [];
    const index = current.indexOf(value);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(value);
    }
    this.formGroup.get(controlName)?.setValue([...current]);
  }

  isInArray(controlName: string, value: string): boolean {
    const arr: string[] = this.formGroup.get(controlName)?.value || [];
    return arr.includes(value);
  }
}
