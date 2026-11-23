import { Component, Injectable, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, of, throwError } from 'rxjs';
import { PresupuestoPageComponent } from '../presupuesto/presupuesto-page.component';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { HistoricoConsulta } from '../../models/historico.model';
import { mapContrato, mapMensual, mapConsolidado, mapResumenPagos } from '../../services/gp-mapper';

/** Adaptador sin HttpClient: incluso una llamada accidental de escritura falla localmente. */
@Injectable()
export class HistoricoPresupuestoFuente {
  datos!: HistoricoConsulta;
  private readonly lecturas: Record<string, (...args: any[]) => Observable<unknown>> = {
    categorias: () => of([...this.datos.vista.categorias]),
    categoriasHistoricas: () => of([...new Set([...this.datos.vista.categorias, ...this.datos.vista.detalle.map(d => d['categoria']).filter(Boolean)])]),
    contrato: () => of(mapContrato(structuredClone(this.datos.vista.contrato))),
    mensual: () => of(mapMensual(structuredClone(this.datos.vista.mensual))),
    consolidado: () => of(this.datos.vista.consolidado.map(r => ({
      categoria: r['categoria'], proveedores: r['proveedores'] ?? 0, anticipos: r['anticipos'] ?? 0,
      cxPagar: r['cx_pagar'] ?? 0, cxCobrar: r['cx_cobrar'] ?? 0, impuestos: r['impuestos'] ?? 0,
      total: r['total'] ?? 0, pagoSugerido: r['pago_sugerido'] ?? null, notas: r['notas'] ?? null,
    }))),
    detalleConsolidado: (_empresa, _busqueda, _categoria, page = 0, size = 200) => {
      const rows = this.datos.vista.detalle;
      return of({content: rows.slice(page * size, (page + 1) * size).map(mapConsolidado), page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size)});
    },
    resumenPagos: () => of(mapResumenPagos(this.datos.vista.resumenProvisiones)),
  };
  readonly api = new Proxy({}, {get: (_target, nombre) => this.lecturas[String(nombre)] ??
    (() => throwError(() => new Error('El histórico es de solo lectura.')))}) as PresupuestoService;
}

export function contextoHistorico(): PresupuestoContextService {
  const ctx = new PresupuestoContextService(inject(PresupuestoService));
  ctx.permisos.set({gerencia: false, superAdmin: false, puedeAprobar: false, rolGp: 'historico', permisos: []});
  ctx.cargar = () => {}; ctx.cargarPermisos = () => {}; ctx.seleccionar = () => {}; ctx.seleccionarEnUrl = () => {};
  return ctx;
}

@Component({
  selector: 'app-historico-presupuesto', standalone: true, imports: [CommonModule, PresupuestoPageComponent],
  providers: [HistoricoPresupuestoFuente,
    {provide: PresupuestoService, useFactory: () => inject(HistoricoPresupuestoFuente).api},
    {provide: PresupuestoContextService, useFactory: contextoHistorico}],
  template: `@for(foto of consultas;track foto){
    <app-presupuesto-page [modoHistorico]="true" [esEjemplo]="esEjemplo || ejemploGuardado" [periodoHistorico]="foto.historico.periodo" [fechaHistorica]="foto.historico.generadoEn" />}`,
})
export class HistoricoPresupuestoComponent {
  private readonly fuente = inject(HistoricoPresupuestoFuente);
  private readonly ctx = inject(PresupuestoContextService);
  datos?: HistoricoConsulta;
  consultas:HistoricoConsulta[]=[];
  @Input() esEjemplo=false;
  get ejemploGuardado():boolean {
    const notas=this.datos?.vista.mensual['notas'] as Record<string,string>|undefined;
    return !!notas?.[this.datos?.historico.periodo ?? '']?.startsWith('DATOS DE EJEMPLO solicitados');
  }
  @Input({required: true}) set consulta(value: HistoricoConsulta) {
    this.datos = value; this.fuente.datos = value;
    this.consultas=[value];
    // Invalida la lectura también si se cambia de mes dentro de la misma empresa.
    this.ctx.empresaId.set(null);
    this.ctx.empresas.set([value.vista.empresa]); this.ctx.empresaId.set(value.historico.empresaId);
  }
}
