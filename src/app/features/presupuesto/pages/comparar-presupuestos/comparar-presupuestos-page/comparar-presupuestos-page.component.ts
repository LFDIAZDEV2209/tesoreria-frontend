import { Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { PresupuestoContextService } from '../../../services/presupuesto-context.service';
import { GpPeriodoService } from '../../../services/gp-periodo.service';
import { HistoricoConsulta, periodoHistorico } from '../../../models/historico.model';
import { HistoricoPresupuestoComponent } from '../../historicos/historico-presupuesto.component';
import { GpEmptyStateComponent } from '../../../components/gp-empty-state/gp-empty-state.component';
import { HistoricosTabsComponent } from '../../../components/historicos-tabs/historicos-tabs.component';
import { AlinearModulosDirective } from './alinear-modulos.directive';

interface Panel {periodo:string;foto:HistoricoConsulta|null;loading:boolean;error:string;}
const esPeriodo=(p:string|null|undefined):p is string=>!!p&&/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(p)&&Number(p.slice(0,4))>=1900;
export function mesAnterior(periodo:string):string {
  const [anio,mes]=periodo.split('-').map(Number);
  return (mes===1?anio-1:anio)+'-'+String(mes===1?12:mes-1).padStart(2,'0');
}
@Component({selector:'app-comparar-presupuestos-page',standalone:true,
  imports:[CommonModule,FormsModule,RouterLink,HistoricoPresupuestoComponent,GpEmptyStateComponent,AlinearModulosDirective,HistoricosTabsComponent],
  templateUrl:'./comparar-presupuestos-page.component.html',styleUrl:'./comparar-presupuestos-page.component.scss'})
export class CompararPresupuestosPageComponent implements OnDestroy {
  readonly ctx=inject(PresupuestoContextService);readonly periodos=inject(GpPeriodoService);
  private readonly http=inject(HttpClient);private readonly router=inject(Router);private readonly route=inject(ActivatedRoute);
  private readonly params=toSignal(this.route.queryParamMap);private solicitud=0;
  readonly etiqueta=periodoHistorico;
  readonly origen=computed(()=>{const p=this.params()?.get('origen');return esPeriodo(p)?p:this.ctx.periodo();});
  readonly destino=computed(()=>{const p=this.params()?.get('destino');return esPeriodo(p)?p:mesAnterior(this.origen());});
  readonly paneles=signal<Panel[]>([]);
  constructor(){
    effect(()=>{const empresa=this.ctx.empresaId(),origen=this.origen(),destino=this.destino(),historicos=this.periodos.historicos(),loading=this.periodos.loading(),error=this.periodos.error();
      untracked(()=>void this.cargar(empresa,origen,destino,historicos,loading,error));},{allowSignalWrites:true});
  }
  ngOnDestroy(){this.solicitud++;}
  cambiar(lado:'origen'|'destino',periodo:string){
    if(!esPeriodo(periodo))return;
    void this.router.navigate([],{relativeTo:this.route,queryParams:{origen:this.origen(),destino:this.destino(),[lado]:periodo},queryParamsHandling:'merge'});
  }
  intercambiar(){void this.router.navigate([],{relativeTo:this.route,queryParams:{origen:this.destino(),destino:this.origen()},queryParamsHandling:'merge'});}
  private async cargar(empresa:number|null,origen:string,destino:string,historicos:Record<string,number>,catalogoLoading:boolean,catalogoError:string){
    const id=++this.solicitud,meses=[origen,destino];
    const inicial=meses.map(periodo=>({periodo,foto:null,loading:catalogoLoading||!!historicos[periodo],error:catalogoError?'No pudimos verificar los históricos de esta empresa. Actualiza la consulta.':''}));
    this.paneles.set(inicial);if(!empresa || catalogoLoading || catalogoError)return;
    const resultados=await Promise.all(meses.map(async (periodo:string)=>{
      const panel:Panel={periodo,foto:null,loading:false,error:''};
      try{
        if(historicos[periodo]){
          const foto=await firstValueFrom(this.http.get<HistoricoConsulta>(environment.gpApiUrl+'/periodos/'+periodo+'/historico/presupuesto',{params:{empresaId:empresa}}));
          if(foto.historico.periodo!==periodo || foto.historico.empresaId!==empresa)throw new Error('Período o empresa distintos.');
          panel.foto=foto;
        }
      }catch{panel.error='No pudimos consultar este presupuesto. Actualiza la consulta para volver a intentarlo.';}
      return panel;
    }));
    if(id===this.solicitud)this.paneles.set(resultados);
  }
}
