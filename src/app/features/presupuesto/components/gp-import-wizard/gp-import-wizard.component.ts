import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, EventEmitter, Input, HostListener, OnInit, OnDestroy, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { gpBackdrop, gpPop } from '../../animations/gp-animations';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { GpModalComponent } from '../gp-modal/gp-modal.component';
import { GpOverlayDirective } from '../../directives/gp-overlay.directive';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { MODULOS_CFG, PeriodoOmitidoImportacion, FacturaOmitidaImportacion, PreviewImportacion, formatoCOP as fmtCOPUtil, formatoMiles as fmtMiles } from '../../models/presupuesto.model';
import { periodoHistorico } from '../../models/historico.model';
import { mensajeError } from '../../services/gp-errores';

interface Pendiente {
  nit: string;
  categoria: string | null;
  categoriaDetalle: string | null;
}

/**
 * Asistente de importación SIIGO: Archivo → Procesamiento → Clasificación →
 * Validación → Confirmación → Resultado. La categoría "OTROS" exige detalle.
 * Los terceros sin categoría NO bloquean la confirmación (regla del gestor
 * original): se informan y se pueden asignar después desde la tabla del módulo.
 */
@Component({
  selector: 'app-gp-import-wizard',
  standalone: true,
  hostDirectives: [GpOverlayDirective],
  imports: [SelectBuscableDirective, CommonModule, FormsModule, GpIconComponent, GpModalComponent],
  animations: [gpBackdrop, gpPop],
  templateUrl: './gp-import-wizard.component.html',
  styleUrls: ['./gp-import-wizard.component.scss'],
})
export class GpImportWizardComponent implements OnInit, OnDestroy {
  @Input() modulo = '';
  @Input() titulo = '';
  @Input() descripcion = '';
  @Output() finalizado = new EventEmitter<void>();
  @Output() cerrado = new EventEmitter<void>();

  categorias: string[] = [];
  categoriasHistoricas: string[] = [];
  pasos = ['Archivo', 'Categorías', 'Confirmar'];
  pasoDescripciones = ['Sube el Excel SIIGO', 'Asigna a cada proveedor', 'Importar al sistema'];
  readonly modo = signal<'siigo' | 'estructura'>('siigo');
  textoJson = '';
  readonly ejemploJson = JSON.stringify({Proveedores:[],Anticipos:[],CuentasPorCobrar:[],CuentasPorPagar:[]}, null, 2);
  get cuentaPuc(): string { return MODULOS_CFG.find(m => m.modulo === this.modulo)?.puc || ''; }
  cambiarModo(modo: 'siigo' | 'estructura'): void { if (!this.loading()) { this.modo.set(modo); this.error.set(null); } }
  @HostListener('document:keydown.escape') onEscape(): void {
    if (this.modalOmitidos()) { this.cerrarModalOmitidos(); return; }
    this.cerrarOverlay();
  }

  step = signal(1);
  preview = signal<PreviewImportacion | null>(null);
  pendiente = signal<Record<string, Pendiente>>({});
  error = signal<string | null>(null);
  loading = signal(false);
  uploadPct = signal(0);
  dragActive = false;
  /** Modal informativo: facturas que no se cargaron por estar aprobadas. */
  modalOmitidos = signal(false);
  /** Facturas omitidas del preview: tienen pagos aprobados (escudito). */
  facturasOmitidas = signal<FacturaOmitidaImportacion[]>([]);
  /** Facturas omitidas reportadas al terminar la carga (las del preview). */
  omitidosResultado = signal<FacturaOmitidaImportacion[]>([]);
  cargadosResultado = signal<string[]>([]);

  private _totalMov = 0;
  private _totalProv = 0;
  private cerrando = false;
  private solicitud = 0;
  private empresaPreview: number | null = null;

  constructor(
    private service: PresupuestoService,
    public ctx: PresupuestoContextService,
  ) {}

  ngOnInit(): void {
    this.service.categorias().subscribe({
      next: categorias => { this.categorias = categorias; this.categoriasHistoricas = categorias; },
      error: () => this.error.set('No se pudo cargar el catálogo de categorías.'),
    });
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
  }

  ngOnDestroy(): void { this.solicitud++; this.cerrando = true; }

  get empresaId(): number | null {
    return this.ctx.empresaId();
  }

  cerrarOverlay(): void {
    if (this.cerrando || this.loading()) return;
    this.cerrando = true;
    this.solicitud++;
    this.cerrado.emit();
  }

