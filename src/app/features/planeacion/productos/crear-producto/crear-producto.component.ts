import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger, state } from '@angular/animations';
import {
  Producto, CATEGORIAS_PRODUCTO, TIPOS_IMPUESTO, MONEDAS,
  TIPOS_PRODUCTO, UNIDADES_MEDIDA, RESTRICCIONES, ALERGENOS_COMUNES,
  MODALIDADES, ETIQUETAS_PREDEFINIDAS, CategoriaProducto, TipoImpuesto,
  Moneda, TipoProducto, UnidadMedida, RestriccionAlimentaria, ModalidadServicio,
  BulkUploadResult, BulkUploadError
} from '../../models/producto.model';

interface StepConfig {
  id: number;
  title: string;
  subtitle: string;
  icon: string;
  colorFrom: string;
  colorTo: string;
}

@Component({
  selector: 'app-crear-producto',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, RouterModule, FormsModule, ReactiveFormsModule],
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('stepTransition', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(60px) scale(0.95)' }),
        animate('450ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateX(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 0, transform: 'translateX(-60px) scale(0.95)' }))
      ])
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        query('.stagger-item', [
          style({ opacity: 0, transform: 'translateY(20px)' }),
          stagger(60, animate('400ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0)' })))
        ], { optional: true })
      ])
    ]),
    trigger('pulseIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8)' }),
        animate('350ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('chipEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0)' }),
        animate('250ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0)' }))
      ])
    ]),
    trigger('modalBg', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('modalPanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9) translateY(20px)' }),
        animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'scale(1) translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.9) translateY(20px)' }))
      ])
    ]),
    trigger('successAnim', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.5)' }),
        animate('600ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ],
  templateUrl: './crear-producto.component.html',
  styleUrl: './crear-producto.component.scss'
})
export class CrearProductoComponent {

  // ═══ Step configuration ═══
  steps: StepConfig[] = [
    { id: 1, title: 'Identificación', subtitle: 'Datos básicos del producto', icon: '🏷️', colorFrom: '#045C94', colorTo: '#0ea5e9' },
    { id: 2, title: 'Costos', subtitle: 'Información de costos', icon: '💰', colorFrom: '#f59e0b', colorTo: '#fbbf24' },
    { id: 3, title: 'Precios', subtitle: 'Precio y márgenes', icon: '💵', colorFrom: '#22c55e', colorTo: '#4ade80' },
    { id: 4, title: 'Especificaciones', subtitle: 'Detalles del producto', icon: '🍽️', colorFrom: '#8b5cf6', colorTo: '#a78bfa' },
    { id: 5, title: 'Operación', subtitle: 'Servicio y logística', icon: '📍', colorFrom: '#ef4444', colorTo: '#f87171' },
    { id: 6, title: 'Opcionales', subtitle: 'Información adicional', icon: '⚙️', colorFrom: '#6366f1', colorTo: '#818cf8' },
  ];

  currentStep = signal(1);
  animationDirection = signal<'forward' | 'backward'>('forward');
  showBulkUpload = signal(false);
  showSuccessModal = signal(false);
  isSaving = signal(false);
  savedProduct = signal<Producto | null>(null);

  // ═══ Catalogues ═══
  categorias = CATEGORIAS_PRODUCTO;
  tiposImpuesto = TIPOS_IMPUESTO;
  monedas = MONEDAS;
  tiposProducto = TIPOS_PRODUCTO;
  unidadesMedida = UNIDADES_MEDIDA;
  restricciones = RESTRICCIONES;
  alergenosComunes = ALERGENOS_COMUNES;
  modalidades = MODALIDADES;
  etiquetasPredefinidas = ETIQUETAS_PREDEFINIDAS;

  // ═══ Form state signals ═══
  selectedRestricciones = signal<RestriccionAlimentaria[]>([]);
  selectedAlergenos = signal<string[]>([]);
  selectedModalidades = signal<ModalidadServicio[]>([]);
  selectedEtiquetas = signal<string[]>([]);
  ingredientes = signal<string[]>([]);
  nuevoIngrediente = signal('');
  nuevaEtiqueta = signal('');
  nuevoAlergeno = signal('');
  imagenPreview = signal<string | null>(null);

