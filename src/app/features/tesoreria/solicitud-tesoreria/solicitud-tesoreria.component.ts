import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  NgZone,
  ChangeDetectorRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { TesoreriaService } from '../services/tesoreria.service';
import {
  TipoRequerimiento,
  TIPO_REQUERIMIENTO_LABELS,
  SolicitudRequest,
  AreaDepartamento,
  Cargo,
  StatsTesoreria,
  EmpresaPeopleNet,
} from '../models/solicitud.model';
import { Employee } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';

// Sub-components para cada tipo de requerimiento
import { MantenimientoFieldsComponent } from './components/mantenimiento-fields/mantenimiento-fields.component';
import { ViaticosFieldsComponent } from './components/viaticos-fields/viaticos-fields.component';
import { PresupuestoFieldsComponent } from './components/presupuesto-fields/presupuesto-fields.component';
import { MateriaPrimaFieldsComponent } from './components/materia-prima-fields/materia-prima-fields.component';
import { FumigacionFieldsComponent } from './components/fumigacion-fields/fumigacion-fields.component';
import { ServiciosGeneralesFieldsComponent } from './components/servicios-generales-fields/servicios-generales-fields.component';
import { CompraHardwareFieldsComponent } from './components/compra-hardware-fields/compra-hardware-fields.component';
import { DotacionFieldsComponent } from './components/dotacion-fields/dotacion-fields.component';
import { MesaAyudaFieldsComponent } from './components/mesa-ayuda-fields/mesa-ayuda-fields.component';

@Component({
  selector: 'app-solicitud-tesoreria',
  standalone: true,
  imports: [SelectBuscableDirective,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MantenimientoFieldsComponent,
    ViaticosFieldsComponent,
    PresupuestoFieldsComponent,
    MateriaPrimaFieldsComponent,
    FumigacionFieldsComponent,
    ServiciosGeneralesFieldsComponent,
    CompraHardwareFieldsComponent,
    DotacionFieldsComponent,
    MesaAyudaFieldsComponent,
  ],
  templateUrl: './solicitud-tesoreria.component.html',
  styleUrls: ['./solicitud-tesoreria.component.scss'],
})
export class SolicitudTesoreriaComponent implements OnInit, OnDestroy {
  private readonly tipoRequerimientoLabelsMap: Record<string, string> = TIPO_REQUERIMIENTO_LABELS as Record<string, string>;

  // ───── Signals de estado ─────────────────────────
  areas = signal<AreaDepartamento[]>([]);
  empresas = signal<EmpresaPeopleNet[]>([]);
  cargos = signal<Cargo[]>([]);
  employees = signal<Employee[]>([]);
  filteredEmployees = signal<Employee[]>([]);
  employeeSearch = signal('');
  showEmployeeDropdown = signal(false);
  selectedEmployee = signal<Employee | null>(null);

  // Búsqueda de cargos
  cargoSearch = signal('');
  filteredCargos = signal<Cargo[]>([]);
  showCargoDropdown = signal(false);
  cargoSugerencias = signal<Cargo[]>([]);
  mostrarAlertaCargo = signal(false);

  documentoFile = signal<File | null>(null);
  isSubmitting = signal(false);
  showSuccess = signal(false);
  submitError = signal('');

  /** Indica si el paso 1 fue pre-llenado con datos del usuario autenticado */
  currentUserPrefilled = signal(false);

  /** NIT de la empresa del usuario autenticado (para viáticos) */
  nitEmpresaUsuario = signal<string>('');

  @ViewChild(ViaticosFieldsComponent) viaticosFieldsRef?: ViaticosFieldsComponent;

  /** Snapshot de los datos de viáticos capturado antes de navegar al paso 3 */
  private viaticosSnapshot: {
    tipoSolicitudViaticos: 'SOLICITUD_VIATICOS' | 'ADELANTO_VIATICOS';
    fechaMaximaEvento: string;
    items: any[];
    observaciones: string;
    soportesAdicionales: File[];
    certificadoBancario: File | null;
  } | null = null;

  // ───── Stats del dashboard ───────────────────────
  stats = signal<StatsTesoreria>({
    totalSolicitudes: 0,
    solicitudesMes: 0,
    pendientes: 0,
    aprobadas: 0,
    montoTotal: 0,
    areas: 0,
  });

  // ───── Grupo dinámico para tipo de requerimiento ──
  datosAdicionalesGroup = signal<FormGroup | null>(null);
  /** Cache: last tipo built to skip unnecessary FormGroup rebuilds */
  private lastBuiltTipo = signal<string>('');

  // ───── Paso activo del formulario ────────────────
  activeStep = signal(1);

  /** Labels de cada paso para el header */
  stepLabels = [
    'Información del Solicitante',
    'Tipo de Requerimiento',
    'Resumen y Envío',
  ];

  // ─────── Computed: progreso del formulario (basado en el paso actual) ───────
  formProgress = computed(() => {
    return Math.round((this.activeStep() / 3) * 100);
  });

  // ───── Computed: completitud por paso ─────────────
  step1Complete = computed(() => {
    const f = this.solicitudForm;
    if (!f) return false;
    return !!(
      f.get('nombre')?.valid &&
      f.get('areaDepartamento')?.valid &&
      f.get('cargo')?.valid
    );
  });
  step2Complete = computed(() => {
    const f = this.solicitudForm;
    if (!f) return false;
    return !!f.get('tipoRequerimiento')?.valid;
  });
  step3Complete = computed(() => {
    const f = this.solicitudForm;
    if (!f) return false;
    return !!f.get('observaciones')?.valid;
  });

