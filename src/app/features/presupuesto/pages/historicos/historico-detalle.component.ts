import { Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { HistoricosService } from '../../services/historicos.service';
import { Historico, HistoricoConsulta, periodoHistorico, SECCIONES_HISTORICO } from '../../models/historico.model';
import { PageResponse } from '../../models/presupuesto.model';
import { HistoricoPresupuestoComponent } from './historico-presupuesto.component';
import { errorHistorico } from './historicos-page.component';
import { GpPeriodoHistoricoComponent } from '../../components/gp-periodo-historico/gp-periodo-historico.component';

@Component({selector: 'app-historico-detalle', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SelectBuscableDirective, HistoricoPresupuestoComponent, GpPeriodoHistoricoComponent],
  templateUrl: './historico-detalle.component.html', styleUrl: './historicos.scss'})
export class HistoricoDetalleComponent implements OnDestroy {
  readonly ctx = inject(PresupuestoContextService); private readonly api = inject(HistoricosService); private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap);
  readonly datos = signal<HistoricoConsulta | null>(null); readonly registros = signal<PageResponse<Record<string, unknown>> | null>(null);
  readonly columnas = computed(() => [...new Set((this.registros()?.content ?? []).flatMap(r => Object.keys(r)))].filter(k => k !== 'empresa_id'));
  readonly cargando = signal(false); readonly cargandoRegistros = signal(false); readonly error = signal('');
  readonly etiqueta = periodoHistorico; readonly secciones = SECCIONES_HISTORICO;
  readonly meses = signal<Historico[]>([]);
  readonly anterior = computed(() => {
    const actual = this.datos()?.historico.periodo;
    return [...this.meses()].filter(h => actual && h.periodo < actual).sort((a,b) => b.periodo.localeCompare(a.periodo))[0];
  });
  readonly siguiente = computed(() => {
    const actual = this.datos()?.historico.periodo;
    return [...this.meses()].filter(h => actual && h.periodo > actual).sort((a,b) => a.periodo.localeCompare(b.periodo))[0];
  });
  pestana = 'presupuesto'; seccion = 'movimientos'; busqueda = ''; pagina = 0;
  readonly modulos = [
    {id:'proveedores',nombre:'Proveedores'}, {id:'cuentas-pagar',nombre:'Cuentas por Pagar'},
    {id:'impuestos',nombre:'Impuestos, Estampillas y Seguros'}, {id:'cuentas-cobrar',nombre:'Cuentas por Cobrar'},
    {id:'anticipos',nombre:'Anticipos'}, {id:'otros-pagos',nombre:'Provisiones'},
    {id:'pagos-proyectados',nombre:'Proyección de Egresos'},
  ];
  private carga = 0; private cargaRegistros = 0;
  constructor() { effect(() => { const empresa = this.ctx.empresaId(), id = Number(this.params()?.get('id')); untracked(() => void this.cargar(empresa, id)); }); }
  ngOnDestroy() { this.carga++; this.cargaRegistros++; }
  async cargar(empresa: number | null, id: number) {
    const carga = ++this.carga; ++this.cargaRegistros;
    this.datos.set(null); this.registros.set(null); this.error.set(''); this.pestana = 'presupuesto'; this.pagina = 0;
    this.meses.set([]);
    this.cargando.set(!!empresa); this.cargandoRegistros.set(false);
    if (!empresa) return;
    if (!Number.isSafeInteger(id) || id <= 0) { this.error.set('Histórico inválido.'); this.cargando.set(false); return; }
    try {
      const d = await firstValueFrom(this.api.consultar(empresa,id));
      if(carga !== this.carga) return;
      this.datos.set(d);
      const primera = await firstValueFrom(this.api.listar(empresa,0,200));
      const meses = [...primera.content];
      // Paginas siguientes en tandas de 4 (paralelas, orden preservado).
      const paginasRestantes = Array.from({ length: Math.max(0, primera.totalPages - 1) }, (_, i) => i + 1);
      for(let i=0;i<paginasRestantes.length;i+=4) {
        const tanda = paginasRestantes.slice(i,i+4);
        const lotes = await Promise.all(tanda.map((page) => firstValueFrom(this.api.listar(empresa,page,200))));
        if(carga !== this.carga) return;
        for(const lote of lotes) meses.push(...lote.content);
      }
      if(carga === this.carga) this.meses.set(meses);
    }
    catch(e) { if(carga === this.carga) this.error.set(errorHistorico(e)); }
    finally { if(carga === this.carga) this.cargando.set(false); }
  }
  async cargarRegistros(reset = false) {
    if(reset) this.pagina = 0;
    const h = this.datos()?.historico, carga = ++this.cargaRegistros;
    this.registros.set(null); this.error.set(''); if(!h) return;
    this.cargandoRegistros.set(true);
    try { const r = await firstValueFrom(this.api.registros(h.empresaId,h.id,this.seccion,this.busqueda,this.pagina)); if(carga === this.cargaRegistros) this.registros.set(r); }
    catch(e) { if(carga === this.cargaRegistros) this.error.set(errorHistorico(e)); }
    finally { if(carga === this.cargaRegistros) this.cargandoRegistros.set(false); }
  }
  verRegistros() { this.pestana = 'registros'; void this.cargarRegistros(true); }
  cambiarPagina(delta: number) { this.pagina += delta; void this.cargarRegistros(); }
  campo(s: string) { return s.replace(/_/g, ' '); }
  texto(v: unknown) { return v === null || v === undefined ? '—' : typeof v === 'number' ? new Intl.NumberFormat('es-CO',{maximumFractionDigits:2}).format(v) : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v); }
}
