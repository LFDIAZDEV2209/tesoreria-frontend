import { Empresa, PageResponse } from './presupuesto.model';

export interface Historico {
  id: number; empresaId: number; empresaNombre: string; periodo: string;
  generadoEn: string; usuarioId: number; usuarioNombre: string; versionFormato: number; sha256: string;
}
/** La vista guarda el contrato HTTP original del Gestor, con sus cálculos congelados. */
export interface HistoricoConsulta {
  historico: Historico;
  vista: { empresa: Empresa; contrato: Record<string, unknown>; mensual: Record<string, unknown>;
    consolidado: Record<string, any>[]; detalle: Record<string, any>[];
    resumenProvisiones: Record<string, unknown>; categorias: string[] };
  secciones: Record<string, number>;
}
export interface HistoricoReferencia { id: string; periodo: string; generadoEn: string; }
export interface HistoricoCambio { campo: string; origen: unknown; destino: unknown; variacion: number | null; porcentaje: number | null; }
export interface HistoricoFila {
  clave: string; seccion: string; concepto: string; estado: 'IGUAL' | 'MODIFICADO' | 'NUEVO' | 'ELIMINADO';
  unidad: string; origen: number | null; destino: number | null; variacion: number | null; porcentaje: number | null; cambios: HistoricoCambio[];
}
export interface HistoricoComparacion {
  origen: HistoricoReferencia; destino: HistoricoReferencia;
  conteos: Record<string, number>; secciones: string[]; filas: PageResponse<HistoricoFila>;
}
export const SECCIONES_HISTORICO: Record<string, string> = {
  resumen: 'Resumen mensual', contrato: 'Contrato', periodos: 'Meses: facturación, flujo y nómina',
  terceros: 'Terceros y sugeridos', movimientos: 'Movimientos de los módulos', pagos: 'Proyecciones y provisiones',
  categorias_presupuesto: 'Consolidado por categoría', importaciones: 'Importaciones', distribucion: 'Distribución aprobada',
  catalogo_categorias: 'Catálogo de categorías', empresa: 'Gestor presupuestal',
  panorama: 'Excel resumen por mes',
};
export function periodoHistorico(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  if (!anio || !mes) return periodo;
  const texto = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, 1)));
  return texto[0].toUpperCase() + texto.slice(1);
}
export function mesBogota(): string {
  const parts = new Intl.DateTimeFormat('en', {timeZone:'America/Bogota', year:'numeric', month:'2-digit'}).formatToParts(new Date());
  return parts.find(p => p.type === 'year')!.value + '-' + parts.find(p => p.type === 'month')!.value;
}
