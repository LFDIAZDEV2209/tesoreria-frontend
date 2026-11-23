import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ChatRequest, ChatResponse } from './chat.models';
import { environment } from '../../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ChatService {

  private readonly baseUrl = `${environment.apiUrl}/chat`;

  constructor(private http: HttpClient) {}

  sendMessage(message: string, language?: 'es' | 'en' | null, tramiteId?: number | null): Observable<ChatResponse> {
    const body: ChatRequest = { message, language: language ?? null, tramiteId: tramiteId ?? null };
    return this.http.post<ChatResponse>(this.baseUrl, body).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMsg = 'Error de conexión con el servidor.';

    if (error.status === 502) {
      errorMsg = 'El servicio de inteligencia artificial no está disponible. Intenta de nuevo.';
    } else if (error.status === 400) {
      errorMsg = error.error?.message || 'Mensaje inválido.';
    } else if (error.status === 0) {
      errorMsg = 'No se pudo conectar al servidor. ¿Está encendido el backend?';
    }

    console.error('ChatService error:', error);
    return throwError(() => new Error(errorMsg));
  }
}
