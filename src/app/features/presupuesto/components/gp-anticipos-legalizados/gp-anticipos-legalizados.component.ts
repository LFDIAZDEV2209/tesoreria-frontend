import { Component, effect, HostListener, inject, OnDestroy, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { animate, style, transition, trigger } from '@angular/animations';
import { Subscription } from 'rxjs';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import {
  AnticipoLegalizadoFila, EstadoLegalizacionFiltro, GpAnticipoLegalizacionService,
  LegalizacionAnticipo, RepositorioAnticiposLegalizados, ResumenLegalizacionAnticipos,
} from '../../services/gp-anticipo-legalizacion.service';
import { formatoCOP, formatearFechaCO } from '../../models/presupuesto.model';
import { periodoHistorico } from '../../models/historico.model';
import { mensajeError } from '../../services/gp-errores';
import { gpPop, gpStagger } from '../../animations/gp-animations';
import { GpSkeletonComponent } from '../gp-skeleton/gp-skeleton.component';
import { GpErrorStateComponent } from '../gp-error-state/gp-error-state.component';
import { GpEmptyStateComponent } from '../gp-empty-state/gp-empty-state.component';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { GpKpiComponent } from '../gp-kpi/gp-kpi.component';

const ETIQUETAS_ESTADO: Record<EstadoLegalizacionFiltro, string> = {
  todos: 'Todos', legalizados: 'Legalizados', pendientes: 'Pendientes',
};

/**
 * Animaciones del flujo de legalización — las mismas del módulo (copiadas de
 * la página de módulo, que a su vez las copió de Control de Bancos):
 * apertura/cierre del modal, contenido (subida + escala) y despliegue de
 * ítems de archivo.
 */
const glModalAnimation = trigger('glModalAnimation', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('200ms ease-out', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('150ms ease-in', style({ opacity: 0 })),
  ]),
]);

const glModalContent = trigger('glModalContent', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(30px) scale(0.95)' }),
    animate('350ms cubic-bezier(0.33, 1, 0.68, 1)',
      style({ opacity: 1, transform: 'translateY(0) scale(1)' })
    ),
  ]),
]);

const glSlideDown = trigger('glSlideDown', [
  transition(':enter', [
    style({ opacity: 0, height: 0, overflow: 'hidden' }),
    animate('300ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, height: '*' })),
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0, height: 0 })),
  ]),
]);

/**
 * Repositorio "Anticipos legalizados": anticipos de TODOS los meses con el
 * estado de su legalización, filtros por proveedor, rango de meses y estado,
 * y la posibilidad de legalizar un anticipo de un mes anterior sin salir de
 * la vista. Reutiliza el lenguaje visual y las animaciones del módulo
 * (banner degradado navy→azul con acento oro, KPIs compactos, tabla con
 * encabezado navy, filas escalonadas y el modal de legalización copiado de
 * Control de Bancos).
 */
@Component({
  selector: 'app-gp-anticipos-legalizados', standalone: true,
  imports: [CommonModule, FormsModule, GpSkeletonComponent, GpErrorStateComponent,
    GpEmptyStateComponent, GpIconComponent, GpKpiComponent],
  templateUrl: './gp-anticipos-legalizados.component.html',
  styleUrls: ['./gp-anticipos-legalizados.component.scss'],
  animations: [gpStagger, gpPop, glModalAnimation, glModalContent, glSlideDown],
})
export class GpAnticiposLegalizadosComponent implements OnDestroy {
  readonly ctx = inject(PresupuestoContextService);
  private readonly api = inject(GpAnticipoLegalizacionService);
  private readonly toast = inject(PresupuestoToastService);

  // ── Filtros ──
  readonly texto = signal('');
  readonly desde = signal('');
  readonly hasta = signal('');
  readonly estado = signal<EstadoLegalizacionFiltro>('todos');
  readonly estadosFiltro: EstadoLegalizacionFiltro[] = ['todos', 'legalizados', 'pendientes'];
  page = 0;
  size = 20;
  private timerBusqueda: any = null;

