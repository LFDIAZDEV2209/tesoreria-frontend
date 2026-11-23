/**
 * ReportFilter
 * Define un filtro para la configuración de reporte
 */
export interface ReportFilter {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'CONTAINS' | 'IN';
  value: any;
}

/**
 * PivotValueDescriptor
 * Define un valor agregado en la tabla pivote
 */
export interface PivotValueDescriptor {
  field: string;
  function: 'COUNT' | 'SUM' | 'AVERAGE' | 'MIN' | 'MAX';
  label?: string;
}

/**
 * ReportConfig
 * Configuración completa para generar un reporte pivote
 */
export interface ReportConfig {
  section: string; // 'empleados', 'estructura', 'kpis'
  rows?: string[]; // campos para filas
  columns?: string[]; // campos para columnas
  values?: PivotValueDescriptor[]; // valores agregados
  filters?: ReportFilter[]; // filtros opcionales
  orderBy?: string[]; // orden de columnas
  limit?: number; // límite de filas
}