  // ── Paso 1 ──

  onFileSelected(event: Event): void {
    const archivo = (event.target as HTMLInputElement).files?.[0];
    if (archivo) this.subir(archivo);
  }

  drop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive = false;
    const archivo = event.dataTransfer?.files?.[0];
    if (archivo) this.subir(archivo);
  }

  subir(archivo: File): void {
    if (this.loading() || this.cerrando || !this.ctx.tienePermiso('modulos.importar')) return;
    if (!/\.xlsx?$/i.test(archivo.name)) { this.error.set('Selecciona un archivo Excel .xlsx o .xls.'); return; }
    if (archivo.size > 50 * 1024 * 1024) {
      this.error.set('El archivo supera el límite de 50 MB.');
      return;
    }
    const empresaId = this.empresaId;
    if (!empresaId) return;
    this.error.set(null);
    this.loading.set(true);
    this.uploadPct.set(0);
    const solicitud = ++this.solicitud;
    const vigente = () => solicitud === this.solicitud && empresaId === this.empresaId && !this.cerrando;
    this.service.previewImportacion(this.modulo, empresaId, archivo, (pct) => {
      if (vigente()) this.uploadPct.set(pct);
    }).subscribe({
      next: (preview) => {
        if (!vigente() || !preview) return;
        this.empresaPreview = empresaId;
        this.preview.set(preview);
        const mapa: Record<string, Pendiente> = {};
        for (const p of preview.proveedores) {
          mapa[p.nit] = { nit: p.nit, categoria: p.categoria, categoriaDetalle: p.categoriaDetalle };
        }
        this.pendiente.set(mapa);
        this.loading.set(false);
        const omitidas = preview.facturasOmitidas ?? [];
        this.facturasOmitidas.set(omitidas);
        if (omitidas.length) this.modalOmitidos.set(true);
        if (omitidas.length && !(preview.periodosCargados ?? []).length) {
          this.step.set(1);
          return;
        }
        this.step.set(2);
      },
      error: (err) => {
        if (!vigente()) return;
        this.loading.set(false);
        this.error.set(mensajeError(err, 'No se pudo procesar el archivo. Verifica que sea el reporte correcto e intenta de nuevo.'));
      },
    });
  }

  async importarJson(): Promise<void> {
    const empresaId = this.empresaId;
    if (!empresaId || this.loading() || this.cerrando || !this.ctx.tienePermiso('modulos.importar')) return;
    this.error.set(null);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(this.textoJson);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Se requiere un objeto JSON con los conjuntos de datos.');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'JSON inválido.'); return; }
    const solicitud = ++this.solicitud;
    const vigente = () => solicitud === this.solicitud && empresaId === this.empresaId && !this.cerrando;
    this.loading.set(true);
    try {
      await firstValueFrom(this.service.importarEstructura(empresaId, body));
      if (!vigente()) return;
      this.loading.set(false); this.textoJson = ''; this.finalizado.emit();
    } catch (err: any) {
      if (!vigente()) return;
      this.loading.set(false);
      this.error.set(mensajeError(err, 'Error al importar datos estructurados. Revisa el JSON e intenta de nuevo.'));
    }
  }

  descargarPlantilla(): void {
    const empresaId = this.empresaId;
    if (!empresaId) return;
    this.service.descargarPlantilla(this.modulo, empresaId).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantilla_${this.modulo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── Paso 2 ──

  pCategoria(nit: string): string | null | undefined {
    return this.pendiente()[nit]?.categoria;
  }

  pDetalle(nit: string): string | null | undefined {
    return this.pendiente()[nit]?.categoriaDetalle;
  }

  cambiarCategoria(nit: string, categoria: string | null): void {
    this.pendiente.update((m) => ({ ...m, [nit]: { ...m[nit], categoria, categoriaDetalle: categoria !== 'OTROS' ? null : m[nit]?.categoriaDetalle ?? null } }));
  }

  cambiarDetalle(nit: string, detalle: string): void {
    this.pendiente.update((m) => ({ ...m, [nit]: { ...m[nit], categoriaDetalle: detalle } }));
  }

  cambiarDetalleEvent(nit: string, event: Event): void {
    this.cambiarDetalle(nit, (event.target as HTMLInputElement).value);
  }

  sinCategorias(): string[] {
    const p = this.preview();
    if (!p) return [];
    return p.proveedores.filter((pr) => !this.pendiente()[pr.nit]?.categoria).map((pr) => pr.nit);
  }

  otrosSinDetalle(): boolean {
    const p = this.preview();
    if (!p) return false;
    return p.proveedores.some((pr) => {
      const pend = this.pendiente()[pr.nit];
      return pend?.categoria === 'OTROS' && !pend.categoriaDetalle?.trim();
    });
  }

  async confirmar(): Promise<void> {
    const empresaId = this.empresaId;
    const p = this.preview();
    if (!empresaId || !p || p.importacionId == null || this.loading() || this.cerrando ||
        empresaId !== this.empresaPreview || !this.ctx.tienePermiso('modulos.importar')) return;
    this.error.set(null);
    if (this.otrosSinDetalle()) {
      this.error.set('Indique el detalle de las categorías OTROS antes de confirmar.');
      return;
    }
    const cambios = Object.values(this.pendiente()).filter(pd => {
      const inicial = p.proveedores.find(pr => pr.nit === pd.nit);
      return !!pd.categoria && (pd.categoria !== inicial?.categoria ||
        (pd.categoriaDetalle ?? '') !== (inicial?.categoriaDetalle ?? ''));
    });
    if (cambios.length && !this.ctx.tienePermiso('modulos.categorizar')) {
      this.error.set('No tiene permiso para modificar categorías.');
      return;
    }
    const solicitud = ++this.solicitud;
    const vigente = () => solicitud === this.solicitud && empresaId === this.empresaId && !this.cerrando;
    this.loading.set(true);
    try {
      await Promise.all(cambios.map(pd => firstValueFrom(
        this.service.asignarCategoria(empresaId, pd.nit, pd.categoria!, pd.categoriaDetalle, this.modulo))));
      if (!vigente()) return;
      if (!this.ctx.tienePermiso('modulos.importar')) {
        this.loading.set(false);
        this.error.set('El permiso de importación cambió. No se confirmó el archivo.');
        return;
      }
      const resultado = await firstValueFrom(this.service.confirmarImportacion(empresaId, p.importacionId!));
      if (!vigente()) return;
      this._totalMov = resultado.totalFilas;
      this._totalProv = resultado.totalProveedores;
      // Las omisiones se conocen desde el preview (el confirm no las repite).
      this.omitidosResultado.set(this.facturasOmitidas());
      this.cargadosResultado.set(resultado.periodosCargados ?? []);
      this.loading.set(false);
      this.step.set(3);
    } catch (err: any) {
      if (!vigente()) return;
      this.loading.set(false);
      this.error.set(mensajeError(err, 'No se pudo confirmar. Revisa las categorías e intenta de nuevo.'));
    }
  }

  ultimoTotal(): number {
    return this._totalMov;
  }

  ultimoProveedores(): number {
    return this._totalProv;
  }

  formatoMiles(v: number | null | undefined): string {
    return fmtMiles(v);
  }

  fmtCOP(v: number | null | undefined): string {
    return fmtCOPUtil(v);
  }

  pvProveedores(): any[] {
    return this.preview()?.proveedores ?? [];
  }

  pvMov(): number {
    return this.preview()?.totalMovimientos ?? 0;
  }

  pvProv(): number {
    return this.preview()?.totalProveedores ?? 0;
  }

  pvPucs(): string {
    return (this.preview()?.cuentaPuc ?? []).join(', ') || '—';
  }

  // ── Meses detectados / omitidos ──

  periodosCargados(): string[] {
    return this.preview()?.periodosCargados ?? [];
  }

  periodosOmitidos(): PeriodoOmitidoImportacion[] {
    return this.preview()?.periodosOmitidos ?? [];
  }

  etiquetaPeriodoMes(p: string): string {
    return periodoHistorico(p);
  }

  /** Cierra el modal: con carga parcial simplemente continúa; sin nada cargado descarta. */
  cerrarModalOmitidos(): void {
    if (!this.modalOmitidos()) return;
    this.modalOmitidos.set(false);
    if (!this.periodosCargados().length) this.descartarPreview();
  }

  /** Descarta el preview (nada se cargó o el usuario vuelve a elegir archivo). */
  descartarPreview(): void {
    this.modalOmitidos.set(false);
    this.preview.set(null);
    this.pendiente.set({});
    this.facturasOmitidas.set([]);
    this.omitidosResultado.set([]);
    this.empresaPreview = null;
    this.step.set(1);
  }

  terminar(): void {
    this.finalizado.emit();
  }
}
