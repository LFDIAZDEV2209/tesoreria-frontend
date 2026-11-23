import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/core/services/auth.service';

export interface OtpSolicitarResponse {
  mensaje: string;
  emailEnmascarado: string;
  expiraEnMinutos: number;
}

export interface OtpVerificarResponse {
  valido: boolean;
  mensaje: string;
}

/**
 * Servicio OTP independiente para Cadena de Suministros.
 * Modificar este servicio NO afecta al módulo de compras.
 */
@Injectable({
  providedIn: 'root',
})
export class OtpCsService {
  private readonly baseUrl = `${environment.apiUrl}/compras/otp`;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  private getHeaders(): HttpHeaders {
    const user = this.authService.getCurrentUser();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'X-User-Email': user?.email || '',
    });
  }

  /**
   * Solicita el envío de un código OTP al email del usuario autenticado.
   */
  solicitarOtp(contexto: string = 'VISTO_BUENO'): Observable<OtpSolicitarResponse> {
    return this.http
      .post<OtpSolicitarResponse>(
        `${this.baseUrl}/solicitar`,
        { contexto },
        { headers: this.getHeaders() },
      )
      .pipe(catchError((err) => throwError(() => err)));
  }

  /**
   * Verifica el código OTP ingresado por el usuario.
   */
  verificarOtp(codigo: string, contexto: string = 'VISTO_BUENO'): Observable<OtpVerificarResponse> {
    return this.http
      .post<OtpVerificarResponse>(
        `${this.baseUrl}/verificar`,
        { codigo, contexto },
        { headers: this.getHeaders() },
      )
      .pipe(catchError((err) => throwError(() => err)));
  }
}
