import { Injectable } from '@angular/core';

export type UnitCategory = 'MASA' | 'VOLUMEN' | 'LONGITUD' | 'AREA' | 'UNIDAD';

export interface UnitDefinition {
  key: string;
  label: string;
  category: UnitCategory;
  factorToBase: number;
}

export interface ConversionResult {
  success: boolean;
  originalValue: number;
  originalUnit: string;
  convertedValue: number;
  targetUnit: string;
  factor: number;
  category: UnitCategory;
  error?: string;
}

const UNIT_CATALOG: UnitDefinition[] = [
  { key: 'kg', label: 'Kilogramo', category: 'MASA', factorToBase: 1000 },
  { key: 'g', label: 'Gramo', category: 'MASA', factorToBase: 1 },
  { key: 'mg', label: 'Miligramo', category: 'MASA', factorToBase: 0.001 },
  { key: 'ton', label: 'Tonelada', category: 'MASA', factorToBase: 1_000_000 },
  { key: 'lb', label: 'Libra', category: 'MASA', factorToBase: 453.592 },
  { key: 'oz', label: 'Onza', category: 'MASA', factorToBase: 28.3495 },
  { key: 'arroba', label: 'Arroba', category: 'MASA', factorToBase: 11_339.8 },

  { key: 'l', label: 'Litro', category: 'VOLUMEN', factorToBase: 1 },
  { key: 'ml', label: 'Mililitro', category: 'VOLUMEN', factorToBase: 0.001 },
  { key: 'gal', label: 'Galón', category: 'VOLUMEN', factorToBase: 3.78541 },
  { key: 'm3', label: 'Metro cúbico', category: 'VOLUMEN', factorToBase: 1000 },
  { key: 'cm3', label: 'Centímetro cúbico', category: 'VOLUMEN', factorToBase: 0.001 },
  { key: 'fl_oz', label: 'Onza líquida', category: 'VOLUMEN', factorToBase: 0.0295735 },

  { key: 'm', label: 'Metro', category: 'LONGITUD', factorToBase: 1 },
  { key: 'cm', label: 'Centímetro', category: 'LONGITUD', factorToBase: 0.01 },
  { key: 'mm', label: 'Milímetro', category: 'LONGITUD', factorToBase: 0.001 },
  { key: 'km', label: 'Kilómetro', category: 'LONGITUD', factorToBase: 1000 },
  { key: 'in', label: 'Pulgada', category: 'LONGITUD', factorToBase: 0.0254 },
  { key: 'ft', label: 'Pie', category: 'LONGITUD', factorToBase: 0.3048 },
  { key: 'yd', label: 'Yarda', category: 'LONGITUD', factorToBase: 0.9144 },

  { key: 'm2', label: 'Metro cuadrado', category: 'AREA', factorToBase: 1 },
  { key: 'ha', label: 'Hectárea', category: 'AREA', factorToBase: 10_000 },
  { key: 'cm2', label: 'Centímetro cuadrado', category: 'AREA', factorToBase: 0.0001 },

  { key: 'und', label: 'Unidad', category: 'UNIDAD', factorToBase: 1 },
  { key: 'doc', label: 'Docena', category: 'UNIDAD', factorToBase: 12 },
  { key: 'caja', label: 'Caja', category: 'UNIDAD', factorToBase: 1 },
  { key: 'bulto', label: 'Bulto', category: 'UNIDAD', factorToBase: 1 },
  { key: 'paq', label: 'Paquete', category: 'UNIDAD', factorToBase: 1 },
  { key: 'par', label: 'Par', category: 'UNIDAD', factorToBase: 2 },
  { key: 'rollo', label: 'Rollo', category: 'UNIDAD', factorToBase: 1 },
];

