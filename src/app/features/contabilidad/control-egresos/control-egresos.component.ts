import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Component, OnInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap, of, Subscription, expand, reduce, EMPTY, catchError } from 'rxjs';
import { ControlEgresosService } from './control-egresos.service';
import { EgresoRegistrado, CheckDuplicadoResponse, CotizacionEgreso, CAUSALES_ELIMINACION } from './control-egresos.model';
import { ComprobantePagoService, EgresoOcrExtraido } from '../../../modules/tesoreria/services/comprobante-pago.service';
import { AuthService } from '../../../core/services/auth.service';
import { PresupuestoContextService } from '../../presupuesto/services/presupuesto-context.service';
import { PresupuestoService } from '../../presupuesto/services/presupuesto.service';
import { PagoProyectado } from '../../presupuesto/models/presupuesto.model';
import { GpPermisoDirective } from '../../presupuesto/directives/gp-permiso.directive';
import { GpEmpresaSelectorComponent } from '../../presupuesto/components/gp-empresa-selector/gp-empresa-selector.component';
import { ProveedorService } from '../../proveedores/services/proveedor.service';

@Component({
  selector: 'app-control-egresos',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, ReactiveFormsModule, GpPermisoDirective, GpEmpresaSelectorComponent, RouterLink],
  templateUrl: './control-egresos.component.html',
  styleUrls: ['./control-egresos.component.scss'],
})
export class ControlEgresosComponent implements OnInit, OnDestroy {
  // Estado de vista
  viewMode = signal<'list' | 'form'>('list');

