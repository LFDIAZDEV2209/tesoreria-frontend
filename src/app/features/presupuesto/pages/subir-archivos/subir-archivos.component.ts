import { GpImportJsonComponent } from '../../components/gp-import-json/gp-import-json.component';
import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { MaestroImportacion } from '../../models/presupuesto.model';
import { gpStagger, gpPop, gpBackdrop, gpExpander, gpSwap } from '../../animations/gp-animations';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpEmpresaSelectorComponent } from '../../components/gp-empresa-selector/gp-empresa-selector.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { formatoCOP, formatoMiles } from '../../models/presupuesto.model';
import { periodoHistorico } from '../../models/historico.model';
import { HOJAS_PLANTILLA, PLANTILLA_MAESTRO_NOMBRE, PLANTILLA_MAESTRO_URL } from '../../plantilla-maestro';
import { mensajeError } from '../../services/gp-errores';

@Component({
  selector: 'app-subir-archivos',
  standalone: true,
  imports: [GpImportJsonComponent, CommonModule, RouterLink, GpPageHeaderComponent, GpEmpresaSelectorComponent, GpIconComponent],
  animations: [gpStagger, gpPop, gpBackdrop, gpExpander, gpSwap],
  templateUrl: './subir-archivos.component.html',
  styleUrls: ['./subir-archivos.component.scss'],
})
export class SubirArchivosComponent implements OnInit {

  archivo = signal<File | null>(null);
  progreso = signal(0);
  importando = signal(false);
  error = signal<string | null>(null);
  resultado = signal<MaestroImportacion | null>(null);
  dragActivo = signal(false);
  confirmarAbierto = signal(false);
  detalleAbierto = signal(false);

  // Asistente paso a paso (stepper).
  paso = signal(1);
  plantillaDescargada = signal(false);
  generandoPlantilla = signal(false);

  readonly pasos = [
    { titulo: 'Descargar plantilla', icono: 'download' },
    { titulo: 'Subir archivo', icono: 'upload' },
    { titulo: 'Importar', icono: 'layers' },
    { titulo: 'Listo', icono: 'check' },
  ];

  /** Hojas que trae la plantilla descargable (chips del paso 1). */
  readonly hojasPlantilla = HOJAS_PLANTILLA;

  // Conteos animados del success (0 → valor real).
  totalMovimientos = signal(0);
  totalTerceros = signal(0);
  totalPagos = signal(0);
  totalImpuestos = signal(0);
  totalPeriodos = signal(0);

  /** Desglose de lo que se importa (para el acordeón del adjunto). */
  readonly desglose = [
    { icono: 'users', color: '#0F766E', titulo: 'Hojas SIIGO (4)', detalle: 'Proveedores · Anticipos · CxP · CxC — movimientos + maestro', etiqueta: 'REEMPLAZA', etiquetaColor: '#C2410C' },
    { icono: 'calendar', color: '#045C94', titulo: 'Hoja "Presupuesto 2026"', detalle: 'Contrato + periodos (Secciones A/B/D y estampillas)', etiqueta: 'ACTUALIZA', etiquetaColor: '#045C94' },
    { icono: 'layers', color: '#D97706', titulo: 'Bloque Impuestos', detalle: 'Retefuente, ICA, pólizas y estampillas → módulo Impuestos', etiqueta: 'CREA', etiquetaColor: '#047857' },
    { icono: 'coins', color: '#7C3AED', titulo: 'Saldos pendientes', detalle: 'Pagos proyectados por proveedor con fecha de vencimiento', etiqueta: 'CREA', etiquetaColor: '#047857' },
  ];

  /** Estilo por módulo para los chips del resultado (lenguaje kpi de la bandeja). */
  readonly MODULO_META: Record<string, { color: string; icono: string }> = {
    proveedores: { color: '#0F766E', icono: 'users' },
    anticipos: { color: '#7C3AED', icono: 'wallet' },
    cx_pagar: { color: '#C2410C', icono: 'credit-card' },
    cx_cobrar: { color: '#059669', icono: 'trending' },
    impuestos: { color: '#D97706', icono: 'calculator' },
  };

  metaModulo(modulo: string): { color: string; icono: string } {
    return this.MODULO_META[modulo] ?? { color: '#045C94', icono: 'layers' };
  }

  constructor(
    public ctx: PresupuestoContextService,
    private service: PresupuestoService,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
  }

  /** Etapa legible del proceso según el % de subida. */
  etapa = computed(() => {
    const p = this.progreso();
    if (p < 25) return 'Subiendo archivo…';
    if (p < 55) return 'Leyendo hojas SIIGO del Excel…';
    if (p < 85) return 'Cargando contrato y periodos…';
    return 'Generando pagos proyectados…';
  });

  /** % de avance del asistente (0 → 100). */
  pctWizard = computed(() => Math.round(((this.paso() - 1) / (this.pasos.length - 1)) * 100));

  /** Solo se puede volver a pasos ya alcanzados (y nunca durante la importación). */
  puedeIr(n: number): boolean {
    if (this.importando() || this.resultado() || n === this.paso()) return false;
    if (n <= 2) return true;
    return n === 3 && !!this.archivo();
  }

