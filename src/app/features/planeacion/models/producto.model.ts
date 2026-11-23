// ═══════════════════════════════════════════════════════════════
// Producto Model — Planeación Module
// ═══════════════════════════════════════════════════════════════

// 1️⃣ Identificación del Producto
export interface ProductoIdentificacion {
  codigo: string;
  nombre: string;
  descripcionCorta: string;
  categoria: CategoriaProducto;
  estado: 'ACTIVO' | 'INACTIVO';
}

export type CategoriaProducto =
  | 'ALIMENTOS_PREPARADOS'
  | 'BEBIDAS'
  | 'REFRIGERIOS'
  | 'COMBOS'
  | 'INSUMOS'
  | 'MATERIAS_PRIMAS'
  | 'OTRO';

export const CATEGORIAS_PRODUCTO: { value: CategoriaProducto; label: string; icon: string }[] = [
  { value: 'ALIMENTOS_PREPARADOS', label: 'Alimentos Preparados', icon: '🍽️' },
  { value: 'BEBIDAS', label: 'Bebidas', icon: '🥤' },
  { value: 'REFRIGERIOS', label: 'Refrigerios', icon: '🥪' },
  { value: 'COMBOS', label: 'Combos', icon: '🍱' },
  { value: 'INSUMOS', label: 'Insumos', icon: '📦' },
  { value: 'MATERIAS_PRIMAS', label: 'Materias Primas', icon: '🌾' },
  { value: 'OTRO', label: 'Otro', icon: '📋' },
];

// 2️⃣ Costos
export interface ProductoCostos {
  costoUnitario: number;
  tipoCosto: 'ESTANDAR' | 'REFERENCIAL';
  fechaActualizacionCosto?: string; // ISO date
}

// 3️⃣ Precios
export interface ProductoPrecios {
  precioVenta: number;
  margenPorcentaje?: number;
  impuestosIncluidos: boolean;
  tipoImpuesto?: TipoImpuesto;
  moneda: Moneda;
}

export type TipoImpuesto = 'IVA_19' | 'IVA_5' | 'IVA_0' | 'EXENTO' | 'EXCLUIDO';
export type Moneda = 'COP' | 'USD' | 'EUR';

export const TIPOS_IMPUESTO: { value: TipoImpuesto; label: string }[] = [
  { value: 'IVA_19', label: 'IVA 19%' },
  { value: 'IVA_5', label: 'IVA 5%' },
  { value: 'IVA_0', label: 'IVA 0%' },
  { value: 'EXENTO', label: 'Exento' },
  { value: 'EXCLUIDO', label: 'Excluido' },
];

export const MONEDAS: { value: Moneda; label: string; symbol: string }[] = [
  { value: 'COP', label: 'Peso Colombiano', symbol: '$' },
  { value: 'USD', label: 'Dólar Americano', symbol: 'US$' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
];

// 4️⃣ Especificaciones del Producto
export interface ProductoEspecificaciones {
  tipoProducto: TipoProducto;
  tamanoPresentacion: string;
  gramajePesoNeto?: number;
  unidadMedida: UnidadMedida;
  porciones?: number;
  calorias?: number;
  informacionNutricional?: string;
  alergenos: string[];
  restricciones: RestriccionAlimentaria[];
  vidaUtil?: string;
}

export type TipoProducto = 'PLATO' | 'BEBIDA' | 'REFRIGERIO' | 'COMBO';
export type UnidadMedida = 'g' | 'kg' | 'ml' | 'L' | 'unidad';

export const TIPOS_PRODUCTO: { value: TipoProducto; label: string; icon: string }[] = [
  { value: 'PLATO', label: 'Plato', icon: '🍽️' },
  { value: 'BEBIDA', label: 'Bebida', icon: '🥤' },
  { value: 'REFRIGERIO', label: 'Refrigerio', icon: '🥪' },
  { value: 'COMBO', label: 'Combo', icon: '🍱' },
];

export const UNIDADES_MEDIDA: { value: UnidadMedida; label: string }[] = [
  { value: 'g', label: 'Gramos (g)' },
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'L', label: 'Litros (L)' },
  { value: 'unidad', label: 'Unidad' },
];

export type RestriccionAlimentaria = 'VEGETARIANO' | 'VEGANO' | 'SIN_GLUTEN' | 'BAJO_SODIO';

export const RESTRICCIONES: { value: RestriccionAlimentaria; label: string; color: string }[] = [
  { value: 'VEGETARIANO', label: 'Vegetariano', color: '#22c55e' },
  { value: 'VEGANO', label: 'Vegano', color: '#16a34a' },
  { value: 'SIN_GLUTEN', label: 'Sin Gluten', color: '#f59e0b' },
  { value: 'BAJO_SODIO', label: 'Bajo Sodio', color: '#3b82f6' },
];

export const ALERGENOS_COMUNES: string[] = [
  'Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes',
  'Soja', 'Lácteos', 'Frutos secos', 'Apio', 'Mostaza',
  'Sésamo', 'Sulfitos', 'Moluscos', 'Altramuces',
];

// 5️⃣ Operación / Servicio
export interface ProductoOperacion {
  modalidad: ModalidadServicio[];
  requierePreparacion: boolean;
  tiempoEstimadoPreparacion?: number; // minutos
  requiereCadenaFria: boolean;
}

export type ModalidadServicio = 'PARA_LLEVAR' | 'CONSUMO_EN_SITIO' | 'CATERING';

export const MODALIDADES: { value: ModalidadServicio; label: string; icon: string }[] = [
  { value: 'PARA_LLEVAR', label: 'Para Llevar', icon: '🛍️' },
  { value: 'CONSUMO_EN_SITIO', label: 'Consumo en Sitio', icon: '🪑' },
  { value: 'CATERING', label: 'Catering', icon: '🚚' },
];

// 6️⃣ Campos Opcionales
export interface ProductoOpcional {
  imagenUrl?: string;
  imagenFile?: File;
  recetaAsociada?: string;
  ingredientesPrincipales: string[];
  observaciones?: string;
  etiquetas: string[];
}

export const ETIQUETAS_PREDEFINIDAS: string[] = [
  'Fit', 'Light', 'Premium', 'Económico', 'Gourmet',
  'Bajo en Calorías', 'Sin Azúcar', 'Orgánico', 'Artesanal', 'Tradicional',
];

// ═══════════════════════════════════════════════════════════════
// Producto completo
// ═══════════════════════════════════════════════════════════════
export interface Producto {
  id?: number;
  identificacion: ProductoIdentificacion;
  costos: ProductoCostos;
  precios: ProductoPrecios;
  especificaciones: ProductoEspecificaciones;
  operacion: ProductoOperacion;
  opcional: ProductoOpcional;
  fechaCreacion?: string;
  fechaActualizacion?: string;
  creadoPor?: string;
}

// ═══════════════════════════════════════════════════════════════
// Resultado de carga masiva
// ═══════════════════════════════════════════════════════════════
export interface BulkUploadResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: BulkUploadError[];
  productos: Producto[];
}

export interface BulkUploadError {
  row: number;
  field: string;
  message: string;
  value?: any;
}
