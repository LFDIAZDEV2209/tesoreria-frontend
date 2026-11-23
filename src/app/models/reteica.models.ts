// ═══════════════════════════════════════════
//  REQUEST — Crear/Actualizar tarifa
// ═══════════════════════════════════════════

export interface ReteicaTarifaRequest {
  municipio: string;
  departamento: string;
  codigoDane?: string;
  actividadEconomica: string;
  codigoActividad?: string;
  tarifaPorMil: number;
  anioVigencia: number;
  vigente?: boolean;
  descripcion?: string;
}

// ═══════════════════════════════════════════
//  RESPONSE — Tarifa ReteICA
// ═══════════════════════════════════════════

export interface ReteicaTarifaResponse {
  id: number;
  municipio: string;
  departamento: string;
  codigoDane?: string;
  actividadEconomica: string;
  codigoActividad?: string;
  tarifaPorMil: number;
  anioVigencia: number;
  vigente: boolean;
  descripcion?: string;
  activo: boolean;
  fechaCreacion?: string;
  fechaActualizacion?: string;
}

// ═══════════════════════════════════════════
//  PROVEEDOR — Campos ReteICA en respuesta
// ═══════════════════════════════════════════

export interface ProveedorReteicaFields {
  reteicaTarifaId?: number;
  reteicaMunicipio?: string;
  reteicaActividadEconomica?: string;
  reteicaTarifaPorMil?: number;
}

// ═══════════════════════════════════════════
//  Error del API
// ═══════════════════════════════════════════

export interface ApiError {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  details?: string[];
}
