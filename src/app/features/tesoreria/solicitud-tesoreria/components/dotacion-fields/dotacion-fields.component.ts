import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { TesoreriaService } from '../../../services/tesoreria.service';
import { EmpresaPeopleNet, AreaPeopleNet } from '../../../models/solicitud.model';

@Component({
  selector: 'app-dotacion-fields',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, ReactiveFormsModule],
  templateUrl: './dotacion-fields.component.html',
  styleUrls: ['../_shared-form.scss']
})
export class DotacionFieldsComponent implements OnInit {
  @Input() formGroup!: FormGroup;

  // ── PeopleNet data signals ──
  empresas = signal<EmpresaPeopleNet[]>([]);
  sedes = signal<AreaPeopleNet[]>([]);
  loadingEmpresas = signal(false);
  loadingSedes = signal(false);

  tiposDotacion = [
    { value: 'UNIFORME', label: 'Uniforme', icon: '👔' },
    { value: 'CALZADO', label: 'Calzado', icon: '👟' },
    { value: 'EPP', label: 'EPP (Protección Personal)', icon: '🦺' },
    { value: 'BATA', label: 'Bata / Ropa Especializada', icon: '🥼' },
    { value: 'ACCESORIOS', label: 'Accesorios', icon: '🧤' }
  ];

  tallasCamisa = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  tallasPantalon = ['28', '30', '32', '34', '36', '38', '40', '42'];
  tallasCalzado = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
  generos = ['Masculino', 'Femenino', 'Unisex'];

  motivosSolicitud = [
    { value: 'DOTACION_LEGAL', label: 'Dotación legal periódica', icon: '📋' },
    { value: 'NUEVO_INGRESO', label: 'Nuevo ingreso', icon: '🆕' },
    { value: 'REPOSICION_DESGASTE', label: 'Reposición por desgaste', icon: '🔄' },
    { value: 'REPOSICION_PERDIDA', label: 'Reposición por pérdida', icon: '❌' },
    { value: 'CAMBIO_CARGO', label: 'Cambio de cargo', icon: '🔀' },
    { value: 'DETERIORO', label: 'Deterioro', icon: '⚠️' }
  ];

  tiposFinanciero = [
    { value: 'GASTO_OPERATIVO', label: 'Gasto operativo' },
    { value: 'DOTACION_LEGAL', label: 'Dotación legal' },
    { value: 'EPP_SST', label: 'EPP / SST' }
  ];

  constructor(private tesoreriaService: TesoreriaService) {}

  ngOnInit(): void {
    // Load companies from PeopleNet
    this.loadEmpresas();
  }

  /** Cargar empresas desde PeopleNet */
  loadEmpresas(): void {
    this.loadingEmpresas.set(true);
    this.tesoreriaService.getEmpresas().subscribe({
      next: (empresas) => {
        this.empresas.set(empresas);
        this.loadingEmpresas.set(false);
      },
      error: () => this.loadingEmpresas.set(false)
    });
  }

  /** Cuando se selecciona una empresa, cargar sus áreas/sedes */
  onEmpresaChange(empresaId: string): void {
    const selected = this.empresas().find(e => e.id === +empresaId);
    this.formGroup.get('empresaRazonSocial')?.setValue(selected?.nombre || '');
    // Auto-rellenar NIT de la empresa seleccionada
    if (selected?.nit) {
      this.formGroup.get('nit')?.setValue(selected.nit);
    }
    if (empresaId) {
      this.loadingSedes.set(true);
      this.tesoreriaService.getAreasByEmpresa(+empresaId).subscribe({
        next: (areas) => {
          this.sedes.set(areas);
          this.loadingSedes.set(false);
        },
        error: () => this.loadingSedes.set(false)
      });
    } else {
      this.sedes.set([]);
    }
  }

  selectOption(controlName: string, value: string): void {
    this.formGroup.get(controlName)?.setValue(value);
  }

  toggleBoolean(controlName: string): void {
    const current = this.formGroup.get(controlName)?.value;
    this.formGroup.get(controlName)?.setValue(!current);
  }
}