  // ── Datos ──
  readonly loading = signal(true);
  readonly error = signal('');
  readonly pagina = signal<RepositorioAnticiposLegalizados | null>(null);
  readonly resumen = signal<ResumenLegalizacionAnticipos | null>(null);
  /** Catálogo de meses con anticipos para los selectores (del backend). */
  readonly periodos = signal<string[]>([]);
  readonly legalizaciones = signal<Map<number, LegalizacionAnticipo[]>>(new Map());
  readonly cargandoLegalizaciones = signal(false);
  readonly errorLegalizaciones = signal('');

  readonly cp = formatoCOP;
  readonly etiqueta = periodoHistorico;
  readonly etiquetasEstado = ETIQUETAS_ESTADO;

  // ── Modal de legalización (mismo flujo del módulo, meses anteriores) ──
  readonly legalizarMov = signal<AnticipoLegalizadoFila | null>(null);
  readonly archivoLegalizar = signal<File | null>(null);
  valorLegalizar = '';
  observacionLegalizar = '';
  readonly subiendoLegalizacion = signal(false);
  readonly errorArchivoLegalizar = signal('');
  readonly validandoArchivoLegalizar = signal(false);
  private seleccionArchivo = 0;

  // ── Quitar comprobantes de legalización ──
  readonly quitarConfirm = signal<LegalizacionAnticipo | null>(null);
  readonly quitando = signal(false);

  private consulta?: Subscription;
  private consultaLista?: Subscription;
  private solicitud = 0;
  private solicitudLegalizaciones = 0;

  get hayFiltrosActivos(): boolean {
    return !!(this.texto() || this.desde() || this.hasta() || this.estado() !== 'todos');
  }

  get totalesPeriodo(): string {
    const pagina = this.pagina();
    return pagina ? `${new Intl.NumberFormat('es-CO').format(pagina.totalElements)} anticipos` : '';
  }

