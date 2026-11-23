import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { Banco, BancoRequest, BancoResponse, StatsBancos, DocumentoBanco } from '../models/banco.model';

@Injectable({
  providedIn: 'root'
})
export class BancoService {
  private readonly baseUrl = `${environment.apiUrl}/tesoreria/bancos`;
  private readonly httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  private bancosSubject = new BehaviorSubject<Banco[]>([]);
  public bancos$ = this.bancosSubject.asObservable();

  private statsSubject = new BehaviorSubject<StatsBancos | null>(null);
  public stats$ = this.statsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.cargarBancos();
  }

  /**
   * Cargar todos los bancos
   */
  getBancos(): Observable<Banco[]> {
    return this.http.get<Banco[]>(this.baseUrl, this.httpOptions).pipe(
      tap(bancos => this.bancosSubject.next(bancos)),
      catchError(err => {
        console.error('Error loading bancos:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Cargar bancos (privado para inicialización)
   */
  private cargarBancos(): void {
    this.getBancos().subscribe({error: () => this.bancosSubject.next([])});
  }

  /**
   * Obtener un banco por ID
   */
  getBancoById(id: number): Observable<Banco> {
    return this.http.get<Banco>(`${this.baseUrl}/${id}`, this.httpOptions).pipe(
      catchError(err => throwError(() => new Error(`Error al obtener banco ${id}`)))
    );
  }

  /**
   * Crear un nuevo banco
   */
  createBanco(banco: BancoRequest, documentos?: File[]): Observable<BancoResponse> {
    const formData = this.buildFormData(banco, documentos);
    return this.http.post<BancoResponse>(this.baseUrl, formData).pipe(
      tap(newBanco => {
        const current = this.bancosSubject.value;
        this.bancosSubject.next([...current, newBanco]);
      }),
      catchError(err => {
        console.error('Error creating banco:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Actualizar un banco existente
   */
  updateBanco(id: number, banco: Partial<BancoRequest>, documentos?: File[]): Observable<BancoResponse> {
    const formData = this.buildFormData(banco as BancoRequest, documentos);
    return this.http.put<BancoResponse>(`${this.baseUrl}/${id}`, formData).pipe(
      tap(updatedBanco => {
        const current = this.bancosSubject.value;
        const index = current.findIndex(b => b.id === id);
        if (index !== -1) {
          current[index] = updatedBanco;
          this.bancosSubject.next([...current]);
        }
      }),
      catchError(err => {
        console.error('Error updating banco:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Actualizar solo el saldoPrincipal de un banco (desde movimiento diario)
   */
  actualizarSaldo(id: number, saldoPrincipal: number): Observable<BancoResponse> {
    return this.http.patch<BancoResponse>(`${this.baseUrl}/${id}/saldo`, { saldoPrincipal }, this.httpOptions).pipe(
      tap(updatedBanco => {
        const current = this.bancosSubject.value;
        const index = current.findIndex(b => b.id === id);
        if (index !== -1) {
          current[index] = updatedBanco;
          this.bancosSubject.next([...current]);
        }
      }),
      catchError(err => {
        console.error('Error actualizando saldo banco:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Cambiar estado de un banco (Activo/Inactivo)
   */
  toggleEstado(id: number): Observable<BancoResponse> {
    return this.http.patch<BancoResponse>(`${this.baseUrl}/${id}/estado`, {}, this.httpOptions).pipe(
      tap(updatedBanco => {
        const current = this.bancosSubject.value;
        const index = current.findIndex(b => b.id === id);
        if (index !== -1) {
          current[index] = updatedBanco;
          this.bancosSubject.next([...current]);
        }
      }),
      catchError(err => throwError(() => err))
    );
  }

  /**
   * Eliminar un banco
   */
  deleteBanco(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, this.httpOptions).pipe(
      tap(() => {
        const current = this.bancosSubject.value.filter(b => b.id !== id);
        this.bancosSubject.next(current);
      }),
      catchError(err => throwError(() => err))
    );
  }

  /**
   * Obtener estadísticas de bancos
   */
  getStats(): Observable<StatsBancos> {
    return this.http.get<StatsBancos>(`${this.baseUrl}/stats`, this.httpOptions).pipe(
      tap(stats => this.statsSubject.next(stats)),
      catchError(() => {
        const defaultStats: StatsBancos = {
          totalBancos: 0,
          bancosActivos: 0,
          bancosInactivos: 0,
          saldoTotalGlobal: 0,
          saldoPromedioCuenta: 0
        };
        return of(defaultStats);
      })
    );
  }

  /**
   * Adjuntar documento a un banco
   */
  uploadDocumento(bancoId: number, archivo: File): Observable<DocumentoBanco> {
    const formData = new FormData();
    formData.append('archivo', archivo);
    return this.http.post<DocumentoBanco>(`${this.baseUrl}/${bancoId}/documentos`, formData).pipe(
      catchError(err => throwError(() => err))
    );
  }

  /**
   * Descargar documento
   */
  descargarDocumento(bancoId: number, documentoId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${bancoId}/documentos/${documentoId}/download`, {
      responseType: 'blob'
    }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  /**
   * Eliminar documento
   */
  deleteDocumento(bancoId: number, documentoId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${bancoId}/documentos/${documentoId}`, this.httpOptions).pipe(
      catchError(err => throwError(() => err))
    );
  }

  /**
   * Construir FormData para envío de archivo
   */
  private buildFormData(banco: BancoRequest, documentos?: File[]): FormData {
    const formData = new FormData();

    // Serializar datos del banco como JSON
    const payload = {
      ...banco,
      activo: banco.activo !== undefined ? banco.activo : true,
      estado: banco.estado || 'Activo'
    };

    formData.append('banco', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

    // Adjuntar archivos
    if (documentos && documentos.length > 0) {
      documentos.forEach((file, index) => {
        formData.append(`documentos`, file, file.name);
      });
    }

    return formData;
  }

  /**
   * Obtener bancos cacheados
   */
  getBancosSync(): Banco[] {
    return this.bancosSubject.value;
  }

}
