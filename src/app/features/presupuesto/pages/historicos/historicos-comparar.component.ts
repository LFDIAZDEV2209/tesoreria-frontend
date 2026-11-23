import { Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { HistoricosService } from '../../services/historicos.service';
import { Historico, HistoricoComparacion, HistoricoReferencia, mesBogota, periodoHistorico, SECCIONES_HISTORICO } from '../../models/historico.model';
import { errorHistorico } from './historicos-page.component';

@Component({selector: 'app-historicos-comparar', standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SelectBuscableDirective],
  templateUrl: './historicos-comparar.component.html', styleUrl: './historicos.scss'})
export class HistoricosCompararComponent implements OnDestroy {
  readonly ctx = inject(PresupuestoContextService); private readonly api = inject(HistoricosService); private readonly route = inject(ActivatedRoute);
  readonly periodos = signal<Historico[]>([]); readonly resultado = signal<HistoricoComparacion | null>(null);
  readonly cargando = signal(false); readonly cargandoPeriodos = signal(false); readonly error = signal('');
  readonly etiqueta = periodoHistorico; readonly actual = mesBogota(); readonly secciones = SECCIONES_HISTORICO;
  readonly estados = ['MODIFICADO', 'NUEVO', 'ELIMINADO', 'IGUAL'];
  readonly nombresEstado: Record<string, string> = {MODIFICADO: 'Modificados', NUEVO: 'Nuevos', ELIMINADO: 'Eliminados', IGUAL: 'Sin cambios'};
  origen = ''; destino = 'actual'; seccion = 'resumen'; estado = ''; busqueda = ''; pagina = 0;
  private solicitud = 0; private cargaPeriodos = 0;
  constructor() { effect(() => { this.ctx.empresaId(); untracked(() => void this.cargarPeriodos()); }); }
  ngOnDestroy() { this.solicitud++; this.cargaPeriodos++; }
  async cargarPeriodos() {
    const empresa = this.ctx.empresaId(), carga = ++this.cargaPeriodos; ++this.solicitud;
    this.periodos.set([]); this.resultado.set(null); this.error.set(''); this.cargando.set(false);
    this.cargandoPeriodos.set(empresa !== null); this.origen = ''; this.destino = 'actual'; this.pagina = 0;
    if (!empresa) return;
    try {
      let page = 0, total = 1; const rows: Historico[] = [];
      while (page < total) {
        const data = await firstValueFrom(this.api.listar(empresa, page++, 200));
        if (carga !== this.cargaPeriodos) return;
        total = data.totalPages; rows.push(...data.content);
      }
      this.periodos.set(rows);
      const seleccionado = this.route.snapshot.queryParamMap.get('origen');
      this.origen = rows.some(h => String(h.id) === seleccionado) ? seleccionado! : String(rows[0]?.id ?? '');
      if (this.origen) await this.comparar(true);
    } catch(e) { if (carga === this.cargaPeriodos) this.error.set(errorHistorico(e)); }
    finally { if (carga === this.cargaPeriodos) this.cargandoPeriodos.set(false); }
  }
  async comparar(reset = false) {
    if (reset) this.pagina = 0;
    const empresa = this.ctx.empresaId(), carga = ++this.solicitud;
    this.resultado.set(null); this.error.set(''); this.cargando.set(false);
    if (!empresa || !this.origen || !this.destino) return;
    if (this.origen === this.destino) { this.error.set('Selecciona dos períodos diferentes.'); return; }
    this.cargando.set(true);
    try {
      const data = await firstValueFrom(this.api.comparar(empresa, this.origen, this.destino, this.seccion, this.estado, this.busqueda, this.pagina));
      if (carga === this.solicitud) this.resultado.set(data);
    } catch(e) { if (carga === this.solicitud) this.error.set(errorHistorico(e)); }
    finally { if (carga === this.solicitud) this.cargando.set(false); }
  }
  intercambiar() { [this.origen, this.destino] = [this.destino, this.origen]; void this.comparar(true); }
  cambiarPagina(delta: number) { this.pagina += delta; void this.comparar(); }
  titulo(ref: HistoricoReferencia) { return this.etiqueta(ref.periodo) + (ref.id === 'actual' ? ' · Actual' : ' · Histórico'); }
  numero(valor: number | null, unidad = 'COP', signo = false): string {
    if (valor === null || valor === undefined) return '—';
    const formato = new Intl.NumberFormat('es-CO', unidad === 'COP' ? {style:'currency',currency:'COP',maximumFractionDigits:2} : {maximumFractionDigits:2});
    return (signo && valor > 0 ? '+' : '') + formato.format(valor);
  }
  porcentaje(valor: number | null) { return valor === null ? '—' : this.numero(valor, 'numero', true) + '%'; }
  texto(valor: unknown) { return valor === null || valor === undefined ? '—' : typeof valor === 'number' ? this.numero(valor, 'numero') : typeof valor === 'boolean' ? (valor ? 'Sí' : 'No') : String(valor); }
  campo(nombre: string) { return nombre.replace(/_/g, ' '); }
}
