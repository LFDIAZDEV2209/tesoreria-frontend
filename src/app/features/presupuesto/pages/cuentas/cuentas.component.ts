import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { CandidatoUsuario } from '../../models/presupuesto.model';
import { mensajeError } from '../../services/gp-errores';

export interface CuentaGp {
  id: number; nombre: string; username: string; rol: string; activo: boolean;
  es_workspace: boolean; solo_lectura: boolean; puede_aprobar: boolean;
  cargo: string | null; empresa_ids: number[]; debe_cambiar_password?: boolean;
  empresa_id?: number; email?: string; employee_id?: number;
}
export const ROLES_CUENTA = [
  { value: 'director_contable', label: 'Director Contable' },
  { value: 'contador', label: 'Contador (empresa)' },
  { value: 'contador_multiempresa', label: 'Contador (multi-empresa)' },
  { value: 'gerente', label: 'Gerencia' },
  { value: 'tesorero', label: 'Tesorera' },
  { value: 'gerente_financiero', label: 'Gerencia Financiera (aprueba egresos)' },
  { value: 'jefe_proyectos', label: 'Jefe de Proyectos (solo lectura)' },
  { value: 'analista_financiero', label: 'Analista Financiero (solo lectura)' },
  { value: 'aux_contable', label: 'Aux. Contable (solo lectura)' },
  { value: 'analista_contable', label: 'Analista Contable (solo lectura)' },
  { value: 'superadmin', label: 'Superadmin' },
];
export function contratoRolCuenta(rol: string) {
  const cargos: Record<string, string> = { jefe_proyectos: 'Jefe de Proyectos', analista_financiero: 'Analista Financiero', aux_contable: 'Aux. Contable', analista_contable: 'Analista Contable' };
  return { rol: rol.startsWith('contador') ? 'contador' : cargos[rol] ? 'gerente' : rol, es_workspace: rol === 'contador', solo_lectura: !!cargos[rol], cargo: cargos[rol] || null, puede_aprobar: rol === 'gerente' };
}

