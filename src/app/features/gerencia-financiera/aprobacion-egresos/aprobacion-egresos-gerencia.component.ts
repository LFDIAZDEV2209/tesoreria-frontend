import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { firstValueFrom } from 'rxjs';
import { ControlEgresosService } from '../../contabilidad/control-egresos/control-egresos.service';
import { EgresoRegistrado } from '../../contabilidad/control-egresos/control-egresos.model';
import { PresupuestoContextService } from '../../presupuesto/services/presupuesto-context.service';

@Component({
  selector: 'app-aprobacion-egresos-gerencia',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  templateUrl: './aprobacion-egresos-gerencia.component.html',
  styleUrl: './aprobacion-egresos-gerencia.component.scss',
})
export class AprobacionEgresosGerenciaComponent implements OnInit {
  readonly egresos = signal<EgresoRegistrado[]>([]);
  readonly cargando = signal(false);
  readonly procesandoId = signal<number | null>(null);
  readonly aprobandoLote = signal(false);
  readonly seleccion = signal<Set<number>>(new Set<number>());
  readonly busqueda = signal('');
  readonly filtroOrigen = signal<'todos' | 'gp' | 'contabilidad'>('todos');
  readonly empresaFiltro = signal<number | null | 'todas'>('todas');
  readonly rechazando = signal<EgresoRegistrado | null>(null);
  readonly causalRechazo = signal('');
  readonly causalOtra = signal('');
  readonly menuAbiertoId = signal<number | null>(null);
  /** 'devolucion' = DEV (vuelve a Tesorería para corregir) · 'negacion' = NEG (rechazo definitivo). */
  readonly modoRechazo = signal<'devolucion' | 'negacion'>('devolucion');

  readonly causalesDevolucion: readonly string[] = [
    'DEV-001 - Documentación incompleta',
    'DEV-002 - Información incorrecta',
    'DEV-003 - Inconsistencia de valores',
    'DEV-004 - Error contable o presupuestal',
    'DEV-005 - Error tributario',
    'DEV-006 - Falta de aprobación previa',
    'DEV-007 - Falta de evidencia de recibido',
    'DEV-008 - Inconsistencia contractual',
    'DEV-009 - Información bancaria por validar',
    'DEV-010 - Soportes ilegibles o inválidos',
    'DEV-011 - Error en fechas o período contable',
    'DEV-012 - Requiere ajuste o aclaración',
  ];

  readonly causalesNegacion: readonly string[] = [
    'NEG-001 - Gasto no autorizado',
    'NEG-002 - Pago duplicado o ya realizado',
    'NEG-003 - Obligación no reconocida',
    'NEG-004 - Incumplimiento contractual',
    'NEG-005 - Falta de disponibilidad presupuestal',
    'NEG-006 - Bien o servicio no recibido',
    'NEG-007 - Irregularidad documental',
    'NEG-008 - Beneficiario o cuenta no validada',
    'NEG-009 - Incumplimiento de políticas o requisitos',
    'NEG-010 - Operación no justificada o con riesgo crítico',
  ];

  readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
  ];

  readonly showToast = signal(false);
  readonly toastMessage = signal('');
  readonly toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  readonly pendientes = computed(() => this.egresos().filter((e) => e.estado === 'EN_REVISION_GERENCIA'));

  readonly filtrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const origen = this.filtroOrigen();
    const empresa = this.empresaFiltro();
    return this.pendientes().filter((e) => {
      if (origen === 'gp' && e.pagoProyectadoId == null) return false;
      if (origen === 'contabilidad' && e.pagoProyectadoId != null) return false;
      if (empresa !== 'todas' && (e.empresaId ?? null) !== empresa) return false;
      if (!q) return true;
      return [e.numeroFactura, e.proveedorNombre, e.nitProveedor, e.numeroEgreso, e.empresaNombre, e.creadoPor, e.conceptoPresupuestal]
        .some((valor) => valor?.toLowerCase().includes(q));
    });
  });

  /** Empresas reales con egresos pendientes de aprobación (pestañas). */
  readonly empresasPendientes = computed<{ id: number | null; clave: string; nombre: string; total: number }[]>(() => {
    const mapa = new Map<string, { id: number | null; clave: string; nombre: string; total: number }>();
    for (const e of this.pendientes()) {
      const id = e.empresaId ?? null;
      const clave = id == null ? 'sin-empresa' : String(id);
      const nombre = e.empresaNombre || (id == null ? 'Sin empresa' : `Empresa ${id}`);
      const fila = mapa.get(clave);
      if (fila) fila.total++;
      else mapa.set(clave, { id, clave, nombre, total: 1 });
    }
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly montoPendiente = computed(() =>
    this.pendientes().reduce((total, e) => total + Number(e.valorNetoPagar ?? e.valor ?? 0), 0),
  );

  readonly dePagosProyectados = computed(() =>
    this.pendientes().filter((e) => e.pagoProyectadoId != null).length,
  );

  readonly todosSeleccionados = computed(() =>
    this.filtrados().length > 0 && this.filtrados().every((e) => e.id != null && this.seleccion().has(e.id)),
  );

  readonly seleccionadosCount = computed(() =>
    this.filtrados().filter((e) => e.id != null && this.seleccion().has(e.id)).length,
  );

  readonly montoSeleccionado = computed(() =>
    this.filtrados()
      .filter((e) => e.id != null && this.seleccion().has(e.id))
      .reduce((total, e) => total + Number(e.valorNetoPagar ?? e.valor ?? 0), 0),
  );

  /** El select está vacío o en "OTRA": se exige escribir la causal. */
  readonly esOtraCausal = computed(() => {
    const causal = this.causalRechazo();
    return causal === '' || causal === 'OTRA';
  });

  /** Causales que muestra el modal según el modo (devolución vs negación). */
  readonly causalesModal = computed(() =>
    this.modoRechazo() === 'negacion' ? this.causalesNegacion : this.causalesDevolucion,
  );

  readonly tituloModal = computed(() =>
    this.modoRechazo() === 'negacion' ? 'Negar egreso' : 'Devolver egreso',
  );

  readonly detalleModal = computed(() =>
    this.modoRechazo() === 'negacion'
      ? 'El egreso vuelve a la bandeja de Tesorería marcado como negado con tu causal.'
      : 'El egreso vuelve a la bandeja de Tesorería (Cargue de C. Egreso) para corregirlo, volver a cargar el documento y reenviarlo a aprobación.',
  );

  /** Motivo final enviado a rechazarRevision: prefijo del modo + causal (o texto libre). */
  readonly motivoRechazo = computed(() => {
    const prefijo = this.modoRechazo() === 'negacion' ? 'NEGACIÓN — ' : 'DEVOLUCIÓN — ';
    const causal = this.causalRechazo();
    const texto = causal === 'OTRA' || causal === ''
      ? this.causalOtra().trim()
      : causal;
    return (prefijo + texto).slice(0, 300);
  });

  readonly motivoValido = computed(() => this.motivoRechazo().length > 0);

  constructor(
    private readonly service: ControlEgresosService,
    public readonly ctx: PresupuestoContextService,
  ) {}

  ngOnInit(): void {
    if (this.ctx.permisos() === null) this.ctx.cargarPermisos();
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.service.listar().subscribe({
      next: (data) => {
        this.egresos.set(data ?? []);
        const vigentes = new Set(
          (data ?? []).filter((e) => e.estado === 'EN_REVISION_GERENCIA' && e.id != null).map((e) => e.id!),
        );
        this.seleccion.update((actual) => new Set([...actual].filter((id) => vigentes.has(id))));
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.displayToast('No se pudieron cargar los egresos pendientes.', 'error');
      },
    });
  }

  estaSeleccionado(e: EgresoRegistrado): boolean {
    return e.id != null && this.seleccion().has(e.id);
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  toggleUno(e: EgresoRegistrado): void {
    if (e.id == null) return;
    this.seleccion.update((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(e.id!)) siguiente.delete(e.id!);
      else siguiente.add(e.id!);
      return siguiente;
    });
  }

  toggleTodos(): void {
    if (this.todosSeleccionados()) {
      this.seleccion.set(new Set());
      return;
    }
    this.seleccion.set(new Set(this.filtrados().map((e) => e.id).filter((id): id is number => id != null)));
  }

  limpiarSeleccion(): void {
    this.seleccion.set(new Set());
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.menuAbiertoId() !== null) this.menuAbiertoId.set(null);
  }

  toggleMenu(e: EgresoRegistrado, event: Event): void {
    event.stopPropagation();
    if (e.id == null) return;
    this.menuAbiertoId.update((abierto) => (abierto === e.id ? null : e.id!));
  }

  cerrarMenu(): void {
    this.menuAbiertoId.set(null);
  }

  verterDocumento(e: EgresoRegistrado): void {
    this.cerrarMenu();
    if (!e.soporteEgresoKey) {
      this.displayToast('El egreso no tiene documento adjunto.', 'warning');
      return;
    }
    if (e.id == null) return;
    this.service.verSoporte(e.id).subscribe({
      next: (r) => {
        if (r?.url) window.open(r.url, '_blank');
        else this.displayToast('No se pudo obtener el documento del egreso.', 'error');
      },
      error: (err) =>
        this.displayToast(err?.error?.message || 'No se pudo abrir el documento del egreso.', 'error'),
    });
  }

  aprobar(e: EgresoRegistrado): void {
    this.cerrarMenu();
    if (!e.id || this.procesandoId() || this.aprobandoLote()) return;
    const monto = this.formatear(e.valorNetoPagar ?? e.valor);
    if (!confirm(`¿Aprobar el egreso ${this.identificador(e)} por ${monto}? Pasará automáticamente al módulo de Tesorería.`)) return;
    this.procesandoId.set(e.id);
    this.service.aprobarRevision(e.id).subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.seleccion.update((actual) => {
          const siguiente = new Set(actual);
          siguiente.delete(e.id!);
          return siguiente;
        });
        this.displayToast(`Egreso ${this.identificador(e)} aprobado y enviado a Tesorería.`, 'success');
        this.cargar();
      },
      error: (err) => {
        this.procesandoId.set(null);
        this.displayToast(err?.error?.message || 'No se pudo aprobar el egreso.', 'error');
      },
    });
  }

  async aprobarSeleccionados(): Promise<void> {
    if (this.aprobandoLote() || this.procesandoId()) return;
    const ids = [...this.seleccion()];
    if (!ids.length) return;
    if (!confirm(`¿Aprobar ${ids.length} egreso(s) por ${this.formatear(this.montoSeleccionado())}? Pasarán al módulo de Tesorería.`)) return;
    this.aprobandoLote.set(true);
    let aprobados = 0;
    let errores = 0;
    let primerError = '';
    for (const id of ids) {
      try {
        await firstValueFrom(this.service.aprobarRevision(id));
        aprobados++;
      } catch (err: any) {
        errores++;
        if (!primerError) primerError = err?.error?.message || err?.error?.detail || '';
      }
    }
    this.aprobandoLote.set(false);
    this.seleccion.set(new Set());
    this.displayToast(
      errores
        ? `${aprobados} egreso(s) aprobados; ${errores} con error. ${primerError}`
        : `${aprobados} egreso(s) aprobados y enviados a Tesorería.`,
      errores ? 'warning' : 'success',
    );
    this.cargar();
  }

  abrirRechazo(e: EgresoRegistrado, modo: 'devolucion' | 'negacion'): void {
    this.cerrarMenu();
    this.modoRechazo.set(modo);
    this.rechazando.set(e);
    this.causalRechazo.set('');
    this.causalOtra.set('');
  }

  cerrarRechazo(): void {
    this.rechazando.set(null);
    this.causalRechazo.set('');
    this.causalOtra.set('');
  }

  confirmarRechazo(): void {
    const e = this.rechazando();
    const motivo = this.motivoRechazo();
    const modo = this.modoRechazo();
    if (!e?.id || !motivo || this.procesandoId()) return;
    this.procesandoId.set(e.id);
    this.service.rechazarRevision(e.id, motivo).subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.cerrarRechazo();
        this.seleccion.update((actual) => {
          const siguiente = new Set(actual);
          siguiente.delete(e.id!);
          return siguiente;
        });
        this.displayToast(
          modo === 'negacion'
            ? `Egreso ${this.identificador(e)} negado. Vuelve a la bandeja de Tesorería marcado como negado.`
            : `Egreso ${this.identificador(e)} devuelto a la bandeja de Tesorería para corrección y reenvío.`,
          'warning',
        );
        this.cargar();
      },
      error: (err) => {
        this.procesandoId.set(null);
        this.displayToast(err?.error?.message || 'No se pudo procesar la acción.', 'error');
      },
    });
  }

  identificador(e: EgresoRegistrado): string {
    return e.numeroEgreso?.trim() || e.numeroFactura || `#${e.id}`;
  }

  egresoOrigen(e: EgresoRegistrado): string {
    return e.pagoProyectadoId != null ? 'Pagos Proyectados' : 'Contabilidad';
  }

  egresoRetenciones(e: EgresoRegistrado): number {
    return Number(e.reteFuente ?? 0) + Number(e.reteIca ?? 0);
  }

  egresoNeto(e: EgresoRegistrado): number {
    return Number(e.valorNetoPagar ?? e.valor ?? 0);
  }

  formatear(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(Number(valor));
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
