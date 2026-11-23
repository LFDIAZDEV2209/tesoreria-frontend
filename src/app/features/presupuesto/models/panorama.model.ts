import { ResumenGerencial } from './presupuesto.model';
export interface MesPanorama {
  periodo: string; creado: boolean;
  estado: 'NO_CREADO' | 'VACIO' | 'CARGADO' | 'CERRADO' | 'PARCIALMENTE_CERRADO';
  empresasConDatos: number; empresasCerradas: number;
}
export interface AnioPanorama { anio: number; meses: MesPanorama[]; }
export interface FilaPanorama extends ResumenGerencial {
  tieneDatos: boolean; cerrado: boolean; historicoId: number | null;
  fuente: 'NEXA' | 'EXCEL' | 'HISTORICO'; archivo: string | null; cargadoEn: string | null;
}
export interface VistaPanorama { periodo: string; filas: FilaPanorama[]; }
export interface EntradaPanorama {
  empresaId: number | null; empresa: string; contador: string | null;
  aprobado: number; pendiente: number | null; pagado: number; liquidez: number | null;
}
export type MetricaPanorama = 'aprobado' | 'pendiente' | 'pagado' | 'liquidez';
export interface VariacionPanorama { origen: number | null; destino: number | null; diferencia: number | null; porcentaje: number | null; }
export interface CambioPanorama {
  empresaId: number; nombreEmpresa: string; responsable: string | null;
  datosOrigen: boolean; datosDestino: boolean; fuenteOrigen: string; fuenteDestino: string;
  valores: Record<MetricaPanorama, VariacionPanorama>;
}
export interface ComparacionPanorama { origen: string; destino: string; filas: CambioPanorama[]; totales: Record<MetricaPanorama, VariacionPanorama>; }
