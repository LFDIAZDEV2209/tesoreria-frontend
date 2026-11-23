import { Component, Input, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ModuloPageComponent } from '../../pages/modulo-page/modulo-page.component';
import { PagosProyectadosPageComponent } from '../../pages/pagos-proyectados/pagos-proyectados-page.component';
import { contextoHistorico } from '../../pages/historicos/historico-presupuesto.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { HistoricoModuloFuenteService, HistoricoModuloVista } from '../../services/historico-modulo-fuente.service';

@Component({
  selector: 'app-gp-modulo-historico',
  standalone: true,
  imports: [ModuloPageComponent,PagosProyectadosPageComponent],
  providers:[HistoricoModuloFuenteService,
    {provide:PresupuestoService,useFactory:()=>inject(HistoricoModuloFuenteService).api},
    {provide:PresupuestoContextService,useFactory:contextoHistorico},
    {provide:ActivatedRoute,useFactory:()=>{
      const fuente=inject(HistoricoModuloFuenteService);
      return {snapshot:{data:{modulo:fuente.codigo,origen:fuente.modulo==='otros-pagos'?'manual':'aprobado'}}};
    }}],
  templateUrl: './gp-modulo-historico.component.html',
  styleUrl: './gp-modulo-historico.component.scss'
})
export class GpModuloHistoricoComponent {
  private readonly fuente=inject(HistoricoModuloFuenteService);
  private readonly ctx=inject(PresupuestoContextService);
  @Input({required:true}) modulo='proveedores';
  consultas:HistoricoModuloVista[]=[];
  @Input({required:true}) set datos(value:HistoricoModuloVista){
    this.fuente.datos=value;this.fuente.modulo=this.modulo;
    this.ctx.empresaId.set(null);this.ctx.empresas.set([value.presentacion.empresa]);
    this.ctx.periodo.set(value.historico.periodo);this.ctx.empresaId.set(value.historico.empresaId);
    this.consultas=[value];
  }
}
