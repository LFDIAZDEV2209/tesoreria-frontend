import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-compra-hardware-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './compra-hardware-fields.component.html',
  styleUrls: ['../_shared-form.scss']
})
export class CompraHardwareFieldsComponent {
  @Input() formGroup!: FormGroup;

  tiposHardware = [
    'Laptop', 'Desktop', 'Monitor', 'Servidor', 'Impresora',
    'Escáner', 'Tablet', 'Periféricos', 'Otro'
  ];

  tiposUso = ['Administrativo', 'Operativo', 'Diseño', 'Desarrollo', 'Servidor / Infraestructura'];

  motivosCompra = ['Nuevo ingreso', 'Reposición', 'Daño', 'Upgrade', 'Proyecto'];

  selectOption(controlName: string, value: string): void {
    this.formGroup.get(controlName)?.setValue(value);
  }

  toggleBoolean(controlName: string): void {
    const current = this.formGroup.get(controlName)?.value;
    this.formGroup.get(controlName)?.setValue(!current);
  }
}
