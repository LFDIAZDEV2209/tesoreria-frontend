export const SECCIONES_EGRESOS = [
  { id: 'nomina', label: 'Nómina' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'cx_pagar', label: 'Cuentas por pagar' },
  { id: 'impuestos', label: 'Impuestos, estampillas y seguros' },
  { id: 'provisiones', label: 'Provisiones' },
  { id: 'cx_cobrar', label: 'Cuentas por cobrar' },
  { id: 'anticipos', label: 'Anticipos' },
  { id: 'otros', label: 'Sin sección asignada' },
] as const;

export type SeccionEgreso = typeof SECCIONES_EGRESOS[number]['id'] | 'todos';
export type VistaEgreso = 'programados' | 'sugeridos' | 'agendar' | 'presupuesto';
export interface FiltrosSeccion {
  busqueda: string; categoria: string; estado: string; desde: string; hasta: string; size: number;
}
export const FILTROS_SECCION: FiltrosSeccion = { busqueda: '', categoria: '', estado: '', desde: '', hasta: '', size: 10 };

export function seccionDeModulo(modulo: string | null | undefined): SeccionEgreso {
  if (!modulo || modulo === 'manual' || modulo === 'importado') return 'provisiones';
  return SECCIONES_EGRESOS.some(s => s.id === modulo) ? modulo as SeccionEgreso : 'otros';
}

export function normalizarBusqueda(valor: unknown): string {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

export function coincideBusqueda(busqueda: string, ...campos: unknown[]): boolean {
  const texto = normalizarBusqueda(campos.filter(c => c != null).join(' '));
  return normalizarBusqueda(busqueda).split(/\s+/).every(palabra => texto.includes(palabra));
}

export function paginar<T>(filas: T[], pagina: number, size: number) {
  const paginas = Math.max(1, Math.ceil(filas.length / size));
  const actual = Math.max(1, Math.min(pagina, paginas));
  const inicio = (actual - 1) * size;
  return { filas: filas.slice(inicio, inicio + size), pagina: actual, paginas, total: filas.length,
    desde: filas.length ? inicio + 1 : 0, hasta: Math.min(inicio + size, filas.length) };
}
