import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, catchError } from 'rxjs';
import { environment } from '../../../../../environments/environment';

export interface OcrItemDetectado {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  subtotal: number;
}

export interface OcrCotizacionResult {
  // --- Proveedor ---
  proveedor: string;
  nit: string;
  direccionProveedor: string;
  telefonoProveedor: string;
  correoProveedor: string;
  contactoProveedor: string;
  ciudadProveedor: string;

  // --- Datos cotización ---
  numeroCotizacion: string;
  fecha: string;
  vigencia: string;
  condicionesPago: string;
  tiempoEntrega: string;
  formaPago: string;
  garantia: string;
  observaciones: string;

  // --- Valores ---
  valorSinIva: number;
  ivaPorcentaje: number;
  valorIva: number;
  descuento: number;
  retencion: number;
  valorTotal: number;
  subtotal: number;
  moneda: string;

  // --- Ítems ---
  items: OcrItemDetectado[];

  // --- Meta ---
  confianza: number;
  camposDetectados: string[];
  textoExtraido: string;

  // --- Document type ---
  tipoDocumento: string;
  facturaReferencia: string;
  vencimiento: string;
  valorEnLetras: string;
}

export interface OcrProgress {
  stage: 'uploading' | 'reading' | 'ocr' | 'extracting' | 'done';
  progress: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class OcrCotizacionService {
  private apiUrl = `${environment.apiUrl}/compras/ocr`;
  progress$ = new Subject<OcrProgress>();

  constructor(private http: HttpClient) {}

  procesarCotizacion(file: File): Observable<OcrCotizacionResult> {
    const formData = new FormData();
    formData.append('archivo', file);

    return this.http.post<OcrCotizacionResult>(`${this.apiUrl}/cotizacion`, formData).pipe(
      catchError(() => this.procesarLocal(file))
    );
  }

  private procesarLocal(file: File): Observable<OcrCotizacionResult> {
    return new Observable<OcrCotizacionResult>(observer => {
      this.emitProgress('reading', 10, 'Detectando tipo de archivo...');

      const reader = new FileReader();
      reader.onload = (e) => {
        this.emitProgress('ocr', 50, 'Extrayendo texto del documento...');
        
        if (file.type.startsWith('image/')) {
          this.processImage(e.target?.result as string, file, observer);
        } else if (file.type === 'application/pdf') {
          this.processPdf(e.target?.result as ArrayBuffer, observer);
        } else {
          const text = e.target?.result as string;
          this.emitProgress('extracting', 85, 'Analizando datos...');
          const result = this.extractPrice(text);
          this.emitProgress('done', 100, 'Completado');
          observer.next(result);
          observer.complete();
        }
      };

      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  private processImage(dataUrl: string, file: File, observer: any): void {
    import('tesseract.js').then((module: any) => {
      const { Tesseract } = module.default || module;
      const recognize = module.recognize || Tesseract?.recognize;
      
      if (recognize) {
        recognize(dataUrl, 'spa', { logger: () => {} })
          .then((result: any) => {
            const text = result.data?.text || result.text || '';
            this.emitProgress('extracting', 85, 'Analizando datos extraídos...');
            const extracted = this.extractPrice(text);
            this.emitProgress('done', 100, 'Completado');
            observer.next(extracted);
            observer.complete();
          })
          .catch(() => {
            observer.next(this.emptyResult());
            observer.complete();
          });
      } else {
        observer.next(this.emptyResult());
        observer.complete();
      }
    }).catch(() => {
      observer.next(this.emptyResult());
      observer.complete();
    });
  }

  private processPdf(buffer: ArrayBuffer, observer: any): void {
    import('pdfjs-dist').then((module: any) => {
      const pdfjs = module.default || module;
      if (!pdfjs.getDocument) {
        observer.next(this.emptyResult());
        observer.complete();
        return;
      }

      const pdf = pdfjs.getDocument(new Uint8Array(buffer));
      pdf.promise
        .then((doc: any) => {
          return doc.getPage(1).then((page: any) => {
            return page.getTextContent().then((content: any) => {
              const text = content.items?.map((item: any) => item.str).join(' ') || '';
              if (text.length > 20) {
                this.emitProgress('extracting', 85, 'Analizando datos...');
                const result = this.extractPrice(text);
                this.emitProgress('done', 100, 'Completado');
                observer.next(result);
              } else {
                observer.next(this.emptyResult());
              }
              observer.complete();
            });
          });
        })
        .catch(() => {
          observer.next(this.emptyResult());
          observer.complete();
        });
    }).catch(() => {
      observer.next(this.emptyResult());
      observer.complete();
    });
  }

  private extractPrice(text: string): OcrCotizacionResult {
    const campos: string[] = [];
    let confianza = 70;

    // Normalizar texto
    const t = text
      .replace(/\r\n/g, '\n')
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/\t+/g, '  ');

    // 1. Extraer PROVEEDOR (nombre)
    let proveedor = '';
    const provPatterns = [
      /^[A-Z\s]{10,60}(?=\n|NIT|N\.I\.T)/m,
      /Empresa[:\s]+([A-Z\s]{5,50})/i,
      /(?:Razón\s*Social|Comerciante)[:\s]+([A-Z\s]{5,50})/i
    ];
    
    for (const p of provPatterns) {
      const m = t.match(p);
      if (m) {
        const candidate = (m[1] || m[0]).trim().replace(/\s+/g, ' ');
        if (candidate.length > 5 && candidate.length < 100 && !/^\d/.test(candidate)) {
          proveedor = candidate;
          campos.push('Proveedor');
          confianza += 10;
          break;
        }
      }
    }

    // 2. Extraer PRECIOS - buscar subtotal (sin IVA) y total (con IVA)
    let valorTotal = 0;
    let valorSubtotal = 0; // valor sin IVA directo del documento
    let ivaPorcentaje = 19;
    let moneda = 'COP';

    // 2a. Buscar SUBTOTAL / SIN IVA explícito
    const subtotalPatterns = [
      /(?:sub\s*total|subtotal)[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/i,
      /(?:base\s*(?:gravable|imponible))[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/i,
      /(?:valor|precio)\s*(?:sin\s*iva|antes\s*de\s*iva|neto)[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/i,
    ];

    for (const p of subtotalPatterns) {
      const m = t.match(p);
      if (m) {
        const parsed = this.parseMoney(m[1].trim());
        if (parsed > 0) {
          valorSubtotal = parsed;
          campos.push('Subtotal');
          confianza += 15;
          break;
        }
      }
    }

    // 2b. Buscar TOTAL (con IVA)
    const totalPatterns = [
      /total\s*a\s*pagar[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/i,
      /total\s*general[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/i,
      /(?:^|\n)\s*TOTAL[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/im,
      /GRANDE\s*TOTAL[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/i,
      /total\s*(?:con\s*iva|iva\s*incl)[:\s]*(?:COP\s*)?[\$]?\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/i
    ];

    for (const p of totalPatterns) {
      const m = t.match(p);
      if (m) {
        const parsed = this.parseMoney(m[1].trim());
        if (parsed > 0) {
          valorTotal = parsed;
          campos.push('Precio Total');
          confianza += 20;
          break;
        }
      }
    }

    // Si no encontró total, buscar último valor grande
    if (valorTotal === 0) {
      const allPrices = [...t.matchAll(/[\$]\s*(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/g)];
      if (allPrices.length > 0) {
        const lastPrice = allPrices[allPrices.length - 1][1];
        const parsed = this.parseMoney(lastPrice);
        if (parsed > 100) {
          valorTotal = parsed;
          campos.push('Precio Total');
          confianza -= 10;
        }
      }
      if (valorTotal === 0) {
        const allNums = [...t.matchAll(/(\d{1,3}(?:[\.\s]\d{3})*(?:[,\.]\d{2})?)/g)];
        if (allNums.length > 0) {
          const lastNum = allNums[allNums.length - 1][1];
          const parsed = this.parseMoney(lastNum);
          if (parsed > 100) {
            valorTotal = parsed;
            campos.push('Precio Total');
            confianza -= 15;
          }
        }
      }
    }

    // 3. IVA
    const ivaMatch = t.match(/IVA[:\s]*(\d+)\s*%/i);
    if (ivaMatch) {
      ivaPorcentaje = parseInt(ivaMatch[1]) || 19;
      campos.push('IVA %');
      confianza += 5;
    }

    // 4. FECHA (opcional)
    let fecha = '';
    const datePatterns = [
      /(?:Fecha|Date)[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/
    ];
    
    for (const p of datePatterns) {
      const m = t.match(p);
      if (m) {
        fecha = m[1];
        campos.push('Fecha');
        break;
      }
    }

    // Calcular valores derivados según lo que encontramos
    let valorSinIva = 0;
    let valorIva = 0;

    if (valorSubtotal > 0 && valorTotal > 0) {
      // Encontró ambos: subtotal es sin IVA, total es con IVA
      valorSinIva = valorSubtotal;
      valorIva = valorTotal - valorSinIva;
      confianza += 10;
    } else if (valorSubtotal > 0 && valorTotal === 0) {
      // Solo subtotal sin IVA: calcular total
      valorSinIva = valorSubtotal;
      valorTotal = Math.round(valorSinIva * (1 + ivaPorcentaje / 100));
      valorIva = valorTotal - valorSinIva;
    } else if (valorTotal > 0) {
      // Solo total (con IVA): calcular sin IVA
      valorSinIva = Math.round(valorTotal / (1 + ivaPorcentaje / 100));
      valorIva = valorTotal - valorSinIva;
    }

    return {
      proveedor,
      nit: '',
      direccionProveedor: '',
      telefonoProveedor: '',
      correoProveedor: '',
      contactoProveedor: '',
      ciudadProveedor: '',
      numeroCotizacion: '',
      fecha,
      vigencia: '',
      condicionesPago: '',
      tiempoEntrega: '',
      formaPago: '',
      garantia: '',
      observaciones: '',
      valorSinIva,
      ivaPorcentaje,
      valorIva,
      descuento: 0,
      retencion: 0,
      valorTotal,
      subtotal: valorSinIva,
      moneda,
      items: [],
      confianza: Math.max(0, Math.min(100, confianza)),
      camposDetectados: campos,
      textoExtraido: t,
      tipoDocumento: 'COTIZACION',
      facturaReferencia: '',
      vencimiento: '',
      valorEnLetras: ''
    };
  }

  private parseMoney(s: string): number {
    if (!s || typeof s !== 'string') return 0;
    const cleaned = s.replace(/[^\d.,\-]/g, '').replace(/\s/g, '');
    if (!cleaned || cleaned === '-') return 0;

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    let amount = cleaned;
    if (lastComma > lastDot) {
      amount = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastDot === -1) {
      amount = cleaned.replace(/\./g, '');
    }

    return parseFloat(amount) || 0;
  }

  private emptyResult(): OcrCotizacionResult {
    return {
      proveedor: '', nit: '', direccionProveedor: '', telefonoProveedor: '',
      correoProveedor: '', contactoProveedor: '', ciudadProveedor: '',
      numeroCotizacion: '', fecha: '', vigencia: '', condicionesPago: '',
      tiempoEntrega: '', formaPago: '', garantia: '', observaciones: '',
      valorSinIva: 0, ivaPorcentaje: 19, valorIva: 0, descuento: 0,
      retencion: 0, valorTotal: 0, subtotal: 0, moneda: 'COP',
      items: [], confianza: 0, camposDetectados: [], textoExtraido: '',
      tipoDocumento: '', facturaReferencia: '', vencimiento: '', valorEnLetras: ''
    };
  }

  private emitProgress(stage: OcrProgress['stage'], progress: number, message: string): void {
    this.progress$.next({ stage, progress, message });
  }
}