  // ═══ Bulk Upload ═══
  bulkFile = signal<File | null>(null);
  bulkDragOver = signal(false);
  bulkUploading = signal(false);
  bulkResult = signal<BulkUploadResult | null>(null);

  // ═══ Forms ═══
  form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      // Step 1: Identificación
      codigo: ['', [Validators.required, Validators.minLength(3)]],
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      descripcionCorta: ['', [Validators.required, Validators.maxLength(200)]],
      categoria: ['', Validators.required],
      estado: ['ACTIVO', Validators.required],

      // Step 2: Costos
      costoUnitario: [null, [Validators.required, Validators.min(0)]],
      tipoCosto: ['ESTANDAR', Validators.required],
      fechaActualizacionCosto: [''],

      // Step 3: Precios
      precioVenta: [null, [Validators.required, Validators.min(0)]],
      margenPorcentaje: [null],
      impuestosIncluidos: [true],
      tipoImpuesto: ['IVA_19'],
      moneda: ['COP', Validators.required],

      // Step 4: Especificaciones
      tipoProducto: ['', Validators.required],
      tamanoPresentacion: ['', Validators.required],
      gramajePesoNeto: [null],
      unidadMedida: ['g', Validators.required],
      porciones: [null],
      calorias: [null],
      informacionNutricional: [''],
      vidaUtil: [''],

      // Step 5: Operación
      requierePreparacion: [true],
      tiempoEstimadoPreparacion: [null],
      requiereCadenaFria: [false],

