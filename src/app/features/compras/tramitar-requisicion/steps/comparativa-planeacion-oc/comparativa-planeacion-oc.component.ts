import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import {
  TramiteRequisicion,
  OrdenCompraCargada,
} from '../../models/tramitar-requisicion.model';
import {
  UnitConversionService,
  UnitDefinition,
  ConversionResult,
  UnitCategory,
} from '../../services/unit-conversion.service';

export interface ProductoPlaneacion {
  codigo: string;
  producto: string;
  cantidad: number;
  unidadMedida: string;
  valorUnitario: number;
  valorTotal: number;
  kg: number;
}

export interface ProductoOC {
  codigo: string;
  producto: string;
  cantidad: number;
  unidadMedida: string;
  valorUnitario: number;
  valorTotal: number;
  kg: number;
  ordenId: string;
  proveedor: string;
}

export type EstadoMatch = 'COINCIDE' | 'DIFERENTE' | 'SOLO_PLAN' | 'SOLO_OC';

export interface ProductoMatchResult {
  productoPlaneacion: ProductoPlaneacion | null;
  productoOC: ProductoOC | null;
  estado: EstadoMatch;
  diferencias: string[];
  conversionUnidad: ConversionResult | null;
  cantidadConvertidaOC: number | null;
  coincideCantidad: boolean;
  coincideUnidad: boolean;
  porcentajeCumplimiento: number;
  cantidadOCTotal: number;
}

export interface ResultadoComparativa {
  matchProductos: ProductoMatchResult[];
  totalPlaneacion: number;
  totalOC: number;
  productosCoinciden: number;
  productosDiferentes: number;
  soloEnPlaneacion: number;
  soloEnOC: number;
  porcentajeCoincidencia: number;
}

/** Enlace manual entre un producto de planeación y uno de OC */
export interface ManualLink {
  planIndex: number;
  ocIndex: number;
  planProducto: string;
  ocProducto: string;
}

export type TipoCambioUnidad = 'AUTOMATICA' | 'MANUAL';

export interface CambioUnidad {
  productoNombre: string;
  productoIndex: number;
  unidadOriginal: string;
  unidadNueva: string;
  cantidadOriginal: number;
  cantidadConvertida: number;
  factorConversion: number;
  tipoCambio: TipoCambioUnidad;
  categoria: string;
  fecha: string;
  usuario: string;
  comentario?: string;
}

interface HojaExcel {
  nombre: string;
  encabezados: string[];
  filas: string[][];
  totalFilas: number;
  kvPairs?: { key: string; value: string }[];
}

interface ArchivoOCR {
  nombre: string;
  tamano: string;
  hojas: HojaExcel[];
  kvPairs: { key: string; value: string }[];
  hojaActiva: number;
}

interface DatosOCR {
  archivos: ArchivoOCR[];
}

@Component({
  selector: 'app-comparativa-planeacion-oc',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './comparativa-planeacion-oc.component.html',
  styleUrls: ['./comparativa-planeacion-oc.component.scss'],
})
export class ComparativaPlaneacionOcComponent implements OnInit {
  @Input() tramite!: TramiteRequisicion;
  @Output() completed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  loaded = signal(false);
  loading = signal(false);
  extractingOC = signal(false);
  extractProgress = signal(0);

  productosPlaneacion = signal<ProductoPlaneacion[]>([]);
  productosOC = signal<ProductoOC[]>([]);
  resultado = signal<ResultadoComparativa | null>(null);
  matchPercentage = signal(0);
  comparisonDone = signal(false);
  showConversionDetail = signal<number | null>(null);

  // ── Edición de unidades ──
  editingUnitIndex = signal<number | null>(null);
  editingUnitValue = signal('');
  cambiosUnidad = signal<CambioUnidad[]>([]);
  savingChanges = signal(false);
  savedSuccessfully = signal(false);

  // ── Borrador ──
  savingDraft = signal(false);
  draftSaved = signal(false);

  // ── Comentarios en cambios ──
  editingCommentIndex = signal<number | null>(null);
  editingCommentValue = signal('');

  productosIncompletos = computed(() => {
    const resultado = this.resultado();
    if (!resultado) return [];
    return resultado.matchProductos.filter(
      m => m.productoPlaneacion && m.porcentajeCumplimiento < 100
    );
  });

  allUnits: UnitDefinition[] = [];
  unitCategories: UnitCategory[] = [];

  totalPlan = computed(() =>
    this.productosPlaneacion().reduce((s, p) => s + (p.valorTotal || 0), 0)
  );

  totalOC = computed(() =>
    this.productosOC().reduce((s, p) => s + (p.valorTotal || 0), 0)
  );

  diferenciaPrecio = computed(() => this.totalOC() - this.totalPlan());

  porcentajeDiferencia = computed(() => {
    const plan = this.totalPlan();
    if (plan === 0) return 0;
    return ((this.totalOC() - plan) / plan) * 100;
  });

  coberturaPreciosPct = computed(() => {
    const plan = this.totalPlan();
    if (plan === 0) return 0;
    return Math.min(100, (this.totalOC() / plan) * 100);
  });

  coberturaItemsPct = computed(() => {
    const planCount = this.productosPlaneacion().length;
    if (planCount === 0) return 0;
    return Math.min(100, (this.productosOC().length / planCount) * 100);
  });

  filteredUnitsForEdit = computed(() => {
    const idx = this.editingUnitIndex();
    if (idx === null) return this.allUnits;
    const matches = this.resultado()?.matchProductos;
    if (!matches?.[idx]?.productoOC) return this.allUnits;
    const currentUnit = matches[idx].productoOC!.unidadMedida;
    const key = this.unitService.resolveUnitKey(currentUnit);
    if (!key) return this.allUnits;
    const unit = this.unitService.getUnit(key);
    if (!unit) return this.allUnits;
    return this.unitService.getUnitsByCategory(unit.category);
  });

  // ── Modal para ver OC ──
  showOrdenModal = signal(false);
  ordenModalData = signal<{ numeroOC: string; proveedor: string; url?: string } | null>(null);

  // ── Matching manual de productos ──
  manualMatchMode = signal(false);
  manualLinks = signal<ManualLink[]>([]);
  selectedPlanIndex = signal<number | null>(null);
  selectedOCIndex = signal<number | null>(null);

  constructor(
    private http: HttpClient,
    private unitService: UnitConversionService,
  ) {
    this.allUnits = this.unitService.getAllUnits();
    this.unitCategories = this.unitService.getCategories();
  }

