import { GpModuloAnualComponent } from '../../components/gp-modulo-anual/gp-modulo-anual.component';
import { GpVistaPeriodosComponent } from '../../components/gp-vista-periodos/gp-vista-periodos.component';
import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ControlEgresosService } from '../../../contabilidad/control-egresos/control-egresos.service';
import { EgresoRegistrado } from '../../../contabilidad/control-egresos/control-egresos.model';
import { EgresoFinancieroComponent } from '../../../../modules/tesoreria/pages/egreso-financiero/egreso-financiero.component';
import { Component, Input, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { gpPop, gpStagger, gpSwap } from '../../animations/gp-animations';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpEstadoBadgeComponent } from '../../components/gp-estado-badge/gp-estado-badge.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpModalComponent } from '../../components/gp-modal/gp-modal.component';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpConfirmarLimpiezaComponent } from '../../components/gp-confirmar-limpieza/gp-confirmar-limpieza.component';
import { GpKpiComponent } from '../../components/gp-kpi/gp-kpi.component';
import { AuthorizationService } from '../../../../core/services/authorization.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import {
  CandidatoPago, FacturaSugerida, PagoProyectado, ResumenPagos,
  PrevisualizarProveedor, SugerenciaPresupuesto,
  ESTADO_PAGO_LABELS, ESTADOS_CONSOLIDADO, CATEGORIA_COLORS,
  formatoCOP, formatoMiles, formatearFechaCO,
} from '../../models/presupuesto.model';
import { GpBadgeCategoriaComponent } from '../../components/gp-badge-categoria/gp-badge-categoria.component';
import { GpEmpresaSelectorComponent } from '../../components/gp-empresa-selector/gp-empresa-selector.component';
import { GpImportWizardComponent } from '../../components/gp-import-wizard/gp-import-wizard.component';
import { generarFacturasAutorizadasPdf } from '../../facturas-autorizadas-pdf';
import { msj } from '../modulo-page/modulo-page.component';
import { GpPaginacionComponent } from '../../components/gp-paginacion/gp-paginacion.component';
import { SECCIONES_EGRESOS, FILTROS_SECCION, FiltrosSeccion, SeccionEgreso, VistaEgreso, seccionDeModulo, coincideBusqueda, paginar } from './egresos-secciones';
import { periodoHistorico } from '../../models/historico.model';

