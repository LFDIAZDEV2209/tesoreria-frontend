import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { LoginRequest, LoginResponse, AuthState } from '../models/auth.model';
import { environment } from 'src/environments/environment';

export interface PasswordRecoveryResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {



  /**
   * Base URL SIEMPRE relativa para que pase por IIS:
    * - En prod: /api -> IIS -> http://localhost:8081/api
    * - En dev: puedes usar proxy.conf.json también con /api
   */
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  private authState = signal<AuthState>({
    user: null,
    isAuthenticated: false,
    loading: false
  });

  private userSubject = new BehaviorSubject<LoginResponse | null>(this.getUserFromStorage());
  
  readonly cambiosSesion$ = this.userSubject.asObservable();

  // Signal para mostrar el formulario de cambio de contraseña en el login
  requirePasswordChange = signal(false);

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.checkAuthStatus();
  }

  private checkAuthStatus(): void {
    const user = this.getUserFromStorage();
    if (user) {
      this.authState.set({
        user,
        isAuthenticated: true,
        loading: false
      });
    }
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    this.authState.set({
      ...this.authState(),
      loading: true,
      error: undefined
    });

    const payload = {
      username: (credentials.username || '').trim(),
      password: credentials.password || ''
    };

    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, payload, this.httpOptions)
      .pipe(
        tap((response: LoginResponse) => {
          this.saveUserToStorage(response);
          this.authState.set({
            user: response,
            isAuthenticated: true,
            loading: false
          });
          this.userSubject.next(response);

          if (response.requirePasswordChange === true) {
            this.requirePasswordChange.set(true);
          } else {
            const redirectRoute = this.getRedirectRouteByRole(response);
            this.router.navigate([redirectRoute]);
          }
        }),
        catchError(error => {
          // El backend responde { detail } o { message } con el motivo real
          // (ej. "Tu cuenta no tiene acceso a la plataforma NEXA").
          const cuerpo = error?.error;
          const errorMessage =
            (typeof cuerpo === 'string' ? cuerpo : null) ||
            cuerpo?.detail ||
            cuerpo?.message ||
            cuerpo?.error ||
            'Usuario o contraseña incorrectos';

          this.authState.set({
            user: null,
            isAuthenticated: false,
            loading: false,
            error: errorMessage
          });

          return throwError(() => new Error(errorMessage));
        })
      );
  }

  logout(): void {
    localStorage.removeItem('currentUser');
    this.authState.set({
      user: null,
      isAuthenticated: false,
      loading: false
    });
    this.requirePasswordChange.set(false);
    this.userSubject.next(null);
    this.router.navigate(['/login']);
  }

  getCurrentUser(): LoginResponse | null {
    return this.authState().user;
  }

  getCurrentUserEmployeeId(): number | null {
    const user = this.getCurrentUser();
    return user?.employeeId || null;
  }

  getCurrentUserDependencyId(): number | null {
    const user = this.getCurrentUser();
    return user?.dependencyId || null;
  }

  isAuthenticated(): boolean {
    return this.authState().isAuthenticated;
  }

  isLoading(): boolean {
    return this.authState().loading;
  }

  getError(): string | undefined {
    return this.authState().error;
  }

  private saveUserToStorage(user: LoginResponse): void {
    localStorage.setItem('currentUser', JSON.stringify(user));
  }

  private getUserFromStorage(): LoginResponse | null {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
  }

  clearError(): void {
    this.authState.set({
      ...this.authState(),
      error: undefined
    });
  }

  // Limpiar el flag de cambio de contraseña después de cambiarla exitosamente
  clearPasswordChangeFlag(): void {
    this.requirePasswordChange.set(false);
  }

  // Todos los usuarios ingresan al presupuesto (vista inicial de la plataforma)
  private getRedirectRouteByRole(response: LoginResponse): string {
    return '/presupuesto/presupuesto';
  }
  changePassword(userId: number | undefined, currentPassword: string, newPassword: string, confirmPassword: string): Observable<string> {
    const payload = {
      userId: userId,
      currentPassword,
      newPassword: newPassword,
      confirmPassword
    };

    return this.http.post(`${this.baseUrl}/change-password`, payload, {
      ...this.httpOptions,
      responseType: 'text'
    });
  }

  /** HTTP 202 acknowledges the queued request; it does not confirm account existence or delivery. */
  requestPasswordRecovery(email: string): Observable<PasswordRecoveryResponse> {
    return this.http.post<PasswordRecoveryResponse>(`${this.baseUrl}/request-password-reset`, { email: email.trim() }, this.httpOptions)
      .pipe(map(response => this.requireRecoverySuccess(response)));
  }

  /** The backend validates the user-bound OTP and changes the password atomically. */
  resetPasswordWithCode(email: string, code: string, newPassword: string, confirmPassword: string): Observable<PasswordRecoveryResponse> {
    const payload = {
      email: email.trim(),
      token: code.trim(),
      newPassword: newPassword,
      confirmPassword
    };

    return this.http.post<PasswordRecoveryResponse>(`${this.baseUrl}/confirm-password-reset`, payload, this.httpOptions)
      .pipe(
        map(response => this.requireRecoverySuccess(response)),
        tap(() => {
          // Limpiar la sesión después de reiniciar contraseña
          this.logout();
        })
      );
  }

  private requireRecoverySuccess(response: PasswordRecoveryResponse): PasswordRecoveryResponse {
    if (response?.success !== true) throw new Error('No se pudo completar la operación.');
    return response;
  }
}
