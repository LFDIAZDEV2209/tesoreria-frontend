import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, Output, EventEmitter, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TramiteRequisicion, EntregaRecurso, EstadoEntrega } from '../../models/tramitar-requisicion.model';

@Component({
  selector: 'app-paso6-entrega',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './paso6-entrega.component.html',
  styleUrls: ['./paso6-entrega.component.scss']
})
export class Paso6EntregaComponent implements OnInit {
  @Input() tramite!: TramiteRequisicion;
  @Output() completed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  fechaEntrega = '';
  entregadoA = '';
  areaDestino = '';
  estadoEntrega: EstadoEntrega = 'COMPLETA';
  observaciones = '';
  archivoEvidencia: File | null = null;
  archivoNombre = '';

  estadosEntrega: { value: EstadoEntrega; label: string }[] = [
    { value: 'COMPLETA', label: 'Completa' },
    { value: 'PARCIAL', label: 'Parcial' },
  ];

  ngOnInit(): void {
    if (this.tramite.entrega) {
      this.fechaEntrega = this.tramite.entrega.fechaEntrega;
      this.entregadoA = this.tramite.entrega.entregadoA;
      this.areaDestino = this.tramite.entrega.areaDestino;
      this.estadoEntrega = this.tramite.entrega.estadoEntrega;
      this.observaciones = this.tramite.entrega.observaciones;
    }

    // Pre-fill area from requisition
    if (!this.areaDestino) {
      this.areaDestino = this.tramite.requisicion.areaCentroCosto;
    }
  }

  get numeroOCRequisicion(): string {
    return this.tramite.ordenCompra?.numeroOC || this.tramite.requisicion.numeroRequisicion;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.archivoEvidencia = input.files[0];
      this.archivoNombre = input.files[0].name;
    }
  }

  get isFormValid(): boolean {
    return !!this.fechaEntrega && !!this.entregadoA && !!this.areaDestino;
  }

  confirmar(): void {
    if (!this.isFormValid) return;

    this.tramite.entrega = {
      numeroOCRequisicion: this.numeroOCRequisicion,
      fechaEntrega: this.fechaEntrega,
      entregadoA: this.entregadoA,
      areaDestino: this.areaDestino,
      estadoEntrega: this.estadoEntrega,
      observaciones: this.observaciones,
      archivoEvidencia: this.archivoEvidencia || undefined
    };

    this.completed.emit();
  }
}