  ngOnInit(): void {
    // Restaurar borrador si existe y los datos OC no son todos por defecto (cantidad=1, unidad=UND)
    const borrador = this.tramite.comparativaBorrador;
    if (borrador?.productosPlaneacion?.length || borrador?.productosOC?.length) {
      const ocItems: ProductoOC[] = borrador.productosOC || [];
      const isStaleOC = ocItems.length > 0 &&
        ocItems.every(p => p.cantidad === 1 && p.unidadMedida === 'UND');

      if (!isStaleOC) {
        // Borrador válido — restaurar
        if (borrador.productosPlaneacion) this.productosPlaneacion.set(borrador.productosPlaneacion);
        if (borrador.productosOC) this.productosOC.set(borrador.productosOC);
        if (borrador.cambiosUnidad) this.cambiosUnidad.set(borrador.cambiosUnidad);
        if (borrador.resultado) {
          this.resultado.set(borrador.resultado);
          this.comparisonDone.set(true);
          this.matchPercentage.set(borrador.resultado.porcentajeCoincidencia ?? 0);
        }
        setTimeout(() => this.loaded.set(true), 120);
        return;
      }
      // Borrador obsoleto (todos los ítems OC tienen valores por defecto) — ignorar y re-extraer
      console.info('[Comparativa] Borrador con datos OC obsoletos detectado, re-extrayendo...');
    }
    this.extractProductosPlaneacion();
    this.extractProductosOC();
    setTimeout(() => this.loaded.set(true), 120);
  }

  private extractProductosPlaneacion(): void {
    const raw = this.tramite.requisicion.datosAdicionales;
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.datosOCR) return;

      const ocrData: DatosOCR =
        typeof parsed.datosOCR === 'string'
          ? JSON.parse(parsed.datosOCR)
          : parsed.datosOCR;

      const productos: ProductoPlaneacion[] = [];

      for (const archivo of ocrData.archivos || []) {
        for (const hoja of archivo.hojas || []) {
          const headers = hoja.encabezados.map(h => h.toLowerCase().trim());
          const colCodigo = this.findCol(headers, ['código', 'codigo', 'cod', 'ref', 'referencia', 'item', 'sku']);
          const colProducto = this.findCol(headers, ['producto', 'descripción', 'descripcion', 'detalle', 'concepto', 'artículo', 'articulo', 'nombre', 'material']);
          const colCantidad = this.findCol(headers, ['cantidad', 'cant', 'qty', 'unidades', 'cant.']);
          const colUnidad = this.findCol(headers, ['unidad de medida', 'unidad medida', 'unidad', 'und', 'u.m.', 'um', 'medida', 'presentación', 'presentacion']);
          let colValorUni = this.findCol(headers, ['valor unitario', 'vr unitario', 'vr. unitario', 'vr. unit', 'vr unit', 'precio unitario', 'precio unit', 'v. unitario', 'vlr unitario', 'vlr unit', 'vlr. unit', 'costo unitario', 'precio']);
          let colValorTotal = this.findCol(headers, ['valor total', 'vr total', 'vr. total', 'v. total', 'vlr total', 'vlr. total', 'total', 'subtotal', 'importe', 'costo']);
          const colKg = this.findCol(headers, ['kg', 'peso', 'kilos', 'kilogramos', 'peso kg']);

          // Evitar colisión entre colValorUni y colValorTotal
          if (colValorUni >= 0 && colValorUni === colValorTotal) {
            // Buscar la última columna numérica como total
            colValorTotal = -1;
            for (let i = headers.length - 1; i >= 0; i--) {
              if (i !== colValorUni && (headers[i].includes('total') || headers[i].includes('importe'))) {
                colValorTotal = i;
                break;
              }
            }
          }
          // Evitar colisión con columna de unidad
          if (colValorUni >= 0 && colValorUni === colUnidad) colValorUni = -1;
          if (colValorTotal >= 0 && colValorTotal === colUnidad) colValorTotal = -1;

          for (const fila of hoja.filas || []) {
            const productoName = this.getCell(fila, colProducto);
            if (!productoName || productoName.length < 2) continue;

            const cantidad = this.parseNumber(this.getCell(fila, colCantidad));
            if (cantidad === 0) continue;

            let unidadMedida = this.getCell(fila, colUnidad) || 'UND';
            // Validar que la unidad no sea un texto largo (posible error de OCR)
            if (unidadMedida.length > 15 || /\d{4}/.test(unidadMedida)) {
              unidadMedida = 'UND';
            }

            let valorUnitario = this.parseNumber(this.getCell(fila, colValorUni));
            let valorTotal = this.parseNumber(this.getCell(fila, colValorTotal));

            // Calcular valores faltantes
            if (valorUnitario === 0 && valorTotal > 0 && cantidad > 0) {
              valorUnitario = Math.round(valorTotal / cantidad);
            }
            if (valorTotal === 0 && valorUnitario > 0 && cantidad > 0) {
              valorTotal = Math.round(valorUnitario * cantidad);
            }

            productos.push({
              codigo: this.getCell(fila, colCodigo),
              producto: productoName,
              cantidad,
              unidadMedida,
              valorUnitario,
              valorTotal,
              kg: this.parseNumber(this.getCell(fila, colKg)),
            });
          }
        }
      }