  constructor() {
    // La empresa del workspace manda: al cambiarla se reinicia la consulta.
    effect(() => {
      const empresaId = this.ctx.empresaId();
      untracked(() => { this.page = 0; this.cargar(empresaId); });
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void {
    this.consulta?.unsubscribe();
    this.consultaLista?.unsubscribe();
    clearTimeout(this.timerBusqueda);
    this.solicitud++;
    this.solicitudLegalizaciones++;
  }

  /** Esc cierra el flujo respetando el orden de apertura (igual que el módulo). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.quitarConfirm()) { this.cerrarQuitar(); return; }
    if (this.legalizarMov()) this.cerrarLegalizar();
  }

  // ── Consulta ──

  cargar(empresaId: number | null = this.ctx.empresaId()): void {
    this.consulta?.unsubscribe();
    const solicitud = ++this.solicitud;
    const vigente = () => solicitud === this.solicitud && empresaId === this.ctx.empresaId();
    this.error.set('');
    if (empresaId === null) { this.pagina.set(null); this.resumen.set(null); this.loading.set(false); return; }
    this.loading.set(true);
    this.consulta = this.api.repositorio(empresaId, {
      texto: this.texto(), desde: this.desde(), hasta: this.hasta(), estado: this.estado(),
      page: this.page, size: this.size,
    }).subscribe({
      next: r => {
        if (!vigente()) return;
        // Tras legalizar/quitar la página visible puede quedar fuera de rango.
        if (r.totalPages > 0 && this.page >= r.totalPages) {
          this.page = r.totalPages - 1;
          this.cargar(empresaId);
          return;
        }
        this.pagina.set(r);
        this.resumen.set(r.resumen);
        if (r.periodos?.length) this.periodos.set(r.periodos);
        this.loading.set(false);
        this.cargarLegalizaciones(empresaId);
      },
      error: e => {
        if (!vigente()) return;
        this.error.set(e.status === 404
          ? 'El repositorio de anticipos legalizados todavía no está disponible. Reintenta o vuelve a la vista mensual.'
          : mensajeError(e));
        this.loading.set(false);
      },
    });
  }

  /** Comprobantes de los movimientos visibles (mismo contrato del módulo). */
  private cargarLegalizaciones(empresaId: number): void {
    this.consultaLista?.unsubscribe();
    const solicitud = ++this.solicitudLegalizaciones;
    this.errorLegalizaciones.set('');
    this.cargandoLegalizaciones.set(false);
    const ids = (this.pagina()?.content ?? []).map((f) => f.movimientoId).filter((id) => id != null);
    if (!ids.length) { this.legalizaciones.set(new Map()); return; }
    this.cargandoLegalizaciones.set(true);
    this.consultaLista = this.api.listar(empresaId, ids).subscribe({
      next: (filas) => {
        if (solicitud !== this.solicitudLegalizaciones || empresaId !== this.ctx.empresaId()) return;
        const mapa = new Map<number, LegalizacionAnticipo[]>();
        for (const fila of filas) {
          const lista = mapa.get(fila.movimientoId) ?? [];
          lista.push(fila);
          mapa.set(fila.movimientoId, lista);
        }
        for (const lista of mapa.values()) lista.sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? '') || b.id - a.id);
        this.legalizaciones.set(mapa);
        this.cargandoLegalizaciones.set(false);
      },
      error: e => {
        if (solicitud !== this.solicitudLegalizaciones || empresaId !== this.ctx.empresaId()) return;
        this.cargandoLegalizaciones.set(false);
        this.errorLegalizaciones.set(mensajeError(e));
      },
    });
  }

  // ── Filtros ──

  onTexto(event: Event): void {
    this.texto.set((event.target as HTMLInputElement).value);
    clearTimeout(this.timerBusqueda);
    this.timerBusqueda = setTimeout(() => { this.page = 0; this.cargar(); }, 350);
  }

  onFecha(campo: 'desde' | 'hasta', valor: string): void {
    (campo === 'desde' ? this.desde : this.hasta).set(valor);
    this.page = 0;
    this.cargar();
  }

  onEstado(estado: EstadoLegalizacionFiltro): void {
    this.estado.set(estado);
    this.page = 0;
    this.cargar();
  }

  limpiarFiltros(): void {
    this.texto.set('');
    this.desde.set('');
    this.hasta.set('');
    this.estado.set('todos');
    this.page = 0;
    this.cargar();
  }

  paginar(delta: number): void {
    const totalPages = this.pagina()?.totalPages ?? 0;
    const nueva = this.page + delta;
    if (nueva < 0 || nueva >= Math.max(totalPages, 1)) return;
    this.page = nueva;
    this.cargar();
  }

  rango(): string { return `Página ${this.page + 1} / ${Math.max(this.pagina()?.totalPages ?? 1, 1)}`; }

  // ── Helpers de la tabla ──

  legalizacionesDe(fila: AnticipoLegalizadoFila): LegalizacionAnticipo[] {
    return this.legalizaciones().get(fila.movimientoId) ?? [];
  }

  legalizacionesVigentes(fila: AnticipoLegalizadoFila): LegalizacionAnticipo[] {
    return this.legalizacionesDe(fila).filter((l) => !l.anulada);
  }

  legalizacionesAnuladas(fila: AnticipoLegalizadoFila): LegalizacionAnticipo[] {
    return this.legalizacionesDe(fila).filter((l) => l.anulada);
  }

  estaLegalizado(fila: AnticipoLegalizadoFila): boolean {
    return fila.vigentes > 0;
  }

  tooltipAnuladas(fila: AnticipoLegalizadoFila): string {
    return this.legalizacionesAnuladas(fila)
      .map((l) => `${l.archivoNombre || 'Comprobante'}: ${l.motivoAnulacion || 'sin motivo registrado'}`)
      .join(' · ');
  }

  saldoAbsoluto(valor: number | null | undefined): string { return formatoCOP(Math.abs(valor ?? 0)); }

  formatearFecha(fecha: string | null | undefined): string { return formatearFechaCO(fecha); }

  retardoFila(indice: number): number { return Math.min(indice, 14) * 38; }

  // ── Legalización (flujo copiado del módulo, válido para meses anteriores) ──

  /**
   * Permiso crudo para subir/quitar: la legalización de un anticipo de un mes
   * anterior es evidencia documental y no depende del mes habilitado.
   */
  get puedeLegalizar(): boolean {
    const permisos = this.ctx.permisos();
    if (!permisos) return false;
    if (permisos.superAdmin) return true;
    return permisos.permisos?.includes('modulos.importar') ?? false;
  }

  abrirLegalizar(fila: AnticipoLegalizadoFila): void {
    this.seleccionArchivo++;
    this.errorArchivoLegalizar.set('');
    this.validandoArchivoLegalizar.set(false);
    this.legalizarMov.set(fila);
    this.archivoLegalizar.set(null);
    this.valorLegalizar = '';
    this.observacionLegalizar = '';
    const empresaId = this.ctx.empresaId();
    if (empresaId !== null && !this.legalizaciones().has(fila.movimientoId)) this.cargarLegalizaciones(empresaId);
  }

  cerrarLegalizar(): void {
    this.seleccionArchivo++;
    this.legalizarMov.set(null);
    this.archivoLegalizar.set(null);
    this.subiendoLegalizacion.set(false);
    this.quitando.set(false);
    this.quitarConfirm.set(null);
  }

  async onArchivoLegalizar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    await this.validarArchivoLegalizar(file);
  }