  // Datos
  egresos = signal<EgresoRegistrado[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  enviandoId = signal<number | null>(null);

  // Mensajes (toast propio estilo tesorería)
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  // Solicitud de eliminación + ajuste de retenciones
  editando = signal<EgresoRegistrado | null>(null);
  editForm!: FormGroup;
  guardandoAjuste = signal(false);
  /** Solo admin puede eliminar por ahora (luego: rol editor contable) */
  esAdmin = signal(false);
  /** Solicitud de eliminación en curso (modal de causal) */
  eliminando = signal<EgresoRegistrado | null>(null);
  causalSeleccionada = signal('');
  enviandoSolicitud = signal(false);
  causalesEliminacion = CAUSALES_ELIMINACION;

  // Revisión de Gerencia Financiera (modal de rechazo con observación)
  rechazandoRevision = signal<EgresoRegistrado | null>(null);
  motivoRechazo = signal('');
  guardandoRevision = signal(false);

  /** El egreso es nuevo: primera y única vez (chequeado, sin coincidencias) */
  esPrimeraVez = computed(
    () =>
      this.viewMode() === 'form' &&
      this.chequeoCompleto() &&
      !this.isCheckingDuplicado() &&
      !this.duplicadoDetectado().existe &&
      !this.duplicadoDetectado().facturaDuplicada,
  );

  // Formulario
  form!: FormGroup;

  // Duplicados
  isCheckingDuplicado = signal(false);
  duplicadoDetectado = signal<CheckDuplicadoResponse>({ existe: false });
  private duplicadoSub: Subscription | null = null;
  /** Chequeo en vivo completado con los 4 campos llenos */
  chequeoCompleto = signal(false);

  // Imagen del egreso + retenciones calculadas
  archivoNombre = signal<string | null>(null);
  analizando = signal(false);
  draggingArchivo = signal(false);
  /** Fase actual del análisis (barra de progreso) */
  faseAnalisis = signal('');
  private faseTimer: ReturnType<typeof setInterval> | null = null;
  private readonly fasesAnalisis = [
    'Subiendo imagen...',
    'Leyendo documento con OCR...',
    'Extrayendo factura y valores...',
    'Detectando retenciones...',
    'Casi listo...',
  ];
  /** Datos extraídos pendientes de aplicar al formulario */
  extraido = signal<EgresoOcrExtraido | null>(null);
  cotizacion = signal<CotizacionEgreso | null>(null);
  cotizando = signal(false);
  /** Error visible si la cotización falla (antes se tragaba en silencio) */
  cotizacionError = signal<string | null>(null);
  private cotizacionSub: Subscription | null = null;
  /** ICA leído del comprobante (tarifa por mil o valor directo) */
  icaDocumento = signal<{ tarifaPorMil: number | null; valor: number | null }>({ tarifaPorMil: null, valor: null });
  /** Edición manual de retenciones en la tarjeta Total (null = automático) */
  rfEdit = signal<number | null>(null);
  icaEdit = signal<number | null>(null);
  /** Valores efectivos (manual si se editó, si no lo calculado) */
  rfEfectiva = computed(() => this.rfEdit() ?? this.cotizacion()?.reteFuente ?? null);
  icaEfectiva = computed(
    () => this.icaEdit() ?? this.cotizacion()?.reteIca ?? this.docIcaCalculado(),
  );
  netoEfectivo = computed(() => {
    const v = Number(this.form?.get('valor')?.value);
    const rf = this.rfEfectiva();
    const ri = this.icaEfectiva();
    if (v > 0 && rf != null && ri != null) return Math.max(0, Math.round((v - rf - ri) * 100) / 100);
    return this.cotizacion()?.valorNetoPagar ?? (v > 0 ? v : null);
  });

  /**
   * ICA calculado en local con lo del documento (respaldo si la
   * cotización del servidor aún no llega: lo escaneado se conserva).
   */
  docIcaCalculado = computed(() => {
    const v = Number(this.form?.get('valor')?.value);
    const t = this.icaDocumento().tarifaPorMil;
    if (v > 0 && t != null) return Math.round(((v * t) / 1000) * 100) / 100;
    return this.icaDocumento().valor;
  });

  /** Hay respaldo del documento para mostrar aunque falle cotizar */
  get tieneRespaldoDoc(): boolean {
    return this.docIcaCalculado() != null;
  }

  tiposOperacion = ['COMPRAS', 'SERVICIOS', 'HONORARIOS', 'ARRENDAMIENTOS', 'TRANSPORTE', 'OTROS'];

  // KPIs
  totalRegistrados = computed(() => this.egresos().length);
  pendientesEnvio = computed(() => this.egresos().filter((e) => e.estado === 'REGISTRADO').length);
  enRevisionGerencia = computed(
    () => this.egresos().filter((e) => e.estado === 'EN_REVISION_GERENCIA').length,
  );
  enviadosTesoreria = computed(() =>
    this.egresos().filter((e) => e.estado === 'ENVIADO_TESORERIA' || e.estado === 'PAGADO').length,
  );
  valorTotal = computed(() => this.egresos().reduce((acc, e) => acc + Number(e.valor || 0), 0));

  // Buscador lista
  searchTerm = signal('');
  filteredEgresos = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const all = this.egresos();
    if (!q) return all;
    return all.filter(
      (e) =>
        e.numeroFactura?.toLowerCase().includes(q) ||
        e.nitProveedor?.toLowerCase().includes(q) ||
        this.nombreEgreso(e).toLowerCase().includes(q) ||
        e.proveedorNombre?.toLowerCase().includes(q),
    );
  });

  // Pagos Proyectados del Presupuesto (para enlazar)
  pagosProyectados = signal<PagoProyectado[]>([]);
  pagoProyectadoSeleccionado = signal<PagoProyectado | null>(null);
  isLoadingPagos = signal(false);
  private pagosSub: Subscription | null = null;

  /** Egreso registrado (vigente) vinculado a cada pago proyectado. */
  egresoPorPago = computed(() => {
    const mapa = new Map<number, EgresoRegistrado>();
    for (const e of this.egresos()) {
      if (e.pagoProyectadoId && e.estado !== 'ELIMINADO') {
        mapa.set(e.pagoProyectadoId, e);
      }
    }
    return mapa;
  });

  /** Pagos aprobados por gerencia — solo estos se gestionan en Egresos. */
  pagosAprobados = computed(() => this.pagosProyectados().filter((p) => p.aprobado === true));

  /** Pagos aprobados que aún no tienen egreso registrado. */
  pagosPendientesEgreso = computed(() =>
    this.pagosAprobados().filter((p) => !this.egresoPorPago().has(p.id)),
  );

  /** Filas "pendientes de egreso" en la tabla, respetando el buscador. */
  pagosPendientesFiltrados = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    const pendientes = this.pagosPendientesEgreso();
    if (!q) return pendientes;
    return pendientes.filter(
      (p) => p.nit?.toLowerCase().includes(q) || p.nombre?.toLowerCase().includes(q),
    );
  });

  constructor(private route: ActivatedRoute, 
    private fb: FormBuilder,
    private controlEgresosService: ControlEgresosService,
    private comprobantePagoService: ComprobantePagoService,
    private authService: AuthService,
    public ctx: PresupuestoContextService,
    private presupuestoService: PresupuestoService,
    private proveedorService: ProveedorService,
  ) {
    this.initForm();
    // Si cambia la empresa del GP (selector), refrescar los pagos proyectados.
    // allowSignalWrites: cargarPagosProyectados() actualiza signals de estado.
    effect(
      () => {
        this.pagoProyectadoSeleccionado.set(null);
        this.cargarPagosProyectados();
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.searchTerm.set(this.route.snapshot.queryParamMap.get("buscar") ?? "");
    // El permiso real lo resuelve la matriz de roles (backend); aquí solo se
    // cargan las causales OFICIALES desde el backend (con respaldo local).
    this.esAdmin.set(((this.authService.getCurrentUser()?.username) || '').toLowerCase() === 'admin');
    this.controlEgresosService.listarCausalesEliminacion().subscribe({
      next: (lista) => { if (lista && lista.length > 0) this.causalesEliminacion = lista; },
      error: () => {},
    });
    this.loadEgresos();
    this.setupDuplicadoValidation();
    this.setupCotizacion();
    if (this.ctx.empresas().length === 0) {
      this.ctx.cargar();
    }
    // Gerencia Financiera llega directo a Contabilidad: asegura sus permisos.
    if (this.ctx.permisos() === null) {
      this.ctx.cargarPermisos();
    }
  }

  initForm(): void {
    this.form = this.fb.group({
      numeroFactura: ['', Validators.required],
      nitProveedor: ['', Validators.required],
      proveedorNombre: [''],
      valor: [null, [Validators.required, Validators.min(0.01)]],
      fecha: [this.hoyLocal(), Validators.required],
      cuenta: [''],
      tipoOperacion: ['COMPRAS'],
      observaciones: [''],
    });
  }

  /** Fecha local de hoy en formato yyyy-MM-dd (sin desfase UTC). */
  private hoyLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Campos obligatorios que faltan para poder guardar (para el aviso del botón). */
  esNominaAgregada(): boolean { return this.pagoProyectadoSeleccionado()?.moduloOrigen === 'nomina'; }

  camposFaltantes(): string[] {
    if (this.esNominaAgregada()) return [];
    const faltan: string[] = [];
    if (!this.form.get('numeroFactura')?.value) faltan.push('Número de Egreso');
    if (!this.form.get('nitProveedor')?.value) faltan.push('NIT Proveedor');
    const valor = Number(this.form.get('valor')?.value ?? 0);
    if (!valor || valor <= 0) faltan.push('Valor');
    if (!this.form.get('fecha')?.value) faltan.push('Fecha');
    return faltan;
  }

  private setupDuplicadoValidation(): void {
    // El formulario se re-crea en openNuevo(): re-suscribir siempre al form actual
    this.duplicadoSub?.unsubscribe();
    this.duplicadoSub = this.form.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(
          (a, b) =>
            a.numeroFactura === b.numeroFactura &&
            a.nitProveedor === b.nitProveedor &&
            a.valor === b.valor &&
            a.fecha === b.fecha,
        ),
        switchMap((val) => {
          const { numeroFactura, nitProveedor, valor, fecha } = val;
          if (!numeroFactura || !nitProveedor || !valor || !fecha) {
            this.duplicadoDetectado.set({ existe: false });
            this.chequeoCompleto.set(false);
            return of(null);
          }
          this.isCheckingDuplicado.set(true);
          return this.controlEgresosService.checkDuplicado(
            numeroFactura,
            nitProveedor,
            Number(valor),
            fecha,
          ).pipe(catchError(() => {
            this.isCheckingDuplicado.set(false);
            this.chequeoCompleto.set(false);
            this.displayToast('No fue posible verificar duplicados. Intente nuevamente.', 'error');
            return EMPTY;
          }));
        }),
      )
      .subscribe((res) => {
        this.isCheckingDuplicado.set(false);
        if (res) {
          this.duplicadoDetectado.set(res);
          this.chequeoCompleto.set(true);
        }
      });
  }

  loadEgresos(): void {
    this.isLoading.set(true);
    this.controlEgresosService.listar().subscribe({
      next: (data) => {
        this.egresos.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  // ── Cotización de retenciones en vivo (sistema calcula fuente + ICA) ──

  openNuevo(): void {
    this.initForm();
    this.duplicadoDetectado.set({ existe: false });
    this.setupDuplicadoValidation();
    this.archivoNombre.set(null);
    this.extraido.set(null);
    this.detenerFases();
    this.cotizacion.set(null);
    this.setupCotizacion();
    this.cotizacionError.set(null);
    this.chequeoCompleto.set(false);
    this.icaDocumento.set({ tarifaPorMil: null, valor: null });
    this.rfEdit.set(null);
    this.icaEdit.set(null);
    this.pagoProyectadoSeleccionado.set(null);
    this.cargarPagosProyectados();
    this.viewMode.set('form');
  }

  cargarPagosProyectados(): void {
    this.pagosSub?.unsubscribe();
    this.pagosProyectados.set([]);
    const empresaId = this.ctx.empresaId();
    this.isLoadingPagos.set(empresaId !== null);
    if (empresaId === null) return;
    const cargarPagina = (page: number) => this.presupuestoService.pagos(empresaId, { estado: 'proyectado', size: 100, page });
    this.pagosSub = cargarPagina(0).pipe(
      expand(pagina => pagina.page + 1 < pagina.totalPages ? cargarPagina(pagina.page + 1) : EMPTY),
      reduce((todos, pagina) => [...todos, ...pagina.content], [] as PagoProyectado[]),
    ).subscribe({
      next: pagos => {
        if (this.ctx.empresaId() !== empresaId) return;
        this.pagosProyectados.set(pagos);
        this.isLoadingPagos.set(false);
      },
      error: () => {
        if (this.ctx.empresaId() !== empresaId) return;
        this.pagosProyectados.set([]);
        this.isLoadingPagos.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.pagosSub?.unsubscribe();
    this.duplicadoSub?.unsubscribe();
    this.cotizacionSub?.unsubscribe();
    this.detenerFases();
  }

  seleccionarPagoProyectado(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (!id) {
      this.pagoProyectadoSeleccionado.set(null);
      return;
    }
    const pago = this.pagosProyectados().find(p => p.id === id);
    if (pago) this.aplicarPago(pago);
  }

  /** Abre el formulario con el pago proyectado precargado (desde el listado). */
  registrarDesdePago(pago: PagoProyectado): void {
    if (pago.moduloOrigen === 'nomina') {
      this.isSaving.set(true);
      this.controlEgresosService.desdePago(pago.id, null).subscribe({
        next: () => { this.isSaving.set(false); this.viewMode.set('list'); this.loadEgresos(); this.displayToast('Egreso agregado de nómina registrado.', 'success'); },
        error: e => { this.isSaving.set(false); this.displayToast(e?.error?.message ?? 'No se pudo registrar la nómina.', 'error'); }
      }); return;
    }
    this.openNuevo();
    this.aplicarPago(pago);
  }

  /** Egreso registrado vinculado a un pago proyectado (si existe). */
  egresoDePago(p: PagoProyectado): EgresoRegistrado | undefined {
    return this.egresoPorPago().get(p.id);
  }

  nombreEgreso(e: EgresoRegistrado): string {
    if (e.tipoOperacion !== 'NOMINA') return e.proveedorNombre || '—';
    const empresa = e.empresaNombre;
    return `${e.conceptoPresupuestal || 'Nómina agregada'}${empresa ? ' — ' + empresa : ''}`;
  }

  /** Pago proyectado vinculado a un egreso registrado (si existe). */
  pagoDeEgreso(e: EgresoRegistrado): PagoProyectado | null {
    return e.pagoProyectadoId
      ? (this.pagosProyectados().find((p) => p.id === e.pagoProyectadoId) ?? null)
      : null;
  }

  /** Compara el valor del egreso contra el monto del pago proyectado. */
  comparacion(e: EgresoRegistrado, p: PagoProyectado): { coincide: boolean; diferencia: number } {
    const diferencia = Number(e.valor ?? 0) - Number(p.montoProyectado ?? 0);
    return { coincide: Math.abs(diferencia) < 0.01, diferencia };
  }

  /** Diferencia entre el valor digitado del egreso y el pago proyectado vinculado. */
  diferenciaValorPago(): number {
    const pago = this.pagoProyectadoSeleccionado();
    if (!pago) return 0;
    return Number(this.form.get('valor')?.value ?? 0) - Number(pago.montoProyectado ?? 0);
  }

  /** ¿El valor del egreso coincide con el pago proyectado vinculado? */
  coincideValorPago(): boolean {
    return Math.abs(this.diferenciaValorPago()) < 0.01;
  }

  private aplicarPago(pago: PagoProyectado): void {
    this.pagoProyectadoSeleccionado.set(pago);
    if (pago.moduloOrigen === 'nomina') {
      this.form.patchValue({ nitProveedor: '', proveedorNombre: '', cuenta: '', valor: pago.montoProyectado, tipoOperacion: 'NOMINA' }, {emitEvent: false});
      this.duplicadoDetectado.set({existe: false, facturaDuplicada: false});
      return;
    }
    this.form.patchValue({
      nitProveedor: pago.nit,
      proveedorNombre: pago.nombre,
      valor: pago.montoProyectado,
      tipoOperacion: pago.categoria === 'SERVICIOS' ? 'SERVICIOS' : 'COMPRAS'
    });
    // Completa la cuenta bancaria del proveedor (maestro) si el contador no la ha escrito.
    if (!this.form.get('cuenta')?.value && pago.nit) {
      this.proveedorService.buscarPorNit(pago.nit).subscribe((prov) => {
        if (prov?.numeroCuenta && !this.form.get('cuenta')?.value) {
          this.form.patchValue({ cuenta: prov.numeroCuenta });
        }
      });
    }
  }

  // ── Menú de acciones (puntitos) del listado ──
  menuEgreso = signal<{ id: number; x: number; y: number } | null>(null);

  /** Egreso del menú abierto (para pintar las acciones según su estado). */
  egresoMenu = computed(() => {
    const m = this.menuEgreso();
    if (!m) return null;
    return this.egresos().find((e) => e.id === m.id) ?? null;
  });

  toggleMenuEgreso(e: EgresoRegistrado, ev: MouseEvent): void {
    ev.stopPropagation();
    const id = e.id;
    if (!id) return;
    if (this.menuEgreso()?.id === id) {
      this.menuEgreso.set(null);
      return;
    }
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuEgreso.set({ id, x: Math.max(8, rect.right - 224), y: rect.bottom + 6 });
  }

  private setupCotizacion(): void {
    this.cotizacionSub?.unsubscribe();
    this.cotizacionSub = this.form.valueChanges
      .pipe(
        debounceTime(600),
        distinctUntilChanged(
          (a, b) => a.valor === b.valor && a.nitProveedor === b.nitProveedor && a.tipoOperacion === b.tipoOperacion,
        ),
        switchMap((val) => {
          const valor = Number(val.valor);
          if (!valor || valor <= 0) {
            this.cotizacion.set(null);
            this.cotizacionError.set(null);
            return of(null);
          }
          this.cotizando.set(true);
          this.cotizacionError.set(null);
          const tarifaDoc = this.icaDocumento().tarifaPorMil;
          return this.controlEgresosService.cotizar(valor, val.nitProveedor, val.tipoOperacion, tarifaDoc);
        }),
      )
      .subscribe({
        next: (res) => {
          this.cotizando.set(false);
          this.cotizacion.set(res);
          // Al llegar cálculo nuevo del sistema, se limpia la edición manual
          this.rfEdit.set(null);
          this.icaEdit.set(null);
        },
        error: (err) => {
          this.cotizando.set(false);
          const detalle = err?.error?.message || err?.message || err?.statusText || 'sin respuesta';
          this.cotizacionError.set(`No se pudo calcular (${err?.status ?? '?'}): ${detalle}`);
        },
      });
  }

  /** Re-cotiza usando la tarifa ICA del documento (si cambió) */
  private recotizarConDocumento(): void {
    const valor = Number(this.form.get('valor')?.value);
    if (!valor || valor <= 0) return;
    this.cotizando.set(true);
    this.cotizacionError.set(null);
    this.controlEgresosService
      .cotizar(valor, this.form.get('nitProveedor')?.value, this.form.get('tipoOperacion')?.value, this.icaDocumento().tarifaPorMil)
      .subscribe({
        next: (res) => {
          this.cotizando.set(false);
          this.cotizacion.set(res);
        },
        error: (err) => {
          this.cotizando.set(false);
          this.cotizacionError.set(`No se pudo calcular (${err?.status ?? '?'}). Intente de nuevo.`);
        },
      });
  }

  // ── Imagen del egreso: arrastrar o adjuntar, pre-llena el formulario ──

  onDragOverArchivo(event: DragEvent): void {
    event.preventDefault();
    this.draggingArchivo.set(true);
  }

  onDragLeaveArchivo(event: DragEvent): void {
    event.preventDefault();
    this.draggingArchivo.set(false);
  }

  onDropArchivo(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.draggingArchivo.set(false);
    if (event.dataTransfer?.files?.length) {
      this.procesarImagenEgreso(event.dataTransfer.files[0]);
    }
  }

  onFileSelectedArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.procesarImagenEgreso(input.files[0]);
      input.value = '';
    }
  }

  private procesarImagenEgreso(file: File): void {
    this.analizando.set(true);
    this.archivoNombre.set(file.name);
    this.extraido.set(null);
    // Barra de progreso con fases mientras el OCR trabaja
    let faseIdx = 0;
    this.faseAnalisis.set(this.fasesAnalisis[0]);
    this.faseTimer = setInterval(() => {
      faseIdx = Math.min(faseIdx + 1, this.fasesAnalisis.length - 1);
      this.faseAnalisis.set(this.fasesAnalisis[faseIdx]);
    }, 1500);
    this.comprobantePagoService.analizarYExtraerEgreso(file).subscribe({
      next: (ext) => {
        this.detenerFases();
        this.analizando.set(false);
        this.extraido.set(ext);
      },
      error: () => {
        this.detenerFases();
        this.analizando.set(false);
        this.displayToast('No se pudo analizar la imagen. Diligencie los campos manualmente.', 'error');
      },
    });
  }

  private detenerFases(): void {
    if (this.faseTimer !== null) {
      clearInterval(this.faseTimer);
      this.faseTimer = null;
    }
    this.faseAnalisis.set('');
  }

  /** Aplica los datos de la tarjetica al formulario */
  aplicarExtraido(): void {
    const ext = this.extraido();
    if (!ext) return;
    const patch: Record<string, unknown> = {};
    if (ext.numeroFactura) patch['numeroFactura'] = ext.numeroFactura;
    if (ext.nit) patch['nitProveedor'] = ext.nit;
    if (ext.proveedor) patch['proveedorNombre'] = ext.proveedor;
    if (ext.valor != null && ext.valor > 0) patch['valor'] = ext.valor;
    if (ext.fecha) patch['fecha'] = ext.fecha;
    this.form.patchValue(patch);
    if (ext.tarifaIcaPorMil != null || ext.reteIcaValor != null) {
      this.icaDocumento.set({ tarifaPorMil: ext.tarifaIcaPorMil, valor: ext.reteIcaValor });
      this.recotizarConDocumento();
    }
    
    // Auto-vincular Pago Proyectado si coincide NIT y Valor aprox
    if (ext.nit && ext.valor) {
      const coincidencia = this.pagosProyectados().find(p =>
        p.nit === ext.nit &&
        Math.abs((p.montoProyectado ?? 0) - ext.valor!) < 100 // Margen de diferencia de 100 pesos
      );
      if (coincidencia) {
        this.pagoProyectadoSeleccionado.set(coincidencia);
        // Una sola vista: se oculta la tarjeta del OCR y queda el formulario
        // con el panel de comparación.
        this.extraido.set(null);
        this.displayToast(`Datos aplicados. Se vinculó automáticamente al pago proyectado de ${coincidencia.nombre}`, 'success');
        return;
      }
    }
    this.extraido.set(null);
    this.displayToast('Datos aplicados al formulario, verifíquelos', 'success');
  }

  /** Descarta lo cargado (imagen + datos extraídos) */
  descartarExtraido(): void {
    this.extraido.set(null);
    this.archivoNombre.set(null);
    this.icaDocumento.set({ tarifaPorMil: null, valor: null });
  }

  cancelar(): void {
    this.viewMode.set('list');
  }

  guardar(): void {
    if (this.isSaving()) return;
    if (!this.pagoProyectadoSeleccionado() && this.ctx.empresaId() === null) {
      this.displayToast('Selecciona la empresa del egreso para registrarlo también en pagos proyectados.', 'error');
      return;
    }
    const nomina = this.pagoProyectadoSeleccionado();
    if (nomina?.moduloOrigen === 'nomina') { this.registrarDesdePago(nomina); return; }
    if (this.form.invalid || this.duplicadoDetectado().existe || this.duplicadoDetectado().facturaDuplicada) {
      this.form.markAllAsTouched();
      if (this.duplicadoDetectado().existe || this.duplicadoDetectado().facturaDuplicada) {
        this.displayToast('No se puede guardar: el número de egreso ya está registrado y no se puede repetir.', 'error');
      }
      return;
    }

    this.isSaving.set(true);
    const formVal = this.form.getRawValue();
    const req: EgresoRegistrado = {
      numeroFactura: String(formVal.numeroFactura).trim(),
      nitProveedor: String(formVal.nitProveedor).trim(),
      proveedorNombre: formVal.proveedorNombre?.trim() || undefined,
      valor: Number(formVal.valor),
      fecha: formVal.fecha,
      cuenta: formVal.cuenta?.trim() || undefined,
      tipoOperacion: formVal.tipoOperacion || 'COMPRAS',
      tarifaIcaPorMil: this.icaDocumento().tarifaPorMil ?? undefined,
      reteFuenteManual: this.rfEdit() ?? undefined,
      reteIcaManual: this.icaEdit() ?? undefined,
      observaciones: formVal.observaciones?.trim() || undefined,
      pagoProyectadoId: this.pagoProyectadoSeleccionado()?.id,
      empresaId: this.ctx.empresaId() ?? undefined,
    };

    this.controlEgresosService.registrar(req).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.loadEgresos();
        this.viewMode.set('list');
        this.displayToast('Egreso registrado exitosamente', 'success');
      },
      error: (err) => {
        this.isSaving.set(false);
        const msg = err?.error?.message || 'Error al guardar el egreso. Intente de nuevo.';
        this.displayToast(msg, 'error');
      },
    });
  }

  /** El contador verifica el egreso y lo envía a revisión de Gerencia Financiera. */
  enviarARevision(e: EgresoRegistrado): void {
    if (!e.id) return;
    this.enviandoId.set(e.id);
    this.controlEgresosService.enviarARevision(e.id).subscribe({
      next: () => {
        this.enviandoId.set(null);
        this.loadEgresos();
        this.displayToast(`Egreso ${e.numeroFactura} enviado a revisión de Gerencia Financiera`, 'success');
      },
      error: (err) => {
        this.enviandoId.set(null);
        const msg =
          err?.error?.message ||
          'No se pudo enviar a revisión. Intente de nuevo.';
        this.displayToast(msg, 'error');
      },
    });
  }

  /** Gerencia Financiera aprueba: el egreso pasa al módulo de Tesorería. */
  aprobarRevision(e: EgresoRegistrado): void {
    if (!e.id || this.enviandoId()) return;
    this.enviandoId.set(e.id);
    this.controlEgresosService.aprobarRevision(e.id).subscribe({
      next: () => {
        this.enviandoId.set(null);
        this.loadEgresos();
        this.displayToast(`Egreso ${e.numeroFactura} aprobado: pasa al módulo de Tesorería`, 'success');
      },
      error: (err) => {
        this.enviandoId.set(null);
        this.displayToast(err?.error?.message || 'No se pudo aprobar el egreso.', 'error');
      },
    });
  }

  abrirRechazoRevision(e: EgresoRegistrado): void {
    this.rechazandoRevision.set(e);
    this.motivoRechazo.set('');
  }

  cerrarRechazoRevision(): void {
    this.rechazandoRevision.set(null);
    this.motivoRechazo.set('');
  }

  /** Gerencia Financiera rechaza con observación: vuelve al contador. */
  confirmarRechazoRevision(): void {
    const e = this.rechazandoRevision();
    const motivo = this.motivoRechazo().trim();
    if (!e?.id) return;
    if (!motivo) {
      this.displayToast('Escribe la observación del rechazo.', 'warning');
      return;
    }
    this.guardandoRevision.set(true);
    this.controlEgresosService.rechazarRevision(e.id, motivo).subscribe({
      next: () => {
        this.guardandoRevision.set(false);
        this.rechazandoRevision.set(null);
        this.loadEgresos();
        this.displayToast(`Egreso ${e.numeroFactura} devuelto al contador con observación`, 'success');
      },
      error: (err) => {
        this.guardandoRevision.set(false);
        this.displayToast(err?.error?.message || 'No se pudo rechazar el egreso.', 'error');
      },
    });
  }

  abrirSolicitudEliminacion(e: EgresoRegistrado): void {
    this.eliminando.set(e);
    this.causalSeleccionada.set('');
  }

  cerrarSolicitudEliminacion(): void {
    this.eliminando.set(null);
  }

  solicitarEliminacion(): void {
    const e = this.eliminando();
    if (!e?.id || !this.causalSeleccionada()) {
      this.displayToast('Seleccione la causal de eliminación.', 'warning');
      return;
    }
    this.enviandoSolicitud.set(true);
    this.controlEgresosService.solicitarEliminacion(e.id, this.causalSeleccionada()).subscribe({
      next: () => {
        this.enviandoSolicitud.set(false);
        this.eliminando.set(null);
        this.loadEgresos();
        this.displayToast('Solicitud enviada: el editor contable la aprobará o rechazará', 'success');
      },
      error: (err) => {
        this.enviandoSolicitud.set(false);
        this.displayToast(err?.error?.message || 'No se pudo enviar la solicitud.', 'error');
      },
    });
  }

  abrirAjuste(e: EgresoRegistrado): void {
    this.editForm = this.fb.group({
      reteFuente: [Number(e.reteFuente ?? 0), [Validators.required, Validators.min(0)]],
      reteIca: [Number(e.reteIca ?? 0), [Validators.required, Validators.min(0)]],
    });
    this.editando.set(e);
  }

  cerrarAjuste(): void {
    this.editando.set(null);
  }

  guardarAjuste(): void {
    const e = this.editando();
    if (!e?.id || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    this.guardandoAjuste.set(true);
    const v = this.editForm.value;
    this.controlEgresosService.actualizarRetenciones(e.id, Number(v.reteFuente), Number(v.reteIca)).subscribe({
      next: () => {
        this.guardandoAjuste.set(false);
        this.editando.set(null);
        this.loadEgresos();
        this.displayToast('Retenciones actualizadas manualmente', 'success');
      },
      error: (err) => {
        this.guardandoAjuste.set(false);
        this.displayToast(err?.error?.message || 'No se pudo actualizar.', 'error');
      },
    });
  }

  // ── Helpers de presentación ──

  /** Permiso de negocio de Gerencia Financiera (revisa y aprueba egresos). */
  puedeAprobarGerencia(): boolean {
    return this.ctx.tienePermiso('egresos.aprobar_gerencia');
  }

  getEstadoClass(estado: string | undefined): string {
    const map: Record<string, string> = {
      REGISTRADO: 'bg-amber-100 text-amber-700 border border-amber-200',
      EN_REVISION_GERENCIA: 'bg-purple-100 text-purple-700 border border-purple-200',
      ENVIADO_TESORERIA: 'bg-blue-100 text-blue-700 border border-blue-200',
      PAGADO: 'bg-blue-100 text-[#045C94] border border-blue-200',
      ELIMINAR_SOLICITADO: 'bg-orange-100 text-orange-700 border border-orange-300',
    };
    return map[estado ?? ''] ?? 'bg-gray-100 text-gray-700';
  }

  getEstadoLabel(estado: string | undefined): string {
    const map: Record<string, string> = {
      REGISTRADO: 'Registrado',
      EN_REVISION_GERENCIA: 'Enviado para aprobación',
      ENVIADO_TESORERIA: 'Aprobado — en Tesorería',
      PAGADO: 'Pagado',
      ELIMINAR_SOLICITADO: 'Por eliminar',
    };
    return map[estado ?? ''] ?? (estado || '—');
  }

  getInitial(nombre: string | undefined): string {
    if (!nombre) return '?';
    return nombre.charAt(0).toUpperCase();
  }

  toNumberOrNull(raw: string | null | undefined): number | null {
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(raw);
    return isNaN(n) ? null : n;
  }

  /** Fecha compacta dd/MM/yyyy para la tabla (evita ensanchar la columna). */
  formatFechaCorta(fecha: string | null | undefined): string {
    if (!fecha) return '—';
    const m = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return String(fecha).substring(0, 10);
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  formatFecha(fecha: string | null | undefined): string {    if (!fecha) return '—';
    const d = new Date(fecha + 'T00:00:00');
    if (isNaN(d.getTime())) return fecha;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private displayToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }
}
