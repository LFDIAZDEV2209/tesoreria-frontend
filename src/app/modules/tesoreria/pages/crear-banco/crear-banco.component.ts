import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import {
  trigger,
  style,
  transition,
  animate,
  query,
  stagger,
  keyframes,
  state,
} from '@angular/animations';
import { BancoService } from '../../services/banco.service';
import { BancoRequest, TipoCuenta } from '../../models/banco.model';

@Component({
  selector: 'app-crear-banco',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './crear-banco.component.html',
  styleUrl: './crear-banco.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('pageEnter', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('600ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1 })),
      ]),
    ]),
    trigger('slideInLeft', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-40px)' }),
        animate('600ms 100ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
    trigger('slideInRight', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(40px)' }),
        animate('600ms 200ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('500ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('staggerIn', [
      transition(':enter', [
        query('.stagger-item', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger('80ms', [
            animate('400ms cubic-bezier(0.33, 1, 0.68, 1)',
              style({ opacity: 1, transform: 'translateY(0)' })
            ),
          ]),
        ], { optional: true }),
      ]),
    ]),
    trigger('cardFloat', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(40px) scale(0.95)' }),
        animate('700ms 150ms cubic-bezier(0.33, 1, 0.68, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' })
        ),
      ]),
    ]),
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, height: 0, overflow: 'hidden' }),
        animate('400ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, height: '*' })),
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, height: 0 })),
      ]),
    ]),
    trigger('stepTransition', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(60px) scale(0.96)' }),
        animate('500ms cubic-bezier(0.33, 1, 0.68, 1)',
          style({ opacity: 1, transform: 'translateX(0) scale(1)' })
        ),
      ]),
      transition(':leave', [
        animate('300ms ease-in',
          style({ opacity: 0, transform: 'translateX(-60px) scale(0.96)' })
        ),
      ]),
    ]),
    trigger('toastAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(100%) scale(0.8)' }),
        animate('400ms cubic-bezier(0.33, 1, 0.68, 1)',
          style({ opacity: 1, transform: 'translateX(0) scale(1)' })
        ),
      ]),
      transition(':leave', [
        animate('250ms ease-in', style({ opacity: 0, transform: 'translateX(100%) scale(0.8)' })),
      ]),
    ]),
    trigger('successAnimation', [
      transition(':enter', [
        animate('800ms cubic-bezier(0.33, 1, 0.68, 1)', keyframes([
          style({ opacity: 0, transform: 'scale(0.3) rotate(-10deg)', offset: 0 }),
          style({ opacity: 0.7, transform: 'scale(1.1) rotate(3deg)', offset: 0.6 }),
          style({ opacity: 1, transform: 'scale(1) rotate(0)', offset: 1 }),
        ])),
      ]),
    ]),
  ],
})
export class CrearBancoComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // ═══ FORM ═══
  bancoForm!: FormGroup;
  pendingDocuments: File[] = [];
  formStep = signal<1 | 2 | 3>(1);
  saving = signal(false);
  created = signal(false);

  // ═══ TOAST ═══
  toasts: { id: number; message: string; type: 'success' | 'error' | 'info' }[] = [];
  private toastCounter = 0;

  // ═══ BANK OPTIONS ═══
  readonly entidadesBancarias = [
    'Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA Colombia',
    'Banco Popular', 'Banco de Occidente', 'Scotiabank Colpatria',
    'Banco AV Villas', 'Banco Caja Social', 'Banco Agrario',
    'Itaú', 'GNB Sudameris', 'Banco Pichincha', 'Banco Falabella',
    'Bancoomeva', 'Banco Finandina', 'Nequi', 'Daviplata'
  ];

  readonly tiposCuenta: TipoCuenta[] = ['Ahorros', 'Corriente'];

  // ═══ BANK LOGOS MAP ═══
  readonly bankLogos: Record<string, string> = {
    'Bancolombia': '#FFCD00',
    'Banco de Bogotá': '#003DA6',
    'Davivienda': '#ED1C24',
    'BBVA Colombia': '#004481',
    'Banco Popular': '#005AA7',
    'Banco de Occidente': '#00529B',
    'Scotiabank Colpatria': '#EC111A',
    'Banco AV Villas': '#E31937',
    'Banco Caja Social': '#009639',
    'Banco Agrario': '#007B3A',
    'Itaú': '#FF6200',
    'GNB Sudameris': '#003DA6',
    'Banco Pichincha': '#FFD100',
    'Banco Falabella': '#BDD100',
    'Bancoomeva': '#0066B2',
    'Banco Finandina': '#0A2F5C',
    'Nequi': '#B20078',
    'Daviplata': '#ED1C24',
  };

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private bancoService: BancoService,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit(): void {}

  private initForm(): void {
    this.bancoForm = this.fb.group({
      nombreBanco: [''],
      banco: [''],
      numeroCuenta: [''],
      tipoCuenta: ['Corriente'],
      saldoPrincipal: [0],
      titular: [''],
      cedula: [''],
      email: [''],
      telefono: [''],
      ciudad: [''],
      sucursal: [''],
      fechaApertura: [new Date().toISOString().split('T')[0]],
      notas: [''],
      estado: ['Activo'],
    });
  }

  // ═══ NAVIGATION ═══
  goBack(): void {
    this.router.navigate(['/tesoreria/control-bancos']);
  }

  // ═══ STEP NAVIGATION ═══
  goToStep(step: 1 | 2 | 3): void {
    if (step < this.formStep()) {
      this.formStep.set(step);
    }
  }

  nextStep(): void {
    if (this.formStep() === 1) {
      this.formStep.set(2);
    } else if (this.formStep() === 2) {
      this.formStep.set(3);
    }
  }

  prevStep(): void {
    if (this.formStep() === 2) this.formStep.set(1);
    else if (this.formStep() === 3) this.formStep.set(2);
  }

  // ═══ COMPLETION PERCENTAGE ═══
  get completionPercentage(): number {
    const fields = Object.keys(this.bancoForm.controls);
    let filled = 0;
    fields.forEach(f => {
      const val = this.bancoForm.get(f)?.value;
      if (val !== null && val !== '' && val !== undefined) filled++;
    });
    return Math.round((filled / fields.length) * 100);
  }

  // ═══ SAVE ═══
  saveBanco(): void {
    this.saving.set(true);
    const formValue = this.bancoForm.value;

    const request: BancoRequest = {
      nombreBanco: formValue.nombreBanco,
      numeroCuenta: formValue.numeroCuenta,
      tipoCuenta: formValue.tipoCuenta,
      saldoPrincipal: formValue.saldoPrincipal,
      banco: formValue.banco,
      titular: formValue.titular,
      cedula: formValue.cedula,
      email: formValue.email,
      telefono: formValue.telefono,
      ciudad: formValue.ciudad,
      sucursal: formValue.sucursal,
      fechaApertura: formValue.fechaApertura,
      estado: formValue.estado,
      notas: formValue.notas,
      activo: formValue.estado === 'Activo',
    };

    this.bancoService.createBanco(request, this.pendingDocuments).subscribe({
      next: () => {
        this.saving.set(false);
        this.created.set(true);
        this.showToast('Banco creado exitosamente', 'success');
        this.cdr.markForCheck();
        setTimeout(() => {
          this.router.navigate(['/tesoreria/control-bancos']);
        }, 2500);
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al crear el banco. Intente nuevamente.', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  // ═══ DOCUMENTS ═══
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const files = Array.from(input.files);
      this.pendingDocuments = [...this.pendingDocuments, ...files];
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  removeFile(index: number): void {
    this.pendingDocuments.splice(index, 1);
    this.pendingDocuments = [...this.pendingDocuments];
    this.cdr.markForCheck();
  }

  getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext || '')) return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';
    if (['doc', 'docx'].includes(ext || '')) return 'word';
    if (['xls', 'xlsx'].includes(ext || '')) return 'excel';
    return 'file';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ═══ HELPERS ═══
  isFieldInvalid(fieldName: string): boolean {
    const field = this.bancoForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  isFieldValid(fieldName: string): boolean {
    const field = this.bancoForm.get(fieldName);
    return !!(field && field.valid && field.touched && field.value);
  }

  getSelectedBankColor(): string {
    const banco = this.bancoForm.get('banco')?.value;
    return this.bankLogos[banco] || '#045C94';
  }

  getSelectedBankInitials(): string {
    const banco = this.bancoForm.get('banco')?.value;
    if (!banco) return '?';
    return banco.split(' ').map((w: string) => w.charAt(0)).join('').substring(0, 2).toUpperCase();
  }

  // ═══ TOASTS ═══
  showToast(message: string, type: 'success' | 'error' | 'info'): void {
    const id = ++this.toastCounter;
    this.toasts.push({ id, message, type });
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id);
      this.cdr.markForCheck();
    }, 4000);
  }

  removeToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }
}
