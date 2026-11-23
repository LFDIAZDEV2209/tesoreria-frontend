import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { ChangeDetectionStrategy, Component, OnInit, signal, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  trigger,
  style,
  transition,
  animate,
} from '@angular/animations';
import { TesoreriaService, ApiMovimientoDiarioPago, ApiCrearMovimientoDiarioPagoRequest } from '../../../tesoreria/services/tesoreria.service';
import { BancoService } from '../../services/banco.service';

export interface PagoDiario {
  id: number;
  bancoId: number;
  fecha: string;
  banco: string;
  ultimosDigitos: string;
  empresaUT: string;
  saldoInicial: number;
  ingresosPorCliente: number;
  ingresosPorARL: number;
  otrosIngresos: number;
  nEgreso: string;
  nEgresoProveedor?: string;
  nEgresoPresupuesto?: string;
  nEgresoNomina?: string;
  pagoProveedores: number;
  pagoPresupuesto: number;
  pagosNominas: number;
  rechazos: number;
  gastosBancarios: number;
  saldoFinal: number;
  observaciones: string;
  tipoOrigen: string;
  solicitudId: number | null;
  isEditing?: boolean;
  isNew?: boolean;
}

export interface ResumenCuenta {
  nombreBanco: string;
  numeroCuenta: string;
  tipoCuenta: string;
  saldoActual: number;
  totalIngresos: number;
  totalEgresos: number;
  totalProveedores: number;
  totalNominas: number;
}