  irAPaso(n: number): void {
    if (this.puedeIr(n)) this.paso.set(n);
  }

  /** Descarga la plantilla del Excel maestro (formato oficial, sin datos). */
  async descargarPlantilla(): Promise<void> {
    if (this.generandoPlantilla()) return;
    this.error.set(null);
    this.generandoPlantilla.set(true);
    try {
      const blob = await firstValueFrom(this.http.get(PLANTILLA_MAESTRO_URL, { responseType: 'blob' }));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = PLANTILLA_MAESTRO_NOMBRE;
      a.click();
      URL.revokeObjectURL(url);
      this.plantillaDescargada.set(true);
    } catch {
      this.error.set('No se pudo descargar la plantilla. Intenta de nuevo.');
    } finally {
      this.generandoPlantilla.set(false);
    }
  }

  /** Quita el adjunto y regresa al paso de subida. */
  quitarArchivo(): void {
    this.archivo.set(null);
    this.detalleAbierto.set(false);
    this.error.set(null);
    if (this.paso() === 3) this.paso.set(2);
  }

  onArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file) {
      this.archivo.set(file);
      this.detalleAbierto.set(true);
      this.paso.set(3);
    }
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActivo.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) {
      this.archivo.set(file);
      this.detalleAbierto.set(true);
      this.paso.set(3);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActivo.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActivo.set(false);
  }

  limpiar(): void {
    this.archivo.set(null);
    this.resultado.set(null);
    this.error.set(null);
    this.progreso.set(0);
    this.confirmarAbierto.set(false);
    this.detalleAbierto.set(false);
    this.paso.set(1);
    this.totalMovimientos.set(0);
    this.totalTerceros.set(0);
    this.totalPagos.set(0);
    this.totalImpuestos.set(0);
    this.totalPeriodos.set(0);
  }

  /** Abre el modal de confirmación (reemplaza el confirm nativo). */
  importar(): void {
    if (!this.ctx.tienePermiso('modulos.importar')) return;
    if (!this.archivo()) return;
    if (this.ctx.empresaId() === null) {
      if (this.ctx.empresas().length === 0) this.ctx.cargar();
      const mensaje = this.ctx.error()
        ? `No se pudieron cargar las empresas: ${this.ctx.error()}`
        : 'No hay una empresa cargada todavía. Si se está cargando, espera un momento y vuelve a intentar.';
      if (this.ctx.error()) this.error.set(mensaje);
      return;
    }
    this.confirmarAbierto.set(true);
  }

  /** El usuario confirmó — arranca la importación real. */
  async confirmarImportacion(): Promise<void> {
    if (!this.ctx.tienePermiso('modulos.importar')) {
      this.confirmarAbierto.set(false);
      return;
    }
    const archivo = this.archivo();
    const empresaId = this.ctx.empresaId();
    if (!archivo || empresaId === null) return;

    this.confirmarAbierto.set(false);
    this.importando.set(true);
    this.error.set(null);
    this.resultado.set(null);
    this.progreso.set(0);

    try {
      const r = await firstValueFrom(this.service.importarMaestro(empresaId, archivo, (pct) => this.progreso.set(pct)));
      this.resultado.set(r ?? null);
      if (r) {
        this.animarConteos(r);
        this.paso.set(4);
      }
    } catch (e: any) {
      this.error.set(mensajeError(e, 'No se pudo importar el archivo maestro. Revisa el formato e intenta de nuevo.'));
    } finally {
      this.importando.set(false);
    }
  }

  /** Anima los contadores del resumen (0 → valor real, ease-out, ~900ms). */
  private animarConteos(r: MaestroImportacion): void {
    const movimientos = r.modulos.reduce((a, m) => a + m.movimientos, 0);
    const terceros = r.modulos.reduce((a, m) => a + m.proveedores, 0);
    const metas = {
      movimientos,
      terceros,
      pagos: r.pagosProyectados,
      impuestos: r.impuestosMovimientos,
      periodos: r.periodos.length,
    };
    const duracion = 900;
    const inicio = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / duracion);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cúbico
      this.totalMovimientos.set(Math.round(metas.movimientos * e));
      this.totalTerceros.set(Math.round(metas.terceros * e));
      this.totalPagos.set(Math.round(metas.pagos * e));
      this.totalImpuestos.set(Math.round(metas.impuestos * e));
      this.totalPeriodos.set(Math.round(metas.periodos * e));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  cp(v: number | null | undefined): string { return formatoCOP(v); }

  /** Mes legible de los periodos creados ("2026-03" → "Marzo 2026"). */
  etiquetaMes(p: string): string { return periodoHistorico(p); }

  /** Conteos con separador de miles es-CO ("1.234 movimientos"). */
  fm(v: number | null | undefined): string { return formatoMiles(v); }

  /** Tamaño del archivo con decimales es-CO ("1,24 MB"). */
  private fmtMb = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  tamanio(bytes: number | null | undefined): string {
    return `${this.fmtMb.format((bytes ?? 0) / 1024 / 1024)} MB`;
  }
}
