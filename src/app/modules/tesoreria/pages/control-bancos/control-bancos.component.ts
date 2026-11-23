import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { GpPermisoDirective } from '../../../../features/presupuesto/directives/gp-permiso.directive';
import { PresupuestoContextService } from '../../../../features/presupuesto/services/presupuesto-context.service';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresupuestoService } from '../../../../features/presupuesto/services/presupuesto.service';
import { Empresa } from '../../../../features/presupuesto/models/presupuesto.model';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  trigger,
  style,
  transition,
  animate,
  query,
  stagger,
} from '@angular/animations';
import { BancoService } from '../../services/banco.service';
import { Banco, BancoRequest, DocumentoBanco, TipoCuenta, EstadoBanco } from '../../models/banco.model';

type ModalMode = 'create' | 'edit' | 'view' | 'delete' | null;

@Component({
  selector: 'app-control-bancos',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, ReactiveFormsModule, GpPermisoDirective],
  templateUrl: './control-bancos.component.html',
  styleUrl: './control-bancos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(24px)' }),
        animate('500ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('cardStagger', [
      transition(':enter', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(20px) scale(0.95)' }),
          stagger('100ms', [
            animate('400ms cubic-bezier(0.33, 1, 0.68, 1)',
              style({ opacity: 1, transform: 'translateY(0) scale(1)' })
            ),
          ]),
        ], { optional: true }),
      ]),
    ]),
    trigger('rowAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-12px)' }),
        animate('350ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
    trigger('modalAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0 })),
      ]),
    ]),
    trigger('modalContent', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px) scale(0.95)' }),
        animate('350ms cubic-bezier(0.33, 1, 0.68, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' })
        ),
      ]),
    ]),
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, height: 0, overflow: 'hidden' }),
        animate('300ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, height: '*' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, height: 0 })),
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
  ],
})
export class ControlBancosComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // ═══ SEARCH & FILTER ═══
  searchTerm = '';
  filterTipoCuenta = '';
  filterEstado = '';

  // ═══ MODAL STATE ═══
  modalMode = signal<ModalMode>(null);
  selectedBanco = signal<Banco | null>(null);
  saving = signal(false);
  deleting = signal(false);

  // ═══ FORM ═══
  bancoForm!: FormGroup;
  pendingDocuments: File[] = [];
  formStep = signal<1 | 2>(1);

  // ═══ DATA ═══
  bancos: Banco[] = [];
  empresas: Empresa[] = [];
  loading = signal(true);

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
  readonly tiposDocumento = ['Resolución', 'Certificado', 'Otro'];

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private bancoService: BancoService,
    private gp: PresupuestoService, private ctx: PresupuestoContextService,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.ctx.cargarPermisos();
    this.loadBancos();
    this.gp.empresas().subscribe({next: e => { this.empresas = e; this.cdr.markForCheck(); }, error: () => this.showToast('No se pudieron cargar las empresas autorizadas.', 'error')});
  }

  // ═══ FORM INITIALIZATION ═══
  private initForm(): void {
    this.bancoForm = this.fb.group({
      empresaId: [null, [Validators.required]],
      nombreBanco: ['', [Validators.required]],
      banco: ['', [Validators.required]],
      numeroCuenta: ['', [Validators.required, Validators.minLength(6)]],
      tipoCuenta: ['Corriente', [Validators.required]],
      saldoPrincipal: [0, [Validators.required, Validators.min(0)]],
      titular: ['', [Validators.required]],
      cedula: [''],
      email: ['', [Validators.email]],
      telefono: [''],
      ciudad: [''],
      sucursal: [''],
      fechaApertura: ['', [Validators.required]],
      notas: [''],
      estado: ['Activo'],
    });
  }

  // ═══ DATA LOADING ═══
  private loadBancos(): void {
    this.loading.set(true);
    this.bancoService.getBancos().subscribe({
      next: (bancos) => {
        this.bancos = bancos;
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.bancos = [];
        this.showToast('No se pudieron cargar las cuentas bancarias. Reintente la consulta.', 'error');
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // ═══ COMPUTED STATS ═══
  get totalSaldo(): number {
    return this.bancos.reduce((acc, b) => acc + (b.saldoPrincipal || 0), 0);
  }

  get totalSaldoActual(): number {
    return this.bancos.reduce((acc, b) => acc + (b.saldoActual || b.saldoPrincipal || 0), 0);
  }

  get activosCount(): number {
    return this.bancos.filter(b => b.estado === 'Activo').length;
  }

  get inactivosCount(): number {
    return this.bancos.filter(b => b.estado === 'Inactivo').length;
  }

  get filteredBancos(): Banco[] {
    let result = [...this.bancos];

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(b =>
        b.nombreBanco.toLowerCase().includes(term) ||
        b.numeroCuenta.toLowerCase().includes(term) ||
        (b.titular && b.titular.toLowerCase().includes(term)) ||
        (b.banco && b.banco.toLowerCase().includes(term))
      );
    }

    if (this.filterTipoCuenta) {
      result = result.filter(b => b.tipoCuenta === this.filterTipoCuenta);
    }

    if (this.filterEstado) {
      result = result.filter(b => b.estado === this.filterEstado);
    }

    return result;
  }

  // ═══ MODAL ACTIONS ═══
  openCreateModal(): void {
    this.router.navigate(['/tesoreria/crear-banco']);
  }

  openEditModal(banco: Banco): void {
    this.selectedBanco.set(banco);
    this.bancoForm.patchValue({
      empresaId: banco.empresaId ?? null,
      nombreBanco: banco.nombreBanco,
      banco: banco.banco,
      numeroCuenta: banco.numeroCuenta,
      tipoCuenta: banco.tipoCuenta,
      saldoPrincipal: banco.saldoPrincipal,
      titular: banco.titular,
      cedula: banco.cedula || '',
      email: banco.email || '',
      telefono: banco.telefono || '',
      ciudad: banco.ciudad || '',
      sucursal: banco.sucursal || '',
      fechaApertura: banco.fechaApertura,
      notas: banco.notas || '',
      estado: banco.estado,
    });
    this.pendingDocuments = [];
    this.formStep.set(1);
    this.modalMode.set('edit');
  }

  openViewModal(banco: Banco): void {
    this.selectedBanco.set(banco);
    this.modalMode.set('view');
  }

  openDeleteModal(banco: Banco): void {
    this.selectedBanco.set(banco);
    this.modalMode.set('delete');
  }

  closeModal(): void {
    this.modalMode.set(null);
    this.selectedBanco.set(null);
    this.pendingDocuments = [];
    this.formStep.set(1);
  }

  // ═══ FORM STEPS ═══
  nextStep(): void {
    if (this.formStep() === 1) {
      // Validate step 1 fields
      const step1Fields = ['empresaId', 'nombreBanco', 'banco', 'numeroCuenta', 'tipoCuenta', 'saldoPrincipal', 'fechaApertura'];
      let valid = true;
      step1Fields.forEach(field => {
        const ctrl = this.bancoForm.get(field);
        ctrl?.markAsTouched();
        if (ctrl?.invalid) valid = false;
      });
      if (valid) this.formStep.set(2);
    }
  }

  prevStep(): void {
    if (this.formStep() === 2) this.formStep.set(1);
  }

  // ═══ SAVE (CREATE / UPDATE) ═══
  saveBanco(): void {
    if (this.bancoForm.invalid) {
      this.bancoForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const formValue = this.bancoForm.value;

    const request: BancoRequest = {
      empresaId: formValue.empresaId,
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

    if (this.modalMode() === 'create') {
      this.bancoService.createBanco(request, this.pendingDocuments).subscribe({
        next: (newBanco) => {
          this.bancos = [...this.bancos, newBanco];
          this.saving.set(false);
          this.closeModal();
          this.showToast('Banco creado exitosamente', 'success');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.saving.set(false);
          this.showToast('Error al crear el banco. Intente nuevamente.', 'error');
          this.cdr.markForCheck();
        },
      });
    } else if (this.modalMode() === 'edit') {
      const id = this.selectedBanco()!.id;
      this.bancoService.updateBanco(id, request, this.pendingDocuments).subscribe({
        next: (updated) => {
          const idx = this.bancos.findIndex(b => b.id === id);
          if (idx !== -1) {
            this.bancos[idx] = updated;
            this.bancos = [...this.bancos];
          }
          this.saving.set(false);
          this.closeModal();
          this.showToast('Banco actualizado exitosamente', 'success');
          this.cdr.markForCheck();
        },
        error: () => {
          this.saving.set(false);
          this.showToast('Error al actualizar el banco.', 'error');
          this.cdr.markForCheck();
        },
      });
    }
  }

  // ═══ DELETE ═══
  confirmDelete(): void {
    const banco = this.selectedBanco();
    if (!banco) return;

    this.deleting.set(true);
    this.bancoService.deleteBanco(banco.id).subscribe({
      next: () => {
        this.bancos = this.bancos.filter(b => b.id !== banco.id);
        this.deleting.set(false);
        this.closeModal();
        this.showToast(`Banco "${banco.nombreBanco}" eliminado correctamente`, 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.deleting.set(false);
        this.showToast(err?.error?.message ?? 'Error al eliminar el banco.', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  // ═══ TOGGLE ESTADO ═══
  toggleEstado(banco: Banco): void {
    this.bancoService.toggleEstado(banco.id).subscribe({
      next: (updated) => {
        const idx = this.bancos.findIndex(b => b.id === banco.id);
        if (idx !== -1) {
          this.bancos[idx] = updated;
          this.bancos = [...this.bancos];
        }
        this.showToast(`Estado actualizado a ${updated.estado}`, 'info');
        this.cdr.markForCheck();
      },
      error: () => {
        this.showToast('Error al cambiar estado.', 'error');
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

  // ═══ NAVIGATION ═══
  revisarCuenta(banco: Banco): void {
    this.router.navigate(['/tesoreria/control-diario-pagos', banco.id]);
  }

  // ═══ HELPERS ═══
  getBancoInitials(nombre: string): string {
    return nombre
      .split(' ')
      .map(w => w.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  getBancoColor(id: number): string {
    const colors = [
      'from-blue-500 to-blue-700',
      'from-emerald-500 to-emerald-700',
      'from-red-500 to-red-700',
      'from-indigo-500 to-indigo-700',
      'from-amber-500 to-amber-700',
      'from-purple-500 to-purple-700',
      'from-cyan-500 to-cyan-700',
      'from-pink-500 to-pink-700',
    ];
    return colors[(id - 1) % colors.length];
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.bancoForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
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

  trackByBancoId(index: number, item: Banco): number {
    return item.id;
  }
}
