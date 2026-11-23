import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, Output, EventEmitter, signal, computed, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormArray, FormBuilder } from '@angular/forms';

export interface ItemGasto {
  id: number;
  tipoViatico: string;
  fechaGasto: string;
  conceptoDetallado: string;
  observacionItem?: string;
  valorBase: number;
  aplicaIva: boolean;
  porcentajeIva: number;
  valorIva: number;
  valorTotal: number;
  soporte?: File;
}

export type TipoSolicitudViaticos = 'SOLICITUD_VIATICOS' | 'ADELANTO_VIATICOS';

@Component({
  selector: 'app-viaticos-fields',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './viaticos-fields.component.html',
  styleUrls: ['./viaticos-fields.component.scss']
})
export class ViaticosFieldsComponent implements OnChanges {
  @Input() formGroup!: FormGroup;
  @Input() empresaNombre = '';
  @Input() nitEmpresa = '';
  @Input() areaNombre = '';
  @Input() cargoNombre = '';
  @Input() solicitanteNombre = '';
  @Input() correoElectronico = '';
  @Input() telefonoContacto = '';

  /** Campos de empresa que se auto-rellenan desde el perfil del usuario */

  ngOnChanges(changes: SimpleChanges): void {
    // Auto-rellenar los campos de empresa cuando llegan los datos del usuario
    if (!this.formGroup) return;
    const debeAutoFill =
      changes['empresaNombre'] || changes['nitEmpresa'] || changes['areaNombre'];
    if (!debeAutoFill) return;

    if (this.empresaNombre) {
      this.formGroup.get('nombreEmpresa')?.setValue(this.empresaNombre, { emitEvent: false });
      this.formGroup.get('nombreEmpresa')?.disable({ emitEvent: false });
      // centroCosto = misma empresa
      this.formGroup.get('centroCosto')?.setValue(this.empresaNombre, { emitEvent: false });
      this.formGroup.get('centroCosto')?.disable({ emitEvent: false });
    }
    if (this.nitEmpresa) {
      this.formGroup.get('nit')?.setValue(this.nitEmpresa, { emitEvent: false });
      this.formGroup.get('nit')?.disable({ emitEvent: false });
    }
    if (this.areaNombre) {
      this.formGroup.get('areaDependencia')?.setValue(this.areaNombre, { emitEvent: false });
      this.formGroup.get('areaDependencia')?.disable({ emitEvent: false });
    }
  }

  // ── Items de gasto ──
  flujoConfirmado = signal(false);
  tipoSolicitudViaticos = signal<TipoSolicitudViaticos>('SOLICITUD_VIATICOS');
  items = signal<ItemGasto[]>([]);
  private nextItemId = 1;

  // ── Modal state ──
  showModal = signal(false);
  showExitConfirm = signal(false);
  editingItemId = signal<number | null>(null);
  modalTipo = signal('');
  modalFecha = signal(new Date().toISOString().split('T')[0]);
  modalConcepto = signal('');
  modalObservacion = signal('');
  modalValorBase = signal(0);
  modalAplicaIva = signal(false);
  modalPorcentajeIva = signal(19);
  modalSoporte = signal<File | null>(null);

  // ── Files ──
  soportesAdicionales = signal<File[]>([]);
  certificadoBancario = signal<File | null>(null);

  // ── Observaciones ──
  observacionesViaticos = signal('');

  // ── Opciones ──
  tiposViatico = ['Transporte', 'Alimentación', 'Hospedaje', 'Representación', 'Otros'];
  conceptosAdelanto = ['Alimentación', 'Transporte', 'Peajes', 'Hospedaje', 'Adelanto'];

  ciudades = [
    'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
    'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta', 'Ibagué',
    'Santa Marta', 'Villavicencio', 'Pasto', 'Montería', 'Neiva',
  ];

  // ── Computed ──
  totalItems = computed(() => this.items().reduce((s, i) => s + i.valorTotal, 0));
  subtotalBase = computed(() => this.items().reduce((s, i) => s + i.valorBase, 0));
  totalIva = computed(() => this.items().reduce((s, i) => s + i.valorIva, 0));
  esAdelantoViaticos = computed(() => this.tipoSolicitudViaticos() === 'ADELANTO_VIATICOS');

