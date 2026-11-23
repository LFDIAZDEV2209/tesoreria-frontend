import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed, OnDestroy, TrackByFunction } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TramitarContabilidadService } from '../services/tramitar-contabilidad.service';
import { ProveedorService } from '../../proveedores/services/proveedor.service';
import { TramitarRequisicionService } from '../../compras/tramitar-requisicion/services/tramitar-requisicion.service';
import { ComprasService } from '../../compras/services/compras.service';
import {
  OcrScanningService,
  TextractResponse,
} from '../../compras/tramitar-requisicion/services/ocr-scanning.service';
import {
  RegistroContable,
  ContabilidadRequest,
  ContabilidadArchivos,
  CuentaContableParam,
  OcrContabilidadResult,
  EgresoOrdenCompra,
  LineaEgreso,
  ESTADOS_LABELS,
  EstadoContable,
} from '../models/contabilidad.model';
import { Proveedor } from '../../proveedores/models/proveedor.model';
import { TramiteRequisicion } from '../../compras/tramitar-requisicion/models/tramitar-requisicion.model';
import { SolicitudCompra } from '../../compras/models/compra.model';
import { Paso1RequisicionComponent } from '../../compras/tramitar-requisicion/steps/paso1-requisicion/paso1-requisicion.component';

@Component({
  selector: 'app-tramitar-contabilidad',
  standalone: true,
  imports: [SelectBuscableDirective,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    Paso1RequisicionComponent,
  ],
  templateUrl: './tramitar-contabilidad.component.html',
  styleUrls: ['./tramitar-contabilidad.component.scss'],
})
export class TramitarContabilidadComponent implements OnInit, OnDestroy {
  // ── Data ──
  registro = signal<RegistroContable | null>(null);
  proveedores = signal<Proveedor[]>([]);
  tramites = signal<TramiteRequisicion[]>([]);
  tramiteAsociado = signal<TramiteRequisicion | null>(null);
  solicitudAsociada = signal<SolicitudCompra | null>(null);

  // ── UI ──
  loading = signal(true);
  activeSection = signal(0);
  successMessage = signal('');
  errorMessage = signal('');

  // ── PASO 2: Carga de Egreso + OCR ──
  pdfPreviewUrl = signal<SafeResourceUrl | null>(null);
  private pdfObjectUrl: string | null = null;
  documentosCargadosSection1 = signal<any[]>([]);
  isDragging = signal(false);
  isScanning = signal(false);
  ocrResult = signal<OcrContabilidadResult | null>(null);
  ocrRawData = computed(() => {
    const selId = this.selectedEgresoId();
    if (selId) {
      const doc = this.documentosCargadosSection1().find((d: any) => d.id === selId);
      return (doc?.ocrData as TextractResponse) || null;
    }
    return this.getFirstOcrRaw() as TextractResponse | null;
  });
  lineasEgreso = signal<LineaEgreso[]>([]);
  totalDebito = computed(() =>
    this.lineasEgreso().reduce((sum, l) => sum + l.debito, 0),
  );
  totalCredito = computed(() =>
    this.lineasEgreso().reduce((sum, l) => sum + l.credito, 0),
  );

  // ── Cuenta contable (solo referencia auxiliar) ──
  cuentasContables = signal<CuentaContableParam[]>([]);
  cuentaSeleccionada = signal<CuentaContableParam | null>(null);
  cuentaBusqueda = signal('');
  cuentaValidada = signal(false);
  cuentaError = signal('');
  lineaEditandoCuentaIndex = signal<number | null>(null);
  cuentaBusquedaLinea = signal('');
  cuentasFiltradas = signal<CuentaContableParam[]>([]);
  modalCuentaVisible = signal(false);
  modalCuentaLineaIndex = signal<number | null>(null);
  modalCuentaBusqueda = signal('');
  modalCuentasFiltradas = signal<CuentaContableParam[]>([]);

  // ── Débito / Crédito auxiliares ──
  debitoManual = signal(0);
  creditoManual = signal(0);

  // ── PASO 3: Asociar Egreso a Orden de Compra ──
  asociacionesEgreso = signal<EgresoOrdenCompra[]>([]);
  ordenCompraSeleccionada = signal('');
  ocsSeleccionadas = signal<string[]>([]);
  requisicionSeleccionada = signal('');
  valoresDesdeOC = signal(false);
  ocReferencia = signal('');

  // ── Multi-egreso / proveedores agrupados ──
  selectedEgresoId = signal<string | null>(null);
  egresoAsignadoPorProveedor = signal<Map<string, string>>(new Map());
  expandedProveedorIndices = signal<Set<number>>(new Set());
  selectedOCsPerProveedor = signal<Map<string, Set<string>>>(new Map());

  // ── Form ──
  form!: FormGroup;

  // ── Constants ──
  estadosLabels = ESTADOS_LABELS;
  readonly TOTAL_SECTIONS = 2;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tramitarContabilidadService: TramitarContabilidadService,
    private proveedorService: ProveedorService,
    private tramitarService: TramitarRequisicionService,
    private comprasService: ComprasService,
    private ocrService: OcrScanningService,
    private fb: FormBuilder,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.tramitarContabilidadService
      .cargarCuentasContables({ activa: true })
      .subscribe((cuentas) => this.cuentasContables.set(cuentas || []));

    const registroIdParam = this.route.snapshot.paramMap.get('registroId');
    const solicitudIdParam =
      this.route.snapshot.queryParamMap.get('solicitudId');
    const registroId = registroIdParam ? Number(registroIdParam) : NaN;
    const solicitudId = solicitudIdParam ? Number(solicitudIdParam) : NaN;

    if (Number.isFinite(registroId) && registroId > 0) {
      this.loadRegistro(registroId);
      return;
    }

    if (Number.isFinite(solicitudId) && solicitudId > 0) {
      this.loadFromSolicitud(solicitudId);
      return;
    }

