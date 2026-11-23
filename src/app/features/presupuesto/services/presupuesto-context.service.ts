import { Injectable, OnDestroy, Optional, signal } from '@angular/core';
import { finalize, skip, Subject, Subscription, take, takeUntil } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PresupuestoService } from './presupuesto.service';
import { EstadoSesionGp, GpSessionService } from './gp-session.service';
import { permisosDesdeSesion } from './gp-mapper';
import { Empresa, PermisosGp } from '../models/presupuesto.model';
import { mesBogota } from '../models/historico.model';
import { mensajeError } from './gp-errores';

/**
 * Selección de empresa del Gestor Presupuestal (workspace).
 * Persistida en localStorage; GERENCIA ve todas, operativo las asignadas.
 * También cachea los permisos efectivos (gerencia/superadmin/puede aprobar).
 */
@Injectable({ providedIn: 'root' })
export class PresupuestoContextService implements OnDestroy {

  empresas = signal<Empresa[]>([]);
  readonly periodo = signal(mesBogota());
  readonly mesActivo = signal<string | null>(null);
  readonly vistaCompleta = signal(false);
  /** Vista "Anticipos legalizados" (repositorio de anticipos de todos los meses). */
  readonly vistaLegalizados = signal(false);
  readonly mesConsulta = signal<string | null>(null);
  readonly estadosMes = signal<{periodo:string;aprobado:boolean;aprobadoPor?:string|null;aprobadoEn?:string|null}[]>([]);
  puedeCorregirMes(): boolean { return ['gerente','superadmin'].includes(this.rolGp()); }
  /**
   * ¿El perfil puede editar ese mes? Gerencia/Superadmin corrigen cualquiera;
   * el operativo cierra su mes aunque ya haya habilitado el siguiente: el mes
   * habilitado y el calendario inmediatamente anterior siguen editables (el
   * backend aplica la misma regla). Un mes aprobado sigue bloqueado.
   */
  puedeEditarMes(periodo: string): boolean {
    const mes = this.estadosMes().find(m => m.periodo === periodo);
    if (!mes) return false;
    if (this.puedeCorregirMes()) return true;
    if (mes.aprobado) return false;
    const activo = this.mesActivo();
    return !!activo && (periodo === activo || periodo === this.mesAnterior(activo));
  }

  /** Mes calendario inmediatamente anterior (AAAA-MM); null si el período no es válido. */
  private mesAnterior(periodo: string | null): string | null {
    const partes = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(periodo ?? '');
    if (!partes) return null;
    const anio = Number(partes[1]);
    const mes = Number(partes[2]);
    return mes === 1 ? String(anio - 1).padStart(4, '0') + '-12' : partes[1] + '-' + String(mes - 1).padStart(2, '0');
  }