  // Checklist signals
  empresaCompleta = computed(() => {
    const fg = this.formGroup;
    return !!(fg?.get('nombreEmpresa')?.value &&
              fg?.get('nit')?.value && fg?.get('centroCosto')?.value);
  });
  solicitanteCompleto = computed(() => {
    return !!(this.solicitanteNombre && this.correoElectronico && this.areaNombre);
  });
  tieneItems = computed(() => this.items().length > 0);
  totalMayorCero = computed(() => this.totalItems() > 0);

  // Modal computed
  get modalValorIva(): number {
    if (!this.modalAplicaIva()) return 0;
    return Math.round(this.modalValorBase() * this.modalPorcentajeIva() / 100);
  }
  get modalValorTotal(): number {
    return this.modalValorBase() + this.modalValorIva;
  }
  get canAddItem(): boolean {
    if (this.esAdelantoViaticos()) {
      return (
        this.modalFecha() !== '' &&
        this.modalConcepto().trim() !== '' &&
        this.modalObservacion().trim() !== '' &&
        this.modalValorBase() > 0
      );
    }

    return this.modalTipo() !== '' && this.modalFecha() !== '' &&
           this.modalConcepto().trim() !== '' && this.modalValorBase() > 0;
  }

  constructor(private fb: FormBuilder) {}

  // ── Modal actions ──
  openModal(): void {
    this.modalTipo.set(this.esAdelantoViaticos() ? 'ADELANTO' : '');
    this.modalFecha.set(new Date().toISOString().split('T')[0]);
    this.modalConcepto.set('');
    this.modalObservacion.set('');
    this.modalValorBase.set(0);
    this.modalAplicaIva.set(false);
    this.modalPorcentajeIva.set(19);
    this.modalSoporte.set(null);
    this.showModal.set(true);
  }

  confirmarFlujo(): void {
    this.flujoConfirmado.set(true);
  }

  volverASeleccionFlujo(): void {
    this.flujoConfirmado.set(false);
    this.showModal.set(false);
  }

  setTipoSolicitud(tipo: TipoSolicitudViaticos): void {
    if (this.tipoSolicitudViaticos() === tipo) {
      this.flujoConfirmado.set(true);
      return;
    }

    this.tipoSolicitudViaticos.set(tipo);
    this.items.set([]);
    this.soportesAdicionales.set([]);
    this.observacionesViaticos.set('');
    this.flujoConfirmado.set(true);
  }

  getTipoSolicitudLabel(tipo: TipoSolicitudViaticos): string {
    return tipo === 'ADELANTO_VIATICOS' ? 'Adelanto de viáticos' : 'Solicitud de viáticos';
  }

  closeModal(): void {
    const hasData = this.modalTipo() !== '' ||
                    this.modalConcepto().trim() !== '' ||
                    this.modalObservacion().trim() !== '' ||
                    this.modalValorBase() > 0 ||
                    this.modalSoporte() !== null;
    if (hasData) {
      this.showExitConfirm.set(true);
    } else {
      this._doCloseModal();
    }
  }

  confirmCloseModal(): void {
    this.showExitConfirm.set(false);
    this._doCloseModal();
  }

  cancelExitConfirm(): void {
    this.showExitConfirm.set(false);
  }

  openEditModal(item: ItemGasto): void {
    this.editingItemId.set(item.id);
    this.modalTipo.set(item.tipoViatico);
    this.modalFecha.set(item.fechaGasto);
    this.modalConcepto.set(item.conceptoDetallado);
    this.modalObservacion.set(item.observacionItem || '');
    this.modalValorBase.set(item.valorBase);
    this.modalAplicaIva.set(item.aplicaIva);
    this.modalPorcentajeIva.set(item.porcentajeIva);
    this.modalSoporte.set(item.soporte ?? null);
    this.showModal.set(true);
  }

