import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { normalizarOpcion } from '../../../core/ui/select-buscable/select-buscable-panel.component';
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ProveedorService } from '../services/proveedor.service';
import {
  RetencionFuenteService,
  ConfiguracionRetencion,
} from '../services/retencion-fuente.service';
import { ReteicaService } from '../../../services/reteica.service';
import { ReteicaTarifaResponse } from '../../../models/reteica.models';
import {
  Proveedor,
  StatsProveedores,
  FORMAS_PAGO,
  BANCOS_COLOMBIA,
  CONCEPTOS_PROVEEDOR,
  TIPOS_PERSONA,
  TIPOS_CONTRIBUYENTE,
  TIPOS_CUENTA,
  CuentaBancaria,
} from '../models/proveedor.model';

@Component({
  selector: 'app-gestion-proveedores',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './gestion-proveedores.component.html',
  styleUrl: './gestion-proveedores.component.scss',
})
export class GestionProveedoresComponent implements OnInit {
  // ── State signals ──
  proveedores = signal<Proveedor[]>([]);
  stats = signal<StatsProveedores>({
    totalProveedores: 0,
    proveedoresActivos: 0,
    proveedoresInactivos: 0,
    proveedoresMes: 0,
  });
  loading = signal(true);
  searchTerm = signal('');
  filterEstado = signal<'TODOS' | 'ACTIVO' | 'INACTIVO'>('TODOS');
  filterBanco = signal<string>('TODOS');
  filterConcepto = signal<string>('TODOS');
  filterFormaPago = signal<string>('TODOS');
  showFilters = signal(false);
  showModal = signal(false);
  showDetailModal = signal(false);
  editMode = signal(false);
  selectedProveedor = signal<Proveedor | null>(null);
  currentStep = signal(1);
  saving = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  animateCards = signal(false);
  openMenuId = signal<number | null>(null);

  // ── Pagination ──
  currentPage = signal(1);
  pageSize = signal(10);
  pageSizeOptions = [5, 10, 20, 50];

  // ── File uploads ──
  rutFile = signal<File | null>(null);
  camaraFile = signal<File | null>(null);
  ccFile = signal<File | null>(null);
  certFile = signal<File | null>(null);
  rutRepresentanteFile = signal<File | null>(null);
  estadosFinancierosFile = signal<File | null>(null);

  // ── Constants ──
  formasPago = FORMAS_PAGO;
  bancos = BANCOS_COLOMBIA;
  conceptos = CONCEPTOS_PROVEEDOR;
  tiposPersona = TIPOS_PERSONA;
  tiposContribuyente = TIPOS_CONTRIBUYENTE;
  tiposCuenta = TIPOS_CUENTA;
  configuracionesRetencion = signal<ConfiguracionRetencion[]>([]);
  showRetencionDropdown = signal(false);
  busquedaRetencion = signal('');
  retencionesFiltradas = computed(() => {
    const palabras = normalizarOpcion(this.busquedaRetencion()).split(/\s+/);
    return this.configuracionesRetencion().filter(c => {
      const texto = normalizarOpcion(`${this.getTipoRetencionLabel(c.conceptoRetencion)} ${this.getTipoOperacionRetencionLabel(c.tipoOperacion)} ${this.getTipoPersonaRetencionLabel(c.tipoPersona)} ${c.baseMinimaUvt} ${c.tarifaRetencion}`);
      return palabras.every(p => texto.includes(p));
    });
  });

  // ── ReteICA ──
  reteicaMunicipios = signal<string[]>([]);
  reteicaTarifas = signal<ReteicaTarifaResponse[]>([]);
  showReteicaDropdown = signal(false);
  reteicaMunicipioFilter = signal('');
  loadingReteicaTarifas = signal(false);
  busquedaReteica = signal('');
  reteicaTarifasFiltradas = computed(() => {
    const palabras = normalizarOpcion(this.busquedaReteica()).split(/\s+/);
    return this.reteicaTarifas().filter(t => {
      const texto = normalizarOpcion(`${t.actividadEconomica} ${t.codigoActividad ?? ''} ${t.municipio} ${t.tarifaPorMil}`);
      return palabras.every(p => texto.includes(p));
    });
  });

  // ── Cuentas bancarias adicionales ──
  cuentasBancarias = signal<CuentaBancaria[]>([]);
  trackByIndex = (index: number) => index;


