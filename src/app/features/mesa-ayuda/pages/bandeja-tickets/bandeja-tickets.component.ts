import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MesaAyudaService } from '../../services/mesa-ayuda.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TicketMesaAyuda } from '../../../tesoreria/models/solicitud.model';

type ActiveTab = 'todos' | 'pendientes' | 'cerrados' | 'asignados';

@Component({
  selector: 'app-bandeja-tickets',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, RouterModule, FormsModule],
  templateUrl: './bandeja-tickets.component.html',
  styleUrls: ['./bandeja-tickets.component.scss']
})
export class BandejaTicketsComponent implements OnInit {
  nivel = signal<1 | 2 | 3>(1);
  tickets = signal<TicketMesaAyuda[]>([]);
  loading = signal(true);

  // Tab activa
  activeTab = signal<ActiveTab>('todos');
  
  // Filtros
  searchTerm = signal('');
  estadoFilter = signal('');
  urgenciaFilter = signal('');
  viewMode = signal<'cards' | 'table'>('cards');

  // Ticket seleccionado para detalle
  selectedTicket = signal<TicketMesaAyuda | null>(null);
  isPanelOpen = signal(false);

  /** Nombre del usuario autenticado (igual que ticket-detail) */
  get currentUser(): string {
    const user = this.authService.getCurrentUser();
    return user?.employee?.fullName || user?.username || 'Usuario';
  }

  /** Tickets pre-filtrados por tab activa */
  private tabTickets = computed(() => {
    const all = this.tickets();
    const tab = this.activeTab();
    const PENDIENTES = ['ABIERTO', 'EN_PROGRESO', 'ESCALADO'];
    const CERRADOS = ['CERRADO', 'RESUELTO'];
    switch (tab) {
      case 'pendientes': return all.filter(t => PENDIENTES.includes(t.estado ?? ''));
      case 'cerrados':   return all.filter(t => CERRADOS.includes(t.estado ?? ''));
      case 'asignados':  return all.filter(t => t.asignadoA === this.currentUser);
      default:           return all;
    }
  });

  // Computed: tickets filtrados (tab + búsqueda + filtros)
  filteredTickets = computed(() => {
    let result = this.tabTickets();
    
    const query = this.searchTerm().toLowerCase().trim();
    if (query) {
      result = result.filter(t => 
        t.numeroTicket.toLowerCase().includes(query) ||
        t.nombreCompleto.toLowerCase().includes(query) ||
        t.nombreEmpresa.toLowerCase().includes(query) ||
        t.descripcionIncidente.toLowerCase().includes(query)
      );
    }

    const estado = this.estadoFilter();
    if (estado) {
      result = result.filter(t => t.estado === estado);
    }

    const urgencia = this.urgenciaFilter();
    if (urgencia) {
      result = result.filter(t => t.urgencia === urgencia);
    }

    return result;
  });

  hasFilters = computed(() => {
    return !!this.searchTerm().trim() || !!this.estadoFilter() || !!this.urgenciaFilter();
  });

  abiertosCount   = computed(() => this.tickets().filter((t) => t.estado === 'ABIERTO').length);
  enProgresoCount = computed(() => this.tickets().filter((t) => t.estado === 'EN_PROGRESO').length);
  escaladosCount  = computed(() => this.tickets().filter((t) => t.estado === 'ESCALADO').length);
  criticosCount   = computed(() => this.tickets().filter((t) => t.urgencia === 'CRITICA').length);

  // Conteos por tab
  pendientesCount = computed(() => this.tickets().filter(t => ['ABIERTO','EN_PROGRESO','ESCALADO'].includes(t.estado ?? '')).length);
  cerradosCount   = computed(() => this.tickets().filter(t => ['CERRADO','RESUELTO'].includes(t.estado ?? '')).length);
  asignadosCount  = computed(() => this.tickets().filter(t => t.asignadoA === this.currentUser).length);

  selectedTicketActions = computed(() => this.selectedTicket()?.historialAcciones ?? []);

