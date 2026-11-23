import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { mensajeError } from '../../services/gp-errores';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, GpPageHeaderComponent],
  template: `
    <div class="gp-catalogo">
      <header><div><h1>Categorías</h1><p>Lista compartida por todas las empresas -- desactivar no borra lo ya categorizado</p></div><button *ngIf="ctx.tienePermiso('admin.categorias')" class="btn-primary" (click)="abrir()">+ Nueva categoría</button></header>
      <p *ngIf="error()" role="alert" class="gp-catalogo-error">{{error()}} <button class="btn-ghost" (click)="cargar()">Reintentar</button></p>
      <ng-container *ngIf="ctx.tienePermiso('admin.categorias'); else sinPermiso">
        <div class="card gp-catalogo-tabla"><table><thead><tr><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
          <tr *ngIf="cargando()"><td colspan="3" role="status">Cargando…</td></tr>
          <tr *ngIf="!cargando() && !categorias().length"><td colspan="3">No hay categorías todavía</td></tr>
          <tr *ngFor="let categoria of categorias()">
            <td>{{categoria.nombre}}</td>
            <td><span [class]="categoria.activa ? 'text-ok' : 'text-err'">{{categoria.activa ? 'Activa' : 'Inactiva'}}</span></td>
            <td><div class="gp-catalogo-acciones"><button class="btn-ghost" (click)="abrir(categoria)" [disabled]="ocupado()">Editar</button><button [disabled]="ocupado()" (click)="cambiar(categoria)" class="btn-ghost"
              [attr.aria-label]="(categoria.activa ? 'Desactivar ' : 'Activar ') + categoria.nombre">
              {{categoria.activa ? 'Inactivar' : 'Reactivar'}}
            </button></div></td>
          </tr>
        </tbody></table></div>
        <div *ngIf="modal()" class="gp-catalogo-fondo" (click)="cerrar()"><form [formGroup]="formulario" (ngSubmit)="crear()" class="modal-glass gp-catalogo-form" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="gp-categoria-titulo">
          <header><h2 id="gp-categoria-titulo">{{ editando ? 'Editar categoría' : 'Nueva categoría' }}</h2><button class="btn-ghost" type="button" (click)="cerrar()" [disabled]="ocupado()" aria-label="Cerrar">×</button></header>
          <label>Nombre<input [formControl]="nombre" maxlength="50" class="field uppercase" placeholder="Ej. ELECTRODOMESTICOS" autofocus /></label>
          <p>{{ editando ? 'El nombre nuevo se aplica a todo lo ya categorizado, en todas las empresas.' : 'Se guarda en mayúsculas. Aparece de inmediato en todos los selectores de categoría.' }}</p>
          <p *ngIf="error()" role="alert" class="text-err">{{ error() }}</p>
          <button type="submit" [disabled]="nombre.invalid || ocupado()" class="btn-primary">{{ ocupado() ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear categoría' }}</button>
        </form></div>
      </ng-container>
      <ng-template #sinPermiso><p>No tiene permiso para administrar categorías.</p></ng-template>
    </div>
  `,
  styleUrls: ['../../styles/catalogo.scss'],
})
export class CategoriasComponent {
  readonly ctx = inject(PresupuestoContextService);
  private readonly service = inject(PresupuestoService);
  private readonly toast = inject(PresupuestoToastService);
  readonly modal = signal(false);
  readonly cargando = signal(false);
  editando: {id: number; nombre: string} | null = null;
  abrir(categoria: {id: number; nombre: string} | null = null): void { this.editando = categoria; this.nombre.setValue(categoria?.nombre || ''); this.error.set(''); this.modal.set(true); }
  cerrar(): void { if (!this.ocupado()) this.modal.set(false); }
  readonly nombre = new FormControl('', {nonNullable: true, validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/.*\S.*/)]});
  readonly formulario = new FormGroup({nombre: this.nombre});
  readonly categorias = signal<{id: number; nombre: string; activa: boolean}[]>([]);
  readonly error = signal('');
  readonly ocupado = signal(false);
  constructor() {
    this.ctx.cargarPermisos();
    effect(() => {
      if (this.ctx.tienePermiso('admin.categorias')) this.cargar();
      else this.categorias.set([]);
    }, {allowSignalWrites: true});
  }
  cargar(): void {
    this.cargando.set(true);
    this.service.administrarCategorias().subscribe({next: filas => { this.categorias.set(filas); this.cargando.set(false); }, error: err => this.fallar(err)});
  }
  crear(): void {
    if (this.nombre.invalid || this.ocupado() || !this.ctx.tienePermiso('admin.categorias')) return;
    this.ocupado.set(true); this.error.set('');
    const request = this.editando ? this.service.renombrarCategoria(this.editando.id, this.nombre.value.trim()) : this.service.crearCategoria(this.nombre.value.trim());
    request.subscribe({next: () => {this.nombre.reset(); this.ocupado.set(false); this.modal.set(false); this.toast.mostrar(this.editando ? 'Categoría actualizada' : 'Categoría creada'); this.cargar();}, error: err => this.fallar(err)});
  }
  cambiar(categoria: {id: number; activa: boolean}): void {
    if (this.ocupado() || !this.ctx.tienePermiso('admin.categorias')) return;
    this.ocupado.set(true); this.error.set('');
    this.service.cambiarEstadoCategoria(categoria.id, !categoria.activa).subscribe({next: () => {this.ocupado.set(false); this.cargar();}, error: err => this.fallar(err)});
  }
  private fallar(err: any): void {
    this.cargando.set(false);
    this.ocupado.set(false);
    this.error.set(mensajeError(err, 'No se pudo completar la operación.'));
  }
}