  private async validarArchivoLegalizar(file: File | undefined): Promise<void> {
    const seleccion = ++this.seleccionArchivo;
    this.archivoLegalizar.set(null);
    this.validandoArchivoLegalizar.set(false);
    this.errorArchivoLegalizar.set('');
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      this.errorArchivoLegalizar.set('Selecciona un comprobante en formato PDF.'); return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      this.errorArchivoLegalizar.set('El PDF debe contener información y pesar máximo 10 MB.'); return;
    }
    this.validandoArchivoLegalizar.set(true);
    try {
      const firma = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
      if (seleccion !== this.seleccionArchivo) return;
      if (firma !== '%PDF-') { this.errorArchivoLegalizar.set('El contenido del archivo no corresponde a un PDF válido.'); return; }
      this.archivoLegalizar.set(file);
    } catch {
      if (seleccion === this.seleccionArchivo) this.errorArchivoLegalizar.set('No se pudo leer el PDF. Selecciónalo de nuevo.');
    } finally { if (seleccion === this.seleccionArchivo) this.validandoArchivoLegalizar.set(false); }
  }

  /** Drop del comprobante sobre la zona de carga (igual que Control de Bancos). */
  async onArchivoLegalizarSoltado(event: DragEvent): Promise<void> {
    if (this.subiendoLegalizacion()) return;
    await this.validarArchivoLegalizar(event.dataTransfer?.files?.[0]);
  }

  quitarArchivoLegalizar(): void {
    this.seleccionArchivo++;
    this.validandoArchivoLegalizar.set(false);
    this.archivoLegalizar.set(null);
    this.valorLegalizar = '';
  }

  /** Categoría del archivo para pintar el icono (copiado de Control de Bancos). */
  tipoArchivo(nombre: string | null | undefined): string {
    const ext = (nombre ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xls', 'xlsx'].includes(ext)) return 'excel';
    return 'default';
  }

  tamanoLegible(bytes: number | null | undefined): string {
    if (bytes == null || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Agrupa miles sin completar los decimales mientras se escribe. */
  formatearValorMiles(v: string): string {
    const [entero, ...decimales] = v.replace(/[^\d,]/g, '').split(',');
    const miles = entero.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (miles || (decimales.length ? '0' : '')) + (decimales.length ? ',' + decimales.join('').slice(0, 2) : '');
  }

  parsearValorMiles(v: string): number | null {
    const normalizado = v.trim().replace(/\./g, '').replace(',', '.');
    if (!/^\d+(?:\.\d{0,2})?$/.test(normalizado)) return null;
    const valor = Number(normalizado);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }

  registrarLegalizacion(): void {
    const empresaId = this.ctx.empresaId();
    const fila = this.legalizarMov();
    const file = this.archivoLegalizar();
    if (empresaId === null || !fila || !file || this.subiendoLegalizacion() || !this.puedeLegalizar || this.validandoArchivoLegalizar()) return;
    const valor = this.parsearValorMiles(this.valorLegalizar);
    if (this.valorLegalizar.trim() && valor === null) {
      this.toast.error('El valor legalizado debe ser mayor a cero, o puedes dejarlo vacío.'); return;
    }
    const vigente = () => empresaId === this.ctx.empresaId() && this.legalizarMov()?.movimientoId === fila.movimientoId;
    this.subiendoLegalizacion.set(true);
    this.api.registrar(empresaId, fila.movimientoId, file, valor, this.observacionLegalizar)
      .subscribe({
        next: () => {
          if (!vigente()) return;
          this.subiendoLegalizacion.set(false);
          this.toast.mostrar(fila.periodo
            ? `Comprobante registrado para ${fila.nombre || 'el anticipo'} · se aplica en ${this.etiqueta(fila.periodo)}`
            : `Comprobante de legalización registrado para ${fila.nombre || 'el anticipo'}`);
          this.archivoLegalizar.set(null);
          this.valorLegalizar = '';
          this.observacionLegalizar = '';
          // El estado del anticipo cambió: refresca fila, contadores y filtro.
          this.cargar();
        },
        error: (e) => { if (vigente()) { this.subiendoLegalizacion.set(false); this.toast.error(mensajeError(e)); } },
      });
  }

  verDocumentoLegalizacion(l: LegalizacionAnticipo): void {
    const empresaId = this.ctx.empresaId();
    if (empresaId === null) return;
    const ventana = window.open('about:blank', '_blank');
    if (ventana) ventana.opener = null;
    this.api.contenidosArchivo(empresaId, l.id).subscribe({
      next: r => {
        if (empresaId !== this.ctx.empresaId()) { ventana?.close(); return; }
        if (!r.ok || !r.body || r.body.size === 0) {
          ventana?.close();
          this.toast.error('No se pudo abrir el comprobante de legalización. Intenta de nuevo.');
          return;
        }
        if (ventana) {
          const url = URL.createObjectURL(r.body);
          ventana.location.replace(url);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        else this.toast.error('Permite las ventanas emergentes y vuelve a abrir el comprobante.');
      },
      error: () => { ventana?.close(); this.toast.error('No se pudo abrir el comprobante de legalización. Intenta de nuevo.'); },
    });
  }

  /** Cierra la confirmación sin interrumpir una eliminación en curso. */
  cerrarQuitar(): void {
    if (!this.quitando()) this.quitarConfirm.set(null);
  }

  quitar(): void {
    const empresaId = this.ctx.empresaId();
    const l = this.quitarConfirm();
    if (empresaId === null || !l || l.anulada || this.quitando() || !this.puedeLegalizar) return;
    this.quitando.set(true);
    this.api.quitar(empresaId, l.id).subscribe({
      next: () => {
        this.quitando.set(false);
        if (empresaId !== this.ctx.empresaId()) return;
        this.quitarConfirm.set(null);
        this.toast.mostrar(`Comprobante quitado · ${l.archivoNombre || 'Comprobante'}`);
        this.cargar(empresaId);
      },
      error: (e) => {
        this.quitando.set(false);
        if (empresaId === this.ctx.empresaId()) this.toast.error(mensajeError(e));
      },
    });
  }

}