@Component({
  standalone: true, imports: [SelectBuscableDirective, CommonModule, FormsModule, GpIconComponent],
  templateUrl: './cuentas.component.html', styleUrls: ['../../styles/catalogo.scss'],
})
export class CuentasComponent {
  private readonly api = inject(PresupuestoService);
  private readonly ctx = inject(PresupuestoContextService);
  private readonly toast = inject(PresupuestoToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly cuentas = signal<CuentaGp[]>([]);
  readonly tab = signal<'empresas' | 'usuarios'>('empresas');
  readonly cargando = signal(true); readonly ocupado = signal(false); readonly error = signal('');
  readonly modal = signal<'crear' | 'editar' | 'empresas' | 'eliminar' | null>(null);
  readonly errorModal = signal('');
  readonly empresas = computed(() => this.cuentas().filter(c => c.es_workspace));
  readonly personas = computed(() => this.cuentas().filter(c => !c.es_workspace));
  readonly filas = computed(() => this.tab() === 'empresas' ? this.empresas() : this.personas());
  readonly roles = ROLES_CUENTA;
  seleccionada: CuentaGp | null = null;
  nombre = ''; username = ''; password = ''; rol = 'gerente';
  email = ''; employeeId: number | null = null; busquedaEmpleado = ''; paginaEmpleado = 0;
  readonly candidatos = signal<CandidatoUsuario[]>([]);
  readonly totalPaginasEmpleado = signal(0); readonly totalCandidatos = signal(0);
  readonly buscandoEmpleado = signal(false);
  /** La persona elegida ya tiene cuenta en la BD compartida (PeopleNet). */
  readonly cuentaExistente = signal(false);
  /** La persona elegida no tiene cuenta: se creará con correo y clave temporal. */
  readonly crearCredenciales = signal(false);
  /** Fila elegida del selector (para el resumen de la persona). */
  seleccionDatos: CandidatoUsuario | null = null;
  esEmpresa(): boolean { return this.seleccionada?.es_workspace ?? this.tab() === 'empresas'; }
  /** Alta de acceso a una cuenta que ya existe: solo se otorga el acceso. */
  esCuentaDb(): boolean { return !this.esEmpresa() && !this.seleccionada && this.cuentaExistente(); }
  buscarEmpleados(page = 0): void {
    this.paginaEmpleado = page; this.buscandoEmpleado.set(true);
    this.sincronizarBusquedaEnUrl();
    this.api.candidatosUsuarios(this.busquedaEmpleado, page, 8).subscribe({
      next: r => {
        this.candidatos.set(r.content); this.totalPaginasEmpleado.set(r.totalPages);
        this.totalCandidatos.set(r.totalElements); this.buscandoEmpleado.set(false);
      },
      error: e => { this.errorModal.set(this.mensaje(e)); this.buscandoEmpleado.set(false); },
    });
  }
  /**
   * El término del buscador vive en la URL (?search=), como PeopleNet:
   * /presupuesto/usuarios?search=duvan%20palma. Al recargar o compartir la
   * página el buscador queda precargado.
   */
  private sincronizarBusquedaEnUrl(): void {
    const termino = this.busquedaEmpleado.trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: termino || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  /** Iniciales para el avatar del selector de personas. */
  inicialesUsuario(nombre: string | null | undefined): string {
    const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
    return (((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()) || '?';
  }
  /** Quita la persona elegida para volver a buscar (sin perder la búsqueda). */
  limpiarEmpleado(): void {
    this.employeeId = null; this.nombre = ''; this.username = ''; this.email = '';
    this.password = ''; this.cuentaExistente.set(false); this.crearCredenciales.set(false);
    this.seleccionDatos = null;
  }
  limpiarBusquedaEmpleado(): void { this.busquedaEmpleado = ''; this.buscarEmpleados(0); }
  elegirEmpleado(c: CandidatoUsuario): void {
    this.employeeId = c.employeeId; this.nombre = c.nombreCompleto;
    this.email = c.email || ''; this.username = c.username || '';
    this.password = '';
    const conCuenta = c.tieneCuenta === true;
    this.cuentaExistente.set(conCuenta); this.crearCredenciales.set(!conCuenta);
    if (!conCuenta) {
      // Sin cuenta: se propone usuario y clave temporal (editables).
      this.username = this.usuarioSugerido(c.nombreCompleto);
      this.password = this.generarPassword();
    }
    this.seleccionDatos = c;
  }
  /** Usuario sugerido a partir del nombre (sin tildes, separado por puntos). */
  usuarioSugerido(nombre: string): string {
    const base = (nombre || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '').slice(0, 80);
    return base || 'usuario';
  }
  /** Clave temporal de 10 caracteres para cuentas nuevas. */
  generarPassword(): string {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let clave = '';
    const rnd = new Uint32Array(10);
    crypto.getRandomValues(rnd);
    for (let i = 0; i < 10; i++) clave += alfabeto[rnd[i] % alfabeto.length];
    return clave;
  }
  regenerarPassword(): void { this.password = this.generarPassword(); }
  seleccionEmpresas = new Set<number>();
  constructor() {
    // Búsqueda reproducible por URL: /presupuesto/usuarios?search=adriana
    const search = this.route.snapshot.queryParamMap.get('search');
    if (search) this.busquedaEmpleado = search;
    this.cargar();
  }
  cargar(): void { this.cargando.set(true); this.error.set(''); this.api.cuentasGp().subscribe({ next: c => { this.cuentas.set(c); this.cargando.set(false); }, error: e => { this.cargando.set(false); this.error.set(this.mensaje(e)); } }); }
  abrir(cuenta: CuentaGp | null = null): void {
    this.seleccionada = cuenta; this.nombre = cuenta?.nombre || ''; this.username = cuenta?.username || ''; this.password = '';
    this.rol = cuenta ? this.rolDe(cuenta) : this.tab() === 'empresas' ? 'contador' : 'gerente';
    this.errorModal.set(''); this.modal.set(cuenta ? 'editar' : 'crear');
    this.email = cuenta?.email || ''; this.employeeId = cuenta?.employee_id || null;
    this.cuentaExistente.set(false); this.crearCredenciales.set(false); this.seleccionDatos = null;
    if (!cuenta && !this.esEmpresa()) this.buscarEmpleados();
  }
  rolDe(c: CuentaGp): string {
    if (c.rol === 'contador') return c.es_workspace ? 'contador' : 'contador_multiempresa';
    if (c.rol !== 'gerente' || !c.solo_lectura) return c.rol;
    return ({ 'Jefe de Proyectos': 'jefe_proyectos', 'Analista Financiero': 'analista_financiero', 'Aux. Contable': 'aux_contable', 'Analista Contable': 'analista_contable' } as Record<string,string>)[c.cargo || ''] || 'jefe_proyectos';
  }
  labelRol(c: CuentaGp): string { return this.roles.find(r => r.value === this.rolDe(c))?.label || c.rol; }
  @HostListener('document:keydown.escape') cerrar(): void { if (!this.ocupado()) { this.modal.set(null); this.password = ''; } }
  async guardar(): Promise<void> {
    if (this.ocupado() || !this.nombre.trim() || !this.username.trim()) return;
    if (/\s/.test(this.username.trim()) || this.username.trim().length < 3) { this.errorModal.set('El usuario debe tener al menos 3 caracteres y no contener espacios.'); return; }
    if (!this.esEmpresa() && !this.seleccionada && !this.employeeId) { this.errorModal.set('Selecciona una persona de la base de datos.'); return; }
    if (!this.esEmpresa() && !this.seleccionada && this.crearCredenciales()) {
      if (!this.email.trim() || !this.email.includes('@')) { this.errorModal.set('Escribe un correo válido para la cuenta (servirá para NEXA y PeopleNet).'); return; }
      if (this.password.length < 8) { this.errorModal.set('La clave temporal debe tener al menos 8 caracteres.'); return; }
    }
    if (!this.esEmpresa() && this.seleccionada && this.password && this.password.length < 8) { this.errorModal.set('La clave debe tener al menos 8 caracteres.'); return; }
    const body: Record<string, unknown> = { nombre: this.nombre.trim(), username: this.username.trim(), ...contratoRolCuenta(this.rol), es_workspace: this.esEmpresa() };
    if (!this.esEmpresa()) { body['email'] = this.email.trim(); body['employee_id'] = this.employeeId; }
    // Conservar los roles de Nexa al editar solamente el nombre o la clave.
    if (this.seleccionada && this.rol === this.rolDe(this.seleccionada)) delete body['rol'];
    if (this.password && !this.esEmpresa()) body['password'] = this.password;
    this.ocupado.set(true); this.errorModal.set('');
    try {
      await firstValueFrom(this.seleccionada ? this.api.editarCuentaGp(this.seleccionada.id, body) : this.api.crearCuentaGp(body));
      this.toast.mostrar(this.seleccionada ? 'Cuenta actualizada' : this.rol === 'contador' ? 'Empresa creada' : 'Acceso a NEXA otorgado');
      this.modal.set(null); this.password = ''; this.cargar(); this.ctx.cargar(true);
    } catch (e) { this.errorModal.set(this.mensaje(e)); } finally { this.ocupado.set(false); }
  }
  async actualizar(c: CuentaGp, cambios: Record<string, unknown>): Promise<void> {
    if (this.ocupado()) return; this.ocupado.set(true); this.error.set('');
    try { await firstValueFrom(this.api.editarCuentaGp(c.id, cambios)); this.toast.mostrar('Cuenta actualizada'); this.cargar(); this.ctx.cargar(true); }
    catch (e) { this.error.set(this.mensaje(e)); } finally { this.ocupado.set(false); }
  }
  alternarLectura(c: CuentaGp): void { void this.actualizar(c, { solo_lectura: !c.solo_lectura, ...(!c.solo_lectura ? { puede_aprobar: false } : {}) }); }
  cambiarClave(c: CuentaGp): void {
    if (this.ocupado()) return;
    const password = window.prompt(`Nueva clave para ${c.nombre} (mínimo 8 caracteres):`);
    if (!password) return;
    if (password.length < 8) { this.error.set('La clave debe tener al menos 8 caracteres.'); return; }
    void this.actualizar(c, {password});
  }
  asignar(c: CuentaGp): void { this.seleccionada = c; this.seleccionEmpresas = new Set(c.empresa_ids || []); this.errorModal.set(''); this.modal.set('empresas'); }
  toggleEmpresa(id: number): void { this.seleccionEmpresas.has(id) ? this.seleccionEmpresas.delete(id) : this.seleccionEmpresas.add(id); }
  async guardarEmpresas(): Promise<void> {
    if (!this.seleccionada || this.ocupado()) return; this.ocupado.set(true); this.errorModal.set('');
    try { await firstValueFrom(this.api.asignarEmpresasGp(this.seleccionada.id, [...this.seleccionEmpresas])); this.toast.mostrar('Empresas asignadas'); this.modal.set(null); this.cargar(); this.ctx.cargar(true); }
    catch (e) { this.errorModal.set(this.mensaje(e)); } finally { this.ocupado.set(false); }
  }
  pedirEliminar(c: CuentaGp): void { this.seleccionada = c; this.errorModal.set(''); this.modal.set('eliminar'); }
  async eliminar(): Promise<void> {
    if (!this.seleccionada || this.ocupado()) return; this.ocupado.set(true); this.errorModal.set('');
    try { await firstValueFrom(this.api.eliminarCuentaGp(this.seleccionada.id)); this.modal.set(null); this.toast.mostrar('Empresa retirada del Gestor'); this.cargar(); this.ctx.cargar(true); }
    catch (e) { this.errorModal.set(this.mensaje(e)); } finally { this.ocupado.set(false); }
  }
  private mensaje(e: any): string { return mensajeError(e, 'No se pudo completar la operación.'); }
}
