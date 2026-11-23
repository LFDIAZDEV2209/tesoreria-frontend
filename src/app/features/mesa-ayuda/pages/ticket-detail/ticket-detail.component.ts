import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MesaAyudaService } from '../../services/mesa-ayuda.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TicketMesaAyuda, TicketAccion } from '../../../tesoreria/models/solicitud.model';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, RouterModule, FormsModule, ReactiveFormsModule],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.scss']
})
export class TicketDetailComponent implements OnInit {
  ticket = signal<TicketMesaAyuda | null>(null);
  loading = signal(true);
  saving = signal(false);
  latestDiagnostico = computed(() => this.findLatestAction('DIAGNOSTICO'));
  latestComentario = computed(() => this.findLatestAction('COMENTARIO'));
  latestEscalamiento = computed(() => this.findLatestAction('ESCALAMIENTO'));

  // Historial collapse
  historialExpanded = signal(false);

  // Toast notification
  toast = signal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modales
  showDiagnosticoModal = signal(false);
  showEscalarModal = signal(false);
  showResolverModal = signal(false);
  showComentarioModal = signal(false);

  // Forms
  diagnosticoForm!: FormGroup;
  escalarForm!: FormGroup;
  resolverForm!: FormGroup;
  comentarioForm!: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private mesaAyudaService: MesaAyudaService,
    private authService: AuthService
  ) {
    this.initForms();
  }

  /** Nombre completo del usuario autenticado */
  get currentUser(): string {
    const user = this.authService.getCurrentUser();
    return user?.employee?.fullName || user?.username || 'Usuario';
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      if (id) {
        this.loadTicket(id);
      }
    });
  }

  initForms(): void {
    this.diagnosticoForm = this.fb.group({
      diagnostico: ['', [Validators.required, Validators.minLength(20)]]
    });

    this.escalarForm = this.fb.group({
      nivelDestino: ['', Validators.required],
      motivo: ['', [Validators.required, Validators.minLength(20)]]
    });

    this.resolverForm = this.fb.group({
      solucion: ['', [Validators.required, Validators.minLength(20)]]
    });

    this.comentarioForm = this.fb.group({
      comentario: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  loadTicket(id: number): void {
    this.loading.set(true);
    this.mesaAyudaService.getTicketById(id).subscribe({
      next: (data) => {
        this.ticket.set(data || null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toast.set({ message, type });
    setTimeout(() => this.toast.set(null), 3500);
  }

  // ── Acciones ──────────────────────────────────────────

  asignarme(): void {
    const ticket = this.ticket();
    if (!ticket) return;

    this.saving.set(true);
    this.mesaAyudaService.asignarTicket(ticket.id, this.currentUser).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.saving.set(false);
        this.showToast(`Ticket asignado a ${this.currentUser}`, 'success');
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al asignar el ticket', 'error');
      }
    });
  }

  openDiagnosticoModal(): void {
    this.diagnosticoForm.reset();
    this.showDiagnosticoModal.set(true);
  }

  submitDiagnostico(): void {
    if (this.diagnosticoForm.invalid) {
      this.diagnosticoForm.markAllAsTouched();
      return;
    }

    const ticket = this.ticket();
    if (!ticket) return;

    this.saving.set(true);
    const diagnostico = String(this.diagnosticoForm.value.diagnostico || '').trim();
    
    this.mesaAyudaService.agregarDiagnostico(ticket.id, diagnostico, this.currentUser).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.showDiagnosticoModal.set(false);
        this.saving.set(false);
        this.showToast('Diagnóstico guardado correctamente', 'success');
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al guardar el diagnóstico', 'error');
      }
    });
  }

  openEscalarModal(): void {
    this.escalarForm.reset({
      nivelDestino: this.getSuggestedEscalationLevel(),
      motivo: ''
    });
    this.showEscalarModal.set(true);
  }

  submitEscalar(): void {
    if (this.escalarForm.invalid) {
      this.escalarForm.markAllAsTouched();
      return;
    }

    const ticket = this.ticket();
    if (!ticket) return;

    this.saving.set(true);
    const { nivelDestino, motivo } = this.escalarForm.getRawValue();
    
    this.mesaAyudaService.escalarTicket(ticket.id, +nivelDestino as 2 | 3, String(motivo || '').trim(), this.currentUser).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.showEscalarModal.set(false);
        this.saving.set(false);
        this.showToast(`Ticket escalado al Nivel ${nivelDestino}`, 'info');
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al escalar el ticket', 'error');
      }
    });
  }

  openResolverModal(): void {
    this.resolverForm.reset();
    this.showResolverModal.set(true);
  }

  submitResolver(): void {
    if (this.resolverForm.invalid) {
      this.resolverForm.markAllAsTouched();
      return;
    }

    const ticket = this.ticket();
    if (!ticket) return;

    this.saving.set(true);
    const solucion = String(this.resolverForm.value.solucion || '').trim();
    
    this.mesaAyudaService.resolverTicket(ticket.id, solucion, this.currentUser).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.showResolverModal.set(false);
        this.saving.set(false);
        this.showToast('¡Ticket marcado como Resuelto!', 'success');
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al resolver el ticket', 'error');
      }
    });
  }

  cerrarTicket(): void {
    const ticket = this.ticket();
    if (!ticket) return;

    if (!confirm('¿Está seguro de cerrar este ticket?')) return;

    this.saving.set(true);
    this.mesaAyudaService.cerrarTicket(ticket.id, this.currentUser).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.saving.set(false);
        this.showToast('Ticket cerrado exitosamente', 'info');
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al cerrar el ticket', 'error');
      }
    });
  }

  openComentarioModal(): void {
    this.comentarioForm.reset();
    this.showComentarioModal.set(true);
  }

  submitComentario(): void {
    if (this.comentarioForm.invalid) {
      this.comentarioForm.markAllAsTouched();
      return;
    }

    const ticket = this.ticket();
    if (!ticket) return;

    this.saving.set(true);
    const comentario = String(this.comentarioForm.value.comentario || '').trim();
    
    this.mesaAyudaService.agregarComentario(ticket.id, comentario, this.currentUser).subscribe({
      next: (updated) => {
        this.ticket.set(updated);
        this.showComentarioModal.set(false);
        this.saving.set(false);
        this.showToast('Comentario agregado correctamente', 'success');
      },
      error: () => {
        this.saving.set(false);
        this.showToast('Error al agregar el comentario', 'error');
      }
    });
  }

  closeAllModals(): void {
    this.showDiagnosticoModal.set(false);
    this.showEscalarModal.set(false);
    this.showResolverModal.set(false);
    this.showComentarioModal.set(false);
  }

  goBack(): void {
    const ticket = this.ticket();
    if (ticket) {
      this.router.navigate(['/mesa-ayuda/nivel', ticket.nivel]);
    } else {
      this.router.navigate(['/mesa-ayuda']);
    }
  }

  // ── Helpers ──────────────────────────────────────────

  getUrgenciaClass(urgencia: string): string {
    const classes: Record<string, string> = {
      'BAJA': 'badge--success',
      'MEDIA': 'badge--warning',
      'ALTA': 'badge--orange',
      'CRITICA': 'badge--danger'
    };
    return classes[urgencia] || '';
  }

  getEstadoClass(estado: string): string {
    const classes: Record<string, string> = {
      'ABIERTO': 'badge--info',
      'EN_PROGRESO': 'badge--warning',
      'ESCALADO': 'badge--purple',
      'RESUELTO': 'badge--success',
      'CERRADO': 'badge--muted'
    };
    return classes[estado] || '';
  }

  getEstadoLabel(estado: string): string {
    const labels: Record<string, string> = {
      'ABIERTO': 'Abierto',
      'EN_PROGRESO': 'En Progreso',
      'ESCALADO': 'Escalado',
      'RESUELTO': 'Resuelto',
      'CERRADO': 'Cerrado'
    };
    return labels[estado] || estado;
  }

  getNivelClass(nivel: number): string {
    const classes: Record<number, string> = {
      1: 'nivel--1',
      2: 'nivel--2',
      3: 'nivel--3'
    };
    return classes[nivel] || '';
  }

  getImpactoIcon(impacto: string): string {
    const icons: Record<string, string> = {
      'INDIVIDUAL': '👤',
      'AREA': '👥',
      'EMPRESA': '🏢'
    };
    return icons[impacto] || '';
  }

  getActionIcon(accion: string): string {
    const icons: Record<string, string> = {
      'CREACION': '📝',
      'ASIGNACION': '👤',
      'DIAGNOSTICO': '🔍',
      'ESCALAMIENTO': '⬆️',
      'COMENTARIO': '💬',
      'RESOLUCION': '✅',
      'CIERRE': '🔒'
    };
    return icons[accion] || '📋';
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  getTimelineActionLabel(accion: string): string {
    const labels: Record<string, string> = {
      CREACION: 'Creación',
      ASIGNACION: 'Asignación',
      DIAGNOSTICO: 'Diagnóstico',
      ESCALAMIENTO: 'Escalamiento',
      COMENTARIO: 'Comentario',
      RESOLUCION: 'Resolución',
      CIERRE: 'Cierre'
    };

    return labels[accion] || accion;
  }

  getSuggestedEscalationLevel(): 2 | 3 | '' {
    const nivelActual = this.ticket()?.nivel;
    if (nivelActual === 1) {
      return 2;
    }
    if (nivelActual === 2) {
      return 3;
    }
    return '';
  }

  /** Devuelve true si el usuario actual es el dueño del ticket (o el ticket aún no está asignado). */
  isOwner(): boolean {
    const ticket = this.ticket();
    return !ticket?.asignadoA || ticket.asignadoA === this.currentUser;
  }

  /** Devuelve true si el ticket ya tiene responsable y no es el usuario actual → solo lectura. */
  isReadOnly(): boolean {
    const ticket = this.ticket();
    return !!ticket?.asignadoA && ticket.asignadoA !== this.currentUser;
  }

  canAssign(): boolean {
    const ticket = this.ticket();
    
    // Asignación inicial: ABIERTO y sin asignar
    if (ticket?.estado === 'ABIERTO' && !ticket.asignadoA) {
      return true;
    }
    
    // Reasignación: ticket escalado (ESCALADO o EN_PROGRESO con nivel > 1) asignado a otro agente
    const estadosReasignable = ['EN_PROGRESO', 'ESCALADO'];
    if (estadosReasignable.includes(ticket?.estado ?? '') && ticket?.asignadoA && ticket.asignadoA !== this.currentUser) {
      const hasEscalamiento = this.findLatestAction('ESCALAMIENTO');
      if (hasEscalamiento || (ticket?.nivel && ticket.nivel > 1)) {
        return true;
      }
    }
    
    return false;
  }

  canAddDiagnostico(): boolean {
    const ticket = this.ticket();
    const estadosPermitidos = ['EN_PROGRESO', 'ABIERTO', 'ESCALADO'];
    return this.isOwner() && estadosPermitidos.includes(ticket?.estado ?? '');
  }

  canEscalar(): boolean {
    const ticket = this.ticket();
    const estadosPermitidos = ['EN_PROGRESO', 'ABIERTO', 'ESCALADO'];
    return this.isOwner() &&
           estadosPermitidos.includes(ticket?.estado ?? '') &&
           ticket?.nivel !== undefined && ticket.nivel < 3;
  }

  canResolve(): boolean {
    const ticket = this.ticket();
    const estadosPermitidos = ['EN_PROGRESO', 'ESCALADO'];
    return this.isOwner() && estadosPermitidos.includes(ticket?.estado ?? '');
  }

  canClose(): boolean {
    const ticket = this.ticket();
    return this.isOwner() && ticket?.estado === 'RESUELTO';
  }

  canComment(): boolean {
    return this.isOwner();
  }

  toggleHistorial(): void {
    this.historialExpanded.update(v => !v);
  }

  getHistorialVisible(): TicketAccion[] {
    const all = this.ticket()?.historialAcciones ?? [];
    if (this.historialExpanded()) return all;
    // Show most recent 3 when collapsed
    return all.slice(-3);
  }

  getAccionSubtitle(accion: TicketAccion): string {
    switch (accion.accion) {
      case 'CREACION':    return 'Ticket registrado en el sistema';
      case 'ASIGNACION':  return `Responsable asignado: ${accion.usuario}`;
      case 'DIAGNOSTICO': return 'Se registró un diagnóstico técnico';
      case 'ESCALAMIENTO':return `Escalado al Nivel ${accion.nivel}`;
      case 'COMENTARIO':  return 'Actualización interna del agente';
      case 'RESOLUCION':  return 'Ticket marcado como resuelto';
      case 'CIERRE':      return 'Ticket cerrado definitivamente';
      default:            return '';
    }
  }

  getAccionColor(accion: string): string {
    const map: Record<string, string> = {
      CREACION:    '#3b82f6',
      ASIGNACION:  '#045C94',
      DIAGNOSTICO: '#6366f1',
      ESCALAMIENTO:'#f59e0b',
      COMENTARIO:  '#6b7280',
      RESOLUCION:  '#10b981',
      CIERRE:      '#8b5cf6',
    };
    return map[accion] || '#9ca3af';
  }

  private findLatestAction(...acciones: string[]): TicketAccion | null {
    const historial = this.ticket()?.historialAcciones ?? [];
    for (let index = historial.length - 1; index >= 0; index -= 1) {
      const accion = historial[index];
      if (acciones.includes(accion.accion)) {
        return accion;
      }
    }

    return null;
  }
}
