import { Injectable, OnDestroy, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { finalize, Observable, shareReplay, Subject, takeUntil, tap, timeout } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { mensajeError } from './gp-errores';

/** Estado del Gestor autenticado con la identidad de Nexa. */
export interface EstadoSesionGp {
  permisos?: string[];
  rol_nexa?: string;
  autenticado: boolean;
  usuario_id: number | null;
  nombre: string | null;
  /** Rol de negocio del GP (rolGp): incluye los roles transversales
   *  tesorero y gerente_financiero, y el resto del catálogo. */
  rol: 'contador' | 'gerente' | 'superadmin' | 'gerente_financiero'
    | 'director_contable' | 'tesorero' | 'editor_contable' | 'auxiliar_contable' | null;
  debe_cambiar_password: boolean;
  multiples_empresas: boolean;
  puede_aprobar: boolean;
  solo_lectura: boolean;
  cargo: string | null;
  puede_operar_pagos: boolean;
}

export interface ContadorOptionGp {
  id: number;
  nombre: string;
  username: string;
  responsable: string | null;
}

const ANON: EstadoSesionGp = {
  autenticado: false, usuario_id: null, nombre: null, rol: null,
  debe_cambiar_password: false, multiples_empresas: false,
  puede_aprobar: false, solo_lectura: false, cargo: null, puede_operar_pagos: false,
};

/**
 * Permisos del Gestor resueltos por Tesoreriabd para la sesión de Nexa.
 */
@Injectable({ providedIn: 'root' })
export class GpSessionService implements OnDestroy {

  estado = signal<EstadoSesionGp | null>(null); // null = aún verificando
  verificando = signal(false);
  error = signal<string | null>(null);
  /** Cada respuesta fresca y cada invalidación; no conserva permisos de otra consulta. */
  readonly actualizaciones$ = new Subject<EstadoSesionGp | null>();
  private readonly cancelarSesion = new Subject<void>();
  private readonly destruido = new Subject<void>();
  private consultaEnCurso?: Observable<EstadoSesionGp>;
  private generacion = 0;
  private readonly sesionExpirada = () => this.invalidar({ ...ANON });

  constructor(private http: HttpClient, private auth: AuthService) {
    this.auth.cambiosSesion$.pipe(takeUntil(this.destruido)).subscribe(() => this.invalidar(null));
    // 401 en cualquier llamada GP (sesión expirada) → volver a anon.
    window.addEventListener('gp:sesion-expirada', this.sesionExpirada);
  }

  private base(): string {
    return `${environment.gpApiUrl}/auth`;
  }

  verificar(): void {
    if (this.verificando()) return;
    this.verificando.set(true);
    this.error.set(null);
    this.consultarEstado().subscribe({ error: () => {} });
  }

  /** Comparte exclusivamente la petición pendiente; tras completar se consulta de nuevo. */
  consultarEstado(forzar = false): Observable<EstadoSesionGp> {
    if (forzar && this.consultaEnCurso) {
      this.generacion++;
      this.cancelarSesion.next();
      this.consultaEnCurso = undefined;
      this.verificando.set(false);
    }
    if (this.consultaEnCurso) return this.consultaEnCurso;
    const generacion = this.generacion;
    const consulta = this.http.get<EstadoSesionGp>(`${this.base()}/estado`).pipe(
      timeout(10000), takeUntil(this.cancelarSesion), takeUntil(this.destruido),
      tap({
        next: estado => { if (generacion === this.generacion) { this.error.set(null); this.publicar(estado); } },
        error: error => {
          if (generacion !== this.generacion) return;
          this.publicar({ ...ANON });
          this.error.set(mensajeError(error, 'No se pudo conectar con el Gestor de Nexa. Intenta de nuevo.'));
        },
      }),
      finalize(() => {
        if (this.consultaEnCurso === consulta) {
          this.consultaEnCurso = undefined;
          this.verificando.set(false);
        }
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.consultaEnCurso = consulta;
    return consulta;
  }

  private publicar(estado: EstadoSesionGp | null): void {
    if (JSON.stringify(this.estado()) !== JSON.stringify(estado)) this.estado.set(estado);
    this.actualizaciones$.next(estado);
  }

  private invalidar(estado: EstadoSesionGp | null): void {
    this.generacion++;
    this.cancelarSesion.next();
    this.consultaEnCurso = undefined;
    this.verificando.set(false);
    this.error.set(null);
    this.publicar(estado);
  }

  ngOnDestroy(): void {
    this.invalidar(null);
    this.destruido.next(); this.destruido.complete();
    this.cancelarSesion.complete(); this.actualizaciones$.complete();
    window.removeEventListener('gp:sesion-expirada', this.sesionExpirada);
  }

  login(username: string, password: string): Observable<EstadoSesionGp> {
    return this.http.post<any>(`${this.base()}/login`, { username, password }).pipe(
      tap((r) => this.invalidar({
        permisos: r.permisos, rol_nexa: r.rol_nexa,
        autenticado: true,
        usuario_id: r.usuario_id,
        nombre: r.nombre,
        rol: r.rol,
        debe_cambiar_password: !!r.debe_cambiar_password,
        multiples_empresas: !!r.multiples_empresas,
        puede_aprobar: !!r.puede_aprobar,
        solo_lectura: !!r.solo_lectura,
        cargo: r.cargo ?? null,
        puede_operar_pagos: !!r.puede_operar_pagos,
      })),
    );
  }

  logout(): void {
    this.invalidar({ ...ANON });
    this.auth.logout();
  }

  contadores(): Observable<ContadorOptionGp[]> {
    return this.http.get<ContadorOptionGp[]>(`${this.base()}/contadores`);
  }
}
