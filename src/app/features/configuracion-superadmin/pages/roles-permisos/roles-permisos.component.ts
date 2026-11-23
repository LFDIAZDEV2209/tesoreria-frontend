import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { RolesPermisosService } from '../../services/roles-permisos.service';
import { PermisoEstado, RolPermisos } from '../../models/roles-permisos.model';
import { PresupuestoToastService } from '../../../presupuesto/services/presupuesto-toast.service';
import { GpIconComponent } from '../../../presupuesto/components/gp-icon/gp-icon.component';
import { GpPageHeaderComponent } from '../../../presupuesto/components/gp-page-header/gp-page-header.component';
import { GpErrorStateComponent } from '../../../presupuesto/components/gp-error-state/gp-error-state.component';
import { GpSkeletonComponent } from '../../../presupuesto/components/gp-skeleton/gp-skeleton.component';
import { mensajeError } from '../../../presupuesto/services/gp-errores';

interface GrupoVista {
  grupo: string;
  permisos: PermisoEstado[];
  habilitados: number;
}

/**
 * "Configuraciones Superadmin > Roles y Permisos" — administra la matriz de
 * roles (contador | gerente | superadmin) del Gestor Presupuestal, réplica
 * exacta del gestor original. Solo superadmin (guard + backend 403).
 *
 * UX: se elige UN rol a la vez (pestañas), cada permiso se explica en una
 * línea, hay buscador y acciones rápidas por grupo.
 */
@Component({
  selector: 'app-roles-permisos',
  standalone: true,
  imports: [
    CommonModule, FormsModule, GpIconComponent, GpPageHeaderComponent,
    GpErrorStateComponent, GpSkeletonComponent,
  ],
  templateUrl: './roles-permisos.component.html',
  styleUrls: ['./roles-permisos.component.scss'],
})
export class RolesPermisosComponent implements OnInit {

