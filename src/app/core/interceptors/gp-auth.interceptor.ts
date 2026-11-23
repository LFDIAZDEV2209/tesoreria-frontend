import { Injectable, inject } from '@angular/core';
import {
  HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpParams,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { PresupuestoContextService } from '../../features/presupuesto/services/presupuesto-context.service';

/** API Java del Gestor: propaga la empresa Nexa seleccionada mediante como. */
@Injectable()
export class GpAuthInterceptor implements HttpInterceptor {

  private ctx = inject(PresupuestoContextService, { optional: true });

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const gp = environment.gpApiUrl;
    if (!request.url.startsWith(gp)) return next.handle(request);

    // Los contratos anuales conservan empresaId y nunca reciben filtros del mes activo.
    const anual = /\/anual(?:\/exportar)?$/.test(request.url);

    let req = request;

    let como: string | null = null;
    let params = anual ? req.params.delete('vistaMes').delete('periodoConsulta') : req.params;

    if (params.has('empresaId')) {
      como = params.get('empresaId');
      if (!anual) params = params.delete('empresaId');
    } else if (params.has('como')) {
      como = params.get('como');
    } else {
      como = this.resolverComo();
    }

    if (como && !anual) params = params.set('como', como);
    // Los módulos operativos consultan el mes habilitado; presupuesto y egresos mantienen la vista completa.
    if(!anual && /^\/(proveedores|anticipos|cuentas-pagar|cuentas-cobrar|impuestos)(\/|$)/.test(request.url.slice(gp.length))) params=params.set('vistaMes','true');
    if (request.method === "GET" && params.get("vistaMes") === "true" && this.ctx?.mesConsulta()) params=params.set("periodoConsulta",this.ctx.mesConsulta()!);
    req = req.clone({ params });

    return next.handle(req).pipe(catchError(error => {
      if (error.status === 401 && !request.url.startsWith(`${gp}/auth/`)) {
        window.dispatchEvent(new Event('gp:sesion-expirada'));
      }
      return throwError(() => error);
    }));
  }

  private resolverComo(): string | null {
    const delContexto = this.ctx?.empresaId();
    if (delContexto != null) return String(delContexto);
    if (this.ctx) return null;
    const guardado = Number(localStorage.getItem('gp_nexa_empresa_id'));
    return Number.isFinite(guardado) && guardado > 0 ? String(guardado) : null;
  }
}