  private _doCloseModal(): void {
    this.showModal.set(false);
    this.editingItemId.set(null);
    this.modalTipo.set(this.esAdelantoViaticos() ? 'ADELANTO' : '');
    this.modalFecha.set(new Date().toISOString().split('T')[0]);
    this.modalConcepto.set('');
    this.modalObservacion.set('');
    this.modalValorBase.set(0);
    this.modalAplicaIva.set(false);
    this.modalPorcentajeIva.set(19);
    this.modalSoporte.set(null);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('viat-modal-backdrop')) {
      this.closeModal();
    }
  }

  addItemFromModal(): void {
    if (!this.canAddItem) return;
    if (this.editingItemId() !== null) {
      this.items.update(list => list.map(item =>
        item.id === this.editingItemId() ? {
          ...item,
          tipoViatico: this.modalTipo(),
          fechaGasto: this.modalFecha(),
          conceptoDetallado: this.modalConcepto(),
          observacionItem: this.modalObservacion().trim(),
          valorBase: this.modalValorBase(),
          aplicaIva: this.esAdelantoViaticos() ? false : this.modalAplicaIva(),
          porcentajeIva: this.esAdelantoViaticos() ? 0 : this.modalPorcentajeIva(),
          valorIva: this.esAdelantoViaticos() ? 0 : this.modalValorIva,
          valorTotal: this.esAdelantoViaticos() ? this.modalValorBase() : this.modalValorTotal,
          soporte: this.modalSoporte() ?? undefined,
        } : item
      ));
    } else {
      const newItem: ItemGasto = {
        id: this.nextItemId++,
        tipoViatico: this.esAdelantoViaticos() ? 'ADELANTO' : this.modalTipo(),
        fechaGasto: this.modalFecha(),
        conceptoDetallado: this.modalConcepto(),
        observacionItem: this.modalObservacion().trim(),
        valorBase: this.modalValorBase(),
        aplicaIva: this.esAdelantoViaticos() ? false : this.modalAplicaIva(),
        porcentajeIva: this.esAdelantoViaticos() ? 0 : this.modalPorcentajeIva(),
        valorIva: this.esAdelantoViaticos() ? 0 : this.modalValorIva,
        valorTotal: this.esAdelantoViaticos() ? this.modalValorBase() : this.modalValorTotal,
        soporte: this.modalSoporte() ?? undefined,
      };
      this.items.update(list => [...list, newItem]);
    }
    this._doCloseModal();
  }

  removeItem(id: number): void {
    this.items.update(list => list.filter(i => i.id !== id));
  }

  // ── Modal soporte handling ──
  onModalSoporteChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.modalSoporte.set(file);
  }

  removeModalSoporte(): void {
    this.modalSoporte.set(null);
  }

  // ── File handling ──
  onSoportesAdicionalesChange(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (files) this.soportesAdicionales.update(list => [...list, ...Array.from(files)]);
  }

  onCertificadoBancarioChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.certificadoBancario.set(file);
  }

  removeCertificadoBancario(): void {
    this.certificadoBancario.set(null);
  }

  removeSoporteAdicional(index: number): void {
    this.soportesAdicionales.update(list => list.filter((_, i) => i !== index));
  }

  // ── Format ──
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', minimumFractionDigits: 0,
    }).format(value);
  }

  /** Retorna todos los datos de viáticos para serialización */
  getItemsForSubmit(): ItemGasto[] {
    return this.items();
  }

  getViaticosPayload(): any {
    return {
      tipoSolicitudViaticos: this.tipoSolicitudViaticos(),
      fechaMaximaEvento: this.getFechaMaximaEvento(),
      items: this.getItemsForSubmit(),
      soportesAdicionales: this.soportesAdicionales(),
      certificadoBancario: this.certificadoBancario(),
      observaciones: this.observacionesViaticos(),
    };
  }

  getCertificadoBancario(): File | null {
    return this.certificadoBancario();
  }

  getFechaMaximaEvento(): string {
    return this.formGroup?.get('fechaMaximaEvento')?.value || '';
  }
}