  roles = signal<RolPermisos[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  guardando = signal(false);
  rolSeleccionado = signal<string>('');
  busqueda = signal('');

  /** Estado editable: rol -> codigo -> habilitado. */
  private matriz = signal<Record<string, Record<string, boolean>>>({});
  /** Último estado guardado (para detectar cambios y descartar). */
  private original = signal<Record<string, Record<string, boolean>>>({});

  rolActual = computed<RolPermisos | null>(
    () => this.roles().find((r) => r.rol === this.rolSeleccionado()) ?? null,
  );

  totalPermisos = computed(() => this.rolActual()?.permisos.length ?? 0);

  /** Permisos del rol elegido, filtrados por el buscador y con su estado actual. */
  permisosRol = computed<PermisoEstado[]>(() => {
    const q = this.busqueda().trim().toLowerCase();
    const rol = this.rolSeleccionado();
    const base = this.rolActual()?.permisos ?? [];
    return base
      .filter((p) => !q
        || p.nombre.toLowerCase().includes(q)
        || p.descripcion.toLowerCase().includes(q)
        || p.codigo.toLowerCase().includes(q))
      .map((p) => ({ ...p, habilitado: this.valor(rol, p.codigo) }));
  });

  grupos = computed<GrupoVista[]>(() => {
    const out: GrupoVista[] = [];
    for (const p of this.permisosRol()) {
      const existente = out.find((g) => g.grupo === p.grupo);
      if (existente) {
        existente.permisos.push(p);
        if (p.habilitado) existente.habilitados++;
      } else {
        out.push({ grupo: p.grupo, permisos: [p], habilitados: p.habilitado ? 1 : 0 });
      }
    }
    return out;
  });

  hayCambios = computed(() => this.roles().some((r) => this.cambiosDe(r.rol) > 0));
  totalCambios = computed(() => this.roles().reduce((suma, r) => suma + this.cambiosDe(r.rol), 0));

  constructor(
    private service: RolesPermisosService,
    private toast: PresupuestoToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.listar().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.matriz.set(this.aMapa(roles));
        this.original.set(this.aMapa(roles));
        if (!roles.some((r) => r.rol === this.rolSeleccionado())) {
          this.rolSeleccionado.set(roles[0]?.rol ?? '');
        }
        this.loading.set(false);
      },
      error: (e) => { this.error.set(msj(e)); this.loading.set(false); },
    });
  }

  // ── Selección y estado ──

  seleccionarRol(rol: string): void {
    this.rolSeleccionado.set(rol);
    this.busqueda.set('');
  }

  valor(rol: string, codigo: string): boolean {
    return this.matriz()[rol]?.[codigo] === true;
  }

  habilitadosDe(rol: string): number {
    return Object.values(this.matriz()[rol] ?? {}).filter(Boolean).length;
  }

  cambiosDe(rol: string): number {
    const actual = this.matriz()[rol] ?? {};
    const previo = this.original()[rol] ?? {};
    let n = 0;
    for (const codigo of Object.keys(actual)) {
      if ((actual[codigo] === true) !== (previo[codigo] === true)) n++;
    }
    return n;
  }

  esCambio(codigo: string): boolean {
    const rol = this.rolSeleccionado();
    return this.valor(rol, codigo) !== (this.original()[rol]?.[codigo] === true);
  }

  // ── Cambios ──

  toggle(codigo: string): void {
    this.setValor(this.rolSeleccionado(), codigo, !this.valor(this.rolSeleccionado(), codigo));
  }

  /** Activa/desactiva todos los permisos VISIBLES del rol (respeta el buscador). */
  toggleVisibles(habilitar: boolean): void {
    const rol = this.rolSeleccionado();
    this.matriz.update((actual) => {
      const fila = { ...(actual[rol] ?? {}) };
      for (const p of this.permisosRol()) fila[p.codigo] = habilitar;
      return { ...actual, [rol]: fila };
    });
  }

  toggleGrupo(grupo: GrupoVista, habilitar: boolean): void {
    const rol = this.rolSeleccionado();
    this.matriz.update((actual) => {
      const fila = { ...(actual[rol] ?? {}) };
      for (const p of grupo.permisos) fila[p.codigo] = habilitar;
      return { ...actual, [rol]: fila };
    });
  }

  private setValor(rol: string, codigo: string, valor: boolean): void {
    this.matriz.update((actual) => ({
      ...actual,
      [rol]: { ...(actual[rol] ?? {}), [codigo]: valor },
    }));
  }

  limpiarBusqueda(): void {
    this.busqueda.set('');
  }

  // ── Guardar / descartar ──

  guardar(): void {
    const pendientes = this.roles().filter((r) => this.cambiosDe(r.rol) > 0);
    if (pendientes.length === 0) return;
    this.guardando.set(true);
    forkJoin(pendientes.map((r) => this.service.guardarRol(r.rol, this.cambiosDeRol(r.rol)))).subscribe({
      next: () => {
        this.original.set(this.copiar(this.matriz()));
        this.guardando.set(false);
        this.toast.mostrar('Roles y permisos actualizados');
      },
      error: (e) => { this.guardando.set(false); this.toast.error(msj(e)); },
    });
  }

  descartar(): void {
    if (!this.hayCambios()) return;
    this.matriz.set(this.copiar(this.original()));
    this.toast.mostrar('Cambios descartados');
  }

  private cambiosDeRol(rol: string): Record<string, boolean> {
    const cambios: Record<string, boolean> = {};
    for (const p of this.roles().find((r) => r.rol === rol)?.permisos ?? []) {
      if (this.valor(rol, p.codigo) !== (this.original()[rol]?.[p.codigo] === true)) {
        cambios[p.codigo] = this.valor(rol, p.codigo);
      }
    }
    return cambios;
  }

  colorRol(rol: string): string {
    switch (rol) {
      case 'director_contable': return '#0369A1';
      case 'contador': return '#0F766E';
      case 'gerente': return '#7C3AED';
      case 'superadmin': return '#B45309';
      case 'gerente_financiero': return '#9333EA';
      default: return '#045C94';
    }
  }

  // ── Helpers ──

  private aMapa(roles: RolPermisos[]): Record<string, Record<string, boolean>> {
    const mapa: Record<string, Record<string, boolean>> = {};
    for (const rol of roles) {
      mapa[rol.rol] = {};
      for (const p of rol.permisos) mapa[rol.rol][p.codigo] = p.habilitado;
    }
    return mapa;
  }

  private copiar(mapa: Record<string, Record<string, boolean>>): Record<string, Record<string, boolean>> {
    const copia: Record<string, Record<string, boolean>> = {};
    for (const [rol, permisos] of Object.entries(mapa)) copia[rol] = { ...permisos };
    return copia;
  }
}

function msj(e: any): string {
  return mensajeError(e);
}