      this.productosPlaneacion.set(productos);
    } catch { /* parsing error — no planeacion products */ }
  }

  private extractProductosOC(): void {
    const ordenes = this.tramite.ordenesCargadas;
    if (!ordenes?.length) return;

    this.extractingOC.set(true);
    this.extractProgress.set(0);

    const productos: ProductoOC[] = [];

    // ── Fast path: use JSON-structured descripcionItems (new OCR format) ──
    const ordenesNeedingBackend: OrdenCompraCargada[] = [];
    for (const orden of ordenes) {
      const desc = (orden.descripcionItems || '').trim();
      if (desc.startsWith('{"__items":')) {
        try {
          const parsed: { __items: Array<{
            codigo?: string; producto: string; cantidad: number;
            unidadMedida?: string; valorUnitario?: number; valorTotal?: number;
          }> } = JSON.parse(desc);
          if (Array.isArray(parsed.__items) && parsed.__items.length > 0) {
            for (const item of parsed.__items) {
              let vUnit = item.valorUnitario || 0;
              let vTotal = item.valorTotal || 0;
              const cant = item.cantidad || 1;
              // Calcular valores faltantes
              if (vUnit === 0 && vTotal > 0 && cant > 0) vUnit = Math.round(vTotal / cant);
              if (vTotal === 0 && vUnit > 0 && cant > 0) vTotal = Math.round(vUnit * cant);
              productos.push({
                codigo: item.codigo || orden.numeroOC || '',
                producto: item.producto,
                cantidad: cant,
                unidadMedida: item.unidadMedida || 'UND',
                valorUnitario: vUnit,
                valorTotal: vTotal,
                kg: 0,
                ordenId: orden.id,
                proveedor: orden.proveedor,
              });
            }
            continue; // No need to call backend for this OC
          }
        } catch { /* JSON parse failed — fall through to backend */ }
      }
      ordenesNeedingBackend.push(orden);
    }

    // If all OCs had JSON data, we are done
    if (ordenesNeedingBackend.length === 0) {
      this.productosOC.set(productos);
      this.extractingOC.set(false);
      this.extractProgress.set(100);
      return;
    }

    // ── Backend OCR path for OCs without new-format descripcionItems ──
    let completed = 0;
    const total = ordenesNeedingBackend.length;

    for (const orden of ordenesNeedingBackend) {
      if (!this.tramite.id) {
        completed++;
        this.extractProgress.set(Math.round(((productos.length > 0 ? ordenes.length - total : 0) + completed) / ordenes.length * 100));
        if (completed >= total) {
          this.productosOC.set(productos);
          this.extractingOC.set(false);
          if (productos.length === 0) this.fallbackExtractFromOCText(ordenes);
        }
        continue;
      }

      this.http
        .get<any>(
          `${environment.apiUrl}/v1/discrepancia/extraer-productos-oc/${this.tramite.id}/${orden.id}`,
        )
        .subscribe({
          next: (resp) => {
            const items: any[] = Array.isArray(resp)
              ? resp
              : (resp?.productos || resp?.items || []);
            for (const item of items) {
              let vUnit = this.parseNumber(item.valorUnitario || item.precioUnitario);
              let vTotal = this.parseNumber(item.valorTotal || item.total);
              const cant = this.parseNumber(item.cantidad);
              // Calcular valores faltantes
              if (vUnit === 0 && vTotal > 0 && cant > 0) vUnit = Math.round(vTotal / cant);
              if (vTotal === 0 && vUnit > 0 && cant > 0) vTotal = Math.round(vUnit * cant);
              productos.push({
                codigo: item.codigo || '',
                producto: item.producto || item.descripcion || '',
                cantidad: cant,
                unidadMedida: item.unidadMedida || item.unidad || 'UND',
                valorUnitario: vUnit,
                valorTotal: vTotal,
                kg: this.parseNumber(item.kg || item.peso),
                ordenId: orden.id,
                proveedor: orden.proveedor,
              });
            }
            completed++;
            this.extractProgress.set(Math.round((completed / total) * 100));
            if (completed >= total) {
              this.productosOC.set(productos);
              this.extractingOC.set(false);
              if (productos.length === 0) this.fallbackExtractFromOCText(ordenes);
            }
          },
          error: () => {
            completed++;
            this.extractProgress.set(Math.round((completed / total) * 100));
            if (completed >= total) {
              this.productosOC.set(productos);
              this.extractingOC.set(false);
              if (productos.length === 0) this.fallbackExtractFromOCText(ordenes);
            }
          },
        });
    }
  }

  private fallbackExtractFromOCText(ordenes: OrdenCompraCargada[]): void {
    const productos: ProductoOC[] = [];
    for (const orden of ordenes) {
      const desc = (orden.descripcionItems || '').trim();
      if (!desc) {
        // Last resort: use the OC header as a single entry
        const nombre = [orden.numeroOC, orden.proveedor].filter(Boolean).join(' – ');
        if (nombre) {
          productos.push({
            codigo: orden.numeroOC || '',
            producto: nombre,
            cantidad: 1,
            unidadMedida: 'UND',
            valorUnitario: orden.valorTotal || 0,
            valorTotal: orden.valorTotal || 0,
            kg: 0,
            ordenId: orden.id,
            proveedor: orden.proveedor,
          });
        }
        continue;
      }

      // Detectar formato JSON estructurado generado por el OCR mejorado
      if (desc.startsWith('{"__items":')) {
        try {
          const parsed: { __items: Array<{
            codigo?: string; producto: string; cantidad: number;
            unidadMedida?: string; valorUnitario?: number; valorTotal?: number;
          }> } = JSON.parse(desc);
          if (Array.isArray(parsed.__items) && parsed.__items.length > 0) {
            for (const item of parsed.__items) {
              let vUnit = item.valorUnitario || 0;
              let vTotal = item.valorTotal || 0;
              const cant = item.cantidad || 1;
              if (vUnit === 0 && vTotal > 0 && cant > 0) vUnit = Math.round(vTotal / cant);
              if (vTotal === 0 && vUnit > 0 && cant > 0) vTotal = Math.round(vUnit * cant);
              productos.push({
                codigo: item.codigo || orden.numeroOC || '',
                producto: item.producto,
                cantidad: cant,
                unidadMedida: item.unidadMedida || 'UND',
                valorUnitario: vUnit,
                valorTotal: vTotal,
                kg: 0,
                ordenId: orden.id,
                proveedor: orden.proveedor,
              });
            }
            continue;
          }
        } catch { /* JSON parse failed — fall through to text parsing */ }
      }

      // Formato legacy: nombres separados por punto y coma
      const names = desc.split(/[;|\n]+/).map(s => s.trim()).filter(s => s.length > 2);
      const valorPorItem = names.length > 1 && orden.valorTotal > 0
        ? Math.round(orden.valorTotal / names.length)
        : (orden.valorTotal || 0);
      for (const name of names) {
        productos.push({
          codigo: orden.numeroOC || '',
          producto: name,
          cantidad: 1,
          unidadMedida: 'UND',
          valorUnitario: valorPorItem,
          valorTotal: valorPorItem,
          kg: 0,
          ordenId: orden.id,
          proveedor: orden.proveedor,
        });
      }
    }
    if (productos.length > 0) {
      this.productosOC.set(productos);
    }
  }

  ejecutarComparacion(): void {
    this.loading.set(true);
    const plan = this.productosPlaneacion();
    const oc = this.productosOC();
    const matches: ProductoMatchResult[] = [];
    const usedOC = new Set<number>();
    const usedPlan = new Set<number>();

    for (let i = 0; i < plan.length; i++) {
      let bestMatchIdx = -1;
      let bestScore = 0;

      for (let j = 0; j < oc.length; j++) {
        if (usedOC.has(j)) continue;
        const score = this.calcMatchScore(plan[i], oc[j]);
        if (score > bestScore) {
          bestScore = score;
          bestMatchIdx = j;
        }
      }

      if (bestMatchIdx >= 0 && bestScore >= 0.3) {
        usedOC.add(bestMatchIdx);
        usedPlan.add(i);
        const diff = this.buildMatch(plan[i], oc[bestMatchIdx]);
        matches.push(diff);
      }
    }

    for (let i = 0; i < plan.length; i++) {
      if (!usedPlan.has(i)) {
        matches.push({
          productoPlaneacion: plan[i],
          productoOC: null,
          estado: 'SOLO_PLAN',
          diferencias: ['No encontrado en Órdenes de Compra'],
          conversionUnidad: null,
          cantidadConvertidaOC: null,
          coincideCantidad: false,
          coincideUnidad: false,
          porcentajeCumplimiento: 0,
          cantidadOCTotal: 0,
        });
      }
    }

    for (let j = 0; j < oc.length; j++) {
      if (!usedOC.has(j)) {
        matches.push({
          productoPlaneacion: null,
          productoOC: oc[j],
          estado: 'SOLO_OC',
          diferencias: ['Producto extra en OC'],
          conversionUnidad: null,
          cantidadConvertidaOC: null,
          coincideCantidad: false,
          coincideUnidad: false,
          porcentajeCumplimiento: 0,
          cantidadOCTotal: 0,
        });
      }
    }

    // Calculate cumplimiento per planning product
    for (const match of matches) {
      if (match.productoPlaneacion) {
        let totalOcQty = 0;
        for (const o of oc) {
          const score = this.calcMatchScore(match.productoPlaneacion, o);
          if (score >= 0.3) {
            let qty = o.cantidad;
            const pUnit = this.unitService.resolveUnitKey(match.productoPlaneacion.unidadMedida);
            const oUnit = this.unitService.resolveUnitKey(o.unidadMedida);
            if (pUnit && oUnit && pUnit !== oUnit &&
                this.unitService.areSameCategory(match.productoPlaneacion.unidadMedida, o.unidadMedida)) {
              const conv = this.unitService.convert(o.cantidad, o.unidadMedida, match.productoPlaneacion.unidadMedida);
              if (conv.success) qty = conv.convertedValue;
            }
            totalOcQty += qty;
          }
        }
        match.cantidadOCTotal = totalOcQty;
        match.porcentajeCumplimiento = match.productoPlaneacion.cantidad > 0
          ? Math.min(100, Math.round((totalOcQty / match.productoPlaneacion.cantidad) * 10000) / 100)
          : 0;
      }
    }

    const coinciden = matches.filter(m => m.estado === 'COINCIDE').length;
    const diferentes = matches.filter(m => m.estado === 'DIFERENTE').length;
    const soloPlan = matches.filter(m => m.estado === 'SOLO_PLAN').length;
    const soloOC = matches.filter(m => m.estado === 'SOLO_OC').length;
    // Cobertura: qué porcentaje de ítems planificados fueron hallados en OC (exactos + con diferencias)
    const pct = Math.round(((coinciden + diferentes) / (plan.length || 1)) * 100);

    const resultado: ResultadoComparativa = {
      matchProductos: matches,
      totalPlaneacion: plan.length,
      totalOC: oc.length,
      productosCoinciden: coinciden,
      productosDiferentes: diferentes,
      soloEnPlaneacion: soloPlan,
      soloEnOC: soloOC,
      porcentajeCoincidencia: pct,
    };

    this.resultado.set(resultado);
    this.comparisonDone.set(true);
    this.animatePercentage(pct);

    setTimeout(() => this.loading.set(false), 400);
  }

  private buildMatch(plan: ProductoPlaneacion, oc: ProductoOC): ProductoMatchResult {
    const diferencias: string[] = [];
    let conversionResult: ConversionResult | null = null;
    let cantidadConvertida: number | null = null;
    let coincideCantidad = false;
    let coincideUnidad = false;

    const planUnit = this.unitService.resolveUnitKey(plan.unidadMedida);
    const ocUnit = this.unitService.resolveUnitKey(oc.unidadMedida);

    if (planUnit && ocUnit && planUnit === ocUnit) {
      coincideUnidad = true;
    } else if (planUnit && ocUnit && this.unitService.areSameCategory(plan.unidadMedida, oc.unidadMedida)) {
      conversionResult = this.unitService.convert(oc.cantidad, oc.unidadMedida, plan.unidadMedida);
      if (conversionResult.success) {
        cantidadConvertida = conversionResult.convertedValue;
        diferencias.push(
          `Unidad: ${oc.unidadMedida} → ${plan.unidadMedida} (${oc.cantidad} ${oc.unidadMedida} = ${cantidadConvertida.toFixed(2)} ${plan.unidadMedida})`
        );
      } else {
        diferencias.push(`Unidad incompatible: ${plan.unidadMedida} vs ${oc.unidadMedida}`);
      }
    } else if (plan.unidadMedida.toLowerCase() !== oc.unidadMedida.toLowerCase()) {
      if (planUnit && ocUnit) {
        diferencias.push(`Categorías incompatibles: ${plan.unidadMedida} vs ${oc.unidadMedida}`);
      } else {
        diferencias.push(`Unidad: ${plan.unidadMedida} vs ${oc.unidadMedida}`);
      }
    } else {
      coincideUnidad = true;
    }

    const effectiveOCQty = cantidadConvertida ?? oc.cantidad;
    const qtyTolerance = plan.cantidad * 0.02;
    if (Math.abs(effectiveOCQty - plan.cantidad) <= qtyTolerance) {
      coincideCantidad = true;
    } else {
      diferencias.push(`Cantidad: ${plan.cantidad} vs ${effectiveOCQty.toFixed(2)}`);
    }

    if (plan.valorUnitario > 0 && oc.valorUnitario > 0) {
      const priceDiff = Math.abs(plan.valorUnitario - oc.valorUnitario);
      const priceTolerance = plan.valorUnitario * 0.05;
      if (priceDiff > priceTolerance) {
        diferencias.push(
          `Precio: $${this.formatMoney(plan.valorUnitario)} vs $${this.formatMoney(oc.valorUnitario)}`
        );
      }
    }

    const estado: EstadoMatch = diferencias.length === 0 ? 'COINCIDE' : 'DIFERENTE';

    return {
      productoPlaneacion: plan,
      productoOC: oc,
      estado,
      diferencias,
      conversionUnidad: conversionResult,
      cantidadConvertidaOC: cantidadConvertida,
      coincideCantidad,
      coincideUnidad,
      porcentajeCumplimiento: 0,
      cantidadOCTotal: 0,
    };
  }

  private calcMatchScore(plan: ProductoPlaneacion, oc: ProductoOC): number {
    let score = 0;
    const planName = this.normalizeText(plan.producto);
    const ocName = this.normalizeText(oc.producto);

    if (plan.codigo && oc.codigo && this.normalizeText(plan.codigo) === this.normalizeText(oc.codigo)) {
      score += 0.5;
    }

    if (planName === ocName) {
      score += 0.4;
    } else if (planName.includes(ocName) || ocName.includes(planName)) {
      score += 0.3;
    } else {
      // Levenshtein similarity
      const sim = this.levenshteinSimilarity(planName, ocName);
      if (sim >= 0.7) {
        score += sim * 0.4;
      } else {
        // Word-level matching with fuzzy
        const wordsP = planName.split(/\s+/).filter(w => w.length > 2);
        const wordsO = ocName.split(/\s+/).filter(w => w.length > 2);
        let matched = 0;
        for (const wp of wordsP) {
          for (const wo of wordsO) {
            if (wp === wo || this.levenshteinSimilarity(wp, wo) >= 0.8) {
              matched++;
              break;
            }
          }
        }
        if (wordsP.length > 0) {
          score += (matched / wordsP.length) * 0.35;
        }
      }
    }

    if (plan.cantidad > 0 && oc.cantidad > 0) {
      const ratio = Math.min(plan.cantidad, oc.cantidad) / Math.max(plan.cantidad, oc.cantidad);
      score += ratio * 0.1;
    }

    return score;
  }

  /**
   * Normaliza texto: quita acentos/diacríticos, convierte a minúsculas, trims.
   * "AJONJOLÍ" → "ajonjoli", "café" → "cafe"
   */
  private normalizeText(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .normalize('NFD')                       // Descompone: é → e + ́
      .replace(/[\u0300-\u036f]/g, '')        // Quita marcas diacríticas
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');                  // Normaliza espacios múltiples
  }

  /**
   * Similitud normalizada basada en distancia de Levenshtein.
   * Retorna 0.0 (totalmente diferentes) a 1.0 (idénticos).
   */
  private levenshteinSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    return 1.0 - (this.levenshteinDistance(s1, s2) / maxLen);
  }

  /**
   * Distancia de Levenshtein (edición mínima) entre dos cadenas.
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length, n = s2.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    let curr = new Array(n + 1);

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  private animatePercentage(target: number): void {
    let current = 0;
    const step = target / 30;
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        this.matchPercentage.set(target);
        clearInterval(interval);
      } else {
        this.matchPercentage.set(Math.round(current));
      }
    }, 30);
  }

  toggleConversionDetail(index: number): void {
    this.showConversionDetail.set(
      this.showConversionDetail() === index ? null : index
    );
  }

  getMatchPercentageColor(): string {
    const pct = this.matchPercentage();
    if (pct >= 90) return '#10b981';
    if (pct >= 60) return '#f59e0b';
    return '#ef4444';
  }

  getStatusLabel(estado: EstadoMatch): string {
    const labels: Record<EstadoMatch, string> = {
      COINCIDE: 'Coincide',
      DIFERENTE: 'Diferencias',
      SOLO_PLAN: 'Solo Planeación',
      SOLO_OC: 'Solo en OC',
    };
    return labels[estado];
  }

  getStatusClass(estado: EstadoMatch): string {
    const classes: Record<EstadoMatch, string> = {
      COINCIDE: 'status--coincide',
      DIFERENTE: 'status--diferente',
      SOLO_PLAN: 'status--solo-plan',
      SOLO_OC: 'status--solo-oc',
    };
    return classes[estado];
  }

  confirmar(): void {
    if (!this.comparisonDone()) return;

    const result = this.resultado();
    if (result && this.tramite.id) {
      const body = { comparativaPlaneacionOcJson: JSON.stringify(result) };
      this.http
        .put(`${environment.apiUrl}/compras/tramite/${this.tramite.id}/comparativa-planeacion-oc`, body)
        .subscribe();

      // Guardar cambios de unidad si los hay
      const cambios = this.cambiosUnidad();
      if (cambios.length > 0) {
        this.persistirCambiosUnidad();
      }
    }

    this.completed.emit();
  }

  guardarBorrador(): void {
    if (!this.tramite.id) return;
    this.savingDraft.set(true);
    const borrador = {
      productosPlaneacion: this.productosPlaneacion(),
      productosOC: this.productosOC(),
      cambiosUnidad: this.cambiosUnidad(),
      resultado: this.resultado(),
    };
    const body = { borradorJson: JSON.stringify(borrador) };
    this.http
      .put(`${environment.apiUrl}/compras/tramite/${this.tramite.id}/comparativa-planeacion-oc/borrador`, body)
      .subscribe({
        next: () => {
          this.savingDraft.set(false);
          this.draftSaved.set(true);
          setTimeout(() => this.draftSaved.set(false), 3000);
        },
        error: () => this.savingDraft.set(false),
      });
  }

  // ═══ Edición de unidades de medida ═══

  startEditUnit(index: number): void {
    const matches = this.resultado()?.matchProductos;
    if (!matches?.[index]?.productoOC) return;
    this.editingUnitIndex.set(index);
    this.editingUnitValue.set(matches[index].productoOC!.unidadMedida);
  }

  cancelEditUnit(): void {
    this.editingUnitIndex.set(null);
    this.editingUnitValue.set('');
  }

  applyUnitChange(index: number, newUnitKey: string): void {
    const matches = this.resultado()?.matchProductos;
    if (!matches?.[index]?.productoOC) return;

    const match = matches[index];
    const oc = match.productoOC!;
    const oldUnit = oc.unidadMedida;
    const newUnitDef = this.unitService.getUnit(newUnitKey);
    if (!newUnitDef) return;

    const newUnitLabel = newUnitDef.label.toUpperCase();
    if (oldUnit.toUpperCase() === newUnitLabel) {
      this.cancelEditUnit();
      return;
    }

    // Intentar conversión automática
    const conversion = this.unitService.convert(oc.cantidad, oldUnit, newUnitDef.key);
    const isAutomatic = conversion.success;
    const cantidadConvertida = isAutomatic ? conversion.convertedValue : oc.cantidad;
    const factor = isAutomatic ? conversion.factor : 1;

    // Registrar cambio
    const cambio: CambioUnidad = {
      productoNombre: oc.producto,
      productoIndex: index,
      unidadOriginal: oldUnit,
      unidadNueva: newUnitLabel,
      cantidadOriginal: oc.cantidad,
      cantidadConvertida,
      factorConversion: factor,
      tipoCambio: isAutomatic ? 'AUTOMATICA' : 'MANUAL',
      categoria: isAutomatic ? conversion.category : 'MANUAL',
      fecha: new Date().toISOString(),
      usuario: 'Usuario actual',
    };

    this.cambiosUnidad.update(list => [...list, cambio]);

    // Actualizar el producto OC en el resultado
    const updatedMatches = [...matches];
    const updatedOC: ProductoOC = {
      ...oc,
      unidadMedida: newUnitLabel,
      cantidad: cantidadConvertida,
    };
    updatedMatches[index] = {
      ...match,
      productoOC: updatedOC,
    };

    // Re-evaluar la coincidencia
    if (match.productoPlaneacion) {
      const rebuilt = this.buildMatch(match.productoPlaneacion, updatedOC);
      updatedMatches[index] = rebuilt;
    }

    // Recalcular estadísticas
    const coinciden = updatedMatches.filter(m => m.estado === 'COINCIDE').length;
    const diferentes = updatedMatches.filter(m => m.estado === 'DIFERENTE').length;
    const soloPlan = updatedMatches.filter(m => m.estado === 'SOLO_PLAN').length;
    const soloOC = updatedMatches.filter(m => m.estado === 'SOLO_OC').length;
    const total = updatedMatches.length || 1;
    const pct = Math.round((coinciden / total) * 100);

    const newResult: ResultadoComparativa = {
      matchProductos: updatedMatches,
      totalPlaneacion: this.resultado()!.totalPlaneacion,
      totalOC: this.resultado()!.totalOC,
      productosCoinciden: coinciden,
      productosDiferentes: diferentes,
      soloEnPlaneacion: soloPlan,
      soloEnOC: soloOC,
      porcentajeCoincidencia: pct,
    };

    this.resultado.set(newResult);
    this.animatePercentage(pct);
    this.editingUnitIndex.set(null);
    this.editingUnitValue.set('');
  }

  removeCambioUnidad(index: number): void {
    this.cambiosUnidad.update(list => list.filter((_, i) => i !== index));
    if (this.editingCommentIndex() === index) {
      this.editingCommentIndex.set(null);
      this.editingCommentValue.set('');
    }
  }

  startEditComment(index: number): void {
    const existing = this.cambiosUnidad()[index]?.comentario ?? '';
    this.editingCommentIndex.set(index);
    this.editingCommentValue.set(existing);
  }

  saveComment(index: number): void {
    const value = this.editingCommentValue().trim();
    this.cambiosUnidad.update(list =>
      list.map((c, i) => i === index ? { ...c, comentario: value || undefined } : c)
    );
    this.editingCommentIndex.set(null);
    this.editingCommentValue.set('');
  }

  cancelEditComment(): void {
    this.editingCommentIndex.set(null);
    this.editingCommentValue.set('');
  }

  // ═══ Ver Orden de Compra ═══

  getNumeroOC(ordenId: string): string {
    if (!this.tramite?.ordenesCargadas) return ordenId;
    const orden = this.tramite.ordenesCargadas.find(o => o.id === ordenId);
    return orden?.numeroOC || ordenId;
  }

  verOrdenDeCompra(ordenId: string): void {
    if (!this.tramite?.ordenesCargadas) return;
    const orden = this.tramite.ordenesCargadas.find(o => o.id === ordenId);
    if (!orden) return;
    this.ordenModalData.set({
      numeroOC: orden.numeroOC || ordenId,
      proveedor: orden.proveedor || '—',
      url: orden.archivoUrl,
    });
    this.showOrdenModal.set(true);
  }

  cerrarOrdenModal(): void {
    this.showOrdenModal.set(false);
    this.ordenModalData.set(null);
  }

  abrirArchivoOC(url: string): void {
    window.open(url, '_blank');
  }

  getCategoryLabel(category: string): string {
    if (category === 'MANUAL') return 'Manual';
    return this.unitService.getCategoryLabel(category as UnitCategory);
  }

  // ═══ Matching manual de productos ═══

  toggleManualMatchMode(): void {
    this.manualMatchMode.update(v => !v);
    if (!this.manualMatchMode()) {
      this.selectedPlanIndex.set(null);
      this.selectedOCIndex.set(null);
    }
  }

  /** Click en fila de planeación para seleccionar/deseleccionar */
  onPlanRowClick(matchIndex: number): void {
    if (!this.manualMatchMode()) return;
    const match = this.resultado()?.matchProductos[matchIndex];
    if (!match?.productoPlaneacion) return;
    const planIdx = this.productosPlaneacion().indexOf(match.productoPlaneacion);
    if (planIdx < 0) return;

    if (this.selectedPlanIndex() === planIdx) {
      this.selectedPlanIndex.set(null);
    } else {
      this.selectedPlanIndex.set(planIdx);
      this.tryCreateLink();
    }
  }

  /** Click en fila de OC para seleccionar/deseleccionar */
  onOCRowClick(matchIndex: number): void {
    if (!this.manualMatchMode()) return;
    const match = this.resultado()?.matchProductos[matchIndex];
    if (!match?.productoOC) return;
    const ocIdx = this.productosOC().indexOf(match.productoOC);
    if (ocIdx < 0) return;

    if (this.selectedOCIndex() === ocIdx) {
      this.selectedOCIndex.set(null);
    } else {
      this.selectedOCIndex.set(ocIdx);
      this.tryCreateLink();
    }
  }

  /** Si ambos lados seleccionados, crear link automáticamente */
  private tryCreateLink(): void {
    const pi = this.selectedPlanIndex();
    const oi = this.selectedOCIndex();
    if (pi === null || oi === null) return;

    const plan = this.productosPlaneacion();
    const oc = this.productosOC();
    if (pi >= plan.length || oi >= oc.length) return;

    // Quitar links previos de estos productos
    const existing = this.manualLinks().filter(l => l.planIndex !== pi && l.ocIndex !== oi);
    this.manualLinks.set([...existing, {
      planIndex: pi,
      ocIndex: oi,
      planProducto: plan[pi].producto,
      ocProducto: oc[oi].producto,
    }]);

    this.selectedPlanIndex.set(null);
    this.selectedOCIndex.set(null);
  }

  removeManualLink(index: number): void {
    this.manualLinks.update(links => links.filter((_, i) => i !== index));
  }

  /** Verifica si la fila del plan está seleccionada (para highlight) */
  isPlanRowSelected(matchIndex: number): boolean {
    if (!this.manualMatchMode() || this.selectedPlanIndex() === null) return false;
    const match = this.resultado()?.matchProductos[matchIndex];
    if (!match?.productoPlaneacion) return false;
    return this.productosPlaneacion().indexOf(match.productoPlaneacion) === this.selectedPlanIndex();
  }

  /** Verifica si la fila de OC está seleccionada (para highlight) */
  isOCRowSelected(matchIndex: number): boolean {
    if (!this.manualMatchMode() || this.selectedOCIndex() === null) return false;
    const match = this.resultado()?.matchProductos[matchIndex];
    if (!match?.productoOC) return false;
    return this.productosOC().indexOf(match.productoOC) === this.selectedOCIndex();
  }

  /** Verifica si la fila del plan ya tiene un link manual creado */
  isPlanRowLinked(matchIndex: number): boolean {
    if (!this.manualMatchMode()) return false;
    const match = this.resultado()?.matchProductos[matchIndex];
    if (!match?.productoPlaneacion) return false;
    const planIdx = this.productosPlaneacion().indexOf(match.productoPlaneacion);
    return this.manualLinks().some(l => l.planIndex === planIdx);
  }

  /** Verifica si la fila de OC ya tiene un link manual creado */
  isOCRowLinked(matchIndex: number): boolean {
    if (!this.manualMatchMode()) return false;
    const match = this.resultado()?.matchProductos[matchIndex];
    if (!match?.productoOC) return false;
    const ocIdx = this.productosOC().indexOf(match.productoOC);
    return this.manualLinks().some(l => l.ocIndex === ocIdx);
  }

  /** Re-ejecuta la comparación incorporando los links manuales */
  aplicarMatchManual(): void {
    this.loading.set(true);
    const plan = this.productosPlaneacion();
    const oc = this.productosOC();
    const links = this.manualLinks();
    const matches: ProductoMatchResult[] = [];
    const usedOC = new Set<number>();
    const usedPlan = new Set<number>();

    // 1. Primero aplicar los links manuales
    for (const link of links) {
      if (link.planIndex < plan.length && link.ocIndex < oc.length) {
        usedPlan.add(link.planIndex);
        usedOC.add(link.ocIndex);
        matches.push(this.buildMatch(plan[link.planIndex], oc[link.ocIndex]));
      }
    }

    // 2. Luego matching automático para el resto
    for (let i = 0; i < plan.length; i++) {
      if (usedPlan.has(i)) continue;
      let bestMatchIdx = -1;
      let bestScore = 0;

      for (let j = 0; j < oc.length; j++) {
        if (usedOC.has(j)) continue;
        const score = this.calcMatchScore(plan[i], oc[j]);
        if (score > bestScore) {
          bestScore = score;
          bestMatchIdx = j;
        }
      }

      if (bestMatchIdx >= 0 && bestScore >= 0.3) {
        usedOC.add(bestMatchIdx);
        usedPlan.add(i);
        matches.push(this.buildMatch(plan[i], oc[bestMatchIdx]));
      }
    }

    // 3. Productos sin match
    for (let i = 0; i < plan.length; i++) {
      if (!usedPlan.has(i)) {
        matches.push({
          productoPlaneacion: plan[i], productoOC: null,
          estado: 'SOLO_PLAN', diferencias: ['No encontrado en Órdenes de Compra'],
          conversionUnidad: null, cantidadConvertidaOC: null,
          coincideCantidad: false, coincideUnidad: false,
          porcentajeCumplimiento: 0, cantidadOCTotal: 0,
        });
      }
    }

    for (let j = 0; j < oc.length; j++) {
      if (!usedOC.has(j)) {
        matches.push({
          productoPlaneacion: null, productoOC: oc[j],
          estado: 'SOLO_OC', diferencias: ['Producto extra en OC'],
          conversionUnidad: null, cantidadConvertidaOC: null,
          coincideCantidad: false, coincideUnidad: false,
          porcentajeCumplimiento: 0, cantidadOCTotal: 0,
        });
      }
    }

    // 4. Recalcular cumplimiento teniendo en cuenta links manuales
    // Construir mapa plan→OC y OC→plan desde los links manuales
    const manualPlanToOC = new Map<number, number[]>();
    const manualOCToPlan = new Map<number, number>();
    for (const link of links) {
      if (link.planIndex < plan.length && link.ocIndex < oc.length) {
        if (!manualPlanToOC.has(link.planIndex)) manualPlanToOC.set(link.planIndex, []);
        manualPlanToOC.get(link.planIndex)!.push(link.ocIndex);
        manualOCToPlan.set(link.ocIndex, link.planIndex);
      }
    }

    for (const match of matches) {
      if (match.productoPlaneacion) {
        const planIdx = plan.indexOf(match.productoPlaneacion);
        let totalOcQty = 0;

        // Sumar cantidades de OC products vinculados manualmente
        const linkedOCIndexes = manualPlanToOC.get(planIdx) ?? [];
        const linkedOCSet = new Set(linkedOCIndexes);

        for (const ocIdx of linkedOCIndexes) {
          let qty = oc[ocIdx].cantidad;
          const pUnit = this.unitService.resolveUnitKey(match.productoPlaneacion.unidadMedida);
          const oUnit = this.unitService.resolveUnitKey(oc[ocIdx].unidadMedida);
          if (pUnit && oUnit && pUnit !== oUnit &&
              this.unitService.areSameCategory(match.productoPlaneacion.unidadMedida, oc[ocIdx].unidadMedida)) {
            const conv = this.unitService.convert(oc[ocIdx].cantidad, oc[ocIdx].unidadMedida, match.productoPlaneacion.unidadMedida);
            if (conv.success) qty = conv.convertedValue;
          }
          totalOcQty += qty;
        }

        // Sumar también OC products matcheados automáticamente (por score)
        for (let j = 0; j < oc.length; j++) {
          if (linkedOCSet.has(j)) continue; // ya contado por link manual
          if (manualOCToPlan.has(j)) continue; // reservado para otro plan via link manual
          const score = this.calcMatchScore(match.productoPlaneacion, oc[j]);
          if (score >= 0.3) {
            let qty = oc[j].cantidad;
            const pUnit = this.unitService.resolveUnitKey(match.productoPlaneacion.unidadMedida);
            const oUnit = this.unitService.resolveUnitKey(oc[j].unidadMedida);
            if (pUnit && oUnit && pUnit !== oUnit &&
                this.unitService.areSameCategory(match.productoPlaneacion.unidadMedida, oc[j].unidadMedida)) {
              const conv = this.unitService.convert(oc[j].cantidad, oc[j].unidadMedida, match.productoPlaneacion.unidadMedida);
              if (conv.success) qty = conv.convertedValue;
            }
            totalOcQty += qty;
          }
        }

        match.cantidadOCTotal = totalOcQty;
        match.porcentajeCumplimiento = match.productoPlaneacion.cantidad > 0
          ? Math.min(100, Math.round((totalOcQty / match.productoPlaneacion.cantidad) * 10000) / 100)
          : 0;
      }
    }

    // 5. Estadísticas
    const coinciden = matches.filter(m => m.estado === 'COINCIDE').length;
    const diferentes = matches.filter(m => m.estado === 'DIFERENTE').length;
    const soloPlan = matches.filter(m => m.estado === 'SOLO_PLAN').length;
    const soloOC = matches.filter(m => m.estado === 'SOLO_OC').length;
    const pct = Math.round(((coinciden + diferentes) / (plan.length || 1)) * 100);

    this.resultado.set({
      matchProductos: matches,
      totalPlaneacion: plan.length,
      totalOC: oc.length,
      productosCoinciden: coinciden,
      productosDiferentes: diferentes,
      soloEnPlaneacion: soloPlan,
      soloEnOC: soloOC,
      porcentajeCoincidencia: pct,
    });

    this.comparisonDone.set(true);
    this.animatePercentage(pct);
    this.manualMatchMode.set(false);
    setTimeout(() => this.loading.set(false), 400);
  }

  private persistirCambiosUnidad(): void {
    if (!this.tramite.id) return;
    this.savingChanges.set(true);
    const body = { cambiosUnidadJson: JSON.stringify(this.cambiosUnidad()) };
    this.http
      .put(`${environment.apiUrl}/compras/tramite/${this.tramite.id}/cambios-unidad`, body)
      .subscribe({
        next: () => {
          this.savingChanges.set(false);
          this.savedSuccessfully.set(true);
          setTimeout(() => this.savedSuccessfully.set(false), 3000);
        },
        error: () => this.savingChanges.set(false),
      });
  }

  /**
   * Ejecuta la comparación usando el backend con fuzzy matching avanzado
   * (normalización de acentos + Levenshtein). Puede ser invocado desde el chatbot.
   */
  ejecutarComparacionBackend(): void {
    this.loading.set(true);
    const plan = this.productosPlaneacion();
    const oc = this.productosOC();

    const body = {
      productosPlaneacion: plan.map(p => ({
        codigo: p.codigo,
        producto: p.producto,
        cantidad: p.cantidad,
        unidadMedida: p.unidadMedida,
        kg: p.kg,
        valorUnitario: p.valorUnitario,
        valorTotal: p.valorTotal,
      })),
      productosOC: oc.map(o => ({
        codigo: o.codigo,
        producto: o.producto,
        cantidad: o.cantidad,
        unidadMedida: o.unidadMedida,
        kg: o.kg,
        valorUnitario: o.valorUnitario,
        valorTotal: o.valorTotal,
      })),
    };

    this.http
      .post<any[]>(`${environment.apiUrl}/v1/discrepancia/match-productos-planeacion`, body)
      .subscribe({
        next: (matchResults) => {
          // Reconstruir los resultados de comparación usando los matches del backend
          const matches: ProductoMatchResult[] = [];

          for (const mr of matchResults) {
            if (mr.estado === 'MATCHED' && mr.planIndex != null && mr.ocIndex != null) {
              const planItem = plan[mr.planIndex];
              const ocItem = oc[mr.ocIndex];
              if (planItem && ocItem) {
                matches.push(this.buildMatch(planItem, ocItem));
              }
            } else if (mr.estado === 'SOLO_PLAN' && mr.planIndex != null) {
              matches.push({
                productoPlaneacion: plan[mr.planIndex],
                productoOC: null,
                estado: 'SOLO_PLAN',
                diferencias: ['No encontrado en Órdenes de Compra'],
                conversionUnidad: null,
                cantidadConvertidaOC: null,
                coincideCantidad: false,
                coincideUnidad: false,
                porcentajeCumplimiento: 0,
                cantidadOCTotal: 0,
              });
            } else if (mr.estado === 'SOLO_OC' && mr.ocIndex != null) {
              matches.push({
                productoPlaneacion: null,
                productoOC: oc[mr.ocIndex],
                estado: 'SOLO_OC',
                diferencias: ['Producto extra en OC'],
                conversionUnidad: null,
                cantidadConvertidaOC: null,
                coincideCantidad: false,
                coincideUnidad: false,
                porcentajeCumplimiento: 0,
                cantidadOCTotal: 0,
              });
            }
          }

          // Recalcular cumplimiento
          for (const match of matches) {
            if (match.productoPlaneacion) {
              let totalOcQty = 0;
              for (const o of oc) {
                const score = this.calcMatchScore(match.productoPlaneacion, o);
                if (score >= 0.3) {
                  let qty = o.cantidad;
                  const pUnit = this.unitService.resolveUnitKey(match.productoPlaneacion.unidadMedida);
                  const oUnit = this.unitService.resolveUnitKey(o.unidadMedida);
                  if (pUnit && oUnit && pUnit !== oUnit &&
                      this.unitService.areSameCategory(match.productoPlaneacion.unidadMedida, o.unidadMedida)) {
                    const conv = this.unitService.convert(o.cantidad, o.unidadMedida, match.productoPlaneacion.unidadMedida);
                    if (conv.success) qty = conv.convertedValue;
                  }
                  totalOcQty += qty;
                }
              }
              match.cantidadOCTotal = totalOcQty;
              match.porcentajeCumplimiento = match.productoPlaneacion.cantidad > 0
                ? Math.min(100, Math.round((totalOcQty / match.productoPlaneacion.cantidad) * 10000) / 100)
                : 0;
            }
          }

          const coinciden = matches.filter(m => m.estado === 'COINCIDE').length;
          const diferentes = matches.filter(m => m.estado === 'DIFERENTE').length;
          const soloPlan = matches.filter(m => m.estado === 'SOLO_PLAN').length;
          const soloOC = matches.filter(m => m.estado === 'SOLO_OC').length;
          const pct = Math.round(((coinciden + diferentes) / (plan.length || 1)) * 100);

          this.resultado.set({
            matchProductos: matches,
            totalPlaneacion: plan.length,
            totalOC: oc.length,
            productosCoinciden: coinciden,
            productosDiferentes: diferentes,
            soloEnPlaneacion: soloPlan,
            soloEnOC: soloOC,
            porcentajeCoincidencia: pct,
          });

          this.comparisonDone.set(true);
          this.animatePercentage(pct);
          setTimeout(() => this.loading.set(false), 400);
        },
        error: () => {
          // Fallback: usar comparación local si el backend falla
          this.ejecutarComparacion();
        },
      });
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }

  private findCol(headers: string[], keywords: string[]): number {
    // Pass 1: exact match (header === keyword)
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h === kw);
      if (idx >= 0) return idx;
    }
    // Pass 2: word-boundary match (keyword appears as a standalone word)
    for (const kw of keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|\\s|[^a-záéíóúñ])${escaped}(?:$|\\s|[^a-záéíóúñ])`);
      const idx = headers.findIndex(h => regex.test(h));
      if (idx >= 0) return idx;
    }
    // Pass 3: substring match (fallback)
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  private getCell(row: string[], index: number): string {
    if (index < 0 || index >= row.length) return '';
    return (row[index] || '').trim();
  }

  private parseNumber(val: any): number {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') return val;
    let s = String(val).replace(/\$/g, '').replace(/\s/g, '').trim();
    if (!s) return 0;

    const hasComma = s.includes(',');
    const hasPeriod = s.includes('.');

    if (hasComma && hasPeriod) {
      // Both separators: determine which is decimal by position
      const lastComma = s.lastIndexOf(',');
      const lastPeriod = s.lastIndexOf('.');
      if (lastComma > lastPeriod) {
        // Colombian: "4.455,0" → period=thousand, comma=decimal
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // US: "4,455.0" → comma=thousand, period=decimal
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      // Only commas: "3,0" (decimal) or "1,000" (thousand)
      if (/,\d{1,2}$/.test(s)) {
        // Comma + 1-2 digits at end → Colombian decimal separator
        s = s.replace(',', '.');
      } else {
        // Comma + 3+ digits → thousand separator
        s = s.replace(/,/g, '');
      }
    } else if (hasPeriod) {
      // Only periods: "3.0" (decimal) or "90.000" (thousand)
      const periodCount = (s.match(/\./g) || []).length;
      if (periodCount > 1) {
        // Multiple periods → all are thousand separators ("4.356.000")
        s = s.replace(/\./g, '');
      } else if (/\.\d{3}$/.test(s)) {
        // Single period + exactly 3 digits at end → thousand separator ("90.000")
        s = s.replace('.', '');
      }
      // Otherwise single period is a decimal point → leave as-is
    }

    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  }
}
