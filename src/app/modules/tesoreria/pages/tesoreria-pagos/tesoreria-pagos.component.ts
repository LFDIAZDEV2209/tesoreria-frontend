import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ControlEgresosService } from '../../../../features/contabilidad/control-egresos/control-egresos.service';
import { EgresoRegistrado } from '../../../../features/contabilidad/control-egresos/control-egresos.model';
import { PagoEgresoComponent } from '../pago-egreso/pago-egreso.component';

/**
 * Módulo Tesorería: egresos aprobados por Gerencia Financiera. Aquí se
 * adjunta el comprobante de pago, se compara con el documento de egreso y,
 * si coincide, el proceso termina conciliado.
 */
@Component({
  selector: 'app-tesoreria-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSnackBarModule, PagoEgresoComponent],
  templateUrl: './tesoreria-pagos.component.html',
  styleUrl: './tesoreria-pagos.component.scss',
})
export class TesoreriaPagosComponent implements OnInit {
  readonly egresos = signal<EgresoRegistrado[]>([]);
  readonly cargando = signal(false);
  readonly busqueda = signal('');
  readonly filtro = signal<'pendientes' | 'todos'>('pendientes');
  readonly seleccionado = signal<EgresoRegistrado | null>(null);

  private egresoUrl: number | null = null;

  readonly pendientes = computed(() => this.egresos().filter((e) => e.estado === 'ENVIADO_TESORERIA'));
  readonly pagados = computed(() => this.egresos().filter((e) => e.estado === 'PAGADO'));
  readonly montoPendiente = computed(() =>
    this.pendientes().reduce((total, e) => total + this.egresoNeto(e), 0),
  );

  readonly filtrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const base = this.filtro() === 'pendientes' ? this.pendientes() : this.egresos();
    if (!q) return base;
    return base.filter((e) =>
      [e.numeroFactura, e.numeroEgreso, e.nitProveedor, e.proveedorNombre, e.empresaNombre]
        .some((valor) => valor?.toLowerCase().includes(q)),
    );
  });

  constructor(
    private readonly service: ControlEgresosService,
    private readonly route: ActivatedRoute,
    private readonly snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('egreso'));
    this.egresoUrl = Number.isInteger(id) && id > 0 ? id : null;
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.service.listarPagosTesoreria().subscribe({
      next: (data) => {
        const lista = data ?? [];
        this.egresos.set(lista);
        this.cargando.set(false);
        if (this.egresoUrl) {
          const encontrado = lista.find((e) => e.id === this.egresoUrl);
          this.egresoUrl = null;
          if (encontrado) this.seleccionado.set(encontrado);
        }
      },
      error: () => {
        this.cargando.set(false);
        this.snackBar.open('No se pudieron cargar los egresos aprobados.', 'Cerrar', { duration: 4000 });
      },
    });
  }

  onBuscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  abrir(e: EgresoRegistrado): void {
    this.seleccionado.set(e);
  }

  volver(): void {
    this.seleccionado.set(null);
    this.cargar();
  }

  actualizado(): void {
    this.cargar();
  }

  verDocumentoEgreso(e: EgresoRegistrado): void {
    if (!e.id || !e.soporteEgresoKey) return;
    this.service.verSoporte(e.id).subscribe({
      next: (r) => window.open(r.url, '_blank', 'noopener,noreferrer'),
      error: () => this.snackBar.open('No se pudo abrir el documento de egreso.', 'Cerrar', { duration: 4000 }),
    });
  }

  estadoLabel(e: EgresoRegistrado): string {
    switch (e.estado) {
      case 'ENVIADO_TESORERIA': return 'Pendiente de pago';
      case 'PAGADO': return 'Pagado · conciliado';
      default: return e.estado ?? '—';
    }
  }

  estadoClass(e: EgresoRegistrado): string {
    return e.estado === 'PAGADO' ? 'estado-pagado' : 'estado-pago';
  }

  egresoOrigen(e: EgresoRegistrado): string {
    return e.pagoProyectadoId != null ? 'Pagos Proyectados' : 'Contabilidad';
  }

  egresoRetenciones(e: EgresoRegistrado): number {
    return Number(e.reteFuente ?? 0) + Number(e.reteIca ?? 0);
  }

  egresoNeto(e: EgresoRegistrado): number {
    return Number(e.valorNetoPagar ?? e.valor ?? 0);
  }

  formatear(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(Number(valor));
  }
}