      // Step 6: Opcionales
      recetaAsociada: [''],
      observaciones: [''],
    });
  }

  // ═══ Auto-calculate margin ═══
  calculatedMargin = computed(() => {
    const costo = this.form?.get('costoUnitario')?.value;
    const precio = this.form?.get('precioVenta')?.value;
    if (costo && precio && costo > 0) {
      return ((precio - costo) / costo * 100).toFixed(1);
    }
    return null;
  });

  // ═══ Step navigation ═══
  get currentStepConfig(): StepConfig {
    return this.steps.find(s => s.id === this.currentStep()) || this.steps[0];
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= 6) {
      this.animationDirection.set(step > this.currentStep() ? 'forward' : 'backward');
      this.currentStep.set(step);
    }
  }

  nextStep(): void {
    if (this.currentStep() < 6) {
      this.animationDirection.set('forward');
      this.currentStep.update(v => v + 1);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.animationDirection.set('backward');
      this.currentStep.update(v => v - 1);
    }
  }

  isStepValid(step: number): boolean {
    switch (step) {
      case 1:
        return ['codigo', 'nombre', 'descripcionCorta', 'categoria', 'estado']
          .every(f => this.form.get(f)?.valid ?? false);
      case 2:
        return ['costoUnitario', 'tipoCosto']
          .every(f => this.form.get(f)?.valid ?? false);
      case 3:
        return ['precioVenta', 'moneda']
          .every(f => this.form.get(f)?.valid ?? false);
      case 4:
        return ['tipoProducto', 'tamanoPresentacion', 'unidadMedida']
          .every(f => this.form.get(f)?.valid ?? false);
      case 5:
        return this.selectedModalidades().length > 0;
      case 6:
        return true;
      default:
        return false;
    }
  }

  getCompletedSteps(): number {
    let count = 0;
    for (let i = 1; i <= 6; i++) {
      if (this.isStepValid(i)) count++;
    }
    return count;
  }

  progressPercentage = computed(() => {
    return Math.round((this.getCompletedSteps() / 6) * 100);
  });

  // ═══ Chips / Multi-select handlers ═══
  toggleRestriccion(r: RestriccionAlimentaria): void {
    this.selectedRestricciones.update(arr => {
      const exists = arr.includes(r);
      return exists ? arr.filter(x => x !== r) : [...arr, r];
    });
  }

  toggleAlergeno(a: string): void {
    this.selectedAlergenos.update(arr => {
      const exists = arr.includes(a);
      return exists ? arr.filter(x => x !== a) : [...arr, a];
    });
  }

  addCustomAlergeno(): void {
    const val = this.nuevoAlergeno().trim();
    if (val && !this.selectedAlergenos().includes(val)) {
      this.selectedAlergenos.update(arr => [...arr, val]);
      this.nuevoAlergeno.set('');
    }
  }

  removeAlergeno(a: string): void {
    this.selectedAlergenos.update(arr => arr.filter(x => x !== a));
  }

  toggleModalidad(m: ModalidadServicio): void {
    this.selectedModalidades.update(arr => {
      const exists = arr.includes(m);
      return exists ? arr.filter(x => x !== m) : [...arr, m];
    });
  }

  toggleEtiqueta(e: string): void {
    this.selectedEtiquetas.update(arr => {
      const exists = arr.includes(e);
      return exists ? arr.filter(x => x !== e) : [...arr, e];
    });
  }

  addCustomEtiqueta(): void {
    const val = this.nuevaEtiqueta().trim();
    if (val && !this.selectedEtiquetas().includes(val)) {
      this.selectedEtiquetas.update(arr => [...arr, val]);
      this.nuevaEtiqueta.set('');
    }
  }

  removeEtiqueta(e: string): void {
    this.selectedEtiquetas.update(arr => arr.filter(x => x !== e));
  }

  addIngrediente(): void {
    const val = this.nuevoIngrediente().trim();
    if (val && !this.ingredientes().includes(val)) {
      this.ingredientes.update(arr => [...arr, val]);
      this.nuevoIngrediente.set('');
    }
  }

  removeIngrediente(i: string): void {
    this.ingredientes.update(arr => arr.filter(x => x !== i));
  }

  // ═══ Image handling ═══
  onImageSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        this.imagenPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  removeImage(): void {
    this.imagenPreview.set(null);
  }

  // ═══ Save product ═══
  onSave(): void {
    if (this.form.valid) {
      this.isSaving.set(true);

      const producto: Producto = {
        identificacion: {
          codigo: this.form.get('codigo')!.value,
          nombre: this.form.get('nombre')!.value,
          descripcionCorta: this.form.get('descripcionCorta')!.value,
          categoria: this.form.get('categoria')!.value,
          estado: this.form.get('estado')!.value,
        },
        costos: {
          costoUnitario: this.form.get('costoUnitario')!.value,
          tipoCosto: this.form.get('tipoCosto')!.value,
          fechaActualizacionCosto: this.form.get('fechaActualizacionCosto')!.value || undefined,
        },
        precios: {
          precioVenta: this.form.get('precioVenta')!.value,
          margenPorcentaje: this.form.get('margenPorcentaje')!.value || undefined,
          impuestosIncluidos: this.form.get('impuestosIncluidos')!.value,
          tipoImpuesto: this.form.get('tipoImpuesto')!.value || undefined,
          moneda: this.form.get('moneda')!.value,
        },
        especificaciones: {
          tipoProducto: this.form.get('tipoProducto')!.value,
          tamanoPresentacion: this.form.get('tamanoPresentacion')!.value,
          gramajePesoNeto: this.form.get('gramajePesoNeto')!.value || undefined,
          unidadMedida: this.form.get('unidadMedida')!.value,
          porciones: this.form.get('porciones')!.value || undefined,
          calorias: this.form.get('calorias')!.value || undefined,
          informacionNutricional: this.form.get('informacionNutricional')!.value || undefined,
          alergenos: this.selectedAlergenos(),
          restricciones: this.selectedRestricciones(),
          vidaUtil: this.form.get('vidaUtil')!.value || undefined,
        },
        operacion: {
          modalidad: this.selectedModalidades(),
          requierePreparacion: this.form.get('requierePreparacion')!.value,
          tiempoEstimadoPreparacion: this.form.get('tiempoEstimadoPreparacion')!.value || undefined,
          requiereCadenaFria: this.form.get('requiereCadenaFria')!.value,
        },
        opcional: {
          imagenUrl: this.imagenPreview() || undefined,
          recetaAsociada: this.form.get('recetaAsociada')!.value || undefined,
          ingredientesPrincipales: this.ingredientes(),
          observaciones: this.form.get('observaciones')!.value || undefined,
          etiquetas: this.selectedEtiquetas(),
        }
      };

      // Simular guardado (después se conectará al backend)
      setTimeout(() => {
        this.isSaving.set(false);
        this.savedProduct.set(producto);
        this.showSuccessModal.set(true);
      }, 1500);
    }
  }

  // ═══ Bulk Upload ═══
  onBulkFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.bulkDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files[0]) {
      this.validateAndSetBulkFile(files[0]);
    }
  }

  onBulkDragOver(event: DragEvent): void {
    event.preventDefault();
    this.bulkDragOver.set(true);
  }

  onBulkDragLeave(): void {
    this.bulkDragOver.set(false);
  }

  onBulkFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.validateAndSetBulkFile(input.files[0]);
    }
  }

  private validateAndSetBulkFile(file: File): void {
    const validTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (validTypes.includes(file.type) || ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      this.bulkFile.set(file);
      this.bulkResult.set(null);
    }
  }

  removeBulkFile(): void {
    this.bulkFile.set(null);
    this.bulkResult.set(null);
  }

  processBulkUpload(): void {
    if (!this.bulkFile()) return;
    this.bulkUploading.set(true);

    // Simulate processing
    setTimeout(() => {
      this.bulkUploading.set(false);
      this.bulkResult.set({
        totalRows: 25,
        successCount: 22,
        errorCount: 3,
        errors: [
          { row: 5, field: 'costoUnitario', message: 'Valor no numérico', value: 'abc' },
          { row: 12, field: 'categoria', message: 'Categoría no válida', value: 'DESCONOCIDA' },
          { row: 18, field: 'nombre', message: 'Campo requerido vacío', value: '' },
        ],
        productos: []
      });
    }, 2500);
  }

  downloadTemplate(): void {
    // Generate CSV template
    const headers = [
      'codigo', 'nombre', 'descripcionCorta', 'categoria', 'estado',
      'costoUnitario', 'tipoCosto', 'precioVenta', 'moneda',
      'tipoProducto', 'tamanoPresentacion', 'unidadMedida', 'porciones',
      'modalidad', 'requierePreparacion', 'requiereCadenaFria'
    ];
    const csvContent = headers.join(',') + '\n' +
      'PRD-001,Arroz con pollo,Arroz con pollo tradicional,ALIMENTOS_PREPARADOS,ACTIVO,8500,ESTANDAR,15000,COP,PLATO,Porción estándar,g,1,CONSUMO_EN_SITIO,true,false\n' +
      'PRD-002,Jugo natural,Jugo de naranja natural,BEBIDAS,ACTIVO,3000,ESTANDAR,6000,COP,BEBIDA,500ml,ml,1,PARA_LLEVAR,true,true';

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_productos.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // ═══ Reset & close ═══
  resetForm(): void {
    this.form.reset({ estado: 'ACTIVO', tipoCosto: 'ESTANDAR', impuestosIncluidos: true, tipoImpuesto: 'IVA_19', moneda: 'COP', unidadMedida: 'g', requierePreparacion: true, requiereCadenaFria: false });
    this.selectedRestricciones.set([]);
    this.selectedAlergenos.set([]);
    this.selectedModalidades.set([]);
    this.selectedEtiquetas.set([]);
    this.ingredientes.set([]);
    this.imagenPreview.set(null);
    this.currentStep.set(1);
    this.showSuccessModal.set(false);
    this.savedProduct.set(null);
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
  }

  createAnother(): void {
    this.resetForm();
  }
}
