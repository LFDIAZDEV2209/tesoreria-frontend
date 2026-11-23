import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { OrdenCompraCargada, EstadoEscaneo, FacturaOcrResult, FechaPagoCredito, TipoPago } from '../models/tramitar-requisicion.model';

/**
 * Respuesta del endpoint POST /api/v1/textract/upload-and-analyze
 */
export interface TextractResponse {
  plainText: string;
  tables: string[][][];
  keyValuePairs: { key: string; value: string }[];
}

/**
 * Servicio de Escaneo OCR — Integración con AWS Textract
 * ───────────────────────────────────────────────────────
 * Envía archivos al backend que los analiza con AWS Textract (TABLES + FORMS).
 * Extrae campos estructurados de Órdenes de Compra a partir del texto plano,
 * pares clave-valor y tablas detectadas.
 */
@Injectable({
  providedIn: 'root',
})
export class OcrScanningService {
  private readonly textractUrl = `${environment.apiUrl}/v1/textract/upload-and-analyze`;

  constructor(private http: HttpClient) {}

  /**
   * Envía un archivo al backend para análisis OCR con AWS Textract.
   * Retorna los datos extraídos mapeados a OrdenCompraCargada.
   */
  escanearArchivo(
    file: File,
    index: number,
  ): Observable<Partial<OrdenCompraCargada>> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<TextractResponse>(this.textractUrl, formData).pipe(
      map((response) => this.parseTextractResponse(response, file, index)),
      catchError((error) => {
        console.error('Error en OCR Textract:', error);
        const errorDetail =
          error?.error?.detail ||
          error?.error?.error ||
          error?.message ||
          'Error desconocido';
        return of<Partial<OrdenCompraCargada>>({
          estadoEscaneo: 'error' as EstadoEscaneo,
          progresoEscaneo: 0,
          confianzaOCR: 0,
          descripcionItems: `Error OCR: ${errorDetail}`,
        });
      }),
    );
  }

  /**
   * Envía un archivo de FACTURA al backend para análisis OCR con AWS Textract.
   * Usa un parser especializado para facturas colombianas que prioriza campos
   * de facturación (N° Factura, fecha vencimiento, retenciones, etc.)
   * en lugar de campos de orden de compra.
   */
  escanearFactura(file: File): Observable<FacturaOcrResult> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<TextractResponse>(`${environment.apiUrl}/v1/textract/factura`, formData).pipe(
      map((response) => this.parseTextractResponseAsFactura(response, file)),
      catchError((error) => {
        console.error('Error en OCR Textract (Factura):', error);
        const errorDetail =
          error?.error?.detail ||
          error?.error?.error ||
          error?.message ||
          'Error desconocido';
        return of<FacturaOcrResult>({
          estadoEscaneo: 'error' as EstadoEscaneo,
          progresoEscaneo: 0,
          confianzaOCR: 0,
          facturaNumero: '',
          proveedor: '',
          nitProveedor: '',
          fechaEmision: '',
          valorAntesIva: 0,
          ivaPorcentaje: 0,
          valorIva: 0,
          valorTotal: 0,
          descripcionItems: `Error OCR Factura: ${errorDetail}`,
        });
      }),
    );
  }

  /**
   * Envía un archivo al backend y retorna la respuesta cruda de Textract
   * (plainText, tables, keyValuePairs). Usado por el módulo de contabilidad
   * para parsear documentos de egreso directamente.
   */
  escanearArchivoRaw(file: File): Observable<TextractResponse> {
    const formData = new FormData();
    formData.append('file', file);

    console.info(
      `[OCR] Enviando archivo al backend: ${file.name} (${(file.size / 1024).toFixed(1)} KB, tipo: ${file.type})`,
    );
    console.info(`[OCR] URL del endpoint: ${this.textractUrl}`);

    return this.http.post<TextractResponse>(this.textractUrl, formData).pipe(
      map((response) => {
        console.info('[OCR] Respuesta recibida del backend:', {
          plainTextLength: response.plainText?.length || 0,
          tablesCount: response.tables?.length || 0,
          kvPairsCount: response.keyValuePairs?.length || 0,
          plainTextPreview: (response.plainText || '').substring(0, 200),
          tables: response.tables,
          keyValuePairs: response.keyValuePairs,
        });
        return response;
      }),
      catchError((error) => {
        console.error('[OCR] ERROR al llamar al endpoint Textract:', {
          status: error?.status,
          statusText: error?.statusText,
          url: error?.url,
          message: error?.message,
          errorBody: error?.error,
        });
        // Re-throw so the caller knows it failed
        throw error;
      }),
    );
  }

  /**
   * Genera progreso incremental para la animación de escaneo.
   * La animación avanza hasta 95% y espera a que la respuesta real del API complete al 100%.
   */
  getProgresoStream(duracionMs: number): Observable<number> {
    const steps = 40;
    const interval = duracionMs / steps;

    return new Observable((subscriber) => {
      let currentStep = 0;
      const timer = setInterval(() => {
        currentStep++;
        // Curva logarítmica: avanza rápido al inicio, luego desacelera
        const ratio = currentStep / steps;
        const progreso = Math.min(
          Math.round(95 * (1 - Math.pow(1 - ratio, 2.5))),
          95,
        );
        subscriber.next(progreso);
        if (currentStep >= steps) {
          clearInterval(timer);
        }
      }, interval);

      return () => clearInterval(timer);
    });
  }

  // ═══════════════════════════════════════════════════════
  // Parsing de la respuesta Textract → OrdenCompraCargada
  // ═══════════════════════════════════════════════════════

  private parseTextractResponse(
    response: TextractResponse,
    file: File,
    index: number,
  ): Partial<OrdenCompraCargada> {
    const kvMap = this.buildKeyValueMap(response.keyValuePairs || []);
    const plainText = (response.plainText || '').trim();
    const tables = response.tables || [];

    // --- Extraer cada campo ---
    const numeroOC = this.extractNumeroOC(kvMap, plainText, index);
    const proveedor = this.extractProveedor(kvMap, plainText);
    const nitProveedor = this.extractNIT(kvMap, plainText);
    const fechaEmision = this.extractFecha(kvMap, plainText);
    const { valorAntesIva, ivaPorcentaje, valorIva, valorTotal } =
      this.extractFinancials(kvMap, plainText);
    const responsableCompra = this.extractResponsable(kvMap, plainText);
    const descripcionItems = this.extractDescripcion(kvMap, plainText, tables);
    const condicionesPago = this.extractCondicionesPago(kvMap, plainText);
    const tiempoEntrega = this.extractTiempoEntrega(kvMap, plainText);

    // --- Extraer datos de crédito desde observaciones ---
    const creditoData = this.extractCreditoData(
      kvMap,
      plainText,
      fechaEmision,
      valorTotal,
    );

    // --- Calcular confianza basada en campos encontrados ---
    const confianzaOCR = this.calcularConfianza({
      numeroOC,
      proveedor,
      nitProveedor,
      fechaEmision,
      valorTotal,
      valorAntesIva,
      responsableCompra,
      descripcionItems,
    });

    return {
      estadoEscaneo: 'completado' as EstadoEscaneo,
      progresoEscaneo: 100,
      numeroOC,
      proveedor,
      nitProveedor,
      fechaEmision,
      valorAntesIva,
      ivaPorcentaje,
      valorIva,
      valorTotal,
      responsableCompra,
      descripcionItems,
      condicionesPago,
      tiempoEntrega,
      confianzaOCR,
      // Auto-asignar tipo de pago según lo detectado por OCR
      ...(creditoData.esCredito ? { tipoPago: 'CREDITO' as TipoPago }
        : creditoData.esContraEntrega ? { tipoPago: 'CONTRA_ENTREGA' as TipoPago }
        : creditoData.esContado ? { tipoPago: 'CONTADO' as TipoPago }
        : {}),
      // Datos de crédito
      creditoObservacionesOC: creditoData.observacionesCompletas || undefined,
      creditoFechaEntrega: creditoData.fechaEntrega || undefined,
      creditoPlazosDias: creditoData.plazosDias || undefined,
      creditoFechasPago: creditoData.fechasPago.length > 0 ? creditoData.fechasPago : undefined,
      creditoConsumoDesde: creditoData.consumoDesde || undefined,
      creditoConsumoHasta: creditoData.consumoHasta || undefined,
      creditoNumeroDoc: creditoData.numeroDoc || undefined,
      creditoCobertura: creditoData.cobertura || undefined,
      creditoDireccionEntrega: creditoData.direccionEntrega || undefined,
      creditoContactoEntrega: creditoData.contactoEntrega || undefined,
    };
  }

  // ═══════════════════════════════════════════════════════
  // Parser especializado para FACTURAS colombianas
  // ═══════════════════════════════════════════════════════

  private parseTextractResponseAsFactura(
    response: TextractResponse,
    file: File,
  ): FacturaOcrResult {
    const kvMap = this.buildKeyValueMap(response.keyValuePairs || []);
    const plainText = (response.plainText || '').trim();
    const tables = response.tables || [];

    // --- Extraer campos con prioridad FACTURA ---
    const facturaNumero = this.extractNumeroFactura(kvMap, plainText);
    let proveedor = this.extractProveedor(kvMap, plainText);
    let nitProveedor = this.extractNIT(kvMap, plainText);
    const fechaEmision = this.extractFechaFactura(kvMap, plainText);
    const fechaVencimiento = this.extractFechaVencimiento(kvMap, plainText);
    let { valorAntesIva, ivaPorcentaje, valorIva, valorTotal } =
      this.extractFinancials(kvMap, plainText);

    // --- Fallbacks para documentos tipo Cuenta de Cobro ---
    // Si no se encontró total con extractFinancials, buscar "Por la suma de" + monto en paréntesis
    if (valorTotal === 0) {
      const sumaPattern = plainText.match(/\(\$\s*([\d.,]+)\)/i);
      if (sumaPattern) {
        valorTotal = this.parseCurrency(sumaPattern[1]);
        valorAntesIva = valorTotal; // Cuenta de cobro no tiene IVA típicamente
      }
      if (valorTotal === 0) {
        // Buscar también en KV pairs: el valor puede estar en "Cordial saludo," u otra clave
        for (const [, value] of kvMap.entries()) {
          const montoMatch = value.match(/\(\$\s*([\d.,]+)\)/);
          if (montoMatch) {
            valorTotal = this.parseCurrency(montoMatch[1]);
            valorAntesIva = valorTotal;
            break;
          }
        }
      }
    }

    // Si no se encontró proveedor, buscar nombre junto a C.C./Cédula
    if (!proveedor) {
      const ccValue = this.findInKvMap(kvMap, [
        'cc',
        'c c',
        'cedula',
        'cédula',
      ]);
      if (ccValue) {
        nitProveedor = ccValue;
      }
      // Buscar nombre personal en las primeras líneas del texto
      const lines = plainText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        const line = lines[i];
        // Nombre de persona: 2+ palabras capitalizadas, no es "CUENTA DE COBRO" ni etiquetas
        if (
          /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/.test(line) &&
          !/cuenta\s+de\s+cobro|cordial\s+saludo|por\s+la\s+suma|por\s+concepto/i.test(
            line,
          ) &&
          line.length >= 8 &&
          line.length <= 60
        ) {
          proveedor = line;
          break;
        }
      }
    }
    const descripcionItems = this.extractDescripcion(kvMap, plainText, tables);
    const condicionesPago = this.extractCondicionesPago(kvMap, plainText);
    const retencionFuente = this.extractRetencion(kvMap, plainText, 'fuente');
    const retencionICA = this.extractRetencion(kvMap, plainText, 'ica');

    // --- Calcular confianza para factura ---
    const confianzaOCR = this.calcularConfianzaFactura({
      facturaNumero,
      proveedor,
      nitProveedor,
      fechaEmision,
      valorTotal,
      valorAntesIva,
      descripcionItems,
    });

    return {
      estadoEscaneo: 'completado' as EstadoEscaneo,
      progresoEscaneo: 100,
      facturaNumero,
      proveedor,
      nitProveedor,
      fechaEmision,
      fechaVencimiento,
      valorAntesIva,
      ivaPorcentaje,
      valorIva,
      valorTotal,
      descripcionItems,
      condicionesPago,
      retencionFuente,
      retencionICA,
      confianzaOCR,
    };
  }

  /**
   * Extrae el número de factura — prioriza patrones de facturación colombiana
   * (Factura de Venta, FV, FVN, Nota Débito, etc.) sobre patrones de OC.
   */
  private extractNumeroFactura(
    kvMap: Map<string, string>,
    text: string,
  ): string {
    // 1. Buscar explícitamente en KV pairs con alias de factura
    const fromKv = this.findInKvMap(kvMap, [
      'factura de venta',
      'factura no',
      'factura n',
      'no factura',
      'numero factura',
      'número factura',
      'n factura',
      'nro factura',
      'nota debito',
      'nota débito',
      'nota credito',
      'nota crédito',
      'documento no',
      'documento n',
      'numero documento',
      'no',
    ]);
    if (
      fromKv &&
      /[A-Z0-9]/.test(fromKv) &&
      fromKv.length <= 30 &&
      fromKv.length >= 1
    ) {
      return fromKv;
    }

    // 1b. Detectar "Cuenta de Cobro" como tipo de documento
    const cuentaCobro = this.findInKvMap(kvMap, ['cuenta de cobro']);
    if (cuentaCobro) {
      // Retornar "Cuenta de Cobro - <concepto>" o generar identificador
      return `Cuenta de Cobro${cuentaCobro ? ' - ' + cuentaCobro.substring(0, 40) : ''}`;
    }
    // Buscar "Cuenta de Cobro" en texto plano
    const cuentaCobroText = text.match(
      /cuenta\s+de\s+cobro(?:\s*[\-:]\s*(.{3,50}))?/i,
    );
    if (cuentaCobroText) {
      const concepto = cuentaCobroText[1]?.trim();
      return `Cuenta de Cobro${concepto ? ' - ' + concepto.substring(0, 40) : ''}`;
    }

    // 2. Buscar en texto plano con patrones de factura colombiana
    const fromText = this.findInText(text, [
      // Factura de Venta con prefijo FV / FVN / FVNS etc.
      /(?:factura\s*(?:de\s*venta)?|FVN?S?)[\s\-:#n°.]*([A-Z]*\-?\d[\w\-]{0,20})/i,
      // Nota débito / crédito
      /(?:nota\s*(?:d[eé]bito|cr[eé]dito))[\s\-:#n°.]*(\d[\w\-]{0,15})/i,
      // Documento genérico
      /(?:documento|doc)[\s\-:#n°.]*([A-Z0-9][\w\-]{1,15})/i,
      // Número solo con label "No."
      /No\.\s*(\d[\w\-]{0,15})/i,
      // Patrón de factura electrónica DIAN
      /(?:CUFE|cufe)[\s:]*([A-Fa-f0-9]{10,64})/i,
    ]);
    if (fromText) return fromText;

    // 3. Buscar cualquier número prominente cerca del encabezado
    const lines = text.split('\n').slice(0, 10);
    for (const line of lines) {
      const match = line.match(
        /(?:factura|invoice|fv|nota)[^0-9]*(\d[\w\-]{2,15})/i,
      );
      if (match) return match[1];
    }

    return '';
  }

  /**
   * Extrae la fecha de emisión/expedición de una factura.
   * Prioriza campos específicos de facturación.
   */
  private extractFechaFactura(
    kvMap: Map<string, string>,
    text: string,
  ): string {
    const fromKv = this.findInKvMap(kvMap, [
      'fecha factura',
      'fecha de factura',
      'fecha de emision',
      'fecha de emisión',
      'fecha emision',
      'fecha expedicion',
      'fecha de expedicion',
      'fecha de expedición',
      'fecha nota debito',
      'fecha nota débito',
      'fecha generacion',
      'fecha de generacion',
      'generacion',
      'generación',
      'expedicion',
      'expedición',
      'date',
    ]);
    if (fromKv) return this.normalizeFecha(fromKv);

    // Fallback genérico
    const fechaGeneric = this.findInKvMap(kvMap, ['fecha']);
    if (fechaGeneric && this.looksLikeDate(fechaGeneric)) {
      return this.normalizeFecha(fechaGeneric);
    }

    const fromText = this.findInText(text, [
      /(?:fecha\s*(?:factura|emisi[oó]n|expedici[oó]n|nota\s*d[eé]bito|generaci[oó]n))[:\s]*(\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
      /(?:fecha\s*(?:factura|emisi[oó]n|expedici[oó]n|nota\s*d[eé]bito|generaci[oó]n))[:\s]*(\d{1,2}[\s\/\-]\d{1,2}[\s\/\-]\d{2,4})/i,
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    ]);
    return fromText ? this.normalizeFecha(fromText) : '';
  }

  /**
   * Extrae la fecha de vencimiento de la factura.
   */
  private extractFechaVencimiento(
    kvMap: Map<string, string>,
    text: string,
  ): string {
    const fromKv = this.findInKvMap(kvMap, [
      'fecha vencimiento',
      'fecha de vencimiento',
      'vencimiento',
      'due date',
      'payment due',
      'vence',
    ]);
    if (fromKv && this.looksLikeDate(fromKv))
      return this.normalizeFecha(fromKv);

    const fromText = this.findInText(text, [
      /(?:vencimiento|vence)[:\s]*(\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
      /(?:vencimiento|vence)[:\s]*(\d{1,2}[\s\/\-]\d{1,2}[\s\/\-]\d{2,4})/i,
    ]);
    return fromText ? this.normalizeFecha(fromText) : '';
  }

  /**
   * Extrae retenciones (fuente, ICA) de la factura.
   */
  private extractRetencion(
    kvMap: Map<string, string>,
    text: string,
    tipo: 'fuente' | 'ica',
  ): number {
    if (tipo === 'fuente') {
      const val =
        this.findInKvMap(kvMap, [
          'retencion en la fuente',
          'retención en la fuente',
          'rete fuente',
          'retefuente',
          'rte fuente',
          'rtefuente',
        ]) ||
        this.findInText(text, [
          /(?:rete?\s*fuente|retenci[oó]n\s*(?:en\s*la\s*)?fuente)[:\s]*\$?\s*([\d.,]+)/i,
        ]);
      return this.parseCurrency(val);
    } else {
      const val =
        this.findInKvMap(kvMap, [
          'reteica',
          'rete ica',
          'retencion ica',
          'retención ica',
        ]) ||
        this.findInText(text, [
          /(?:rete?\s*ica|retenci[oó]n\s*ica)[:\s]*\$?\s*([\d.,]+)/i,
        ]);
      return this.parseCurrency(val);
    }
  }

  /**
   * Confianza OCR específica para facturas — pondera los campos más importantes.
   */
  private calcularConfianzaFactura(campos: {
    facturaNumero: string;
    proveedor: string;
    nitProveedor: string;
    fechaEmision: string;
    valorTotal: number;
    valorAntesIva: number;
    descripcionItems: string;
  }): number {
    const pesos: { campo: boolean; peso: number }[] = [
      { campo: !!campos.facturaNumero, peso: 20 },
      { campo: !!campos.proveedor, peso: 20 },
      { campo: !!campos.nitProveedor, peso: 10 },
      { campo: !!campos.fechaEmision, peso: 10 },
      { campo: campos.valorTotal > 0, peso: 20 },
      {
        campo:
          campos.valorAntesIva > 0 &&
          campos.valorAntesIva !== campos.valorTotal,
        peso: 10,
      },
      {
        campo: !!campos.descripcionItems && campos.descripcionItems.length > 5,
        peso: 10,
      },
    ];

    const totalPeso = pesos.reduce((s, p) => s + p.peso, 0);
    const pesoObtenido = pesos.reduce((s, p) => s + (p.campo ? p.peso : 0), 0);
    return Math.round((pesoObtenido / totalPeso) * 100);
  }

  // ═══════════════════════════════════════════════════════
  // Mapa normalizado de clave-valor
  // ═══════════════════════════════════════════════════════

  private buildKeyValueMap(
    pairs: { key: string; value: string }[],
  ): Map<string, string> {
    const map = new Map<string, string>();
    for (const { key, value } of pairs) {
      if (key && value) {
        map.set(this.normalizeKey(key), value.trim());
      }
    }
    return map;
  }

  private normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[.:;#°ºª%]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Busca un valor en el mapa de claves Textract usando múltiples alias.
   * Usa búsqueda EXACTA primero, luego búsqueda parcial estricta
   * (la clave del mapa debe contener el alias, NO viceversa, para evitar false positives).
   */
  private findInKvMap(kvMap: Map<string, string>, aliases: string[]): string {
    // Paso 1: búsqueda exacta
    for (const alias of aliases) {
      const exact = kvMap.get(alias);
      if (exact) return exact;
    }

    // Paso 2: la clave del mapa contiene el alias (parcial estricta)
    for (const alias of aliases) {
      if (alias.length < 3) continue; // Evitar alias muy cortos que causan falsos positivos
      for (const [key, value] of kvMap.entries()) {
        if (key.includes(alias)) {
          return value;
        }
      }
    }
    return '';
  }

  /**
   * Busca un patrón regex en el texto plano y retorna el primer grupo capturado.
   */
  private findInText(plainText: string, patterns: RegExp[]): string {
    for (const regex of patterns) {
      const match = plainText.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════
  // Extractores de campos específicos
  // ═══════════════════════════════════════════════════════

  /**
   * Extrae el número del documento (OC, factura, nota débito, cotización, etc.)
   */
  private extractNumeroOC(
    kvMap: Map<string, string>,
    text: string,
    index: number,
  ): string {
    // Palabras que nunca son un número de OC — sellos, estados, etc.
    const BLOCKLIST = /^(firmada?|original|copia|pagado|anulad[ao]|cancelad[ao]|revisad[ao]|aprobad[ao]|rechazad[ao]|enviado|recibid[ao]|pendiente|borrador)$/i;

    // 0. Patrones específicos del formato interno usado (Y-NNN-YYYYMMDD ó Y-NNN-20XXXXXX)
    //    Ejemplos: Y-001-20260107, Y - 001 - 20260107, Y001-20260107
    const internalPattern = text.match(/\bY\s*[-–]\s*\d{3}\s*[-–]\s*(20\d{6})\b/i)
      || text.match(/\bY[\s\-–]\d{3}[\s\-–]\d{8}\b/i);
    if (internalPattern) {
      return internalPattern[0].replace(/\s/g, '');
    }

    // 1. Buscar en key-value pairs — prioridad alta (aliases específicos de OC)
    const fromKvSpecific = this.findInKvMap(kvMap, [
      'numero de orden',
      'numero de orden de compra',
      'numero orden de compra',
      'n oc',
      'nro oc',
      'numero oc',
      'no oc',
      'orden de compra n',
      'orden de compra no',
      'orden de compra',
      'no de orden',
      'oc no',
      'oc n',
      'purchase order',
      'po number',
      'orden no',
      'n de la orden',
      'orden compra',
    ]);
    if (
      fromKvSpecific &&
      !BLOCKLIST.test(fromKvSpecific.trim()) &&
      /\d/.test(fromKvSpecific) &&
      fromKvSpecific.length <= 30 &&
      fromKvSpecific.length >= 1
    ) {
      return fromKvSpecific;
    }

    // 1b. Buscar aliases de factura/documento (prioridad media)
    const fromKvDoc = this.findInKvMap(kvMap, [
      'factura de venta',
      'factura no',
      'factura n',
      'nota debito',
      'nota débito',
      'consecutivo',
    ]);
    if (
      fromKvDoc &&
      !BLOCKLIST.test(fromKvDoc.trim()) &&
      /\d/.test(fromKvDoc) &&
      fromKvDoc.length <= 30 &&
      fromKvDoc.length >= 1 &&
      !/^\d{6,}$/.test(fromKvDoc.replace(/[\s\-\.]/g, '')) // excluir NITs largos
    ) {
      return fromKvDoc;
    }

    // 1c. Buscar aliases genéricos SOLO si tienen formato de documento (NO NITs, NO sellos)
    const fromKvGeneric = this.findInKvMap(kvMap, [
      'factura',
      'numero',
      'nro',
    ]);
    if (
      fromKvGeneric &&
      !BLOCKLIST.test(fromKvGeneric.trim()) &&
      /[A-Z]/.test(fromKvGeneric) && // debe tener letras (formato código, no solo dígitos)
      /\d/.test(fromKvGeneric) &&     // debe tener dígitos (descarta palabras sueltas como "FIRMADA")
      fromKvGeneric.length <= 20 &&
      fromKvGeneric.length >= 2
    ) {
      return fromKvGeneric;
    }

    // 2. Detectar "Cuenta de Cobro" — retornar como tipo de documento
    const cuentaCobro = this.findInKvMap(kvMap, ['cuenta de cobro']);
    if (cuentaCobro) {
      return `Cuenta de Cobro${cuentaCobro ? ' - ' + cuentaCobro.substring(0, 40) : ''}`;
    }
    const cuentaCobroText = text.match(
      /cuenta\s+de\s+cobro(?:\s*[\-:]\s*(.{3,50}))?/i,
    );
    if (cuentaCobroText) {
      const concepto = cuentaCobroText[1]?.trim();
      return `Cuenta de Cobro${concepto ? ' - ' + concepto.substring(0, 40) : ''}`;
    }

    // 3. Buscar en texto plano con patrones comunes colombianos
    // NOTA: usar \b word-boundary en alternaciones cortas (oc, po, cot) para evitar
    //       falsos positivos dentro de palabras como "pollo", "concepto", etc.
    const fromText = this.findInText(text, [
      // Formato interno Y-NNN-20XXXXXX (normalizado sin espacios)
      /\b([A-Z]\s*[-–]\s*\d{3}\s*[-–]\s*20\d{6})\b/i,
      /(?:factura\s*(?:de\s*venta)?|FVN?)[\s\-:#n°.]*([A-Z]*\-?\d[\w\-]{0,15})/i,
      /(?:nota\s*(?:d[eé]bito|cr[eé]dito))[\s\-:#n°.]*(\d[\w\-]{0,15})/i,
      /(?:orden\s*(?:de\s*)?compra|\boc\b|purchase\s*order|\bpo\b)[\s\-:#n°.]*([A-Z0-9][\w\-]{1,20})/i,
      /(?:cotizaci[oó]n|\bcot\b)[\s\-:#n°.]*([A-Z0-9][\w\-]{0,15})/i,
      /N[°º]\s*[:.]?\s*([A-Z0-9][\w\-]{0,15})/i,
      /No\.\s*(\d+)/i,
      /Nro\.\s*(\d+)/i,
      /consecutivo[\s:]*(\d+)/i,
      /(OC[\-\s]?\d{4}[\-\s]?\d{2,6})/i,
      /(FV[\-\s]?\d{2,10})/i,
    ]);
    if (fromText && !BLOCKLIST.test(fromText.trim())) {
      return fromText.replace(/\s/g, '');
    }

    return `OC-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`;
  }

  /**
   * Extrae el proveedor/emisor del documento.
   *
   * LÓGICA CLAVE: En documentos colombianos, el EMISOR (proveedor) aparece
   * en el encabezado del documento (primera líneas), mientras que "Señores"
   * o "Cliente" es el COMPRADOR (a quien va dirigido). No confundir.
   */
  private extractProveedor(kvMap: Map<string, string>, text: string): string {
    // 1. Buscar "proveedor" explícito en KV (solo si existe literalmente)
    const explicito = this.findInKvMap(kvMap, [
      'proveedor',
      'nombre del proveedor',
      'nombre proveedor',
      'razon social proveedor',
      'razón social proveedor',
    ]);
    if (explicito) return explicito;

    // 2. Extraer el EMISOR del documento — el nombre de empresa que aparece
    //    en las primeras líneas del texto, cerca del primer NIT.
    //    En documentos colombianos, el emisor es el proveedor.
    const emisor = this.extractEmisorFromHeader(text);
    if (emisor) return emisor;

    // 3. Fallback: buscar "Razón Social" o "Empresa" genéricos en KV
    const fallbackKv = this.findInKvMap(kvMap, [
      'razon social',
      'razón social',
      'empresa',
      'vendedor',
      'supplier',
      'vendor',
      'contratista',
    ]);
    if (fallbackKv) return fallbackKv;

    // 4. Fallback para Cuentas de Cobro: buscar nombre personal
    //    cerca de C.C. en el encabezado
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      // Detectar nombre propio (2+ palabras con mayúsculas) que no sea label
      if (
        /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ]/.test(line) &&
        !/cuenta\s+de\s+cobro|cordial|concepto|nota|factura|orden/i.test(
          line,
        ) &&
        line.length >= 8 &&
        line.length <= 60
      ) {
        return line;
      }
    }

    return '';
  }

  /**
   * Extrae el nombre de la empresa EMISORA del encabezado del documento.
   * En documentos colombianos, la estructura típica es:
   *   [Logo]
   *   NOMBRE EMPRESA S.A.S / LTDA / S.A.
   *   NIT 900.123.456-7
   *   Dirección | Ciudad | Teléfono
   *
   * El emisor es la primera empresa que aparece ANTES del primer "Señores"/"Cliente".
   */
  private extractEmisorFromHeader(text: string): string {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) return '';

    // Encontrar dónde comienza la sección del cliente (Señores/Cliente)
    const clienteIdx = lines.findIndex((l) =>
      /^(se[ñn]ores|cliente|comprador|destinatario|facturar\s*a|bill\s*to)/i.test(
        l,
      ),
    );
    // Solo buscar en las líneas del encabezado (antes del cliente, máximo primeras 15 líneas)
    const headerEnd = clienteIdx > 0 ? clienteIdx : Math.min(lines.length, 15);
    const headerLines = lines.slice(0, headerEnd);

    // Buscar patron: línea con nombre de empresa (contiene S.A.S, LTDA, S.A., SAS, etc.)
    const empresaRegex =
      /^(.+?)\s*(?:S\.?A\.?S\.?|LTDA\.?|S\.?\s*A\.?|S\.?\s*EN\s*C\.?|E\.?U\.?|CORP\.?|INC\.?|LLC)\.?\s*$/i;
    for (const line of headerLines) {
      const match = line.match(empresaRegex);
      if (match) {
        // Limpiar y retornar
        const name = line.replace(/\s+/g, ' ').trim();
        // Evitar retornar cosas que no son nombres de empresa
        if (name.length >= 5 && name.length <= 80 && !/^\d+$/.test(name)) {
          return name;
        }
      }
    }

    // Fallback: buscar línea que precede al primer NIT en el header
    for (let i = 0; i < headerLines.length; i++) {
      const line = headerLines[i];
      if (
        /NIT[\s:]*\d/.test(line) ||
        /^\d{3}[.\s]?\d{3}[.\s]?\d{3}[\s\-]\d/.test(line)
      ) {
        // El nombre de la empresa suele estar 1-2 líneas antes del NIT
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const candidate = headerLines[j].replace(/\s+/g, ' ').trim();
          // Debe ser texto significativo (no solo números, teléfonos, o etiquetas cortas)
          if (
            candidate.length >= 5 &&
            candidate.length <= 80 &&
            !/^\d[\d\s\-().]+$/.test(candidate) && // No es un teléfono/número
            !/^(tel|fax|dir|cra|calle|av|nit|rut)/i.test(candidate) && // No es un label
            /[A-ZÁÉÍÓÚÑ]{2,}/.test(candidate) // Tiene letras mayúsculas
          ) {
            return candidate;
          }
        }
      }
    }

    return '';
  }

  /**
   * Extrae el NIT del EMISOR/proveedor (el primer NIT que aparece en el documento,
   * que corresponde al emisor, no al cliente).
   */
  private extractNIT(kvMap: Map<string, string>, text: string): string {
    // 1. En documentos colombianos, el primer NIT en el texto es el del emisor.
    //    El NIT del cliente aparece después (en sección "Señores"/"NIT").
    const firstNitInText = this.findInText(text, [
      /NIT[\s:]*([0-9]{3}[.\s]?[0-9]{3}[.\s]?[0-9]{3}[\s\-]*[0-9])/i,
      /NIT[\s:]*(\d{9,10}[\s\-]*\d)/i,
    ]);
    if (firstNitInText) return this.cleanNIT(firstNitInText);

    // 2. Buscar en KV pairs (incluye C.C. para personas naturales)
    const fromKv = this.findInKvMap(kvMap, [
      'nit',
      'rut',
      'nit proveedor',
      'identificacion',
      'identificación',
      'cc',
      'c c',
      'cedula',
      'cédula',
    ]);
    if (fromKv) return this.cleanNIT(fromKv);

    // 3. Buscar C.C. en texto plano (Cuentas de Cobro usan cédula)
    const ccFromText = this.findInText(text, [
      /C\.?\s*C\.?\s*(?:No\.?)?\s*[:.]?\s*(\d{5,12})/i,
      /[Cc][eé]dula[\s:]*(\d{5,12})/i,
    ]);
    if (ccFromText) return ccFromText;

    // 4. Patrón genérico de NIT colombiano
    const fromText = this.findInText(text, [
      /(\d{3}\.?\d{3}\.?\d{3}\s*-\s*\d)/,
    ]);
    return fromText ? this.cleanNIT(fromText) : '';
  }

  private cleanNIT(nit: string): string {
    const cleaned = nit.replace(/\s/g, '').replace(/\./g, '');
    return cleaned;
  }

  private extractFecha(kvMap: Map<string, string>, text: string): string {
    // Buscar fecha específica del documento (emisión, expedición, nota débito)
    const fromKv = this.findInKvMap(kvMap, [
      'fecha nota debito',
      'fecha nota débito',
      'fecha de emision',
      'fecha de emisión',
      'fecha emision',
      'fecha expedicion',
      'fecha de expedicion',
      'fecha de expedición',
      'fecha orden',
      'fecha oc',
      'fecha de la orden',
      'fecha factura',
      'generacion',
      'generación',
      'expedicion',
      'expedición',
      'date',
    ]);
    if (fromKv) return this.normalizeFecha(fromKv);

    // Fallback: buscar "Fecha" genérica (pero validar que sea una fecha real)
    const fechaGeneric = this.findInKvMap(kvMap, ['fecha']);
    if (fechaGeneric && this.looksLikeDate(fechaGeneric)) {
      return this.normalizeFecha(fechaGeneric);
    }

    // Buscar en texto plano
    const fromText = this.findInText(text, [
      /(?:fecha\s*(?:nota\s*d[eé]bito|emisi[oó]n|expedici[oó]n|factura|orden))[:\s]*(\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
      /(?:fecha\s*(?:nota\s*d[eé]bito|emisi[oó]n|expedici[oó]n|factura|orden))[:\s]*(\d{1,2}[\s\/\-]\d{1,2}[\s\/\-]\d{2,4})/i,
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    ]);
    return fromText ? this.normalizeFecha(fromText) : '';
  }

  private looksLikeDate(value: string): boolean {
    return (
      /\d{4}[\-\/]\d{2}[\-\/]\d{2}/.test(value) ||
      /\d{1,2}[\s\/\-]\d{1,2}[\s\/\-]\d{2,4}/.test(value) ||
      /\d{1,2}\s*(?:de\s*)?\w+\s*(?:de\s*)?\d{4}/i.test(value) ||
      /\d{2}\/\d{2}\/\d{4},?\s*\d{2}:\d{2}/.test(value)
    );
  }

  private normalizeFecha(fecha: string): string {
    // Limpiar timestamps: "02/10/2025, 11:14" → "02/10/2025"
    fecha = fecha.replace(/,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/i, '').trim();

    // Si ya es ISO (YYYY-MM-DD), retornar tal cual
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;

    const meses: Record<string, string> = {
      enero: '01',
      febrero: '02',
      marzo: '03',
      abril: '04',
      mayo: '05',
      junio: '06',
      julio: '07',
      agosto: '08',
      septiembre: '09',
      sept: '09',
      octubre: '10',
      noviembre: '11',
      nov: '11',
      diciembre: '12',
      dic: '12',
    };

    // Formato: "15 de enero de 2026" o "15 enero 2026"
    const mesTextoMatch = fecha.match(
      /(\d{1,2})\s*(?:de\s*)?(\w+)\s*(?:de\s*)?(\d{4})/i,
    );
    if (mesTextoMatch) {
      const dia = mesTextoMatch[1].padStart(2, '0');
      const mesStr = mesTextoMatch[2].toLowerCase();
      const anio = mesTextoMatch[3];
      const mes = meses[mesStr] || '01';
      return `${anio}-${mes}-${dia}`;
    }

    // Formato: DD/MM/YYYY o DD-MM-YYYY
    const numericMatch = fecha.match(
      /(\d{1,2})[\s\/\-](\d{1,2})[\s\/\-](\d{2,4})/,
    );
    if (numericMatch) {
      const dia = numericMatch[1].padStart(2, '0');
      const mes = numericMatch[2].padStart(2, '0');
      let anio = numericMatch[3];
      if (anio.length === 2) anio = '20' + anio;
      return `${anio}-${mes}-${dia}`;
    }

    return fecha;
  }

  /**
   * Extrae valores financieros: subtotal (bruto), IVA, y total.
   *
   * LÓGICA: En documentos colombianos se usan estos términos:
   * - "Total Bruto" / "Subtotal" / "Base gravable" = valor ANTES de IVA
   * - "IVA 19%" / "IVA" = monto del impuesto
   * - "Total" / "Total a Pagar" = valor FINAL con IVA
   *
   * IMPORTANTE: "Total Bruto" NO es el total final, es el subtotal antes de IVA.
   */
  private extractFinancials(
    kvMap: Map<string, string>,
    text: string,
  ): {
    valorAntesIva: number;
    ivaPorcentaje: number;
    valorIva: number;
    valorTotal: number;
  } {
    // ── 1. Extraer subtotal (valor antes de IVA) ──
    // "Total Bruto" en Colombia = subtotal antes de IVA (NO es el total final)
    let valorAntesIva =
      this.parseCurrency(
        this.findInKvMap(kvMap, [
          'total bruto',
          'subtotal',
          'sub total',
          'sub-total',
          'valor antes de iva',
          'base gravable',
          'valor antes iva',
          'total antes de iva',
          'valor sin iva',
          'neto',
        ]),
      ) ||
      this.parseCurrency(
        this.findInText(text, [
          /(?:total\s*bruto)[:\s]*\$?\s*([\d.,]+)/i,
          /(?:sub\s*-?\s*total)[:\s]*\$?\s*([\d.,]+)/i,
          /(?:base\s*gravable)[:\s]*\$?\s*([\d.,]+)/i,
          /(?:valor\s*(?:antes\s*(?:de\s*)?)?iva|neto\s*antes)[:\s]*\$?\s*([\d.,]+)/i,
        ]),
      );

    // ── 2. Extraer IVA (monto) ──
    // Buscar primero aliases con % para ser más específico
    let valorIva = 0;
    let ivaPorcentaje = 0;

    // Detectar porcentaje IVA del key-value map
    for (const [key, value] of kvMap.entries()) {
      const pctMatch = key.match(/iva\s*(\d{1,2})\s*%?/i);
      if (pctMatch) {
        ivaPorcentaje = parseInt(pctMatch[1], 10);
        valorIva = this.parseCurrency(value);
        break;
      }
    }

    // Si no encontramos IVA en KV, buscar con alias genéricos
    if (valorIva === 0) {
      valorIva = this.parseCurrency(
        this.findInKvMap(kvMap, [
          'iva 19%',
          'iva 19',
          'valor iva',
          'total iva',
          'valor del iva',
          'impuesto',
        ]),
      );
    }
    if (valorIva === 0) {
      valorIva = this.parseCurrency(
        this.findInText(text, [
          /(?:IVA\s*\d{1,2}\s*%)[:\s]*\$?\s*([\d.,]+)/i,
          /(?:IVA)[:\s]*\$?\s*([\d.,]+)/i,
        ]),
      );
    }

    // Extraer porcentaje IVA si aún no lo tenemos
    if (ivaPorcentaje === 0) {
      const pctTextMatch = text.match(/IVA[\s(]*(\d{1,2})\s*%/i);
      if (pctTextMatch) {
        ivaPorcentaje = parseInt(pctTextMatch[1], 10);
      }
    }

    // ── 3. Extraer total FINAL (con IVA) ──
    // Nota: "Total" a secas puede ser ambiguo. Buscar primero los más específicos.
    let valorTotal = this.parseCurrency(
      this.findInKvMap(kvMap, [
        'total a pagar',
        'total general',
        'gran total',
        'total con iva',
        'valor total',
        'monto total',
        'total final',
      ]),
    );

    // Si no encontramos total específico, buscar "Total" genérico
    // PERO verificar que no sea "Total Bruto" (que ya capturamos como subtotal)
    if (valorTotal === 0) {
      // Buscar la clave "total" exacta (sin "bruto" ni "iva" ni "items")
      for (const [key, value] of kvMap.entries()) {
        if (key === 'total' || key === 'total cop') {
          const parsed = this.parseCurrency(value);
          if (parsed > 0) {
            valorTotal = parsed;
            break;
          }
        }
      }
    }

    if (valorTotal === 0) {
      valorTotal = this.parseCurrency(
        this.findInText(text, [
          // Buscar "Total" que NO sea seguido de "Bruto" o "items"
          /(?:^|\n)\s*Total\s*(?!bruto|items|ítems)[\s:]*\$?\s*([\d.,]+)/im,
          /(?:total\s*(?:a\s*pagar|general|final|con\s*iva))[:\s]*\$?\s*([\d.,]+)/i,
        ]),
      );
    }

    // ── 4. Validar coherencia y calcular valores faltantes ──

    // Si subtotal > total, están invertidos (o "total" es realmente el subtotal)
    if (valorAntesIva > 0 && valorTotal > 0 && valorAntesIva > valorTotal) {
      // Swap: lo que teníamos como subtotal es en realidad el total
      const temp = valorAntesIva;
      valorAntesIva = valorTotal;
      valorTotal = temp;
    }

    // Si subtotal == total y hay IVA, el "subtotal" capturado es realmente el total
    if (
      valorAntesIva > 0 &&
      valorTotal > 0 &&
      valorAntesIva === valorTotal &&
      valorIva > 0
    ) {
      valorAntesIva = valorTotal - valorIva;
    }

    // Calcular valores faltantes
    if (valorTotal > 0 && valorAntesIva > 0 && valorIva === 0) {
      valorIva = valorTotal - valorAntesIva;
    }
    if (valorTotal > 0 && valorIva > 0 && valorAntesIva === 0) {
      valorAntesIva = valorTotal - valorIva;
    }
    if (valorAntesIva > 0 && valorIva > 0 && valorTotal === 0) {
      valorTotal = valorAntesIva + valorIva;
    }
    if (valorAntesIva > 0 && valorTotal === 0 && ivaPorcentaje > 0) {
      valorIva = Math.round((valorAntesIva * ivaPorcentaje) / 100);
      valorTotal = valorAntesIva + valorIva;
    }
    if (valorTotal > 0 && valorAntesIva === 0 && ivaPorcentaje > 0) {
      valorAntesIva = Math.round(valorTotal / (1 + ivaPorcentaje / 100));
      valorIva = valorTotal - valorAntesIva;
    }

    // Inferir porcentaje IVA si no se encontró
    if (ivaPorcentaje === 0 && valorAntesIva > 0 && valorIva > 0) {
      const pct = Math.round((valorIva / valorAntesIva) * 100);
      if ([5, 8, 16, 19].includes(pct) || Math.abs(pct - 19) <= 1) {
        ivaPorcentaje = pct === 18 || pct === 20 ? 19 : pct;
      } else {
        ivaPorcentaje = pct;
      }
    }

    // ── 5. Fallback para Cuentas de Cobro: buscar monto en paréntesis ($X.XXX.XXX) ──
    if (valorTotal === 0) {
      const sumaPattern = text.match(/\(\$\s*([\d.,]+)\)/i);
      if (sumaPattern) {
        valorTotal = this.parseCurrency(sumaPattern[1]);
        valorAntesIva = valorTotal; // Cuenta de cobro no tiene IVA típicamente
      }
      if (valorTotal === 0) {
        // Buscar también en KV pairs: el valor puede estar en "Cordial saludo," u otra clave
        for (const [, value] of kvMap.entries()) {
          const montoMatch = value.match(/\(\$\s*([\d.,]+)\)/);
          if (montoMatch) {
            valorTotal = this.parseCurrency(montoMatch[1]);
            valorAntesIva = valorTotal;
            break;
          }
        }
      }
    }

    // Si solo tenemos total sin desglose, asumir IVA 0% para Cuentas de Cobro
    // (los documentos tipo Cuenta de Cobro normalmente no tienen IVA)
    if (valorTotal > 0 && valorAntesIva === valorTotal && ivaPorcentaje === 0) {
      // Total == Subtotal sin IVA detectado → probablemente no tiene IVA
      // No asumir 19%, dejar en 0%
    } else if (valorTotal > 0 && valorAntesIva === 0 && ivaPorcentaje === 0) {
      ivaPorcentaje = 19;
      valorAntesIva = Math.round(valorTotal / 1.19);
      valorIva = valorTotal - valorAntesIva;
    }

    return { valorAntesIva, ivaPorcentaje, valorIva, valorTotal };
  }

  /**
   * Parsea un string de moneda colombiana.
   * Soporta: $1.500.000 | 1.500.000,00 | 1,500,000 | 1500000 | COP 1.500.000
   */
  private parseCurrency(value: string): number {
    if (!value) return 0;

    // Remover prefijos/sufijos de moneda y espacios
    let cleaned = value
      .replace(/^[\s$]*/g, '')
      .replace(/^COP\s*/i, '')
      .trim();
    if (!cleaned) return 0;

    // Detectar formato colombiano (puntos como miles, coma como decimal)
    // Ej: 1.500.000,00 o 1.500.000 o 4,639,500.00
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
      // Formato: 1.500.000,00 → colombiano
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
      // Formato: 1,500,000.00 → anglosajón
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Otros formatos mixtos o sin separador
      cleaned = cleaned.replace(/[^0-9.,]/g, '');
      // Si hay punto como decimal (e.g., "881505.00"), tratar normalmente
      if (/\.\d{2}$/.test(cleaned) && !cleaned.includes(',')) {
        // Ya es un formato decimal estándar
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    }

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num);
  }

  private extractResponsable(kvMap: Map<string, string>, text: string): string {
    const fromKv = this.findInKvMap(kvMap, [
      'responsable',
      'comprador',
      'elaborado por',
      'solicitado por',
      'autorizado por',
      'aprobado por',
      'preparado por',
      'buyer',
      'responsable de compra',
      'jefe de compras',
      'elaborado',
    ]);
    // Validar que no sea un valor numérico o fecha
    if (fromKv && /[a-záéíóúñA-ZÁÉÍÓÚÑ]{3,}/.test(fromKv)) return fromKv;

    const fromText = this.findInText(text, [
      /(?:responsable|comprador|elaborado\s*por|solicitado\s*por|aprobado\s*por|preparado\s*por)[:\s]+([A-ZÁÉÍÓÚÑ][\wáéíóúñ\s.]{3,40}?)(?:\n|$|Cargo|Tel|C\.?C)/i,
    ]);
    return fromText || '';
  }

  /**
   * Extrae la descripción de los ítems/productos.
   * Prioriza la tabla de ítems si existe.
   */
  private extractDescripcion(
    kvMap: Map<string, string>,
    text: string,
    tables: string[][][],
  ): string {
    // 1. Intentar desde tablas — buscar columna de descripción
    //    (priorizar tabla porque es lo más confiable para ítems)
    const fromTable = this.extractDescriptionFromTables(tables);
    if (fromTable) return fromTable;

    // 2. Intentar desde key-value pairs
    const fromKv = this.findInKvMap(kvMap, [
      'descripcion de bienes',
      'bienes y servicios',
      'objeto',
      'concepto',
      'detalle',
      'asunto',
      'motivo',
    ]);
    // Validar que no sea una etiqueta/header genérica
    if (fromKv && fromKv.length > 8 && !this.isHeaderLabel(fromKv))
      return fromKv;

    // 3. Fallback a regex en texto plano
    const fromText = this.findInText(text, [
      /(?:concepto|descripci[oó]n|detalle|objeto)[:\s]+(.{15,150}?)(?:\n\n|\n[A-Z]|\$)/i,
    ]);
    if (fromText && !this.isHeaderLabel(fromText)) return fromText;

    return '';
  }

  /**
   * Detecta si un texto parece ser una etiqueta/encabezado de tabla
   * en vez de contenido real (e.g., "Factura de Venta; Generación; Expedición")
   */
  private isHeaderLabel(text: string): boolean {
    const labelPatterns = [
      /^(factura|generaci|expedici|vencimiento|fecha|item|cantidad|total|valor|precio)/i,
      /;\s*(generaci|expedici|vencimiento|fecha)/i,
    ];
    return labelPatterns.some((p) => p.test(text));
  }

  private extractDescriptionFromTables(tables: string[][][]): string {
    if (!tables || tables.length === 0) return '';

    // Buscar la tabla de ÍTEMS (la más grande, con columnas tipo Descripción + Cantidad + Valor)
    let bestTable: string[][] | null = null;
    let bestDescCol = -1;

    for (const table of tables) {
      if (table.length < 2) continue;

      const headers = table[0].map((h) => (h || '').toLowerCase());

      // Buscar columna de descripción en el encabezado
      let descCol = headers.findIndex(
        (h) =>
          h.includes('descripci') ||
          h.includes('concepto') ||
          h.includes('detalle') ||
          h.includes('producto') ||
          h.includes('servicio') ||
          (h.includes('item') && !h.includes('n')) ||
          h.includes('ítem') ||
          h.includes('bien'),
      );

      // Verificar que TAMBIÉN tenga columna numérica (Cantidad, Precio, Valor, Vr. Total)
      const hasNumericCol = headers.some(
        (h) =>
          h.includes('cantidad') ||
          h.includes('cant') ||
          h.includes('precio') ||
          h.includes('valor') ||
          h.includes('total') ||
          h.includes('vr'),
      );

      if (descCol >= 0 && hasNumericCol) {
        // Preferir tablas con más filas (tabla de ítems principal)
        if (!bestTable || table.length > bestTable.length) {
          bestTable = table;
          bestDescCol = descCol;
        }
      }

      // Si no encontramos header pero la tabla tiene >3 filas, considerar columna con texto largo
      if (descCol === -1 && table.length > 3) {
        for (let c = 0; c < (table[1]?.length || 0); c++) {
          const cellText = table[1][c] || '';
          if (
            cellText.length > 10 &&
            /[a-záéíóúñA-ZÁÉÍÓÚÑ]{3,}/.test(cellText)
          ) {
            if (!bestTable || table.length > bestTable.length) {
              bestTable = table;
              bestDescCol = c;
            }
            break;
          }
        }
      }
    }

    if (!bestTable || bestDescCol === -1) return '';

    const headers = bestTable[0].map((h) => (h || '').toLowerCase().trim());

    // Detectar columnas de cantidad, unidad, valor unitario y valor total
    const findCol = (keys: string[]) =>
      headers.findIndex((h) => keys.some((k) => h.includes(k)));

    const cantCol = findCol(['cantidad', 'cant', 'qty']);
    const unitCol = findCol(['unidad', 'und', 'u.m.', 'unid', 'unit']);
    const precioCol = findCol(['valor unit', 'valorunit', 'vr unit', 'vrunit', 'precio unit', 'preciounit', 'v. unit', 'v.unit', 'unit price', 'precio']);
    const totalCol = findCol(['valor total', 'vr total', 'total', 'importe', 'v. total']);
    const codigoCol = findCol(['código', 'codigo', 'cod', 'ref', 'sku', 'item']);

    const dataRows = bestTable.slice(1).filter((row) => {
      const desc = row[bestDescCol]?.trim() || '';
      return (
        desc.length > 2 &&
        !/^[\d$.,\s]+$/.test(desc) &&
        !/^total/i.test(desc) &&
        !/^(sub\s*total|iva|impuesto)/i.test(desc)
      );
    });

    if (dataRows.length === 0) return '';

    // Si encontramos columnas de cantidad / unidad, devolver JSON estructurado
    if (cantCol >= 0 || unitCol >= 0 || precioCol >= 0) {
      const items = dataRows.map((row) => ({
        codigo: codigoCol >= 0 ? (row[codigoCol]?.trim() || '') : '',
        producto: row[bestDescCol]?.trim() || '',
        cantidad: this.parseCurrency(row[cantCol >= 0 ? cantCol : -1] || '0') || this.parseQty(row[cantCol >= 0 ? cantCol : -1] || ''),
        unidadMedida: (unitCol >= 0 ? row[unitCol]?.trim() : '') || 'UND',
        valorUnitario: precioCol >= 0 ? this.parseCurrency(row[precioCol] || '0') : 0,
        valorTotal: totalCol >= 0 ? this.parseCurrency(row[totalCol] || '0') : 0,
      })).filter(i => i.producto.length > 1);

      if (items.length > 0) {
        return JSON.stringify({ __items: items });
      }
    }

    // Fallback: solo nombres separados por punto y coma
    const descriptions = dataRows
      .map((row) => row[bestDescCol]?.trim())
      .filter((d) => d && d.length > 2);

    return descriptions.length > 0 ? descriptions.slice(0, 5).join('; ') : '';
  }

  /** Parsea una cantidad que puede tener decimales u otros formatos numéricos */
  private parseQty(value: string): number {
    if (!value) return 0;
    const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Extrae condiciones de pago.
   * IMPORTANTE: Debe retornar TEXTO descriptivo (ej: "Transferencia Bancolombia CTE",
   * "30 días", "Contado"), NO un valor monetario.
   */
  private extractCondicionesPago(
    kvMap: Map<string, string>,
    text: string,
  ): string {
    // 1. Buscar en KV (solo aliases específicos, NO "pago" genérico)
    const fromKv = this.findInKvMap(kvMap, [
      'condiciones de pago',
      'forma de pago',
      'terminos de pago',
      'términos de pago',
      'modalidad de pago',
      'payment terms',
      'medio de pago',
    ]);
    // Validar que sea texto, NO un monto de dinero
    if (fromKv && !this.looksLikeCurrency(fromKv)) return fromKv;

    // 2. Buscar en texto plano
    const fromText = this.findInText(text, [
      /(?:condiciones?\s*de\s*pago)[:\s]*\n?\s*(.{5,80}?)(?:\n|$)/i,
      /(?:forma\s*de\s*pago)[:\s]*\n?\s*(.{5,80}?)(?:\n|$)/i,
    ]);
    if (fromText && !this.looksLikeCurrency(fromText)) return fromText;

    // 3. Buscar términos comunes de pago en el texto
    const paymentTerms = this.findInText(text, [
      /(transferencia\s+\w+[\w\s]{0,30})/i,
      /(\d+\s*d[ií]as?\s*(?:h[aá]biles|calendario|cr[eé]dito|neto)?)/i,
      /(contado|contra\s*entrega|anticipado|cheque|cr[eé]dito)/i,
    ]);
    return paymentTerms || '';
  }

  /**
   * Verifica si un string parece un valor de moneda (no texto descriptivo).
   */
  private looksLikeCurrency(value: string): boolean {
    const cleaned = value.replace(/\s/g, '');
    return (
      /^\$?\d[\d.,]+$/.test(cleaned) ||
      /^COP\s*\d/i.test(cleaned) ||
      /^\d[\d.,]+\.\d{2}$/.test(cleaned)
    );
  }

  private extractTiempoEntrega(
    kvMap: Map<string, string>,
    text: string,
  ): string {
    const fromKv = this.findInKvMap(kvMap, [
      'tiempo de entrega',
      'plazo de entrega',
      'delivery time',
      'fecha de entrega',
      'lead time',
    ]);
    if (fromKv && !this.looksLikeCurrency(fromKv)) return fromKv;

    const fromText = this.findInText(text, [
      /(?:tiempo\s*de\s*entrega|plazo\s*(?:de\s*)?entrega)[:\s]+(.{3,60}?)(?:\n|$)/i,
      /(?:entrega\s*(?:en|a)?)[:\s]+(\d+\s*d[ií]as?\s*(?:h[aá]biles|calendario)?)/i,
    ]);
    return fromText || '';
  }

  // ═══════════════════════════════════════════════════════
  // Extracción de datos de crédito desde Observaciones OC
  // ═══════════════════════════════════════════════════════

  /**
   * Analiza el texto completo de la OC buscando indicadores de pago a crédito.
   * Extrae: F.PAGO, F.ENTREGA, CONSUMO, N° DOC, COBERTURA, dirección, contacto.
   * Genera automáticamente FechaPagoCredito[] estimadas basadas en las fechas detectadas.
   */
  extractCreditoData(
    kvMap: Map<string, string>,
    plainText: string,
    fechaEmisionOC: string,
    valorTotal: number,
  ): {
    esCredito: boolean;
    esContado: boolean;
    esContraEntrega: boolean;
    observacionesCompletas: string;
    fechaEntrega: string;
    plazosDias: number;
    fechasPago: FechaPagoCredito[];
    consumoDesde: string;
    consumoHasta: string;
    numeroDoc: string;
    cobertura: string;
    direccionEntrega: string;
    contactoEntrega: string;
  } {
    const result = {
      esCredito: false,
      esContado: false,
      esContraEntrega: false,
      observacionesCompletas: '',
      fechaEntrega: '',
      plazosDias: 30, // default
      fechasPago: [] as FechaPagoCredito[],
      consumoDesde: '',
      consumoHasta: '',
      numeroDoc: '',
      cobertura: '',
      direccionEntrega: '',
      contactoEntrega: '',
    };

    const text = plainText;
    const textUpper = text.toUpperCase();

    // ─── 1. Extraer bloque de Observaciones ───
    const obsBlock = this.extractObservacionesBlock(text);
    result.observacionesCompletas = obsBlock || '';

    // ─── 2. Detectar método de pago ───
    const pagoKvAliases = [
      'f.pago', 'f. pago', 'forma de pago', 'forma pago',
      'condiciones de pago', 'metodo de pago', 'método de pago', 'pago',
    ];

    // Buscar valor del campo de pago en KV o en texto plano
    let pagoValor = '';
    for (const alias of pagoKvAliases) {
      const val = this.findInKvMapExact(kvMap, alias);
      if (val) { pagoValor = val; break; }
    }
    if (!pagoValor) {
      const pagoMatch = text.match(
        /(?:f\.?\s*pago|forma\s*(?:de\s*)?pago|m[eé]todo\s*(?:de\s*)?pago|condici[oó]n(?:es)?\s*(?:de\s*)?pago)\s*[:=]\s*([^\n]{2,40})/i
      );
      if (pagoMatch) pagoValor = pagoMatch[1].trim();
    }

    // Crédito
    const creditoPatterns = [
      /F\.?\s*PAGO\s*[:=]\s*CR[EÉ]DITO/i,
      /FORMA\s*(?:DE\s*)?PAGO\s*[:=]\s*CR[EÉ]DITO/i,
      /CONDICI[OÓ]N(?:ES)?\s*(?:DE\s*)?PAGO\s*[:=]\s*CR[EÉ]DITO/i,
      /M[EÉ]TODO\s*(?:DE\s*)?PAGO\s*[:=]\s*CR[EÉ]DITO/i,
      /PAGO\s*[:=]\s*CR[EÉ]DITO/i,
    ];
    result.esCredito = creditoPatterns.some((p) => p.test(text))
      || /cr[eé]dito/i.test(pagoValor);

    // Contado
    if (!result.esCredito) {
      const contadoPatterns = [
        /F\.?\s*PAGO\s*[:=]\s*CONTADO/i,
        /FORMA\s*(?:DE\s*)?PAGO\s*[:=]\s*CONTADO/i,
        /CONDICI[OÓ]N(?:ES)?\s*(?:DE\s*)?PAGO\s*[:=]\s*CONTADO/i,
        /M[EÉ]TODO\s*(?:DE\s*)?PAGO\s*[:=]\s*CONTADO/i,
        /PAGO\s*[:=]\s*CONTADO/i,
      ];
      result.esContado = contadoPatterns.some((p) => p.test(text))
        || /contado/i.test(pagoValor);
    }

    // Contra entrega
    if (!result.esCredito && !result.esContado) {
      const contraEntregaPatterns = [
        /F\.?\s*PAGO\s*[:=]\s*CONTRA\s*[-]?\s*ENTREGA/i,
        /FORMA\s*(?:DE\s*)?PAGO\s*[:=]\s*CONTRA\s*[-]?\s*ENTREGA/i,
        /CONDICI[OÓ]N(?:ES)?\s*(?:DE\s*)?PAGO\s*[:=]\s*CONTRA\s*[-]?\s*ENTREGA/i,
        /M[EÉ]TODO\s*(?:DE\s*)?PAGO\s*[:=]\s*CONTRA\s*[-]?\s*ENTREGA/i,
        /PAGO\s*[:=]\s*CONTRA\s*[-]?\s*ENTREGA/i,
      ];
      result.esContraEntrega = contraEntregaPatterns.some((p) => p.test(text))
        || /contra[-\s]?entrega/i.test(pagoValor);
    }

    // ─── 3. Extraer F.ENTREGA (fecha de entrega) ───
    const entregaPatterns = [
      /F\.?\s*ENTREGA\s*[:=]\s*(.{5,40}?)(?:\n|$|CONFIRMAR)/i,
      /FECHA\s*(?:DE\s*)?ENTREGA\s*[:=]\s*(.{5,40}?)(?:\n|$)/i,
    ];
    for (const pattern of entregaPatterns) {
      const match = text.match(pattern);
      if (match) {
        result.fechaEntrega = match[1]
          .trim()
          .replace(/[\/\\]$/, '')
          .trim();
        break;
      }
    }

    // ─── 4. Extraer CONSUMO (período) ───
    const consumoPattern = /CONSUMO\s*[:=]\s*(.{5,80}?)(?:\n|$)/i;
    const consumoMatch = text.match(consumoPattern);
    if (consumoMatch) {
      const consumoText = consumoMatch[1].trim();
      // Intentar parsear "18 AL 20 FEB" o similar
      const rangoMatch = consumoText.match(
        /(\d{1,2})\s*(?:AL|A|-)\s*(\d{1,2})\s*(\w+)/i,
      );
      if (rangoMatch) {
        const mesStr = rangoMatch[3].toUpperCase().substring(0, 3);
        const anio = this.inferYear(fechaEmisionOC);
        const mesNum = this.monthNameToNumber(mesStr);
        if (mesNum > 0) {
          result.consumoDesde = `${anio}-${String(mesNum).padStart(2, '0')}-${String(+rangoMatch[1]).padStart(2, '0')}`;
          result.consumoHasta = `${anio}-${String(mesNum).padStart(2, '0')}-${String(+rangoMatch[2]).padStart(2, '0')}`;
        }
      }
    }

    // ─── 5. Extraer N° DOC ───
    const docMatch = text.match(/N[°º]?\s*DOC\.?\s*[:=]\s*(\S+)/i);
    if (docMatch) result.numeroDoc = docMatch[1].trim();

    // ─── 6. Extraer COBERTURA ───
    const coberturaMatch = text.match(/COBERTURA\s*[:=]\s*(\S+)/i);
    if (coberturaMatch) result.cobertura = coberturaMatch[1].trim();

    // ─── 7. Extraer Dirección de Entrega ───
    const dirMatch = text.match(
      /DIRECCI[OÓ]N\s*(?:DE\s*)?ENTREGA\s*[:=]\s*(.{10,150}?)(?:\n|CONSUMO|N[°º])/i,
    );
    if (dirMatch)
      result.direccionEntrega = dirMatch[1].trim().replace(/[|]$/, '').trim();

    // ─── 8. Extraer contacto de entrega ───
    const contactoMatch = text.match(
      /CONFIRMAR\s*ENTREGA\s*[:=]\s*(.{5,80}?)(?:\n|$|PARA\s)/i,
    );
    if (contactoMatch)
      result.contactoEntrega = contactoMatch[1]
        .trim()
        .replace(/[\/\\]$/, '')
        .trim();

    // ─── 9. Detectar plazo de crédito ───
    // Buscar "30 días", "60 días", etc.
    const plazoMatch = text.match(
      /(\d{2,3})\s*d[ií]as?\s*(?:cr[eé]dito|neto|calendario|h[aá]biles)?/i,
    );
    if (plazoMatch) {
      result.plazosDias = parseInt(plazoMatch[1], 10);
    }

    // ─── 10. Generar fechas de pago estimadas ───
    if (result.esCredito) {
      result.fechasPago = this.generarFechasPagoEstimadas(
        result.fechaEntrega,
        fechaEmisionOC,
        result.plazosDias,
        valorTotal,
      );
    }

    return result;
  }

  /**
   * Extrae el bloque de observaciones del texto OCR.
   */
  private extractObservacionesBlock(text: string): string {
    // Buscar sección "Observaciones:" hasta el final o hasta "Total Bruto"
    const obsMatch = text.match(
      /Observaciones?\s*[:=]\s*([\s\S]*?)(?:Total\s*Bruto|Total\s*a\s*Pagar|\*{3,}|$)/i,
    );
    if (obsMatch) return obsMatch[1].trim();

    // Fallback: buscar desde "DIRECCIÓN DE ENTREGA" si aparece
    const dirMatch = text.match(
      /(DIRECCI[OÓ]N\s*(?:DE\s*)?ENTREGA[\s\S]*?)(?:Total\s*Bruto|Total\s*a\s*Pagar|\*{3,}|$)/i,
    );
    if (dirMatch) return dirMatch[1].trim();

    return '';
  }

  /**
   * Busca una clave exacta en el mapa KV (case-insensitive).
   */
  private findInKvMapExact(kvMap: Map<string, string>, key: string): string {
    const keyLower = key.toLowerCase().trim();
    for (const [k, v] of kvMap.entries()) {
      if (k.toLowerCase().trim() === keyLower) return v.trim();
    }
    return '';
  }

  /**
   * Genera fechas de pago estimadas basadas en la fecha de entrega y el plazo.
   * Si plazo <= 30: una sola cuota.
   * Si plazo > 30: divide en porciones de 30 días.
   */
  private generarFechasPagoEstimadas(
    fechaEntrega: string,
    fechaEmision: string,
    plazosDias: number,
    valorTotal: number,
  ): FechaPagoCredito[] {
    // Determinar fecha base
    let fechaBase: Date | null = null;

    // Intentar parsear fechaEntrega como "13 FEB - 8:00AM" o "2026-02-13"
    if (fechaEntrega) {
      fechaBase = this.parseFechaFlexible(fechaEntrega, fechaEmision);
    }

    // Fallback: usar fechaEmision
    if (!fechaBase && fechaEmision) {
      fechaBase = this.parseFechaISO(fechaEmision);
    }

    // Fallback final: hoy
    if (!fechaBase) {
      fechaBase = new Date();
    }

    const cuotas: FechaPagoCredito[] = [];
    const numCuotas = Math.max(1, Math.ceil(plazosDias / 30));
    const montoPorCuota =
      valorTotal > 0 ? Math.round(valorTotal / numCuotas) : 0;

    for (let i = 0; i < numCuotas; i++) {
      const fechaPago = new Date(fechaBase);
      fechaPago.setDate(fechaPago.getDate() + 30 * (i + 1));

      cuotas.push({
        id: `cuota-${Date.now()}-${i}`,
        fechaPago: this.formatDateToISO(fechaPago),
        monto: montoPorCuota,
        observacion:
          numCuotas === 1
            ? `Pago a ${plazosDias} días`
            : `Cuota ${i + 1} de ${numCuotas} (cada 30 días)`,
        esEstimada: true,
      });
    }

    return cuotas;
  }

  /**
   * Parsea fechas flexibles como "13 FEB", "13 FEB - 8:00AM", "2026-02-13".
   */
  private parseFechaFlexible(
    fechaStr: string,
    fechaEmisionRef: string,
  ): Date | null {
    // Intentar ISO
    const isoDate = this.parseFechaISO(fechaStr);
    if (isoDate) return isoDate;

    // Intentar "DD MES" o "DD MES - HORA"
    const match = fechaStr.match(/(\d{1,2})\s*(\w{3,})/i);
    if (match) {
      const dia = parseInt(match[1], 10);
      const mesStr = match[2].toUpperCase().substring(0, 3);
      const mesNum = this.monthNameToNumber(mesStr);
      if (mesNum > 0 && dia >= 1 && dia <= 31) {
        const anio = this.inferYear(fechaEmisionRef);
        return new Date(anio, mesNum - 1, dia);
      }
    }

    return null;
  }

  private parseFechaISO(fechaStr: string): Date | null {
    if (!fechaStr) return null;
    // YYYY-MM-DD
    const match = fechaStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const d = new Date(+match[1], +match[2] - 1, +match[3]);
      if (!isNaN(d.getTime())) return d;
    }
    // DD/MM/YYYY
    const match2 = fechaStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (match2) {
      const d = new Date(+match2[3], +match2[2] - 1, +match2[1]);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  private formatDateToISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private inferYear(fechaEmisionRef: string): number {
    if (fechaEmisionRef) {
      const yearMatch = fechaEmisionRef.match(/(\d{4})/);
      if (yearMatch) return parseInt(yearMatch[1], 10);
    }
    return new Date().getFullYear();
  }

  private monthNameToNumber(name: string): number {
    const months: Record<string, number> = {
      ENE: 1,
      FEB: 2,
      MAR: 3,
      ABR: 4,
      MAY: 5,
      JUN: 6,
      JUL: 7,
      AGO: 8,
      SEP: 9,
      OCT: 10,
      NOV: 11,
      DIC: 12,
      JAN: 1,
      APR: 4,
      AUG: 8,
      DEC: 12,
    };
    return months[name.toUpperCase().substring(0, 3)] || 0;
  }

  // ═══════════════════════════════════════════════════════
  // Cálculo de confianza
  // ═══════════════════════════════════════════════════════

  private calcularConfianza(campos: {
    numeroOC: string;
    proveedor: string;
    nitProveedor: string;
    fechaEmision: string;
    valorTotal: number;
    valorAntesIva: number;
    responsableCompra: string;
    descripcionItems: string;
  }): number {
    const pesos: { campo: boolean; peso: number }[] = [
      {
        campo: !!campos.numeroOC && !campos.numeroOC.startsWith('OC-'),
        peso: 15,
      },
      { campo: !!campos.proveedor, peso: 20 },
      { campo: !!campos.nitProveedor, peso: 10 },
      { campo: !!campos.fechaEmision, peso: 10 },
      { campo: campos.valorTotal > 0, peso: 15 },
      {
        campo:
          campos.valorAntesIva > 0 &&
          campos.valorAntesIva !== campos.valorTotal,
        peso: 10,
      },
      { campo: !!campos.responsableCompra, peso: 5 },
      {
        campo: !!campos.descripcionItems && campos.descripcionItems.length > 5,
        peso: 15,
      },
    ];

    const totalPeso = pesos.reduce((s, p) => s + p.peso, 0);
    const pesoObtenido = pesos.reduce((s, p) => s + (p.campo ? p.peso : 0), 0);
    return Math.round((pesoObtenido / totalPeso) * 100);
  }
}
