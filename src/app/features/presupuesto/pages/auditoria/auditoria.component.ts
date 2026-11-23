import { Component, computed, effect, inject, OnDestroy, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PresupuestoAuditoriaService, RegistroAuditoria } from '../../services/presupuesto-auditoria.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { mensajeError } from '../../services/gp-errores';
import { GpEmpresaSelectorComponent } from '../../components/gp-empresa-selector/gp-empresa-selector.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpEmptyStateComponent } from '../../components/gp-empty-state/gp-empty-state.component';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';

@Component({
  selector: 'app-auditoria', standalone: true,
  imports: [CommonModule, FormsModule, GpEmpresaSelectorComponent, GpSkeletonComponent, GpErrorStateComponent, GpEmptyStateComponent, GpPageHeaderComponent],
  template: `
    <section class="gp-native-page space-y-5 min-w-0">
      <app-gp-page-header icono="clock" color="#213053" titulo="Historial" descripcion="Consulta quién modificó la información de la empresa y en qué periodo."/>
      <form class="card flex flex-wrap items-end gap-4" (ngSubmit)="cargar()">
        <div class="min-w-0"><span class="block text-sm text-t2 mb-1">Empresa</span><app-gp-empresa-selector/></div>
        <label class="text-sm text-t2">Periodo<input type="month" class="field" name="periodo" [ngModel]="periodo()" (ngModelChange)="periodo.set($event)"/></label>
        <label class="text-sm text-t2 flex-1 min-w-[180px]">Usuario<input type="search" class="field" name="usuario" placeholder="Nombre o usuario" [ngModel]="usuario()" (ngModelChange)="usuario.set($event)"/></label>
        <button type="submit" class="btn-primary" [disabled]="loading() || !ctx.empresaId()">Aplicar filtros</button>
        <button type="button" class="btn-ghost" (click)="limpiar()" [disabled]="loading()">Limpiar filtros</button>
      </form>
      <app-gp-skeleton *ngIf="loading()" tipo="table"/>
      <app-gp-error-state *ngIf="error()" [mensaje]="error()" (reintentar)="cargar()"/>
      <ng-container *ngIf="!loading() && !error()">
        <p class="text-sm text-t3" role="status">{{visibles().length}} de {{registros().length}} registros de {{ctx.nombreEmpresa() || 'empresa'}}. Los filtros se aplican a un máximo de 200 acciones autorizadas para tu usuario.</p>
        <app-gp-empty-state *ngIf="!visibles().length" icono="clock" [titulo]="ctx.empresaId() ? 'Sin registros para estos filtros' : 'Selecciona una empresa'" descripcion="Prueba otro periodo o usuario para consultar el historial."/>
        <div *ngIf="visibles().length" class="card !p-0 historial-tabla" tabindex="0" role="region" aria-label="Historial de modificaciones">
          <table class="w-full text-sm"><caption class="sr-only">Acciones registradas en la empresa seleccionada</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Acción</th><th scope="col">Periodo</th><th scope="col">Detalle</th></tr></thead>
            <tbody><tr *ngFor="let r of visibles(); trackBy: identificar"><td class="whitespace-nowrap">{{r.createdAt ? (r.createdAt | date:'dd/MM/yyyy HH:mm') : '—'}}</td><td>{{r.usuarioNombre || 'Sin usuario registrado'}}</td><td class="font-medium">{{accion(r.accion)}}</td><td>{{periodosRegistro(r).join(', ') || 'No indicado'}}</td><td><span *ngIf="r.entidad" class="block text-xs text-t3 mb-1">{{accion(r.entidad)}}</span><div class="detalle">{{detalle(r.detalle)}}</div></td></tr></tbody>
          </table>
        </div>
      </ng-container>
    </section>`,
  styles: [`:host{display:block;min-width:0}.historial-tabla{overflow:auto;max-height:65vh}th,td{padding:14px 16px;text-align:left;border-bottom:1px solid rgb(var(--bdr-rgb)/.1);vertical-align:top}thead th{position:sticky;top:0;background:var(--bg-elevated);color:var(--tx-2);font-size:12px}td{color:var(--tx-2)}.detalle{min-width:220px;max-width:520px;white-space:pre-wrap;overflow-wrap:anywhere}:focus-visible{outline:2px solid var(--acc-solid);outline-offset:3px}`],
})
export class AuditoriaComponent implements OnDestroy {
  readonly ctx = inject(PresupuestoContextService);
  private readonly api = inject(PresupuestoAuditoriaService);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly registros = signal<RegistroAuditoria[]>([]);
  readonly periodo = signal('');
  readonly usuario = signal('');
  private readonly filtrosAplicados = signal({periodo: '', usuario: ''});
  readonly visibles = computed(() => {
    const f = this.filtrosAplicados(), usuario = f.usuario.trim().toLocaleLowerCase('es');
    return this.registros().filter(r => (!f.periodo || this.periodosRegistro(r).includes(f.periodo))
      && (!usuario || (r.usuarioNombre ?? '').toLocaleLowerCase('es').includes(usuario)));
  });
  private consulta?: Subscription;
  constructor() {
    effect(() => { this.ctx.empresaId(); untracked(() => this.cargar()); }, {allowSignalWrites: true});
    if (!this.ctx.empresas().length) this.ctx.cargar();
  }
  identificar(_: number, r: RegistroAuditoria): number { return r.id; }
  accion(valor: string): string {
    const texto = valor.replace(/[_.-]+/g, ' ').toLocaleLowerCase('es');
    return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
  }
  private objeto(detalle: RegistroAuditoria['detalle']): Record<string, unknown> | null {
    try { const valor = JSON.parse(String(detalle)); return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null; } catch { return null; }
  }
  periodosRegistro(r: RegistroAuditoria): string[] {
    // El backend registra periodo, periodoAnterior y periodos de importación en detalle.
    return [...new Set(r.detalle?.match(/\b\d{4}-(?:0[1-9]|1[0-2])\b/g) ?? [])].sort();
  }
  detalle(valor: RegistroAuditoria['detalle']): string {
    const obj = this.objeto(valor);
    if (!obj) return valor?.replace(/;\s*/g, '\n') || 'Sin detalle adicional';
    return Object.entries(obj).map(([clave, dato]) => `${this.accion(clave.replace(/([a-z])([A-Z])/g, '$1 $2'))}: ${typeof dato === 'object' && dato !== null ? JSON.stringify(dato) : dato ?? '—'}`).join('\n');
  }
  limpiar(): void { this.periodo.set(''); this.usuario.set(''); this.cargar(); }
  cargar(): void {
    this.consulta?.unsubscribe(); this.registros.set([]); this.error.set('');
    const empresa = this.ctx.empresaId();
    if (empresa === null) { this.loading.set(false); return; }
    const filtros = {periodo: this.periodo().trim(), usuario: this.usuario().trim()};
    this.filtrosAplicados.set(filtros); this.loading.set(true);
    this.consulta = this.api.listar(empresa, filtros).subscribe({
      next: registros => { this.registros.set([...registros].sort((a,b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id-a.id)); this.loading.set(false); },
      error: e => {
        this.error.set(e.status === 403
          ? 'Tu perfil no tiene acceso al historial de esta empresa. Solicita al administrador que revise el permiso de auditoría.'
          : mensajeError(e));
        this.loading.set(false);
      },
    });
  }
  ngOnDestroy(): void { this.consulta?.unsubscribe(); }
}
