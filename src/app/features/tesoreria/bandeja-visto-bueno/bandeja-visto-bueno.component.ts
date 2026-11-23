import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TesoreriaService } from '../services/tesoreria.service';
import { SolicitudTesoreria } from '../models/solicitud.model';
import { AuthService } from 'src/app/core/services/auth.service';

type TabType = 'pendientes' | 'aprobadas' | 'rechazadas';

@Component({
  selector: 'app-bandeja-visto-bueno-tesoreria',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './bandeja-visto-bueno.component.html',
  styleUrls: ['./bandeja-visto-bueno.component.scss'],
})
export class BandejaVistoBuenoTesoreriaComponent implements OnInit {
  solicitudesPendientes = signal<SolicitudTesoreria[]>([]);
  solicitudesAprobadas = signal<SolicitudTesoreria[]>([]);
  solicitudesRechazadas = signal<SolicitudTesoreria[]>([]);

  loading = signal(true);
  activeTab = signal<TabType>('pendientes');
  busqueda = signal('');

  // Toast
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error' | 'warning' | 'info'>('success');

  // Modal para decisión
  showDecisionModal = signal(false);
  modalSolicitudId = signal<number | null>(null);
  decision = signal<'APROBADO' | 'RECHAZADO' | null>(null);
  motivoRechazo = signal('');
  observacionesModal = signal('');
  procesando = signal(false);

  // Expand estado
  expandedId = signal<number | null>(null);

  // Motivos de rechazo
  MOTIVOS_RECHAZO = [
    'Presupuesto insuficiente',
    'Documentación incompleta',
    'Justificación no clara',
    'No cumple con políticas',
    'Requiere ajustes previos',
    'Otra razón',
  ];

  // Computed filters
  pendientesFiltrados = computed(() =>
    this.filtrar(this.solicitudesPendientes()),
  );
  aprobadasFiltrados = computed(() =>
    this.filtrar(this.solicitudesAprobadas()),
  );
  rechazadasFiltrados = computed(() =>
    this.filtrar(this.solicitudesRechazadas()),
  );

  currentFilteredList = computed(() => {
    switch (this.activeTab()) {
      case 'pendientes':
        return this.pendientesFiltrados();
      case 'aprobadas':
        return this.aprobadasFiltrados();
      case 'rechazadas':
        return this.rechazadasFiltrados();
    }
  });

  constructor(
    private tesoreriaService: TesoreriaService,
    public router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargarSolicitudes();
  }

  private cargarSolicitudes(): void {
    this.loading.set(true);
    // TODO: Llamar a servicio para obtener solicitudes pendientes de aprobación
    // Por ahora cargamos datos vacíos
    this.solicitudesPendientes.set([]);
    this.solicitudesAprobadas.set([]);
    this.solicitudesRechazadas.set([]);
    this.loading.set(false);
  }

  private filtrar(solicitudes: SolicitudTesoreria[]): SolicitudTesoreria[] {
    const search = this.busqueda().toLowerCase();
    if (!search) return solicitudes;
    return solicitudes.filter(
      (s) =>
        s.nombre?.toLowerCase().includes(search) ||
        s.areaDepartamento?.toLowerCase().includes(search) ||
        s.tipoRequerimiento?.toLowerCase().includes(search),
    );
  }

  changeTab(tab: TabType): void {
    this.activeTab.set(tab);
  }

  toggleExpanded(id: number): void {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
    } else {
      this.expandedId.set(id);
    }
  }

  openDecisionModal(solicitudId: number): void {
    this.modalSolicitudId.set(solicitudId);
    this.decision.set(null);
    this.motivoRechazo.set('');
    this.observacionesModal.set('');
    this.showDecisionModal.set(true);
  }

  closeDecisionModal(): void {
    this.showDecisionModal.set(false);
    this.modalSolicitudId.set(null);
  }

  selectDecision(dec: 'APROBADO' | 'RECHAZADO'): void {
    this.decision.set(dec);
    if (dec === 'APROBADO') {
      this.motivoRechazo.set('');
      this.observacionesModal.set('');
    }
  }

  submitDecision(): void {
    const solicitudId = this.modalSolicitudId();
    if (!solicitudId || !this.decision()) return;

    if (this.decision() === 'RECHAZADO' && !this.motivoRechazo()) {
      alert('Por favor seleccione un motivo de rechazo');
      return;
    }

    this.procesando.set(true);

    // TODO: Llamar al servicio para guardar la decisión
    const payload = {
      id: solicitudId,
      decision: this.decision(),
      motivo: this.motivoRechazo(),
      observaciones: this.observacionesModal(),
    };

    // Simular siguiente paso
    setTimeout(() => {
      this.procesando.set(false);
      this.showToast.set(true);

      if (this.decision() === 'APROBADO') {
        this.toastMessage.set('✓ Solicitud aprobada correctamente');
        this.toastType.set('success');
      } else {
        this.toastMessage.set('✓ Rechazo registrado correctamente');
        this.toastType.set('success');
      }

      this.closeDecisionModal();
      this.cargarSolicitudes();

      setTimeout(() => this.showToast.set(false), 3000);
    }, 800);
  }

  formatDate(date: string | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es-CO');
  }
}
