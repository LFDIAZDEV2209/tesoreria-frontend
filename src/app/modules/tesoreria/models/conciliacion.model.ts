import { MovimientoBancario } from './movimiento-bancario.model';

export type EstadoConciliacionDetalle = 'COMPLETO' | 'REVISION';
export type TipoCoincidencia = 'OC' | 'Solicitud' | 'Egreso';

export interface CoincidenciaConciliacion {
  tipo: TipoCoincidencia;
  codigo: string;
  fecha: string;
  valor: number;
  score: number;
}

export interface ConciliacionDetalle {
  movimiento: MovimientoBancario;
  estado: EstadoConciliacionDetalle;
  coincidencias: CoincidenciaConciliacion[];
  ocVinculada?: string;
  egresoGenerado?: string;
  conciliadoManual?: boolean;
}

export interface VincularOcRequest {
  movimientoId: number;
  ocCodigo: string;
}

export interface ConciliacionResultado {
  ok: boolean;
  mensaje: string;
}
