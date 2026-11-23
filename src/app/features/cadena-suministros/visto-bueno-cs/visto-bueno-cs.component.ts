import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  TramiteRequisicion,
  OrdenCompraCargada,
} from '../models/tramitar-requisicion-cs.model';
import { TramitarRequisicionCsService } from '../services/tramitar-requisicion-cs.service';
import { ComprasService } from 'src/app/features/compras/services/compras.service';
import { SolicitudCompra } from 'src/app/features/compras/models/compra.model';

@Component({
  selector: 'app-visto-bueno-cs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visto-bueno-cs.component.html',
  styleUrls: ['./visto-bueno-cs.component.scss'],
})
export class VistoBuenoCsComponent implements OnInit {
  tramite = signal<TramiteRequisicion | null>(null);
  solicitud = signal<SolicitudCompra | null>(null);
  loading = signal(true);
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');
  expandedProveedores = signal<Set<string>>(new Set());
  showNotes = signal(true);
  enviandoContabilidad = signal(false);
  showConfirmContabilidad = signal(false);

  /** True si todas las OC tienen su estadoEscaneo completado y comparisonDone */
  todasConciliadas = computed(() => {
    const ordenes = this.tramite()?.ordenesCargadas ?? [];
    if (ordenes.length === 0) return false;
    return ordenes.every(o => o.estadoEscaneo === 'completado');
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tramiteService: TramitarRequisicionCsService,
    private comprasService: ComprasService,
  ) {}

  ngOnInit(): void {
    const solicitudId = this.route.snapshot.paramMap.get('solicitudId');
    if (solicitudId) {
      this.cargarTramite(+solicitudId);
      this.cargarSolicitud(+solicitudId);
    } else {
      this.router.navigate(['/cadena-suministros/bandeja-visto-bueno']);
    }
  }

  private cargarTramite(solicitudId: number): void {
    this.loading.set(true);
    this.tramiteService.getTramiteBySolicitudId(solicitudId).subscribe({
      next: (tramite) => {
        this.tramite.set(tramite);
        this.loading.set(false);
        if (tramite && tramite.id && tramite.ordenesCargadas.length) {
          this.reconciliarOrdenesIds(tramite.id);
        }
      },
      error: () => {
        this.displayToast('Error al cargar el tramite', 'error');
        this.loading.set(false);
      },
    });
  }

  private reconciliarOrdenesIds(tramiteId: number): void {
    this.tramiteService.getOrdenesFromBackend(tramiteId).subscribe({
      next: (backendOrdenes) => {
        if (!backendOrdenes.length) return;
        this.tramite.update((t) => {
          if (!t) return t;
          const updated = t.ordenesCargadas.map((o) => {
            const match = backendOrdenes.find(
              (b) => b.nombreArchivo === o.nombreArchivo,
            );
            if (!match) return o;
            return {
              ...o,
              id: match.id,
              archivoUrl: match.archivoUrl || o.archivoUrl,
            };
          });
          return { ...t, ordenesCargadas: updated };
        });
      },
    });
  }

  private cargarSolicitud(solicitudId: number): void {
    this.comprasService.getSolicitudById(solicitudId).subscribe({
      next: (sol) => this.solicitud.set(sol),
      error: () => {
        this.comprasService.getSolicitudes().subscribe({
          next: (solicitudes) => {
            const sol = solicitudes.find((s) => s.id === solicitudId);
            if (sol) this.solicitud.set(sol);
          },
        });
      },
    });
  }

  //  KPIs 
  get totalOrdenes(): number {
    return this.tramite()?.ordenesCargadas?.length ?? 0;
  }

  get totalGeneral(): number {
    return (
      this.tramite()?.ordenesCargadas?.reduce((s, o) => s + o.valorTotal, 0) ?? 0
    );
  }

  getProveedoresUnicos(): string[] {
    const ordenes = this.tramite()?.ordenesCargadas ?? [];
    const set = new Set(ordenes.map((o) => o.proveedor || ''));
    return Array.from(set).sort();
  }

  getProveedorInitial(proveedor: string): string {
    if (!proveedor) return '?';
    return proveedor.charAt(0).toUpperCase();
  }

  // Agrupar órdenes por proveedor
  getOrdenesParaProveedor(proveedor: string): OrdenCompraCargada[] {
    const ordenes = this.tramite()?.ordenesCargadas ?? [];
    return ordenes.filter((o) => o.proveedor === proveedor);
  }

  // Toggle para expandir/colapsar proveedor
  toggleProveedor(proveedor: string): void {
    this.expandedProveedores.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(proveedor)) {
        newSet.delete(proveedor);
      } else {
        newSet.add(proveedor);
      }
      return newSet;
    });
  }

  // Toggle para mostrar/ocultar notas
  toggleNotes(): void {
    this.showNotes.update((val) => !val);
  }

  // Verificar si proveedor está expandido
  isProveedorExpanded(proveedor: string): boolean {
    return this.expandedProveedores().has(proveedor);
  }

  // Obtener valor total de un proveedor
  getValorProveedorTotal(proveedor: string): number {
    return this.getOrdenesParaProveedor(proveedor).reduce((sum, o) => sum + o.valorTotal, 0);
  }

  // Obtener cantidad de OC de un proveedor
  getCountOcProveedor(proveedor: string): number {
    return this.getOrdenesParaProveedor(proveedor).length;
  }

  //  Navigation 
  navegarTramitarOrden(orden: OrdenCompraCargada): void {
    const solicitudId = this.route.snapshot.paramMap.get('solicitudId');
    this.router.navigate(['/cadena-suministros/tramitar-orden', solicitudId, orden.id]);
  }

  /** Confirmar envío a contabilidad */
  confirmarEnvioContabilidad(): void {
    this.showConfirmContabilidad.set(true);
  }

  cancelarEnvioContabilidad(): void {
    this.showConfirmContabilidad.set(false);
  }

  /** Enviar a contabilidad */
  enviarAContabilidad(): void {
    const tramite = this.tramite();
    if (!tramite?.id) return;

    this.enviandoContabilidad.set(true);
    this.showConfirmContabilidad.set(false);

    this.tramiteService.enviarAContabilidad(tramite.id).subscribe({
      next: () => {
        this.displayToast('Trámite enviado a Contabilidad exitosamente', 'success');
        this.enviandoContabilidad.set(false);
        // Update local state
        this.tramite.update(t => t ? { ...t, enviadoContabilidad: true, estadoTramite: 'ESPERANDO_CONTABILIDAD' as any } : t);
      },
      error: (err) => {
        this.displayToast('Error al enviar a contabilidad. Intente de nuevo.', 'error');
        this.enviandoContabilidad.set(false);
      },
    });
  }

  volver(): void {
    this.router.navigate(['/cadena-suministros/bandeja-visto-bueno']);
  }

  //  Helpers 
  getEstadoSolicitudLabel(estado: string): string {
    const labels: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      EN_PROCESO: 'En Proceso',
      ESPERANDO_VISTO_BUENO: 'Esperando Visto Bueno',
      APROBADO_JEFE: 'Aprobado',
      RECHAZADO_JEFE: 'Rechazado',
      ACEPTADO_CON_NOVEDAD: 'Aceptado con Novedad',
      EN_CONTABILIDAD: 'En Contabilidad',
      COMPLETADO: 'Completado',
      REALIZADO: 'Realizado',
      TRAMITE: 'En Tramite',
    };
    return labels[estado] || estado;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  private displayToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }
}
