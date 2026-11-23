import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-presupuesto-fields',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, ReactiveFormsModule],
  templateUrl: './presupuesto-fields.component.html',
  styleUrls: ['../_shared-form.scss']
})
export class PresupuestoFieldsComponent {
  @Input() formGroup!: FormGroup;

  tiposPpto = ['Compra', 'Servicio', 'Contrato', 'Mantenimiento', 'Proyecto', 'Inversión', 'Legal / Consultoría'];
  beneficios = ['Operativo', 'Comercial', 'Legal', 'Estratégico'];
  tiposFinanciero = [
    { value: 'GASTO', label: 'Gasto' },
    { value: 'INVERSION_CAPEX', label: 'Inversión (CAPEX)' }
  ];
  impactos = [
    { value: 'CRITICO', label: 'Crítico para operación' },
    { value: 'MEJORA_EFICIENCIA', label: 'Mejora eficiencia' },
    { value: 'DESEABLE', label: 'Deseable' }
  ];
  tiposProveedor = ['Producto', 'Servicio', 'Especializado'];
  monedas = ['COP', 'USD', 'EUR'];

  selectOption(controlName: string, value: string): void {
    this.formGroup.get(controlName)?.setValue(value);
  }

  toggleBoolean(controlName: string): void {
    const current = this.formGroup.get(controlName)?.value;
    this.formGroup.get(controlName)?.setValue(!current);
  }
}
