import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { EgresoFinancieroComponent } from '../egreso-financiero/egreso-financiero.component';
﻿import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ArchivoAdjunto,
  DetalleSolicitudItem,
  MovimientoBancario,
} from '../../models/movimiento-bancario.model';
import {
  ComprobantePagoOcr,
  ComparacionPrecios,
  EstadoTramite,
  VerificacionProveedor,
} from '../../models/comprobante-pago.model';
import { TesoreriaService } from '../../services/tesoreria.service';
import { ComprobantePagoService } from '../../services/comprobante-pago.service';
import { TramitarRequisicionService } from '../../../../features/compras/tramitar-requisicion/services/tramitar-requisicion.service';
import { ControlEgresosService } from '../../../../features/contabilidad/control-egresos/control-egresos.service';
import { ProveedorService } from '../../../../features/proveedores/services/proveedor.service';
import { EgresoRegistrado } from '../../../../features/contabilidad/control-egresos/control-egresos.model';

/** Resultado de verificación bancaria OCR vs Sistema */
export interface VerificacionBancaria {
  bancoOcr: string | null;
  bancoSistema: string | null;
  cuentaOcr: string | null;
  cuentaSistema: string | null;
  beneficiarioOcr: string | null;
  beneficiarioSistema: string | null;
  coincideBanco: boolean;
  coincideCuenta: boolean;
  coincideBeneficiario: boolean;
  todoCorrecto: boolean;
  diferencias: string[];
}

/** Comparación de precios OC vs Egreso vs CP */
export interface ComparacionPreciosLocal {
  valorOC: number | null;
  valorEgreso: number | null;
  valorCP: number | null;
  coincideOcEgreso: boolean;
  coincideOcCp: boolean;
  coincideEgresoCp: boolean;
  todosCoinciden: boolean;
  diferencias: string[];
}

/** Estado de adjuncion del comprobante de pago por proveedor */
export interface ComprobanteProveedorStatus {
  archivo: File | null;
  nombreArchivo: string | null;
  procesando: boolean;
  ocrData: ComprobantePagoOcr | null;
  matchPorcentaje: number | null;
  estado: 'SIN_CP' | 'PROCESANDO' | 'ASIGNADO' | 'ERROR';
  valorPagado: number | null;
  /** Verificación: OCR bank data vs system bank data */
  verificacionBancaria: VerificacionBancaria | null;
  /** Comparación de precios: OC vs Egreso vs CP */
  comparacionPrecios: ComparacionPreciosLocal | null;
  /** Tipo de pago: completo o parcial */
  tipoPago: 'COMPLETO' | 'PARCIAL' | null;
  /** Porcentaje del egreso pagado */
  porcentajePago: number | null;
  /** Indica si el CP excede el valor esperado (solo informativo) */
  sobrepago?: boolean;
  /** Documento de egreso subido por el contador */
  archivoEgresoDoc: File | null;
  /** Nombre del documento de egreso */
  nombreEgresoDoc: string | null;
  /** Veredicto del backend (POST /api/v1/comprobantes/validar) */
  validacionBackend: {
    veredicto: 'APROBADO' | 'RECHAZADO';
    montoOk: boolean;
    cuentaOk: boolean;
    beneficiarioOk: boolean;
    descripcionOk: boolean;
    diferencias: string[];
  } | null;
  validandoBackend: boolean;
  /** Override manual auditado cuando el veredicto es RECHAZADO */
  overrideManual: boolean;
  overrideMotivo: string | null;
  overrideUsuario: string | null;
}

