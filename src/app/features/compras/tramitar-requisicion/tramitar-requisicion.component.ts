import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { TramitarRequisicionService } from './services/tramitar-requisicion.service';
import { ComprasService } from '../services/compras.service';
import {
  TramiteRequisicion,
  PasoTramite,
  PASOS_TRAMITE,
  EstadoPaso,
} from './models/tramitar-requisicion.model';
import { SolicitudCompra } from '../models/compra.model';

// Step components
import { Paso1RequisicionComponent } from './steps/paso1-requisicion/paso1-requisicion.component';
import { Paso4OrdenCompraComponent } from './steps/paso4-orden-compra/paso4-orden-compra.component';
import { ComparativaPlaneacionOcComponent } from './steps/comparativa-planeacion-oc/comparativa-planeacion-oc.component';
import { Paso5RecepcionComponent } from './steps/paso5-recepcion/paso5-recepcion.component';
import { Paso6EntregaComponent } from './steps/paso6-entrega/paso6-entrega.component';
import { ConvexChatbotComponent } from './convex-chatbot/convex-chatbot.component';

@Component({
  selector: 'app-tramitar-requisicion',
  standalone: true,
  imports: [
    CommonModule,
    Paso1RequisicionComponent,
    Paso4OrdenCompraComponent,
    ComparativaPlaneacionOcComponent,
    Paso5RecepcionComponent,
    Paso6EntregaComponent,
    ConvexChatbotComponent,
  ],
  templateUrl: './tramitar-requisicion.component.html',
  styleUrls: ['./tramitar-requisicion.component.scss'],
})
export class TramitarRequisicionComponent implements OnInit, OnDestroy {
  tramite = signal<TramiteRequisicion | null>(null);
  solicitudActual = signal<SolicitudCompra | null>(null);
  pasoActual = signal(1);
  pasos = signal<PasoTramite[]>(JSON.parse(JSON.stringify(PASOS_TRAMITE)));
  loading = signal(true);
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');
  animatingStep = signal(false);
  showContabilidadModal = signal(false);
  showVistoBuenoAlert = signal(false);
  esperandoVistoBueno = signal(false);
  rechazadoPorJefe = signal(false);
  rechazoMotivo = signal('');
  rechazoObservaciones = signal('');
  rechazoRevisadoPor = signal('');
  rechazoFecha = signal('');
  reenvioLoading = signal(false);

