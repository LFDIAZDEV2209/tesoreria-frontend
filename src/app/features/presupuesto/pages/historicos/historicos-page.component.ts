import { Component, inject } from '@angular/core';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PeriodosPageComponent } from '../periodos/periodos-page.component';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { mensajeError } from '../../services/gp-errores';

@Component({selector:'app-historicos-page',standalone:true,imports:[PeriodosPageComponent,GpIconComponent],
  templateUrl:'./historicos-page.component.html',styleUrl:'./historicos.scss'})
export class HistoricosPageComponent {
  readonly ctx = inject(PresupuestoContextService);
}
export function errorHistorico(e: any): string { return mensajeError(e, 'No se pudo consultar el período. Intenta de nuevo.'); }