@Component({
  selector: 'app-pagos-proyectados-page',
  standalone: true,
  imports: [GpModuloAnualComponent, GpVistaPeriodosComponent, SelectBuscableDirective,
    EgresoFinancieroComponent,
    CommonModule, FormsModule, GpKpiComponent, GpBadgeCategoriaComponent,
    GpEmpresaSelectorComponent, GpImportWizardComponent,
    GpIconComponent, GpEstadoBadgeComponent, GpSkeletonComponent, GpErrorStateComponent, GpEmptyStateComponent,
    GpModalComponent, GpPageHeaderComponent, GpConfirmarLimpiezaComponent, GpPaginacionComponent,
  ],
  animations: [gpStagger, gpPop, gpSwap],
  templateUrl: './pagos-proyectados-page.component.html',
  styleUrls: ['./pagos-proyectados-page.component.scss'],
})
export class PagosProyectadosPageComponent implements OnInit, OnDestroy {
  @Input() modoHistorico=false;
  @Input() fechaHistorica='';
  readonly origen: 'manual' | 'aprobado' = inject(ActivatedRoute).snapshot.data['origen'] ?? 'aprobado';
  readonly vistaSugeridos = inject(ActivatedRoute).snapshot.data['vista'] === 'sugeridos';
  /**
   * Estado global del presupuesto (contrato): sin la aprobación de Gerencia
   * (botón Aprobar de la página Presupuesto) los pagos proyectados no se
   * muestran en este módulo. No aplica a la vista histórica, a Provisiones
   * (origen manual) ni a la pantalla de Pagos Sugeridos.
   */
  readonly presupuestoAprobado = signal(true);
  readonly pagosBloqueados = computed(() =>
    !this.modoHistorico && !this.vistaSugeridos && this.origen !== 'manual' && !this.presupuestoAprobado());
  /** KPIs y contadores en cero mientras el presupuesto no esté aprobado. */
  valorProyectado(valor: number | null | undefined): number {
    return this.pagosBloqueados() ? 0 : (valor ?? 0);
  }
  /** Instante de la última aprobación global: corte del "reflejo" por lotes. */
  readonly corteReflejo = signal<string | null>(null);
  /**
   * Reflejo por lotes: el pago nació o se aprobó con escudo DESPUÉS de la
   * última aprobación global, así que aún no cuenta en la card, la sección y
   * los KPI; entra al aprobar de nuevo (lo ya reflejado nunca se oculta).
   */
  pendienteReflejo(pago: PagoProyectado): boolean {
    const corte = this.corteReflejo();
    if (!corte) return false;
    const referencia = pago.aprobadoEn ?? pago.createdAt ?? null;
    if (!referencia) return false;
    const t = Date.parse(referencia), c = Date.parse(corte);
    return Number.isFinite(t) && Number.isFinite(c) && t > c;
  }
  /** Nº de cambios (nuevos o recién aprobados) esperando la próxima aprobación. */
  readonly pagosPendientesReflejo = computed(() => this.pagos().filter((p) => this.pendienteReflejo(p)).length);
  /** Un grupo (beneficiario/fecha) contiene cambios por reflejar. */
  grupoConCambiosPendientes(grupo: { pagos: PagoProyectado[] }): boolean {
    return grupo.pagos.some((p) => this.pendienteReflejo(p));
  }
  get vistaMensual():boolean { return this.origen==='manual' || this.vistaSugeridos; }
  get tituloPagina(): string { return this.vistaSugeridos ? 'Pagos Sugeridos' : this.origen === 'manual' ? 'Provisiones' : 'Proyección de Egresos'; }
  readonly secciones = [{id:'todos' as const,label:'Todos los egresos'}, ...SECCIONES_EGRESOS];
  readonly etiquetaPeriodo = periodoHistorico;
  readonly seccion = signal<SeccionEgreso>(this.origen === 'manual' ? 'provisiones' : 'todos');
  /** Secciones del mes que sí tienen egresos (para guiar cuando la actual está vacía). */
  readonly seccionesConDatos = computed(() => this.secciones
    .map(s => ({ id: s.id, label: s.label, count: this.pagosDeSeccion(s.id).length }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count));
  readonly filtrosSecciones = signal<Partial<Record<SeccionEgreso, FiltrosSeccion>>>({});
  readonly paginasSecciones = signal<Record<string, number>>({});
  readonly filtroSeccion = computed(() => this.filtrosSecciones()[this.seccion()] ?? FILTROS_SECCION);
  readonly nombreSeccion = computed(() => this.secciones.find(s => s.id === this.seccion())!.label);
  readonly categoriasSeccion = computed(() => [...new Set([
    ...this.pagosDeSeccion().map(p => p.categoria),
    ...this.sugerenciasDeSeccion().map(s => s.categoria),
    ...this.candidatosDeSeccion().map(c => c.categoria),
  ].filter((c): c is string => !!c))].sort());
  cambiarSeccion(id: SeccionEgreso): void {
    const antes = this.seccion();
    this.seccion.set(id); this.seleccionSugerido.set(new Set()); this.grupoAbierto.set(null);
    // KPIs por proceso: al entrar o salir del tab de cobros se refresca el
    // resumen para no mostrar indicadores de pagos sobre la tabla de cobros.
    if ((antes === 'cx_cobrar') !== (id === 'cx_cobrar')) void this.cargarResumenSeccion();
  }

  /** Resumen del tab activo: Cuentas por Cobrar usa su propio resumen
   *  (modulo=cx_cobrar); el resto, el de egresos. Nunca se mezclan. */
  private async cargarResumenSeccion(): Promise<void> {
    const empresaId = this.empresaId, solicitud = this.solicitudCarga;
    if (empresaId === null) return;
    try {
      const resumen = await firstValueFrom(this.service.resumenPagos(
        empresaId, this.origen === 'manual' ? 'manual' : undefined, this.vistaMensual,
        this.seccion() === 'cx_cobrar' ? 'cx_cobrar' : undefined));
      if (solicitud === this.solicitudCarga && empresaId === this.empresaId) this.resumen.set(resumen);
    } catch { /* conserva el resumen vigente */ }
  }
  filtrarSeccion(campo: keyof FiltrosSeccion, valor: string | number): void {
    const id = this.seccion();
    this.filtrosSecciones.update(f => ({...f, [id]: {...this.filtroSeccion(), [campo]: campo === 'size' ? Number(valor) : valor}}));
    this.paginasSecciones.update(p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(id + ':'))));
    this.seleccionSugerido.set(new Set());
  }
  limpiarSeccion(): void {
    this.filtrosSecciones.update(f => ({...f, [this.seccion()]: {...FILTROS_SECCION}}));
    this.paginasSecciones.update(p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(this.seccion() + ':'))));
    this.seleccionSugerido.set(new Set());
  }
  /** Buscador de empresa del bloque de filtros: elegir una empresa cambia
   *  el workspace (misma URL del selector global) y recarga los pagos. */
  elegirEmpresa(valor: string | number): void {
    const id = Number(valor);
    if (!Number.isSafeInteger(id) || id < 1 || id === this.empresaId) return;
    this.ctx.seleccionarEnUrl(id);
  }
  cambiarPagina(vista: VistaEgreso, pagina: number): void {
    this.paginasSecciones.update(p => ({...p, [this.seccion() + ':' + vista]: pagina}));
  }
  paginaDe<T>(vista: VistaEgreso, filas: T[]) { return paginar(filas, this.paginasSecciones()[this.seccion() + ':' + vista] ?? 1, this.filtroSeccion().size); }
  pagosDeSeccion(id = this.seccion()): PagoProyectado[] { return this.pagos().filter(p => id === 'todos' ? p.moduloOrigen !== 'cx_cobrar' : seccionDeModulo(p.moduloOrigen) === id); }
  private pertenece(modulos: string[] | undefined, nit: string | null, id = this.seccion()): boolean {
    if(id==='todos') return true;
    const origenes = modulos?.length ? modulos : this.pagos().filter(p => !!nit && p.nit === nit).map(p => p.moduloOrigen);
    return origenes.length ? origenes.some(m => seccionDeModulo(m) === id) : id === 'otros';
  }
  sugerenciasDeSeccion(id = this.seccion()): SugerenciaPresupuesto[] { return this.sugerenciasPresupuesto().filter(s => this.pertenece(s.modulos, s.nit, id)); }
  candidatosDeSeccion(): CandidatoPago[] { return this.candidatos().filter(c => this.pertenece(c.modulos, c.nit)); }
  private coincideFila(fila: {categoria?: string | null}, ...campos: unknown[]): boolean {
    return (!this.filtroSeccion().categoria || fila.categoria === this.filtroSeccion().categoria)
      && coincideBusqueda(this.filtroSeccion().busqueda, fila.categoria, ...campos);
  }
  readonly sugerenciasFiltradas = computed(() => this.sugerenciasDeSeccion().filter(s => this.coincideFila(s, s.nombre, s.nit, s.observacion, s.pagoSugerido)));
  readonly candidatosFiltrados = computed(() => this.candidatosDeSeccion().filter(c => this.coincideFila(c, c.nombre, c.nit, c.disponible)));
  readonly facturasFiltradas = computed(() => this.seccion() === 'cx_pagar' ? this.sugeridos().filter(s => this.coincideFila(s, s.nombre, s.nit, s.comprobante, s.monto)) : []);
  readonly pagosSeccionFiltrados = computed(() => {
    const f = this.filtroSeccion();
    return this.pagosDeSeccion().filter(p => (!f.estado || p.estado === f.estado)
      && (!f.desde || p.fechaProyectada >= f.desde) && (!f.hasta || p.fechaProyectada <= f.hasta)
      && this.coincideFila(p, p.nombre, p.nit, p.concepto, p.numeroEgreso, p.notas, p.montoProyectado))
      .sort((a,b) => (a.fechaProyectada ?? '').localeCompare(b.fechaProyectada ?? '') || a.id-b.id);
  });
  readonly paginaSugerencias = computed(() => this.paginaDe('presupuesto', this.sugerenciasFiltradas()));
  readonly paginaCandidatos = computed(() => this.paginaDe('agendar', this.candidatosFiltrados()));
  readonly paginaFacturas = computed(() => this.paginaDe('sugeridos', this.facturasFiltradas()));
  readonly grupoAbierto = signal<string | null>(null);
  numeroEgreso = ''; fechaEgreso = '';
  readonly guardandoEgreso = signal(false);
  /** Última firma de (empresa, mes) que disparó cargar(); evita duplicados mismos parámetros. */
  private ultimaFirmaCarga?: string;

  // ── Documento de egreso (un solo documento por proveedor) ──
  /** Documento subido en esta sesión (Textract lo lee al subirlo). */
  readonly documentoEgreso = signal<{key: string; nombre: string; url: string; tamano?: number} | null>(null);
  readonly subiendoDocumento = signal(false);
  readonly errorDocumento = signal<string | null>(null);
  /** Fase visible durante la carga: subida del archivo o lectura con Textract. */
  readonly faseDocumento = signal<'subiendo' | 'textract'>('subiendo');
  readonly progresoDocumento = signal<number | null>(null);
  /** Zona de arrastre activa (drag & drop). */
  readonly arrastrandoDocumento = signal(false);
  /** Número de egreso que Textract alcanzó a leer del documento. */
  readonly numeroDetectado = signal<string | null>(null);

  /** true si el grupo ya tiene documento (subido ahora o adjunto al egreso). */
  get documentoCargado(): boolean {
    return !!this.documentoEgreso() || !!this.documentoVinculadoEgreso;
  }

  /** Egreso ya guardado del grupo que tiene documento adjunto (si lo hay). */
  get documentoVinculadoEgreso(): EgresoRegistrado | null {
    const grupo = this.detalleGrupo();
    if (!grupo) return null;
    for (const p of grupo.pagos) {
      const egreso = this.egresosVinculados()[p.id];
      if (egreso?.id && egreso.soporteEgresoKey) return egreso;
    }
    return null;
  }

  /** Paso 1 completo: el egreso se guarda con número y fecha. */
  get datosEgresoListos(): boolean {
    return !!this.numeroEgreso.trim() && !!this.fechaEgreso;
  }

  /** El grupo ya tiene su egreso guardado. */
  get grupoYaGuardado(): boolean {
    const grupo = this.detalleGrupo();
    return !!grupo && grupo.pagos.some((p) => !!this.egresosVinculados()[p.id]);
  }

  /** Paso que el usuario debe atender ahora (se resalta en el modal). */
  get pasoActual(): 1 | 2 | 3 {
    if (!this.datosEgresoListos) return 1;
    if (!this.documentoCargado) return 2;
    return 3;
  }

  /** Todo listo para guardar (pulso sutil en el botón). */
  get listoParaGuardar(): boolean {
    return this.datosEgresoListos && this.documentoCargado && !this.grupoYaGuardado;
  }

  /** Tamaño legible del archivo adjunto para la fila del documento. */
  tamanoLegible(bytes: number | null | undefined): string {
    if (!bytes) return '';
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
  }

  /** Resalta la zona de arrastre mientras el archivo pasa por encima. */
  arrastrarSobreDocumento(event: DragEvent): void {
    event.preventDefault();
    if (!this.subiendoDocumento()) this.arrastrandoDocumento.set(true);
  }

  salirArrastreDocumento(): void {
    this.arrastrandoDocumento.set(false);
  }

  /** Suelta el archivo sobre la zona: mismo proceso del selector. */
  soltarDocumento(event: DragEvent): void {
    event.preventDefault();
    this.arrastrandoDocumento.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) this.procesarDocumento(file);
  }

  /** Entrada del selector de archivo. */
  subirDocumentoEgreso(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) this.procesarDocumento(file);
  }

  /** Valida, sube el documento y lo lee con Textract (con progreso visible). */
  procesarDocumento(file: File): void {
    const empresa = this.empresaId, grupo = this.grupoAbierto();
    if (!file || empresa === null || !grupo || this.subiendoDocumento()) return;
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      this.errorDocumento.set('Adjunta el documento de egreso en PDF, PNG o JPG.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.errorDocumento.set('El documento de egreso supera el máximo de 20 MB.');
      return;
    }
    this.subiendoDocumento.set(true);
    this.faseDocumento.set('subiendo');
    this.progresoDocumento.set(null);
    this.errorDocumento.set(null);
    this.numeroDetectado.set(null);
    this.service.subirDocumentoEgreso(empresa, file).subscribe({
      next: (evento) => {
        if (empresa !== this.empresaId || grupo !== this.grupoAbierto()) return;
        if (evento.type === HttpEventType.UploadProgress) {
          this.progresoDocumento.set(evento.total ? Math.round((100 * evento.loaded) / evento.total) : null);
          if (evento.total != null && evento.loaded >= evento.total) this.faseDocumento.set('textract');
          return;
        }
        if (evento.type !== HttpEventType.Response || !evento.body) return;
        const r = evento.body;
        this.documentoEgreso.set({key: r.key, nombre: r.nombre || file.name, url: r.url, tamano: file.size});
        this.subiendoDocumento.set(false);
        this.progresoDocumento.set(null);
        const detectado = (r.numeroEgreso ?? '').trim();
        if (detectado) {
          this.numeroDetectado.set(detectado);
          if (!this.numeroEgreso.trim()) this.numeroEgreso = detectado;
          this.toast.mostrar(`Documento de egreso cargado · Textract leyó el número ${detectado}`);
        } else {
          this.toast.mostrar(r.texto
            ? 'Documento de egreso cargado y leído por Textract'
            : 'Documento de egreso cargado');
        }
      },
      error: (e) => {
        if (empresa !== this.empresaId || grupo !== this.grupoAbierto()) return;
        this.subiendoDocumento.set(false);
        this.progresoDocumento.set(null);
        this.errorDocumento.set(msj(e));
      },
    });
  }

  /** Abre el documento del egreso (el subido ahora o el ya adjunto al egreso). */
  verDocumentoEgreso(): void {
    const doc = this.documentoEgreso();
    if (doc?.url) {
      window.open(doc.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const vinculado = this.documentoVinculadoEgreso;
    if (!vinculado?.id) return;
    this.egresos.verSoporte(vinculado.id).subscribe({
      next: (r) => window.open(r.url, '_blank', 'noopener,noreferrer'),
      error: () => this.toast.error('No se pudo abrir el documento del egreso.'),
    });
  }

  readonly mesesConsolidados = signal<string[]>([]);
  consolidado(p: PagoProyectado): boolean {
    if(this.ctx.puedeCorregirMes()) return false;
    return !this.ctx.puedeEditarMes(p.fechaProyectada?.slice(0,7));
  }
  readonly grupoConsolidado = computed(() => !!this.detalleGrupo()?.pagos.some(p => this.consolidado(p)));
  mesesGrupo(pagos: PagoProyectado[]): string {
    return [...new Set(pagos.map(p => p.fechaProyectada?.slice(0,7)).filter(Boolean))].sort().map(m => this.etiquetaPeriodo(m)).join(', ');
  }
  readonly gruposPagos = computed(() => {
    const grupos = new Map<string, PagoProyectado[]>();
    this.pagosSeccionFiltrados().forEach(p => {
      const key = `${this.seccion()}::${p.nit || p.nombre}::${p.estado}`;
      grupos.set(key, [...(grupos.get(key) ?? []), p]);
    });
    return [...grupos].map(([id,lista]) => ({id,nombre:lista[0].nombre,nit:lista[0].nit,categoria:lista[0].categoria,
      fecha:lista[0].fechaProyectada,estado:lista[0].estado,pagos:lista,total:lista.reduce((n,p)=>n+p.montoProyectado,0),
      aprobado:lista.filter(p=>p.aprobado).reduce((n,p)=>n+p.montoProyectado,0),
      egreso:lista.every(p=>p.numeroEgreso===lista[0].numeroEgreso)?lista[0].numeroEgreso:null,
      consolidado:lista.some(p=>this.consolidado(p)),
      mixto:lista.some(p=>p.numeroEgreso!==lista[0].numeroEgreso)}));
  });
  readonly paginaPagos = computed(() => this.paginaDe('programados', this.gruposPagos()));
  readonly totalSeccion = computed(() => this.pagosSeccionFiltrados().reduce((total,p) => total+p.montoProyectado,0));
  readonly detalleGrupo = computed(() => this.gruposPagos().find(g=>g.id===this.grupoAbierto()) ?? null);
  readonly egresosVinculados = signal<Record<number,EgresoRegistrado>>({});
  readonly egresoTesoreria = signal<EgresoRegistrado | null>(null);
  abrirGrupo(id:string):void {
    this.grupoAbierto.set(id); const p=this.detalleGrupo()?.pagos[0];this.numeroEgreso=p?.numeroEgreso||'';this.fechaEgreso=p?.numeroEgresoFecha||p?.fechaProyectada?.slice(0,10)||this.hoy;
    this.egresosVinculados.set({});
    this.documentoEgreso.set(null);this.errorDocumento.set(null);this.subiendoDocumento.set(false);
    this.numeroDetectado.set(null);this.arrastrandoDocumento.set(false);this.progresoDocumento.set(null);this.faseDocumento.set('subiendo');
    if(this.modoHistorico || !this.permiso('egresos.ver'))return;
    const empresa=this.empresaId;
    this.egresos.listar().subscribe({next:egresos=>{
      if(empresa!==this.empresaId || id!==this.grupoAbierto())return;
      // Un egreso por proveedor: se mapea por TODAS las facturas que cubre.
      const mapa:Record<number,EgresoRegistrado>={};
      for(const e of egresos.filter(e=>e.estado!=='ELIMINADO')){
        const ids=e.pagosProyectadosIds?.length?e.pagosProyectadosIds:(e.pagoProyectadoId!=null?[e.pagoProyectadoId]:[]);
        for(const pagoId of ids)mapa[pagoId]=e;
      }
      this.egresosVinculados.set(mapa);
    }});
  }
  async guardarEgresoGrupo():Promise<void> {
    if(this.modoHistorico)return;
    const grupo=this.detalleGrupo(),empresa=this.empresaId;
    if(!grupo || empresa===null || this.guardandoEgreso())return;
    if(!this.puedeAprobar)return;
    // El egreso solo se guarda CON su número: sin número no hay registro.
    if(!this.numeroEgreso.trim()) {this.toast.error('Escribe el número de egreso para poder guardar.');return;}
    if(!this.fechaEgreso) {this.toast.error('Indica la fecha del egreso.');return;}
    if(this.subiendoDocumento()) {this.toast.error('Espera a que termine la carga del documento de egreso.');return;}
    if(grupo.pagos.some(p=>!!this.egresosVinculados()[p.id])) {this.toast.error('Este pago ya existe en el cargue de comprobantes de egresos. No se enviará nuevamente.');return;}
    if(this.pagos().some(p=>!grupo.pagos.some(g=>g.id===p.id) && p.numeroEgreso?.trim().toLowerCase()===this.numeroEgreso.trim().toLowerCase())) {
      this.toast.error('El número de egreso '+this.numeroEgreso.trim()+' ya existe.');return;
    }
    this.guardandoEgreso.set(true);
    const doc=this.documentoEgreso();
    try {await firstValueFrom(this.service.guardarEgresoGrupo(empresa,grupo.pagos.map(p=>p.id),this.numeroEgreso.trim(),this.fechaEgreso,doc?.key??null,doc?.nombre??null)); this.toast.mostrar('Egreso guardado'+(doc?' con su documento adjunto':''));this.documentoEgreso.set(null);this.numeroDetectado.set(null);this.grupoAbierto.set(null);await this.cargar();}
    catch(e) {this.toast.error(msj(e));}finally {this.guardandoEgreso.set(false);}
  }

  pagoParaEgreso = signal<PagoProyectado | null>(null);
  cuentaEgreso = '';
  creandoEgreso = signal(false);
  async crearEgreso() {
    if(this.modoHistorico)return;
    const pago = this.pagoParaEgreso(); if (!pago || this.creandoEgreso()) return;
    this.creandoEgreso.set(true);
    try {
      const e = await firstValueFrom(this.egresos.desdePago(pago.id, pago.moduloOrigen === 'nomina' ? null : this.cuentaEgreso.trim()));
      this.pagoParaEgreso.set(null);
      this.toast.mostrar(`Egreso ${e.numeroFactura} registrado. Revíselo y envíelo a Tesorería.`);
      await this.router.navigate(['/contabilidad/control-egresos'], {queryParams: {buscar: e.numeroFactura}});
    } catch (e) { this.toast.error(msj(e)); } finally { this.creandoEgreso.set(false); }
  }

  loading = signal(true);
  /** Primera página ya visible; el resto se sigue cargando en segundo plano. */
  cargandoResto = signal(false);
  /** Difiera el consolidado anual (consulta pesada) hasta que la vista mensual esté lista. */
  cargarAnual = signal(false);
  error = signal<string | null>(null);
  resumen = signal<ResumenPagos | null>(null);
  pagos = signal<PagoProyectado[]>([]);
  candidatos = signal<CandidatoPago[]>([]);
  sugeridos = signal<FacturaSugerida[]>([]);
  sugerenciasPresupuesto = signal<SugerenciaPresupuesto[]>([]);
  cargandoSugerencias = signal(false);
  errorSugerencias = signal<string | null>(null);
  totalPagos = 0;

  pestana = signal<'programados' | 'sugeridos' | 'agendar'>(this.vistaSugeridos ? 'sugeridos' : 'programados');

  pestanaOpts = [
    { id: 'programados', label: 'Egresos', icono: 'calendar', desc: 'Pagos de la sección y su estado de aprobación' },
    ...(this.vistaSugeridos ? [{ id: 'sugeridos', label: 'Facturas pendientes', icono: 'clock', desc: 'Facturas de Cuentas por Pagar con saldo pendiente, ordenadas por vencimiento' }] : []),
    { id: 'agendar', label: 'Por agendar', icono: 'wallet', desc: 'Obligaciones reales con saldo disponible para proyectar' },
  ];

  cambiarPestana(id: string): void {
    this.pestana.set(id as any);
  }

  limpiarPagos(): void {
    this.filtroProveedor.set('');
    this.filtroEstado.set('');
    this.filtroFecha.set('todos');
    this.rangoDesde.set('');
    this.rangoHasta.set('');
  }
  filtroProveedor = signal('');
  filtroEstado = signal('');

  setFiltroBusqueda(event: Event): void {
    this.filtroProveedor.set((event.target as HTMLInputElement).value);
  }

  setFiltroEstado(event: Event): void {
    this.filtroEstado.set((event.target as HTMLSelectElement).value);
  }

  /** Filtro de fecha por vencimiento (feature del original): todos | vencidos | 7 | 30 | rango. */
  filtroFecha = signal<'todos' | 'vencidos' | '7' | '30' | 'rango'>('todos');
  rangoDesde = signal('');
  rangoHasta = signal('');

  setFiltroFecha(f: string): void {
    this.filtroFecha.set(f as any);
  }

  setRangoDesde(event: Event): void { this.rangoDesde.set((event.target as HTMLInputElement).value); }
  setRangoHasta(event: Event): void { this.rangoHasta.set((event.target as HTMLInputElement).value); }

  private enRangoFecha(p: PagoProyectado, hoy: string): boolean {
    const fecha = p.fechaProyectada;
    if (!fecha) return false;
    switch (this.filtroFecha()) {
      case 'vencidos': return fecha < hoy;
      case '7': return fecha >= hoy && fecha <= sumarDias(hoy, 7);
      case '30': return fecha >= hoy && fecha <= sumarDias(hoy, 30);
      case 'rango': {
        if (this.rangoDesde() && fecha < this.rangoDesde()) return false;
        if (this.rangoHasta() && fecha > this.rangoHasta()) return false;
        return true;
      }
      default: return true;
    }
  }

  filtroFechaActivo(): boolean {
    return this.filtroFecha() !== 'todos';
  }

  modalPago = signal(false);
  editando = signal<PagoProyectado | null>(null);
  seleccionSugerido = signal<Set<string>>(new Set());
  categoria = signal('');
  categoriaDetalle = signal('');
  concepto = signal('');
  monto = signal('');
  fechaProyectada = signal('');
  fechaPagoReal = signal('');
  nit = signal('');
  nombre = signal('');
  notas = signal('');
  yaPagado = signal(false);
  guardandoPago = signal(false);
  private empresaFormulario: number | null = null;
  private versionFormulario = 0;

  puedeRegistrarPago(): boolean {
    const pago = this.editando();
    return this.puedePagar() && !!pago?.aprobado && pago.estado === 'proyectado';
  }

  // Modal Observaciones
  modalObservaciones = signal(false);
  pagoObservando = signal<PagoProyectado | null>(null);
  notaTexto = signal('');

  fileImport: File | null = null;
  /** Estado del flujo de importación (spinner + progreso + resultado). */
  readonly importando = signal(false);
  readonly importandoPct = signal(0);
  readonly importadosImportacion = signal(0);
  readonly erroresImportacion = signal<{ fila: number; mensaje: string }[]>([]);
  readonly modalErroresImportacion = signal(false);
  /** Errores agrupados por motivo para no listar 200 filas repetidas. */
  readonly erroresAgrupados = computed(() => {
    const grupos = new Map<string, number[]>();
    for (const e of this.erroresImportacion()) {
      const motivo = (e.mensaje || 'Sin detalle').trim();
      const filas = grupos.get(motivo) ?? [];
      filas.push(e.fila);
      grupos.set(motivo, filas);
    }
    return [...grupos.entries()].map(([mensaje, filas]) => ({ mensaje, filas }));
  });
  categorias: string[] = [];
  categoriasHistoricas: string[] = [];

  constructor(
    public ctx: PresupuestoContextService,
    private service: PresupuestoService,
    private toast: PresupuestoToastService,
    public auth: AuthorizationService,
    private egresos: ControlEgresosService, private router: Router,
  ) {
    effect(() => {
      // Paridad con el effect original: empresaId siempre, mesActivo solo en
      // vista mensual y mesConsulta siempre. La firma (empresa + meses) evita
      // repetir la peticion cuando las senales se re-emiten sin cambiar.
      const firma =
        `${this.ctx.empresaId() ?? ''}|${this.vistaMensual ? this.ctx.mesActivo() ?? '' : ''}` +
        `|${this.ctx.mesConsulta() ?? ''}`;
      if (firma === this.ultimaFirmaCarga) return;
      this.ultimaFirmaCarga = firma;
      untracked(() => this.cargar());
    });
    effect(() => {
      if (this.puedeOperar() && this.ctx.tienePermiso('modulos.ver')) {
        untracked(() => this.cargarCatalogos());
      }
    });
  }

  get empresaId(): number | null {
    return this.ctx.empresaId();
  }

  get esGerencia(): boolean {
    return !this.modoHistorico && this.auth.hasAnyRole(['SUPER_ADMIN', 'ADMIN']);
  }

  get puedeAprobar(): boolean {
    return !this.modoHistorico && this.ctx.tienePermiso('pagos.aprobar');
  }

  /** Operativo o superadmin (mismo criterio del gestor: un admin normal solo aprueba). */
  puedeOperar(): boolean {
    return !this.modoHistorico && this.ctx.tienePermiso('pagos.operar');
  }

  puedeEliminar(): boolean {
    return !this.modoHistorico && this.permisoSinMes('pagos.eliminar');
  }

  private permisoSinMes(codigo: string): boolean {
    const permisos = this.ctx.permisos();
    return !!permisos && (permisos.superAdmin || (permisos.permisos?.includes(codigo) ?? false));
  }

  esProvisionPendiente(p: PagoProyectado): boolean {
    return ['manual', 'importado'].includes((p.moduloOrigen ?? '').toLowerCase())
      && p.estado === 'proyectado' && p.aprobado === false;
  }

  /** Un egreso ELIMINADO no se lista ni cuenta en ningún módulo (distinto de
   *  "Cancelado", que sigue visible). El histórico de estados conserva el
   *  cambio ejecutado con su estado final "Eliminado". */
  esEliminado(p: PagoProyectado): boolean {
    return (p.estado ?? '').toLowerCase() === 'eliminado';
  }

  /** Regla GP: la edición y eliminación de provisiones es exclusive del rol
   *  Contador (dueño del workspace); Gerencia aprueba y superadmin no interviene.
   *  Lectura defensiva del rol: varias pruebas montan el contexto como doble
   *  plano y no declaran todas sus señales. */
  private esContador(): boolean {
    const rol = (this.ctx as Partial<PresupuestoContextService>).rolGp;
    return typeof rol === 'function' ? rol.call(this.ctx) === 'contador' : false;
  }

  /** Función del contexto si el doble de prueba la declara; null si no. */
  private ctxFn(nombre: 'puedeEditarMes'): ((periodo: string) => boolean) | null {
    const fn = (this.ctx as Partial<PresupuestoContextService>)[nombre];
    return typeof fn === 'function' ? (fn as (periodo: string) => boolean) : null;
  }

  puedeModificar(p: PagoProyectado, eliminar = false): boolean {
    if (this.modoHistorico || p.estado !== 'proyectado' || p.aprobado !== false) return false;
    const permiso = eliminar ? 'pagos.eliminar' : 'pagos.operar';
    if (this.esProvisionPendiente(p)) {
      // Provisiones (manual/importado): solo el rol Contador las edita o elimina
      // — paridad con el backend, que revalida el rol en cada petición.
      return this.esContador() && (this.permisoSinMes('pagos.operar')
        || (eliminar && this.permisoSinMes('pagos.eliminar')));
    }
    return this.ctx.tienePermiso(permiso) && !this.consolidado(p);
  }

  puedePagar(): boolean {
    return !this.modoHistorico && this.ctx.tienePermiso('pagos.pagar');
  }

  /** Días de atraso de un pago proyectado (null si no está vencido). */
  diasVencido(fecha: string | null | undefined): number | null {
    if (!fecha) return null;
    const vencimiento = new Date(`${fecha.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(vencimiento.getTime())) return null;
    const dias = Math.floor((new Date(`${this.hoy}T00:00:00`).getTime() - vencimiento.getTime()) / 86400000);
    return dias > 0 ? dias : null;
  }

  /** Permiso de negocio para el resto de acciones (matriz de roles). */
  permiso(codigo: string): boolean {
    return !this.modoHistorico && this.ctx.tienePermiso(codigo);
  }

  opcionesFecha: { id: string; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'vencidos', label: 'Vencidos' },
    { id: '7', label: 'Próximos 7 días' },
    { id: '30', label: 'Próximos 30 días' },
    { id: 'rango', label: 'Rango' },
  ];

  mostrarLimpiar = signal(false);
  limpiandoWs = signal(false);
  /** Botón "Limpiar" de Provisiones (otros pagos), paridad con los módulos. */
  confirmarLimpiezaProvisiones = signal(false);
  limpiandoProvisiones = signal(false);

  get hoy(): string {
    if(this.modoHistorico && this.fechaHistorica)return this.fechaHistorica.slice(0,10);
    return new Date().toISOString().slice(0, 10);
  }

  cantidadVencidos(): number {
    return this.pagos().filter((p) => p.estado === 'proyectado' && !!p.fechaProyectada && p.fechaProyectada < this.hoy).length;
  }

  montoVencidos(): number {
    return this.pagos()
      .filter((p) => p.estado === 'proyectado' && !!p.fechaProyectada && p.fechaProyectada < this.hoy)
      .reduce((acc, p) => acc + (p.montoProyectado ?? 0), 0);
  }

  cantidadProximos7(): number {
    const limite = sumarDias(this.hoy, 7);
    return this.pagos().filter((p) => p.estado === 'proyectado'
      && !!p.fechaProyectada && p.fechaProyectada >= this.hoy && p.fechaProyectada <= limite).length;
  }

  montoProximos7(): number {
    const limite = sumarDias(this.hoy, 7);
    return this.pagos()
      .filter((p) => p.estado === 'proyectado' && !!p.fechaProyectada && p.fechaProyectada >= this.hoy && p.fechaProyectada <= limite)
      .reduce((acc, p) => acc + (p.montoProyectado ?? 0), 0);
  }

  /** Banner de salud del calendario (mismo lenguaje que el estado del
   *  presupuesto): rojo con atrasos, ámbar con vencimientos próximos, verde al día. */
  estadoBanner(): { tipo: 'ok' | 'warn' | 'err'; titulo: string; desc: string; icono: string } {
    const v = this.cantidadVencidos();
    const p7 = this.cantidadProximos7();
    if (v > 0) {
      return {
        tipo: 'err',
        titulo: `${v} pago${v === 1 ? '' : 's'} atrasado${v === 1 ? '' : 's'} por ${formatoCOP(this.montoVencidos())}`,
        desc: 'El dinero ya venció: reprograma la fecha o marca el pago como realizado.',
        icono: 'alert',
      };
    }
    if (p7 > 0) {
      return {
        tipo: 'warn',
        titulo: `${p7} pago${p7 === 1 ? '' : 's'} vence${p7 === 1 ? '' : 'n'} en los próximos 7 días`,
        desc: `${formatoCOP(this.montoProximos7())} por pagar esta semana — revisa que tengan aprobación de Gerencia.`,
        icono: 'clock',
      };
    }
    return {
      tipo: 'ok',
      titulo: 'Calendario al día',
      desc: 'Sin pagos atrasados ni vencimientos inmediatos.',
      icono: 'check',
    };
  }

  /** Atajo del banner: salta a Programados con el filtro de vencidos activo. */
  verAtrasados(): void {
    this.pestana.set('programados');
    this.setFiltroFecha('vencidos');
  }

  hayFiltrosActivos(): boolean {
    return !!this.filtroProveedor() || !!this.filtroEstado() || this.filtroFecha() !== 'todos';
  }

  programados(): PagoProyectado[] {
    return this.pagos().filter((p) => p.estado === 'proyectado');
  }

  pagados(): PagoProyectado[] {
    return this.pagos().filter((p) => p.estado === 'pagado');
  }

  programadosFiltrados(): PagoProyectado[] {
    return this.filtrados().filter((p) => p.estado === 'proyectado');
  }

  /** Programados filtrados, ordenados por fecha proyectada (los más
   *  urgentes primero — el calendario se lee de arriba hacia abajo). */
  programadosOrdenados(): PagoProyectado[] {
    return [...this.programadosFiltrados()].sort((a, b) =>
      (a.fechaProyectada ?? '').localeCompare(b.fechaProyectada ?? ''));
  }

  pagadosFiltrados(): PagoProyectado[] {
    return this.filtrados().filter((p) => p.estado === 'pagado');
  }

  trackPago(i: number, p: PagoProyectado): number { return p.id; }
  trackNit(i: number, c: { nit: string }): string { return c.nit; }
  trackFactura(i: number, f: FacturaSugerida): string {
    return f.nit + '|' + (f.comprobante ?? '') + '|' + (f.movimientoId ?? '');
  }

  contadorTab(id: string): number {
    if (id === 'programados') return this.pagosSeccionFiltrados().length;
    if (id === 'sugeridos') return this.facturasFiltradas().length;
    return this.candidatosFiltrados().length;
  }

  /** "Limpiar workspace" (solo superadmin): mismo proceso del gestor. */
  limpiarWorkspace(): void {
    const empresaId = this.empresaId;
    if (empresaId === null || this.limpiandoWs() || !this.mostrarLimpiar() || !this.ctx.permisos()?.superAdmin) return;
    this.limpiandoWs.set(true);
    this.service.limpiarWorkspace(empresaId).subscribe({
      next: (r) => {
        this.limpiandoWs.set(false);
        if (empresaId !== this.empresaId) return;
        this.mostrarLimpiar.set(false);
        this.toast.mostrar(
          `Limpio: ${r.pagosEliminados} pagos eliminados y ${r.sugeridosReiniciados} Sugeridos en blanco. El Flujo de Caja se conserva`,
        );
        this.cargar();
      },
      error: (e: any) => { this.limpiandoWs.set(false); this.toast.error(msj(e)); },
    });
  }

  /** Mes en el que opera la limpieza de provisiones: el posicionado ("Mes
   *  de consulta") o el habilitado si la vista está en "Mes habilitado". */
  mesLimpiezaProvisiones(): string | null {
    return this.ctx.mesConsulta() ?? this.ctx.mesActivo();
  }

  mesLimpiezaProvisionesTexto(): string {
    const mes = this.mesLimpiezaProvisiones();
    if (!mes) return 'habilitado';
    const [anio, num] = mes.split('-');
    const nombres = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const indice = Number(num) - 1;
    return `${nombres[indice] ?? num} de ${anio}`;
  }

  /** Botón "Limpiar" de Provisiones: mismo criterio que el botón Limpiar de
   *  los módulos — quien traiga `modulos.limpiar` de la matriz (el Contador
   *  lo trae por defecto) mientras el mes consultado esté editable. En
   *  históricos o con el mes cerrado para el perfil no se ve. */
  puedeLimpiarProvisiones(): boolean {
    if (this.modoHistorico || this.origen !== 'manual'
        || !this.ctx.tienePermiso('modulos.limpiar')) return false;
    const mes = this.mesLimpiezaProvisiones();
    if (!mes) return false;
    const editable = this.ctxFn('puedeEditarMes');
    return !!editable && editable.call(this.ctx, mes) === true;
  }

  /** Provisiones visibles del mes consultado (cualquier estado): gobierna
   *  el estado del botón Limpiar, igual que el resumen en los módulos. */
  provisionesEnMes(): PagoProyectado[] {
    return this.pagos();
  }

  /** Botón "Limpiar" de Provisiones: borra las provisiones sin aprobar del
   *  mes consultado; mismas reglas del botón Limpiar de los módulos. */
  limpiarProvisiones(confirmado = false): void {
    const empresaId = this.empresaId, mes = this.mesLimpiezaProvisiones();
    if (empresaId === null || !mes || this.limpiandoProvisiones() || !this.puedeLimpiarProvisiones()) return;
    if (!confirmado) { this.confirmarLimpiezaProvisiones.set(true); return; }
    if (!this.confirmarLimpiezaProvisiones()) return;
    this.limpiandoProvisiones.set(true);
    this.service.limpiarProvisiones(empresaId, mes).subscribe({
      next: (r) => {
        if (empresaId !== this.empresaId) return;
        this.limpiandoProvisiones.set(false);
        this.confirmarLimpiezaProvisiones.set(false);
        this.toast.mostrar(
          `Limpio: ${r.provisionesEliminadas} provisión(es) de ${this.mesLimpiezaProvisionesTexto()} eliminadas`
          + (r.provisionesPagadas ? ` y ${r.provisionesPagadas} pagadas se conservan` : ''),
        );
        this.cargar();
      },
      error: (e: any) => { this.limpiandoProvisiones.set(false); this.toast.error(msj(e)); },
    });
  }

  ngOnInit(): void {
    if (this.vistaSugeridos) this.seccion.set('cx_pagar');
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
    if (this.ctx.permisos() === null) this.ctx.cargarPermisos();
  }

  private cargarCatalogos(): void {
    this.service.categorias().subscribe({
      next: categorias => { this.categorias = categorias; this.categoriasHistoricas = categorias; },
      error: () => this.error.set('No se pudo cargar el catálogo de categorías.'),
    });
  }

  private solicitudCarga = 0;
  private empresaFiltros: number | null = null;
  private solicitudSugerencias = 0;

  ngOnDestroy(): void { this.solicitudCarga++; this.solicitudSugerencias++; }

  async cargarSugerenciasPresupuesto(): Promise<void> {
    const solicitud = ++this.solicitudSugerencias;
    const empresaId = this.empresaId;
    const vigente = () => solicitud === this.solicitudSugerencias && empresaId === this.empresaId;
    this.sugerenciasPresupuesto.set([]);
    this.errorSugerencias.set(null);
    this.cargandoSugerencias.set(empresaId !== null && this.origen !== 'manual');
    if (empresaId === null || this.origen === 'manual') return;
    try {
      const sugerencias = await firstValueFrom(this.service.sugerenciasPresupuesto(empresaId,this.vistaMensual));
      if (vigente()) this.sugerenciasPresupuesto.set(sugerencias);
    } catch {
      if (vigente()) this.errorSugerencias.set('No se pudieron cargar los sugeridos y las observaciones del presupuesto. Los pagos siguen disponibles.');
    } finally {
      if (vigente()) this.cargandoSugerencias.set(false);
    }
  }

  async cargar(): Promise<void> {
    const solicitud = ++this.solicitudCarga;
    if (this.empresaFiltros !== this.empresaId) {
      this.filtrosSecciones.set({}); this.paginasSecciones.set({});
      this.empresaFiltros = this.empresaId;
    }
    if (this.empresaFormulario !== this.empresaId) {
      this.modalPago.set(false);
      this.mostrarLimpiar.set(false);
      this.grupoAbierto.set(null);
      this.modalConfirmar.set(null);
      this.modalObservaciones.set(false);
      this.previewSugerido.set(null);
      this.pagoParaEgreso.set(null);
      this.editando.set(null);
      this.versionFormulario++;
    }
    const empresaId = this.empresaId;
    const vigente = () => solicitud === this.solicitudCarga && empresaId === this.empresaId;
    this.resumen.set(null);
    this.pagos.set([]);
    this.candidatos.set([]);
    this.sugeridos.set([]);
    this.sugerenciasPresupuesto.set([]);
    this.errorSugerencias.set(null);
    this.cargandoSugerencias.set(false);
    this.seleccionPagos.set(new Set());
    this.egresoTesoreria.set(null);
    this.totalPagos = 0;
    this.seleccionSugerido.set(new Set());
    this.seleccionPagos.set(new Set());
    this.egresoTesoreria.set(null);
    this.error.set(null);
    this.corteReflejo.set(null);
    this.loading.set(empresaId !== null);
    // Los sugeridos se consultan en su pantalla independiente.
    if (empresaId === null) return;
    // La aprobación global del presupuesto habilita los pagos proyectados:
    // primero se consulta el contrato y, si aún no está aprobado, no se
    // cargan montos ni calendario (la vista queda vacía a propósito).
    if (!this.modoHistorico && !this.vistaSugeridos && this.origen !== 'manual') {
      try {
        const contrato = await firstValueFrom(this.service.contrato(empresaId));
        if (!vigente()) return;
        this.presupuestoAprobado.set(contrato?.estadoAprobacion === 'aprobado');
        this.corteReflejo.set(contrato?.aprobadoEn ?? null);
      } catch { /* sin contrato legible se conserva el estado previo */ }
    }
    if (this.pagosBloqueados()) { this.loading.set(false); return; }
    try {
      const [resumen, primera, candidatos, sugeridos, cerrados] = await Promise.all([
        firstValueFrom(this.service.resumenPagos(empresaId, this.origen === 'manual' ? 'manual' : undefined,this.vistaMensual)),
        firstValueFrom(this.service.pagos(empresaId, { vistaMes:this.vistaMensual, origen: this.origen === 'manual' ? 'manual' : undefined, page: 0, size: 200, sortBy: 'fechaProyectada' })),
        this.origen === 'manual' ? Promise.resolve([]) : firstValueFrom(this.service.candidatos(empresaId,this.vistaMensual)),
        !this.vistaSugeridos ? Promise.resolve([]) : firstValueFrom(this.service.facturasSugeridas(empresaId,this.vistaMensual)),
        firstValueFrom(this.service.mesesCerrados(empresaId)),
      ]);
      if (!vigente()) return;
      this.mesesConsolidados.set(cerrados);
      const pagos = [...primera.content];
      // Defensiva: lo ELIMINADO no se lista ni cuenta (el backend ya lo
      // excluye de la vista y del resumen). El histórico de estados conserva
      // el cambio con su estado final "Eliminado".
      const visibles = () => pagos.filter(p => !this.esEliminado(p));
      this.resumen.set(resumen);
      this.totalPagos = primera.totalElements;
      this.candidatos.set(candidatos);
      this.sugeridos.set(sugeridos);
      // Primera página visible de inmediato: el skeleton no espera a que se
      // descarguen todas las páginas (mejora fuerte de percepción de carga).
      this.pagos.set(visibles());
      this.loading.set(false);
      this.cargarAnual.set(true);
      // Paginas siguientes en tandas de 4 (paralelas, orden preservado):
      // reduce el wall-clock de RTTs seriales sin saturar el backend.
      const paginasRestantes = Array.from({ length: Math.max(0, primera.totalPages - 1) }, (_, i) => i + 1);
      this.cargandoResto.set(paginasRestantes.length > 0);
      for (let i = 0; i < paginasRestantes.length; i += 4) {
        const tanda = paginasRestantes.slice(i, i + 4);
        const tandas = await Promise.all(tanda.map((page) =>
          firstValueFrom(this.service.pagos(empresaId, { vistaMes:this.vistaMensual, origen: this.origen === 'manual' ? 'manual' : undefined, page, size: 200, sortBy: 'fechaProyectada' })),
        ));
        if (!vigente()) return;
        for (const siguiente of tandas) pagos.push(...siguiente.content);
        if (vigente()) this.pagos.set(visibles());
      }
      this.cargandoResto.set(false);
      // Los cobros proyectados (cx_cobrar) no salen de vw_gp_pagos (es la
      // vista de egresos): se cargan aparte para la pestaña Cuentas por cobrar.
      if (this.origen !== 'manual') {
        try {
          const cobros = await firstValueFrom(this.service.cobrosProyectados(empresaId));
          if (vigente()) this.pagos.set([...pagos, ...cobros].filter(p => !this.esEliminado(p)));
        } catch { /* sin cobros: la pestaña queda vacía */ }
      }
      this.ajustarSeccionConDatos();
    } catch (e) {
      if (vigente()) {
        // Si falla una página posterior no se deja a medias el calendario:
        // se limpia lo cargado y se muestra el estado de error (garantía
        // cubierta por las pruebas del componente).
        this.pagos.set([]);
        this.resumen.set(null);
        this.candidatos.set([]);
        this.sugeridos.set([]);
        this.error.set(msj(e));
      }
    } finally {
      if (vigente()) {
        this.loading.set(false);
        this.cargandoResto.set(false);
        this.cargarAnual.set(true);
      }
    }
  }
  /**
   * Si la sección abierta no tiene egresos pero el mes sí tiene en otra
   * sección (p. ej. septiembre solo tiene Provisiones), salta a la primera
   * con datos para que la tesorera vea la información de inmediato.
   */
  private ajustarSeccionConDatos(): void {
    if (this.pagosDeSeccion().length > 0) return;
    const conDatos = this.seccionesConDatos();
    if (conDatos.length) this.seccion.set(conDatos[0].id);
  }

  filtrados(): PagoProyectado[] {
    const filtro = this.filtroProveedor().toLowerCase();
    const hoy = this.hoy;
    return this.pagos().filter((p) => {
      if (this.filtroEstado() && p.estado !== this.filtroEstado()) return false;
      if (filtro && p.nombre.toLowerCase() !== filtro) return false;
      if (p.estado !== 'pagado' && this.filtroFecha() !== 'todos' && !this.enRangoFecha(p, hoy)) return false;
      return true;
    });
  }
  totalFiltrado(): number {
    return this.filtrados().reduce((acc, p) => acc + (p.montoProyectado ?? 0), 0);
  }

  formatearFecha(fecha: string | null | undefined): string {
    return formatearFechaCO(fecha);
  }

  aprobarPago(p: PagoProyectado, aprobado: boolean): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.service.aprobarPago(empresaId, p.id, aprobado).subscribe({
      next: () => { this.toast.mostrar(aprobado ? 'Pago aprobado' : 'Se quitó la aprobación'); this.cargar(); },
      error: (e) => this.toast.error(msj(e)),
    });
  }

  pagar(p: PagoProyectado): void {
    const empresaId = this.empresaId;
    if (empresaId === null || !this.puedePagar() || !p.aprobado || p.estado !== 'proyectado') return;
    this.pedirConfirmar({
      titulo: 'Marcar como pagado',
      mensaje: `¿Marcar como PAGADO el pago a ${p.nombre} por ${formatoCOP(p.montoProyectado)}? Se usará la fecha de hoy y quedará como histórico.`,
      textoOk: 'Sí, marcar pagado',
      icono: 'check',
      ejecutar: () => {
        if (empresaId !== this.empresaId || !this.puedePagar()) return;
        const fecha = new Date().toISOString().slice(0, 10);
        this.service.marcarPagado(empresaId, p.id, fecha).subscribe({
          next: () => { this.toast.mostrar('Marcado como pagado'); this.cargar(); },
          error: (e) => this.toast.error(msj(e)),
        });
      },
    });
  }

  eliminar(p: PagoProyectado): void {
    const empresaId = this.empresaId;
    if (empresaId === null || !this.puedeModificar(p, true)) return;
    this.pedirConfirmar({
      titulo: 'Eliminar pago',
      mensaje: `¿Eliminar el proyectado de ${p.nombre} por ${formatoCOP(p.montoProyectado)} del ${p.fechaProyectada}? Desaparecerá del módulo y el historial de estados conservará el cambio como "Eliminado".`,
      textoOk: 'Sí, eliminar',
      icono: 'trash',
      peligro: true,
      ejecutar: () => {
        if (empresaId !== this.empresaId || !this.puedeModificar(p, true)) return;
        this.service.eliminarPago(empresaId, p.id).subscribe({
          next: () => { this.toast.mostrar('Eliminado'); this.cargar(); },
          error: (e) => this.toast.error(msj(e)),
        });
      },
    });
  }

  abrirObservaciones(p: PagoProyectado): void {
    this.pagoObservando.set(p);
    this.notaTexto.set(p.notas ?? '');
    this.modalObservaciones.set(true);
  }

  cerrarObservaciones(): void {
    this.modalObservaciones.set(false);
    this.pagoObservando.set(null);
    this.notaTexto.set('');
  }

  guardandoNota = signal(false);

  guardarObservaciones(): void {
    if(this.modoHistorico)return;
    const pago = this.pagoObservando();
    const empresaId = this.empresaId;
    if (!pago || empresaId === null || !this.puedeModificar(pago) || this.guardandoNota()) return;
    this.guardandoNota.set(true);
    this.service.actualizarNotasPago(empresaId, pago.id, this.notaTexto() || null).subscribe({
      next: (actualizado) => {
        this.pagos.update(list => list.map(p => p.id === actualizado.id ? actualizado : p));
        this.guardandoNota.set(false);
        this.cerrarObservaciones();
        this.toast.mostrar('Observación guardada');
      },
      error: (e) => { this.guardandoNota.set(false); this.toast.error(msj(e)); },
    });
  }

  /** Cancela el pago (estado "cancelado"): su saldo vuelve a ser candidato
   *  para agendar — el original no tenía botón directo, se hacía editando. */
  cancelar(p: PagoProyectado): void {
    this.pedirConfirmar({
      titulo: 'Cancelar pago',
      mensaje: `¿Cancelar el pago a ${p.nombre} por ${formatoCOP(p.montoProyectado)}? El saldo vuelve a quedar disponible como candidato por agendar.`,
      textoOk: 'Sí, cancelar pago',
      icono: 'ban',
      peligro: true,
      ejecutar: () => {
        const empresaId = this.empresaId;
        if (empresaId === null) return;
        this.service.actualizarPago(empresaId, p.id, { estado: 'cancelado' }).subscribe({
          next: () => { this.toast.mostrar('Pago cancelado'); this.cargar(); },
          error: (e) => this.toast.error(msj(e)),
        });
      },
    });
  }

  /** Duplica un pago como nuevo proyectado (pagos recurrentes): copia
   *  beneficiario, categoría, concepto y monto con la fecha de hoy. */
  duplicar(p: PagoProyectado): void {
    this.empresaFormulario = this.empresaId;
    this.versionFormulario++;
    this.editando.set(null);
    this.nit.set(p.nit ?? '');
    this.nombre.set(p.nombre);
    this.categoria.set(p.categoria ?? '');
    this.categoriaDetalle.set(p.categoriaDetalle ?? '');
    this.concepto.set(p.concepto ?? '');
    this.monto.set(String(p.montoProyectado ?? 0));
    this.fechaProyectada.set(this.ctx.periodo() === this.hoy.slice(0,7) ? this.hoy : this.ctx.periodo()+'-01');
    this.fechaPagoReal.set('');
    this.notas.set(p.notas ?? '');
    this.yaPagado.set(false);
    this.modalPago.set(true);
    this.toast.mostrar(`Duplicando el pago de ${p.nombre} — revisa la fecha y guarda`);
  }

  /** Confirmación estilizada (reemplaza el confirm() nativo). */
  modalConfirmar = signal<{ titulo: string; mensaje: string; textoOk: string; icono: string; peligro?: boolean; ejecutar: () => void } | null>(null);

  pedirConfirmar(cfg: { titulo: string; mensaje: string; textoOk: string; icono: string; peligro?: boolean; ejecutar: () => void }): void {
    this.modalConfirmar.set(cfg);
  }

  ejecutarConfirmar(): void {
    const cfg = this.modalConfirmar();
    if (!cfg) return;
    this.modalConfirmar.set(null);
    cfg.ejecutar();
  }

  abrirCrear(prefill?: { nit?: string; nombre?: string; disponible?: number }): void {
    this.empresaFormulario = this.empresaId;
    this.versionFormulario++;
    this.editando.set(null);
    this.nit.set(prefill?.nit ?? '');
    this.nombre.set(prefill?.nombre ?? '');
    this.categoria.set('');
    this.categoriaDetalle.set('');
    this.concepto.set('');
    this.monto.set(prefill?.disponible ? String(prefill.disponible) : '');
    this.fechaProyectada.set('');
    this.fechaPagoReal.set('');
    this.notas.set('');
    this.yaPagado.set(false);
    this.modalPago.set(true);
  }

  /** Atajos de fecha: hoy, +7, +30, +60 días (programación rápida). */
  fechaRapida(dias: number): void {
    this.fechaProyectada.set(sumarDias(new Date().toISOString().slice(0, 10), dias));
  }

  /** Monto con separadores para el resumen en vivo del modal. */
  montoVista(): string {
    const n = Number(this.monto());
    return n > 0 ? formatoCOP(n) : '—';
  }

  /** Resumen en vivo del modal: "Se programará el … por …". */
  resumenModal(): { fecha: string; beneficiario: string; monto: string } {
    return {
      fecha: this.fechaProyectada() ? this.fechaProyectada() : 'sin fecha',
      beneficiario: this.nombre() || 'sin beneficiario',
      monto: this.montoVista(),
    };
  }

  /** Color del punto del picker de categorías (paleta compartida). */
  colorCategoria(c: string): string {
    return CATEGORIA_COLORS[c] ?? '#94a3b8';
  }

  abrirEditar(p: PagoProyectado): void {
    if (!this.puedeModificar(p)) { this.toast.error(this.motivoEditar(p)); return; }
    this.empresaFormulario = this.empresaId;
    this.versionFormulario++;
    this.editando.set(p);
    this.nit.set(p.nit ?? '');
    this.nombre.set(p.nombre);
    this.categoria.set(p.categoria ?? '');
    this.categoriaDetalle.set(p.categoriaDetalle ?? '');
    this.concepto.set(p.concepto ?? '');
    this.monto.set(String(p.montoProyectado ?? 0));
    this.fechaProyectada.set(p.fechaProyectada);
    this.fechaPagoReal.set(p.fechaPagoReal ?? '');
    this.notas.set(p.notas ?? '');
    this.yaPagado.set(false);
    this.modalPago.set(true);
  }

  async guardarPago(confirmado = false): Promise<void> {
    const empresaId = this.empresaId;
    if (empresaId === null || empresaId !== this.empresaFormulario || !this.puedeOperar() || this.guardandoPago()) return;
    const montoNumber = Number(this.monto());
    if (!this.nombre().trim() || !this.fechaProyectada() || !Number.isFinite(montoNumber) || montoNumber <= 0) {
      this.toast.error('Completa el proveedor, la fecha y un monto mayor a cero.');
      return;
    }
    if(!(this.editando() && this.esProvisionPendiente(this.editando()!)) && this.vistaMensual && this.ctx.mesActivo() && !this.ctx.puedeEditarMes(this.fechaProyectada().slice(0,7))) {
      this.toast.error('Solo puedes registrar información del mes habilitado o del mes anterior en cierre: '+this.ctx.mesActivo()+'.');return;
    }
    const editando = this.editando();
    if (editando && !this.puedeModificar(editando)) { this.toast.error(this.motivoEditar(editando)); return; }
    if (editando && !confirmado) {
      const version = this.versionFormulario;
      this.pedirConfirmar({ titulo: 'Confirmar cambios de la proyección',
        mensaje: `Se guardará ${this.nombre()} por ${formatoCOP(montoNumber)} para el ${this.fechaProyectada()}. El cambio quedará registrado en el historial.`,
        textoOk: 'Guardar cambios', icono: 'check',
        ejecutar: () => { if (version === this.versionFormulario && empresaId === this.empresaId) void this.guardarPago(true); },
      });
      return;
    }
    const registrarPago = this.yaPagado();
    if (registrarPago && !this.puedeRegistrarPago()) {
      this.toast.error(this.puedePagar()
        ? 'Guarde la proyección y obtenga la aprobación de Gerencia antes de registrar el pago.'
        : 'Solo el perfil Tesorería puede confirmar el pago de las facturas.');
      return;
    }
    const version = this.versionFormulario;
    const carga = this.solicitudCarga;
    const vigente = () => empresaId === this.empresaId && version === this.versionFormulario && carga === this.solicitudCarga;
    const fechaReal = this.fechaPagoReal() || new Date().toISOString().slice(0, 10);
    const body: any = {
      nit: this.nit() || null,
      nombre: this.nombre().trim(),
      categoria: this.categoria() || null,
      categoriaDetalle: this.categoria() === 'OTROS' ? (this.categoriaDetalle() || null) : null,
      concepto: this.concepto() || null,
      montoProyectado: montoNumber,
      fechaProyectada: this.fechaProyectada(),
      notas: this.notas() || null,
    };
    // Un cobro creado desde la pestaña Cuentas por cobrar nace con ese origen
    // para que figure en Cobros Proyectados (y no en Provisiones).
    if (!editando && this.seccion() === 'cx_cobrar') body.moduloOrigen = 'cx_cobrar';
    // La transición financiera utiliza el endpoint de pago, que revalida la aprobación.
    let cambiosGuardados = false;
    this.guardandoPago.set(true);
    try {
      const guardado = await firstValueFrom(editando
        ? this.service.actualizarPago(empresaId, editando.id, body)
        : this.service.crearPago(empresaId, body));
      cambiosGuardados = true;
      if (!vigente()) return;
      if (registrarPago) {
        if (!this.puedeRegistrarPago()) throw new Error('Ya no tiene autorización para confirmar el pago.');
        await firstValueFrom(this.service.marcarPagado(empresaId, guardado.id, fechaReal));
        if (!vigente()) return;
      }
      this.modalPago.set(false);
      this.toast.mostrar(registrarPago ? 'Pago registrado correctamente' : editando ? 'Pago actualizado correctamente' : 'Pago agendado correctamente');
      await this.cargar();
    } catch (e) {
      if (vigente()) this.toast.error((cambiosGuardados ? 'Los cambios se guardaron, pero no se registró el pago. ' : '') + msj(e));
    } finally {
      this.guardandoPago.set(false);
    }
  }
  montoFormateado(): string {
    const valor = this.monto();
    if (!valor) return '';
    if (!Number.isFinite(Number(valor))) return valor.replace('.', ',');
    const [entero, decimal] = valor.split('.');
    return Number(entero || '0').toLocaleString('es-CO') + (decimal === undefined ? '' : ',' + decimal);
  }

  actualizarMonto(valor: string): void {
    // Entrada COP: punto de miles y coma decimal; el modelo conserva punto decimal.
    this.monto.set(valor.replaceAll('.', '').replace(',', '.'));
  }

  cambiarPagado(value: boolean): void {
    this.yaPagado.set(value);
    if (value && !this.fechaPagoReal()) this.fechaPagoReal.set(this.hoy);
  }

  toggleSugerido(nit: string, comprobante: string): void {
    const clave = nit + '|' + comprobante;
    this.seleccionSugerido.update((s) => {
      const nuevo = new Set(s);
      if (nuevo.has(clave)) nuevo.delete(clave); else nuevo.add(clave);
      return nuevo;
    });
  }

  aprobarSeleccionados(): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    const claves = Array.from(this.seleccionSugerido());
    const pagos = claves.map((c) => { const [nit, comprobante] = c.split('|'); return { nit, comprobante }; });
    this.service.aprobarSugeridos(empresaId, pagos).subscribe({
      next: (r) => {
        let msg = `${r.aprobados} factura(s) aprobadas.`;
        if (r.errores.length) msg += ` Errores: ${r.errores.map((e) => e.comprobante).join(', ')}`;
        this.toast.mostrar(msg);
        this.seleccionSugerido.set(new Set());
        this.cargar();
      },
      error: (e) => this.toast.error(msj(e)),
    });
  }

  readonly seleccionPagos = signal<Set<number>>(new Set());
  readonly procesandoMasivo = signal(false);
  readonly totalSeleccionados = computed(() => this.pagosSeccionFiltrados().filter(p => this.seleccionPagos().has(p.id)).reduce((n,p) => n + p.montoProyectado, 0));
  readonly totalFacturasSeleccionadas = computed(() => this.facturasFiltradas().filter(f => this.seleccionSugerido().has(f.nit+'|'+(f.comprobante??''))).reduce((n,f) => n+f.monto, 0));
  readonly sumarMontoFactura = (total: number, factura: FacturaSugerida) => total + factura.monto;
  seleccionarPago(id: number): void {
    this.seleccionPagos.update(actual => { const nuevo = new Set(actual); nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id); return nuevo; });
  }
  seleccionarTodosPagos(): void {
    const ids = this.pagosSeccionFiltrados().filter(p => p.estado === 'proyectado').map(p => p.id);
    this.seleccionPagos.set(ids.every(id => this.seleccionPagos().has(id)) ? new Set() : new Set(ids));
  }
  seleccionarTodasFacturas(): void {
    const ids = this.facturasFiltradas().map(f => f.nit+'|'+(f.comprobante??''));
    this.seleccionSugerido.set(ids.every(id => this.seleccionSugerido().has(id)) ? new Set() : new Set(ids));
  }
  async cambiarAprobacionMasiva(aprobado: boolean): Promise<void> {
    const empresa = this.empresaId;
    const ids = this.pagosSeccionFiltrados().filter(p => this.seleccionPagos().has(p.id) && p.estado === 'proyectado').map(p => p.id);
    if (empresa === null || !ids.length || !this.puedeAprobar || this.procesandoMasivo()) return;
    this.procesandoMasivo.set(true);
    try {
      const r = await firstValueFrom(this.service.aprobacionMasiva(empresa, ids, aprobado));
      this.toast.mostrar(`${r.actualizados.length} pagos ${aprobado ? 'aprobados' : 'desaprobados'}. ${r.errores.map(e => e.mensaje).join(' ')}`);
      this.seleccionPagos.set(new Set()); await this.cargar();
    } catch(e) { this.toast.error(msj(e)); }
    finally { this.procesandoMasivo.set(false); }
  }

  /** Previsualización antes de aprobar con el Pago Sugerido (igual que el
   *  gestor original: se muestra qué facturas se aprobarían y qué queda del
   *  sugerido antes de confirmar). */
  previewSugerido = signal<PrevisualizarProveedor | null>(null);
  cargandoPreview = signal(false);
  aprobandoPreview = signal(false);

  aprobarCandidato(c: CandidatoPago): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.cargandoPreview.set(true);
    this.service.previsualizarProveedor(empresaId, c.nit).subscribe({
      next: (p) => {
        this.cargandoPreview.set(false);
        this.previewSugerido.set(p);
      },
      error: (e) => { this.cargandoPreview.set(false); this.toast.error(msj(e)); },
    });
  }

  confirmarAprobarProveedor(): void {
    const empresaId = this.empresaId;
    const preview = this.previewSugerido();
    if (empresaId === null || !preview) return;
    this.aprobandoPreview.set(true);
    this.service.aprobarProveedorSugerido(empresaId, preview.nit).subscribe({
      next: (r) => {
        this.aprobandoPreview.set(false);
        this.previewSugerido.set(null);
        this.toast.mostrar(
          r.error ?? `Aprobadas facturas por ${formatoCOP(r.totalAprobado)}${r.primeraFacturaOmitida ? `. Omitida: ${r.primeraFacturaOmitida}` : ''}`,
        );
        this.cargar();
      },
      error: (e) => {
        this.aprobandoPreview.set(false);
        this.toast.error(msj(e));
      },
    });
  }

  importarExcel(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    input.value = '';
    if (!archivo || this.importando()) return;
    if (!/\.(xlsx|xls)$/i.test(archivo.name)) {
      this.toast.error('Selecciona un archivo de Excel (.xlsx o .xls).');
      return;
    }
    if (archivo.size > 50 * 1024 * 1024) {
      this.toast.error('El archivo supera el límite de 50 MB.');
      return;
    }
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.importando.set(true);
    this.importandoPct.set(0);
    this.importadosImportacion.set(0);
    this.erroresImportacion.set([]);
    this.service.importarPagosExcel(empresaId, archivo, (pct) => this.importandoPct.set(pct)).subscribe({
      next: (r) => {
        this.importando.set(false);
        this.importadosImportacion.set(r.importados);
        this.erroresImportacion.set(r.errores);
        if (r.errores.length) {
          // El backend explica el motivo de cada fila (p. ej. mes cerrado o
          // columna de mes equivocada); se muestra completo en el modal.
          this.modalErroresImportacion.set(true);
        } else if (r.importados > 0) {
          this.toast.mostrar(
            `${r.importados} ${r.importados === 1 ? 'provisión importada' : 'provisiones importadas'} correctamente.`,
          );
        } else {
          this.toast.error('El archivo no tenía filas para importar. Verifica que la plantilla tenga datos.');
        }
        if (r.importados > 0) this.cargar();
      },
      error: (e) => {
        this.importando.set(false);
        this.toast.error(msj(e));
      },
    });
  }

  /** Filas resumidas para el modal de errores de importación. */
  filasTexto(filas: number[]): string {
    const max = 15;
    const visibles = filas.slice(0, max).join(', ');
    return filas.length > max ? `${visibles} y ${filas.length - max} más` : visibles;
  }

  descargandoPdf = signal(false);

  descargarFacturasAutorizadas(): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    // Criterio del gestor original: facturas con movimiento de origen
    // (creadas al aprobar facturas sugeridas), aprobadas o no.
    const facturas = this.pagos().filter((p) => p.movimientoId !== null);
    if (facturas.length === 0) {
      this.toast.error('Todavía no hay facturas autorizadas para incluir en el PDF.');
      return;
    }
    this.descargandoPdf.set(true);
    try {
      generarFacturasAutorizadasPdf(facturas, this.ctx.nombreEmpresa());
    } finally {
      this.descargandoPdf.set(false);
    }
  }

  descargandoPlantilla = signal(false);

  descargarPlantilla(): void {
    const empresaId = this.empresaId;
    if (empresaId === null) return;
    this.descargandoPlantilla.set(true);
    this.service.descargarPlantillaPagos(empresaId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_pagos_proyectados.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        this.descargandoPlantilla.set(false);
      },
      error: (e) => { this.toast.error(msj(e)); this.descargandoPlantilla.set(false); },
    });
  }

  // ── Helpers ──

  estadoLabel(e: string): string {
    return ESTADO_PAGO_LABELS[e] ?? e;
  }

  c(litro: number | null | undefined): string {
    return (litro ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600';
  }

  cp(v: number | null | undefined): string {
    return formatoCOP(v);
  }

  /** % del grupo ya aprobado, para la barra de la tarjeta (0–100). */
  pctAprobado(grupo: { total: number; aprobado: number }): number {
    if (!grupo.total || grupo.total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((grupo.aprobado / grupo.total) * 100)));
  }

  mm(ahora: string): { mes: string; dia: string; vencido: boolean } {
    const partes = (ahora ?? '').split('-');
    return {
      mes: partes.length >= 2 ? `${partes[1]}/${partes[0]}` : '',
      dia: partes[2] ?? '',
      vencido: !!ahora && ahora < new Date().toISOString().slice(0, 10),
    };
  }

  claseFecha(p: PagoProyectado): string {
    if (p.estado === 'pagado') return 'gp-fmini--pagado';
    if (p.estado === 'cancelado') return 'gp-fmini--cancelado';
    return p.fechaProyectada && p.fechaProyectada < this.hoy ? 'gp-fmini--vencido' : '';
  }

  protegido(p: PagoProyectado | null): boolean {
    return p?.estado === 'pagado';
  }

  bloqueadoMonto(p: PagoProyectado | null): boolean {
    return p ? !this.puedeModificar(p) : !this.puedeOperar();
  }

  /** Motivo por el que "Marcar pagado" está bloqueado ('' si está habilitado). */
  motivoPago(p: PagoProyectado): string {
    if (p.estado === 'pagado') return 'Este pago ya fue confirmado como pagado.';
    if (p.estado !== 'proyectado') return 'Solo los pagos proyectados se pueden marcar como pagados.';
    if (!p.aprobado) return 'Requiere la aprobación de Gerencia antes de pagarse.';
    return '';
  }

  /** Motivo por el que "Editar" está bloqueado ('' si está habilitado). */
  motivoEditar(p: PagoProyectado | null): string {
    if (p && this.ctx.permisos() && this.esProvisionPendiente(p) && !this.esContador()) {
      return 'Las provisiones las edita y elimina el rol Contador.';
    }
    if (!this.puedeOperar()) return 'Tu perfil (Tesorería) no puede editar proyecciones; solicítalo al contador.';
    if (p?.estado === 'pagado') return 'Este pago ya fue ejecutado y no admite cambios.';
    if (p?.aprobado) return 'Esta proyección está aprobada y no admite edición ni eliminación.';
    if (p && p.estado !== 'proyectado') return 'Solo se pueden modificar proyecciones pendientes.';
    if (p && !this.esProvisionPendiente(p) && this.consolidado(p)) return 'El periodo de esta proyección no está habilitado para edición.';
    return '';
  }

  /** true si Gerencia ya aprobó todo el grupo (no queda nada por aprobar). */
  grupoAprobado(grupo: { total: number; aprobado: number }): boolean {
    return grupo.total > 0 && grupo.aprobado >= grupo.total;
  }

  totales(): string {
    return `${formatoMiles(this.totalPagos)} pagos`;
  }

  superadmin(): boolean {
    if(this.modoHistorico)return false;
    return this.ctx.permisos()?.superAdmin ?? this.auth.isSuperAdmin();
  }
}

function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = new Date(a, m - 1, d + dias);
  return fecha.toISOString().slice(0, 10);
}