@Component({
  selector: 'app-tramitar-pago',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, MatSnackBarModule, EgresoFinancieroComponent],
  templateUrl: './tramitar-pago.component.html',
  styleUrl: './tramitar-pago.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TramitarPagoComponent implements OnInit {
  movimiento: MovimientoBancario | null = null;
  loading = true;
  estado: EstadoTramite = 'SIN_CARGAR';
  isViaticosFlow = false;
  /** Flujo de egreso registrado por el contador (Contabilidad → Tesorería) */
  isEgresoContadorFlow = false;
  egresoData: EgresoRegistrado | null = null;
  egresoDupEstado: 'checking' | 'ok' | 'dup' | null = null;
  /**
   * Cruce factura: número extraído del comprobante vs egreso designado.
   * null = el OCR no detectó número (solo informativo, no bloquea).
   */
  egresoFacturaCoincide: boolean | null = null;

  // -- Detalles de proveedores --
  detalles: DetalleSolicitudItem[] = [];
  expandedProveedores = signal<Set<number>>(new Set());

  // -- Mapa de comprobante de pago por proveedor (index) --
  comprobanteStatus: Map<number, ComprobanteProveedorStatus> = new Map();

  // -- Toast --
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  // -- Notes --
  showNotes = signal(false);

  // -- Drag per provider --
  draggingIndex: number | null = null;

  // -- Bulk CP assign by provider --
  showBulkAssign = signal(false);
  bulkSelectedProveedor: string | null = null;
  bulkProcessing = false;

  // -- Finalizar proceso --
  finalizando = false;
  procesoFinalizado = false;
  showMontoNoCoincideModal = false;
  /** Modal "egreso designado por el contador" (flujo egreso contador) */
  showEgresoDesignadoModal = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
    private readonly tesoreriaService: TesoreriaService,
    private readonly cpService: ComprobantePagoService,
    private readonly tramiteService: TramitarRequisicionService,
    private readonly controlEgresosService: ControlEgresosService,
    private readonly proveedorService: ProveedorService,
  ) {}

  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.snackBar.open('ID de movimiento invalido', 'Cerrar', { duration: 2500 });
      this.router.navigate(['/tesoreria/bandeja']);
      return;
    }

    const tramiteData = (history as any).state?.tramiteData;
    const tipo = this.route.snapshot.queryParamMap.get('tipo') || (history as any).state?.tipo;

    if (tipo === 'egreso-contador') {
      this.cargarEgresoContador(id);
      return;
    }

    if (tipo === 'viaticos') {
      this.cargarViaticos(id, false);
      return;
    }

    if (tramiteData) {
      this.buildFromTramiteData(tramiteData, id);
    } else {
      this.cargarViaticos(id);
    }
  }

  // -----------------------------------------
  //  Carga de datos
  // -----------------------------------------

  private buildFromTramiteData(tramiteData: any, id: number): void {
    this.isViaticosFlow = false;
    this.movimiento = {
      id: tramiteData.numeroSolicitud || id,
      tipoMovimiento: 'Solicitud Compra',
      fechaPago: tramiteData.fechaLlegadaTesoreria || '',
      empresaUt: tramiteData.empresaUt || '',
      areaDepartamento: tramiteData.areaDepartamento || '',
      banco: '',
      cuenta: '',
      valor: tramiteData.valorAPagar || 0,
      estadoOc: tramiteData.estadoOc || 'Pendiente',
      estadoEgreso: tramiteData.estadoEgreso || 'Pendiente',
      estadoPago: tramiteData.estadoPago || 'Pendiente',
      referencia: tramiteData.numeroRequisicion || '',
      concepto: tramiteData.concepto || '',
      proveedor: tramiteData.proveedor || '',
      archivoOcUrl: tramiteData.archivosOc?.length > 0 ? tramiteData.archivosOc[0].url : null,
      archivoEgresoUrl: tramiteData.archivosEgreso?.length > 0 ? tramiteData.archivosEgreso[0].url : null,
      archivoPagoUrl: tramiteData.archivosPago?.length > 0 ? tramiteData.archivosPago[0].url : null,
      archivosOc: tramiteData.archivosOc || [],
      archivosEgreso: tramiteData.archivosEgreso || [],
      archivosPago: tramiteData.archivosPago || [],
      detalles: tramiteData.detalles || [],
    } as MovimientoBancario;
    this.detalles = this.movimiento.detalles ?? [];
    this.initComprobanteStatus();
    this.detectFinalized();
    this.loading = false;
    this.cdr.markForCheck();
  }

  private buildFromViaticosData(viaticoData: any, id: number): void {
    this.isViaticosFlow = true;
    const valorSolicitud = Number(viaticoData.totalSolicitud ?? 0);
    const valorEgreso = Number(viaticoData.montoDesembolsoAprobado ?? valorSolicitud);
    const estadoFinalizado = String(viaticoData.estado ?? '').toUpperCase() === 'PAGADO';

    this.movimiento = {
      id: viaticoData.solicitudViaticosId || id,
      tipoMovimiento: 'Viaticos',
      fechaPago: viaticoData.fecha || '',
      empresaUt: viaticoData.empresa || '',
      areaDepartamento: viaticoData.area || '',
      banco: viaticoData.bancoCuenta || '',
      cuenta: viaticoData.numeroCuentaBancaria || '',
      valor: valorSolicitud,
      estadoOc: 'Pendiente',
      estadoEgreso: estadoFinalizado ? 'Pagado' : 'Pendiente',
      estadoPago: estadoFinalizado ? 'Pagado' : 'Pendiente',
      referencia: viaticoData.numeroViatico || `VIA-${id}`,
      concepto: `Solicitud de viáticos - ${viaticoData.tipoSolicitud || 'SOLICITUD'}`,
      proveedor: viaticoData.nombreTitularCuenta || viaticoData.solicitante || '',
      archivoOcUrl: null,
      archivoEgresoUrl: null,
      archivoPagoUrl: viaticoData.comprobantePagoUrl || null,
      archivosOc: [],
      archivosEgreso: [],
      archivosPago: viaticoData.comprobantePagoUrl
        ? [{
            nombre: viaticoData.comprobantePagoNombre || 'Comprobante de pago',
            url: viaticoData.comprobantePagoUrl,
            tipo: 'PAGO',
          }]
        : [],
      detalles: [
        {
          proveedorRelacionId: viaticoData.solicitudViaticosId || id,
          proveedorNombre: viaticoData.nombreTitularCuenta || viaticoData.solicitante || 'Titular cuenta',
          proveedorNit: '',
          proveedorBanco: viaticoData.bancoCuenta || '',
          proveedorNumeroCuenta: viaticoData.numeroCuentaBancaria || '',
          proveedorFormaPago: viaticoData.tipoCuentaBancaria || '',
          numeroOc: viaticoData.numeroOrdenEgreso || '',
          valorOc: valorEgreso,
          fechaEmisionOc: viaticoData.fecha || '',
          estadoEgreso: estadoFinalizado ? 'Pagado' : 'Pendiente',
          numeroEgreso: viaticoData.numeroOrdenEgreso || '',
          valorEgreso,
          valorPagado: viaticoData.valorComprobantePago ?? undefined,
          archivosEgresoDetalle: viaticoData.comprobantePagoUrl
            ? [{
                nombre: viaticoData.comprobantePagoNombre || 'Comprobante de pago',
                url: viaticoData.comprobantePagoUrl,
                tipo: 'PAGO',
              }]
            : [],
        },
      ],
      totalProveedores: 1,
      totalOrdenes: 1,
    } as MovimientoBancario;

    this.detalles = this.movimiento.detalles ?? [];
    this.initComprobanteStatus();
    this.detectFinalized();
    this.loading = false;
    this.cdr.markForCheck();
  }

  // -----------------------------------------
  //  Flujo Egreso del Contador (Contabilidad → Tesorería)
  // -----------------------------------------

  private buildFromEgresoContadorData(data: EgresoRegistrado, id: number): void {
    this.isEgresoContadorFlow = true;
    this.isViaticosFlow = false;
    this.egresoData = data;
    const bruto = Number(data.valor ?? 0);
    const neto = Number(data.valorNetoPagar ?? bruto);

    this.movimiento = {
      id: data.id ?? id,
      tipoMovimiento: 'Egreso Contador',
      fechaPago: data.fecha || '',
      empresaUt: '',
      areaDepartamento: '',
      banco: '',
      cuenta: data.cuenta || '',
      valor: neto,
      estadoOc: 'Pendiente',
      estadoEgreso: data.estado === 'PAGADO' ? 'Pagado' : 'Pendiente',
      estadoPago: data.estado === 'PAGADO' ? 'Pagado' : 'Pendiente',
      referencia: data.numeroFactura || '',
      concepto: data.observaciones || `Egreso ${data.numeroFactura || ''} — ${data.proveedorNombre || ''}`,
      proveedor: data.proveedorNombre || '',
      archivoOcUrl: null,
      archivoEgresoUrl: null,
      archivoPagoUrl: null,
      archivosOc: [],
      archivosEgreso: [],
      archivosPago: [],
      detalles: [
        {
          proveedorRelacionId: data.id ?? id,
          proveedorNombre: data.proveedorNombre || 'Sin proveedor',
          proveedorNit: data.nitProveedor || '',
          proveedorBanco: '',
          proveedorNumeroCuenta: data.cuenta || '',
          proveedorFormaPago: '',
          numeroOc: '',
          valorOc: bruto,
          fechaEmisionOc: data.fecha || '',
          estadoEgreso: data.estado === 'PAGADO' ? 'Pagado' : 'Pendiente',
          numeroEgreso: data.numeroFactura || '',
          valorEgreso: neto,
        },
      ],
      totalProveedores: 1,
      totalOrdenes: 1,
    } as MovimientoBancario;

    this.detalles = this.movimiento.detalles ?? [];
    this.initComprobanteStatus();
    this.detectFinalized();
    this.egresoFacturaCoincide = null;
    this.verificarDuplicadoEgreso();
    this.cargarDatosBancariosProveedor(data.nitProveedor);
    this.loading = false;
    this.cdr.markForCheck();
  }

  /**
   * Completa la información bancaria del detalle con la del maestro de
   * proveedores (banco, N° cuenta, forma de pago) para poder comparar el CP.
   */
  private cargarDatosBancariosProveedor(nit: string | null | undefined): void {
    if (!nit || !this.detalles.length) return;
    this.proveedorService.buscarPorNit(nit).subscribe((prov) => {
      if (!prov) return;
      const detalle = this.detalles[0];
      detalle.proveedorBanco = prov.banco || detalle.proveedorBanco || '';
      detalle.proveedorNumeroCuenta = prov.numeroCuenta || detalle.proveedorNumeroCuenta || '';
      detalle.proveedorFormaPago = prov.formaPago || detalle.proveedorFormaPago || '';
      this.cdr.markForCheck();
    });
  }

  /** Carga el egreso por id (acceso directo por URL sin navigation state) */
  private cargarEgresoContador(id: number): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.controlEgresosService
      .obtenerPorId(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (egreso) => {
          if (egreso) {
            this.buildFromEgresoContadorData(egreso, id);
            return;
          }
          this.snackBar.open('Movimiento no encontrado', 'Cerrar', { duration: 2500 });
          this.router.navigate(['/tesoreria/bandeja']);
        },
        error: () => {
          this.snackBar.open('Movimiento no encontrado', 'Cerrar', { duration: 2500 });
          this.router.navigate(['/tesoreria/bandeja']);
        },
      });
  }

  /**
   * Cruza el número de factura/egreso leído del comprobante contra el
   * egreso designado por el contador. Solo informativo (no bloquea):
   * el OCR no siempre detecta el número.
   */
  private cruzarFacturaEgreso(ocr: ComprobantePagoOcr): void {
    const designado = this.egresoData?.numeroFactura ?? '';
    if (!designado.trim()) {
      this.egresoFacturaCoincide = null;
      return;
    }
    const norm = (s: string) => s.replace(/[\s.\-]/g, '').toLowerCase();
    const a = norm(designado);
    const candidatos: string[] = [];
    if (ocr.egreso?.trim()) candidatos.push(ocr.egreso);
    // Excel/Word: la factura suele venir como par clave-valor ("Factura: DEMO-001")
    for (const p of ocr.keyValuePairs ?? []) {
      if (p.value?.trim()) candidatos.push(p.value);
    }
    const hayMatch = candidatos.some((c) => {
      const b = norm(c);
      return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
    });
    const hayDato = candidatos.length > 0;
    this.egresoFacturaCoincide = hayDato ? hayMatch : null;
    if (hayDato && !hayMatch) {
      this.displayToast(
        `Advertencia: el comprobante no referencia la factura "${designado}" del egreso designado. Verifique que sea el pago correcto.`,
        'warning',
      );
    }
    this.cdr.markForCheck();
  }

  /** Verifica en tesorería que el egreso no esté duplicado antes de pagar */
  private verificarDuplicadoEgreso(): void {    const data = this.egresoData;
    if (!data?.numeroFactura || !data?.nitProveedor || !data?.valor || !data?.fecha) {
      this.egresoDupEstado = null;
      return;
    }
    this.egresoDupEstado = 'checking';
    this.controlEgresosService
      .checkDuplicado(data.numeroFactura, data.nitProveedor, Number(data.valor), data.fecha)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const otroDistinto =
            res.existe && (data.id == null || res.registro?.id == null || res.registro.id !== data.id);
          this.egresoDupEstado = otroDistinto ? 'dup' : 'ok';
          if (otroDistinto) {
            this.displayToast(
              'Advertencia: posible egreso duplicado. Revise antes de tramitar el pago.',
              'warning',
            );
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.egresoDupEstado = null;
          this.cdr.markForCheck();
        },
      });
  }

  /** Finaliza el pago del egreso del contador (lo marca PAGADO) */
  private finalizarEgresoContador(): void {
    if (!this.movimiento) return;
    this.finalizando = true;
    this.cdr.markForCheck();

    this.controlEgresosService
      .marcarPagado(this.movimiento.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.finalizando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.procesoFinalizado = true;
          if (this.movimiento) {
            this.movimiento.estadoEgreso = 'Pagado';
            this.movimiento.estadoPago = 'Pagado';
          }
          this.displayToast('Pago tramitado exitosamente. Egreso marcado como pagado.', 'success');
          this.cdr.markForCheck();
        },
        error: (err) => {
          const backendMessage = err?.error?.message || err?.error?.error || null;
          this.displayToast(
            backendMessage || 'Error al finalizar el pago. Intente nuevamente.',
            'error',
          );
          this.cdr.markForCheck();
        },
      });
  }

  private cargarViaticos(id: number, permitirBusquedaLegacy = true): void {
    this.loading = true;
    this.cdr.markForCheck();
    const noDisponible = () => {
      if (permitirBusquedaLegacy) {
        this.cargarMovimiento(id);
        return;
      }
      this.snackBar.open('No se pudo cargar el viático solicitado', 'Cerrar', { duration: 3500 });
      this.router.navigate(['/tesoreria/bandeja']);
    };

    this.tesoreriaService
      .getSolicitudViaticosTesoreriaById(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (viatico) => {
          if (viatico) {
            this.buildFromViaticosData(viatico, id);
            return;
          }
          noDisponible();
        },
        error: noDisponible,
      });
  }

  private cargarMovimiento(id: number): void {
    this.loading = true;
    this.cdr.markForCheck();

    // First try to load from the enriched bandeja endpoint (solicitud-based items)
    this.tramiteService
      .getSolicitudTesoreriaEnriquecida(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (t) => {
          if (t) {
            this.buildFromTramiteData(t, id);
            this.loading = false;
            this.cdr.markForCheck();
          } else {
            this.fallbackCargarMovimiento(id);
          }
        },
        error: () => {
          // Enriched endpoint failed — fallback to original tesorería movimiento
          this.fallbackCargarMovimiento(id);
        },
      });
  }

  private fallbackCargarMovimiento(id: number): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.tesoreriaService
      .getMovimientoById(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (mov) => {
          if (!mov) {
            // Probar flujo de egreso del contador antes de rendirse
            this.cargarEgresoContador(id);
            return;
          }
          this.movimiento = mov;
          this.detalles = mov.detalles ?? [];
          this.initComprobanteStatus();
          this.detectFinalized();
          this.cdr.markForCheck();
        },
        error: () => {
          // Probar flujo de egreso del contador antes de rendirse
          this.cargarEgresoContador(id);
        },
      });
  }

  /** Inicializa estado de comprobante para cada proveedor */
  private initComprobanteStatus(): void {
    this.comprobanteStatus.clear();

    this.detalles.forEach((detalle, index) => {
      const cpArchivo = detalle.archivosEgresoDetalle?.find((a) => a.tipo === 'PAGO');
      // Un estado conciliado o un adjunto no constituye evidencia de lectura OCR.
      this.comprobanteStatus.set(index, {
        archivo: null,
        nombreArchivo: detalle.nombreComprobantePago ?? cpArchivo?.nombre ?? null,
        procesando: false,
        ocrData: null,
        matchPorcentaje: detalle.matchPorcentaje ?? null,
        estado: cpArchivo ? 'ASIGNADO' : 'SIN_CP',
        valorPagado: detalle.valorPagado ?? null,
        verificacionBancaria: null,
        comparacionPrecios: null,
        tipoPago: (detalle.tipoPago as 'COMPLETO' | 'PARCIAL') ?? null,
        porcentajePago: detalle.porcentajePago ?? null,
        archivoEgresoDoc: null,
        nombreEgresoDoc: this.getDocEgresoNombre(detalle),
        validacionBackend: null,
        validandoBackend: false,
        overrideManual: false,
        overrideMotivo: null,
        overrideUsuario: null,
      });
    });
  }

  /**
   * Detecta si el proceso ya fue finalizado (Conciliado/COMPLETADO).
   * Si es así, marca como read-only.
   */
  private detectFinalized(): void {
    if (!this.movimiento) return;
    const isConciliado =
      this.movimiento.estadoPago === 'Conciliado' ||
      this.movimiento.estadoOc === 'Conciliado' ||
      this.movimiento.estadoEgreso === 'Conciliado';
    if (isConciliado || this.movimiento.estadoPago === 'Pagado') {
      this.procesoFinalizado = true;
    }
  }

  // -----------------------------------------
  //  KPIs
  // -----------------------------------------

  get totalProveedores(): number {
    return this.detalles.length;
  }


  get totalValorEgreso(): number {
    return this.detalles.reduce((sum, d) => sum + (d.valorEgreso ?? 0), 0);
  }

  get totalPagado(): number {
    let total = 0;
    this.comprobanteStatus.forEach((status) => {
      if (status.valorPagado) total += status.valorPagado;
    });
    return total;
  }

  get viaticoDetalle(): DetalleSolicitudItem | null {
    return this.detalles.length ? this.detalles[0] : null;
  }

  get viaticoComprobante(): ComprobanteProveedorStatus {
    return this.getComprobanteStatus(0);
  }

  get viaticoTieneOcrLeido(): boolean {
    return !!this.viaticoComprobante.ocrData;
  }

  get viaticoCuentaCorrecta(): boolean {
    return !!this.viaticoComprobante.verificacionBancaria?.todoCorrecto;
  }

  get viaticoMontoCorrecto(): boolean {
    return !!this.viaticoComprobante.comparacionPrecios?.coincideEgresoCp;
  }

  get viaticoBancoCoincide(): boolean {
    return !!this.viaticoComprobante.verificacionBancaria?.coincideBanco;
  }

  get viaticoTitularCoincide(): boolean {
    return !!this.viaticoComprobante.verificacionBancaria?.coincideBeneficiario;
  }

  get viaticoCuentaCoincide(): boolean {
    return !!this.viaticoComprobante.verificacionBancaria?.coincideCuenta;
  }

  get viaticoDiferenciaMonto(): number | null {
    const egreso = this.viaticoDetalle?.valorEgreso ?? null;
    const pagado = this.viaticoComprobante.valorPagado ?? null;
    if (egreso === null || pagado === null) return null;
    return pagado - egreso;
  }

  get requiereConfirmacionMontoNoCoincide(): boolean {
    if (!this.isViaticosFlow || this.viaticoComprobante.estado !== 'ASIGNADO') return false;
    return !this.viaticoMontoCorrecto || !this.viaticoCuentaCoincide;
  }

  get viaticoValidacionesOk(): boolean {
    const status = this.viaticoComprobante;
    return (
      status.estado === 'ASIGNADO' &&
      !!status.ocrData &&
      !!status.verificacionBancaria?.todoCorrecto &&
      !!status.comparacionPrecios?.coincideEgresoCp &&
      (status.valorPagado ?? 0) > 0
    );
  }

  get viaticoPendienteTexto(): string {
    if (this.viaticoComprobante.estado !== 'ASIGNADO') {
      return 'Adjunte y procese el comprobante de pago con OCR.';
    }
    if (!this.viaticoTieneOcrLeido) {
      return 'El OCR del comprobante no devolvio datos suficientes.';
    }
    if (!this.viaticoCuentaCorrecta) {
      return 'La cuenta bancaria detectada no coincide con la cuenta del egreso.';
    }
    if (!this.viaticoMontoCorrecto) {
      return 'El monto del comprobante no coincide con el valor de egreso.';
    }
    return 'Validaciones incompletas.';
  }

  get proveedoresAsignados(): number {
    let count = 0;
    this.comprobanteStatus.forEach((status) => {
      if (status.estado === 'ASIGNADO') count++;
    });
    return count;
  }

  // -----------------------------------------
  //  Expand / Collapse
  // -----------------------------------------

  toggleProveedor(index: number): void {
    this.expandedProveedores.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }

  isProveedorExpanded(index: number): boolean {
    return this.expandedProveedores().has(index);
  }

  toggleNotes(): void {
    this.showNotes.update((val) => !val);
  }

  toggleBulkAssign(): void {
    this.showBulkAssign.update((val) => !val);
  }

  // -----------------------------------------
  //  Comprobante de pago per-provider
  // -----------------------------------------

  onFileSelectedForProvider(event: Event, index: number): void {
    if (this.procesoFinalizado) return;
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.assignFileToProvider(input.files[0], index);
    }
  }

  onDragOverProvider(event: DragEvent, index: number): void {
    event.preventDefault();
    if (this.procesoFinalizado) return;
    this.draggingIndex = index;
    this.cdr.markForCheck();
  }

  onDragLeaveProvider(event: DragEvent): void {
    event.preventDefault();
    this.draggingIndex = null;
    this.cdr.markForCheck();
  }

  onDropProvider(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.draggingIndex = null;
    if (event.dataTransfer?.files?.length) {
      this.assignFileToProvider(event.dataTransfer.files[0], index);
    }
    this.cdr.markForCheck();
  }

  private assignFileToProvider(file: File, index: number): void {
    const status = this.comprobanteStatus.get(index);
    if (!status) return;
    status.archivo = file;
    status.nombreArchivo = file.name;
    status.estado = 'SIN_CP';
    status.validacionBackend = null;
    status.validandoBackend = false;
    status.overrideManual = false;
    status.overrideMotivo = null;
    status.overrideUsuario = null;
    this.cdr.markForCheck();
    this.procesarComprobanteProveedor(index);
  }

  procesarComprobanteProveedor(index: number): void {
    const status = this.comprobanteStatus.get(index);
    if (!status?.archivo) return;

    status.procesando = true;
    status.estado = 'PROCESANDO';
    this.cdr.markForCheck();

    this.cpService
      .analizarComprobante(status.archivo)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          status.procesando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (ocr) => {
          status.ocrData = ocr;
          status.valorPagado = ocr.valorPago;
          const detalle = this.detalles[index];
          const valorEsperado = detalle.valorEgreso ?? detalle.valorOc ?? 0;
          if (valorEsperado > 0 && ocr.valorPago) {
            const ratio = Math.min(ocr.valorPago / valorEsperado, valorEsperado / ocr.valorPago);
            status.matchPorcentaje = Math.round(ratio * 100);
          } else {
            status.matchPorcentaje = ocr.valorPago ? 80 : 0;
          }
          status.estado = 'ASIGNADO';

          // --- Cruce factura (flujo egreso contador): lo leído vs lo designado ---
          if (this.isEgresoContadorFlow) {
            this.cruzarFacturaEgreso(ocr);
          }

          // --- Verificación bancaria: OCR vs datos del sistema ---
          status.verificacionBancaria = this.verificarDatosBancarios(detalle, ocr);

          // --- Comparación de precios: OC vs Egreso vs CP ---
          status.comparacionPrecios = this.compararPreciosProveedor(detalle, ocr);

          // --- Tipo de pago: completo o parcial ---
          const result = this.calcularTipoPago(detalle, ocr);
          status.tipoPago = result.tipo;
          status.porcentajePago = result.porcentaje;
          status.sobrepago = result.sobrepago;

          // Mostrar advertencia si algo no coincide
          if (status.verificacionBancaria && !status.verificacionBancaria.todoCorrecto) {
            this.displayToast(
              'Advertencia: Los datos bancarios del CP no coinciden con el sistema para ' + detalle.proveedorNombre,
              'warning',
            );
          } else if (status.comparacionPrecios && !status.comparacionPrecios.todosCoinciden) {
            this.displayToast(
              'Advertencia: Los valores de OC, Egreso y CP no coinciden para ' + detalle.proveedorNombre,
              'warning',
            );
          } else {
            this.displayToast('Comprobante verificado correctamente para ' + detalle.proveedorNombre, 'success');
          }

          // --- Subir CP al backend y DESPUÉS validar (secuencial: evita race) ---
          this.uploadCpToBackend(index, () => this.validarEnBackend(index));

          this.cdr.markForCheck();
        },
        error: () => {
          status.estado = 'ERROR';
          this.displayToast('Error al procesar comprobante', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  removeComprobanteProveedor(index: number): void {
    if (this.procesoFinalizado) return;
    const status = this.comprobanteStatus.get(index);
    if (!status) return;
    status.archivo = null;
    status.nombreArchivo = null;
    status.ocrData = null;
    status.matchPorcentaje = null;
    status.estado = 'SIN_CP';
    status.valorPagado = null;
    status.verificacionBancaria = null;
    status.comparacionPrecios = null;
    status.tipoPago = null;
    status.porcentajePago = null;
    status.validacionBackend = null;
    status.validandoBackend = false;
    status.overrideManual = false;
    status.overrideMotivo = null;
    status.overrideUsuario = null;
    if (this.isEgresoContadorFlow) {
      this.egresoFacturaCoincide = null;
    }
    this.cdr.markForCheck();
  }

  /** Nombre del documento de egreso ya persistido en el detalle (si existe) */
  private getDocEgresoNombre(detalle: DetalleSolicitudItem | undefined): string | null {
    const doc = detalle?.archivosEgresoDetalle?.find((a) => a.tipo === 'EGRESO');
    return doc?.nombre ?? null;
  }

  onFileSelectedEgreso(event: Event, index: number): void {
    if (this.procesoFinalizado) return;
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.asignarDocEgreso(input.files[0], index);
      input.value = '';
    }
  }

  onDropEgreso(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.procesoFinalizado) return;
    if (event.dataTransfer?.files?.length) {
      this.asignarDocEgreso(event.dataTransfer.files[0], index);
    }
    this.cdr.markForCheck();
  }

  private asignarDocEgreso(file: File, index: number): void {
    const status = this.comprobanteStatus.get(index);
    if (!status) return;
    status.archivoEgresoDoc = file;
    status.nombreEgresoDoc = file.name;
    this.cdr.markForCheck();
    this.subirDocumentoEgreso(index);
  }

  subirDocumentoEgreso(index: number): void {
    const status = this.comprobanteStatus.get(index);
    if (!status?.archivoEgresoDoc || !this.movimiento) return;

    const detalle = this.detalles[index];
    const proveedorRelacionId = detalle.proveedorRelacionId ?? index;

    const upload$ = this.isViaticosFlow
      ? this.tesoreriaService.subirDocumentoEgresoViaticos(this.movimiento.id, status.archivoEgresoDoc)
      : this.tramiteService.subirDocumentoEgreso(this.movimiento.id, proveedorRelacionId, status.archivoEgresoDoc);

    upload$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res: any) => {
        (status as any).docEgresoUrl = res?.url ?? null;
        this.displayToast('Documento de egreso adjuntado correctamente.', 'success');
        this.cdr.markForCheck();
      },
      error: () => {
        status.archivoEgresoDoc = null;
        status.nombreEgresoDoc = null;
        this.displayToast('Error al subir el documento de egreso.', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  removeDocEgreso(index: number): void {
    if (this.procesoFinalizado) return;
    const status = this.comprobanteStatus.get(index);
    if (!status) return;
    status.archivoEgresoDoc = null;
    status.nombreEgresoDoc = null;
    (status as any).docEgresoUrl = null;
    this.cdr.markForCheck();
  }

  /** Upload the CP file to the backend for persistence in S3 */
  private uploadCpToBackend(index: number, done?: () => void): void {
    const status = this.comprobanteStatus.get(index);
    if (!status?.archivo || !this.movimiento) {
      done?.();
      return;
    }

    const detalle = this.detalles[index];
    const proveedorRelacionId = detalle.proveedorRelacionId ?? index;

    const upload$ = this.isViaticosFlow
      ? this.tesoreriaService.subirComprobantePagoViaticos(this.movimiento.id, status.archivo)
      : this.tramiteService.subirComprobantePago(this.movimiento.id, proveedorRelacionId, status.archivo);

    upload$.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        done?.();
      }),
    ).subscribe({
      next: (res: any) => {
        (status as any).cpUrl = res.url;
        (status as any).cpS3Key = res.s3Key ?? res.key ?? null;
      },
      error: (err) => {
        console.warn('Error subiendo CP al backend (el OCR ya se procesó):', err);
      },
    });
  }

  /** Open a CP file URL in a new tab for viewing */
  verArchivoCp(index: number): void {
    const status = this.comprobanteStatus.get(index) as any;
    if (status?.cpUrl) {
      window.open(status.cpUrl, '_blank');
      return;
    }
    const detalle = this.detalles[index];
    const cpArchivo = detalle.archivosEgresoDetalle?.find((a) => a.tipo === 'PAGO');
    if (cpArchivo?.url) {
      window.open(cpArchivo.url, '_blank');
    }
  }

  getComprobanteStatus(index: number): ComprobanteProveedorStatus {
    return (
      this.comprobanteStatus.get(index) ?? {
        archivo: null,
        nombreArchivo: null,
        procesando: false,
        ocrData: null,
        matchPorcentaje: null,
        estado: 'SIN_CP' as const,
        valorPagado: null,
        verificacionBancaria: null,
        comparacionPrecios: null,
        tipoPago: null,
        porcentajePago: null,
        archivoEgresoDoc: null,
        nombreEgresoDoc: null,
        validacionBackend: null,
        validandoBackend: false,
        overrideManual: false,
        overrideMotivo: null,
        overrideUsuario: null,
      }
    );
  }

  tieneComprobanteExistente(detalle: DetalleSolicitudItem): boolean {
    return !!detalle.archivosEgresoDetalle?.some((a) => a.tipo === 'PAGO');
  }

  /** Mutación segura de campos override: opera sobre el status REAL del Map. */
  setOverrideField(index: number, field: 'overrideManual' | 'overrideMotivo' | 'overrideUsuario', value: any): void {
    let status = this.comprobanteStatus.get(index);
    if (!status) {
      status = {
        archivo: null,
        nombreArchivo: null,
        procesando: false,
        ocrData: null,
        matchPorcentaje: null,
        estado: 'SIN_CP' as const,
        valorPagado: null,
        verificacionBancaria: null,
        comparacionPrecios: null,
        tipoPago: null,
        porcentajePago: null,
        archivoEgresoDoc: null,
        nombreEgresoDoc: null,
        validacionBackend: null,
        validandoBackend: false,
        overrideManual: false,
        overrideMotivo: null,
        overrideUsuario: null,
      };
      this.comprobanteStatus.set(index, status);
    }
    (status as any)[field] = value;
    this.comprobanteStatus.set(index, status);
    this.cdr.markForCheck();
  }

  getComprobanteExistente(detalle: DetalleSolicitudItem): ArchivoAdjunto | null {
    return detalle.archivosEgresoDetalle?.find((a) => a.tipo === 'PAGO') ?? null;
  }

  getEstadoProveedor(index: number): string {
    const status = this.comprobanteStatus.get(index);
    if (status?.estado === 'ASIGNADO') return 'Asignado';
    if (status?.estado === 'PROCESANDO') return 'Procesando...';
    if (status?.estado === 'ERROR') return 'Error';
    return 'Pendiente';
  }

  isEstadoAsignado(index: number): boolean {
    const status = this.comprobanteStatus.get(index);
    return status?.estado === 'ASIGNADO';
  }

  // -----------------------------------------
  //  Bulk assign CP by provider
  // -----------------------------------------

  /** Returns unique provider names that have at least 2 OCs */
  get proveedoresUnicos(): { nombre: string; nit: string | null; count: number }[] {
    const map = new Map<string, { nombre: string; nit: string | null; count: number }>();
    for (const d of this.detalles) {
      const key = d.proveedorNombre?.trim() ?? '';
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, { nombre: key, nit: d.proveedorNit ?? null, count: 1 });
      }
    }
    // Return all providers (even those with 1 OC — useful for bulk)
    return Array.from(map.values());
  }

  /** Count how many OCs a given provider has */
  getProveedorOcCount(nombre: string): number {
    return this.detalles.filter(d => d.proveedorNombre?.trim() === nombre).length;
  }

  /** Count how many OCs of a provider already have a CP */
  getProveedorAsignadoCount(nombre: string): number {
    let count = 0;
    this.detalles.forEach((d, idx) => {
      if (d.proveedorNombre?.trim() === nombre && this.isEstadoAsignado(idx)) count++;
    });
    return count;
  }

  onBulkFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.bulkSelectedProveedor) return;

    const file = input.files[0];
    const proveedorName = this.bulkSelectedProveedor.trim();

    // Find all indices belonging to this provider
    const indices: number[] = [];
    this.detalles.forEach((d, idx) => {
      if (d.proveedorNombre?.trim() === proveedorName) {
        indices.push(idx);
      }
    });

    if (indices.length === 0) {
      this.displayToast('No se encontraron OCs para ese proveedor', 'warning');
      input.value = '';
      return;
    }

    // Mark all as processing
    this.bulkProcessing = true;
    for (const idx of indices) {
      const status = this.comprobanteStatus.get(idx);
      if (status) {
        status.archivo = file;
        status.nombreArchivo = file.name;
        status.estado = 'PROCESANDO';
        status.procesando = true;
      }
    }
    this.cdr.markForCheck();

    // Process OCR once, then apply to all
    this.cpService.analizarComprobante(file).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (ocr) => {
        for (const idx of indices) {
          const status = this.comprobanteStatus.get(idx);
          if (!status) continue;
          const detalle = this.detalles[idx];

          status.ocrData = ocr;
          status.valorPagado = ocr.valorPago;
          status.procesando = false;

          const valorEsperado = detalle.valorEgreso ?? detalle.valorOc ?? 0;
          if (valorEsperado > 0 && ocr.valorPago) {
            const ratio = Math.min(ocr.valorPago / valorEsperado, valorEsperado / ocr.valorPago);
            status.matchPorcentaje = Math.round(ratio * 100);
          } else {
            status.matchPorcentaje = ocr.valorPago ? 80 : 0;
          }
          status.estado = 'ASIGNADO';
          status.verificacionBancaria = this.verificarDatosBancarios(detalle, ocr);
          status.comparacionPrecios = this.compararPreciosProveedor(detalle, ocr);
          const result = this.calcularTipoPago(detalle, ocr);
          status.tipoPago = result.tipo;
          status.porcentajePago = result.porcentaje;
          status.sobrepago = result.sobrepago;
        }
        this.bulkProcessing = false;
        this.displayToast(
          `CP asignado a ${indices.length} ordenes de ${proveedorName}`,
          'success',
        );
        this.cdr.markForCheck();
        // Subir y validar cada comprobante en el sistema
        for (const idx of indices) {
          this.uploadCpToBackend(idx, () => this.validarEnBackend(idx));
        }
        this.displayToast(
          `Se validarán ${indices.length} comprobantes en el sistema...`,
          'info',
        );
        this.cdr.markForCheck();
      },
      error: () => {
        for (const idx of indices) {
          const status = this.comprobanteStatus.get(idx);
          if (status) {
            status.estado = 'ERROR';
            status.procesando = false;
          }
        }
        this.bulkProcessing = false;
        this.displayToast('Error al procesar comprobante masivo', 'error');
        this.cdr.markForCheck();
      },
    });

    input.value = '';
  }

  // -----------------------------------------
  //  Helpers
  // -----------------------------------------

  getProveedorInitial(name: string): string {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  get estadoLabelHeader(): string {
    if (this.procesoFinalizado) return this.isViaticosFlow || this.isEgresoContadorFlow ? 'Pagado' : 'Conciliado';
    const asignados = this.proveedoresAsignados;
    const total = this.totalProveedores;
    if (asignados === total && total > 0) return 'Completado';
    if (asignados > 0) return asignados + '/' + total + ' asignados';
    return 'Pendiente';
  }

  get estadoBadgeClass(): string {
    if (this.procesoFinalizado) return 'badge-completado';
    const asignados = this.proveedoresAsignados;
    const total = this.totalProveedores;
    if (asignados === total && total > 0) return 'badge-completado';
    if (asignados > 0) return 'badge-en-proceso';
    return 'badge-pendiente';
  }

  // -----------------------------------------
  //  Verificación bancaria OCR vs Sistema
  // -----------------------------------------

  private verificarDatosBancarios(
    detalle: DetalleSolicitudItem,
    ocr: ComprobantePagoOcr,
  ): VerificacionBancaria {
    const diferencias: string[] = [];

    const bancoOcr = ocr.banco?.trim()?.toUpperCase() ?? null;
    const bancoSistema = detalle.proveedorBanco?.trim()?.toUpperCase() ?? null;
    const cuentaOcr = ocr.cuentaDebitar?.replace(/[\s\-.]/g, '') ?? null;
    const cuentaSistema = detalle.proveedorNumeroCuenta?.replace(/[\s\-.]/g, '') ?? null;
    const beneficiarioOcr = ocr.beneficiario?.trim()?.toUpperCase() ?? null;
    const beneficiarioSistema = detalle.proveedorNombre?.trim()?.toUpperCase() ?? null;

    const coincideBanco = !!(bancoOcr && bancoSistema &&
      (bancoOcr.includes(bancoSistema) || bancoSistema.includes(bancoOcr)));
    if (!coincideBanco && bancoOcr && bancoSistema) {
      diferencias.push(`Banco CP: "${ocr.banco}" ≠ Banco Sistema: "${detalle.proveedorBanco}"`);
    } else if (!bancoOcr) {
      diferencias.push('No se detectó banco en el comprobante');
    }

    const coincideCuenta = !!(cuentaOcr && cuentaSistema &&
      (cuentaOcr.includes(cuentaSistema) || cuentaSistema.includes(cuentaOcr)));
    if (!coincideCuenta && cuentaOcr && cuentaSistema) {
      diferencias.push(`Cuenta CP: "${ocr.cuentaDebitar}" ≠ Cuenta Sistema: "${detalle.proveedorNumeroCuenta}"`);
    } else if (!cuentaOcr) {
      diferencias.push('No se detectó número de cuenta en el comprobante');
    }

    const coincideBeneficiario = !!(beneficiarioOcr && beneficiarioSistema &&
      (beneficiarioOcr.includes(beneficiarioSistema) || beneficiarioSistema.includes(beneficiarioOcr)));
    if (!coincideBeneficiario && beneficiarioOcr && beneficiarioSistema) {
      diferencias.push(`Beneficiario CP: "${ocr.beneficiario}" ≠ Proveedor Sistema: "${detalle.proveedorNombre}"`);
    }

    return {
      bancoOcr: ocr.banco,
      bancoSistema: detalle.proveedorBanco ?? null,
      cuentaOcr: ocr.cuentaDebitar,
      cuentaSistema: detalle.proveedorNumeroCuenta ?? null,
      beneficiarioOcr: ocr.beneficiario,
      beneficiarioSistema: detalle.proveedorNombre,
      coincideBanco,
      coincideCuenta,
      coincideBeneficiario,
      todoCorrecto: coincideBanco && coincideCuenta && coincideBeneficiario,
      diferencias,
    };
  }

  // -----------------------------------------
  //  Comparación de precios OC vs Egreso vs CP
  // -----------------------------------------

  private compararPreciosProveedor(
    detalle: DetalleSolicitudItem,
    ocr: ComprobantePagoOcr,
  ): ComparacionPreciosLocal {
    const valorEgreso = detalle.valorEgreso ?? null;
    const valorCP = ocr.valorPago;
    const diferencias: string[] = [];
    const tolerance = 1; // $1 de tolerancia

    const coincideEgresoCp = valorEgreso !== null && valorCP !== null &&
      Math.abs(valorEgreso - valorCP) <= tolerance;
    if (valorEgreso !== null && valorCP !== null && !coincideEgresoCp) {
      diferencias.push(`Egreso (${this.formatCurrency(valorEgreso)}) ≠ CP (${this.formatCurrency(valorCP)})`);
    }

    if (valorEgreso === null) diferencias.push('Sin datos de Egreso');
    if (valorCP === null) diferencias.push('No se detectó valor en el comprobante');

    return {
      valorOC: null,
      valorEgreso,
      valorCP,
      coincideOcEgreso: false,
      coincideOcCp: false,
      coincideEgresoCp,
      todosCoinciden: coincideEgresoCp,
      diferencias,
    };
  }

  // -----------------------------------------
  //  Tipo de pago: completo o parcial
  // -----------------------------------------

  private calcularTipoPago(
    detalle: DetalleSolicitudItem,
    ocr: ComprobantePagoOcr,
  ): { tipo: 'COMPLETO' | 'PARCIAL'; porcentaje: number; sobrepago: boolean } {
    const valorEsperado = detalle.valorEgreso ?? detalle.valorOc ?? 0;
    const valorPagado = ocr.valorPago ?? 0;

    if (valorEsperado <= 0 || valorPagado <= 0) {
      return { tipo: 'PARCIAL', porcentaje: 0, sobrepago: false };
    }

    const porcentaje = Math.round((valorPagado / valorEsperado) * 100);
    // Tolerancia del 1% para considerar completo
    const esCompleto = Math.abs(valorPagado - valorEsperado) < Math.max(valorEsperado * 0.01, 1);
    const sobrepago = porcentaje > 100;

    return {
      tipo: esCompleto ? 'COMPLETO' : 'PARCIAL',
      porcentaje,
      sobrepago,
    };
  }

  /** Cuenta total de checks correctos para un proveedor */
  getChecksCorrectos(index: number): number {
    const status = this.comprobanteStatus.get(index);
    if (!status) return 0;
    let count = 0;
    if (status.verificacionBancaria?.todoCorrecto) count++;
    if (status.comparacionPrecios?.todosCoinciden) count++;
    if (status.tipoPago === 'COMPLETO') count++;
    return count;
  }

  /** Total de checks posibles */
  getTotalChecks(): number {
    return 3; // banco, precios, pago completo
  }

  // -----------------------------------------
  //  Toast
  // -----------------------------------------

  private displayToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }

  // -----------------------------------------
  //  Validación automática backend (bloqueante)
  // -----------------------------------------

  /**
   * Llama a POST /api/v1/comprobantes/validar con lo extraído del OCR y lo
   * esperado del egreso/factura. El veredicto se persiste en el backend y
   * finalizarProceso lo exige (o un override auditado).
   */
  validarEnBackend(index: number): void {
    const status = this.comprobanteStatus.get(index);
    const detalle = this.detalles[index];
    if (!status?.ocrData || !detalle || !this.movimiento) return;
    const ocr = status.ocrData;
    status.validandoBackend = true;
    status.validacionBackend = null;
    this.cdr.markForCheck();

    this.tramiteService
      .validarComprobante({
        solicitudId: this.movimiento.id,
        proveedorRelacionId: detalle.proveedorRelacionId ?? index,
        valorExtraido: ocr.valorPago ?? status.valorPagado ?? null,
        cuentaExtraida: ocr.cuentaDebitar ?? null,
        bancoExtraido: ocr.banco ?? null,
        beneficiarioExtraido: ocr.beneficiario ?? null,
        conceptoExtraido: ocr.nombrePago ?? ocr.referencia ?? null,
        nombreArchivo: status.nombreArchivo ?? null,
        valorEsperado: detalle.valorEgreso ?? detalle.valorOc ?? null,
        cuentaEsperada: detalle.proveedorNumeroCuenta ?? null,
        beneficiarioEsperado: detalle.proveedorNombre ?? null,
        descripcionEsperada:
          this.movimiento.concepto ?? detalle.numeroEgreso ?? detalle.numeroOc ?? null,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          status.validandoBackend = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (res) => {
          status.validacionBackend = res;
          if (res.veredicto === 'APROBADO') {
            this.displayToast(
              'Validación del sistema: comprobante APROBADO para ' + detalle.proveedorNombre,
              'success',
            );
          } else {
            this.displayToast(
              'Validación del sistema: RECHAZADO para ' + detalle.proveedorNombre
                + '. ' + (res.diferencias?.[0] ?? 'Revise monto, beneficiario, cuenta y descripción.'),
              'error',
            );
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.displayToast(
            'No se pudo validar el comprobante en el sistema para ' + detalle.proveedorNombre,
            'error',
          );
          this.cdr.markForCheck();
        },
      });
  }

  /** Un proveedor está validado si el backend lo APROBÓ o hay override auditado */
  isProveedorValidado(index: number): boolean {
    const s = this.comprobanteStatus.get(index);
    if (!s || s.estado !== 'ASIGNADO') return false;
    if (s.validacionBackend?.veredicto === 'APROBADO') return true;
    return !!s.overrideManual && !!s.overrideMotivo && !!s.overrideUsuario;
  }

  // -----------------------------------------
  //  Finalizar Proceso
  // -----------------------------------------

  /** Verifica si se puede finalizar: todos los proveedores tienen CP asignado */
  get canFinalize(): boolean {
    if (this.procesoFinalizado || this.finalizando) return false;
    if (this.totalProveedores === 0) return false;
    // Flujo egreso del contador: el sistema compara al final.
    // Solo se deja pagar si hay comprobante del tesorero y el monto
    // coincide con el fijado por el contador (y no hay duplicado).
    if (this.isEgresoContadorFlow) {
      if (this.egresoDupEstado === 'dup') return false;
      const s = this.getComprobanteStatus(0);
      return (
        s.estado === 'ASIGNADO' &&
        !!s.ocrData &&
        !!s.comparacionPrecios?.coincideEgresoCp
      );
    }
    if (this.proveedoresAsignados !== this.totalProveedores) return false;
    // Bloqueo por validación del sistema: exige APROBADO u override auditado
    for (let i = 0; i < this.detalles.length; i++) {
      if (!this.isProveedorValidado(i)) return false;
    }
    return true;
  }

  /** Estado del comprobante del egreso (flujo contador): lo sube el tesorero */
  get egresoCpStatus(): ComprobanteProveedorStatus {
    return this.getComprobanteStatus(0);
  }

  /** Al tesorero le falta subir el comprobante de pago */
  get egresoFaltaComprobante(): boolean {
    return this.egresoCpStatus.estado !== 'ASIGNADO' || !this.egresoCpStatus.ocrData;
  }

  /** El monto del comprobante coincide con el fijado por el contador */
  get egresoMontoCoincide(): boolean {
    return !!this.egresoCpStatus.comparacionPrecios?.coincideEgresoCp;
  }

  /** Resumen de verificaciones para el botón de finalizar */
  get checksResumen(): { total: number; correctos: number } {
    let total = 0;
    let correctos = 0;
    this.comprobanteStatus.forEach((status, idx) => {
      if (status.estado === 'ASIGNADO') {
        total += this.getTotalChecks();
        correctos += this.getChecksCorrectos(idx);
      }
    });
    return { total, correctos };
  }

  finalizarProceso(confirmarValorNoConcuerda = false): void {
    if (!this.canFinalize || !this.movimiento) return;

    // Flujo egreso del contador: pedir confirmación del egreso designado
    if (this.isEgresoContadorFlow) {
      this.showEgresoDesignadoModal = true;
      this.cdr.markForCheck();
      return;
    }

    if (this.requiereConfirmacionMontoNoCoincide && !confirmarValorNoConcuerda) {
      this.showMontoNoCoincideModal = true;
      this.cdr.markForCheck();
      return;
    }

    this.showMontoNoCoincideModal = false;
    this.finalizando = true;
    this.cdr.markForCheck();

    // Build conciliation details per provider to persist in the backend
    // Incluye override auditado cuando el veredicto fue RECHAZADO.
    const detallesConciliacion = this.detalles.map((detalle, index) => {
      const status = this.comprobanteStatus.get(index);
      const overrideManual =
        (status?.overrideManual === true) || (confirmarValorNoConcuerda === true);
      return {
        proveedorRelacionId: detalle.proveedorRelacionId ?? index,
        valorPagado: status?.valorPagado ?? null,
        matchPorcentaje: status?.matchPorcentaje ?? null,
        tipoPago: status?.tipoPago ?? null,
        porcentajePago: status?.porcentajePago ?? null,
        nombreArchivo: status?.nombreArchivo ?? null,
        comprobanteUrl: (status as any)?.cpUrl ?? null,
        comprobanteS3Key: (status as any)?.cpS3Key ?? null,
        overrideManual,
        overrideMotivo: status?.overrideMotivo ?? (confirmarValorNoConcuerda ? 'Confirmación modal tesorería: monto no coincide aceptado' : null),
        overrideUsuario: status?.overrideUsuario ?? (confirmarValorNoConcuerda ? 'TESORERIA' : null),
      };
    });

    const firstStatus = this.comprobanteStatus.get(0);
    if (this.isViaticosFlow) {
      const vp = firstStatus?.valorPagado;
      if (vp == null || !(vp > 0)) {
        this.displayToast('Sin valor de pago válido del comprobante. Reprocese el CP.', 'error');
        this.finalizando = false;
        this.cdr.markForCheck();
        return;
      }
    }
    const finalize$ = this.isViaticosFlow
      ? this.tesoreriaService.finalizarPagoViaticos(this.movimiento.id, {
          valorPagado: Number(firstStatus?.valorPagado),
          bancoComprobantePago: firstStatus?.ocrData?.banco ?? null,
          numeroCuentaComprobantePago: firstStatus?.ocrData?.cuentaDebitar ?? null,
          nombreTitularComprobantePago: firstStatus?.ocrData?.beneficiario ?? null,
          confirmarValorNoConcuerda: confirmarValorNoConcuerda,
          conceptoComprobantePago: firstStatus?.ocrData?.nombrePago ?? firstStatus?.ocrData?.referencia ?? null,
          descripcionEsperada: this.movimiento.concepto ?? null,
          overrideMotivo: firstStatus?.overrideMotivo ?? null,
          overrideUsuario: firstStatus?.overrideUsuario ?? null,
        })
      : this.tramiteService.finalizarPago(this.movimiento.id, detallesConciliacion);

    finalize$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.finalizando = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.procesoFinalizado = true;
          // Update local movimiento status
          if (this.movimiento) {
            if (!this.isViaticosFlow) this.movimiento.estadoOc = 'Conciliado';
            this.movimiento.estadoEgreso = this.isViaticosFlow ? 'Pagado' : 'Conciliado';
            this.movimiento.estadoPago = this.isViaticosFlow ? 'Pagado' : 'Conciliado';
          }
          this.displayToast(
            this.isViaticosFlow ? 'Pago de viáticos registrado correctamente.' : 'Proceso finalizado exitosamente. Todos los estados fueron actualizados a Conciliado.',
            'success',
          );
          this.cdr.markForCheck();
        },
        error: (err) => {
          const backendMessage = err?.error?.message || err?.error?.error || null;
          this.displayToast(
            backendMessage || 'Error al finalizar el proceso. Intente nuevamente.',
            'error',
          );
          this.cdr.markForCheck();
        },
      });
  }

  // -----------------------------------------
  //  Navigation
  // -----------------------------------------

  cerrarModalMontoNoCoincide(): void {
    this.showMontoNoCoincideModal = false;
    this.cdr.markForCheck();
  }

  confirmarFinalizarConMontoNoCoincide(): void {
    this.showMontoNoCoincideModal = false;
    this.finalizarProceso(true);
  }

  cerrarEgresoDesignadoModal(): void {
    this.showEgresoDesignadoModal = false;
    this.cdr.markForCheck();
  }

  confirmarPagoEgresoDesignado(): void {
    this.showEgresoDesignadoModal = false;
    this.finalizarEgresoContador();
  }

  volver(): void {
    this.router.navigate(['/tesoreria/bandeja']);
  }
}
