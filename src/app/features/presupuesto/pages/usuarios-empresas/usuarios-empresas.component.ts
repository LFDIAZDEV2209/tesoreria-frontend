import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { Empresa } from '../../models/presupuesto.model';

interface UsuarioEmpresa {
  usuarioId: number;
  username: string;
  email: string;
  /** Flag real del backend: Gerente Ejecutivo (puede aprobar), solo superadmin. */
  puedeAprobar: boolean | null;
  empresasIds: number[];
}

@Component({
  selector: 'app-usuarios-empresas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios-empresas.component.html',
  styleUrls: ['./usuarios-empresas.component.scss'],
})
export class UsuariosEmpresasComponent implements OnInit {

  usuarios = signal<UsuarioEmpresa[]>([]);
  empresas = signal<Empresa[]>([]);
  cargando = signal(true);
  guardando = signal<number | null>(null);
  mensaje = signal<string | null>(null);

  seleccion = new Map<number, Set<number>>();

  constructor(
    private service: PresupuestoService,
    public ctx: PresupuestoContextService,
  ) {}

  ngOnInit(): void {
    this.service.empresas().subscribe((e) => this.empresas.set(e));
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.service.usuariosGp({ page: 0, size: 100 }).subscribe({
      next: (pagina) => {
        const lista: UsuarioEmpresa[] = pagina.content.map((u) => ({
          usuarioId: u.id,
          username: u.username,
          email: u.email ?? '',
          puedeAprobar: u.puedeAprobar,
          empresasIds: u.empresaIds ?? [],
        }));
        this.usuarios.set(lista);
        this.seleccion.clear();
        lista.forEach((u) => this.seleccion.set(u.usuarioId, new Set(u.empresasIds)));
        this.cargando.set(false);
      },
      error: () => {
        this.mensaje.set('No fue posible cargar los usuarios (requiere SUPER_ADMIN).');
        this.cargando.set(false);
      },
    });
  }

  estaSeleccionada(usuarioId: number, empresaId: number): boolean {
    return this.seleccion.get(usuarioId)?.has(empresaId) ?? false;
  }

  toggleEmpresa(usuarioId: number, empresaId: number): void {
    const set = this.seleccion.get(usuarioId) ?? new Set<number>();
    if (set.has(empresaId)) {
      set.delete(empresaId);
    } else {
      set.add(empresaId);
    }
    this.seleccion.set(usuarioId, set);
  }

  togglePermiso(u: UsuarioEmpresa): void {
    const nuevo = !(u.puedeAprobar === true);
    this.guardando.set(u.usuarioId);
    this.service.actualizarUsuarioGp(u.usuarioId, { puedeAprobar: nuevo }).subscribe({
      next: (actualizado) => {
        u.puedeAprobar = actualizado.puedeAprobar;
        this.mensaje.set(`Permiso de aprobación ${nuevo ? 'otorgado a' : 'revocado de'} ${u.username}.`);
        this.guardando.set(null);
      },
      error: () => {
        this.mensaje.set('No fue posible cambiar el permiso.');
        this.guardando.set(null);
      },
    });
  }

  guardar(u: UsuarioEmpresa): void {
    const ids = Array.from(this.seleccion.get(u.usuarioId) ?? []);
    this.guardando.set(u.usuarioId);
    this.service.asignarEmpresasGp(u.usuarioId, ids).subscribe({
      next: (actualizado) => {
        u.empresasIds = actualizado.empresaIds ?? ids;
        this.mensaje.set(`Empresas actualizadas para ${u.username}.`);
        this.guardando.set(null);
      },
      error: () => {
        this.mensaje.set('No fue posible asignar las empresas.');
        this.guardando.set(null);
      },
    });
  }
}