const UNIT_ALIASES: Record<string, string> = {
  kilogramo: 'kg', kilogramos: 'kg', kilo: 'kg', kilos: 'kg',
  gramo: 'g', gramos: 'g', gr: 'g',
  miligramo: 'mg', miligramos: 'mg',
  tonelada: 'ton', toneladas: 'ton', tn: 'ton',
  libra: 'lb', libras: 'lb', lbs: 'lb',
  onza: 'oz', onzas: 'oz',
  arrobas: 'arroba',
  litro: 'l', litros: 'l', lt: 'l', lts: 'l',
  mililitro: 'ml', mililitros: 'ml',
  galon: 'gal', galón: 'gal', galones: 'gal',
  'metro cubico': 'm3', 'metros cubicos': 'm3', 'metro cúbico': 'm3', 'metros cúbicos': 'm3',
  'centimetro cubico': 'cm3', 'centímetro cúbico': 'cm3', cc: 'cm3',
  'onza liquida': 'fl_oz', 'onza líquida': 'fl_oz',
  metro: 'm', metros: 'm', mt: 'm', mts: 'm',
  centimetro: 'cm', centímetro: 'cm', centimetros: 'cm', centímetros: 'cm',
  milimetro: 'mm', milímetro: 'mm', milimetros: 'mm', milímetros: 'mm',
  kilometro: 'km', kilómetro: 'km', kilometros: 'km', kilómetros: 'km',
  pulgada: 'in', pulgadas: 'in',
  pie: 'ft', pies: 'ft',
  yarda: 'yd', yardas: 'yd',
  'metro cuadrado': 'm2', 'metros cuadrados': 'm2',
  hectarea: 'ha', hectárea: 'ha', hectareas: 'ha', hectáreas: 'ha',
  'centimetro cuadrado': 'cm2', 'centímetro cuadrado': 'cm2',
  unidad: 'und', unidades: 'und', uni: 'und', u: 'und', un: 'und',
  docena: 'doc', docenas: 'doc',
  cajas: 'caja',
  bultos: 'bulto',
  paquete: 'paq', paquetes: 'paq',
  pares: 'par',
  rollos: 'rollo',
};

@Injectable({ providedIn: 'root' })
export class UnitConversionService {
  private unitMap = new Map<string, UnitDefinition>();

  constructor() {
    UNIT_CATALOG.forEach(u => this.unitMap.set(u.key, u));
  }

  getCategories(): UnitCategory[] {
    return ['MASA', 'VOLUMEN', 'LONGITUD', 'AREA', 'UNIDAD'];
  }

  getUnitsByCategory(category: UnitCategory): UnitDefinition[] {
    return UNIT_CATALOG.filter(u => u.category === category);
  }

  getAllUnits(): UnitDefinition[] {
    return [...UNIT_CATALOG];
  }

  resolveUnitKey(raw: string): string | null {
    if (!raw) return null;
    const normalized = raw.trim().toLowerCase().replace(/\./g, '');
    if (this.unitMap.has(normalized)) return normalized;
    return UNIT_ALIASES[normalized] ?? null;
  }

  getUnit(key: string): UnitDefinition | null {
    return this.unitMap.get(key) ?? null;
  }

  areSameCategory(unitA: string, unitB: string): boolean {
    const a = this.getUnit(this.resolveUnitKey(unitA) ?? '');
    const b = this.getUnit(this.resolveUnitKey(unitB) ?? '');
    if (!a || !b) return false;
    return a.category === b.category;
  }

  convert(value: number, fromRaw: string, toRaw: string): ConversionResult {
    const fromKey = this.resolveUnitKey(fromRaw);
    const toKey = this.resolveUnitKey(toRaw);

    if (!fromKey || !toKey) {
      return {
        success: false,
        originalValue: value,
        originalUnit: fromRaw,
        convertedValue: value,
        targetUnit: toRaw,
        factor: 1,
        category: 'UNIDAD',
        error: `Unidad no reconocida: ${!fromKey ? fromRaw : toRaw}`,
      };
    }

    const fromUnit = this.unitMap.get(fromKey)!;
    const toUnit = this.unitMap.get(toKey)!;

    if (fromUnit.category !== toUnit.category) {
      return {
        success: false,
        originalValue: value,
        originalUnit: fromRaw,
        convertedValue: value,
        targetUnit: toRaw,
        factor: 1,
        category: fromUnit.category,
        error: `No se puede convertir ${fromUnit.category} a ${toUnit.category}`,
      };
    }

    const baseValue = value * fromUnit.factorToBase;
    const convertedValue = baseValue / toUnit.factorToBase;
    const factor = fromUnit.factorToBase / toUnit.factorToBase;

    return {
      success: true,
      originalValue: value,
      originalUnit: fromUnit.label,
      convertedValue,
      targetUnit: toUnit.label,
      factor,
      category: fromUnit.category,
    };
  }

  getCategoryLabel(category: UnitCategory): string {
    const labels: Record<UnitCategory, string> = {
      MASA: 'Masa / Peso',
      VOLUMEN: 'Volumen',
      LONGITUD: 'Longitud',
      AREA: 'Área',
      UNIDAD: 'Conteo / Unidades',
    };
    return labels[category];
  }
}