  seleccionarPeriodo(periodo: string): void {
    if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(periodo)) return;
    this.periodo.set(periodo);

  }
  // La selección persistida es una preferencia, no una autorización vigente.
  empresaId = signal<number | null>(null);
  cargando = signal(false);
  error = signal<string | null>(null);
  permisos = signal<PermisosGp | null>(null);
  /** true = el backend GP no tiene sesión válida: hay que pedir login GP. */
  loginGpRequerido = signal(false);
  readonly sesionValidada = signal(true);
  readonly versionSesion = signal(0);

  private sesion = 0;
  private solicitudEmpresas = 0;
  private solicitudPermisos = 0;
  private cargaEnCurso = false;
  private permisosEnCurso = false;
  private sesionRestablecida = false;
  private identidadSesion: number | null | undefined;
  private consultaEmpresas?: Subscription;
  private consultaPermisos?: Subscription;
  private consultaSesion?: Subscription;
  private readonly destruido = new Subject<void>();
  constructor(private service: PresupuestoService, @Optional() auth: AuthService | null = null, @Optional() private router: Router | null = null, @Optional() private gpSession: GpSessionService | null = null) {
    if (!gpSession) auth?.cambiosSesion$.pipe(skip(1), takeUntil(this.destruido)).subscribe(() => this.limpiarSesion());
    if (gpSession) {
      this.sesionValidada.set(false);
      gpSession.actualizaciones$.pipe(takeUntil(this.destruido)).subscribe(estado => this.recibirEstado(estado));
      const estado = gpSession.estado();
      // El interceptor también puede construir este contexto: no iniciar HTTP dentro del constructor.
      if (estado) this.recibirEstado(estado, false);
    }
    router?.events.pipe(takeUntil(this.destruido)).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.aplicarEmpresaUrl(event.urlAfterRedirects);
        if (event.urlAfterRedirects.startsWith('/presupuesto/') && this.router?.parseUrl(event.urlAfterRedirects).queryParams['periodo']) {
          void this.router.navigate([], {queryParams:{periodo:null},queryParamsHandling:'merge',replaceUrl:true});
        }
      }
    });
  }

  limpiarSesion(): void {
    this.sesion++;
    this.versionSesion.update(version => version + 1);
    this.solicitudEmpresas++; this.solicitudPermisos++;
    this.consultaSesion?.unsubscribe(); this.consultaEmpresas?.unsubscribe(); this.consultaPermisos?.unsubscribe();
    this.cargaEnCurso = false; this.permisosEnCurso = false;
    this.sesionRestablecida = false; this.identidadSesion = undefined;
    this.sesionValidada.set(!this.gpSession);
    this.empresas.set([]);
    this.mesConsulta.set(null);
    this.empresaId.set(null);
    this.permisos.set(null);
    this.mesActivo.set(null); this.estadosMes.set([]);
    this.cargando.set(false);
    this.error.set(null);
    // La caché de categorías no debe sobrevivir a un cambio de sesión.
    this.service?.limpiarCacheCategorias?.();
  }

  private recibirEstado(estado: EstadoSesionGp | null, iniciarCarga = true): void {
    if (!estado?.autenticado) {
      this.limpiarSesion();
      this.loginGpRequerido.set(estado !== null);
      return;
    }
    if (this.identidadSesion !== undefined && this.identidadSesion !== estado.usuario_id) this.limpiarSesion();
    this.identidadSesion = estado.usuario_id;
    this.sesionValidada.set(true);
    this.loginGpRequerido.set(false);
    const permisos = permisosDesdeSesion(estado);
    if (JSON.stringify(this.permisos()) !== JSON.stringify(permisos)) this.permisos.set(permisos);
    if (iniciarCarga) this.sesionGpRestablecida();
  }

  cargar(forzar = false): void { this.iniciarCarga(true, forzar); }

  private iniciarCarga(actualizarPermisos: boolean, forzar = false): void {
    if (this.cargaEnCurso && !forzar) return;
    if (forzar) {
      this.solicitudEmpresas++;
      this.consultaSesion?.unsubscribe(); this.consultaEmpresas?.unsubscribe();
    }
    const sesion = this.sesion;
    this.cargaEnCurso = true;
    this.cargando.set(true);
    this.error.set(null);
    if (this.gpSession) {
      const resultado = this.gpSession.estado();
      if (resultado === null) {
        let resuelta = false;
        this.consultaSesion = this.gpSession.consultarEstado().pipe(take(1), takeUntil(this.destruido)).subscribe({
          next: estado => {
            resuelta = true;
            if (sesion !== this.sesion) return;
            if (estado.autenticado) this.continuarCargar(sesion, actualizarPermisos, forzar);
            else { this.cargaEnCurso = false; this.cargando.set(false); this.loginGpRequerido.set(true); }
          },
          error: () => { if (sesion === this.sesion) { this.cargaEnCurso = false; this.cargando.set(false); this.loginGpRequerido.set(true); } },
          complete: () => { if (!resuelta && sesion === this.sesion) { this.cargaEnCurso = false; this.cargando.set(false); } },
        });
        return;
      }
      if (!resultado.autenticado) {
        this.loginGpRequerido.set(true);
        this.cargando.set(false);
        this.cargaEnCurso = false;
        return;
      }
      this.loginGpRequerido.set(false);
    }
    this.continuarCargar(sesion, actualizarPermisos, forzar);
  }

  /** Reintenta tras un login GP exitoso. */
  sesionGpRestablecida(): void {
    if (this.sesionRestablecida) return;
    this.sesionRestablecida = true;
    this.loginGpRequerido.set(false);
    // La respuesta que acaba de validar la sesión ya contiene los permisos.
    this.iniciarCarga(false);
  }

  private continuarCargar(sesion: number, actualizarPermisos: boolean, forzar: boolean): void {
    const gpOk = this.gpSession?.estado()?.autenticado ?? true;
    if (!gpOk) {
      this.loginGpRequerido.set(true);
      this.cargando.set(false);
      this.cargaEnCurso = false;
      return;
    }
    const solicitud = ++this.solicitudEmpresas;
    this.cargando.set(true);
    this.error.set(null);
    if (actualizarPermisos || this.permisos() === null) this.cargarPermisos(forzar);
    this.consultaEmpresas = this.service.empresas().pipe(take(1), takeUntil(this.destruido), finalize(() => {
      if (sesion === this.sesion && solicitud === this.solicitudEmpresas) { this.cargaEnCurso = false; this.cargando.set(false); }
    })).subscribe({
      next: (empresas) => {
        if (sesion !== this.sesion || solicitud !== this.solicitudEmpresas) return;
        this.cargando.set(false);
        this.empresas.set(empresas);
        if (this.aplicarEmpresaUrl()) return;
        const actual = this.empresaId() ?? (Number(localStorage.getItem('gp_nexa_empresa_id')) || null);
        if (actual && empresas.some((e) => e.id === actual)) this.seleccionar(actual);
        if (!actual || !empresas.some((e) => e.id === actual)) {
          const estado = this.gpSession?.estado();
          if (empresas.length === 1 && (!estado || (estado.rol === 'contador' && !estado.multiples_empresas))) this.seleccionar(empresas[0].id);
          else { this.mesConsulta.set(null);
    this.empresaId.set(null); localStorage.removeItem('gp_nexa_empresa_id'); }
        }
      },
      error: (err) => {
        if (sesion !== this.sesion || solicitud !== this.solicitudEmpresas) return;
        this.cargando.set(false);
        this.empresas.set([]);
        this.mesConsulta.set(null);
    this.empresaId.set(null);
        this.error.set(
          mensajeError(err, 'No se pudieron cargar las empresas asignadas a tu sesión. Intenta de nuevo.')
        );
      },
    });
  }

  /** Permisos efectivos del usuario en el GP (endpoint /permisos). */
  cargarPermisos(forzar = false): void {
    if (typeof this.service?.permisosGp !== 'function') return;
    if (this.permisosEnCurso && !forzar) return;
    const sesion = this.sesion;
    const solicitud = ++this.solicitudPermisos;
    this.consultaPermisos?.unsubscribe();
    this.permisosEnCurso = true;
    this.permisos.set(null);
    this.consultaPermisos = this.service.permisosGp(forzar).pipe(take(1), takeUntil(this.destruido), finalize(() => {
      if (sesion === this.sesion && solicitud === this.solicitudPermisos) this.permisosEnCurso = false;
    })).subscribe({
      next: (p: PermisosGp | null) => { if (!this.gpSession && sesion === this.sesion && solicitud === this.solicitudPermisos) this.permisos.set(p); },
      error: () => { if (sesion === this.sesion && solicitud === this.solicitudPermisos) this.permisos.set(null); },
    });
  }

  ngOnDestroy(): void {
    this.limpiarSesion();
    this.destruido.next(); this.destruido.complete();
  }

  seleccionar(id: number): void {
    if (!this.empresas().some(e => e.id === id)) {
      this.mesConsulta.set(null);
    this.empresaId.set(null);
      localStorage.removeItem('gp_nexa_empresa_id');
      this.error.set(null);
      return;
    }
    this.error.set(null);
    if (this.empresaId() !== id) { this.mesActivo.set(null); this.estadosMes.set([]); }
    this.mesConsulta.set(null);
    this.empresaId.set(id);
    localStorage.setItem('gp_nexa_empresa_id', String(id));
  }

  /** Un workspace explícito nunca permite volver silenciosamente a la preferencia guardada. */
  private aplicarEmpresaUrl(url = this.router?.url): boolean {
    if (!this.router || !url || !/^\/presupuesto(?:[/?#]|$)/.test(url)) return false;
    const params = this.router.parseUrl(url).queryParamMap;
    const aliases = params.getAll('como');
    const canonical = params.getAll('empresaId');
    if (!aliases.length && !canonical.length) return false;
    const valido = (values: string[]) => values.length === 1 &&
      /^[1-9][0-9]*$/.test(values[0]) && Number.isSafeInteger(Number(values[0]));
    if ((aliases.length && !valido(aliases)) || (canonical.length && !valido(canonical)) ||
        (aliases.length && canonical.length && aliases[0] !== canonical[0])) {
      this.mesConsulta.set(null);
    this.empresaId.set(null);
      this.error.set('La URL debe seleccionar una empresa válida; como y empresaId deben coincidir.');
      return true;
    }
    this.seleccionar(Number(aliases[0] ?? canonical[0]));
    return true;
  }

  seleccionarEnUrl(id: number): void {
    this.seleccionar(id);
    if (this.empresaId() !== id) return;
    void this.router?.navigate([], { queryParams: { empresaId: id, como: null },
      queryParamsHandling: 'merge', replaceUrl: true });
  }

  nombreEmpresa(): string | null {
    const id = this.empresaId();
    return id === null ? null : (this.empresas().find((e) => e.id === id)?.name ?? null);
  }

  /**
   * ¿El usuario tiene el permiso de negocio? (p. ej. 'presupuesto.aprobar').
   * Confirmar pagos es exclusivo de Tesorería. En el resto, superadmin puede;
   * para los demás perfiles el listado efectivo es autoritativo incluso vacío.
   * OJO: esto solo controla la EXPERIENCIA; el backend revalida cada llamada.
   */
  tienePermiso(codigo: string): boolean {
    const p = this.permisos();
    if (!p) return false;
    const edicionMensual = ['presupuesto.editar_periodos','presupuesto.editar_contrato','presupuesto.observaciones',
      'presupuesto.pago_sugerido_proveedor','presupuesto.pago_sugerido_categoria','modulos.importar','modulos.categorizar','pagos.crear','pagos.editar'];
    if(edicionMensual.includes(codigo) && !this.puedeCorregirMes() && !this.puedeEditarMes(this.mesActivo() ?? '')) return false;
    // Limpiar un módulo (modulos.limpiar) lo decide la matriz: el Contador lo
    // trae por defecto (botón "Limpiar" de todos los módulos). El resto de
    // exclusividades de Gerencia se conserva.
    if (['pagos.eliminar', 'pagos.limpiar_workspace', 'egresos.deletion.approve'].includes(codigo)
        && !p.superAdmin && p.rolGp !== 'gerente') return false;
    if (codigo === 'pagos.pagar') return p.rolGp === 'tesorero' && (p.permisos?.includes(codigo) ?? false);
    if (p.superAdmin) return true;
    return p.permisos?.includes(codigo) ?? false;
  }

  /** Rol de negocio del catálogo (contador | gerente | superadmin | tesorero | editor_contable). */
  rolGp(): string {
    return this.permisos()?.rolGp ?? (this.permisos()?.superAdmin ? 'superadmin' : (this.permisos()?.gerencia ? 'gerente' : 'contador'));
  }
}