  private subs: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tramiteService: TramitarRequisicionService,
    private comprasService: ComprasService,
  ) {}

  ngOnInit(): void {
    const solicitudId = this.route.snapshot.paramMap.get('solicitudId');
    if (solicitudId) {
      this.cargarTramite(+solicitudId);
    } else {
      this.router.navigate(['/compras/gestion']);
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.tramiteService.limpiarTramite();
  }

  private cargarTramite(solicitudId: number): void {
    this.loading.set(true);
    // First try to load existing tramite by solicitud ID
    this.tramiteService.getTramiteBySolicitudId(solicitudId).subscribe({
      next: (tramite) => {
        if (tramite && tramite.id) {
          // Existing tramite found — also fetch solicitud to restore complete requisicion data
          this.comprasService.getSolicitudById(solicitudId).subscribe({
            next: (solicitud) => {
              this.mergeSolicitudData(tramite, solicitud);
              this.solicitudActual.set(solicitud);
              this.tramite.set(tramite);
              this.restorePasoFromTramite(tramite);
              this.loading.set(false);
            },
            error: () => {
              // If solicitud fetch fails, still use the tramite as-is
              this.tramite.set(tramite);
              this.restorePasoFromTramite(tramite);
              this.loading.set(false);
            },
          });
        } else {
          // No tramite exists — create from solicitud
          this.createTramiteFromSolicitud(solicitudId);
        }
      },
      error: () => {
        // Tramite not found — create from solicitud
        this.createTramiteFromSolicitud(solicitudId);
      },
    });
  }


  private mergeSolicitudData(tramite: TramiteRequisicion, solicitud: SolicitudCompra): void {
    const req = tramite.requisicion;
    req.fecha = solicitud.fechaSolicitud || req.fecha;
    req.cargo = solicitud.cargo || req.cargo;
    req.correoElectronico = solicitud.correoElectronico || req.correoElectronico;
    req.telefonoContacto = solicitud.telefonoContacto || req.telefonoContacto;
    req.tipoRequerimiento = solicitud.tipoRequerimiento || req.tipoRequerimiento;
    req.otroRequerimiento = solicitud.otroRequerimiento || req.otroRequerimiento;
    req.esCompra = solicitud.esCompra ?? req.esCompra;
    req.empresaCentroCostos = solicitud.empresaCentroCostos || req.empresaCentroCostos;
    req.evidenciaUrl = solicitud.evidenciaUrl || req.evidenciaUrl;
    req.vistoBuenoUrl = solicitud.vistoBuenoUrl || req.vistoBuenoUrl;
    // datosAdicionales siempre viene de la solicitud original (fuente de verdad)
    req.datosAdicionales = solicitud.datosAdicionales || req.datosAdicionales;
    req.estado = (solicitud.estado as string) || req.estado;
    req.creadoPor = solicitud.creadoPor || req.creadoPor;
    req.fechaCreacion = solicitud.fechaCreacion || req.fechaCreacion;
  }

  private createTramiteFromSolicitud(solicitudId: number): void {
    this.comprasService.getSolicitudById(solicitudId).subscribe({
      next: (solicitud) => {
        this.solicitudActual.set(solicitud);
        this.tramiteService.iniciarTramite(solicitud).subscribe({
          next: (tramite) => {
            this.tramite.set(tramite);
            this.restorePasoFromTramite(tramite);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
            this.router.navigate(['/compras/gestion']);
          },
        });
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/compras/gestion']);
      },
    });
  }

  private restorePasoFromTramite(tramite: TramiteRequisicion): void {
    // Reset state signals before restoring
    this.esperandoVistoBueno.set(false);
    this.rechazadoPorJefe.set(false);

    // Primero: verificar estados especiales que bloquean el flujo
    if (tramite.estadoTramite === 'ESPERANDO_VISTO_BUENO') {
      this.esperandoVistoBueno.set(true);
      this.pasoActual.set(3);
      this.actualizarEstadosPasos();
      return;
    }

    if (tramite.estadoTramite === 'RECHAZADO_JEFE') {
      this.rechazadoPorJefe.set(true);
      this.pasoActual.set(3);
      this.actualizarEstadosPasos();
      // Cargar datos del rechazo (causaciones + observaciones)
      this.cargarDatosRechazo(tramite);
      return;
    }

    // Restaurar el paso actual basado en el progreso
    if (tramite.recepcion && !tramite.entrega) {
      this.pasoActual.set(5);
    } else if (
      tramite.ordenesCargadas?.length > 0 &&
      tramite.respuestaContabilidad &&
      !tramite.recepcion
    ) {
      this.pasoActual.set(4);
    } else if (
      tramite.ordenesCargadas?.length > 0 &&
      tramite.comparativaPlaneacionOc &&
      !tramite.enviadoContabilidad
    ) {
      this.pasoActual.set(3);
    } else if (
      tramite.ordenesCargadas?.length > 0 &&
      !tramite.comparativaPlaneacionOc
    ) {
      this.pasoActual.set(2);
    } else if (tramite.enviadoContabilidad && !tramite.respuestaContabilidad) {
      this.pasoActual.set(3);
    } else {
      this.pasoActual.set(tramite.pasoActual || 1);
    }

    this.actualizarEstadosPasos();
  }

  actualizarEstadosPasos(): void {
    const tramite = this.tramite();
    if (!tramite) return;

    const nuevoPasos = this.pasos().map((p) => {
      let estado: EstadoPaso = 'pendiente';

      if (p.numero < this.pasoActual()) {
        estado = 'completado';
      } else if (p.numero === this.pasoActual()) {
        estado = 'activo';
      } else if (
        p.numero >= 4 &&
        tramite.enviadoContabilidad &&
        !tramite.respuestaContabilidad
      ) {
        estado = 'pendiente';
      }

      return { ...p, estado };
    });

    this.pasos.set(nuevoPasos);
  }

  irAPaso(paso: number): void {
    const tramite = this.tramite();
    if (!tramite) return;

    // No allow navigating to unfinished future steps
    if (paso > this.getMaxPasoAlcanzado()) return;

    // Block steps 4-5 if waiting for contabilidad
    if (
      paso >= 4 &&
      tramite.enviadoContabilidad &&
      !tramite.respuestaContabilidad
    ) {
      this.displayToast(
        'Esperando aprobación de Contabilidad para continuar',
        'warning',
      );
      return;
    }

    this.animatingStep.set(true);
    setTimeout(() => {
      this.pasoActual.set(paso);
      this.actualizarEstadosPasos();
      this.animatingStep.set(false);
    }, 300);
  }

  getMaxPasoAlcanzado(): number {
    const tramite = this.tramite();
    if (!tramite) return 1;

    let max = 1;
    if (tramite.ordenesCargadas && tramite.ordenesCargadas.length > 0) max = 2;
    if (tramite.comparativaPlaneacionOc) max = 3;
    if (tramite.recepcion) max = 4;
    if (tramite.entrega) max = 5;

    return max + 1;
  }

  siguientePaso(): void {
    const actual = this.pasoActual();
    const tramite = this.tramite();
    if (!tramite) return;

    // After step 3 (Comparativa), send to visto bueno del jefe de compras
    if (actual === 3) {
      this.enviarAVistoBueno();
      return;
    }

    if (actual < 5) {
      this.animatingStep.set(true);
      setTimeout(() => {
        this.pasoActual.set(actual + 1);
        tramite.pasoActual = actual + 1;
        this.tramite.set({ ...tramite });
        this.actualizarEstadosPasos();
        this.animatingStep.set(false);
      }, 300);
    }
  }

  pasoAnterior(): void {
    const actual = this.pasoActual();
    if (actual > 1) {
      this.animatingStep.set(true);
      setTimeout(() => {
        this.pasoActual.set(actual - 1);
        this.actualizarEstadosPasos();
        this.animatingStep.set(false);
      }, 300);
    }
  }

  enviarAVistoBueno(): void {
    const tramite = this.tramite();
    if (!tramite || !tramite.id) return;

    // Primero guardar las órdenes de compra en el backend
    if (tramite.ordenesCargadas && tramite.ordenesCargadas.length > 0) {
      this.tramiteService
        .guardarOrdenesCompra(tramite.id, tramite.ordenesCargadas)
        .subscribe({
          next: () => {
            tramite.estadoTramite = 'ESPERANDO_VISTO_BUENO';
            tramite.pasoActual = 3;
            this.tramite.set({ ...tramite });

            // Guardar el estado completo en el backend
            this.tramiteService.guardarTramite({ ...tramite }).subscribe();

            // Mostrar alert y vista de espera
            this.showVistoBuenoAlert.set(true);
            this.esperandoVistoBueno.set(true);
            this.displayToast(
              'Requisición enviada al Jefe de Compras para su visto bueno',
              'success',
            );
          },
          error: () => {
            this.displayToast('Error al guardar órdenes de compra', 'error');
          },
        });
    } else {
      this.displayToast(
        'Debe cargar al menos una orden de compra antes de continuar',
        'warning',
      );
    }
  }

  cerrarVistoBuenoAlert(): void {
    this.showVistoBuenoAlert.set(false);
  }

  irASeguimiento(): void {
    this.router.navigate(['/compras/seguimiento']);
  }

  verificarContabilidad(): void {
    const tramite = this.tramite();
    if (!tramite || !tramite.id) return;

    this.tramiteService.verificarRespuestaContabilidad(tramite.id).subscribe({
      next: (res) => {
        if (res.respondido) {
          tramite.respuestaContabilidad = true;
          tramite.estadoTramite = 'APROBADO_CONTABILIDAD';
          this.tramite.set({ ...tramite });
          this.actualizarEstadosPasos();
          const obs = res.observaciones
            ? ` Observaciones: ${res.observaciones}`
            : '';
          this.displayToast(
            '¡Contabilidad ha aprobado! Puedes continuar con Recepción.' + obs,
            'success',
          );
        } else {
          this.displayToast(
            'Contabilidad aún no ha procesado esta requisición',
            'warning',
          );
        }
      },
    });
  }

  desbloquearManual(): void {
    // For dev/testing — allows manual unlock
    const tramite = this.tramite();
    if (!tramite) return;
    tramite.respuestaContabilidad = true;
    tramite.estadoTramite = 'APROBADO_CONTABILIDAD';
    this.tramite.set({ ...tramite });
    this.pasoActual.set(4);
    this.actualizarEstadosPasos();
    this.displayToast('Trámite desbloqueado manualmente', 'info');
  }

  onStepCompleted(paso: number): void {
    const tramite = this.tramite();
    if (!tramite || !tramite.id) return;

    // Guardar datos del paso en el backend
    if (paso === 4 && tramite.recepcion) {
      this.tramiteService
        .guardarRecepcion(tramite.id, tramite.recepcion)
        .subscribe({
          next: () => {
            this.displayToast(
              `Paso ${paso} completado correctamente`,
              'success',
            );
            this.siguientePaso();
          },
          error: () => {
            this.displayToast(
              `Paso ${paso} completado (guardado local)`,
              'info',
            );
            this.siguientePaso();
          },
        });
    } else if (paso === 5 && tramite.entrega) {
      this.tramiteService
        .guardarEntrega(tramite.id, tramite.entrega)
        .subscribe({
          next: () => {
            this.displayToast(
              `Paso ${paso} completado correctamente`,
              'success',
            );
            this.finalizarTramite();
          },
          error: () => {
            this.displayToast(
              `Paso ${paso} completado (guardado local)`,
              'info',
            );
            this.finalizarTramite();
          },
        });
    } else {
      this.displayToast(`Paso ${paso} completado correctamente`, 'success');
      if (paso < 5) {
        this.siguientePaso();
      } else {
        this.finalizarTramite();
      }
    }
  }

  onStepSaved(paso: number): void {
    this.displayToast(`Paso ${paso} guardado`, 'info');
    // Guardar órdenes cuando se guardan desde paso 2
    const tramite = this.tramite();
    if (paso === 2 && tramite?.id && tramite.ordenesCargadas?.length > 0) {
      this.tramiteService
        .guardarOrdenesCompra(tramite.id, tramite.ordenesCargadas)
        .subscribe();
    }
  }

  finalizarTramite(): void {
    const tramite = this.tramite();
    if (!tramite) return;
    tramite.estadoTramite = 'COMPLETADO';
    this.tramite.set({ ...tramite });
    this.displayToast(
      '¡Trámite de requisición completado exitosamente!',
      'success',
    );
    setTimeout(() => {
      this.router.navigate(['/compras/gestion']);
    }, 2500);
  }

  /**
   * Carga los datos del rechazo (motivo/causal y observaciones) por medio del
   * vistoBueno embebido en el tramite o consultando el endpoint directo.
   */
  private cargarDatosRechazo(tramite: TramiteRequisicion): void {
    // Primero intentar desde el vistoBuenoJefe ya mapeado
    const vb = tramite.vistoBuenoJefe;
    if (vb && vb.motivoRechazo) {
      this.rechazoMotivo.set(vb.motivoRechazo);
      this.rechazoObservaciones.set(vb.observaciones || '');
      this.rechazoRevisadoPor.set(vb.revisadoPor || 'Jefe de Compras');
      this.rechazoFecha.set(vb.fechaRevision || '');
      return;
    }
    // Fallback: consultar visto-bueno/actual directamente
    if (tramite.id) {
      this.tramiteService.getVistoBuenoActual(tramite.id).subscribe({
        next: (vbActual) => {
          if (vbActual) {
            const causaRechazo = vbActual.causaciones?.find(c => c.tipo === 'RECHAZO');
            this.rechazoMotivo.set(causaRechazo?.motivo || 'No especificado');
            this.rechazoObservaciones.set(vbActual.observaciones || '');
            this.rechazoRevisadoPor.set(vbActual.revisadoPor || 'Jefe de Compras');
            this.rechazoFecha.set(vbActual.fechaRevision || '');
          }
        },
      });
    }
  }

  /**
   * Desbloquea el formulario de pasos para que el usuario pueda editar la
   * solicitud (órdenes, requisición) y luego reenviarla al jefe de compras.
   */
  editarSolicitud(): void {
    const tramite = this.tramite();
    if (!tramite) return;

    // Cambiar estado localmente para desbloquear los pasos
    this.rechazadoPorJefe.set(false);
    tramite.estadoTramite = 'EN_PROCESO';
    this.tramite.set({ ...tramite });
    this.pasoActual.set(1);
    this.actualizarEstadosPasos();
    this.displayToast('Puede editar la solicitud y luego reenviar al Jefe de Compras', 'info');
  }

  /**
   * Reenvía el trámite directamente al jefe de compras sin editar.
   */
  reenviarAJefe(): void {
    const tramite = this.tramite();
    if (!tramite?.id) return;

    this.reenvioLoading.set(true);
    this.tramiteService.reenviarAJefeCompras(tramite.id).subscribe({
      next: (updated) => {
        this.reenvioLoading.set(false);
        this.tramite.set(updated);
        this.rechazadoPorJefe.set(false);
        this.esperandoVistoBueno.set(true);
        this.pasoActual.set(2);
        this.actualizarEstadosPasos();
        this.displayToast('Requisición reenviada al Jefe de Compras', 'success');
      },
      error: () => {
        this.reenvioLoading.set(false);
        this.displayToast('Error al reenviar al Jefe de Compras', 'error');
      },
    });
  }

  volver(): void {
    this.router.navigate(['/compras/gestion']);
  }

  // ═══ Toast notifications ═══
  private displayToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }

  // ═══ Stepper helpers ═══
  getStepIcon(paso: PasoTramite): string {
    return paso.icono;
  }

  isStepClickable(paso: PasoTramite): boolean {
    return (
      paso.estado !== 'bloqueado' && paso.numero <= this.getMaxPasoAlcanzado()
    );
  }

  getProgressWidth(): string {
    const completed = this.pasos().filter(
      (p) => p.estado === 'completado',
    ).length;
    return `${(completed / 5) * 100}%`;
  }
}