  // ───── Formulario ────────────────────────────────
  solicitudForm!: FormGroup;

  // ───── Catálogo de tipos de requerimiento ────────
  tipoRequerimientoList: { value: TipoRequerimiento; label: string }[] =
    Object.entries(TIPO_REQUERIMIENTO_LABELS).map(([value, label]) => ({
      value: value as TipoRequerimiento,
      label,
    }));

  /** Listener global para cerrar los dropdowns */
  private clickOutsideHandler = (e: Event): void => {
    const target = e.target as HTMLElement;
    if (
      !target.closest('.relative') &&
      !target.closest('.cargo-search-wrapper')
    ) {
      this.showEmployeeDropdown.set(false);
      this.showCargoDropdown.set(false);
    }
  };

  constructor(
    private fb: FormBuilder,
    private tesoreriaService: TesoreriaService,
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  // =====================================================
  // Lifecycle 
  // =====================================================

  ngOnInit(): void {
    this.initForm();
    this.prefillFromCurrentUser();
    this.loadCatalogs();
    // Only load all employees when user is NOT authenticated (saves memory for most sessions)
    if (!this.authService.getCurrentUser()) {
      this.loadEmployees();
    }
    this.loadStats();
    document.addEventListener('click', this.clickOutsideHandler);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.clickOutsideHandler);
  }

  // =====================================================
  // Inicialización del formulario
  // =====================================================

  // =====================================================
  // Pre-llenado con datos del usuario autenticado
  // =====================================================

  private prefillFromCurrentUser(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return;

    const emp = currentUser.employee as any;

    if (!emp && currentUser.employeeId) {
      // El usuario se logueó antes de que el backend incluyera employee en la respuesta.
      // Buscar el empleado por su ID y volver a intentar.
      this.tesoreriaService.getEmployeeById(String(currentUser.employeeId)).subscribe({
        next: (empFromApi) => this.applyEmployeeData(empFromApi, currentUser.username, currentUser.email),
        error: () => this.applyEmployeeData(null, currentUser.username, currentUser.email),
      });
    } else {
      this.applyEmployeeData(emp, currentUser.username, currentUser.email);
    }
  }

  private applyEmployeeData(emp: any, username: string, userEmail: string): void {
    const nombre      = emp?.fullName    || username  || '';
    const email       = emp?.corporateEmail || userEmail || '';
    // El endpoint devuelve phoneNumber; phone puede ser null
    const telefono    = emp?.phoneNumber || emp?.phone || '';
    // positionName es el campo poblado; jobPosition puede ser null
    const cargo       = emp?.positionName || emp?.jobPosition || '';
    // area se resuelve desde la FK en el backend; department como fallback
    const area        = emp?.area        || emp?.department  || '';
    const empresa     = emp?.companyName || '';

    this.employeeSearch.set(nombre);

    this.solicitudForm.patchValue({
      nombre,
      correoElectronico: email,
      telefonoContacto: telefono,
      ...(cargo   && { cargo }),
      ...(area    && { areaDepartamento: area }),
      ...(empresa && { empresaCentroCostos: empresa }),
    });

    // Resolver NIT de la empresa — puede que las empresas ya estén cargadas
    if (empresa) {
      const loaded = this.empresas();
      if (loaded.length > 0) {
        const match = loaded.find(e => e.nombre?.toLowerCase() === empresa.toLowerCase());
        if (match?.nit) this.nitEmpresaUsuario.set(match.nit);
      }
      // Si aún no están cargadas, loadCatalogs() las resolverá cuando lleguen
    }

    // Deshabilitar todos los campos del solicitante para que no sean editables
    this.solicitudForm.get('correoElectronico')?.disable();
    this.solicitudForm.get('telefonoContacto')?.disable();
    if (cargo)   this.solicitudForm.get('cargo')?.disable();
    if (area)    this.solicitudForm.get('areaDepartamento')?.disable();
    if (empresa) this.solicitudForm.get('empresaCentroCostos')?.disable();

    this.currentUserPrefilled.set(true);
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.solicitudForm = this.fb.group({
      fechaSolicitud: [today],
      areaDepartamento: [''],
      empresaCentroCostos: [''],
      cargo: [''],
      nombre: [''],
      correoElectronico: [''],
      telefonoContacto: [''],
      tipoRequerimiento: [''],
      otroRequerimiento: [''],
      esCompra: [false],
      observaciones: ['', Validators.maxLength(2000)],
    });
  }

  // =====================================================
  // Carga de catálogos
  // =====================================================

  private loadCatalogs(): void {
    this.tesoreriaService.getAreas().subscribe({
      next: (data) => this.areas.set(data),
      error: () => {
        this.areas.set([
          { id: 1, nombre: 'Administración' },
          { id: 2, nombre: 'Contabilidad' },
          { id: 3, nombre: 'Recursos Humanos' },
          { id: 4, nombre: 'Producción' },
          { id: 5, nombre: 'Logística' },
          { id: 6, nombre: 'Comercial' },
          { id: 7, nombre: 'Tesorería' },
          { id: 8, nombre: 'Sistemas' },
        ]);
      },
    });

    this.tesoreriaService.getCargos().subscribe({
      next: (data) => this.cargos.set(data),
      error: () => {
        this.cargos.set([
          { id: 1, nombre: 'Analista' },
          { id: 2, nombre: 'Coordinador' },
          { id: 3, nombre: 'Director' },
          { id: 4, nombre: 'Gerente' },
          { id: 5, nombre: 'Auxiliar' },
          { id: 6, nombre: 'Asistente' },
          { id: 7, nombre: 'Jefe' },
          { id: 8, nombre: 'Supervisor' },
        ]);
      },
    });

    // Cargar empresas desde PeopleNet
    this.tesoreriaService.getEmpresas().subscribe({
      next: (data) => {
        this.empresas.set(data);
        // Resolver NIT de la empresa del usuario autenticado
        const nombreEmpresa = this.solicitudForm.get('empresaCentroCostos')?.value;
        if (nombreEmpresa) {
          const match = data.find(
            (e) => e.nombre?.toLowerCase() === nombreEmpresa?.toLowerCase(),
          );
          if (match?.nit) {
            this.nitEmpresaUsuario.set(match.nit);
          }
        }
      },
      error: () => this.empresas.set([]),
    });
  }

