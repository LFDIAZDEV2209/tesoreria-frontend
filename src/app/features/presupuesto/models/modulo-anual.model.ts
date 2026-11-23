/** Contrato GP-008: importes contables por tercero y mes. */
export interface ImportesAnuales { debito: number; credito: number; saldo: number; }
export interface FilaModuloAnual {
  nit: string | null;
  nombre: string;
  categoria?: string | null;
  seccion?: string | null;
  valores: Record<string, ImportesAnuales>;
  totalAnio: ImportesAnuales;
}
export interface ModuloAnual {
  empresaId: number;
  anio: number | null;
  anios?: number[];
  meses: string[];
  filas: FilaModuloAnual[];
  totalesMes: Record<string, ImportesAnuales>;
  totalGeneral: ImportesAnuales;
}