@Component({
  selector: 'app-control-diario-pagos',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './control-diario-pagos.component.html',
  styleUrl: './control-diario-pagos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(24px)' }),
        animate('500ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('rowAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-12px)' }),
        animate('350ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
    trigger('modalOverlay', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('250ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 })),
      ]),
    ]),
    trigger('modalPanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9) translateY(30px)' }),
        animate('350ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'scale(1) translateY(0)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.95) translateY(10px)' })),
      ]),
    ]),
    trigger('toastAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-20px) scale(0.95)' }),
        animate('300ms cubic-bezier(0.33, 1, 0.68, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px) scale(0.95)' })),
      ]),
    ]),
  ],
})
export class ControlDiarioPagosComponent implements OnInit {
  @ViewChild('fileInputProveedor') fileInputProveedor!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputPresupuesto') fileInputPresupuesto!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputNomina') fileInputNomina!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputGeneral') fileInputGeneral!: ElementRef<HTMLInputElement>;

  bancoId = signal<number>(0);
  searchTerm = '';
  filterFecha = '';
  filterTipo = '';
  isLoading = signal<boolean>(false);
  showModal = signal<boolean>(false);
  showSuccessToast = signal<boolean>(false);
  toastMessage = signal<string>('');
  isSaving = signal<boolean>(false);

  /** Saldo configurado de la cuenta bancaria (saldoPrincipal al crear la cuenta) */
  saldoInicialCuenta = signal<number>(0);

  /** Per-egress comprobante files */
  comprobantesProveedor: File[] = [];
  comprobantesPresupuesto: File[] = [];
  comprobantesNomina: File[] = [];
  comprobantesGeneral: File[] = [];
  /** Legacy flat list for backwards compat */
  get comprobantesFiles(): File[] {
    return [...this.comprobantesProveedor, ...this.comprobantesPresupuesto, ...this.comprobantesNomina, ...this.comprobantesGeneral];
  }
  get totalComprobantes(): number {
    return this.comprobantesProveedor.length + this.comprobantesPresupuesto.length + this.comprobantesNomina.length + this.comprobantesGeneral.length;
  }
  dragOverTarget = signal<string>('');

  resumenCuenta = signal<ResumenCuenta>({
    nombreBanco: 'BBVA Colombia',
    numeroCuenta: '9479',
    tipoCuenta: 'Corriente',
    saldoActual: 0,
    totalIngresos: 0,
    totalEgresos: 0,
    totalProveedores: 0,
    totalNominas: 0,
  });

  pagos: PagoDiario[] = [];
  nuevoMovimiento: PagoDiario = this.getEmptyMovimiento();

  // ═══ COMPUTADOS ═══
  get filteredPagos(): PagoDiario[] {
    let result = [...this.pagos];

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.observaciones.toLowerCase().includes(term) ||
          p.empresaUT.toLowerCase().includes(term) ||
          p.nEgreso.toLowerCase().includes(term),
      );
    }

    if (this.filterFecha) {
      result = result.filter((p) => p.fecha === this.filterFecha);
    }

    if (this.filterTipo) {
      result = result.filter((p) => p.tipoOrigen === this.filterTipo);
    }

    return result;
  }

  get totalIngresos(): number {
    return this.pagos.reduce((sum, p) => sum + p.ingresosPorCliente + p.ingresosPorARL + p.otrosIngresos, 0);
  }

  get totalEgresos(): number {
    return this.pagos.reduce((sum, p) => sum + p.pagoProveedores + p.pagoPresupuesto + p.pagosNominas + p.rechazos + p.gastosBancarios, 0);
  }

  get totalProveedores(): number {
    return this.pagos.reduce((sum, p) => sum + p.pagoProveedores, 0);
  }

  get totalPresupuesto(): number {
    return this.pagos.reduce((sum, p) => sum + p.pagoPresupuesto, 0);
  }

  get totalNominas(): number {
    return this.pagos.reduce((sum, p) => sum + p.pagosNominas, 0);
  }

  get totalGastosBancarios(): number {
    return this.pagos.reduce((sum, p) => sum + p.gastosBancarios, 0);
  }

  get saldoFinalActual(): number {
    if (this.pagos.length === 0) return this.saldoInicialCuenta();
    // pagos comes ordered by fecha DESC, id DESC → [0] is the most recent
    return this.pagos[0].saldoFinal;
  }

  get totalRegistros(): number {
    return this.filteredPagos.length;
  }

  get totalProveedoresAuto(): number {
    return this.pagos
      .filter((p) => p.tipoOrigen === 'AUTOMATICO')
      .reduce((sum, p) => sum + p.pagoProveedores, 0);
  }

  fechasUnicas: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tesoreriaService: TesoreriaService,
    private bancoService: BancoService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.bancoId.set(Number(this.route.snapshot.paramMap.get('id')) || 0);
    this.loadData();
  }

  // ═══ CARGA DE DATOS ═══
  loadData(): void {
    this.isLoading.set(true);
    const id = this.bancoId();

    // Load bank info (saldoPrincipal) for auto saldo inicial
    this.bancoService.getBancoById(id).subscribe({
      next: (banco) => {
        this.saldoInicialCuenta.set(banco.saldoPrincipal || 0);
        this.resumenCuenta.set({
          ...this.resumenCuenta(),
          nombreBanco: banco.banco || banco.nombreBanco,
          numeroCuenta: banco.numeroCuenta,
          tipoCuenta: banco.tipoCuenta,
        });
        this.cdr.markForCheck();
      },
      error: () => {/* keep defaults */},
    });

    this.tesoreriaService.getMovimientosDiarioPago(id).subscribe({
      next: (data) => {
        this.pagos = data.map((item) => this.mapApiToLocal(item));
        this.fechasUnicas = [...new Set(this.pagos.map((p) => p.fecha))];
        this.updateResumen();
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private mapApiToLocal(item: ApiMovimientoDiarioPago): PagoDiario {
    const nEgreso = item.nEgreso || '';
    let nEgresoProveedor = '';
    let nEgresoPresupuesto = '';
    let nEgresoNomina = '';
    if (nEgreso.includes('Prov:') || nEgreso.includes('Pres:') || nEgreso.includes('Nom:')) {
      for (const part of nEgreso.split('|').map(s => s.trim())) {
        if (part.startsWith('Prov:')) nEgresoProveedor = part.replace('Prov:', '').trim();
        else if (part.startsWith('Pres:')) nEgresoPresupuesto = part.replace('Pres:', '').trim();
        else if (part.startsWith('Nom:')) nEgresoNomina = part.replace('Nom:', '').trim();
      }
    }
    return {
      id: item.id,
      bancoId: item.bancoId,
      fecha: item.fecha,
      banco: item.banco || '',
      ultimosDigitos: item.ultimosDigitos || '',
      empresaUT: item.empresaUt || '',
      saldoInicial: Number(item.saldoInicial ?? 0),
      ingresosPorCliente: Number(item.ingresosCliente ?? 0),
      ingresosPorARL: Number(item.ingresosArl ?? 0),
      otrosIngresos: Number(item.otrosIngresos ?? 0),
      nEgreso,
      nEgresoProveedor,
      nEgresoPresupuesto,
      nEgresoNomina,
      pagoProveedores: Number(item.pagoProveedores ?? 0),
      pagoPresupuesto: Number(item.pagoPresupuesto ?? 0),
      pagosNominas: Number(item.pagosNominas ?? 0),
      rechazos: Number(item.rechazos ?? 0),
      gastosBancarios: Number(item.gastosBancarios ?? 0),
      saldoFinal: Number(item.saldoFinal ?? 0),
      observaciones: item.observaciones || '',
      tipoOrigen: item.tipoOrigen || 'MANUAL',
      solicitudId: item.solicitudId,
    };
  }

  private mapLocalToApi(pago: PagoDiario): ApiCrearMovimientoDiarioPagoRequest {
    return {
      bancoId: this.bancoId(),
      fecha: pago.fecha,
      banco: pago.banco,
      ultimosDigitos: pago.ultimosDigitos,
      empresaUt: pago.empresaUT,
      saldoInicial: pago.saldoInicial,
      ingresosCliente: pago.ingresosPorCliente,
      ingresosArl: pago.ingresosPorARL,
      otrosIngresos: pago.otrosIngresos,
      nEgreso: [
        pago.nEgresoProveedor ? `Prov:${pago.nEgresoProveedor}` : '',
        pago.nEgresoPresupuesto ? `Pres:${pago.nEgresoPresupuesto}` : '',
        pago.nEgresoNomina ? `Nom:${pago.nEgresoNomina}` : '',
      ].filter(s => s).join(' | ') || pago.nEgreso,
      pagoProveedores: pago.pagoProveedores,
      pagoPresupuesto: pago.pagoPresupuesto,
      pagosNominas: pago.pagosNominas,
      rechazos: pago.rechazos,
      gastosBancarios: pago.gastosBancarios,
      observaciones: pago.observaciones,
      tipoOrigen: pago.tipoOrigen || 'MANUAL',
    };
  }

  private updateResumen(): void {
    this.resumenCuenta.set({
      ...this.resumenCuenta(),
      saldoActual: this.saldoFinalActual,
      totalIngresos: this.totalIngresos,
      totalEgresos: this.totalEgresos,
      totalProveedores: this.totalProveedores,
      totalNominas: this.totalNominas,
    });
  }

  // ═══ MODAL NUEVO MOVIMIENTO ═══
  openModal(): void {
    this.nuevoMovimiento = this.getEmptyMovimiento();
    const r = this.resumenCuenta();
    this.nuevoMovimiento.banco = r.nombreBanco;
    this.nuevoMovimiento.ultimosDigitos = r.numeroCuenta;
    this.nuevoMovimiento.fecha = new Date().toISOString().slice(0, 10);

    // Auto saldo inicial:
    // pagos comes ordered by fecha DESC → [0] is the most recent movement
    // Use its saldoFinal as saldoInicial for the new movement
    if (this.pagos.length > 0) {
      const ultimoMovimiento = this.pagos[0];
      this.nuevoMovimiento.saldoInicial = ultimoMovimiento.saldoFinal;
    } else {
      this.nuevoMovimiento.saldoInicial = this.saldoInicialCuenta();
    }

    this.recalcularSaldoFinal(this.nuevoMovimiento);
    this.comprobantesProveedor = [];
    this.comprobantesPresupuesto = [];
    this.comprobantesNomina = [];
    this.comprobantesGeneral = [];
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  // ═══ AUTO CÁLCULO DEL SALDO FINAL ═══
  recalcularSaldoFinal(pago: PagoDiario): void {
    const ingresos = (pago.ingresosPorCliente || 0) + (pago.ingresosPorARL || 0) + (pago.otrosIngresos || 0);
    const egresos = (pago.pagoProveedores || 0) + (pago.pagoPresupuesto || 0) +
      (pago.pagosNominas || 0) + (pago.rechazos || 0) + (pago.gastosBancarios || 0);
    pago.saldoFinal = (pago.saldoInicial || 0) + ingresos - egresos;
  }

  recalcularModal(): void {
    this.recalcularSaldoFinal(this.nuevoMovimiento);
  }

  // ═══ GUARDAR NUEVO MOVIMIENTO ═══
  guardarNuevoMovimiento(): void {
    if (this.isSaving()) return;
    this.isSaving.set(true);

    this.recalcularSaldoFinal(this.nuevoMovimiento);
    const payload = this.mapLocalToApi(this.nuevoMovimiento);

    this.tesoreriaService.crearMovimientoDiarioPagoConArchivos(payload, this.comprobantesFiles).subscribe({
      next: (result) => {
        if (result) {
          this.showToast('Movimiento registrado exitosamente');
          this.closeModal();
          this.comprobantesProveedor = [];
          this.comprobantesPresupuesto = [];
          this.comprobantesNomina = [];
          this.comprobantesGeneral = [];
          this.loadData();
        } else {
          this.showToast('Error al registrar el movimiento');
        }
        this.isSaving.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.showToast('Error al registrar el movimiento');
        this.isSaving.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // ═══ EDICIÓN INLINE ═══
  startEditing(pago: PagoDiario): void {
    if (pago.tipoOrigen === "PRESUPUESTO") return;
    this.pagos.forEach((p) => (p.isEditing = false));
    pago.isEditing = true;
    this.cdr.markForCheck();
  }

  cancelEditing(pago: PagoDiario): void {
    pago.isEditing = false;
    this.loadData();
  }

  saveEditing(pago: PagoDiario): void {
    this.isSaving.set(true);
    this.recalcularSaldoFinal(pago);
    const payload = this.mapLocalToApi(pago);

    this.tesoreriaService.actualizarMovimientoDiarioPago(pago.id, payload).subscribe({
      next: (result) => {
        if (result) {
          pago.isEditing = false;
          this.showToast('Movimiento actualizado');
          this.loadData();
        } else {
          this.showToast('Error al actualizar');
        }
        this.isSaving.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.showToast('Error al actualizar');
        this.isSaving.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // ═══ ELIMINAR ═══
  confirmarEliminar(pago: PagoDiario): void {
    if (pago.tipoOrigen === "PRESUPUESTO") return;
    if (!confirm(`¿Eliminar el movimiento #${pago.id}?`)) return;

    this.tesoreriaService.eliminarMovimientoDiarioPago(pago.id).subscribe({
      next: (ok) => {
        if (ok) {
          this.showToast('Movimiento eliminado');
          this.loadData();
        } else {
          this.showToast('Error al eliminar');
        }
        this.cdr.markForCheck();
      },
    });
  }

  // ═══ UTILS ═══
  showToast(msg: string): void {
    this.toastMessage.set(msg);
    this.showSuccessToast.set(true);
    setTimeout(() => {
      this.showSuccessToast.set(false);
      this.cdr.markForCheck();
    }, 3000);
  }

  volver(): void {
    this.router.navigate(['/tesoreria/control-bancos']);
  }

  getRowTotal(pago: PagoDiario): number {
    return pago.ingresosPorCliente + pago.ingresosPorARL + pago.otrosIngresos;
  }

  getRowTotalEgresos(pago: PagoDiario): number {
    return pago.pagoProveedores + pago.pagoPresupuesto + pago.pagosNominas + pago.rechazos + pago.gastosBancarios;
  }

  formatCurrency(value: number): string {
    if (value === 0) return '-';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }

  isProveedoresReadonly(pago: PagoDiario): boolean {
    return pago.tipoOrigen === 'AUTOMATICO';
  }

  // ═══ PER-EGRESS COMPROBANTES FILE HANDLING ═══

  onEgresoFileSelected(event: Event, tipo: 'proveedor' | 'presupuesto' | 'nomina' | 'general'): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      const files = Array.from(input.files);
      switch (tipo) {
        case 'proveedor': this.comprobantesProveedor = [...this.comprobantesProveedor, ...files]; break;
        case 'presupuesto': this.comprobantesPresupuesto = [...this.comprobantesPresupuesto, ...files]; break;
        case 'nomina': this.comprobantesNomina = [...this.comprobantesNomina, ...files]; break;
        case 'general': this.comprobantesGeneral = [...this.comprobantesGeneral, ...files]; break;
      }
      this.cdr.markForCheck();
    }
    input.value = '';
  }

  onEgresoDrop(event: DragEvent, tipo: 'proveedor' | 'presupuesto' | 'nomina' | 'general'): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverTarget.set('');
    if (event.dataTransfer?.files) {
      const files = Array.from(event.dataTransfer.files);
      switch (tipo) {
        case 'proveedor': this.comprobantesProveedor = [...this.comprobantesProveedor, ...files]; break;
        case 'presupuesto': this.comprobantesPresupuesto = [...this.comprobantesPresupuesto, ...files]; break;
        case 'nomina': this.comprobantesNomina = [...this.comprobantesNomina, ...files]; break;
        case 'general': this.comprobantesGeneral = [...this.comprobantesGeneral, ...files]; break;
      }
      this.cdr.markForCheck();
    }
  }

  onEgresoDragOver(event: DragEvent, tipo: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverTarget.set(tipo);
  }

  onEgresoDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverTarget.set('');
  }

  removeEgresoFile(tipo: 'proveedor' | 'presupuesto' | 'nomina' | 'general', index: number): void {
    switch (tipo) {
      case 'proveedor': this.comprobantesProveedor.splice(index, 1); this.comprobantesProveedor = [...this.comprobantesProveedor]; break;
      case 'presupuesto': this.comprobantesPresupuesto.splice(index, 1); this.comprobantesPresupuesto = [...this.comprobantesPresupuesto]; break;
      case 'nomina': this.comprobantesNomina.splice(index, 1); this.comprobantesNomina = [...this.comprobantesNomina]; break;
      case 'general': this.comprobantesGeneral.splice(index, 1); this.comprobantesGeneral = [...this.comprobantesGeneral]; break;
    }
    this.cdr.markForCheck();
  }

  getEgresoFiles(tipo: 'proveedor' | 'presupuesto' | 'nomina' | 'general'): File[] {
    switch (tipo) {
      case 'proveedor': return this.comprobantesProveedor;
      case 'presupuesto': return this.comprobantesPresupuesto;
      case 'nomina': return this.comprobantesNomina;
      case 'general': return this.comprobantesGeneral;
    }
  }

  getFileIcon(fileName: string): string {
    if (fileName.endsWith('.pdf')) return 'pdf';
    if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) return 'doc';
    if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) return 'xls';
    return 'img';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Whether the current nuevo movimiento has any egresos (needed for comprobante section) */
  get tieneEgresos(): boolean {
    const m = this.nuevoMovimiento;
    return (m.pagoProveedores || 0) + (m.pagoPresupuesto || 0) + (m.pagosNominas || 0) + (m.rechazos || 0) + (m.gastosBancarios || 0) > 0;
  }

  /** Total ingresos of the current nuevo movimiento */
  get modalTotalIngresos(): number {
    const m = this.nuevoMovimiento;
    return (m.ingresosPorCliente || 0) + (m.ingresosPorARL || 0) + (m.otrosIngresos || 0);
  }

  /** Total egresos of the current nuevo movimiento */
  get modalTotalEgresos(): number {
    const m = this.nuevoMovimiento;
    return (m.pagoProveedores || 0) + (m.pagoPresupuesto || 0) + (m.pagosNominas || 0) + (m.rechazos || 0) + (m.gastosBancarios || 0);
  }

  /** Whether the saldo inicial is auto-filled (readonly) */
  get saldoInicialAutoFilled(): boolean {
    return this.pagos.length > 0 || this.saldoInicialCuenta() > 0;
  }

  /** Source label for saldo inicial */
  get saldoInicialSourceLabel(): string {
    if (this.pagos.length > 0) return 'Saldo final del último movimiento';
    if (this.saldoInicialCuenta() > 0) return 'Saldo configurado de la cuenta';
    return 'Ingrese el saldo inicial';
  }

  private getEmptyMovimiento(): PagoDiario {
    return {
      id: 0,
      bancoId: 0,
      fecha: new Date().toISOString().slice(0, 10),
      banco: '',
      ultimosDigitos: '',
      empresaUT: '',
      saldoInicial: 0,
      ingresosPorCliente: 0,
      ingresosPorARL: 0,
      otrosIngresos: 0,
      nEgreso: '',
      nEgresoProveedor: '',
      nEgresoPresupuesto: '',
      nEgresoNomina: '',
      pagoProveedores: 0,
      pagoPresupuesto: 0,
      pagosNominas: 0,
      rechazos: 0,
      gastosBancarios: 0,
      saldoFinal: 0,
      observaciones: '',
      tipoOrigen: 'MANUAL',
      solicitudId: null,
      isNew: true,
    };
  }

  trackByPagoId(index: number, pago: PagoDiario): number {
    return pago.id;
  }
}
