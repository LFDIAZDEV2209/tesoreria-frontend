/**
 * Plantilla del Excel maestro: es el formato oficial del contrato con los datos
 * vacíos (conserva hojas, encabezados, fórmulas y estilos originales).
 * El archivo vive en assets y se descarga tal cual desde el paso 1.
 */

/** Hojas incluidas en la plantilla (chips del paso 1 del asistente). */
export const HOJAS_PLANTILLA: { nombre: string; detalle: string; icono: string; color: string }[] = [
  {
    nombre: 'Presupuesto 2026',
    detalle: 'Contrato, nómina, impuestos y estampillas por mes',
    icono: 'calendar',
    color: '#045C94',
  },
  {
    nombre: 'Proveedor · Anticipos',
    detalle: 'Hojas SIIGO 2205 y 1330 con el movimiento por tercero',
    icono: 'layers',
    color: '#0F766E',
  },
  {
    nombre: 'Cuentas por pagar · cobrar',
    detalle: 'Hojas SIIGO 2335 y 1380 con el movimiento por tercero',
    icono: 'credit-card',
    color: '#C2410C',
  },
  {
    nombre: 'Tabla categorias',
    detalle: 'Nombre de cada tercero con su categoría del gasto',
    icono: 'users',
    color: '#7C3AED',
  },
];

/** Ruta del archivo de plantilla (formato oficial, sin datos). */
export const PLANTILLA_MAESTRO_URL = 'assets/templates/Plantilla_Excel_Maestro.xlsx';

/** Nombre con el que se guarda la plantilla descargada. */
export const PLANTILLA_MAESTRO_NOMBRE = 'Plantilla_Excel_Maestro.xlsx';
