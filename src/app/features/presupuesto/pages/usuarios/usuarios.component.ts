import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import {
  CandidatoUsuario, EstadisticasUsuariosGp, RolNexa, UsuarioGp,
} from '../../models/presupuesto.model';
import { gpFilaTabla } from '../../animations/gp-animations';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpModalComponent } from '../../components/gp-modal/gp-modal.component';
import { GpPageHeaderComponent } from '../../components/gp-page-header/gp-page-header.component';
import { GpErrorStateComponent } from '../../components/gp-error-state/gp-error-state.component';
import { GpSkeletonComponent } from '../../components/gp-skeleton/gp-skeleton.component';
import { mensajeError } from '../../services/gp-errores';

type FiltroUsuarios = 'todos' | 'activos' | 'inactivos' | 'clave' | 'sin-empresa';

const ETIQUETA_ROL: Record<string, string> = {
  DIRECTOR_CONTABLE: 'Director Contable',
  SUPER_ADMIN: 'Super Administrador',
  ADMIN: 'Administrador',
  DOCUMENT_ADMIN: 'Admin de Documentos',
  SUPERVISOR: 'Supervisor',
  USER_NIVEL_3: 'Usuario Nivel 3',
  USER_NIVEL_2: 'Usuario Nivel 2',
  USER_NIVEL_1: 'Usuario Nivel 1',
  USER: 'Usuario',
  TESORERO: 'Tesorera',
  TESORERA: 'Tesorera',
  GERENTE_FINANCIERO: 'Gerencia Financiera',
  EDITOR_CONTABLE: 'Editor contable',
  AUXILIAR_CONTABLE: 'Auxiliar contable',
};

/**
 * "Usuarios y Accesos" (Configuraciones Superadmin) — administra QUIÉN puede
 * entrar a NEXA y qué ve cada persona en el Gestor Presupuestal.
 *
 * El listado, las estadísticas y el buscador de personas vienen PAGINADOS
 * desde el backend (vista v_nexa_usuarios + índices): la pantalla nunca trae
 * tablas completas, solo la página que se está viendo.
 */
@Component({
  selector: 'app-gp-usuarios',
  standalone: true,
  imports: [SelectBuscableDirective,
    CommonModule, FormsModule, GpIconComponent, GpModalComponent,
    GpPageHeaderComponent, GpErrorStateComponent, GpSkeletonComponent,
  ],
  animations: [gpFilaTabla],
  templateUrl: './usuarios.component.html',
  styleUrls: ['./usuarios.component.scss'],
})
export class GpUsuariosComponent implements OnInit {

  // ── Lista paginada de cuentas ──
  usuarios = signal<UsuarioGp[]>([]);
  stats = signal<EstadisticasUsuariosGp>({ total: 0, activos: 0, clavesTemporales: 0, sinEmpresa: 0 });
  loading = signal(true);
  error = signal<string | null>(null);
  busqueda = signal('');
  filtro = signal<FiltroUsuarios>('todos');
  pagina = signal(0);
  tamano = signal(12);
  totalPaginas = signal(0);
  totalRegistros = signal(0);

  rolesNexa = signal<RolNexa[]>([]);

  groupGerencia = computed(() => this.usuarios().filter((u) => this.esGerencia(u)));
  groupOperativos = computed(() => this.usuarios().filter((u) => !this.esGerencia(u)));

  /** "1–12 de 32 cuentas" */
  rangoTexto = computed(() => {
    const total = this.totalRegistros();
    if (total === 0) return 'Sin resultados';
    const desde = this.pagina() * this.tamano() + 1;
    const hasta = Math.min(desde + this.usuarios().length - 1, total);
    return `${desde}–${hasta} de ${total}`;
  });