    this.loading.set(false);
    this.router.navigate(['/contabilidad/gestion']);
  }

  // ════════════════════════════════════════════════
  //  DATA LOADING
  // ════════════════════════════════════════════════
  private loadRegistro(id: number): void {
    this.loading.set(true);
    this.tramitarContabilidadService.getById(id).subscribe({
      next: (reg) => {
        this.registro.set(reg);
        this.patchForm(reg);
        this.buildLineasFromRegistro(reg);
        this.loadRelatedData(reg);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Error al cargar el registro contable');
        this.loading.set(false);
      },
    });
  }

  private loadFromSolicitud(solicitudId: number): void {
    this.loading.set(true);
    this.proveedorService.getProveedores().subscribe((proveedores) => {
      this.proveedores.set(proveedores);

      this.comprasService.getSolicitudById(solicitudId).subscribe({
        next: (solicitud) => {
          this.solicitudAsociada.set(solicitud);

          this.tramitarService
            .getTramiteBySolicitudId(solicitudId)
            .subscribe((tramite) => {
              if (tramite) {
                this.tramiteAsociado.set(tramite);
                const tramitesConOc = this.buildTramitesConOrdenes(tramite);
                this.tramites.set(tramitesConOc);

                const primeraOc = tramitesConOc[0]?.ordenCompra;
                if (primeraOc?.numeroOC) {
                  this.ocReferencia.set(primeraOc.numeroOC);
                  this.ordenCompraSeleccionada.set(primeraOc.numeroOC);
                }
              } else {
                this.tramiteAsociado.set(null);
                this.tramites.set([]);
              }

              const reg = this.buildRegistroDesdeSolicitud(solicitud, tramite);
              this.registro.set(reg);
              this.patchForm(reg);
              this.buildLineasFromRegistro(reg);
              this.loading.set(false);
            });
        },
        error: () => {
          this.errorMessage.set('Error al cargar la compra aprobada');
          this.loading.set(false);
        },
      });
    });
  }

  private loadRelatedData(reg: RegistroContable): void {
    this.proveedorService
      .getProveedores()
      .subscribe((p) => this.proveedores.set(p));

    const solicitudId =
      reg.solicitudCompraId ||
      this.extractSolicitudId(reg.numeroSolicitudAsociada);
    if (solicitudId) {
      this.tramitarService
        .getTramiteBySolicitudId(solicitudId)
        .subscribe((tramite) => {
          if (tramite) {
            this.tramiteAsociado.set(tramite);
            const tramitesConOc = this.buildTramitesConOrdenes(tramite);
            this.tramites.set(tramitesConOc);

            const oc =
              tramite.ordenCompra || tramitesConOc[0]?.ordenCompra || null;
            if (oc) {
              this.ocReferencia.set(oc.numeroOC);
              this.ordenCompraSeleccionada.set(oc.numeroOC);
              if (tramite.requisicion?.numeroRequisicion) {
                this.requisicionSeleccionada.set(
                  tramite.requisicion.numeroRequisicion,
                );
              }
            }
          }
        });

      this.comprasService.getSolicitudById(solicitudId).subscribe({
        next: (solicitud) => this.solicitudAsociada.set(solicitud),
        error: () => this.solicitudAsociada.set(null),
      });
    }
  }

  /**
   * Expande un trámite en múltiples filas (una por OC) para el selector del Paso 4.
   * Paso 1 continúa usando el trámite completo original.
   */
  private buildTramitesConOrdenes(
    tramite: TramiteRequisicion,
  ): TramiteRequisicion[] {
    const ordenes = tramite.ordenesCargadas || [];

    if (ordenes.length === 0) {
      return tramite.ordenCompra?.numeroOC ? [tramite] : [];
    }

    return ordenes.map((oc) => ({
      ...tramite,
      ordenCompra: {
        numeroOC: oc.numeroOC || '',
        numeroRequisicion:
          tramite.requisicion?.numeroRequisicion ||
          tramite.ordenCompra?.numeroRequisicion ||
          '',
        proveedor: oc.proveedor || '',
        valorAntesIva: oc.valorAntesIva || 0,
        ivaPorcentaje: oc.ivaPorcentaje || 0,
        valorIva: oc.valorIva || 0,
        valorTotal: oc.valorTotal || 0,
        fechaEmision: oc.fechaEmision || '',
        responsableCompra: oc.responsableCompra || '',
        archivoOC:
          oc.archivoUrl ||
          (typeof oc.archivo === 'string' ? oc.archivo : undefined),
      },
    }));
  }

  private buildRegistroDesdeSolicitud(
    solicitud: SolicitudCompra,
    tramite: TramiteRequisicion | null,
  ): RegistroContable {
    const ordenCompra = tramite?.ordenCompra;
    const valorBruto =
      ordenCompra?.valorTotal ||
      tramite?.requisicion?.valorEstimado ||
      (solicitud as { valorEstimado?: number }).valorEstimado ||
      0;
    const fechaBase =
      solicitud.fechaSolicitud ||
      solicitud.fechaCreacion ||
      tramite?.requisicion?.fecha ||
      '';

    // Resolve proveedorId from proveedores association or ordenesCargadas
    const provAsociado = tramite?.proveedores?.find(
      (p) => !p.requiereSeleccionProveedor && p.proveedorId,
    );
    const ocCargada = tramite?.ordenesCargadas?.[0];
    const proveedorIdResuelto =
      provAsociado?.proveedorId || ocCargada?.proveedorId || undefined;
    const proveedorNombreResuelto =
      provAsociado?.proveedorNombreFinal ||
      (proveedorIdResuelto
        ? this.proveedores().find((p) => p.id === proveedorIdResuelto)
            ?.nombreProveedor
        : undefined) ||
      ordenCompra?.proveedor ||
      solicitud.solicitante ||
      '';
    const proveedorNitResuelto =
      provAsociado?.proveedorNit || ocCargada?.nitProveedor || '';

    if (ordenCompra?.numeroOC) {
      this.ocReferencia.set(ordenCompra.numeroOC);
      this.ordenCompraSeleccionada.set(ordenCompra.numeroOC);
    }

    if (tramite?.requisicion?.numeroRequisicion) {
      this.requisicionSeleccionada.set(tramite.requisicion.numeroRequisicion);
    }

    return {
      solicitudCompraId: solicitud.id,
      fuente: 'COMPRA',
      empresa:
        solicitud.empresaCentroCostos ||
        tramite?.requisicion?.empresaCentroCostos ||
        solicitud.areaSolicitante ||
        '',
      tipoDocumento: 'FACTURA_ELECTRONICA',
      numeroDocumento: solicitud.codigoSolicitud,
      fechaDocumento: fechaBase,
      fechaRecepcion: fechaBase,
      proveedorTercero: proveedorNombreResuelto,
      proveedorNombre: proveedorNombreResuelto,
      proveedorId: proveedorIdResuelto,
      proveedorNit: proveedorNitResuelto,
      nitIdentificacion: proveedorNitResuelto || '',
      valorBruto,
      descuentos: 0,
      subtotal: valorBruto,
      iva: ordenCompra?.valorIva || 0,
      reteFuente: 0,
      reteIva: 0,
      reteIca: 0,
      otrosImpuestos: 0,
      valorNetoPagar: valorBruto,
      tipoRegistro: 'GASTO',
      cuentaContable: '',
      subcuentaAuxiliar: '',
      centroCostos: solicitud.areaSolicitante || '',
      proyecto: '',
      lineaUnidadNegocio: '',
      fechaCausacion: fechaBase,
      fechaVencimiento: fechaBase,
      fechaEstimadaPago: fechaBase,
      formaPago: 'TRANSFERENCIA',
      bancoCuenta: '',
      numeroComprobante: '',
      numeroSolicitudAsociada:
        tramite?.requisicion?.numeroRequisicion || solicitud.codigoSolicitud,
      ordenCompra: ordenCompra?.numeroOC || '',
      estado: 'EN_REVISION',
      responsableRegistro: solicitud.solicitante || 'Pendiente',
      observaciones: solicitud.observaciones,
      ordenCompraUrl: solicitud.ordenCompraUrl,
      vistoBuenoUrl: solicitud.vistoBuenoUrl,
      fechaCreacion: solicitud.fechaCreacion,
    };
  }

  private patchForm(reg: RegistroContable): void {
    this.form.patchValue({
      numeroEgreso: reg.numeroEgreso || '',
      cuentaContable: reg.cuentaContable || '',
      debito: reg.valorBruto || 0,
      credito: reg.valorNetoPagar || 0,
      ordenCompra: reg.ordenCompra || '',
      requisicion: reg.numeroSolicitudAsociada || '',
      observaciones: reg.observaciones || '',
      estado: reg.estado,
    });
    this.debitoManual.set(reg.valorBruto || 0);
    this.creditoManual.set(reg.valorNetoPagar || 0);

    if (reg.cuentaContable) {
      const cuenta = this.tramitarContabilidadService.getCuentaContableByCodigo(
        reg.cuentaContable,
      );
      if (cuenta) {
        this.cuentaSeleccionada.set(cuenta);
        this.cuentaValidada.set(true);
      }
    }
  }

  // ════════════════════════════════════════════════
  //  BUILD EGRESO LINES
  // ════════════════════════════════════════════════
  private buildLineasFromRegistro(reg: RegistroContable): void {
    const lineas: LineaEgreso[] = [];

    // Línea 1: Cuenta principal del registro (débito)
    if (reg.cuentaContable || reg.valorBruto) {
      const cuentaInfo =
        this.tramitarContabilidadService.getCuentaContableByCodigo(
          reg.cuentaContable,
        );
      lineas.push({
        numero: 1,
        cuentaContable: reg.cuentaContable
          ? `${reg.cuentaContable}${cuentaInfo ? ' - ' + cuentaInfo.nombre : ''}`
          : '',
        tercero: reg.proveedorTercero || reg.proveedorNombre || '',
        detalle: reg.observaciones || '',
        descripcion: reg.proveedorTercero || reg.proveedorNombre || '',
        debito: reg.valorBruto || 0,
        credito: 0,
      });
    }

    // Línea 2: Contrapartida (crédito — banco/cuenta)
    if (reg.bancoCuenta || reg.valorNetoPagar) {
      lineas.push({
        numero: 2,
        cuentaContable: reg.bancoCuenta || '11100501 - Bancos',
        tercero: reg.bancoCuenta?.split('-').pop()?.trim() || 'Bancos',
        detalle: '',
        descripcion: reg.bancoCuenta?.split('-').pop()?.trim() || 'Bancos',
        debito: 0,
        credito: reg.valorNetoPagar || 0,
      });
    }

    // Línea adicional si hay diferencia (descuentos/retenciones)
    const totalDed =
      (reg.reteFuente || 0) +
      (reg.reteIva || 0) +
      (reg.reteIca || 0) +
      (reg.descuentos || 0) +
      (reg.otrosImpuestos || 0);
    if (totalDed > 0) {
      lineas.push({
        numero: lineas.length + 1,
        cuentaContable: 'Retenciones / Deducciones',
        tercero: reg.proveedorTercero || '',
        detalle: `ReteFuente: ${reg.reteFuente || 0}, ReteIVA: ${reg.reteIva || 0}, ReteICA: ${reg.reteIca || 0}`,
        descripcion: 'Retenciones y deducciones',
        debito: 0,
        credito: totalDed,
      });
    }

    this.lineasEgreso.set(lineas);
  }

  // ════════════════════════════════════════════════
  //  FORM INIT
  // ════════════════════════════════════════════════
  private initForm(): void {
    this.form = this.fb.group({
      numeroEgreso: ['', Validators.required],
      cuentaContable: [''],
      debito: [0, [Validators.required, Validators.min(0)]],
      credito: [0, [Validators.required, Validators.min(0)]],
      ordenCompra: [''],
      requisicion: [''],
      observaciones: [''],
      estado: ['EN_REVISION'],
    });
  }

  // ════════════════════════════════════════════════
  //  PASO 2: CARGA DE EGRESO + OCR
  // ════════════════════════════════════════════════
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (event.dataTransfer?.files) {
      this.processFiles(event.dataTransfer.files);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.processFiles(input.files);
    }
    // Reset so the same file can be re-uploaded after being deleted
    input.value = '';
  }

  private processFiles(files: FileList): void {
    const newDocs: any[] = [];
    Array.from(files).forEach((file) => {
      if (this.isValidDocumentType(file)) {
        const doc = {
          id: `doc-${Date.now()}-${Math.random()}`,
          archivo: file,
          nombreArchivo: file.name,
          tamanoArchivo: file.size,
          estadoEscaneo: 'pendiente' as const,
          progresoEscaneo: 0,
        };
        newDocs.push(doc);
      }
    });
    if (newDocs.length > 0) {
      this.documentosCargadosSection1.set([
        ...this.documentosCargadosSection1(),
        ...newDocs,
      ]);

      this.scanDocuments(newDocs);
    }
  }

  private isValidDocumentType(file: File): boolean {
    const validTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',   // .xlsx
      'application/vnd.ms-excel',                                            // .xls
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword',                                                  // .doc
    ];
    return (
      validTypes.includes(file.type) ||
      /\.(pdf|jpg|jpeg|png|tiff?|xlsx?|docx?)$/i.test(file.name)
    );
  }

  private scanDocuments(docs: any[]): void {
    if (this.isScanning() || docs.length === 0) return;
    this.isScanning.set(true);
    this.errorMessage.set('');
    let completed = 0;

    console.info(`[Contabilidad OCR] Iniciando escaneo de ${docs.length} documento(s)`);

    docs.forEach((doc, index) => {
      this.updateDocState(doc.id, {
        estadoEscaneo: 'escaneando',
        progresoEscaneo: 0,
      });

      console.info(`[Contabilidad OCR] Enviando doc ${index + 1}: ${doc.nombreArchivo}`);

      this.ocrService.escanearArchivoRaw(doc.archivo).subscribe({
        next: (result: TextractResponse) => {
          console.info(`[Contabilidad OCR] Resultado recibido para ${doc.nombreArchivo}:`, {
            plainTextLength: result.plainText?.length || 0,
            tablesCount: result.tables?.length || 0,
            kvPairsCount: result.keyValuePairs?.length || 0,
          });

          const confianza = this.calcularConfianzaEgreso(result);
          this.updateDocState(doc.id, {
            estadoEscaneo: 'completado',
            progresoEscaneo: 100,
            ocrData: result,
            confianzaOCR: confianza,
          });

          // Parse from keyValuePairs
          const kvParsed = this.parseEgresoFromKVPairs(result.keyValuePairs);
          console.info('[Contabilidad OCR] Datos extraídos de KV pairs:', kvParsed);

          // Parse line items from tables
          const lineasFromTables = this.parseLineasFromTables(result.tables);
          console.info(`[Contabilidad OCR] Líneas extraídas de tablas: ${lineasFromTables.length}`, lineasFromTables);

          // Parse empresa from plainText (first line or before NIT)
          const empresa = this.parseEmpresaFromText(result.plainText);

          // Parse observaciones from keyValuePairs
          const observaciones =
            (result.keyValuePairs || []).find((kv: any) =>
              (kv.key || '').toUpperCase().includes('OBSERV'),
            )?.value || '';

          // Calculate totals from parsed lines
          const totalDebito = lineasFromTables.reduce(
            (s: number, l: LineaEgreso) => s + l.debito,
            0,
          );
          const totalCredito = lineasFromTables.reduce(
            (s: number, l: LineaEgreso) => s + l.credito,
            0,
          );

          const ocrContabilidad: OcrContabilidadResult = {
            numeroEgreso: kvParsed.numeroEgreso || '',
            cuentaContable:
              kvParsed.cuentaContable ||
              lineasFromTables[0]?.cuentaContable ||
              '',
            debito: totalDebito || 0,
            credito: totalCredito || 0,
            fecha: kvParsed.fecha || '',
            descripcion:
              kvParsed.descripcion || lineasFromTables[0]?.descripcion || '',
            proveedor: kvParsed.proveedor || lineasFromTables[0]?.tercero || '',
            nit: kvParsed.nit || '',
            empresa: empresa,
            observaciones: observaciones,
            confianzaOCR: confianza,
            lineas: lineasFromTables.length > 0 ? lineasFromTables : undefined,
          };
          this.ocrResult.set(ocrContabilidad);
          this.updateDocState(doc.id, { ocrContabilidad, lineas: lineasFromTables });
          console.info('[Contabilidad OCR] Resultado final del OCR:', ocrContabilidad);

          // Auto-select first completed egreso
          if (!this.selectedEgresoId()) {
            this.selectEgreso(doc.id);
          }

          // Patch form values
          if (ocrContabilidad.numeroEgreso) {
            this.form.patchValue({
              numeroEgreso: ocrContabilidad.numeroEgreso,
            });
          }
          if (ocrContabilidad.cuentaContable) {
            this.form.patchValue({
              cuentaContable: ocrContabilidad.cuentaContable,
            });
          }
          if (ocrContabilidad.debito) {
            this.form.patchValue({ debito: ocrContabilidad.debito });
            this.debitoManual.set(ocrContabilidad.debito);
          }
          if (ocrContabilidad.credito) {
            this.form.patchValue({ credito: ocrContabilidad.credito });
            this.creditoManual.set(ocrContabilidad.credito);
          }

          // Set egreso lines from tables (the real structured data)
          if (lineasFromTables.length > 0) {
            this.lineasEgreso.set(lineasFromTables);
          } else {
            console.warn('[Contabilidad OCR] No se pudieron extraer líneas de egreso de las tablas. Se mantienen las líneas originales.');
          }

          completed++;
          if (completed === docs.length) {
            this.isScanning.set(false);
            // Scan any docs that were added while this batch was running
            const pendientes = this.documentosCargadosSection1().filter(
              (d: any) => d.estadoEscaneo === 'pendiente',
            );
            if (pendientes.length > 0) this.scanDocuments(pendientes);
          }
        },
        error: (err: any) => {
          console.error(`[Contabilidad OCR] Error procesando ${doc.nombreArchivo}:`, err);
          this.updateDocState(doc.id, {
            estadoEscaneo: 'error',
            progresoEscaneo: 0,
          });
          this.errorMessage.set(
            `Error al escanear "${doc.nombreArchivo}": ${err?.error?.detail || err?.error?.error || err?.statusText || err?.message || 'Error de conexión con el servidor'}`,
          );
          completed++;
          if (completed === docs.length) {
            this.isScanning.set(false);
            const pendientes = this.documentosCargadosSection1().filter(
              (d: any) => d.estadoEscaneo === 'pendiente',
            );
            if (pendientes.length > 0) this.scanDocuments(pendientes);
          }
        },
      });
    });
  }

  private updateDocState(docId: string, updates: any): void {
    const docs = this.documentosCargadosSection1();
    const doc = docs.find((d) => d.id === docId);
    if (doc) {
      Object.assign(doc, updates);
      this.documentosCargadosSection1.set([...docs]);
    }
  }

  borrarDocumento(docId: string): void {
    const docs = this.documentosCargadosSection1().filter(
      (d) => d.id !== docId,
    );
    this.documentosCargadosSection1.set(docs);

    // If deleted doc was selected, select next available or clear
    if (this.selectedEgresoId() === docId) {
      const nextCompleted = docs.find((d: any) => d.estadoEscaneo === 'completado');
      if (nextCompleted) {
        this.selectEgreso(nextCompleted.id);
      } else {
        this.selectedEgresoId.set(null);
        this.lineasEgreso.set([]);
        this.ocrResult.set(null);
        if (this.pdfObjectUrl) {
          URL.revokeObjectURL(this.pdfObjectUrl);
          this.pdfObjectUrl = null;
          this.pdfPreviewUrl.set(null);
        }
      }
    }

    if (docs.length === 0 && this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
      this.pdfPreviewUrl.set(null);
    }
  }

  // ── Editable egreso lines ──
  actualizarLineaCampo(
    index: number,
    campo: keyof LineaEgreso,
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    const lineas = [...this.lineasEgreso()];
    if (!lineas[index]) return;
    if (campo === 'debito' || campo === 'credito' || campo === 'numero') {
      (lineas[index] as any)[campo] = +value || 0;
    } else {
      (lineas[index] as any)[campo] = value;
    }
    this.lineasEgreso.set(lineas);
    this.syncLineasToSelectedDoc();
  }

  agregarLinea(): void {
    const lineas = [...this.lineasEgreso()];
    lineas.push({
      numero: lineas.length + 1,
      cuentaContable: '',
      tercero: '',
      detalle: '',
      descripcion: '',
      debito: 0,
      credito: 0,
    });
    this.lineasEgreso.set(lineas);
    this.syncLineasToSelectedDoc();
  }

  eliminarLinea(index: number): void {
    const lineas = this.lineasEgreso().filter((_, i) => i !== index);
    lineas.forEach((l, i) => (l.numero = i + 1));
    this.lineasEgreso.set(lineas);
    this.syncLineasToSelectedDoc();
  }

  confirmarPasoRequisicion(): void {
    this.nextSection();
  }

  noOp(): void {
    // No-op: placeholder for event bindings
  }

  confirmarPasoCargaEgreso(): void {
    if (this.isScanning()) {
      this.errorMessage.set(
        'Espere a que el escaneo OCR finalice antes de continuar. Los datos del egreso se llenarán automáticamente.',
      );
      setTimeout(() => this.errorMessage.set(''), 5000);
      return;
    }
    const egreso = this.form.get('numeroEgreso')?.value;
    if (!egreso) {
      this.errorMessage.set('El número de egreso es obligatorio');
      setTimeout(() => this.errorMessage.set(''), 4000);
      return;
    }

    // Marcar como CAUSADO al confirmar el egreso
    const reg = this.registro();
    const estadoActual = reg?.estado;
    if (reg?.id && estadoActual === 'EN_REVISION') {
      this.loading.set(true);
      this.tramitarContabilidadService
        .updateEstadoRegistro(reg.id, 'CAUSADO')
        .subscribe({
          next: (updated) => {
            this.applyEstadoContable(updated.estado || 'CAUSADO');
            this.loading.set(false);
            this.nextSection();
          },
          error: () => {
            this.loading.set(false);
            this.errorMessage.set(
              'No fue posible actualizar el estado a CAUSADO.',
            );
            setTimeout(() => this.errorMessage.set(''), 5000);
          },
        });
      return;
    }

    if (!reg?.id && (!estadoActual || estadoActual === 'EN_REVISION')) {
      this.applyEstadoContable('CAUSADO');
    }

    this.nextSection();
  }

  // ════════════════════════════════════════════════
  //  CUENTA CONTABLE (UTILIDADES AUXILIARES)
  // ════════════════════════════════════════════════
  buscarCuenta(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.cuentaBusqueda.set(term);
    if (term.length < 2) {
      this.cuentasContables.set(
        this.tramitarContabilidadService.getCuentasContables(),
      );
      return;
    }
    this.cuentasContables.set(
      this.tramitarContabilidadService.buscarCuentasContables(term),
    );
  }

  seleccionarCuenta(cuenta: CuentaContableParam): void {
    this.cuentaSeleccionada.set(cuenta);
    this.form.patchValue({ cuentaContable: cuenta.codigo });
    this.validarCuenta();
  }

  validarCuenta(): void {
    const cuenta = this.cuentaSeleccionada();
    const codigoOCR = this.ocrResult()?.cuentaContable;

    if (!cuenta) {
      this.cuentaError.set('Debe seleccionar una cuenta contable');
      this.cuentaValidada.set(false);
      return;
    }

    if (codigoOCR && cuenta.codigo !== codigoOCR) {
      this.cuentaError.set(
        `La cuenta contable del OCR (${codigoOCR}) no coincide con la cuenta seleccionada (${cuenta.codigo} - ${cuenta.nombre}). Verifique que el proceso corresponda al tipo de cuenta contable.`,
      );
      this.cuentaValidada.set(false);
      return;
    }

    this.cuentaError.set('');
    this.cuentaValidada.set(true);
  }

  toggleEditCuentaLinea(index: number): void {
    if (this.lineaEditandoCuentaIndex() === index) {
      this.lineaEditandoCuentaIndex.set(null);
      this.cuentaBusquedaLinea.set('');
      this.cuentasFiltradas.set([]);
    } else {
      this.lineaEditandoCuentaIndex.set(index);
      const linea = this.lineasEgreso()[index];
      this.cuentaBusquedaLinea.set(linea?.cuentaContable || '');
      this.cuentasFiltradas.set(
        this.tramitarContabilidadService.getCuentasContables(),
      );
    }
  }

  buscarCuentaParaLinea(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.cuentaBusquedaLinea.set(term);
    if (term.length < 2) {
      this.cuentasFiltradas.set(
        this.tramitarContabilidadService.getCuentasContables(),
      );
      return;
    }
    this.cuentasFiltradas.set(
      this.tramitarContabilidadService.buscarCuentasContables(term),
    );
  }

  seleccionarCuentaParaLinea(index: number, cuenta: CuentaContableParam): void {
    const lineas = [...this.lineasEgreso()];
    if (lineas[index]) {
      lineas[index] = {
        ...lineas[index],
        cuentaContable: `${cuenta.codigo} - ${cuenta.nombre}`,
      };
      this.lineasEgreso.set(lineas);
    }
    this.lineaEditandoCuentaIndex.set(null);
    this.cuentaBusquedaLinea.set('');
    this.cuentasFiltradas.set([]);
  }

  abrirModalCuentaContable(index: number): void {
    this.modalCuentaLineaIndex.set(index);
    this.modalCuentaVisible.set(true);
    this.modalCuentaBusqueda.set('');
    this.modalCuentasFiltradas.set(
      this.tramitarContabilidadService.getCuentasContables(),
    );
  }

  cerrarModalCuentaContable(): void {
    this.modalCuentaVisible.set(false);
    this.modalCuentaLineaIndex.set(null);
    this.modalCuentaBusqueda.set('');
    this.modalCuentasFiltradas.set([]);
  }

  buscarCuentaModal(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.modalCuentaBusqueda.set(term);
    if (term.length < 2) {
      this.modalCuentasFiltradas.set(
        this.tramitarContabilidadService.getCuentasContables(),
      );
      return;
    }
    this.modalCuentasFiltradas.set(
      this.tramitarContabilidadService.buscarCuentasContables(term),
    );
  }

  seleccionarCuentaDesdeModal(cuenta: CuentaContableParam): void {
    const index = this.modalCuentaLineaIndex();
    if (index === null) return;

    const lineas = [...this.lineasEgreso()];
    while (lineas.length <= index) {
      lineas.push({
        numero: lineas.length + 1,
        cuentaContable: '',
        tercero: '',
        detalle: '',
        descripcion: '',
        debito: lineas.length === 0 ? this.debitoManual() : 0,
        credito: lineas.length === 1 ? this.creditoManual() : 0,
      });
    }

    lineas[index] = {
      ...lineas[index],
      cuentaContable: `${cuenta.codigo} - ${cuenta.nombre}`,
    };
    this.lineasEgreso.set(lineas);

    if (index === 0) {
      this.form.patchValue({ cuentaContable: cuenta.codigo });
      this.cuentaSeleccionada.set(cuenta);
    }

    this.cerrarModalCuentaContable();
  }

  private getFirstOcrRaw(): any | null {
    const withOcr = this.documentosCargadosSection1().find((d) => d?.ocrData);
    return withOcr?.ocrData || null;
  }

  private getKvpValueContains(text: string): string {
    const raw = this.getFirstOcrRaw();
    const kv = (raw?.keyValuePairs || []).find((item: any) =>
      (item?.key || '').toUpperCase().includes(text.toUpperCase()),
    );
    return (kv?.value || '').trim();
  }

  getEmpresaDisplay(): string {
    const fromOcr = (this.ocrResult()?.empresa || '').trim();
    if (fromOcr) return fromOcr;

    const raw = this.getFirstOcrRaw();
    const fromText = this.parseEmpresaFromText(raw?.plainText);
    if (fromText) return fromText;

    return (this.registro()?.empresa || '').trim();
  }

  getNitDisplay(): string {
    const fromOcr = (this.ocrResult()?.nit || '').trim();
    if (fromOcr) return fromOcr;

    const fromKvp = this.getKvpValueContains('NIT');
    if (fromKvp) return fromKvp;

    return (this.registro()?.nitIdentificacion || '').trim();
  }

  getNumeroEgresoDisplay(): string {
    const fromOcr = (this.ocrResult()?.numeroEgreso || '').trim();
    if (fromOcr) return fromOcr;

    const fromKvp = this.getKvpValueContains('EGRESO');
    if (fromKvp) return fromKvp;

    return (
      this.registro()?.numeroEgreso ||
      this.registro()?.numeroDocumento ||
      ''
    ).trim();
  }

  getFechaDisplay(): string {
    const fromOcr = (this.ocrResult()?.fecha || '').trim();
    if (fromOcr) return fromOcr;

    const fromKvp = this.getKvpValueContains('FECHA');
    if (fromKvp) return fromKvp;

    return (
      this.registro()?.fechaDocumento ||
      this.registro()?.fechaCausacion ||
      ''
    ).trim();
  }

  getCuentaLineaDisplay(index: number): string {
    const line = this.lineasEgreso()[index];
    if (line?.cuentaContable?.trim()) return line.cuentaContable.trim();

    if (index === 0) {
      return (
        this.ocrResult()?.cuentaContable ||
        this.registro()?.cuentaContable ||
        ''
      ).trim();
    }

    if (index === 1) {
      return (
        this.registro()?.bancoCuenta ||
        this.lineasEgreso()[1]?.cuentaContable ||
        ''
      ).trim();
    }

    return '';
  }

  todasLasCuentasAsignadas(): boolean {
    return this.lineasEgreso().every(
      (l) => l.cuentaContable && l.cuentaContable.trim() !== '',
    );
  }

  // ════════════════════════════════════════════════

  private applyEstadoContable(estado: EstadoContable): void {
    this.form.patchValue({ estado });
    const actual = this.registro();
    if (actual) {
      this.registro.set({ ...actual, estado });
    }
  }

  // ════════════════════════════════════════════════
  //  PASO 3: ASOCIAR EGRESO A ORDEN DE COMPRA
  // ════════════════════════════════════════════════
  asociarOrdenCompra(): void {
    const oc = this.ordenCompraSeleccionada();
    if (!oc) return;

    const tramite = this.tramites().find((t) => t.ordenCompra?.numeroOC === oc);

    if (tramite) {
      this.tramiteAsociado.set(tramite);
      const ocData = tramite.ordenCompra;
      const req = tramite.requisicion;

      const valorEgreso =
        this.debitoManual() || +(this.form.get('debito')?.value || 0);
      const valorOC = (ocData?.valorAntesIva || 0) + (ocData?.valorIva || 0);
      const valorReq = req ? +(req as any).valorEstimado || valorOC : undefined;

      const asociacion: EgresoOrdenCompra = {
        numeroEgreso: this.form.get('numeroEgreso')?.value || '',
        ordenCompraNumero: oc,
        requisicionNumero:
          req?.numeroRequisicion ||
          this.requisicionSeleccionada() ||
          this.form.get('requisicion')?.value ||
          this.registro()?.numeroSolicitudAsociada ||
          '',
        valorEgreso,
        valorOrdenCompra: valorOC,
        valorRequisicion: valorReq,
        diferenciasEgreso: Math.abs(valorEgreso - valorOC),
        diferenciasOc: valorReq ? Math.abs(valorOC - valorReq) : 0,
        diferenciasOC: valorReq ? Math.abs(valorOC - valorReq) : 0,
        coincide: valorEgreso === valorOC,
      };

      // Add to existing associations instead of replacing
      const existentes = this.asociacionesEgreso().filter(
        (a) => a.ordenCompraNumero !== oc,
      );
      this.asociacionesEgreso.set([...existentes, asociacion]);
      this.form.patchValue({
        ordenCompra: oc,
        requisicion: req?.numeroRequisicion || '',
      });
      this.valoresDesdeOC.set(true);
    } else {
      this.errorMessage.set('No se encontró la orden de compra especificada');
      setTimeout(() => this.errorMessage.set(''), 4000);
    }
  }

  actualizarOC(event: Event): void {
    this.ordenCompraSeleccionada.set((event.target as HTMLInputElement).value);
  }

  seleccionarOC(tramite: TramiteRequisicion): void {
    const oc = tramite.ordenCompra?.numeroOC || '';
    if (!oc) return;

    const seleccionadas = [...this.ocsSeleccionadas()];
    const idx = seleccionadas.indexOf(oc);

    if (idx >= 0) {
      // Deselect: remove from array and from associations
      seleccionadas.splice(idx, 1);
      this.ocsSeleccionadas.set(seleccionadas);
      this.asociacionesEgreso.update((asocs) =>
        asocs.filter((a) => a.ordenCompraNumero !== oc),
      );
      this.ordenCompraSeleccionada.set(
        seleccionadas.length > 0 ? seleccionadas[seleccionadas.length - 1] : '',
      );
    } else {
      // Select: add to array and create association
      this.ocsSeleccionadas.set([...seleccionadas, oc]);
      this.ordenCompraSeleccionada.set(oc);
      this.asociarOrdenCompra();
    }
  }

  isOcSeleccionada(numeroOC: string): boolean {
    return this.ocsSeleccionadas().includes(numeroOC);
  }

  tieneAsociaciones = computed(() => this.asociacionesEgreso().length > 0);

  hayDiferencias = computed(() => {
    if (this.ocsSeleccionadas().length === 0) return false;
    // If per-provider associations exist, differences are tracked per-egreso — no global block
    if (this.asociacionesEgreso().length > 0 && this.egresoAsignadoPorProveedor().size > 0) return false;
    return !this.asociacionGlobalCoincide();
  });

  /** Total value of all selected OCs */
  totalValorOCsSeleccionadas = computed(() => {
    const seleccionadas = this.ocsSeleccionadas();
    return this.tramites()
      .filter((t) => seleccionadas.includes(t.ordenCompra?.numeroOC || ''))
      .reduce((sum, t) => sum + (t.ordenCompra?.valorAntesIva || 0) + (t.ordenCompra?.valorIva || 0), 0);
  });

  /** Whether the total selected OC value matches the egreso value */
  asociacionGlobalCoincide = computed(() => {
    if (this.ocsSeleccionadas().length === 0) return false;
    const totalOC = this.totalValorOCsSeleccionadas();
    const valorEgreso = this.debitoManual() || +(this.form?.get('debito')?.value || 0);
    return Math.abs(totalOC - valorEgreso) < 1; // tolerance < $1
  });

  /** Absolute difference between total selected OCs and egreso */
  diferenciaGlobalAsociacion = computed(() => {
    const totalOC = this.totalValorOCsSeleccionadas();
    const valorEgreso = this.debitoManual() || +(this.form?.get('debito')?.value || 0);
    return Math.abs(totalOC - valorEgreso);
  });

  /** Select or deselect all OCs at once */
  toggleSelectAllOCs(): void {
    const allOCs = this.tramites()
      .map((t) => t.ordenCompra?.numeroOC || '')
      .filter((oc) => oc !== '');

    if (this.isAllOCsSelected()) {
      // Deselect all
      this.ocsSeleccionadas.set([]);
      this.asociacionesEgreso.set([]);
      this.ordenCompraSeleccionada.set('');
    } else {
      // Select all
      this.ocsSeleccionadas.set(allOCs);
      this.ordenCompraSeleccionada.set(allOCs[allOCs.length - 1] || '');
      // Build associations for all
      const asociaciones: EgresoOrdenCompra[] = [];
      const valorEgreso = this.debitoManual() || +(this.form.get('debito')?.value || 0);
      for (const t of this.tramites()) {
        const oc = t.ordenCompra?.numeroOC || '';
        if (!oc) continue;
        const valorOC = (t.ordenCompra?.valorAntesIva || 0) + (t.ordenCompra?.valorIva || 0);
        asociaciones.push({
          numeroEgreso: this.form.get('numeroEgreso')?.value || '',
          ordenCompraNumero: oc,
          requisicionNumero: t.requisicion?.numeroRequisicion || '',
          valorEgreso,
          valorOrdenCompra: valorOC,
          diferenciasEgreso: Math.abs(valorEgreso - valorOC),
          diferenciasOc: 0,
          coincide: valorEgreso === valorOC,
        });
      }
      this.asociacionesEgreso.set(asociaciones);
    }
  }

  /** Whether all OCs are currently selected */
  isAllOCsSelected(): boolean {
    const total = this.tramites().length;
    return total > 0 && this.ocsSeleccionadas().length === total;
  }

  // ════════════════════════════════════════════════
  //  NAVIGATION
  // ════════════════════════════════════════════════
  nextSection(): void {
    if (this.activeSection() < this.TOTAL_SECTIONS - 1) this.activeSection.update((v) => v + 1);
  }

  prevSection(): void {
    if (this.activeSection() > 0) this.activeSection.update((v) => v - 1);
  }

  goToSection(section: number): void {
    this.activeSection.set(section);
  }

  goBack(): void {
    this.router.navigate(['/contabilidad/gestion']);
  }

  // ════════════════════════════════════════════════
  //  SUBMIT
  // ════════════════════════════════════════════════
  submitForm(): void {
    if (this.hayDiferencias()) {
      this.errorMessage.set(
        'No puede guardar mientras existan diferencias entre egreso y orden de compra.',
      );
      setTimeout(() => this.errorMessage.set(''), 5000);
      return;
    }

    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach((key) =>
        this.form.get(key)?.markAsTouched(),
      );
      return;
    }
    this.loading.set(true);
    const raw = this.form.getRawValue();
    const reg = this.registro();
    const ordenCompraNormalizada = (
      raw.ordenCompra ||
      this.ordenCompraSeleccionada() ||
      this.ocReferencia() ||
      reg?.ordenCompra ||
      ''
    ).trim();
    const requisicionNormalizada = (
      raw.requisicion ||
      this.requisicionSeleccionada() ||
      reg?.numeroSolicitudAsociada ||
      this.solicitudAsociada()?.codigoSolicitud ||
      ''
    ).trim();
    const cuentaContableFinal =
      raw.cuentaContable || this.getCuentaContablePrincipal();
    const lineasEgresoSanitizadas = this.lineasEgreso().map((linea) => ({
      ...(linea.id ? { id: linea.id } : {}),
      numero: linea.numero || 0,
      cuentaContable: (linea.cuentaContable || '').trim(),
      cuentaContableCodigo: this.extractCuentaCodigo(linea.cuentaContable),
      tercero: (linea.tercero || '').trim(),
      detalle: (linea.detalle || '').trim(),
      descripcion: (linea.descripcion || '').trim(),
      debito: Number(linea.debito) || 0,
      credito: Number(linea.credito) || 0,
      origen: 'MANUAL',
    }));
    const asociacionesSanitizadas = this.asociacionesEgreso().map((asoc) => ({
      ...(asoc.id ? { id: asoc.id } : {}),
      numeroEgreso: asoc.numeroEgreso || raw.numeroEgreso || '',
      ordenCompraNumero: asoc.ordenCompraNumero || ordenCompraNormalizada,
      requisicionNumero: asoc.requisicionNumero || requisicionNormalizada,
      valorEgreso: Number(asoc.valorEgreso) || 0,
      valorOrdenCompra: Number(asoc.valorOrdenCompra) || 0,
      valorRequisicion: Number(asoc.valorRequisicion) || 0,
      diferenciasEgreso: Number(asoc.diferenciasEgreso) || 0,
      diferenciasOc:
        Number(asoc.diferenciasOc ?? asoc.diferenciasOC) || 0,
      coincide: !!asoc.coincide,
    }));

    const request: ContabilidadRequest = {
      ...(reg as any),
      cuentaContable: cuentaContableFinal,
      ordenCompra: ordenCompraNormalizada,
      numeroSolicitudAsociada: requisicionNormalizada,
      observaciones: raw.observaciones,
      estado: raw.estado,
      numeroEgreso: raw.numeroEgreso,
      valorBruto: raw.debito,
      valorNetoPagar: raw.credito,
      ...(lineasEgresoSanitizadas.length > 0
        ? { lineasEgreso: lineasEgresoSanitizadas }
        : {}),
      ...(asociacionesSanitizadas.length > 0
        ? { asociacionesEgreso: asociacionesSanitizadas }
        : {}),
    };

    // Backend expects LocalDate in ISO format (yyyy-MM-dd).
    request.fechaDocumento = this.normalizeDateForApi(request.fechaDocumento);
    request.fechaRecepcion = this.normalizeDateForApi(request.fechaRecepcion);
    request.fechaCausacion = this.normalizeDateForApi(request.fechaCausacion);
    request.fechaVencimiento = this.normalizeDateForApi(
      request.fechaVencimiento,
    );
    request.fechaEstimadaPago = this.normalizeDateForApi(
      request.fechaEstimadaPago,
    );
    if (request.fechaPuestaUso) {
      request.fechaPuestaUso = this.normalizeDateForApi(request.fechaPuestaUso);
    }

    // Build archivos from uploaded documents
    const archivos: ContabilidadArchivos = {};
    const docsForSave = this.documentosCargadosSection1();
    if (docsForSave.length > 0) {
      archivos.documentoCausacion = docsForSave[0].archivo;
      if (docsForSave.length > 1) {
        archivos.otrosSoportes = docsForSave.slice(1).map((d: any) => d.archivo);
      }
    }

    if (reg?.id) {
      this.tramitarContabilidadService.update(reg.id, request, archivos).subscribe({
        next: () =>
          this.finalizarProcesoContable(
            'Registro contable actualizado exitosamente',
          ),
        error: (error) =>
          this.handleSubmitError(error, 'Error al actualizar el registro contable'),
      });
      return;
    }

    this.tramitarContabilidadService.create(request, archivos).subscribe({
      next: (registroCreado) => {
        this.registro.set(registroCreado);
        this.finalizarProcesoContable('Registro contable creado exitosamente');
      },
      error: (error) =>
        this.handleSubmitError(error, 'Error al crear el registro contable'),
    });
  }

  private handleSubmitError(error: unknown, fallbackMessage: string): void {
    const httpError = error as HttpErrorResponse;
    const backendMessage =
      typeof httpError?.error === 'string'
        ? httpError.error
        : httpError?.error?.message;

    this.errorMessage.set(backendMessage || fallbackMessage);
    this.loading.set(false);
    setTimeout(() => this.errorMessage.set(''), 6000);
  }

  private extractCuentaCodigo(cuentaContable: string | undefined): string {
    const value = (cuentaContable || '').trim();
    if (!value) return '';
    const [firstToken] = value.split(' ');
    return firstToken.replace(/[^0-9]/g, '');
  }

  private normalizeDateForApi(value?: string): string {
    const raw = (value || '').trim();
    if (!raw) return '';

    // Already ISO or ISO datetime.
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    // dd/MM/yyyy or dd-MM-yyyy.
    const dmyMatch = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1];
      const month = dmyMatch[2];
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    // Try native Date parser as last resort.
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return raw;
  }

  private finalizarProcesoContable(mensajeExito: string): void {
    const tramiteId = this.tramiteAsociado()?.id;
    const observaciones = this.form.get('observaciones')?.value || '';

    if (tramiteId) {
      this.tramitarService
        .responderDesdeContabilidad(tramiteId, observaciones)
        .subscribe({
          next: () => this.mostrarExitoYNavegar(mensajeExito),
          error: () => this.mostrarExitoYNavegar(mensajeExito),
        });
      return;
    }

    this.mostrarExitoYNavegar(mensajeExito);
  }

  private mostrarExitoYNavegar(mensaje: string): void {
    this.loading.set(false);
    this.successMessage.set(mensaje);
    setTimeout(() => {
      this.successMessage.set('');
      this.router.navigate(['/contabilidad/gestion']);
    }, 2000);
  }

  // ════════════════════════════════════════════════
  //  ENVIAR A TESORERÍA
  // ════════════════════════════════════════════════
  enviarATesoreria(): void {
    if (this.hayDiferencias()) {
      this.errorMessage.set(
        'No puede enviar a tesorería mientras existan diferencias entre egreso y orden de compra.',
      );
      setTimeout(() => this.errorMessage.set(''), 5000);
      return;
    }

    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach((key) =>
        this.form.get(key)?.markAsTouched(),
      );
      return;
    }

    this.loading.set(true);
    const observaciones = this.form.get('observaciones')?.value || '';

    // First save the contabilidad record, then send to tesorería
    const saveAndSend = () => {
      const tramiteId = this.tramiteAsociado()?.id;
      if (!tramiteId) {
        this.errorMessage.set('No se encontró el trámite asociado para enviar a tesorería.');
        this.loading.set(false);
        setTimeout(() => this.errorMessage.set(''), 5000);
        return;
      }

      this.tramitarService
        .enviarATesoreria(tramiteId, observaciones)
        .subscribe({
          next: () => {
            this.loading.set(false);
            this.successMessage.set('Registro guardado y enviado a Tesorería exitosamente');
            setTimeout(() => {
              this.successMessage.set('');
              this.router.navigate(['/contabilidad/gestion']);
            }, 2000);
          },
          error: (err) => {
            this.loading.set(false);
            const msg = err?.error?.message || err?.error || 'Error al enviar a tesorería';
            this.errorMessage.set(typeof msg === 'string' ? msg : 'Error al enviar a tesorería');
            setTimeout(() => this.errorMessage.set(''), 6000);
          },
        });
    };

    // Save the contabilidad record first
    const raw = this.form.getRawValue();
    const reg = this.registro();
    const ordenCompraNormalizada = (
      raw.ordenCompra ||
      this.ordenCompraSeleccionada() ||
      this.ocReferencia() ||
      reg?.ordenCompra ||
      ''
    ).trim();
    const requisicionNormalizada = (
      raw.requisicion ||
      this.requisicionSeleccionada() ||
      reg?.numeroSolicitudAsociada ||
      this.solicitudAsociada()?.codigoSolicitud ||
      ''
    ).trim();
    const cuentaContableFinal =
      raw.cuentaContable || this.getCuentaContablePrincipal();
    const lineasEgresoSanitizadas = this.lineasEgreso().map((linea) => ({
      ...(linea.id ? { id: linea.id } : {}),
      numero: linea.numero || 0,
      cuentaContable: (linea.cuentaContable || '').trim(),
      cuentaContableCodigo: this.extractCuentaCodigo(linea.cuentaContable),
      tercero: (linea.tercero || '').trim(),
      detalle: (linea.detalle || '').trim(),
      descripcion: (linea.descripcion || '').trim(),
      debito: Number(linea.debito) || 0,
      credito: Number(linea.credito) || 0,
      origen: 'MANUAL',
    }));
    const asociacionesSanitizadas = this.asociacionesEgreso().map((asoc) => ({
      ...(asoc.id ? { id: asoc.id } : {}),
      numeroEgreso: asoc.numeroEgreso || raw.numeroEgreso || '',
      ordenCompraNumero: asoc.ordenCompraNumero || ordenCompraNormalizada,
      requisicionNumero: asoc.requisicionNumero || requisicionNormalizada,
      valorEgreso: Number(asoc.valorEgreso) || 0,
      valorOrdenCompra: Number(asoc.valorOrdenCompra) || 0,
      valorRequisicion: Number(asoc.valorRequisicion) || 0,
      diferenciasEgreso: Number(asoc.diferenciasEgreso) || 0,
      diferenciasOc:
        Number(asoc.diferenciasOc ?? asoc.diferenciasOC) || 0,
      coincide: !!asoc.coincide,
    }));

    const request: ContabilidadRequest = {
      ...(reg as any),
      cuentaContable: cuentaContableFinal,
      ordenCompra: ordenCompraNormalizada,
      numeroSolicitudAsociada: requisicionNormalizada,
      observaciones: raw.observaciones,
      estado: 'CONTABILIZADO',
      numeroEgreso: raw.numeroEgreso,
      valorBruto: raw.debito,
      valorNetoPagar: raw.credito,
      ...(lineasEgresoSanitizadas.length > 0
        ? { lineasEgreso: lineasEgresoSanitizadas }
        : {}),
      ...(asociacionesSanitizadas.length > 0
        ? { asociacionesEgreso: asociacionesSanitizadas }
        : {}),
    };

    request.fechaDocumento = this.normalizeDateForApi(request.fechaDocumento);
    request.fechaRecepcion = this.normalizeDateForApi(request.fechaRecepcion);
    request.fechaCausacion = this.normalizeDateForApi(request.fechaCausacion);
    request.fechaVencimiento = this.normalizeDateForApi(request.fechaVencimiento);
    request.fechaEstimadaPago = this.normalizeDateForApi(request.fechaEstimadaPago);
    if (request.fechaPuestaUso) {
      request.fechaPuestaUso = this.normalizeDateForApi(request.fechaPuestaUso);
    }

    // Build archivos from uploaded documents
    const archivosEnvio: ContabilidadArchivos = {};
    const docsEnvio = this.documentosCargadosSection1();
    if (docsEnvio.length > 0) {
      archivosEnvio.documentoCausacion = docsEnvio[0].archivo;
      if (docsEnvio.length > 1) {
        archivosEnvio.otrosSoportes = docsEnvio.slice(1).map((d: any) => d.archivo);
      }
    }

    if (reg?.id) {
      this.tramitarContabilidadService.update(reg.id, request, archivosEnvio).subscribe({
        next: () => saveAndSend(),
        error: (error) =>
          this.handleSubmitError(error, 'Error al actualizar el registro contable'),
      });
    } else {
      this.tramitarContabilidadService.create(request, archivosEnvio).subscribe({
        next: (registroCreado) => {
          this.registro.set(registroCreado);
          saveAndSend();
        },
        error: (error) =>
          this.handleSubmitError(error, 'Error al crear el registro contable'),
      });
    }
  }

  // ════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════
  //  LIFECYCLE
  // ════════════════════════════════════════════════
  ngOnDestroy(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
    }
  }

  // ════════════════════════════════════════════════
  private extractSolicitudId(codigo?: string): number | null {
    if (!codigo) return null;
    const match = codigo.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  /**
   * Parses line items from the OCR tables array.
   * Handles multiple table formats:
   *   - Standard egreso format: #, Cuenta contable, Tercero, Detalle, Descripción, Débito, Crédito
   *   - Excel/Word tables: detects numeric columns as potential Débito/Crédito
   *   - Generic tables: any table with at least 2 columns, one of which contains numbers
   */
  private parseLineasFromTables(
    tables: string[][][] | undefined,
  ): LineaEgreso[] {
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      console.warn('[Contabilidad OCR] No hay tablas para parsear');
      return [];
    }

    console.info(`[Contabilidad OCR] Analizando ${tables.length} tabla(s) para extraer líneas de egreso`);

    // ── Strategy 1: Find a table with exact egreso headers ──
    const lineTable = tables.find(
      (t) =>
        t.length > 1 &&
        t[0]?.some(
          (cell) =>
            (cell || '').toUpperCase().includes('CUENTA CONTABLE') ||
            (cell || '').toUpperCase().includes('CUENTA') ||
            (cell || '').toUpperCase().includes('DÉBITO') ||
            (cell || '').toUpperCase().includes('DEBITO'),
        ),
    );

    if (lineTable && lineTable.length >= 2) {
      console.info('[Contabilidad OCR] Tabla con encabezados de egreso encontrada');
      const result = this.parseTableWithHeaders(lineTable);
      if (result.length > 0) return result;
    }

    // ── Strategy 2: Find any table with numeric columns (likely financial data) ──
    for (let ti = 0; ti < tables.length; ti++) {
      const table = tables[ti];
      if (!table || table.length < 2) continue;

      const headers = table[0];
      if (!headers || headers.length < 2) continue;

      // Detect columns with numeric data (potential Débito/Crédito)
      const numericCols = this.detectNumericColumns(table);
      console.info(`[Contabilidad OCR] Tabla ${ti}: ${table.length} filas, ${headers.length} columnas, columnas numéricas: [${numericCols.join(',')}]`);

      if (numericCols.length >= 1) {
        const result = this.parseTableGeneric(table, numericCols);
        if (result.length > 0) {
          console.info(`[Contabilidad OCR] Líneas extraídas de tabla ${ti} (formato genérico): ${result.length}`);
          return result;
        }
      }
    }

    console.warn('[Contabilidad OCR] No se encontró ninguna tabla parseable');
    return [];
  }

  /**
   * Parses a table that has recognized egreso column headers.
   */
  private parseTableWithHeaders(lineTable: string[][]): LineaEgreso[] {
    const headers = lineTable[0].map((h) => (h || '').toUpperCase().trim());
    const colNum = headers.findIndex(
      (h) => h === '#' || h === 'N' || h === 'NO.' || h === 'NO' || h === 'ITEM' || h === 'LÍNEA' || h === 'LINEA',
    );
    const colCuenta = headers.findIndex((h) => h.includes('CUENTA'));
    const colTercero = headers.findIndex((h) => h.includes('TERCERO') || h.includes('PROVEEDOR') || h.includes('BENEFICIARIO'));
    const colDetalle = headers.findIndex((h) => h.includes('DETALLE'));
    const colDesc = headers.findIndex(
      (h) => h.includes('DESCRIPCIÓN') || h.includes('DESCRIPCION') || h.includes('CONCEPTO'),
    );
    const colDebito = headers.findIndex(
      (h) => h.includes('DÉBITO') || h.includes('DEBITO') || h === 'DEBE',
    );
    const colCredito = headers.findIndex(
      (h) => h.includes('CRÉDITO') || h.includes('CREDITO') || h === 'HABER',
    );
    // Fallback: look for generic value/amount columns
    const colValor = colDebito < 0 && colCredito < 0
      ? headers.findIndex((h) => h.includes('VALOR') || h.includes('MONTO') || h.includes('TOTAL') || h.includes('IMPORTE'))
      : -1;

    const lineas: LineaEgreso[] = [];

    for (let r = 1; r < lineTable.length; r++) {
      const row = lineTable[r];
      if (row.some((cell) => (cell || '').toUpperCase().trim() === 'TOTAL' || (cell || '').toUpperCase().trim() === 'TOTALES'))
        continue;
      // Skip empty rows
      if (row.every((cell) => !(cell || '').trim())) continue;

      const num = colNum >= 0 ? (row[colNum] || '').trim() : '';

      const parseCurrency = (val: string): number => {
        if (!val) return 0;
        let cleaned = val.replace(/[^0-9.,-]/g, '').trim();
        if (!cleaned) return 0;

        const dotCount = (cleaned.match(/\./g) || []).length;
        const commaCount = (cleaned.match(/,/g) || []).length;

        if (dotCount > 0 && commaCount > 0) {
          const lastDot = cleaned.lastIndexOf('.');
          const lastComma = cleaned.lastIndexOf(',');
          if (lastComma > lastDot) {
            // Colombian: 1.234.567,89
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
          } else {
            // International: 1,234,567.89
            cleaned = cleaned.replace(/,/g, '');
          }
        } else if (dotCount >= 2) {
          // Multiple dots without comma → Colombian thousands: 17.022.370
          cleaned = cleaned.replace(/\./g, '');
        } else if (commaCount >= 2) {
          // Multiple commas without dot → international thousands: 1,234,567
          cleaned = cleaned.replace(/,/g, '');
        } else if (commaCount === 1) {
          // Single comma, no dots → decimal: 1234,56 → 1234.56
          cleaned = cleaned.replace(',', '.');
        }
        // Single dot or no separators → keep as is (e.g. 0.00, 17022370)

        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      const rawCuenta = colCuenta >= 0 ? (row[colCuenta] || '').trim() : '';
      const codigoMatch = rawCuenta.match(/^\d+/);
      const codigoOCR = codigoMatch ? codigoMatch[0] : '';
      const cuentaCatalogo = codigoOCR
        ? this.tramitarContabilidadService.getCuentaContableByCodigo(codigoOCR)
        : undefined;
      const cuentaContable = cuentaCatalogo
        ? `${cuentaCatalogo.codigo} - ${cuentaCatalogo.nombre}`
        : rawCuenta;  // Keep raw value if not found in catalog

      let debito = colDebito >= 0 ? parseCurrency(row[colDebito]) : 0;
      let credito = colCredito >= 0 ? parseCurrency(row[colCredito]) : 0;

      // If no Débito/Crédito columns but there's a Valor column, put it in debito
      if (colDebito < 0 && colCredito < 0 && colValor >= 0) {
        debito = parseCurrency(row[colValor]);
      }

      // Skip rows with no monetary values
      if (debito === 0 && credito === 0 && colValor < 0) continue;

      lineas.push({
        numero: parseInt(num, 10) || lineas.length + 1,
        cuentaContable,
        tercero: colTercero >= 0 ? (row[colTercero] || '').trim() : '',
        detalle: colDetalle >= 0 ? (row[colDetalle] || '').trim() : '',
        descripcion: colDesc >= 0 ? (row[colDesc] || '').trim() :
                     (row.find((c, i) => i !== colNum && i !== colCuenta && i !== colTercero &&
                               i !== colDebito && i !== colCredito && i !== colValor && (c || '').trim()) || '').trim(),
        debito,
        credito,
      });
    }

    return lineas;
  }

  /**
   * Detects which columns in a table contain predominantly numeric values.
   */
  private detectNumericColumns(table: string[][]): number[] {
    if (table.length < 2) return [];
    const colCount = Math.max(...table.map(r => r.length));
    const numericCols: number[] = [];
    const numberPattern = /^[\s$€£¥₱]*[\d.,]+[\s%]*$/;

    for (let c = 0; c < colCount; c++) {
      let numericCount = 0;
      let totalNonEmpty = 0;
      // Skip header row (index 0), check data rows
      for (let r = 1; r < table.length; r++) {
        const val = (table[r]?.[c] || '').trim();
        if (!val) continue;
        totalNonEmpty++;
        if (numberPattern.test(val)) numericCount++;
      }
      if (totalNonEmpty > 0 && numericCount / totalNonEmpty >= 0.5) {
        numericCols.push(c);
      }
    }
    return numericCols;
  }

  /**
   * Parses a generic table by detecting numeric columns as Débito/Crédito or Valor.
   * Non-numeric columns are used as description/tercero/cuenta.
   */
  private parseTableGeneric(table: string[][], numericCols: number[]): LineaEgreso[] {
    const headers = table[0].map((h) => (h || '').toUpperCase().trim());
    const colCount = headers.length;
    const lineas: LineaEgreso[] = [];

    // Classify numeric columns by header name
    let colDebito = -1, colCredito = -1, colValor = -1;
    for (const c of numericCols) {
      const h = headers[c] || '';
      if (h.includes('DÉBITO') || h.includes('DEBITO') || h === 'DEBE') {
        colDebito = c;
      } else if (h.includes('CRÉDITO') || h.includes('CREDITO') || h === 'HABER') {
        colCredito = c;
      } else if (h.includes('VALOR') || h.includes('MONTO') || h.includes('TOTAL') || h.includes('IMPORTE') || h.includes('PRECIO') || h.includes('COSTO') || h.includes('SUBTOTAL')) {
        colValor = c;
      }
    }

    // If no labeled columns found, use positional assignment
    if (colDebito < 0 && colCredito < 0 && colValor < 0) {
      if (numericCols.length >= 2) {
        colDebito = numericCols[numericCols.length - 2];
        colCredito = numericCols[numericCols.length - 1];
      } else if (numericCols.length === 1) {
        colValor = numericCols[0];
      }
    }

    // Find text columns for description, tercero, cuenta
    const textCols = [];
    for (let c = 0; c < colCount; c++) {
      if (!numericCols.includes(c)) textCols.push(c);
    }

    // Detect specific text columns by header
    const colCuenta = textCols.find(c => (headers[c] || '').includes('CUENTA')) ?? -1;
    const colTercero = textCols.find(c => {
      const h = headers[c] || '';
      return h.includes('TERCERO') || h.includes('PROVEEDOR') || h.includes('BENEFICIARIO') || h.includes('NOMBRE');
    }) ?? -1;
    const colDesc = textCols.find(c => {
      const h = headers[c] || '';
      return h.includes('DESCRIP') || h.includes('CONCEPTO') || h.includes('DETALLE') || h.includes('OBSERV');
    }) ?? (textCols.length > 0 ? textCols[0] : -1);

    const parseCurrency = (val: string): number => {
      if (!val) return 0;
      let cleaned = val.replace(/[^0-9.,-]/g, '').trim();
      if (!cleaned) return 0;

      const dotCount = (cleaned.match(/\./g) || []).length;
      const commaCount = (cleaned.match(/,/g) || []).length;

      if (dotCount > 0 && commaCount > 0) {
        const lastDot = cleaned.lastIndexOf('.');
        const lastComma = cleaned.lastIndexOf(',');
        if (lastComma > lastDot) {
          // Colombian: 1.234.567,89
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          // International: 1,234,567.89
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (dotCount >= 2) {
        // Multiple dots without comma → Colombian thousands: 17.022.370
        cleaned = cleaned.replace(/\./g, '');
      } else if (commaCount >= 2) {
        // Multiple commas without dot → international thousands: 1,234,567
        cleaned = cleaned.replace(/,/g, '');
      } else if (commaCount === 1) {
        // Single comma, no dots → decimal: 1234,56 → 1234.56
        cleaned = cleaned.replace(',', '.');
      }
      // Single dot or no separators → keep as is (e.g. 0.00, 17022370)

      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      // Skip total/empty rows
      if (row.some((cell) => /^TOTAL(ES)?$/i.test((cell || '').trim()))) continue;
      if (row.every((cell) => !(cell || '').trim())) continue;

      let debito = colDebito >= 0 ? parseCurrency(row[colDebito]) : 0;
      let credito = colCredito >= 0 ? parseCurrency(row[colCredito]) : 0;
      if (colDebito < 0 && colCredito < 0 && colValor >= 0) {
        debito = parseCurrency(row[colValor]);
      }

      // Skip rows with no monetary values
      if (debito === 0 && credito === 0) continue;

      const rawCuenta = colCuenta >= 0 ? (row[colCuenta] || '').trim() : '';
      const codigoMatch = rawCuenta.match(/^\d+/);
      const codigoOCR = codigoMatch ? codigoMatch[0] : '';
      const cuentaCatalogo = codigoOCR
        ? this.tramitarContabilidadService.getCuentaContableByCodigo(codigoOCR)
        : undefined;
      const cuentaContable = cuentaCatalogo
        ? `${cuentaCatalogo.codigo} - ${cuentaCatalogo.nombre}`
        : rawCuenta;

      lineas.push({
        numero: lineas.length + 1,
        cuentaContable,
        tercero: colTercero >= 0 ? (row[colTercero] || '').trim() : '',
        detalle: '',
        descripcion: colDesc >= 0 ? (row[colDesc] || '').trim() : '',
        debito,
        credito,
      });
    }

    return lineas;
  }

  /**
   * Extracts empresa name from plainText. Typically in the first few lines.
   * Looks for patterns like "UNIÓN TEMPORAL\n...AGROCAPITAL" or a known empresa line.
   */
  private parseEmpresaFromText(plainText: string | undefined): string {
    if (!plainText) return '';
    const lines = plainText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    // Empresa is usually the first meaningful line(s) before EGRESOS
    const egresoIdx = lines.findIndex((l) =>
      l.toUpperCase().includes('EGRESO'),
    );

    const skipPattern =
      /^(NIT|BBVA|CR\s|Fecha|Teléfono|Elaborado|Siigo|CC\-|\d{4}\-)/i;
    const nameParts: string[] = [];

    if (egresoIdx > 0) {
      // Combine lines before "EGRESOS" that look like a company name
      for (let i = 0; i < egresoIdx; i++) {
        const line = lines[i];
        if (skipPattern.test(line)) continue;
        if (line.length > 0 && !/^\d+/.test(line)) {
          nameParts.push(line);
        }
      }
      // Also check lines immediately AFTER "EGRESOS" for company name continuation
      // OCR sometimes reads columns out of order, splitting the name
      for (
        let i = egresoIdx + 1;
        i < Math.min(egresoIdx + 3, lines.length);
        i++
      ) {
        const line = lines[i];
        if (skipPattern.test(line)) continue;
        // Company name continuation: all uppercase, not a code/number/date
        if (
          line.length > 2 &&
          !/^\d/.test(line) &&
          !/^(BBVA|No\.|CTA\s)/i.test(line) &&
          /^[A-ZÁÉÍÓÚÑ\s]+$/.test(line)
        ) {
          nameParts.push(line);
          break;
        }
      }
    }

    // If we found company name parts, return them joined
    if (nameParts.length > 0) return nameParts.join(' ');

    // Fallback: return first line if it's not a number or date
    if (lines[0] && !/^\d/.test(lines[0]) && !/EGRESO/i.test(lines[0])) {
      return lines[0];
    }

    return '';
  }

  /**
   * Extrae datos de egreso desde los keyValuePairs crudos de Textract/POI.
   * Busca claves como "EGRESOS - CTA 9982", "Fecha:", "NIT", etc.
   * También maneja pares clave:valor extraídos de documentos Word/Excel.
   */
  private parseEgresoFromKVPairs(
    kvPairs: { key: string; value: string }[] | undefined,
  ): {
    numeroEgreso: string;
    cuentaContable: string;
    fecha: string;
    descripcion: string;
    proveedor: string;
    nit: string;
  } {
    const empty = {
      numeroEgreso: '',
      cuentaContable: '',
      fecha: '',
      descripcion: '',
      proveedor: '',
      nit: '',
    };
    if (!kvPairs || !Array.isArray(kvPairs) || kvPairs.length === 0) return empty;

    console.info(`[Contabilidad OCR] Parseando ${kvPairs.length} pares clave-valor`);
    const parsed = { ...empty };

    for (const kv of kvPairs) {
      const key = (kv.key || '').trim();
      const val = (kv.value || '').trim();
      const keyUpper = key.toUpperCase();

      // "EGRESOS - CTA 9982" → key contiene esto
      if (keyUpper.includes('EGRESO') || keyUpper.includes('COMPROBANTE') || keyUpper.includes('DOCUMENTO')) {
        if (!parsed.numeroEgreso) {
          parsed.numeroEgreso = val || key.match(/CTA\s*\d+/i)?.[0] || key;
        }
      }

      // Fecha: priorizar "Fecha de elaboración" sobre "Fecha:" genérica
      if (keyUpper.includes('FECHA')) {
        if (keyUpper.includes('ELABORACI') || keyUpper.includes('EMISI')) {
          parsed.fecha = val;
        } else if (!parsed.fecha) {
          parsed.fecha = val;
        }
      }

      // NIT / Identificación
      if ((keyUpper.includes('NIT') || keyUpper.includes('IDENTIFICACI') || keyUpper.includes('CEDULA') || keyUpper.includes('RUT')) && val) {
        if (!parsed.nit) parsed.nit = val;
      }

      // Cuenta contable
      if ((keyUpper.includes('CUENTA') && (keyUpper.includes('CONTABLE') || keyUpper.includes('CODIGO'))) && val) {
        if (!parsed.cuentaContable) parsed.cuentaContable = val;
      }

      // Proveedor / Tercero / Beneficiario / Pagado a / Razón social
      if (
        (keyUpper.includes('PROVEEDOR') ||
          keyUpper.includes('TERCERO') ||
          keyUpper.includes('BENEFICIARIO') ||
          keyUpper.includes('PAGADO') ||
          keyUpper.includes('RAZON SOCIAL') ||
          keyUpper.includes('RAZÓN SOCIAL') ||
          keyUpper.includes('EMPRESA') ||
          keyUpper.includes('NOMBRE')) &&
        val
      ) {
        if (!parsed.proveedor) parsed.proveedor = val;
      }

      // Descripción / Concepto / Observaciones
      if (
        (keyUpper.includes('DESCRIPCI') ||
          keyUpper.includes('CONCEPTO') ||
          keyUpper.includes('DETALLE')) &&
        val
      ) {
        if (!parsed.descripcion) parsed.descripcion = val;
      }
    }

    return parsed;
  }

  getEstadoLabel(estado: string): string {
    return this.estadosLabels[estado as EstadoContable] || estado;
  }

  private calcularConfianzaEgreso(result: TextractResponse): number {
    let score = 0;
    const total = 7;
    // Basic data presence
    if (result.plainText?.length > 20) score++;
    if (result.tables?.length > 0) score++;
    if (result.keyValuePairs?.length > 0) score++;
    // Egreso-specific patterns
    const hasEgreso = (result.keyValuePairs || []).some((kv) =>
      (kv.key || '').toUpperCase().includes('EGRESO'),
    );
    if (hasEgreso) score++;
    const hasTable = (result.tables || []).some(
      (t) =>
        t.length > 1 &&
        t[0]?.some((c) => (c || '').toUpperCase().includes('CUENTA')),
    );
    if (hasTable) score++;
    // Numeric data in tables (financial values)
    const hasNumericData = (result.tables || []).some((t) =>
      t.slice(1).some((row) =>
        row.some((cell) => /[\d.,]+/.test(cell || '')),
      ),
    );
    if (hasNumericData) score++;
    // Date pattern found
    const hasDate = (result.keyValuePairs || []).some((kv) =>
      (kv.key || '').toUpperCase().includes('FECHA'),
    ) || /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(result.plainText || '');
    if (hasDate) score++;
    return Math.round((score / total) * 100);
  }

  formatCurrency(value: number): string {
    if (!value && value !== 0) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  getCuentaContablePrincipal(): string {
    const fromFirstLine = this.lineasEgreso()[0]?.cuentaContable?.trim();
    if (fromFirstLine) {
      return fromFirstLine.split('-')[0].trim();
    }

    return (
      this.ocrResult()?.cuentaContable ||
      this.registro()?.cuentaContable ||
      ''
    ).trim();
  }

  readonly formSections = [
    { num: 0, icon: '📋', title: 'Requisición' },
    { num: 1, icon: '📄', title: 'Tramitar' },
  ] as const;

  // ── TrackBy functions to prevent DOM recreation ──
  trackByNum = (_: number, item: { num: number }) => item.num;
  trackByIndex = (index: number) => index;
  trackById = (_: number, item: { id?: string | number }) => item?.id;
  trackByNumeroOC = (_: number, item: any) => item?.ordenCompra?.numeroOC ?? _;

  // ════════════════════════════════════════════════
  //  EGRESOS DISPONIBLES (documentos con OCR completado)
  // ════════════════════════════════════════════════
  egresosDisponibles = computed(() =>
    this.documentosCargadosSection1()
      .filter(d => d.estadoEscaneo === 'completado')
      .map(d => {
        const ocr: OcrContabilidadResult | undefined = d.ocrContabilidad;
        return {
          id: d.id,
          nombre: d.nombreArchivo,
          numeroEgreso: ocr?.numeroEgreso || '',
          debito: ocr?.debito || 0,
          credito: ocr?.credito || 0,
          empresa: ocr?.empresa || '',
          nit: ocr?.nit || '',
          fecha: ocr?.fecha || '',
          cuentaContable: ocr?.cuentaContable || '',
        };
      })
  );

  totalDebitoEgresos = computed(() =>
    this.egresosDisponibles().reduce((sum, e) => sum + e.debito, 0)
  );

  totalCreditoEgresos = computed(() =>
    this.egresosDisponibles().reduce((sum, e) => sum + e.credito, 0)
  );

  // ════════════════════════════════════════════════
  //  PROVEEDORES AGRUPADOS (por proveedor de la OC)
  // ════════════════════════════════════════════════
  proveedoresAgrupados = computed(() => {
    const tramites = this.tramites();
    const map = new Map<string, { nombre: string; nit: string; ordenes: any[]; valorTotal: number }>();
    for (const t of tramites) {
      const nombre: string = (t.ordenCompra as any)?.proveedor || t.proveedores?.[0]?.proveedorNombreFinal || t.proveedores?.[0]?.proveedorNombreCatalogo || 'Sin proveedor';
      const nit: string = (t.ordenCompra as any)?.nitProveedor || t.proveedores?.[0]?.proveedorNit || '';
      if (!map.has(nombre)) map.set(nombre, { nombre, nit, ordenes: [], valorTotal: 0 });
      const grupo = map.get(nombre)!;
      grupo.ordenes.push(t);
      grupo.valorTotal += (t.ordenCompra as any)?.valorTotal || 0;
    }
    return Array.from(map.values());
  });

  get totalProveedoresConEgreso(): number {
    const mapa = this.egresoAsignadoPorProveedor();
    let count = 0;
    const grupos = this.proveedoresAgrupados();
    for (const g of grupos) {
      if (mapa.has(g.nombre)) count++;
    }
    return count;
  }

  // ════════════════════════════════════════════════
  //  ASIGNAR EGRESO A PROVEEDOR
  // ════════════════════════════════════════════════
  asignarEgresoAProveedor(nombre: string, docId: string): void {
    const mapa = new Map(this.egresoAsignadoPorProveedor());
    const ocsMapa = new Map(this.selectedOCsPerProveedor());

    if (docId) {
      mapa.set(nombre, docId);
      // Auto-select ALL OCs of this provider
      const grupo = this.proveedoresAgrupados().find(g => g.nombre === nombre);
      if (grupo) {
        const allOCs = new Set(grupo.ordenes.map((t: any) => t.ordenCompra?.numeroOC ?? '').filter((oc: string) => !!oc));
        ocsMapa.set(nombre, allOCs);
      }
    } else {
      mapa.delete(nombre);
      ocsMapa.delete(nombre);
    }

    this.egresoAsignadoPorProveedor.set(mapa);
    this.selectedOCsPerProveedor.set(ocsMapa);
    this.syncOcsSeleccionadas(ocsMapa);
    this.asociacionesEgreso.set(this.buildAsociacionesFromPerProveedorData());
  }

  asignarEgresoATodos(docId: string): void {
    if (!docId) return;
    const egresoMapa = new Map<string, string>();
    const ocsMapa = new Map<string, Set<string>>();

    for (const g of this.proveedoresAgrupados()) {
      egresoMapa.set(g.nombre, docId);
      const allOCs = new Set(g.ordenes.map((t: any) => t.ordenCompra?.numeroOC ?? '').filter((oc: string) => !!oc));
      ocsMapa.set(g.nombre, allOCs);
    }

    this.egresoAsignadoPorProveedor.set(egresoMapa);
    this.selectedOCsPerProveedor.set(ocsMapa);
    this.syncOcsSeleccionadas(ocsMapa);
    this.asociacionesEgreso.set(this.buildAsociacionesFromPerProveedorData());
  }

  getEgresoAsignadoId(nombre: string): string | null {
    return this.egresoAsignadoPorProveedor().get(nombre) ?? null;
  }

  getEgresoAsignado(nombre: string): any | null {
    const id = this.getEgresoAsignadoId(nombre);
    if (!id) return null;
    return this.egresosDisponibles().find(e => e.id === id) ?? null;
  }

  // ════════════════════════════════════════════════
  //  SELECCIONAR EGRESO ACTIVO (para ver datos/preview/líneas)
  // ════════════════════════════════════════════════
  selectEgreso(docId: string): void {
    this.selectedEgresoId.set(docId);
    const doc = this.documentosCargadosSection1().find((d: any) => d.id === docId);
    if (!doc) return;

    // Update PDF preview for selected doc
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    if (doc.archivo?.type === 'application/pdf' || doc.archivo?.type?.startsWith('image/')) {
      this.pdfObjectUrl = URL.createObjectURL(doc.archivo);
      this.pdfPreviewUrl.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl),
      );
    } else {
      this.pdfPreviewUrl.set(null);
    }

    // Update lineasEgreso from selected doc
    const lineas = doc.lineas || doc.ocrContabilidad?.lineas || [];
    this.lineasEgreso.set(lineas);

    // Update ocrResult from selected doc
    if (doc.ocrContabilidad) {
      this.ocrResult.set(doc.ocrContabilidad);
      this.debitoManual.set(doc.ocrContabilidad.debito || 0);
      this.creditoManual.set(doc.ocrContabilidad.credito || 0);
    }
  }

  // Persist lineas edits back to the doc object
  private syncLineasToSelectedDoc(): void {
    const selId = this.selectedEgresoId();
    if (selId) {
      this.updateDocState(selId, { lineas: this.lineasEgreso() });
    }
  }

  // ════════════════════════════════════════════════
  //  EXPAND / COLLAPSE PROVEEDOR ROWS
  // ════════════════════════════════════════════════
  toggleProveedorExpand(idx: number): void {
    const s = new Set(this.expandedProveedorIndices());
    if (s.has(idx)) s.delete(idx); else s.add(idx);
    this.expandedProveedorIndices.set(s);
  }

  isProveedorExpanded(idx: number): boolean {
    return this.expandedProveedorIndices().has(idx);
  }

  // ════════════════════════════════════════════════
  //  OCS SELECTION PER PROVEEDOR
  // ════════════════════════════════════════════════
  toggleSelectProveedorOCs(nombre: string): void {
    const mapa = new Map(this.selectedOCsPerProveedor());
    const grupo = this.proveedoresAgrupados().find(g => g.nombre === nombre);
    if (!grupo) return;
    const allIds = new Set(grupo.ordenes.map((t: any) => t.ordenCompra?.numeroOC ?? '').filter((oc: string) => !!oc));
    const current = mapa.get(nombre) ?? new Set<string>();
    if (current.size >= allIds.size) {
      mapa.set(nombre, new Set());
    } else {
      mapa.set(nombre, allIds);
    }
    this.selectedOCsPerProveedor.set(mapa);
    this.syncOcsSeleccionadas(mapa);
    this.asociacionesEgreso.set(this.buildAsociacionesFromPerProveedorData());
  }

  /** Toggle a single OC within a specific provider's selection */
  toggleOCPerProveedor(tramite: any, proveedorNombre: string): void {
    const oc = tramite.ordenCompra?.numeroOC || '';
    if (!oc) return;

    const mapa = new Map(this.selectedOCsPerProveedor());
    const current = new Set(mapa.get(proveedorNombre) ?? []);
    if (current.has(oc)) {
      current.delete(oc);
    } else {
      current.add(oc);
    }
    mapa.set(proveedorNombre, current);
    this.selectedOCsPerProveedor.set(mapa);
    this.syncOcsSeleccionadas(mapa);
    this.asociacionesEgreso.set(this.buildAsociacionesFromPerProveedorData());
  }

  isOcSeleccionadaPerProveedor(oc: string, proveedorNombre: string): boolean {
    return this.selectedOCsPerProveedor().get(proveedorNombre)?.has(oc) ?? false;
  }

  isProveedorAllOCsSelected(nombre: string): boolean {
    const grupo = this.proveedoresAgrupados().find(g => g.nombre === nombre);
    if (!grupo || grupo.ordenes.length === 0) return false;
    const current = this.selectedOCsPerProveedor().get(nombre) ?? new Set();
    return current.size >= grupo.ordenes.length;
  }

  isProveedorSomeOCsSelected(nombre: string): boolean {
    const current = this.selectedOCsPerProveedor().get(nombre) ?? new Set();
    return current.size > 0 && !this.isProveedorAllOCsSelected(nombre);
  }

  getProveedorSeleccionadasCount(nombre: string): number {
    return this.selectedOCsPerProveedor().get(nombre)?.size ?? 0;
  }

  getProveedorInitialContable(nombre: string): string {
    return nombre.charAt(0).toUpperCase();
  }

  // ════════════════════════════════════════════════
  //  HELPERS — asociaciones desde per-proveedor
  // ════════════════════════════════════════════════

  /** Rebuilds the asociacionesEgreso array from the per-provider egreso+OC selection state */
  private buildAsociacionesFromPerProveedorData(): EgresoOrdenCompra[] {
    const result: EgresoOrdenCompra[] = [];
    const egresosMap = this.egresoAsignadoPorProveedor();
    const ocsMap = this.selectedOCsPerProveedor();

    for (const grupo of this.proveedoresAgrupados()) {
      const egresoId = egresosMap.get(grupo.nombre);
      const selectedOCs = ocsMap.get(grupo.nombre) ?? new Set<string>();
      if (!egresoId || selectedOCs.size === 0) continue;

      const egresoDoc = this.egresosDisponibles().find((e: any) => e.id === egresoId);
      if (!egresoDoc) continue;

      for (const t of grupo.ordenes) {
        const numeroOC = (t.ordenCompra?.numeroOC || '').toString();
        if (!numeroOC || !selectedOCs.has(numeroOC)) continue;

        const valorEgreso = egresoDoc.debito || 0;
        const valorOC = (t.ordenCompra?.valorAntesIva || 0) + (t.ordenCompra?.valorIva || 0);
        result.push({
          numeroEgreso: egresoDoc.numeroEgreso || egresoDoc.nombre,
          ordenCompraNumero: numeroOC,
          requisicionNumero: t.requisicion?.numeroRequisicion || '',
          valorEgreso,
          valorOrdenCompra: valorOC,
          valorRequisicion: 0,
          diferenciasEgreso: Math.abs(valorEgreso - valorOC),
          diferenciasOc: 0,
          diferenciasOC: 0,
          coincide: Math.abs(valorEgreso - valorOC) < 1,
        });
      }
    }

    // If no per-provider data, fall back to preserving any existing legacy associations
    return result;
  }

  /** Syncs the flat ocsSeleccionadas signal from the per-provider map */
  private syncOcsSeleccionadas(ocsMapa: Map<string, Set<string>>): void {
    const all: string[] = [];
    ocsMapa.forEach((ocs) => ocs.forEach((oc) => { if (oc) all.push(oc); }));
    this.ocsSeleccionadas.set([...new Set(all)]);
  }
}
