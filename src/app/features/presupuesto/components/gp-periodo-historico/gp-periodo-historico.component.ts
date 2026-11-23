import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { HistoricoConsulta, periodoHistorico } from '../../models/historico.model';
import { PageResponse } from '../../models/presupuesto.model';
import { HistoricoPresupuestoComponent } from '../../pages/historicos/historico-presupuesto.component';
import { GpModuloHistoricoComponent } from '../gp-modulo-historico/gp-modulo-historico.component';
import { GpEmptyStateComponent } from '../gp-empty-state/gp-empty-state.component';
import { GpErrorStateComponent } from '../gp-error-state/gp-error-state.component';
import { mensajeError } from '../../services/gp-errores';
import { HistoricoModuloVista } from '../../services/historico-modulo-fuente.service';

@Component({selector:'app-gp-periodo-historico',standalone:true,imports:[CommonModule,FormsModule,HistoricoPresupuestoComponent,GpModuloHistoricoComponent,GpEmptyStateComponent,GpErrorStateComponent],
  template:`
    @if(loading()){<div class="gp-estado-wrap" role="status"><app-gp-empty-state icono="calendar" [cargando]="true" [titulo]="'Leyendo ' + etiqueta(periodoSeleccionado())" descripcion="Estamos consultando la copia consolidada de este período." /></div>}
    @else if(error()){<div class="gp-estado-wrap"><app-gp-error-state titulo="No pudimos leer el período" [mensaje]="error()" detalle="Vuelve a consultar. Si persiste, revisa que la empresa y el período seleccionados sean los correctos." (reintentar)="cargar()" /></div>}
    @else {
    @if(presupuesto();as datos){<app-historico-presupuesto [consulta]="datos" />}
    @else {@if(vista();as datos){<app-gp-modulo-historico [modulo]="modulo" [datos]="datos" />}}
    }
  `,
  styles:[`.gp-estado-wrap{padding:1.5rem}@media(max-width:600px){.gp-estado-wrap{padding:.75rem}}.gp-periodo-records{padding:1rem}h1{font-size:1.5rem}p{margin:.8rem 0}form,nav{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}label{display:flex;gap:.5rem;align-items:center}.gp-history-table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.75rem;border-bottom:1px solid #045c9424;white-space:nowrap}`]})
export class GpPeriodoHistoricoComponent implements OnChanges,OnDestroy {
  @Input({required:true}) modulo='presupuesto';
  @Input() periodo='';
  @Input() empresaId:number|null=null;
  @Input() historicoId:number|null=null;
  readonly ctx=inject(PresupuestoContextService);private readonly http=inject(HttpClient);
  readonly loading=signal(false);readonly error=signal('');readonly presupuesto=signal<HistoricoConsulta|null>(null);
  readonly filas=signal<PageResponse<Record<string,unknown>>|null>(null);readonly etiqueta=periodoHistorico;
  readonly vista=signal<HistoricoModuloVista|null>(null);
  pagina=0;busqueda='';private peticion?:Subscription;
  ngOnChanges(){this.pagina=0;this.busqueda='';this.cargar();}
  periodoSeleccionado(){return this.periodo||this.ctx.periodo();}
  ngOnDestroy(){this.peticion?.unsubscribe();}
  titulo(){return ({'proveedores':'Proveedores','anticipos':'Anticipos','cuentas-pagar':'Cuentas por Pagar','cuentas-cobrar':'Cuentas por Cobrar','impuestos':'Impuestos','otros-pagos':'Provisiones','pagos-proyectados':'Proyección de Egresos'} as Record<string,string>)[this.modulo]||'Presupuesto';}
  columnas(){return ['otros-pagos','pagos-proyectados'].includes(this.modulo)
    ? [{id:'fecha_proyectada',nombre:'Fecha'},{id:'nit',nombre:'NIT'},{id:'nombre',nombre:'Tercero'},{id:'categoria',nombre:'Categoría'},{id:'concepto',nombre:'Concepto'},{id:'monto_proyectado',nombre:'Monto',money:true},{id:'estado',nombre:'Estado'}]
    : [{id:'fecha',nombre:'Fecha'},{id:'nit',nombre:'NIT'},{id:'nombre',nombre:'Tercero'},{id:'categoria',nombre:'Categoría'},{id:'comprobante',nombre:'Comprobante'},{id:'detalle',nombre:'Detalle'},{id:'debito',nombre:'Débito',money:true},{id:'credito',nombre:'Crédito',money:true},{id:'saldo',nombre:'Saldo',money:true}];}
  celda(value:unknown,money?:boolean){return value==null?'—':money&&typeof value==='number'?new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(value):String(value);}
  cargar(){
    this.peticion?.unsubscribe();this.loading.set(true);this.error.set('');this.presupuesto.set(null);this.filas.set(null);this.vista.set(null);
    const empresa=this.empresaId??this.ctx.empresaId();if(!empresa){this.loading.set(false);return;}
    const ruta=this.historicoId?'/historicos/'+this.historicoId+'/modulos/'+this.modulo:'/periodos/'+this.periodoSeleccionado()+'/historico/'+this.modulo;
    this.peticion=this.http.get<any>(environment.gpApiUrl+ruta,{params:{empresaId:empresa,page:this.pagina,size:50,busqueda:this.busqueda}}).subscribe({
      next:data=>{
        if(data.historico?.periodo!==this.periodoSeleccionado() || data.historico?.empresaId!==empresa || (this.historicoId && data.historico?.id!==this.historicoId)){this.error.set('La información recibida no corresponde a la empresa y al histórico seleccionados. Actualiza la consulta.');this.loading.set(false);return;}
        if(this.modulo==='presupuesto')this.presupuesto.set(data);
        else if(data.presentacion){this.filas.set(data.filas);this.vista.set(data);}
        else this.error.set('No se pudo obtener la vista completa de este módulo. Actualiza la consulta.');
        this.loading.set(false);
      },
      error:e=>{this.error.set(mensajeError(e,'No se pudo leer el histórico de este módulo. Intenta de nuevo.'));this.loading.set(false);},
    });
  }
}
