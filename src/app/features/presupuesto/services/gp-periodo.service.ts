import { Injectable, computed, effect, inject, OnDestroy, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { PresupuestoContextService } from './presupuesto-context.service';
import { AnioPanorama } from '../models/panorama.model';
import { mensajeError } from './gp-errores';
import { finalize, Subject, Subscription, takeUntil } from 'rxjs';

/** Estado del período compartido por todo el gestor, incluidas las consultas históricas. */
@Injectable({ providedIn: 'root' })
export class GpPeriodoService implements OnDestroy {
  readonly ctx = inject(PresupuestoContextService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly anios = signal<AnioPanorama[]>([]);
  readonly historicos = signal<Record<string, number>>({});
  readonly datosEmpresa = signal<string[]>([]);
  readonly presupuestosEmpresa = signal<string[]>([]);
  /** Meses con egresos/pagos registrados en la empresa activa (para la tesorera). */
  readonly pagosEmpresa = signal<string[]>([]);
  readonly tienePresupuesto = computed(() => this.presupuestosEmpresa().length > 0);
  readonly tieneDatos = computed(() => this.datosEmpresa().length > 0);
  readonly tienePagos = computed(() => this.pagosEmpresa().length > 0);
  readonly loading = signal(true);
  readonly error = signal('');
  private solicitud = 0;
  private consulta?: Subscription;
  private pendiente = false;
  private contextoConsulta = '';
  private readonly destruido = new Subject<void>();
  readonly cerrado = computed(() => !!this.ctx.estadosMes().find(m => m.periodo === this.ctx.mesActivo())?.aprobado);
  readonly creado = computed(() => this.ctx.mesActivo() !== null);
  readonly puedeCrear = computed(() => this.ctx.tienePermiso('presupuesto.abrir_periodos'));
  /** Sufijo del mes en los selectores: dice de un vistazo dónde hay información. */
  marcadorMes(periodo: string): string {
    if (this.ctx.estadosMes().find(m => m.periodo === periodo)?.aprobado) return ' · Aprobado';
    if (this.pagosEmpresa().includes(periodo)) return ' · Con egresos';
    if (this.datosEmpresa().includes(periodo)) return ' · Con datos';
    return ' · Sin datos';
  }
  constructor() {
    effect(() => {
      const empresa = this.ctx.empresaId(), validada = this.ctx.sesionValidada();
      this.ctx.versionSesion();
      const esperandoEmpresas = empresa === null && this.ctx.cargando();
      untracked(() => {
        if (!validada || esperandoEmpresas) {
          this.solicitud++; this.consulta?.unsubscribe(); this.pendiente = false;
          if (!validada) { this.contextoConsulta = ''; this.limpiarDatos(); }
          this.loading.set(esperandoEmpresas);
          return;
        }
        this.recargar();
      });
    }, {allowSignalWrites:true});
    this.router.events.pipe(takeUntil(this.destruido)).subscribe(event => {
      if (event instanceof NavigationEnd && event.urlAfterRedirects.startsWith('/presupuesto/')) this.recargar();
    });
  }
  private limpiarDatos(): void {
    this.anios.set([]); this.historicos.set({}); this.datosEmpresa.set([]); this.presupuestosEmpresa.set([]); this.pagosEmpresa.set([]);
  }
  recargar(forzar = false): void {
    const empresa = this.ctx.empresaId();
    if (!this.ctx.sesionValidada() || (empresa === null && this.ctx.cargando())) return;
    const contexto = this.ctx.versionSesion() + ':' + (empresa ?? 'global');
    if (this.pendiente && contexto === this.contextoConsulta && !forzar) return;
    const id = ++this.solicitud;
    this.consulta?.unsubscribe();
    if (contexto !== this.contextoConsulta) this.limpiarDatos();
    this.contextoConsulta = contexto; this.pendiente = true;
    this.loading.set(true); this.error.set('');
    this.consulta = this.http.get<{anios:AnioPanorama[];historicos:Record<string,number>;datosEmpresa:string[];presupuestosEmpresa:string[];pagosEmpresa?:string[];periodoActivo?:string|null;estadosMes?:{periodo:string;aprobado:boolean}[]}>(environment.gpApiUrl+'/periodos/seleccion', {
      params: empresa ? {empresaId:empresa} : {},
    }).pipe(takeUntil(this.destruido), finalize(() => { if (id === this.solicitud) this.pendiente = false; })).subscribe({
      next: data => {
        if (id !== this.solicitud) return;
        this.anios.set(data.anios ?? []); this.historicos.set(data.historicos ?? {});
        this.datosEmpresa.set(data.datosEmpresa ?? []); this.presupuestosEmpresa.set(data.presupuestosEmpresa ?? []); this.pagosEmpresa.set(data.pagosEmpresa ?? []);
        // Los registros previos y las respuestas del servidor anterior siguen siendo visibles.
        const existentes = [...new Set([
          ...(data.estadosMes === undefined || !empresa ? (data.anios ?? []).flatMap(a => a.meses.filter(m => m.creado).map(m => m.periodo)) : []),
          ...(data.datosEmpresa ?? []), ...(data.presupuestosEmpresa ?? []), ...(data.pagosEmpresa ?? []),
          ...Object.keys(data.historicos ?? {}),
        ])].sort();
        const control = data.estadosMes ?? [];
        this.ctx.estadosMes.set([...existentes.map(periodo => control.find(m => m.periodo === periodo) ?? {periodo,aprobado:false}),
          ...control.filter(m => !existentes.includes(m.periodo))].sort((a,b)=>a.periodo.localeCompare(b.periodo)));
        const activo = data.periodoActivo ?? (data.estadosMes === undefined ? existentes[existentes.length-1] ?? null : null);
        this.ctx.mesActivo.set(activo); if(activo) this.ctx.periodo.set(activo);
        this.loading.set(false);
      },
      error: e => { if (id !== this.solicitud) return; this.error.set(mensajeError(e, 'No se pudieron consultar los períodos. Intenta de nuevo.')); this.loading.set(false); },
    });
  }
  ngOnDestroy(): void {
    this.solicitud++; this.consulta?.unsubscribe();
    this.destruido.next(); this.destruido.complete();
  }
}
