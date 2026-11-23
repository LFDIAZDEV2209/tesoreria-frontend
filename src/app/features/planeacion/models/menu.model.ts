// ═══════════════════════════════════════════════════════════════
// Menu Model — Planeación Module
// ═══════════════════════════════════════════════════════════════

export type TiempoComida = 'DESAYUNO' | 'MERIENDA' | 'ALMUERZO' | 'CENA';

export const TIEMPOS_COMIDA: { value: TiempoComida; label: string; icon: string; color: string }[] = [
  { value: 'DESAYUNO', label: 'Desayuno', icon: '🌅', color: '#FFB71B' },
  { value: 'MERIENDA', label: 'Merienda', icon: '🍪', color: '#f97316' },
  { value: 'ALMUERZO', label: 'Almuerzo', icon: '☀️', color: '#045C94' },
  { value: 'CENA', label: 'Cena', icon: '🌙', color: '#6B46C1' },
];

export interface CategoriaMenu {
  id: string;
  nombre: string;
  tiempoComida: TiempoComida;
  orden: number;
}

// Categorías por cada tiempo de comida (basado en la imagen del menú)
export const CATEGORIAS_DESAYUNO: CategoriaMenu[] = [
  { id: 'DES_PROTEINA', nombre: 'Proteína', tiempoComida: 'DESAYUNO', orden: 1 },
  { id: 'DES_ACOMP1', nombre: 'Acompañamiento 1', tiempoComida: 'DESAYUNO', orden: 2 },
  { id: 'DES_FRUTA', nombre: 'Fruta / Acomp. 2', tiempoComida: 'DESAYUNO', orden: 3 },
  { id: 'DES_BEBIDA', nombre: 'Bebida', tiempoComida: 'DESAYUNO', orden: 4 },
];

export const CATEGORIAS_MERIENDA: CategoriaMenu[] = [
  { id: 'MER_BEBIDA', nombre: 'Bebida', tiempoComida: 'MERIENDA', orden: 1 },
  { id: 'MER_ACOMP1', nombre: 'Acompañamiento 1', tiempoComida: 'MERIENDA', orden: 2 },
];

export const CATEGORIAS_ALMUERZO: CategoriaMenu[] = [
  { id: 'ALM_PROTEINA', nombre: 'Proteína', tiempoComida: 'ALMUERZO', orden: 1 },
  { id: 'ALM_ARROZ', nombre: 'Arroz', tiempoComida: 'ALMUERZO', orden: 2 },
  { id: 'ALM_ACOMP1', nombre: 'Acompañamiento 1', tiempoComida: 'ALMUERZO', orden: 3 },
  { id: 'ALM_ACOMP2', nombre: 'Acompañamiento 2', tiempoComida: 'ALMUERZO', orden: 4 },
  { id: 'ALM_ACOMP3', nombre: 'Acompañamiento 3', tiempoComida: 'ALMUERZO', orden: 5 },
  { id: 'ALM_JUGO', nombre: 'Jugo', tiempoComida: 'ALMUERZO', orden: 6 },
];

export const CATEGORIAS_CENA: CategoriaMenu[] = [
  { id: 'CEN_PROTEINA', nombre: 'Proteína', tiempoComida: 'CENA', orden: 1 },
  { id: 'CEN_ACOMP1', nombre: 'Acompañamiento 1', tiempoComida: 'CENA', orden: 2 },
  { id: 'CEN_ACOMP2', nombre: 'Acompañamiento 2', tiempoComida: 'CENA', orden: 3 },
  { id: 'CEN_JUGO', nombre: 'Jugo', tiempoComida: 'CENA', orden: 4 },
];

export const TODAS_CATEGORIAS: CategoriaMenu[] = [
  ...CATEGORIAS_DESAYUNO,
  ...CATEGORIAS_MERIENDA,
  ...CATEGORIAS_ALMUERZO,
  ...CATEGORIAS_CENA,
];

// Celda del menú: una categoría + un número de menú => un producto
export interface MenuCelda {
  categoriaId: string;
  menuNumero: number; // 1-7
  productoNombre: string;
  productoId?: number;
}

// Estructura completa del menú
export interface MenuSemanal {
  id?: number;
  nombre: string;
  mes: string; // e.g. "Septiembre 2024"
  anio: number;
  mesNumero: number; // 1-12
  cantidadMenus: number; // how many columns (1-7)
  celdas: MenuCelda[];
  estado: 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
  fechaCreacion?: string;
  fechaActualizacion?: string;
  creadoPor?: string;
  costoEstimado?: number;
}

export const MESES: { value: number; label: string }[] = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];