  private loadEmployees(): void {
    this.tesoreriaService.getEmployees().subscribe({
      next: (data) => {
        this.employees.set(data);
        this.extractCargosFromEmployees(data);
      },
      error: () => this.employees.set([]),
    });
  }

  /** Extrae cargos únicos de los empleados de PeopleNet */
  private extractCargosFromEmployees(employees: Employee[]): void {
    const cargosSet = new Set<string>();
    employees.forEach((emp) => {
      const cargo = (emp as any).positionName || (emp as any).jobPosition || '';
      if (cargo && cargo.trim()) {
        cargosSet.add(cargo.trim());
      }
    });
    const cargosArray: Cargo[] = Array.from(cargosSet)
      .sort((a, b) => a.localeCompare(b))
      .map((nombre, idx) => ({ id: idx + 1, nombre }));
    if (cargosArray.length > 0) {
      this.cargos.set(cargosArray);
    }
  }

  private loadStats(): void {
    this.tesoreriaService.getStats().subscribe({
      next: (data) => this.stats.set(data),
      error: () => {
        // Fallback con datos de demo
        this.stats.set({
          totalSolicitudes: 247,
          solicitudesMes: 38,
          pendientes: 12,
          aprobadas: 198,
          montoTotal: 156400000,
          areas: 8,
        });
      },
    });
  }

  /** Navegar entre pasos */
  goToStep(step: number): void {
    // Capturar datos del componente de viáticos ANTES de que *ngIf lo destruya
    const isTipoViaticos = this.solicitudForm.get('tipoRequerimiento')?.value === 'VIATICOS';
    if (isTipoViaticos && this.activeStep() === 2 && step === 3 && this.viaticosFieldsRef) {
      const vf = this.viaticosFieldsRef;
      this.viaticosSnapshot = {
        tipoSolicitudViaticos: vf.tipoSolicitudViaticos(),
        fechaMaximaEvento: vf.getFechaMaximaEvento(),
        items: vf.getItemsForSubmit(),
        observaciones: vf.observacionesViaticos(),
        soportesAdicionales: vf.soportesAdicionales(),
        certificadoBancario: vf.getCertificadoBancario(),
      };
    }
    this.activeStep.set(step);
  }

