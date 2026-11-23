import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import {
  Component,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { TesoreriaService } from '../services/tesoreria.service';
import { AuthService } from '../../../core/services/auth.service';
import { ItemGastoModalComponent } from './components/item-gasto-modal/item-gasto-modal.component';

export interface ItemGasto {
  id: number;
  tipoViatico: string;
  fechaGasto: string;
  conceptoDetallado: string;
  valorBase: number;
  aplicaIva: boolean;
  porcentajeIva: number;
  valorIva: number;
  valorTotal: number;
}

export interface SolicitudViaticosRequest {
  tipoEmpresa: string;
  nombreEmpresa: string;
  nit: string;
  centroCosto: string;
  areaDependencia: string;
  ciudad: string;
  nombreCompleto: string;
  cargo: string;
  correoElectronico: string;
  telefonoExt: string;
  items: ItemGasto[];
  observaciones: string;
}

@Component({
  selector: 'app-solicitud-viaticos',
  standalone: true,
  imports: [SelectBuscableDirective,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ItemGastoModalComponent,
  ],
  templateUrl: './solicitud-viaticos.component.html',
  styleUrls: ['./solicitud-viaticos.component.scss'],
})
export class SolicitudViaticosComponent implements OnInit {
  // ── State ──
  empresaForm!: FormGroup;
  solicitanteForm!: FormGroup;
  observaciones = signal('');

  items = signal<ItemGasto[]>([]);
  private nextItemId = 1;

  soportePrincipal = signal<File | null>(null);
  soportesAdicionales = signal<File[]>([]);

  showModal = signal(false);
  isSubmitting = signal(false);
  showSuccess = signal(false);

  ciudades = [
    'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
    'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué',
    'Santa Marta', 'Villavicencio', 'Pasto', 'Montería', 'Neiva',
  ];

  tiposEmpresa = [
    'Persona Natural', 'Persona Jurídica', 'Entidad Pública', 'Mixta',
  ];

  // ── Computed ──
  totalItems = computed(() =>
    this.items().reduce((sum, i) => sum + i.valorTotal, 0)
  );

  subtotalBase = computed(() =>
    this.items().reduce((sum, i) => sum + i.valorBase, 0)
  );

  totalIva = computed(() =>
    this.items().reduce((sum, i) => sum + i.valorIva, 0)
  );

  // Checklist
  empresaCompleta = computed(() => this.empresaForm?.valid ?? false);
  solicitanteCompleto = computed(() => this.solicitanteForm?.valid ?? false);
  tieneItems = computed(() => this.items().length > 0);
  tieneSoportePrincipal = computed(() => this.soportePrincipal() !== null);
  totalMayorCero = computed(() => this.totalItems() > 0);

  constructor(
    private fb: FormBuilder,
    private tesoreriaService: TesoreriaService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.initForms();
    this.prefillFromCurrentUser();
  }

  private initForms(): void {
    this.empresaForm = this.fb.group({
      tipoEmpresa: ['', Validators.required],
      nombreEmpresa: ['', Validators.required],
      nit: ['', Validators.required],
      centroCosto: ['', Validators.required],
      areaDependencia: ['', Validators.required],
      ciudad: ['', Validators.required],
    });

    this.solicitanteForm = this.fb.group({
      nombreCompleto: ['', Validators.required],
      cargo: ['', Validators.required],
      correoElectronico: ['', [Validators.required, Validators.email]],
      telefonoExt: ['', Validators.required],
    });
  }

  private prefillFromCurrentUser(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return;

    const emp = currentUser.employee as any;

    if (!emp && currentUser.employeeId) {
      this.tesoreriaService.getEmployeeById(String(currentUser.employeeId)).subscribe({
        next: (empFromApi) => this.applyEmployeeData(empFromApi, currentUser.username, currentUser.email),
        error: () => this.applyEmployeeData(null, currentUser.username, currentUser.email),
      });
    } else {
      this.applyEmployeeData(emp, currentUser.username, currentUser.email);
    }
  }

  private applyEmployeeData(emp: any, username: string, userEmail: string): void {
    const nombre = emp?.fullName || username || '';
    const email = emp?.corporateEmail || userEmail || '';
    const telefono = emp?.phoneNumber || emp?.phone || '';
    const cargo = emp?.positionName || emp?.jobPosition || '';
    const area = emp?.area || emp?.department || '';
    const empresa = emp?.companyName || '';
    const nit = emp?.companyNit || '';

    this.empresaForm.patchValue({
      nombreEmpresa: empresa,
      nit: nit,
      areaDependencia: area,
    });

    this.solicitanteForm.patchValue({
      nombreCompleto: nombre,
      cargo: cargo,
      correoElectronico: email,
      telefonoExt: telefono,
    });

    // Disable auto-filled fields
    if (nombre) this.solicitanteForm.get('nombreCompleto')?.disable();
    if (email) this.solicitanteForm.get('correoElectronico')?.disable();
    if (telefono) this.solicitanteForm.get('telefonoExt')?.disable();
    if (cargo) this.solicitanteForm.get('cargo')?.disable();
    if (empresa) this.empresaForm.get('nombreEmpresa')?.disable();
    if (nit) this.empresaForm.get('nit')?.disable();
    if (area) this.empresaForm.get('areaDependencia')?.disable();
  }

  // ── Modal ──
  openModal(): void {
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  addItem(item: Omit<ItemGasto, 'id'>): void {
    const newItem: ItemGasto = { ...item, id: this.nextItemId++ };
    this.items.update(list => [...list, newItem]);
    this.showModal.set(false);
  }

  removeItem(id: number): void {
    this.items.update(list => list.filter(i => i.id !== id));
  }

  // ── File handling ──
  onSoportePrincipalChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.soportePrincipal.set(file);
  }

  removeSoportePrincipal(): void {
    this.soportePrincipal.set(null);
  }

  onSoportesAdicionalesChange(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files) {
      this.soportesAdicionales.set(Array.from(files));
    }
  }

  removeSoporteAdicional(index: number): void {
    this.soportesAdicionales.update(list => list.filter((_, i) => i !== index));
  }

  // ── Format ──
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  // ── Submit ──
  canSubmit(): boolean {
    return (
      this.empresaCompleta() &&
      this.solicitanteCompleto() &&
      this.tieneItems() &&
      this.tieneSoportePrincipal() &&
      this.totalMayorCero()
    );
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.isSubmitting.set(true);

    const empresaValues = this.empresaForm.getRawValue();
    const solicitanteValues = this.solicitanteForm.getRawValue();

    const request: SolicitudViaticosRequest = {
      ...empresaValues,
      ...solicitanteValues,
      items: this.items(),
      observaciones: this.observaciones(),
    };

    const formData = new FormData();
    formData.append(
      'solicitud',
      new Blob([JSON.stringify(request)], { type: 'application/json' }),
    );

    const soportePrincipal = this.soportePrincipal();
    if (soportePrincipal) {
      formData.append('soportePrincipal', soportePrincipal);
    }

    this.soportesAdicionales().forEach((file, i) => {
      formData.append('soportesAdicionales', file);
    });

    this.tesoreriaService.createSolicitudViaticos(formData).subscribe({
      next: () => this.handleSuccess(),
      error: (err) => {
        console.error('Error al enviar solicitud de viáticos:', err);
        this.isSubmitting.set(false);
      },
    });
  }

  private handleSuccess(): void {
    this.isSubmitting.set(false);
    this.showSuccess.set(true);
    setTimeout(() => {
      this.showSuccess.set(false);
      this.router.navigate(['/viaticos/mis-solicitudes']);
    }, 2000);
  }

  onCancel(): void {
    this.router.navigate(['/tesoreria/bandeja']);
  }
}
