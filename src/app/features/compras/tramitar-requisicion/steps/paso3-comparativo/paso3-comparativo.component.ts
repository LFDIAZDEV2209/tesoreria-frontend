import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, Output, EventEmitter, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TramiteRequisicion,
  Cotizacion,
  CriterioSeleccion,
  CRITERIOS_SELECCION,
  ComparativoSeleccion
} from '../../models/tramitar-requisicion.model';

export interface RankedCotizacion {
  cot: Cotizacion;
  index: number;
  rank: number;
  isBest: boolean;
  diffPercent: number;
  priceBarWidth: number;   // 0–100
  tiempoEntregaDias: number | null;
}

@Component({
  selector: 'app-paso3-comparativo',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './paso3-comparativo.component.html',
  styleUrls: ['./paso3-comparativo.component.scss']
})
export class Paso3ComparativoComponent implements OnInit {
  @Input() tramite!: TramiteRequisicion;
  @Output() completed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  criterios = CRITERIOS_SELECCION;
  criterioSeleccion: CriterioSeleccion = 'PRECIO';
  proveedorSeleccionadoIndex = signal<number | null>(null);
  justificacion = '';
  aprobador = '';
  aprobado = signal(false);
  loaded = signal(false);
  showConfetti = signal(false);

  /** View mode: 'cards' | 'table' */
  viewMode = signal<'cards' | 'table'>('cards');

  ngOnInit(): void {
    if (this.tramite.comparativo) {
      this.criterioSeleccion = this.tramite.comparativo.criterioSeleccion;
      this.justificacion = this.tramite.comparativo.justificacionBreve;
      this.aprobador = this.tramite.comparativo.aprobador;
      this.aprobado.set(this.tramite.comparativo.aprobado);

      const idx = this.tramite.cotizaciones.findIndex(
        c => c.proveedor === this.tramite.comparativo?.proveedorSeleccionado
      );
      if (idx >= 0) this.proveedorSeleccionadoIndex.set(idx);
    }
    // Trigger staggered animations after view init
    setTimeout(() => this.loaded.set(true), 100);
  }

  seleccionarProveedor(index: number): void {
    this.proveedorSeleccionadoIndex.set(index);
    this.tramite.cotizaciones.forEach((c, i) => {
      c.estadoProveedor = i === index ? 'SELECCIONADO' : 'NO_SELECCIONADO';
    });

  }

  toggleAprobacion(): void {
    this.aprobado.set(!this.aprobado());
  }

  toggleView(): void {
    this.viewMode.set(this.viewMode() === 'cards' ? 'table' : 'cards');
  }

  // ── Rankings ──────────────────────────────────────
  getRankedCotizaciones(): RankedCotizacion[] {
    const cots = this.tramite.cotizaciones;
    if (!cots.length) return [];

    const sorted = [...cots]
      .map((c, i) => ({ cot: c, index: i }))
      .sort((a, b) => a.cot.valorTotalCotizado - b.cot.valorTotalCotizado);

    const best = sorted[0].cot.valorTotalCotizado;
    const worst = sorted[sorted.length - 1].cot.valorTotalCotizado;
    const range = worst - best || 1;

    return cots.map((c, i) => {
      const rank = sorted.findIndex(s => s.index === i) + 1;
      const diff = best ? ((c.valorTotalCotizado - best) / best) * 100 : 0;
      // Price bar: best = 100%, worst = 30%
      const barWidth = 100 - ((c.valorTotalCotizado - best) / range) * 70;
      const dias = c.tiempoEntrega ? parseInt(c.tiempoEntrega, 10) || null : null;
      return {
        cot: c,
        index: i,
        rank,
        isBest: rank === 1,
        diffPercent: diff,
        priceBarWidth: Math.max(30, Math.min(100, barWidth)),
        tiempoEntregaDias: dias
      };
    });
  }

  getMejorPrecio(): number {
    if (!this.tramite.cotizaciones.length) return 0;
    return Math.min(...this.tramite.cotizaciones.map(c => c.valorTotalCotizado));
  }

  getPeorPrecio(): number {
    if (!this.tramite.cotizaciones.length) return 0;
    return Math.max(...this.tramite.cotizaciones.map(c => c.valorTotalCotizado));
  }

  getPromedioPrecio(): number {
    const cots = this.tramite.cotizaciones;
    if (!cots.length) return 0;
    return cots.reduce((sum, c) => sum + c.valorTotalCotizado, 0) / cots.length;
  }

  getAhorro(): number {
    return this.getPeorPrecio() - this.getMejorPrecio();
  }

  getDiferencia(cot: Cotizacion): number {
    const mejor = this.getMejorPrecio();
    if (!mejor) return 0;
    return ((cot.valorTotalCotizado - mejor) / mejor) * 100;
  }

  getRankMedal(rank: number): string {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  }

  getProviderColor(index: number): string {
    const colors = [
      'linear-gradient(135deg, #10b981, #059669)',
      'linear-gradient(135deg, #3b82f6, #2563eb)',
      'linear-gradient(135deg, #f59e0b, #d97706)',
      'linear-gradient(135deg, #8b5cf6, #7c3aed)',
      'linear-gradient(135deg, #ef4444, #dc2626)',
      'linear-gradient(135deg, #06b6d4, #0891b2)'
    ];
    return colors[index % colors.length];
  }

  getProviderSolidColor(index: number): string {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
    return colors[index % colors.length];
  }

  confirmar(): void {
    if (this.proveedorSeleccionadoIndex() === null || !this.justificacion || !this.aprobador) return;

    const idx = this.proveedorSeleccionadoIndex()!;
    this.tramite.comparativo = {
      numeroRequisicion: this.tramite.requisicion.numeroRequisicion,
      cotizaciones: this.tramite.cotizaciones,
      criterioSeleccion: this.criterioSeleccion,
      proveedorSeleccionado: this.tramite.cotizaciones[idx].proveedor,
      justificacionBreve: this.justificacion,
      aprobador: this.aprobador,
      aprobado: this.aprobado()
    };

    this.completed.emit();
  }

  get isFormValid(): boolean {
    return this.proveedorSeleccionadoIndex() !== null && !!this.justificacion && !!this.aprobador;
  }
}
