import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, Output, EventEmitter, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TramiteRequisicion, Cotizacion, EstadoProveedor, MONEDAS } from '../../models/tramitar-requisicion.model';
import { TramitarRequisicionService } from '../../services/tramitar-requisicion.service';
import { ProveedorService } from '../../../../proveedores/services/proveedor.service';
import { Proveedor } from '../../../../proveedores/models/proveedor.model';

@Component({
  selector: 'app-paso2-cotizaciones',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './paso2-cotizaciones.component.html',
  styleUrls: ['./paso2-cotizaciones.component.scss']
})
export class Paso2CotizacionesComponent implements OnInit {
  @Input() tramite!: TramiteRequisicion;
  @Output() completed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  monedas = MONEDAS;
  showFormCotizacion = signal(false);
  editingIndex = signal<number | null>(null);

  // Proveedores del sistema
  proveedoresSistema = signal<Proveedor[]>([]);
  loadingProveedores = signal(false);
  searchProveedor = signal('');
  showProveedorDropdown = signal(false);
  proveedorSeleccionado = signal<Proveedor | null>(null);

  proveedoresFiltrados = computed(() => {
    const term = this.searchProveedor().toLowerCase().trim();
    const proveedores = this.proveedoresSistema().filter(p => p.estado !== 'INACTIVO');
    if (!term) return proveedores;
    return proveedores.filter(p =>
      p.nombreProveedor.toLowerCase().includes(term) ||
      p.nit.toLowerCase().includes(term)
    );
  });

  // Form fields — core
  proveedor = '';
  valorCotizadoSinIva = 0;
  ivaPorcentaje = 19;
  moneda = 'COP';
  fechaCotizacion = '';
  archivoCotizacion: File | null = null;
  archivoNombre = '';

  constructor(
    private tramiteService: TramitarRequisicionService,
    private proveedorService: ProveedorService
  ) {}

  ngOnInit(): void {
    this.cargarProveedores();
  }

  cargarProveedores(): void {
    this.loadingProveedores.set(true);
    this.proveedorService.getProveedores().subscribe({
      next: (data) => {
        this.proveedoresSistema.set(data);
        this.loadingProveedores.set(false);
      },
      error: () => {
        this.proveedoresSistema.set([]);
        this.loadingProveedores.set(false);
      }
    });
  }

  onSearchProveedor(term: string): void {
    this.searchProveedor.set(term);
    this.showProveedorDropdown.set(true);
  }

  seleccionarProveedor(prov: Proveedor): void {
    this.proveedorSeleccionado.set(prov);
    this.proveedor = prov.nombreProveedor;
    this.searchProveedor.set(prov.nombreProveedor);
    this.showProveedorDropdown.set(false);
  }

  onProveedorInputFocus(): void {
    this.showProveedorDropdown.set(true);
  }

  onProveedorInputBlur(): void {
    // Small delay to allow click on dropdown item
    setTimeout(() => this.showProveedorDropdown.set(false), 200);
  }

  get valorTotalCotizado(): number {
    return this.valorCotizadoSinIva * (1 + this.ivaPorcentaje / 100);
  }

  get valorIva(): number {
    return this.valorCotizadoSinIva * (this.ivaPorcentaje / 100);
  }

  abrirFormulario(): void {
    this.resetForm();
    this.showFormCotizacion.set(true);
    this.editingIndex.set(null);
  }

  editarCotizacion(index: number): void {
    const cot = this.tramite.cotizaciones[index];
    this.proveedor = cot.proveedor;
    this.searchProveedor.set(cot.proveedor);
    const matchedProv = this.proveedoresSistema().find(p => p.nombreProveedor === cot.proveedor);
    this.proveedorSeleccionado.set(matchedProv || null);
    this.valorCotizadoSinIva = cot.valorCotizadoSinIva;
    this.ivaPorcentaje = cot.ivaPorcentaje;
    this.moneda = cot.moneda;
    this.fechaCotizacion = cot.fechaCotizacion;
    if (cot.archivoCotizacion instanceof File) {
      this.archivoCotizacion = cot.archivoCotizacion;
      this.archivoNombre = cot.archivoCotizacion.name;
    } else if (typeof cot.archivoCotizacion === 'string') {
      this.archivoNombre = cot.archivoCotizacion;
    }
    this.editingIndex.set(index);
    this.showFormCotizacion.set(true);
  }

