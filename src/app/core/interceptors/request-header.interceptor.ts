import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from 'src/environments/environment';

/**
 * Interceptor que agrega headers personalizados a todas las solicitudes HTTP.
 * - Agrega X-User-Name si hay un usuario autenticado
 * - Agrega Authorization: Bearer <token> si hay token en storage
 */
@Injectable()
export class RequestHeaderInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const currentUser = this.authService.getCurrentUser();

    // El token vive dentro del 'currentUser' guardado en localStorage (auth.service.ts)
    let token: string | null = currentUser?.token ?? null;
    if (!token) {
      try {
        const raw = localStorage.getItem('currentUser');
        token = raw ? (JSON.parse(raw)?.token ?? null) : null;
      } catch {
        token = null;
      }
    }

    const headers: Record<string, string> = {};
    if (currentUser && currentUser.username) {
      headers['X-User-Name'] = currentUser.username;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (Object.keys(headers).length > 0) {
      // Clonar la solicitud y agregar los headers
      request = request.clone({
        setHeaders: headers,
      });
    }

    return next.handle(request);
  }
}