  /** Formatear moneda COP */
  formatCurrency(value: number): string {
    if (value >= 1_000_000_000)
      return '$' + (value / 1_000_000_000).toFixed(1) + 'B';
    if (value >= 1_000_000) return '$' + (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return '$' + (value / 1_000).toFixed(1) + 'K';
    return '$' + value.toString();
  }

  // =====================================================
  // Búsqueda y selección de empleados
  // =====================================================

  onSearchEmployee(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.employeeSearch.set(value);
    this.showEmployeeDropdown.set(true);

    if (value.length >= 2) {
      const search = value.toLowerCase();
      const filtered = this.employees().filter(
        (emp) =>
          emp.fullName?.toLowerCase().includes(search) ||
          emp.idNumber?.toLowerCase().includes(search),
      );
      this.filteredEmployees.set(filtered.slice(0, 10));
    } else {
      this.filteredEmployees.set([]);
    }
  }

  selectEmployee(emp: Employee): void {
    console.log('selectEmployee llamado:', emp);

    this.selectedEmployee.set(emp);
    this.employeeSearch.set(emp.fullName);
    this.showEmployeeDropdown.set(false);
    this.filteredEmployees.set([]);

    // Los empleados del backend no tienen información de cargo, así que el usuario debe seleccionarlo manualmente
    this.solicitudForm.patchValue({
      nombre: emp.fullName,
      correoElectronico: emp.corporateEmail || '',
      telefonoContacto: (emp as any).phone || (emp as any).telefono || '',
    });

    console.log(
      'Empleado seleccionado sin cargo. Usuario debe seleccionar cargo manualmente del dropdown.',
    );
  }

  // =====================================================
  // Búsqueda y selección de cargos
  // =====================================================

  onSearchCargo(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.showCargoDropdown.set(true);
    this.mostrarAlertaCargo.set(false);

    if (value.length >= 1) {
      const search = value.toLowerCase();
      const todosLosCargos = this.cargos();

      // Filtrar cargos que contengan el texto buscado
      const coincidentes = todosLosCargos.filter((cargo) =>
        cargo.nombre.toLowerCase().includes(search),
      );

      this.filteredCargos.set(coincidentes.slice(0, 10));

      // Si no hay coincidencias, mostrar sugerencias similares
      if (coincidentes.length === 0 && value.length >= 2) {
        const sugerencias = this.obtenerSugerenciasSimilares(
          value,
          todosLosCargos,
        );
        this.cargoSugerencias.set(sugerencias);
        this.mostrarAlertaCargo.set(true);
      } else {
        this.cargoSugerencias.set([]);
        this.mostrarAlertaCargo.set(false);
      }
    } else {
      this.filteredCargos.set([]);
      this.cargoSugerencias.set([]);
      this.mostrarAlertaCargo.set(false);
    }
  }

  selectCargo(cargo: Cargo, event?: Event): void {
    console.log('selectCargo llamado:', cargo);
    console.log('Form cargo ANTES:', this.solicitudForm.get('cargo')?.value);

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.showCargoDropdown.set(false);
    this.showEmployeeDropdown.set(false);
    this.filteredCargos.set([]);
    this.cargoSugerencias.set([]);
    this.mostrarAlertaCargo.set(false);

    // Usar ngZone.run para asegurar que el cambio sea detectado por Angular
    this.ngZone.run(() => {
      const cargoControl = this.solicitudForm.get('cargo');
      if (cargoControl) {
        cargoControl.setValue(cargo.nombre);
        cargoControl.markAsDirty();
        cargoControl.markAsTouched();
      }

      this.solicitudForm.markAsDirty();

      // Forzar detección de cambios
      this.cdr.markForCheck();
    });

    console.log('Form cargo DESPUÉS:', this.solicitudForm.get('cargo')?.value);
  }

  // Calcular similitud entre dos strings (Levenshtein distance)
  private calcularSimilitud(s1: string, s2: string): number {
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();
    // Guard: skip expensive O(n×m) allocation for long strings or large length differences
    if (Math.abs(a.length - b.length) > 6) return 999;
    if (a.length > 25 || b.length > 25) return 999;
    const matriz: number[][] = Array(a.length + 1)
      .fill(null)
      .map(() => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matriz[i][0] = i;
    for (let j = 0; j <= b.length; j++) matriz[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const costo = a[i - 1] === b[j - 1] ? 0 : 1;
        matriz[i][j] = Math.min(
          matriz[i - 1][j] + 1, // eliminación
          matriz[i][j - 1] + 1, // inserción
          matriz[i - 1][j - 1] + costo, // sustitución
        );
      }
    }
    return matriz[a.length][b.length];
  }

  // Obtener cargos similares como sugerencias
  private obtenerSugerenciasSimilares(
    busqueda: string,
    cargos: Cargo[],
  ): Cargo[] {
    const conSimilitud = cargos.map((cargo) => ({
      cargo,
      similitud: this.calcularSimilitud(busqueda, cargo.nombre),
    }));

    return conSimilitud
      .sort((a, b) => a.similitud - b.similitud)
      .slice(0, 3)
      .map((item) => item.cargo);
  }

  // =====================================================
  // Tipo de requerimiento
  // =====================================================

  selectTipoRequerimiento(tipo: TipoRequerimiento): void {
    this.solicitudForm.patchValue({ tipoRequerimiento: tipo });
    if (tipo !== 'OTRO') {
      this.solicitudForm.patchValue({ otroRequerimiento: '' });
    }
    // Skip rebuilding FormGroup if user re-clicks the same type
    if (tipo !== this.lastBuiltTipo()) {
      this.buildDatosAdicionales(tipo);
      this.lastBuiltTipo.set(tipo);
    }
  }

  /** Construye el FormGroup dinámico según el tipo de requerimiento */
  private buildDatosAdicionales(tipo: TipoRequerimiento): void {
    // Limpiar grupo anterior     
    if (this.solicitudForm.contains('datosAdicionales')) {
      this.solicitudForm.removeControl('datosAdicionales');
    }
    this.datosAdicionalesGroup.set(null);

    let group: FormGroup | null = null;

    switch (tipo) {
      case 'MANTENIMIENTO':
        group = this.fb.group({
          tipoActivo: [''],
          codigoActivo: [''],
          nombreActivo: [''],
          ubicacionExacta: [''],
          marcaModelo: [''],
          tipoMantenimiento: [''],
          fallaDetectada: [''],
          sintomaObservado: [''],
          detalleProblema: [''],
          equipoDetenido: [false],
          nivelCriticidad: [''],
          fechaRequerida: [''],
          franjaHoraria: [''],
          impactoOperativo: [''],
          requiereCompra: [false],
          presupuestoEstimado: [null],
          centroCostos: [''],
          proyecto: [''],
        });
        break;

      case 'VIATICOS':
        group = this.fb.group({
          nombreEmpresa: [''],
          nit: [''],
          centroCosto: [''],
          areaDependencia: [''],
          ciudad: ['', Validators.required],
          bancoCuenta: ['', Validators.required],
          tipoCuentaBancaria: ['', Validators.required],
          numeroCuentaBancaria: ['', [Validators.required, Validators.maxLength(30)]],
          nombreTitularCuenta: ['', Validators.required],
          fechaMaximaEvento: ['', Validators.required],
          items: this.fb.array([]),
        });
        break;

      case 'PRESUPUESTO':
        group = this.fb.group({
          tipoPpto: [''],
          conceptoGasto: [''],
          justificacion: [''],
          alcanceEsperado: [''],
          beneficioEsperado: [''],
          tipoFinanciero: [''],
          centroCostos: [''],
          proyecto: [''],
          presupuestoEstimado: [null],
          moneda: ['COP'],
          incluyeImpuestos: [false],
          nivelUrgencia: [''],
          impacto: [''],
          proveedorSugerido: [false],
          nombreProveedor: [''],
          requiereCotizaciones: [1],
          tipoProveedor: [''],
          fechaRequerida: [''],
          vigenciaPresupuesto: [''],
        });
        break;

      case 'MATERIA_PRIMA':
        group = this.fb.group({
          datosOCR: [''],
        });
        break;

      case 'FUMIGACION':
        group = this.fb.group({
          sedeEdificio: [''],
          areaEspecifica: [''],
          metrajeAproximado: [null],
          nivelInfestacion: [''],
          tiposControl: [[]],
          motivo: [''],
          descripcionProblema: [''],
          riesgo: [''],
          nivelUrgencia: [''],
          tipoFinanciero: [''],
          centroCostos: [''],
          presupuestoEstimado: [null],
          contempladoPresupuesto: [false],
          proveedorSugerido: [''],
          proveedorCertificado: [false],
          numCotizaciones: [1],
          tipoServicio: [''],
        });
        break;

      case 'SERVICIOS_GENERALES':
        group = this.fb.group({
          sedeUbicacion: [''],
          tipoServicio: [''],
          areaEspecifica: [''],
          descripcionServicio: [''],
          alcance: [''],
          motivo: [''],
          impacto: [''],
          prioridad: [''],
          centroCostos: [''],
          presupuestoEstimado: [null],
          estaPresupuestado: [false],
          requiereProveedorExterno: [false],
          responsableEjecucion: [''],
          fechaRequerida: [''],
          horarioPreferido: [''],
        });
        break;

      case 'COMPRA_HARDWARE':
        group = this.fb.group({
          sedeUbicacion: [''],
          tipoHardware: [''],
          descripcionEquipo: [''],
          marcaSugerida: [''],
          modeloSugerido: [''],
          procesador: [''],
          ram: [''],
          disco: [''],
          pantalla: [''],
          sistemaOperativo: [''],
          puertosConectividad: [''],
          garantiaMinima: [''],
          usuarioAsignado: [''],
          cargoUsuario: [''],
          procesoFuncion: [''],
          tipoUso: [''],
          motivoCompra: [''],
          tipoFinanciero: ['INVERSION_CAPEX'],
          centroCostos: [''],
          proyecto: [''],
          presupuestoEstimado: [null],
          estaPresupuestado: [false],
          vidaUtilEstimada: [''],
          proveedorSugerido: [''],
          proveedorHomologado: [false],
          numCotizaciones: [1],
          tiempoEntrega: [''],
          registrarActivoFijo: [false],
          codigoActivo: [''],
          responsableActivo: [''],
          ubicacionFisica: [''],
        });
        break;

      case 'DOTACION':
        group = this.fb.group({
          empresaRazonSocial: [''],
          nit: [''],
          sedeSucursal: [''],
          centroCostos: [''],
          tipoDotacion: [''],
          tallaCamisa: [''],
          tallaPantalon: [''],
          tallaCalzado: [''],
          genero: [''],
          cantidad: [null],
          colorReferencia: [''],
          caracteristicasEspeciales: [''],
          motivoSolicitud: [''],
          justificacion: [''],
          tipoFinanciero: [''],
          valorEstimado: [null],
          presupuestoDisponible: [false],
          proveedorSugerido: [''],
          proveedorHomologado: [false],
          numCotizaciones: [1],
        });
        break;

      case 'MESA_AYUDA':
        group = this.fb.group({
          // Datos del ticket
          numeroTicket: [''],
          fechaHoraCreacion: [''],
          // Información organizacional
          tipoEmpresa: [''],
          nombreEmpresa: [''],
          nit: [''],
          ciudad: [''],
          tieneSedeComplejo: [false],
          torreBloque: [''],
          piso: [''],
          oficinaArea: [''],
          // Información del solicitante
          nombreCompleto: [''],
          cargo: [''],
          correoElectronico: [''],
          telefono: [''],
          // Clasificación del requerimiento
          tipoSolicitud: [''],
          subClasificacion: [''],
          descripcionIncidente: [''],
          fechaIncidente: [''],
          archivoAdjuntoUrl: [''],
          // Priorización
          urgencia: [''],
          impacto: [''],
        });
        break;

      default:
        break;
    }

    if (group) {
      this.solicitudForm.addControl('datosAdicionales', group);
      this.datosAdicionalesGroup.set(group);
    }
  }

  /** Obtener el FormGroup de datos adicionales para los sub-componentes */
  getDatosAdicionalesGroup(): FormGroup {
    return this.datosAdicionalesGroup() as FormGroup;
  }

  getTipoRequerimientoLabel(value: string): string {
    return this.tipoRequerimientoLabelsMap[value] || value || '—';
  }

  getResumenContextualItems(): { label: string; value: string }[] {
    const tipo = (this.solicitudForm.get('tipoRequerimiento')?.value || '') as TipoRequerimiento;
    const datos = this.solicitudForm.get('datosAdicionales')?.getRawValue?.() || this.solicitudForm.get('datosAdicionales')?.value || {};

    if (!tipo) return [];

    switch (tipo) {
      case 'VIATICOS': {
        const snap = this.viaticosSnapshot;
        const vf = this.viaticosFieldsRef;
        const tipoSolicitud = snap?.tipoSolicitudViaticos ?? vf?.tipoSolicitudViaticos() ?? 'SOLICITUD_VIATICOS';
        const items = snap?.items ?? vf?.getItemsForSubmit() ?? [];
        const total = items.reduce((sum: number, item: any) => sum + Number(item?.valorTotal || 0), 0);

        return [
          { label: 'Modalidad de viáticos', value: this.getTipoSolicitudViaticosLabel(tipoSolicitud) },
          { label: 'Empresa', value: this.asSummaryValue(datos.nombreEmpresa || this.solicitudForm.get('empresaCentroCostos')?.value) },
          { label: 'Ciudad destino', value: this.asSummaryValue(datos.ciudad) },
          { label: 'Banco de pago', value: this.asSummaryValue(datos.bancoCuenta) },
          { label: 'Tipo de cuenta', value: this.asSummaryValue(datos.tipoCuentaBancaria) },
          { label: 'Número de cuenta', value: this.asSummaryValue(datos.numeroCuentaBancaria) },
          { label: 'Titular de la cuenta', value: this.asSummaryValue(datos.nombreTitularCuenta) },
          { label: 'Fecha máxima del evento', value: this.asSummaryValue(datos.fechaMaximaEvento) },
          { label: 'Cantidad de items', value: String(items.length) },
          { label: 'Total estimado', value: this.formatCurrency(total) },
        ];
      }
      case 'MANTENIMIENTO':
        return [
          { label: 'Tipo de activo', value: this.asSummaryValue(datos.tipoActivo) },
          { label: 'Ubicación exacta', value: this.asSummaryValue(datos.ubicacionExacta) },
          { label: 'Tipo de mantenimiento', value: this.asSummaryValue(datos.tipoMantenimiento) },
          { label: 'Nivel de criticidad', value: this.asSummaryValue(datos.nivelCriticidad) },
          { label: 'Fecha requerida', value: this.asSummaryValue(datos.fechaRequerida) },
        ];
      case 'PRESUPUESTO':
        return [
          { label: 'Tipo de presupuesto', value: this.asSummaryValue(datos.tipoPpto) },
          { label: 'Concepto de gasto', value: this.asSummaryValue(datos.conceptoGasto) },
          { label: 'Centro de costos', value: this.asSummaryValue(datos.centroCostos) },
          { label: 'Presupuesto estimado', value: this.asSummaryCurrency(datos.presupuestoEstimado) },
          { label: 'Fecha requerida', value: this.asSummaryValue(datos.fechaRequerida) },
        ];
      case 'MATERIA_PRIMA':
        return [
          { label: 'Carga OCR', value: this.asSummaryValue(datos.datosOCR ? 'Documento cargado' : '') },
        ];
      case 'FUMIGACION':
        return [
          { label: 'Sede / edificio', value: this.asSummaryValue(datos.sedeEdificio) },
          { label: 'Área específica', value: this.asSummaryValue(datos.areaEspecifica) },
          { label: 'Nivel de infestación', value: this.asSummaryValue(datos.nivelInfestacion) },
          { label: 'Nivel de urgencia', value: this.asSummaryValue(datos.nivelUrgencia) },
          { label: 'Presupuesto estimado', value: this.asSummaryCurrency(datos.presupuestoEstimado) },
        ];
      case 'SERVICIOS_GENERALES':
        return [
          { label: 'Sede / ubicación', value: this.asSummaryValue(datos.sedeUbicacion) },
          { label: 'Tipo de servicio', value: this.asSummaryValue(datos.tipoServicio) },
          { label: 'Área específica', value: this.asSummaryValue(datos.areaEspecifica) },
          { label: 'Prioridad', value: this.asSummaryValue(datos.prioridad) },
          { label: 'Fecha requerida', value: this.asSummaryValue(datos.fechaRequerida) },
        ];
      case 'COMPRA_HARDWARE':
        return [
          { label: 'Tipo de hardware', value: this.asSummaryValue(datos.tipoHardware) },
          { label: 'Descripción del equipo', value: this.asSummaryValue(datos.descripcionEquipo) },
          { label: 'Usuario asignado', value: this.asSummaryValue(datos.usuarioAsignado) },
          { label: 'Centro de costos', value: this.asSummaryValue(datos.centroCostos) },
          { label: 'Presupuesto estimado', value: this.asSummaryCurrency(datos.presupuestoEstimado) },
        ];
      case 'DOTACION':
        return [
          { label: 'Empresa', value: this.asSummaryValue(datos.empresaRazonSocial) },
          { label: 'Tipo de dotación', value: this.asSummaryValue(datos.tipoDotacion) },
          { label: 'Cantidad', value: this.asSummaryValue(datos.cantidad) },
          { label: 'Motivo solicitud', value: this.asSummaryValue(datos.motivoSolicitud) },
          { label: 'Valor estimado', value: this.asSummaryCurrency(datos.valorEstimado) },
        ];
      case 'MESA_AYUDA':
        return [
          { label: 'Número de ticket', value: this.asSummaryValue(datos.numeroTicket) },
          { label: 'Tipo de solicitud', value: this.asSummaryValue(datos.tipoSolicitud) },
          { label: 'Subclasificación', value: this.asSummaryValue(datos.subClasificacion) },
          { label: 'Urgencia', value: this.asSummaryValue(datos.urgencia) },
          { label: 'Impacto', value: this.asSummaryValue(datos.impacto) },
        ];
      case 'OTRO':
        return [
          { label: 'Descripción del requerimiento', value: this.asSummaryValue(this.solicitudForm.get('otroRequerimiento')?.value) },
        ];
      default:
        return [];
    }
  }

  private getTipoSolicitudViaticosLabel(value: 'SOLICITUD_VIATICOS' | 'ADELANTO_VIATICOS'): string {
    return value === 'ADELANTO_VIATICOS' ? 'Adelanto de viáticos' : 'Solicitud de viáticos';
  }

  private asSummaryValue(value: any): string {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    return String(value);
  }

  private asSummaryCurrency(value: any): string {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '—';
    return this.formatCurrency(num);
  }

  // =====================================================
  // Toggle compra
  // =====================================================

  toggleCompra(): void {
    const current = this.solicitudForm.get('esCompra')?.value;
    this.solicitudForm.patchValue({ esCompra: !current });
  }

  // =====================================================
  // Manejo de archivos
  // =====================================================

  onDocumentoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.documentoFile.set(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDropDocumento(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file) this.documentoFile.set(file);
  }

  removeDocumento(event: Event): void {
    event.stopPropagation();
    this.documentoFile.set(null);
  }

  // =====================================================
  // Envío del formulario
  // =====================================================

  onSubmit(): void {
    this.submitError.set('');

    const v = this.solicitudForm.getRawValue();
    const viaticosValidationError =
      v.tipoRequerimiento === 'VIATICOS'
        ? this.getViaticosRuntimeValidationError(v)
        : null;

    if (viaticosValidationError) {
      this.submitError.set(viaticosValidationError);
      return;
    }

    if (this.solicitudForm.invalid) {
      this.solicitudForm.markAllAsTouched();
      this.submitError.set(this.buildInvalidFormMessage());
      return;
    }

    this.isSubmitting.set(true);

    if (v.tipoRequerimiento === 'VIATICOS') {
      this.submitViaticos(v);
      return;
    }

    const datosAdicionales =
      v.tipoRequerimiento === 'MESA_AYUDA'
        ? this.buildMesaAyudaData(v.datosAdicionales || {}, v)
        : v.datosAdicionales || undefined;

    const solicitud: SolicitudRequest = {
      fechaSolicitud: v.fechaSolicitud,
      areaDepartamento: v.areaDepartamento,
      empresaCentroCostos: v.empresaCentroCostos || undefined,
      cargo: v.cargo,
      nombre: v.nombre,
      correoElectronico: v.correoElectronico,
      telefonoContacto: v.telefonoContacto,
      tipoRequerimiento: v.tipoRequerimiento,
      otroRequerimiento: v.otroRequerimiento || undefined,
      esCompra: v.esCompra,
      observaciones: v.observaciones,
      datosAdicionales,
    };

    this.tesoreriaService
      .createSolicitud(solicitud, this.documentoFile() ?? undefined)
      .subscribe({
        next: () => this.handleSubmitSuccess(),
        error: (err) => {
          console.error('Error al enviar solicitud:', err);
          this.isSubmitting.set(false);
          this.submitError.set(
            err?.error?.message ||
              err?.error?.error ||
              'No fue posible enviar la solicitud. Intente nuevamente.',
          );
        },
      });
  }

  private submitViaticos(v: any): void {
    // Preferir el snapshot (capturado antes de destruir el componente en paso 3)
    // Si el usuario aún está en paso 2, leer directamente del componente vivo
    const snap = this.viaticosSnapshot;
    const vf = this.viaticosFieldsRef;
    const datosViaticos = v.datosAdicionales || {};
    const items = snap?.items ?? vf?.getItemsForSubmit() ?? [];
    const tipoSolicitudViaticos = snap?.tipoSolicitudViaticos ?? vf?.tipoSolicitudViaticos() ?? 'SOLICITUD_VIATICOS';
    const fechaMaximaEvento =
      datosViaticos.fechaMaximaEvento ||
      snap?.fechaMaximaEvento ||
      vf?.getFechaMaximaEvento() ||
      '';

    const solicitudPayload = {
      tipoSolicitudViaticos,
      nombreEmpresa: datosViaticos.nombreEmpresa || v.empresaCentroCostos || '',
      nit: datosViaticos.nit || '',
      centroCosto: datosViaticos.centroCosto || v.empresaCentroCostos || '',
      areaDependencia: datosViaticos.areaDependencia || v.areaDepartamento || '',
      ciudad: datosViaticos.ciudad || '',
      bancoCuenta: datosViaticos.bancoCuenta || '',
      tipoCuentaBancaria: datosViaticos.tipoCuentaBancaria || '',
      numeroCuentaBancaria: datosViaticos.numeroCuentaBancaria || '',
      nombreTitularCuenta: datosViaticos.nombreTitularCuenta || '',
      fechaMaximaEvento,
      nombreCompleto: v.nombre,
      cargo: v.cargo,
      correoElectronico: v.correoElectronico,
      telefonoExt: v.telefonoContacto,
      // Excluir la propiedad `soporte` (File) del JSON — se envía por separado en FormData
      items: items.map(({ soporte, ...rest }: any) => rest),
      observaciones: snap?.observaciones || vf?.observacionesViaticos() || v.observaciones || '',
    };

    const formData = new FormData();
    formData.append('solicitud', new Blob([JSON.stringify(solicitudPayload)], { type: 'application/json' }));

    // Adjuntar el soporte de cada ítem con clave indexada (itemSoporte_0, itemSoporte_1, ...)
    // El backend puede asociar cada archivo al ítem por su posición en el array
    items.forEach((item: any, index: number) => {
      if (item.soporte instanceof File) {
        formData.append(`itemSoporte_${index}`, item.soporte, item.soporte.name);
      }
    });

    const soportesAdicionales = snap?.soportesAdicionales ?? vf?.soportesAdicionales() ?? [];
    soportesAdicionales.forEach(f => formData.append('soportesAdicionales', f));

    const certificadoBancario = snap?.certificadoBancario ?? vf?.getCertificadoBancario() ?? null;
    if (certificadoBancario instanceof File) {
      formData.append('certificadoBancario', certificadoBancario, certificadoBancario.name);
    }

    this.tesoreriaService.createSolicitudViaticos(formData).subscribe({
      next: () => this.handleSubmitSuccess(),
      error: (err) => {
        console.error('Error al enviar viáticos:', err);
        this.isSubmitting.set(false);
        this.submitError.set(
          err?.error?.message ||
            err?.error?.error ||
            'No fue posible enviar la solicitud de viáticos. Verifique los campos y archivos.',
        );
      },
    });
  }

  private getViaticosRuntimeValidationError(v: any): string | null {
    const snap = this.viaticosSnapshot;
    const vf = this.viaticosFieldsRef;
    const items = snap?.items ?? vf?.getItemsForSubmit() ?? [];
    if (!items.length) {
      return 'Debe registrar al menos un ítem de gasto para viáticos.';
    }

    const certificadoBancario =
      snap?.certificadoBancario ?? vf?.getCertificadoBancario() ?? null;
    if (!(certificadoBancario instanceof File)) {
      return 'Debe adjuntar el certificado bancario para continuar.';
    }

    return null;
  }

  private buildInvalidFormMessage(): string {
    const tipo = this.solicitudForm.get('tipoRequerimiento')?.value;
    if (tipo !== 'VIATICOS') {
      return 'Hay campos requeridos sin completar. Revise el formulario.';
    }

    const group = this.solicitudForm.get('datosAdicionales') as FormGroup | null;
    if (!group) {
      return 'No se encontró la sección de datos adicionales de viáticos.';
    }

    const missing: string[] = [];
    const requiredMap: Record<string, string> = {
      ciudad: 'Ciudad destino',
      fechaMaximaEvento: 'Fecha máxima del evento',
      bancoCuenta: 'Banco',
      tipoCuentaBancaria: 'Tipo de cuenta',
      numeroCuentaBancaria: 'Número de cuenta',
      nombreTitularCuenta: 'Titular de la cuenta',
    };

    Object.entries(requiredMap).forEach(([key, label]) => {
      const ctrl = group.get(key);
      if (ctrl?.invalid) {
        missing.push(label);
      }
    });

    if (missing.length === 0) {
      return 'Hay datos de viáticos incompletos. Revise los campos requeridos.';
    }

    return `Complete los campos requeridos: ${missing.join(', ')}.`;
  }

  private buildMesaAyudaData(datos: any, v: any): any {
    const now = new Date().toISOString();
    const numeroTicket =
      typeof datos?.numeroTicket === 'string' && datos.numeroTicket.trim().length > 0
        ? datos.numeroTicket.trim()
        : `TK-${Date.now().toString().slice(-8)}`;

    return {
      ...datos,
      numeroTicket,
      fechaHoraCreacion: datos?.fechaHoraCreacion || now.slice(0, 16),
      nombreEmpresa: v.empresaCentroCostos || datos?.nombreEmpresa || '',
      nombreCompleto: v.nombre || '',
      cargo: v.cargo || '',
      correoElectronico: v.correoElectronico || '',
      telefono: v.telefonoContacto || '',
      estado: datos?.estado || 'ABIERTO',
      nivel: Number(datos?.nivel || 1),
      historialAcciones: Array.isArray(datos?.historialAcciones)
        ? datos.historialAcciones
        : [
            {
              id: 1,
              fecha: now,
              accion: 'CREACION',
              descripcion: 'Ticket creado desde Solicitud de Tesoreria',
              usuario: v.nombre || 'Sistema',
              nivel: 1,
            },
          ],
    };
  }

  // =====================================================
  // Reset del formulario
  // =====================================================

  resetForm(): void {
    const today = new Date().toISOString().split('T')[0];

    // Remover datos adicionales dinámicos antes de resetear
    if (this.solicitudForm.contains('datosAdicionales')) {
      this.solicitudForm.removeControl('datosAdicionales');
    }
    this.datosAdicionalesGroup.set(null);

    // Habilitar todos los controles antes de resetear
    ['nombre', 'correoElectronico', 'telefonoContacto', 'cargo', 'areaDepartamento', 'empresaCentroCostos'].forEach(
      (ctrl) => this.solicitudForm.get(ctrl)?.enable()
    );

    this.solicitudForm.reset({
      fechaSolicitud: today,
      areaDepartamento: '',
      cargo: '',
      nombre: '',
      correoElectronico: '',
      telefonoContacto: '',
      tipoRequerimiento: '',
      otroRequerimiento: '',
      esCompra: false,
      observaciones: '',
    });

    this.employeeSearch.set('');
    this.cargoSearch.set('');
    this.selectedEmployee.set(null);
    this.documentoFile.set(null);
    this.currentUserPrefilled.set(false);
    this.viaticosSnapshot = null;

    // Re-aplicar datos del usuario autenticado
    this.prefillFromCurrentUser();
  }

  // =====================================================
  // Helpers privados
  // =====================================================

  private handleSubmitSuccess(): void {
    this.isSubmitting.set(false);
    this.submitError.set('');
    this.showSuccess.set(true);
  
    const tipoEnviado = this.solicitudForm.get('tipoRequerimiento')?.value as string;

    this.resetForm();

    setTimeout(() => {
      this.showSuccess.set(false);
      if (tipoEnviado === 'VIATICOS') {
        this.router.navigate(['/viaticos/mis-solicitudes']);
      } else if (tipoEnviado === 'MESA_AYUDA') {
        this.router.navigate(['/mesa-ayuda/nivel/1']);
      } else {
        this.router.navigate(['/tesoreria/bandeja-solicitudes']);
      }
    }, 1500);
  }
}