  nivelConfig: Record<number, { title: string; subtitle: string; color: string }> = {
    1: { 
      title: 'Nivel 1', 
      subtitle: 'Primer contacto y soluciones documentadas',
      color: '#10b981'
    },
    2: { 
      title: 'Nivel 2', 
      subtitle: 'Intervención técnica especializada',
      color: '#f59e0b'
    },
    3: { 
      title: 'Nivel 3', 
      subtitle: 'Especialistas e infraestructura',
      color: '#ef4444'
    }
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mesaAyudaService: MesaAyudaService,
    private authService: AuthService
  ) {
    effect(() => {
      document.body.style.overflow = this.isPanelOpen() ? 'hidden' : '';
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  ngOnInit(): void {
    // Obtener nivel de la ruta
    this.route.data.subscribe(data => {
      const nivel = data['nivel'] as 1 | 2 | 3;
      if (nivel) {
        this.nivel.set(nivel);
        this.loadTickets();
      }
    });
  }

  loadTickets(): void {
    this.loading.set(true);
    this.mesaAyudaService.getTicketsByNivel(this.nivel()).subscribe({
      next: (data) => {
        this.tickets.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  openPanel(ticket: TicketMesaAyuda): void {
    this.selectedTicket.set(ticket);
    this.isPanelOpen.set(true);
  }

  closePanel(): void {
    this.isPanelOpen.set(false);
    this.selectedTicket.set(null);
  }

  openTicketDetail(ticketId: number): void {
    this.router.navigate(['/mesa-ayuda/ticket', ticketId]);
  }

  gestionarTicket(): void {
    const ticket = this.selectedTicket();
    if (ticket) {
      this.openTicketDetail(ticket.id);
    }
  }

  getUrgenciaClass(urgencia: string | undefined): string {
    if (!urgencia) return '';
    const classes: Record<string, string> = {
      BAJA: 'urgency-baja',
      MEDIA: 'urgency-media',
      ALTA: 'urgency-alta',
      CRITICA: 'urgency-critica'
    };
    return classes[urgencia] || '';
  }

  getEstadoClass(estado: string | undefined): string {
    if (!estado) return '';
    const classes: Record<string, string> = {
      ABIERTO: 'estado-abierto',
      EN_PROGRESO: 'estado-en-progreso',
      ESCALADO: 'estado-escalado',
      RESUELTO: 'estado-resuelto',
      CERRADO: 'estado-cerrado'
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

  getImpactoIcon(impacto: string): string {
    const icons: Record<string, string> = {
      INDIVIDUAL: 'Usuario',
      AREA: 'Area',
      EMPRESA: 'Empresa'
    };
    return icons[impacto] || '';
  }

  getEstadoTone(estado: string | undefined): 'abierto' | 'progreso' | 'escalado' | 'resuelto' | 'cerrado' {
    switch (estado) {
      case 'ABIERTO':
        return 'abierto';
      case 'EN_PROGRESO':
        return 'progreso';
      case 'ESCALADO':
        return 'escalado';
      case 'RESUELTO':
        return 'resuelto';
      case 'CERRADO':
      default:
        return 'cerrado';
    }
  }

  getSolicitanteInitial(nombre: string | undefined): string {
    if (!nombre?.trim()) return 'T';
    return nombre.trim().charAt(0).toUpperCase();
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `hace ${diffDays}d`;
    if (diffHours > 0) return `hace ${diffHours}h`;
    if (diffMins > 0) return `hace ${diffMins}m`;
    return 'ahora';
  }

  getTimelineClass(actionType: string): string {
    const normalized = (actionType || '').toUpperCase();
    if (normalized.includes('ESCAL')) return 'tipo-escalado';
    if (normalized.includes('RESOL')) return 'tipo-resolucion';
    return 'tipo-generico';
  }

  getTimelineDotClass(actionType: string): string {
    const normalized = (actionType || '').toUpperCase();
    if (normalized.includes('ESCAL')) return 'escalado';
    if (normalized.includes('RESOL')) return 'resolucion';
    return 'generico';
  }

  getUrgencyColor(urgencia: string): string {
    const colors: Record<string, string> = {
      BAJA: '#10b981',
      MEDIA: '#f59e0b',
      ALTA: '#f97316',
      CRITICA: '#ef4444'
    };
    return colors[urgencia] || '#6b7280';
  }

  setActiveTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
  }

  applyFilters(): void {
    // Los filtros se aplican de forma reactiva via computed.
  }

  setViewMode(mode: 'cards' | 'table'): void {
    this.viewMode.set(mode);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.estadoFilter.set('');
    this.urgenciaFilter.set('');
  }
}
