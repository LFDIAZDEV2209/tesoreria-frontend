/** Request — lo que envía el frontend */
export interface ChatRequest {
  /** Mensaje del usuario (obligatorio, no puede estar vacío) */
  message: string;

  /** Idioma preferido. Si es null, Claude lo detecta automáticamente */
  language?: 'es' | 'en' | null;

  /** ID del trámite actual (para análisis de productos en órdenes de compra) */
  tramiteId?: number | null;
}

/** Response — lo que devuelve el backend */
export interface ChatResponse {
  /** Intención detectada: "unit_conversion" | "product_analysis" | "general_chat" | "error" */
  intent: string;

  /** Mensaje de respuesta legible para mostrar en el chat */
  reply: string;

  /** true si el backend necesita más información del usuario */
  needsClarification: boolean;

  /** Pregunta de aclaración (solo si needsClarification = true) */
  clarificationQuestion?: string;

  /** Idioma detectado: "es" | "en" */
  language: string;

  /** Valor original que se convirtió */
  sourceValue?: number;

  /** Unidad de origen (normalizada) */
  sourceUnit?: string;

  /** Unidad de destino (normalizada) */
  targetUnit?: string;

  /** Resultado de la conversión (calculado por Java) */
  convertedValue?: number;

  // ── Campos específicos de product_analysis ──

  /** Detalle del análisis de productos */
  analysisDetail?: string;

  /** Nombre del producto buscado */
  productName?: string;

  /** Número de marcas/proveedores encontrados */
  brandCount?: number;

  /** Cantidad total del producto */
  totalQuantity?: number;

  /** Porcentaje de cumplimiento vs planeación */
  fulfillmentPercentage?: number;
}
