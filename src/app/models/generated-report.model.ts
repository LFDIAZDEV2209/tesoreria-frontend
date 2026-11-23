import { ReportConfig } from './report-config.model';

/**
 * GeneratedReportDTO
 * Respuesta del backend cuando genera un reporte
 */
export interface GeneratedReportDTO {
  filename?: string; // nombre del archivo si se generó
  mimeType?: string; // tipo MIME (text/csv, application/vnd.ms-excel, etc)
  config?: ReportConfig; // configuración utilizada
  executionTime?: number; // tiempo de ejecución en ms
  totalRows?: number; // cantidad total de filas de datos
  headers: string[]; // cabeceras de la tabla
  data: any[][]; // matriz de datos [fila][columna]
}