  // ── Form ──
  proveedorForm!: FormGroup;

  // ── Computed filtered list ──
  filteredProveedores = computed(() => {
    let list = this.proveedores();
    const search = this.searchTerm().toLowerCase();
    const estado = this.filterEstado();
    const banco = this.filterBanco();
    const concepto = this.filterConcepto();
    const formaPago = this.filterFormaPago();

    if (search) {
      list = list.filter(
        (p) =>
          p.nombreProveedor?.toLowerCase().includes(search) ||
          p.nit?.toLowerCase().includes(search) ||
          p.banco?.toLowerCase().includes(search) ||
          p.concepto?.toLowerCase().includes(search) ||
          p.correoElectronico?.toLowerCase().includes(search),
      );
    }

    if (estado !== 'TODOS') {
      list = list.filter((p) => p.estado === estado);
    }

    if (banco !== 'TODOS') {
      list = list.filter((p) => p.banco === banco);
    }

    if (concepto !== 'TODOS') {
      list = list.filter((p) => p.concepto === concepto);
    }

    if (formaPago !== 'TODOS') {
      list = list.filter((p) => p.formaPago === formaPago);
    }

    return list;
  });

  // ── Paginated list ──
  paginatedProveedores = computed(() => {
    const list = this.filteredProveedores();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  totalPages = computed(() => {
    return Math.ceil(this.filteredProveedores().length / this.pageSize()) || 1;
  });

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.filterEstado() !== 'TODOS') count++;
    if (this.filterBanco() !== 'TODOS') count++;
    if (this.filterConcepto() !== 'TODOS') count++;
    if (this.filterFormaPago() !== 'TODOS') count++;
    return count;
  });

  constructor(
    private fb: FormBuilder,
    private proveedorService: ProveedorService,
    private retencionFuenteService: RetencionFuenteService,
    private reteicaService: ReteicaService,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadTiposRetencion();
    this.loadReteicaMunicipios();
    this.loadData();
    setTimeout(() => this.animateCards.set(true), 100);
  }

  private loadTiposRetencion(): void {
    const currentYear = new Date().getFullYear();
    this.retencionFuenteService
      .getConfiguracionesByAnio(currentYear)
      .subscribe({
        next: (configs) => {
          const sorted = [...configs]
            .filter(
              (c) => c.conceptoRetencion && c.tipoOperacion && c.tipoPersona,
            )
            .sort((a, b) => {
              const aKey = `${a.conceptoRetencion}|${a.tipoOperacion}|${a.tipoPersona}`;
              const bKey = `${b.conceptoRetencion}|${b.tipoOperacion}|${b.tipoPersona}`;
              return aKey.localeCompare(bKey);
            });
          this.configuracionesRetencion.set(sorted);

          if (this.editMode() && this.selectedProveedor()) {
            this.proveedorForm.patchValue({
              configuracionRetencionId: this.findConfiguracionRetencionId(
                this.selectedProveedor()!.conceptoRetencion,
                this.selectedProveedor()!.tipoPersona,
              ),
            });
          }
        },
        error: () => this.configuracionesRetencion.set([]),
      });
  }

  private initForm(): void {
    this.proveedorForm = this.fb.group({
      // Step 1: Información General
      nombreProveedor: ['', [Validators.required, Validators.minLength(3)]],
      nit: ['', Validators.required],
      direccion: [''],
      telefono: [''],
      correoElectronico: ['', [Validators.email]],
      nombreRepresentanteLegal: [''],
      cedulaRepresentanteLegal: [''],

      // Step 1: Información Tributaria (Rete Fuente)
      tipoPersona: ['PERSONA_JURIDICA'],
      tipoContribuyente: ['REGIMEN_COMUN'],
      actividadEconomica: [''],
      responsableIva: [false],
      autorretenedor: [false],
      sujetoRetencion: [true],
      conceptoRetencion: [''],
      configuracionRetencionId: [null],
      // ReteICA
      reteicaTarifaId: [null],
      reteIca: [null],

      // Step 2: Datos de Pago
      condicionesPago: [''],
      numeroCuenta: ['', Validators.required],
      banco: ['', Validators.required],
      formaPago: ['TRANSFERENCIA', Validators.required],
      concepto: ['', Validators.required],
      numeroComprobante: [''],
    });
  }

  refreshData(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    this.proveedorService.getProveedores().subscribe({
      next: (data) => {
        this.proveedores.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.proveedores.set([]);
        this.loading.set(false);
      },
    });
    this.proveedorService.getStats().subscribe({
      next: (s) => this.stats.set(s),
    });
  }

  // ── Modal actions ──

  openCreateModal(): void {
    this.editMode.set(false);
    this.proveedorForm.reset({
      formaPago: 'TRANSFERENCIA',
      tipoPersona: 'PERSONA_JURIDICA',
      tipoContribuyente: 'REGIMEN_COMUN',
      responsableIva: false,
      autorretenedor: false,
      sujetoRetencion: true,
      conceptoRetencion: '',
      configuracionRetencionId: null,
      reteicaTarifaId: null,
      reteIca: null,
    });
    this.currentStep.set(1);
    this.showRetencionDropdown.set(false);
    this.showReteicaDropdown.set(false);
    this.reteicaMunicipioFilter.set('');
    this.reteicaTarifas.set([]);
    this.clearFiles();
    this.cuentasBancarias.set([]);
    this.showModal.set(true);
  }

  openEditModal(p: Proveedor): void {
    this.editMode.set(true);
    this.selectedProveedor.set(p);
    this.proveedorForm.patchValue({
      nombreProveedor: p.nombreProveedor,
      nit: p.nit,
      direccion: p.direccion,
      telefono: p.telefono,
      correoElectronico: p.correoElectronico,
      nombreRepresentanteLegal: p.nombreRepresentanteLegal,
      cedulaRepresentanteLegal: p.cedulaRepresentanteLegal,
      tipoPersona: p.tipoPersona || 'PERSONA_JURIDICA',
      tipoContribuyente: p.tipoContribuyente || 'REGIMEN_COMUN',
      actividadEconomica: p.actividadEconomica || '',
      responsableIva: p.responsableIva || false,
      autorretenedor: p.autorretenedor || false,
      sujetoRetencion: p.sujetoRetencion !== false,
      conceptoRetencion: p.conceptoRetencion || '',
      configuracionRetencionId: p.configuracionRetencionId || null,
      reteicaTarifaId: p.reteicaTarifaId || null,
      reteIca: p.reteIca || null,
      condicionesPago: p.condicionesPago,
      numeroCuenta: p.numeroCuenta,
      banco: p.banco,
      formaPago: p.formaPago,
      concepto: p.concepto,
      numeroComprobante: p.numeroComprobante,
    });
    this.currentStep.set(1);
    this.showRetencionDropdown.set(false);
    this.showReteicaDropdown.set(false);
    if (p.reteicaMunicipio) {
      this.reteicaMunicipioFilter.set(p.reteicaMunicipio);
      this.loadReteicaTarifasByMunicipio(p.reteicaMunicipio);
    } else {
      this.reteicaMunicipioFilter.set('');
      this.reteicaTarifas.set([]);
    }
    this.clearFiles();
    // Load additional bank accounts
    try {
      const cuentas = p.cuentasBancarias
        ? (typeof p.cuentasBancarias === 'string' ? JSON.parse(p.cuentasBancarias as any) : p.cuentasBancarias)
        : [];
      this.cuentasBancarias.set(cuentas);
    } catch {
      this.cuentasBancarias.set([]);
    }
    this.showModal.set(true);
  }

  openDetail(p: Proveedor): void {
    this.selectedProveedor.set(p);
    this.showDetailModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.showDetailModal.set(false);
    this.selectedProveedor.set(null);
    this.showRetencionDropdown.set(false);
  }

  // ── Step navigation ──

  nextStep(): void {
    if (this.currentStep() < 3) {
      this.currentStep.update((s) => s + 1);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update((s) => s - 1);
    }
  }

  canAdvance(): boolean {
    if (this.currentStep() === 1) {
      const c = this.proveedorForm.controls;
      return c['nombreProveedor'].valid && c['nit'].valid;
    }
    if (this.currentStep() === 2) {
      const c = this.proveedorForm.controls;
      return (
        c['numeroCuenta'].valid &&
        c['banco'].valid &&
        c['formaPago'].valid &&
        c['concepto'].valid
      );
    }
    return true;
  }

  // ── File handling ──

  onFileSelected(event: Event, type: 'rut' | 'camara' | 'cc' | 'cert' | 'rutRepresentante' | 'estadosFinancieros'): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      switch (type) {
        case 'rut':
          this.rutFile.set(file);
          break;
        case 'camara':
          this.camaraFile.set(file);
          break;
        case 'cc':
          this.ccFile.set(file);
          break;
        case 'cert':
          this.certFile.set(file);
          break;
        case 'rutRepresentante':
          this.rutRepresentanteFile.set(file);
          break;
        case 'estadosFinancieros':
          this.estadosFinancierosFile.set(file);
          break;
      }
    }
  }

  removeFile(type: 'rut' | 'camara' | 'cc' | 'cert' | 'rutRepresentante' | 'estadosFinancieros'): void {
    switch (type) {
      case 'rut':
        this.rutFile.set(null);
        break;
      case 'camara':
        this.camaraFile.set(null);
        break;
      case 'cc':
        this.ccFile.set(null);
        break;
      case 'cert':
        this.certFile.set(null);
        break;
      case 'rutRepresentante':
        this.rutRepresentanteFile.set(null);
        break;
      case 'estadosFinancieros':
        this.estadosFinancierosFile.set(null);
        break;
    }
  }

  private clearFiles(): void {
    this.rutFile.set(null);
    this.camaraFile.set(null);
    this.ccFile.set(null);
    this.certFile.set(null);
    this.rutRepresentanteFile.set(null);
    this.estadosFinancierosFile.set(null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent, type: 'rut' | 'camara' | 'cc' | 'cert' | 'rutRepresentante' | 'estadosFinancieros'): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.files?.length) {
      const file = event.dataTransfer.files[0];
      switch (type) {
        case 'rut':
          this.rutFile.set(file);
          break;
        case 'camara':
          this.camaraFile.set(file);
          break;
        case 'cc':
          this.ccFile.set(file);
          break;
        case 'cert':
          this.certFile.set(file);
          break;
        case 'rutRepresentante':
          this.rutRepresentanteFile.set(file);
          break;
        case 'estadosFinancieros':
          this.estadosFinancierosFile.set(file);
          break;
      }
    }
  }

  // ── Cuentas Bancarias ──

  addCuentaBancaria(): void {
    this.cuentasBancarias.update(list => [
      ...list,
      { banco: '', numeroCuenta: '', tipoCuenta: 'AHORROS', esPrincipal: false },
    ]);
  }

  removeCuentaBancaria(index: number): void {
    this.cuentasBancarias.update(list => list.filter((_, i) => i !== index));
  }

  updateCuentaBancaria(index: number, field: keyof CuentaBancaria, value: any): void {
    this.cuentasBancarias.update(list =>
      list.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
  }

  // ── Save ──

  saveProveedor(): void {
    if (this.proveedorForm.invalid) return;
    this.saving.set(true);
    this.errorMessage.set('');

    const data = this.proveedorForm.value;
    const payload = {
      ...data,
      cuentasBancarias: this.cuentasBancarias().length > 0 ? JSON.stringify(this.cuentasBancarias()) : null,
    };

    // Enviar configuracionRetencionId al backend (el backend resolverá tipoPersona/conceptoRetencion)
    // Si viene null, el backend limpiará la relación

    const archivos = {
      rut: this.rutFile() || undefined,
      camaraComercio: this.camaraFile() || undefined,
      ccRepresentante: this.ccFile() || undefined,
      certificadoBancario: this.certFile() || undefined,
      rutRepresentante: this.rutRepresentanteFile() || undefined,
      estadosFinancieros: this.estadosFinancierosFile() || undefined,
    };

    const obs =
      this.editMode() && this.selectedProveedor()?.id
        ? this.proveedorService.updateProveedor(
            this.selectedProveedor()!.id!,
            payload,
            archivos,
          )
        : this.proveedorService.createProveedor(payload, archivos);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.showModal.set(false);
        this.successMessage.set(
          this.editMode()
            ? 'Proveedor actualizado exitosamente'
            : 'Proveedor creado exitosamente',
        );
        this.loadData();
        setTimeout(() => this.successMessage.set(''), 4000);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(
          'Error al guardar el proveedor. Intente nuevamente.',
        );
        console.error('Error saving proveedor:', err);
      },
    });
  }

  // ── Actions ──

  toggleEstado(p: Proveedor): void {
    if (!p.id) return;
    this.proveedorService.toggleEstado(p.id).subscribe({
      next: () => this.loadData(),
    });
  }

  deleteProveedor(p: Proveedor): void {
    if (!p.id) return;
    if (
      confirm(`¿Está seguro de eliminar al proveedor "${p.nombreProveedor}"?`)
    ) {
      this.proveedorService.deleteProveedor(p.id).subscribe({
        next: () => {
          this.successMessage.set('Proveedor eliminado exitosamente');
          this.loadData();
          setTimeout(() => this.successMessage.set(''), 4000);
        },
      });
    }
  }

  getFormaPagoLabel(value: string): string {
    return FORMAS_PAGO.find((f) => f.value === value)?.label || value;
  }

  getFormaPagoIcon(value: string): string {
    return FORMAS_PAGO.find((f) => f.value === value)?.icon || '💳';
  }

  getTipoPersonaLabel(value: string): string {
    return TIPOS_PERSONA.find((t) => t.value === value)?.label || value || '—';
  }

  getTipoContribuyenteLabel(value: string): string {
    return (
      TIPOS_CONTRIBUYENTE.find((t) => t.value === value)?.label || value || '—'
    );
  }

  getTipoRetencionLabel(value: string): string {
    const labels: { [key: string]: string } = {
      COMPRAS_GENERALES: 'Compras Generales',
      COMPRAS_TARJETA: 'Compras Tarjeta Déb/Créd',
      SERVICIOS_GENERALES: 'Servicios Generales',
      HONORARIOS: 'Honorarios',
      COMISIONES: 'Comisiones',
      CONSULTORIA: 'Consultoría',
      ARRENDAMIENTO_INMUEBLES: 'Arrend. Inmuebles',
      ARRENDAMIENTO_MUEBLES: 'Arrend. Muebles',
      TRANSPORTE_CARGA: 'Transporte Carga',
      TRANSPORTE_PASAJEROS: 'Transporte Pasajeros',
      OTROS_INGRESOS: 'Otros Ingresos',
      CONTRATOS_CONSTRUCCION: 'Contratos Construcción',
      HOTELES_RESTAURANTES: 'Hoteles y Restaurantes',
      LICENCIAMIENTO_SOFTWARE: 'Licenciamiento Software',
      SERVICIOS_TEMPORALES: 'Servicios Temporales (AIU)',
      VIGILANCIA_ASEO: 'Vigilancia y Aseo (AIU)',
    };
    return labels[value] || value || '—';
  }

  getTipoOperacionRetencionLabel(value: string): string {
    const labels: { [key: string]: string } = {
      COMPRAS: 'Compras',
      SERVICIOS: 'Servicios',
      HONORARIOS: 'Honorarios',
      ARRENDAMIENTOS: 'Arrendamientos',
      COMISIONES: 'Comisiones',
      TRANSPORTE: 'Transporte',
      OTROS: 'Otros',
      BIENES: 'Bienes',
      IVA: 'IVA',
    };
    return labels[value] || value || '—';
  }

  getTipoPersonaRetencionLabel(value: string): string {
    const labels: { [key: string]: string } = {
      PERSONA_JURIDICA: 'Persona Jurídica',
      PERSONA_NATURAL_DECLARANTE: 'Persona Natural Declarante',
      PERSONA_NATURAL_NO_DECLARANTE: 'Persona Natural No Declarante',
    };
    return labels[value] || value || '—';
  }

  getSelectedRetencionDisplay(): string {
    const selectedId = this.proveedorForm?.get(
      'configuracionRetencionId',
    )?.value;
    if (!selectedId) return 'Seleccione tipo de retención';

    const selected = this.configuracionesRetencion().find(
      (config) => config.id === selectedId,
    );

    if (!selected) return 'Seleccione tipo de retención';

    return `${this.getTipoRetencionLabel(selected.conceptoRetencion)} · ${this.getTipoOperacionRetencionLabel(selected.tipoOperacion)} · ${this.getTipoPersonaRetencionLabel(selected.tipoPersona)}`;
  }

  selectRetencion(config: ConfiguracionRetencion): void {
    this.proveedorForm.patchValue({
      configuracionRetencionId: config.id,
      conceptoRetencion: config.conceptoRetencion,
    });
    this.showRetencionDropdown.set(false);
  }

  clearRetencionSelection(): void {
    this.proveedorForm.patchValue({
      configuracionRetencionId: null,
      conceptoRetencion: '',
    });
    this.showRetencionDropdown.set(false);
  }

  toggleRetencionDropdown(): void {
    this.busquedaRetencion.set('');
    this.showRetencionDropdown.update((value) => !value);
  }

  private findConfiguracionRetencionId(
    conceptoRetencion?: string,
    tipoPersona?: string,
  ): number | null {
    if (!conceptoRetencion) return null;

    const match = this.configuracionesRetencion().find(
      (config) =>
        config.conceptoRetencion === conceptoRetencion &&
        (!tipoPersona || config.tipoPersona === tipoPersona),
    );

    return match?.id ?? null;
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  setFilter(estado: 'TODOS' | 'ACTIVO' | 'INACTIVO'): void {
    this.filterEstado.set(estado);
  }

  onFilterChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value as
      | 'TODOS'
      | 'ACTIVO'
      | 'INACTIVO';
    this.filterEstado.set(val);
    this.currentPage.set(1);
  }

  onBancoFilterChange(event: Event): void {
    this.filterBanco.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  onConceptoFilterChange(event: Event): void {
    this.filterConcepto.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  onFormaPagoFilterChange(event: Event): void {
    this.filterFormaPago.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  clearAllFilters(): void {
    this.searchTerm.set('');
    this.filterEstado.set('TODOS');
    this.filterBanco.set('TODOS');
    this.filterConcepto.set('TODOS');
    this.filterFormaPago.set('TODOS');
    this.currentPage.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update((v) => !v);
  }

  // ── Pagination ──

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  onPageSizeChange(event: Event): void {
    this.pageSize.set(+(event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;

    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      let start = Math.max(1, current - 2);
      let end = Math.min(total, start + maxVisible - 1);
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  }

  toggleMenu(id: number): void {
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  trackById(_: number, item: Proveedor): number {
    return item.id || 0;
  }

  // ── ReteICA ──

  private loadReteicaMunicipios(): void {
    this.reteicaService.getMunicipios().subscribe({
      next: (m) => this.reteicaMunicipios.set(m),
      error: () => this.reteicaMunicipios.set([]),
    });
  }

  loadReteicaTarifasByMunicipio(municipio: string): void {
    if (!municipio) {
      this.reteicaTarifas.set([]);
      return;
    }
    this.loadingReteicaTarifas.set(true);
    this.reteicaService.getTarifasByMunicipio(municipio).subscribe({
      next: (tarifas) => {
        this.reteicaTarifas.set(tarifas.filter((t) => t.vigente));
        this.loadingReteicaTarifas.set(false);
      },
      error: () => {
        this.reteicaTarifas.set([]);
        this.loadingReteicaTarifas.set(false);
      },
    });
  }

  onReteicaMunicipioChange(municipio: string): void {
    this.reteicaMunicipioFilter.set(municipio);
    this.proveedorForm.patchValue({ reteicaTarifaId: null });
    this.loadReteicaTarifasByMunicipio(municipio);
  }

  selectReteica(tarifa: ReteicaTarifaResponse): void {
    this.proveedorForm.patchValue({ reteicaTarifaId: tarifa.id });
    this.showReteicaDropdown.set(false);
  }

  clearReteicaSelection(): void {
    this.proveedorForm.patchValue({ reteicaTarifaId: null });
    this.showReteicaDropdown.set(false);
  }

  toggleReteicaDropdown(): void {
    this.busquedaReteica.set('');
    this.showReteicaDropdown.update((v) => !v);
  }

  getSelectedReteicaDisplay(): string {
    const selectedId = this.proveedorForm?.get('reteicaTarifaId')?.value;
    if (!selectedId) return 'Seleccione tarifa ReteICA';
    const selected = this.reteicaTarifas().find((t) => t.id === selectedId);
    if (!selected) return 'Tarifa ID: ' + selectedId;
    return `${selected.municipio} · ${selected.actividadEconomica} · ${selected.tarifaPorMil}‰`;
  }
}
