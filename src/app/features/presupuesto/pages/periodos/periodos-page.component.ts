import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GpPeriodoService } from '../../services/gp-periodo.service';
import { PeriodosService } from '../../services/periodos.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { mesBogota, periodoHistorico } from '../../models/historico.model';
import { mensajeError } from '../../services/gp-errores';
import { GpIconComponent } from '../../components/gp-icon/gp-icon.component';
import { GpModalComponent } from '../../components/gp-modal/gp-modal.component';

@Component({selector:'app-periodos-page',standalone:true,imports:[CommonModule,FormsModule,GpIconComponent,GpModalComponent],
  templateUrl:'./periodos-page.component.html',styleUrls:['./periodos-page.component.scss']})
export class PeriodosPageComponent {
  readonly periodos = inject(GpPeriodoService);
  readonly ctx = inject(PresupuestoContextService);
  private readonly api = inject(PeriodosService);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly exito = signal('');
  readonly etiqueta = periodoHistorico;
  readonly modalCrear = signal<'anio'|'mes'|null>(null);
  readonly nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  readonly anios = computed(() => [...new Set([...this.periodos.anios().map(a => a.anio), ...this.ctx.estadosMes().map(m => Number(m.periodo.slice(0,4)))])].sort((a,b) => b-a));
  nuevoAnio = Number(mesBogota().slice(0,4))+1;
  nuevoMes = mesBogota();

  mesesDelAnio(anio:number) {
    const meses = this.nombresMeses.map((nombre,index) => {
      const periodo = anio + '-' + String(index+1).padStart(2,'0');
      const estado = this.ctx.estadosMes().find(m => m.periodo === periodo);
      return {nombre,periodo,creado:!!estado,aprobado:!!estado?.aprobado,activo:periodo===this.ctx.mesActivo()};
    });
    const existentes = meses.filter(m => m.creado);
    return existentes.length ? existentes : meses;
  }
  abrirMes(mes:{periodo:string;creado:boolean}) {
    this.error.set('');
    if(!this.ctx.empresaId()) { this.error.set('Selecciona una empresa para habilitar el mes.'); return; }
    if(!this.periodos.puedeCrear()) { this.error.set('Tu perfil no tiene permiso para habilitar meses.'); return; }
    this.nuevoMes=mes.periodo; this.modalCrear.set('mes');
  }
  actualizar() { this.periodos.recargar(true); }
  abrirCrear() {
    const activo = this.ctx.mesActivo();
    if(activo) {
      const [anio,mes] = activo.split('-').map(Number);
      this.nuevoMes = mes===12 ? (anio+1)+'-01' : anio+'-'+String(mes+1).padStart(2,'0');
    }
    this.modalCrear.set('mes'); this.error.set('');
  }
  readonly mesParaQuitar = signal<string|null>(null);
  readonly datosParaQuitar = signal<{tipo:string;registros:number}[]|null>(null);
  private empresaParaQuitar:number|null=null;
  async revisarQuitarMes(periodo:string) {
    const empresa=this.ctx.empresaId();
    if(!empresa || !this.periodos.puedeCrear() || this.saving())return;
    this.empresaParaQuitar=empresa;this.mesParaQuitar.set(periodo);this.datosParaQuitar.set(null);this.error.set('');this.saving.set(true);
    try {
      const contenido=await firstValueFrom(this.api.contenidoMes(periodo,empresa));
      if(empresa===this.ctx.empresaId() && periodo===this.mesParaQuitar())this.datosParaQuitar.set(contenido.datos);
    }catch(e){this.error.set(mensajeError(e,'No se pudieron consultar los datos del mes.'));}
    finally{this.saving.set(false);}
  }
  async quitarMes() {
    const empresa=this.ctx.empresaId(),periodo=this.mesParaQuitar(),datos=this.datosParaQuitar();
    if(!empresa || empresa!==this.empresaParaQuitar || !periodo || !datos || datos.length || this.saving() || !this.periodos.puedeCrear())return;
    this.saving.set(true);this.error.set('');
    try {
      await firstValueFrom(this.api.eliminarMes(periodo,empresa));
      if(empresa!==this.ctx.empresaId())return;
      this.ctx.estadosMes.update(meses=>meses.filter(m=>m.periodo!==periodo));
      if(this.ctx.mesActivo()===periodo)this.ctx.mesActivo.set(null);
      this.mesParaQuitar.set(null);this.exito.set(this.etiqueta(periodo)+' quitado.');this.periodos.recargar(true);
    }catch(e){this.error.set(mensajeError(e,'No se pudo quitar el mes.'));}
    finally{this.saving.set(false);}
  }
  async crear(tipo:'anio'|'mes') {
    const empresa = this.ctx.empresaId();
    if(this.saving()) return;
    if(!this.periodos.puedeCrear()) { this.error.set('Tu perfil no tiene permiso para habilitar meses.'); return; }
    if(tipo==='mes' && !empresa) { this.error.set('Selecciona una empresa para habilitar el mes.'); return; }
    this.saving.set(true); this.error.set(''); this.exito.set('');
    try {
      await firstValueFrom(tipo==='anio' ? this.api.crearAnio(this.nuevoAnio,false) : this.api.crearMes(this.nuevoMes,empresa!));
      if(empresa!==this.ctx.empresaId()) return;
      this.modalCrear.set(null);
      this.exito.set(tipo==='mes' ? this.etiqueta(this.nuevoMes)+' creado. Este es el mes habilitado para modificar.' : 'Año creado. Crea el mes que vas a habilitar.');
      this.periodos.recargar(true);
    } catch(e) { if(empresa===this.ctx.empresaId()) this.error.set(mensajeError(e,'No se pudo crear el período.')); }
    finally { this.saving.set(false); }
  }
}
