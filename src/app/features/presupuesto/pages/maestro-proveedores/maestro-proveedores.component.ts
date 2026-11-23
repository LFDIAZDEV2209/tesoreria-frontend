import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, computed, effect, inject, OnDestroy, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { mensajeError } from '../../services/gp-errores';

interface Proveedor { id: number; nit: string; nombre: string; categoria: string | null; categoria_detalle: string | null; activo: boolean; }

@Component({
  standalone: true, imports: [SelectBuscableDirective, CommonModule, FormsModule, GpIconComponent],
  template: `
    <section class="gp-catalogo">
      <header><div class="gp-catalogo-titulo"><app-gp-icon name="users" [size]="20"/><div><h1>Proveedores</h1><p>Creando para {{ctx.nombreEmpresa()}} — cambia de empresa arriba si es otra.</p></div></div><button class="btn-primary" (click)="abrir()"><app-gp-icon name="users" [size]="15"/> Nuevo proveedor</button></header>
      @if (error()) { <div role="alert" class="gp-catalogo-error">{{ error() }} <button class="btn-ghost" (click)="cargar()">Reintentar</button></div> }
      <div class="card gp-catalogo-tabla"><table><thead><tr><th>NIT</th><th>Nombre</th><th>Categoría</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        @if (cargando()) { <tr><td colspan="5" role="status">Cargando…</td></tr> }
        @for (p of filtrados(); track p.id) { <tr><td>{{ p.nit }}</td><td>{{ p.nombre }}</td><td>{{ p.categoria || 'Sin categoría' }}{{ p.categoria_detalle ? ' · ' + p.categoria_detalle : '' }}</td><td><span [class]="p.activo !== false ? 'text-ok' : 'text-err'">{{ p.activo !== false ? 'Activo' : 'Inactivo' }}</span></td><td><div class="gp-catalogo-acciones"><button class="btn-ghost" (click)="abrir(p)" [disabled]="ocupado()" [attr.aria-label]="'Editar ' + p.nombre"><app-gp-icon name="edit" [size]="13"/> Editar</button><button class="btn-ghost" (click)="cambiar(p)" [disabled]="ocupado()">{{ p.activo !== false ? 'Inactivar' : 'Reactivar' }}</button></div></td></tr> }
        @if (!cargando() && !filtrados().length) { <tr><td colspan="5">No hay proveedores creados todavía en esta empresa</td></tr> }
      </tbody></table></div>
      @if (modal()) { <div class="gp-catalogo-fondo" (click)="cerrar()"><form class="modal-glass gp-catalogo-form" role="dialog" aria-modal="true" aria-labelledby="gp-maestro-titulo" (click)="$event.stopPropagation()" (ngSubmit)="guardar()"><header><h2 id="gp-maestro-titulo">{{ editando ? 'Editar proveedor' : 'Nuevo proveedor' }}</h2><button type="button" class="btn-ghost" aria-label="Cerrar" (click)="cerrar()" [disabled]="ocupado()">×</button></header>
        <label>NIT<input class="field" name="nit" [(ngModel)]="nit" required [disabled]="!!editando" /></label><label>Nombre<input class="field" name="nombre" [(ngModel)]="nombre" required /></label><label>Categoría<select aria-label="Categoría" class="field" name="categoria" [(ngModel)]="categoria" required><option value="" disabled>Selecciona una categoría</option>@for (c of categorias(); track c) { <option [value]="c">{{ c }}</option> }</select></label>@if (categoria === 'OTROS') { <label>¿Cuál otro?<input class="field" name="detalle" [(ngModel)]="detalle" required /></label> }
        @if (errorFormulario()) { <p class="text-err" role="alert">{{ errorFormulario() }}</p> }
        <button class="btn-primary" type="submit" [disabled]="ocupado() || !nombre.trim() || !nit.trim() || !categoria || (categoria === 'OTROS' && !detalle.trim())">{{ ocupado() ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear proveedor' }}</button>
      </form></div> }
    </section>
  `,
  styleUrls: ['../../styles/catalogo.scss'],
})
export class MaestroProveedoresComponent implements OnDestroy {
  readonly ctx = inject(PresupuestoContextService);
  private consulta?: Subscription;
  private empresaFormulario: number | null = null;
  private readonly api = inject(PresupuestoService);
  private readonly toast = inject(PresupuestoToastService);
  readonly proveedores = signal<Proveedor[]>([]);
  readonly categorias = signal<string[]>([]);
  readonly busqueda = signal(''); readonly estado = signal('todos');
  readonly cargando = signal(true); readonly ocupado = signal(false); readonly modal = signal(false);
  readonly error = signal(''); readonly errorFormulario = signal('');
  editando: Proveedor | null = null;
  nit = ''; nombre = ''; categoria = ''; detalle = '';
  readonly filtrados = computed(() => {
    const q = this.busqueda().trim().toLocaleLowerCase('es');
    return this.proveedores().filter(p => (!q || (p.nit + ' ' + p.nombre).toLocaleLowerCase('es').includes(q)) && (this.estado() === 'todos' || (this.estado() === 'activos' ? p.activo !== false : p.activo === false)));
  });
  constructor() {
    effect(() => {const empresa=this.ctx.empresaId();untracked(() => {this.modal.set(false);this.cargar();});},{allowSignalWrites:true});
    this.api.categorias().subscribe({ next: c => this.categorias.set(c), error: e => this.error.set(this.mensaje(e)) });
  }
  ngOnDestroy():void {this.consulta?.unsubscribe();}
  cargar(): void { this.consulta?.unsubscribe();this.proveedores.set([]);if(!this.ctx.empresaId()){this.cargando.set(false);return;}this.cargando.set(true); this.error.set(''); this.consulta=this.api.catalogoProveedores().subscribe({ next: p => { this.proveedores.set([...p].sort((a,b)=>a.nombre.localeCompare(b.nombre))); this.cargando.set(false); }, error: e => { this.cargando.set(false); this.error.set(this.mensaje(e)); } }); }
  abrir(p: Proveedor | null = null): void { this.empresaFormulario=this.ctx.empresaId();this.editando = p; this.nit = p?.nit || ''; this.nombre = p?.nombre || ''; this.categoria = p?.categoria || ''; this.detalle = p?.categoria_detalle || ''; this.errorFormulario.set(''); this.modal.set(true); }
  cerrar(): void { if (!this.ocupado()) this.modal.set(false); }
  guardar(): void {
    if (!this.empresaFormulario || this.empresaFormulario!==this.ctx.empresaId() || this.ocupado() || !this.nit.trim() || !this.nombre.trim() || !this.categoria || (this.categoria === 'OTROS' && !this.detalle.trim())) return;
    const body = { nit: this.nit.trim(), nombre: this.nombre.trim(), categoria: this.categoria, categoria_detalle: this.categoria === 'OTROS' ? this.detalle.trim() : null };
    this.ocupado.set(true); this.errorFormulario.set('');
    const request = this.editando ? this.api.actualizarProveedorCatalogo(this.editando.id, body) : this.api.crearProveedorCatalogo(body);
    request.subscribe({ next: () => { this.ocupado.set(false); this.modal.set(false); this.toast.mostrar('Proveedor guardado'); this.cargar(); }, error: e => { this.ocupado.set(false); this.errorFormulario.set(this.mensaje(e)); } });
  }
  cambiar(p: Proveedor): void { if (this.ocupado()) return; this.ocupado.set(true); this.api.actualizarProveedorCatalogo(p.id, { activo: p.activo === false }).subscribe({ next: () => { this.ocupado.set(false); this.toast.mostrar(p.activo === false ? 'Proveedor reactivado' : 'Proveedor inactivado'); this.cargar(); }, error: e => { this.ocupado.set(false); this.error.set(this.mensaje(e)); } }); }
  private mensaje(e: any): string { return mensajeError(e, 'No se pudo completar la operación.'); }
}
