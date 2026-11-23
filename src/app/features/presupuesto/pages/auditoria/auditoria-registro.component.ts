import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { mensajeError } from '../../services/gp-errores';

@Component({
  standalone: true, imports: [SelectBuscableDirective, CommonModule, FormsModule, GpIconComponent],
  template: `
    <section class="gp-catalogo" style="max-width:1200px">
      <header><div class="gp-catalogo-titulo"><app-gp-icon name="shield" [size]="20"/><div><h1>Auditoría</h1><p>Quién hizo qué, en qué empresa y sobre qué -- las más recientes primero</p></div></div><button class="btn-ghost" (click)="cargar()" [disabled]="cargando()"><app-gp-icon name="refresh" [size]="14"/> Actualizar</button></header>
      <div class="card p-4 space-y-3"><input class="field" placeholder="Buscar por persona, proveedor o beneficiario, concepto..." aria-label="Buscar en auditoría" [(ngModel)]="busqueda" (ngModelChange)="buscar()"/>
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3"><select class="field" aria-label="Persona" [(ngModel)]="usuario" (change)="cargar()"><option value="">Todas las personas</option>@for (u of usuarios(); track u.id) { <option [value]="u.id">{{ u.nombre }}</option> }</select><select class="field" aria-label="Empresa" [(ngModel)]="empresa" (change)="cargar()"><option value="">Todas las empresas</option>@for (e of ctx.empresas(); track e.id) { <option [value]="e.id">{{ e.name }}</option> }</select><select class="field" aria-label="Tipo de acción" [(ngModel)]="grupo" (change)="cargar()"><option value="">Todos los tipos</option>@for (g of grupos(); track g) { <option [value]="g">{{ g }}</option> }</select><label>Desde<input type="date" class="field" [(ngModel)]="desde" (change)="cargar()"/></label><label>Hasta<input type="date" class="field" [(ngModel)]="hasta" (change)="cargar()"/></label></div>
        <div class="gp-catalogo-filtros"><span>{{ cargando() ? 'Cargando…' : total() + ' acciones registradas · mostrando ' + entradas().length }}</span><button *ngIf="busqueda || usuario || empresa || grupo || desde || hasta" class="btn-ghost" (click)="limpiar()">Limpiar filtros</button></div>
      </div>
      @if (error()) { <p class="gp-catalogo-error" role="alert">{{ error() }} <button class="btn-ghost" (click)="cargar()">Reintentar</button></p> }
      <div class="card gp-catalogo-tabla"><table><thead><tr><th></th><th>Fecha y hora</th><th>Quién</th><th>Empresa</th><th>Qué hizo</th><th>Sobre qué</th></tr></thead><tbody>
        @if (cargando() && !entradas().length) { <tr><td colspan="6" role="status">Cargando…</td></tr> }
        @if (!cargando() && !entradas().length) { <tr><td colspan="6">{{ busqueda || usuario || empresa || grupo || desde || hasta ? 'Ninguna acción coincide con estos filtros' : 'Todavía no hay acciones registradas' }}</td></tr> }
        @for (e of entradas(); track e.id) {
          <tr (click)="expandido.set(expandido() === e.id ? null : e.id)" style="cursor:pointer"><td><button class="btn-ghost" [attr.aria-label]="'Ver detalle del registro ' + e.id" [attr.aria-expanded]="expandido() === e.id"><app-gp-icon [name]="expandido() === e.id ? 'chevron-down' : 'chevron'" [size]="14"/></button></td><td class="text-xs whitespace-nowrap">{{ e.fecha | date:'dd/MM/yyyy' }}<p>{{ e.fecha | date:'HH:mm:ss' }}</p></td><td>{{ e.usuario }}<p>{{ e.usuario_perfil }}</p></td><td>{{ e.empresa || '—' }}</td><td>{{ e.accion_texto || e.accion }}<p>{{ e.grupo }}</p></td><td>{{ e.resumen || '—' }}</td></tr>
          @if (expandido() === e.id) { <tr><td></td><td colspan="5"><div class="grid sm:grid-cols-2 gap-4">@if (e.pago) { <div><strong>El pago, como está hoy</strong><p>{{ e.pago.beneficiario }}</p><p>{{ e.pago.concepto }}</p><p>{{ e.pago.monto | currency:'COP':'symbol-narrow':'1.0-0' }} · vence {{ e.pago.fecha_proyectada }}</p><p>{{ e.pago.origen || 'Sin origen' }} · {{ e.pago.estado }} · {{ e.pago.aprobado ? 'aprobado' : 'sin aprobar' }}</p></div> }<div><strong>Registro técnico</strong><p>Acción: {{ e.accion }}</p><p>Entidad: {{ e.entidad || '—' }}</p><p style="overflow-wrap:anywhere">Detalle: {{ detalleTexto(e.detalle) }}</p><p>Usuario: {{ e.usuario_username }} · registro #{{ e.id }}</p></div></div></td></tr> }
        }
      </tbody></table></div>
      @if (entradas().length < total()) { <button class="btn-ghost" (click)="cargar(true)" [disabled]="cargando()">{{ cargando() ? 'Cargando…' : 'Cargar más' }}</button> }
    </section>
  `,
  styleUrls: ['../../styles/catalogo.scss'],
})
export class AuditoriaRegistroComponent implements OnDestroy {
  private readonly api = inject(PresupuestoService);
  readonly ctx = inject(PresupuestoContextService);
  readonly entradas = signal<any[]>([]); readonly usuarios = signal<any[]>([]); readonly grupos = signal<string[]>([]);
  readonly total = signal(0); readonly cargando = signal(false); readonly error = signal(''); readonly expandido = signal<number | null>(null);
  busqueda = ''; usuario = ''; empresa = ''; grupo = ''; desde = ''; hasta = '';
  private timer?: ReturnType<typeof setTimeout>;
  private request?: Subscription;
  constructor() {
    this.api.cuentasGp().subscribe({ next: u => this.usuarios.set(u), error: () => this.error.set('No se pudo cargar el filtro de personas.') });
    this.api.gruposAuditoria().subscribe({ next: g => this.grupos.set(g), error: () => this.error.set('No se pudo cargar el filtro de tipos.') });
    this.cargar();
  }
  detalleTexto(detalle: unknown): string { return detalle == null || detalle === '' ? '—' : typeof detalle === 'string' ? detalle : JSON.stringify(detalle); }
  buscar(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.cargar(), 400); }
  limpiar(): void { clearTimeout(this.timer); this.busqueda = this.usuario = this.empresa = this.grupo = this.desde = this.hasta = ''; this.cargar(); }
  cargar(mas = false): void {
    this.request?.unsubscribe(); this.error.set('');
    if (this.desde && this.hasta && this.desde > this.hasta) { this.error.set('La fecha desde no puede ser posterior a la fecha hasta.'); this.cargando.set(false); return; }
    const params: Record<string, string | number> = { limite: 100, offset: mas ? this.entradas().length : 0 };
    for (const [k,v] of Object.entries({ q: this.busqueda.trim(), usuario_id: this.usuario, contador_id: this.empresa, grupo: this.grupo, desde: this.desde, hasta: this.hasta })) if (v) params[k] = v;
    if (!mas) { this.entradas.set([]); this.expandido.set(null); }
    this.cargando.set(true);
    this.request = this.api.auditoriaPaginada(params).subscribe({ next: r => { this.entradas.set(mas ? [...this.entradas(), ...r.entradas] : r.entradas); this.total.set(r.total); this.cargando.set(false); }, error: e => { this.error.set(mensajeError(e, 'No se pudo cargar la auditoría. Intenta de nuevo.')); this.cargando.set(false); } });
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); clearTimeout(this.timer); }
}
