import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, catchError, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  ComparacionPrecios,
  ComprobantePagoOcr,
  EgresoResumen,
  OrdenCompraResumen,
  ProveedorSistema,
  ResultadoConciliacion,
  VerificacionProveedor,
} from '../models/comprobante-pago.model';
import { MovimientoBancario } from '../models/movimiento-bancario.model';

/** Respuesta del endpoint Textract del backend */
interface TextractResponse {
  plainText: string;
  tables: string[][][];
  keyValuePairs: { key: string; value: string }[];
  sheetNames: string[];
}

/** Campos de egreso/factura extraídos de una imagen o documento */
export interface EgresoOcrExtraido {
  numeroFactura: string | null;
  nit: string | null;
  proveedor: string | null;
  valor: number | null;
  fecha: string | null; // yyyy-MM-dd o null
  banco: string | null;
  /** Tarifa ReteICA por mil leída del documento (ej. 4.14) */
  tarifaIcaPorMil: number | null;
  /** Valor ReteICA leído del documento (si viene como monto) */
  reteIcaValor: number | null;
}

@Injectable({ providedIn: 'root' })
export class ComprobantePagoService {
  private readonly textractUrl = `${environment.apiUrl}/v1/textract`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Sube un archivo de comprobante de pago y lo analiza con el backend
   * (Textract para PDF/imágenes, Apache POI para Excel/Word).
   * Devuelve los campos extraídos del documento.
   * Siempre usa el backend real: el mock devolvía los mismos datos
   * falsos para cualquier archivo arrastrado.
   */
  analizarComprobante(file: File): Observable<ComprobantePagoOcr> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http
      .post<TextractResponse>(`${this.textractUrl}/upload-and-analyze`, formData)
      .pipe(
        map((resp) => this.parsearCamposOcr(resp)),
        catchError((err) => {
          console.error('Error al analizar comprobante:', err);
          return throwError(() => err);
        }),
      );
  }

  /**
   * Analiza una imagen/documento de egreso o factura y extrae los campos
   * para pre-llenar el formulario (factura, NIT, proveedor, valor, fecha).
   */
  analizarYExtraerEgreso(file: File): Observable<EgresoOcrExtraido> {
    return this.analizarComprobante(file).pipe(
      map((ocr) => {
        const ica = this.extraerIcaDocumento(ocr.keyValuePairs ?? [], ocr.textoCompleto ?? '');
        return {
          numeroFactura:
            this.buscarCampo(ocr.keyValuePairs ?? [], [
              'número de factura',
              'numero de factura',
              'num factura',
              'nro factura',
              'no. factura',
              'nro. factura',
              'factura no',
              'factura nro',
              'factura',
              'folio',
              'documento no',
            ]) ?? ocr.egreso,
          nit: ocr.nit ?? this.buscarCampo(ocr.keyValuePairs ?? [], ['nit']),
          proveedor: ocr.beneficiario ?? ocr.empresa,
          valor: ocr.valorPago,
          fecha: this.normalizarFecha(ocr.fecha),
          banco: ocr.banco,
          tarifaIcaPorMil: ica.tarifaPorMil,
          reteIcaValor: ica.valor,
        };
      }),
    );
  }

  /**
   * Extrae ReteICA del documento: pares clave-valor (ReteICA, ICA, rete ica...)
   * y líneas de texto ("ReteICA 4.14", "ICA $13.024", "4,14 por mil").
   * Número < 50 se interpreta como tarifa por mil; mayor, como valor.
   */
  private extraerIcaDocumento(
    kv: { key: string; value: string }[],
    texto: string,
  ): { tarifaPorMil: number | null; valor: number | null } {
    const clavesIca = [
      'reteica',
      'rete ica',
      'retencion ica',
      'retención ica',
      'retencion de ica',
      'ica retenido',
      'industria y comercio',
      'impuesto de industria',
    ];

    // 1) Pares clave-valor
    for (const p of kv) {
      const key = this.normalizarTexto(p.key);
      if (!clavesIca.some((c) => key.includes(c))) continue;
      const num = this.parseNumber(p.value ?? '');
      if (num === null) continue;
      if (Math.abs(num) < 50) return { tarifaPorMil: num, valor: null };
      return { tarifaPorMil: null, valor: num };
    }

    // 2) Líneas de texto plano
    for (const linea of texto.split('\n')) {
      const norm = this.normalizarTexto(linea);
      if (!clavesIca.some((c) => norm.includes(c))) continue;
      const porMil = /por\s*mil|‰|x\s*mil/i.test(linea);
      const m = linea.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})|\d+(?:[.,]\d{1,4})?)/);
      if (!m) continue;
      const num = this.parseNumber(m[1]);
      if (num === null) continue;
      if (porMil || Math.abs(num) < 50) return { tarifaPorMil: num, valor: null };
      return { tarifaPorMil: null, valor: num };
    }

    return { tarifaPorMil: null, valor: null };
  }

  /**
   * Normaliza fechas de documentos a yyyy-MM-dd.
   * Acepta yyyy-MM-dd, dd/MM/yyyy y dd-MM-yyyy.
   */
  private normalizarFecha(fecha: string | null): string | null {
    if (!fecha) return null;
    const f = fecha.trim().substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
    const m = f.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      return `${m[3]}-${mm}-${dd}`;
    }
    return null;
  }

  /**
   * Compara los datos extraídos del comprobante con el movimiento bancario.
   */
  compararConMovimiento(
    ocr: ComprobantePagoOcr,
    movimiento: MovimientoBancario,
  ): ResultadoConciliacion {
    const diferencias: string[] = [];

    // Comparar fecha
    const coincideFecha = this.compararFechas(ocr.fecha, movimiento.fechaPago);
    if (!coincideFecha) {
      diferencias.push(
        `Fecha CP: ${ocr.fecha ?? 'N/A'} ≠ Fecha Mov: ${movimiento.fechaPago}`,
      );
    }

    // Comparar OC
    const coincideOc = this.compararTextos(ocr.oc, movimiento.referencia);
    if (!coincideOc) {
      diferencias.push(
        `OC CP: ${ocr.oc ?? 'N/A'} ≠ Referencia: ${movimiento.referencia}`,
      );
    }

    // Comparar Egreso
    const coincideEgreso = !!ocr.egreso && ocr.egreso.trim().length > 0;
    if (!coincideEgreso) {
      diferencias.push('No se encontró número de egreso en el comprobante');
    }

    // Comparar valor
    const coincideValor = this.compararValores(ocr.valorPago, movimiento.valor);
    if (!coincideValor) {
      diferencias.push(
        `Valor CP: ${ocr.valorPago ?? 0} ≠ Valor Mov: ${movimiento.valor}`,
      );
    }

    const conciliado = coincideFecha && coincideOc && coincideEgreso && coincideValor;

    return {
      coincideFecha,
      coincideOc,
      coincideEgreso,
      coincideValor,
      conciliado,
      diferencias,
    };
  }

  // ─────────── Helpers internos ───────────

  private parsearCamposOcr(resp: TextractResponse): ComprobantePagoOcr {
    const kv = resp.keyValuePairs ?? [];
    const text = (resp.plainText ?? '').toLowerCase();

    // Primero buscar empresa para usar como contexto
    const empresa = this.buscarCampo(kv, ['empresa', 'razón social', 'razon social']);

    return {
      fecha: this.buscarCampo(kv, ['fecha', 'date', 'fecha de pago', 'fecha pago', 'fecha aplicación', 'fecha aplicacion']),
      oc: this.buscarCampo(kv, ['orden de compra', 'oc', 'o.c.', 'purchase order', 'no. oc', 'nro oc']),
      egreso: this.buscarCampo(kv, ['egreso', 'no. egreso', 'comprobante de egreso', 'nro egreso', 'num egreso']),
      valorPago: this.buscarValorNumerico(kv, text),
      referencia: this.buscarCampo(kv, ['referencia', 'ref', 'reference', 'nombre del pago', 'secuencia']),
      beneficiario: this.buscarCampo(kv, ['beneficiario', 'proveedor', 'a nombre de', 'payee', 'nombre beneficiario']),
      banco: this.buscarCampo(kv, ['banco', 'bank', 'entidad bancaria', 'entidad']),
      textoCompleto: resp.plainText ?? '',
      keyValuePairs: kv,
      tables: resp.tables ?? null,

      // ── Campos Bancolombia ──
      empresa: empresa,
      nit: this.buscarNitEmpresa(kv, empresa),
      nombrePago: this.buscarCampo(kv, ['nombre del pago', 'nombre pago']),
      hora: this.buscarCampo(kv, ['hora', 'hour', 'time']),
      secuencia: this.buscarCampo(kv, ['secuencia', 'sec', 'consecutivo']),
      tipoPago: this.buscarCampo(kv, ['tipo de pago', 'tipo pago', 'medio de pago', 'medio pago']),
      // Para validación contra el sistema necesitamos la cuenta del beneficiario.
      // En documentos BBVA suele venir como clave exacta "Cuenta".
      cuentaDebitar:
        this.extraerCuentaBeneficiario(kv, resp.tables ?? null) ??
        this.buscarCampo(kv, [
          'número de cuenta a debitar',
          'numero de cuenta a debitar',
          'cuenta a debitar',
          'cuenta débito',
          'cuenta debito',
          'número de cuenta',
        ]),
      impresoPor: this.buscarCampo(kv, ['impreso por', 'generado por', 'usuario']),
      totalRegistros: this.buscarCampo(kv, ['total registros del lote', 'total registros', 'registros del lote']),
      valorTotalPago: this.buscarCampo(kv, ['valor total del pago', 'valor total pago', 'total del pago']),
      registrosProcesados: this.buscarCampo(kv, ['registros procesados', 'procesados']),
    };
  }

  /**
   * Busca el NIT de la empresa filtrando el NIT de Bancolombia.
   * Intenta encontrar el NIT que esté asociado a la empresa, no el del banco.
   *
   * Estrategia:
   * 1) Recolecta todos los NITs candidatos del documento
   * 2) Filtra el NIT de Bancolombia (890.903.938-8) en varias formas
   * 3) Si quedan candidatos válidos, retorna el primero (o el último si fue filtrado el primero)
   * 4) Si todos fueron filtrados, retorna el último (asumiendo que el NIT real viene después del logo)
   */
  private buscarNitEmpresa(kv: { key: string; value: string }[], empresa: string | null): string | null {
    const nitCandidatos = kv.filter((p) => p.key.toLowerCase().includes('nit') && p.value.trim());

    if (nitCandidatos.length === 0) return null;

    // NITs conocidos de Bancolombia a filtrar (ej: 890.903.938-8)
    // Incluir múltiples variaciones: con puntos, sin puntos, con guión, sin guión
    const nitsExcluidos = [
      '890.903.938-8',  // Formato estándar
      '890.903.938',    // Sin guión
      '8909039388',     // Sin puntos ni guión
      '890903938',      // Variación
      '890-903-938-8',  // Guiones
      '890 903 938 8',  // Espacios
    ];

    // Normalizar (remover puntos, espacios, guiones) para comparación
    const nitsExcluidosNormalizados = nitsExcluidos.map((n) => n.replace(/[\s.\-]/g, '').toLowerCase());

    // Filtrar NITs de Bancolombia
    const nitsFiltered = nitCandidatos.filter((p) => {
      const valNorm = p.value.trim().replace(/[\s.\-]/g, '').toLowerCase();
      return !nitsExcluidosNormalizados.some((excluded) => valNorm.includes(excluded) || excluded.includes(valNorm));
    });

    if (nitsFiltered.length > 0) {
      return nitsFiltered[0].value.trim();
    }

    // Si todos fueron filtrados pero hay candidatos, retornar el último
    // (asumiendo que el NIT real viene después del logo de Bancolombia en el documento)
    if (nitCandidatos.length > 0) {
      return nitCandidatos[nitCandidatos.length - 1].value.trim();
    }

    return null;
  }

  private buscarCampo(kv: { key: string; value: string }[], claves: string[]): string | null {
    for (const c of claves) {
      const found = kv.find((p) => p.key.toLowerCase().includes(c.toLowerCase()));
      if (found && found.value.trim()) {
        return found.value.trim();
      }
    }
    return null;
  }

  private buscarValorNumerico(kv: { key: string; value: string }[], text: string): number | null {
    const clavesPrioritarias = [
      'importe total',
      'importe',
      'valor total del pago',
      'valor total pago',
      'valor pagado',
      'valor pago',
      'monto desembolsado',
      'total pagado',
      'amount',
      'monto',
      'total',
      'valor',
    ];

    // 1) Priorizar pares clave/valor monetarios y descartar contadores (ej. "Número Total de órdenes: 1")
    const scored = kv
      .map((p) => {
        const key = (p.key ?? '').toLowerCase();
        const value = p.value ?? '';
        const parsed = this.parseNumber(value);
        if (parsed === null) return null;

        let score = 0;
        const idx = clavesPrioritarias.findIndex((c) => key.includes(c));
        if (idx >= 0) score += 200 - idx * 10;

        if (this.esClaveConteo(key)) score -= 300;
        if (/cop|\$/.test(value.toLowerCase())) score += 40;
        if (/[.,]\d{2}\b/.test(value)) score += 25;
        if (/\d{1,3}(?:[.,]\d{3})+/.test(value)) score += 25;

        return { parsed, score };
      })
      .filter((x): x is { parsed: number; score: number } => x !== null)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score > -50) {
      return scored[0].parsed;
    }

    // Fallback: buscar en texto plano un patrón de moneda
    const moneyMatches = text.match(/(?:cop\s*)?\$?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/gi) ?? [];
    for (const raw of moneyMatches) {
      const parsed = this.parseNumber(raw);
      if (parsed !== null && parsed > 0) {
        return parsed;
      }
    }
    return null;
  }

  private extraerCuentaBeneficiario(
    kv: { key: string; value: string }[],
    tables: string[][][] | null,
  ): string | null {
    // 1) Clave exacta/semántica de cuenta del beneficiario
    const fromKv = kv.find((p) => {
      const key = this.normalizarTexto(p.key);
      return (
        key === 'cuenta' ||
        key.includes('cuenta beneficiario') ||
        key.includes('cuenta del beneficiario') ||
        key.includes('cuenta proveedor')
      );
    });
    if (fromKv?.value?.trim()) {
      return fromKv.value.trim();
    }

    // 2) Extraer columna "Cuenta" en tablas de pagos a proveedores
    if (tables) {
      for (const table of tables) {
        if (!table?.length) continue;
        const header = table[0]?.map((h) => this.normalizarTexto(h));
        if (!header?.length) continue;

        const cuentaIdx = header.findIndex((h) => h === 'cuenta' || h.includes('cuenta'));
        const bancoIdx = header.findIndex((h) => h.includes('banco'));
        const importeIdx = header.findIndex((h) => h.includes('importe') || h.includes('valor'));

        if (cuentaIdx < 0) continue;

        for (let i = 1; i < table.length; i++) {
          const row = table[i] ?? [];
          const cuenta = row[cuentaIdx]?.trim();
          const banco = bancoIdx >= 0 ? row[bancoIdx]?.trim() : '';
          const importe = importeIdx >= 0 ? row[importeIdx]?.trim() : '';

          // Evitar filas resumen (numero total de ordenes, etc.)
          const rowText = this.normalizarTexto(row.join(' '));
          const isResumen = rowText.includes('numero total de ordenes') || rowText.includes('importe total');
          if (isResumen) continue;

          if (cuenta && /\d{6,}/.test(cuenta) && (banco || importe)) {
            return cuenta;
          }
        }
      }
    }

    return null;
  }

  private esClaveConteo(key: string): boolean {
    const k = this.normalizarTexto(key);
    return (
      k.includes('numero total de ordenes') ||
      k.includes('numero de ordenes') ||
      k.includes('total registros') ||
      k.includes('registros procesados') ||
      k.includes('pagina') ||
      k.includes('clave')
    );
  }

  private normalizarTexto(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private parseNumber(str: string): number | null {
    if (!str) return null;
    // Remover símbolos de moneda y espacios
    const cleaned = str.replace(/[^0-9.,]/g, '').trim();
    if (!cleaned) return null;

    // Manejar formato colombiano: 1.234.567,89
    let normalized: string;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      if (lastComma > lastDot) {
        // Formato: 1.234.567,89
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato: 1,234,567.89
        normalized = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned;
    }

    const val = parseFloat(normalized);
    return isNaN(val) ? null : val;
  }

  private compararFechas(fecha1: string | null, fecha2: string | null): boolean {
    if (!fecha1 || !fecha2) return false;
    const norm1 = fecha1.replace(/\//g, '-').trim();
    const norm2 = fecha2.replace(/\//g, '-').trim();
    return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
  }

  private compararTextos(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    const na = a.replace(/\s+/g, '').toLowerCase();
    const nb = b.replace(/\s+/g, '').toLowerCase();
    return na.includes(nb) || nb.includes(na);
  }

  private compararValores(a: number | null, b: number | null): boolean {
    if (a === null || b === null) return false;
    // Tolerancia de $1 por redondeos
    return Math.abs(a - b) < 1;
  }

  // ─────────── Buscar OC y Egreso ───────────

  /**
   * Busca la orden de compra asociada a un movimiento por su referencia.
   */
  buscarOrdenCompra(referencia: string): Observable<OrdenCompraResumen | null> {
    // Intentar extraer tramiteId de la referencia (ej: OC-2026-0045 => buscar por número)
    return this.http
      .get<any[]>(`${environment.apiUrl}/compras/tramite/1/ordenes`)
      .pipe(
        map((ordenes) => {
          const match = ordenes.find(
            (o: any) =>
              o.numeroOC && referencia &&
              (o.numeroOC.toLowerCase().includes(referencia.toLowerCase()) ||
               referencia.toLowerCase().includes(o.numeroOC?.toLowerCase() ?? '')),
          );
          if (!match) return null;
          return {
            id: match.id,
            numeroOC: match.numeroOC ?? '',
            proveedor: match.proveedor ?? null,
            valorTotal: match.valorTotal ? Number(match.valorTotal) : 0,
            fechaEmision: match.fechaEmision ?? null,
          } as OrdenCompraResumen;
        }),
        catchError((err) => {
          console.error('Error al buscar orden de compra:', err);
          return of(null);
        }),
      );
  }

  /**
   * Busca egresos del backend y filtra por referencia o valor.
   */
  buscarEgreso(referencia: string, valor: number): Observable<EgresoResumen | null> {
    return this.http
      .get<any>(`${environment.apiUrl}/tesoreria/egresos?size=100`)
      .pipe(
        map((resp) => {
          const items = resp?.content ?? resp?.data ?? resp ?? [];
          const match = (items as any[]).find(
            (e: any) =>
              (e.numero &&
                referencia &&
                (e.numero.toLowerCase().includes(referencia.toLowerCase()) ||
                 referencia.toLowerCase().includes(e.numero?.toLowerCase() ?? ''))) ||
              (e.valor && Math.abs(Number(e.valor) - valor) < 1),
          );
          if (!match) return null;
          return {
            id: match.id,
            numero: match.numero ?? '',
            beneficiario: match.beneficiario ?? null,
            valor: match.valor ? Number(match.valor) : 0,
            fecha: match.fecha ?? null,
            estado: match.estado ?? null,
          } as EgresoResumen;
        }),
        catchError((err) => {
          console.error('Error al buscar egreso:', err);
          return of(null);
        }),
      );
  }

  /**
   * Compara los precios entre la Orden de Compra, el Egreso y el Comprobante de Pago.
   */
  compararPrecios(
    movimiento: MovimientoBancario,
    ocr: ComprobantePagoOcr,
    oc: OrdenCompraResumen | null,
    egreso: EgresoResumen | null,
  ): ComparacionPrecios {
    const valorOC = oc?.valorTotal ?? null;
    const valorEgreso = egreso?.valor ?? null;
    const valorCP = ocr.valorPago;
    const valorMov = movimiento.valor;

    const diferencias: string[] = [];

    // OC vs Egreso
    const coincideOcEgreso =
      valorOC !== null && valorEgreso !== null && Math.abs(valorOC - valorEgreso) < 1;
    if (valorOC !== null && valorEgreso !== null && !coincideOcEgreso) {
      diferencias.push(`Valor OC ($${valorOC.toLocaleString()}) ≠ Valor Egreso ($${valorEgreso.toLocaleString()})`);
    }

    // OC vs CP
    const coincideOcCp =
      valorOC !== null && valorCP !== null && Math.abs(valorOC - valorCP) < 1;
    if (valorOC !== null && valorCP !== null && !coincideOcCp) {
      diferencias.push(`Valor OC ($${valorOC.toLocaleString()}) ≠ Valor CP ($${valorCP.toLocaleString()})`);
    }

    // Egreso vs CP
    const coincideEgresoCp =
      valorEgreso !== null && valorCP !== null && Math.abs(valorEgreso - valorCP) < 1;
    if (valorEgreso !== null && valorCP !== null && !coincideEgresoCp) {
      diferencias.push(`Valor Egreso ($${valorEgreso.toLocaleString()}) ≠ Valor CP ($${valorCP.toLocaleString()})`);
    }

    // Si falta algún dato
    if (valorOC === null) diferencias.push('No se encontró Orden de Compra para comparar');
    if (valorEgreso === null) diferencias.push('No se encontró Egreso para comparar');
    if (valorCP === null) diferencias.push('El comprobante no tiene valor extraído');

    const todosCoinciden =
      coincideOcEgreso && coincideOcCp && coincideEgresoCp;

    return {
      valorOC,
      valorEgreso,
      valorCP,
      valorMovimiento: valorMov,
      coincideOcEgreso,
      coincideOcCp,
      coincideEgresoCp,
      todosCoinciden,
      diferencias,
      ordenCompra: oc,
      egreso,
    };
  }

  // ─────────── Buscar Proveedor en el Sistema ───────────

  /**
   * Busca un proveedor en el sistema por nombre o NIT.
   */
  buscarProveedorEnSistema(query: string): Observable<ProveedorSistema | null> {
    // Try by NIT first, then by name
    return this.http
      .get<any>(`${environment.apiUrl}/proveedores/buscar?q=${encodeURIComponent(query)}`)
      .pipe(
        map((resp) => {
          const proveedores = Array.isArray(resp) ? resp : [resp];
          if (proveedores.length === 0) return null;
          const p = proveedores[0];
          return {
            id: p.id,
            nombreProveedor: p.nombreProveedor ?? '',
            nit: p.nit ?? null,
            numeroCuenta: p.numeroCuenta ?? null,
            banco: p.banco ?? null,
            formaPago: p.formaPago ?? null,
            condicionesPago: p.condicionesPago ?? null,
            correoElectronico: p.correoElectronico ?? null,
            estado: p.estado ?? null,
          } as ProveedorSistema;
        }),
        catchError(() => of(null)),
      );
  }

  /**
   * Compara el proveedor del pago (OC/CP) contra el registrado en el sistema.
   */
  verificarProveedor(
    proveedorOC: string | null,
    proveedorCP: string | null,
    proveedorSistema: ProveedorSistema | null,
    bancoCP: string | null,
    cuentaCP: string | null,
  ): VerificacionProveedor {
    const diferencias: string[] = [];

    // Compare names
    const coincideNombre = this.compararNombresProveedor(
      proveedorOC, proveedorCP, proveedorSistema?.nombreProveedor ?? null,
    );
    if (!coincideNombre) {
      diferencias.push(
        `Proveedor OC: "${proveedorOC ?? 'N/A'}" ≠ Proveedor Sistema: "${proveedorSistema?.nombreProveedor ?? 'N/A'}"`,
      );
    }

    // Compare bank
    const coincideBanco = this.compararTextos(
      bancoCP, proveedorSistema?.banco ?? null,
    );
    if (!coincideBanco && bancoCP && proveedorSistema?.banco) {
      diferencias.push(
        `Banco CP: "${bancoCP}" ≠ Banco Sistema: "${proveedorSistema.banco}"`,
      );
    }

    // Compare account number
    const coincideCuenta = this.compararCuentas(
      cuentaCP, proveedorSistema?.numeroCuenta ?? null,
    );
    if (!coincideCuenta && cuentaCP && proveedorSistema?.numeroCuenta) {
      diferencias.push(
        `Cuenta CP: "${cuentaCP}" ≠ Cuenta Sistema: "${proveedorSistema.numeroCuenta}"`,
      );
    }

    if (!proveedorSistema) {
      diferencias.push('No se encontró el proveedor registrado en el sistema');
    }

    const todoCorrecto = coincideNombre && coincideBanco && coincideCuenta && !!proveedorSistema;

    return {
      proveedorOC,
      proveedorCP,
      proveedorSistema,
      coincideNombre,
      coincideBanco,
      coincideCuenta,
      todoCorrecto,
      diferencias,
    };
  }

  private compararNombresProveedor(a: string | null, b: string | null, c: string | null): boolean {
    if (!a && !b) return false;
    const normalize = (s: string | null) => s?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
    const na = normalize(a);
    const nb = normalize(b);
    const nc = normalize(c);

    // Any pair matches
    if (nc && (nc.includes(na) || na.includes(nc) || nc.includes(nb) || nb.includes(nc))) {
      return true;
    }
    return false;
  }

  private compararCuentas(a: string | null, b: string | null): boolean {
    if (!a || !b) return !a && !b;
    const na = a.replace(/[\s\-\.]/g, '');
    const nb = b.replace(/[\s\-\.]/g, '');
    return na === nb || na.includes(nb) || nb.includes(na);
  }

}
