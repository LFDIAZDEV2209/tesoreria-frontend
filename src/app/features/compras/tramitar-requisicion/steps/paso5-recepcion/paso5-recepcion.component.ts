import { Component, Input, Output, EventEmitter, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TramiteRequisicion, RecepcionRecurso, EstadoRecepcion } from '../../models/tramitar-requisicion.model';

@Component({
  selector: 'app-paso5-recepcion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './paso5-recepcion.component.html',
  styleUrls: ['./paso5-recepcion.component.scss']
})
export class Paso5RecepcionComponent implements OnInit {
  @Input() tramite!: TramiteRequisicion;
  @Output() completed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  fechaRecepcion = '';
  recibidoPor = '';
  estadoRecepcion: EstadoRecepcion = 'COMPLETA';
  observaciones = '';
  archivoEvidencia: File | null = null;
  archivoNombre = '';

  estadosRecepcion: { value: EstadoRecepcion; label: string; icon: string; color: string }[] = [
    { value: 'COMPLETA', label: 'Completa', icon: 'check-circle', color: '#10b981' },
    { value: 'PARCIAL', label: 'Parcial', icon: 'exclamation-circle', color: '#f59e0b' },
    { value: 'RECHAZADA', label: 'Rechazada', icon: 'x-circle', color: '#ef4444' },
  ];

  ngOnInit(): void {
    if (this.tramite.recepcion) {
      this.fechaRecepcion = this.tramite.recepcion.fechaRecepcion;
      this.recibidoPor = this.tramite.recepcion.recibidoPor;
      this.estadoRecepcion = this.tramite.recepcion.estadoRecepcion;
      this.observaciones = this.tramite.recepcion.observaciones;
    }
  }

  get numeroOC(): string {
    return this.tramite.ordenCompra?.numeroOC || 'N/A';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.archivoEvidencia = input.files[0];
      this.archivoNombre = input.files[0].name;
    }
  }

  get isFormValid(): boolean {
    return !!this.fechaRecepcion && !!this.recibidoPor;
  }

  confirmar(): void {
    if (!this.isFormValid) return;

    this.tramite.recepcion = {
      numeroOC: this.numeroOC,
      fechaRecepcion: this.fechaRecepcion,
      recibidoPor: this.recibidoPor,
      estadoRecepcion: this.estadoRecepcion,
      observaciones: this.observaciones,
      archivoEvidencia: this.archivoEvidencia || undefined
    };

    this.completed.emit();
  }

  getEstadoColor(estado: EstadoRecepcion): string {
    const found = this.estadosRecepcion.find(e => e.value === estado);
    return found?.color || '#6b7280';
  }
}