  guardarCotizacion(): void {
    if (!this.proveedor || !this.valorCotizadoSinIva || !this.fechaCotizacion) return;

    const cotizacion: Cotizacion = {
      id: this.editingIndex() !== null ? this.tramite.cotizaciones[this.editingIndex()!].id : Date.now(),
      numeroRequisicion: this.tramite.requisicion.numeroRequisicion,
      proveedor: this.proveedor,
      valorCotizadoSinIva: this.valorCotizadoSinIva,
      ivaPorcentaje: this.ivaPorcentaje,
      valorTotalCotizado: this.valorTotalCotizado,
      moneda: this.moneda,
      fechaCotizacion: this.fechaCotizacion,
      archivoCotizacion: this.archivoCotizacion || undefined,
      estadoProveedor: 'PENDIENTE',
      valorIva: this.valorIva || undefined,
      subtotal: this.valorCotizadoSinIva || undefined,
    };

    if (this.editingIndex() !== null) {
      this.tramite.cotizaciones[this.editingIndex()!] = cotizacion;
    } else {
      this.tramite.cotizaciones.push(cotizacion);
    }

    this.showFormCotizacion.set(false);
    this.resetForm();
    this.saved.emit();
  }

  eliminarCotizacion(index: number): void {
    this.tramite.cotizaciones.splice(index, 1);
  }

  // --- File upload (solo adjuntar) ---
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.archivoCotizacion = input.files[0];
      this.archivoNombre = input.files[0].name;
    }
  }

  quitarArchivo(): void {
    this.archivoCotizacion = null;
    this.archivoNombre = '';
  }

  verArchivo(cot: Cotizacion): void {
    if (cot.archivoCotizacion) {
      if (cot.archivoCotizacion instanceof File) {
        const url = URL.createObjectURL(cot.archivoCotizacion);
        window.open(url, '_blank');
      } else {
        // Es una URL string
        window.open(cot.archivoCotizacion, '_blank');
      }
    }
  }

  cancelarForm(): void {
    this.showFormCotizacion.set(false);
    this.resetForm();
  }

  confirmar(): void {
    if (this.tramite.cotizaciones.length === 0) return;
    this.completed.emit();
  }

  getEstadoProveedorLabel(estado: EstadoProveedor): string {
    switch (estado) {
      case 'SELECCIONADO': return 'Seleccionado';
      case 'NO_SELECCIONADO': return 'No Seleccionado';
      case 'PENDIENTE': return 'Pendiente';
    }
  }

  isMejorOferta(index: number): boolean {
    if (this.tramite.cotizaciones.length <= 1) return false;
    const totales = this.tramite.cotizaciones.map(c => c.valorTotalCotizado);
    const min = Math.min(...totales);
    return this.tramite.cotizaciones[index].valorTotalCotizado === min;
  }

  getValorMenor(): number {
    if (this.tramite.cotizaciones.length === 0) return 0;
    return Math.min(...this.tramite.cotizaciones.map(c => c.valorTotalCotizado));
  }

  getPromedioTotal(): number {
    if (this.tramite.cotizaciones.length === 0) return 0;
    const sum = this.tramite.cotizaciones.reduce((acc, c) => acc + c.valorTotalCotizado, 0);
    return sum / this.tramite.cotizaciones.length;
  }

  private resetForm(): void {
    this.proveedor = '';
    this.searchProveedor.set('');
    this.proveedorSeleccionado.set(null);
    this.showProveedorDropdown.set(false);
    this.valorCotizadoSinIva = 0;
    this.ivaPorcentaje = 19;
    this.moneda = 'COP';
    this.fechaCotizacion = '';
    this.archivoCotizacion = null;
    this.archivoNombre = '';
  }
}