  /** Ventana de páginas visibles del paginador (máx. 5). */
  paginasVisibles = computed(() => {
    const total = this.totalPaginas();
    const actual = this.pagina();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i);
    const inicio = Math.max(0, Math.min(actual - 2, total - 5));
    return Array.from({ length: 5 }, (_, i) => inicio + i);
  });

  private timerBusqueda: any = null;

  constructor(
    public ctx: PresupuestoContextService,
    private service: PresupuestoService,
    private toast: PresupuestoToastService,
  ) {}

  ngOnInit(): void {
    if (this.ctx.empresas().length === 0) this.ctx.cargar();
    this.cargar();
    this.cargarEstadisticas();
    this.service.rolesUsuarios().subscribe({
      next: (roles) => this.rolesNexa.set(roles),
      error: () => this.rolesNexa.set([]),
    });
  }

  // ── Carga de datos ──

  cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.usuariosGp({
      busqueda: this.busqueda().trim() || undefined,
      filtro: this.filtro(),
      page: this.pagina(),
      size: this.tamano(),
    }).subscribe({
      next: (p) => {
        this.usuarios.set(p.content);
        this.totalPaginas.set(p.totalPages);
        this.totalRegistros.set(p.totalElements);
        // Si la página quedó fuera de rango (p. ej. al borrar/filtrar), retrocede.
        if (p.totalPages > 0 && this.pagina() >= p.totalPages) {
          this.pagina.set(p.totalPages - 1);
          this.cargar();
          return;
        }
        this.loading.set(false);
      },
      error: (e) => { this.error.set(msj(e)); this.loading.set(false); },
    });
  }

  cargarEstadisticas(): void {
    this.service.estadisticasUsuariosGp().subscribe({
      next: (s) => this.stats.set(s),
      error: () => {},
    });
  }

  /** Refresca lista + tarjetas de resumen. */
  refrescar(): void {
    this.cargar();
    this.cargarEstadisticas();
  }

  // ── Búsqueda y filtros (servidor) ──

  setBusqueda(valor: string): void {
    this.busqueda.set(valor);
    clearTimeout(this.timerBusqueda);
    this.timerBusqueda = setTimeout(() => {
      this.pagina.set(0);
      this.cargar();
    }, 350);
  }

  setFiltro(valor: FiltroUsuarios): void {
    this.filtro.set(valor);
    this.pagina.set(0);
    this.cargar();
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtro.set('todos');
    this.pagina.set(0);
    this.cargar();
  }

  // ── Paginación ──

  irPagina(p: number): void {
    if (p < 0 || p >= Math.max(this.totalPaginas(), 1) || p === this.pagina()) return;
    this.pagina.set(p);
    this.cargar();
  }

  cambiarTamano(n: number): void {
    this.tamano.set(Number(n));
    this.pagina.set(0);
    this.cargar();
  }

  filtros = computed(() => {
    const s = this.stats();
    return [
      { valor: 'todos' as const, label: 'Todas', conteo: s.total },
      { valor: 'activos' as const, label: 'Activas', conteo: s.activos },
      { valor: 'inactivos' as const, label: 'Inactivas', conteo: s.total - s.activos },
      { valor: 'clave' as const, label: 'Clave temporal', conteo: s.clavesTemporales },
      { valor: 'sin-empresa' as const, label: 'Sin empresa', conteo: s.sinEmpresa },
    ];
  });

  // ── Textos ──

  nombreEmpresa(id: number): string {
    return this.ctx.empresas().find((e) => e.id === id)?.name ?? `Empresa ${id}`;
  }

  etiquetaRol(name: string): string {
    return ETIQUETA_ROL[name] ?? name;
  }

  descripcionRol(name: string): string {
    return this.rolesNexa().find((r) => r.name === name)?.description ?? '';
  }

  esGerencia(u: UsuarioGp): boolean {
    return u.roles.includes('SUPER_ADMIN') || u.roles.includes('ADMIN');
  }

  etiquetaAprobar(u: UsuarioGp): string {
    if (u.puedeAprobar === null || u.puedeAprobar === undefined) return 'Hereda del rol';
    return u.puedeAprobar ? 'Puede aprobar' : 'No aprueba';
  }

  iniciales(u: UsuarioGp): string {
    const nombre = (u.nombreCompleto ?? u.username ?? '?').trim();
    const partes = nombre.split(/\s+/).filter(Boolean);
    return (((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()) || '?';
  }

  // ── Añadir usuario ──

  modalCrear = signal(false);
  pasoCrear = signal<'elegir' | 'form'>('elegir');
  candidatos = signal<CandidatoUsuario[]>([]);
  cargandoCandidatos = signal(false);
  busquedaCandidatos = signal('');
  candidatoSeleccionado = signal<CandidatoUsuario | null>(null);
  candPagina = signal(0);
  candPaginas = signal(0);
  candTotal = signal(0);
  readonly candTamano = 8;
  private timerCandidatos: any = null;

  formUsername = signal('');
  formEmail = signal('');
  formPassword = signal('');
  formRol = signal('');
  formActivo = signal(true);
  formPuedeAprobar = signal<'hereda' | 'si' | 'no'>('hereda');
  formEmpresas = signal<Set<number>>(new Set());
  mostrarPassword = signal(false);
  guardandoCrear = signal(false);

  rangoCandidatos = computed(() => {
    const total = this.candTotal();
    if (total === 0) return 'Sin resultados';
    const desde = this.candPagina() * this.candTamano + 1;
    const hasta = Math.min(desde + this.candidatos().length - 1, total);
    return `${desde}–${hasta} de ${total}`;
  });

  candPaginasVisibles = computed(() => {
    const total = this.candPaginas();
    const actual = this.candPagina();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i);
    const inicio = Math.max(0, Math.min(actual - 2, total - 5));
    return Array.from({ length: 5 }, (_, i) => inicio + i);
  });

  abrirCrear(): void {
    this.pasoCrear.set('elegir');
    this.candidatoSeleccionado.set(null);
    this.busquedaCandidatos.set('');
    this.candidatos.set([]);
    this.candPagina.set(0);
    this.candPaginas.set(0);
    this.candTotal.set(0);
    this.modalCrear.set(true);
    // La primera página de personas se carga sola al abrir el modal.
    this.cargarCandidatos();
  }

  cargarCandidatos(): void {
    this.cargandoCandidatos.set(true);
    this.service.candidatosUsuarios(this.busquedaCandidatos(), this.candPagina(), this.candTamano).subscribe({
      next: (p) => {
        this.candidatos.set(p.content);
        this.candPaginas.set(p.totalPages);
        this.candTotal.set(p.totalElements);
        this.cargandoCandidatos.set(false);
      },
      error: (e) => { this.cargandoCandidatos.set(false); this.toast.error(msj(e)); },
    });
  }

  buscarCandidatos(): void {
    this.candPagina.set(0);
    this.cargarCandidatos();
  }

  /** Búsqueda con retardo para no consultar en cada tecla. */
  setBusquedaCandidatos(valor: string): void {
    this.busquedaCandidatos.set(valor);
    clearTimeout(this.timerCandidatos);
    this.timerCandidatos = setTimeout(() => this.buscarCandidatos(), 350);
  }

  irPaginaCandidatos(p: number): void {
    if (p < 0 || p >= Math.max(this.candPaginas(), 1) || p === this.candPagina()) return;
    this.candPagina.set(p);
    this.cargarCandidatos();
  }

  seleccionarCandidato(c: CandidatoUsuario): void {
    this.candidatoSeleccionado.set(c);
    const correo = (c.email ?? '').trim();
    this.formUsername.set(usuarioDesdeCorreo(correo, c.nombreCompleto));
    this.formEmail.set(correo);
    this.formPassword.set(this.generarPassword());
    this.formRol.set('');
    this.formActivo.set(true);
    this.formPuedeAprobar.set('hereda');
    this.formEmpresas.set(new Set());
    this.pasoCrear.set('form');
  }

  volverAElegir(): void {
    this.pasoCrear.set('elegir');
  }

  toggleEmpresaForm(id: number): void {
    this.formEmpresas.update((s) => {
      const nuevo = new Set(s);
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
      return nuevo;
    });
  }

  togglearTodasEmpresas(): void {
    const todas = this.ctx.empresas().map((e) => e.id);
    const actual = this.formEmpresas();
    this.formEmpresas.set(actual.size === todas.length ? new Set() : new Set(todas));
  }

  generarPassword(): string {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let clave = '';
    const rnd = new Uint32Array(10);
    crypto.getRandomValues(rnd);
    for (let i = 0; i < 10; i++) clave += alfabeto[rnd[i] % alfabeto.length];
    return clave;
  }

  regenerarPassword(): void {
    this.formPassword.set(this.generarPassword());
    this.mostrarPassword.set(true);
  }

  crearUsuario(): void {
    const candidato = this.candidatoSeleccionado();
    const username = this.formUsername().trim();
    const email = this.formEmail().trim();
    const password = this.formPassword();
    if (!candidato) { this.toast.error('Selecciona una persona de la base de datos.'); return; }
    if (!username) { this.toast.error('Escribe el nombre de usuario.'); return; }
    if (username.includes(' ')) { this.toast.error('El usuario no puede tener espacios.'); return; }
    if (!email || !email.includes('@')) { this.toast.error('Escribe un correo válido.'); return; }
    if (password.length < 8) { this.toast.error('La contraseña temporal debe tener al menos 8 caracteres.'); return; }
    if (!this.formRol()) { this.toast.error('Selecciona el rol de la cuenta.'); return; }

    const aprobar = this.formPuedeAprobar();
    this.guardandoCrear.set(true);
    this.service.crearUsuarioGp({
      employeeId: candidato.employeeId,
      username,
      email,
      password,
      rol: this.formRol(),
      activo: this.formActivo(),
      puedeAprobar: aprobar === 'hereda' ? null : aprobar === 'si',
      empresaIds: Array.from(this.formEmpresas()),
    }).subscribe({
      next: (u) => {
        this.guardandoCrear.set(false);
        this.modalCrear.set(false);
        this.toast.mostrar(`Cuenta creada para ${u.username}. Comparte la clave temporal.`);
        this.refrescar();
      },
      error: (e) => { this.guardandoCrear.set(false); this.toast.error(msj(e)); },
    });
  }

  // ── Cambiar rol ──

  usuarioRol = signal<UsuarioGp | null>(null);
  rolEditado = signal('');
  guardandoRol = signal(false);

  abrirRol(u: UsuarioGp): void {
    this.usuarioRol.set(u);
    this.rolEditado.set(u.roles[0] ?? '');
  }

  guardarRol(): void {
    const u = this.usuarioRol();
    if (!u || !this.rolEditado()) return;
    this.guardandoRol.set(true);
    this.service.actualizarUsuarioGp(u.id, { rol: this.rolEditado() }).subscribe({
      next: () => {
        this.guardandoRol.set(false);
        this.usuarioRol.set(null);
        this.toast.mostrar(`Rol actualizado para ${u.username}`);
        this.refrescar();
      },
      error: (e) => { this.guardandoRol.set(false); this.toast.error(msj(e)); },
    });
  }

  // ── Empresas ──

  usuarioEmpresas = signal<UsuarioGp | null>(null);
  empresasEdit = signal<Set<number>>(new Set());
  guardandoEmpresas = signal(false);
  busquedaEmpresas = signal('');

  empresasFiltradas = computed(() => {
    const q = this.busquedaEmpresas().trim().toLowerCase();
    const lista = this.ctx.empresas();
    return q ? lista.filter((e) => (e.name ?? '').toLowerCase().includes(q) || (e.nit ?? '').includes(q)) : lista;
  });

  abrirEmpresas(u: UsuarioGp): void {
    this.usuarioEmpresas.set(u);
    this.empresasEdit.set(new Set(u.empresaIds));
    this.busquedaEmpresas.set('');
  }

  toggleEmpresaEdicion(id: number): void {
    this.empresasEdit.update((s) => {
      const nuevo = new Set(s);
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
      return nuevo;
    });
  }

  toggleTodasEmpresasEdicion(): void {
    const visibles = this.empresasFiltradas().map((e) => e.id);
    const actual = this.empresasEdit();
    const todasMarcadas = visibles.length > 0 && visibles.every((id) => actual.has(id));
    this.empresasEdit.set(todasMarcadas ? new Set() : new Set(visibles));
  }

  get todasEmpresasVisiblesMarcadas(): boolean {
    const visibles = this.empresasFiltradas().map((e) => e.id);
    return visibles.length > 0 && visibles.every((id) => this.empresasEdit().has(id));
  }

  guardarEmpresas(): void {
    const u = this.usuarioEmpresas();
    if (!u) return;
    this.guardandoEmpresas.set(true);
    this.service.asignarEmpresasGp(u.id, Array.from(this.empresasEdit())).subscribe({
      next: () => {
        this.guardandoEmpresas.set(false);
        this.usuarioEmpresas.set(null);
        this.toast.mostrar(`Empresas actualizadas para ${u.username}`);
        this.refrescar();
      },
      error: (e) => { this.guardandoEmpresas.set(false); this.toast.error(msj(e)); },
    });
  }

  // ── Permiso de aprobar y estado ──

  togglePuedeAprobar(u: UsuarioGp): void {
    this.service.actualizarUsuarioGp(u.id, { puedeAprobar: u.puedeAprobar !== true }).subscribe({
      next: () => { this.toast.mostrar(`Permiso de aprobar actualizado para ${u.username}`); this.refrescar(); },
      error: (e) => this.toast.error(msj(e)),
    });
  }

  toggleActivo(u: UsuarioGp): void {
    this.service.actualizarUsuarioGp(u.id, { activo: !u.activo }).subscribe({
      next: () => { this.toast.mostrar(`${u.username} ${u.activo ? 'desactivado' : 'activado'}`); this.refrescar(); },
      error: (e) => this.toast.error(msj(e)),
    });
  }

  // ── Reset de clave ──

  usuarioReset = signal<UsuarioGp | null>(null);
  reseteando = signal(false);
  claveGenerada = signal<{ username: string; password: string } | null>(null);

  abrirReset(u: UsuarioGp): void {
    this.usuarioReset.set(u);
  }

  confirmarReset(): void {
    const u = this.usuarioReset();
    if (!u) return;
    this.reseteando.set(true);
    this.service.resetearPasswordGp(u.id).subscribe({
      next: (r) => {
        this.reseteando.set(false);
        this.usuarioReset.set(null);
        this.claveGenerada.set(r);
        this.refrescar();
      },
      error: (e) => { this.reseteando.set(false); this.toast.error(msj(e)); },
    });
  }

  copiarClave(): void {
    const clave = this.claveGenerada()?.password;
    if (!clave) return;
    navigator.clipboard?.writeText(clave).then(
      () => this.toast.mostrar('Contraseña copiada al portapapeles'),
      () => this.toast.error('No se pudo copiar. Selecciónala manualmente.'),
    );
  }
}

function usuarioDesdeCorreo(correo: string, nombre: string): string {
  const base = correo.includes('@') ? correo.split('@')[0] : '';
  if (base) return base.toLowerCase();
  return nombre.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'usuario';
}

function msj(e: any): string {
  return mensajeError(e);
}
