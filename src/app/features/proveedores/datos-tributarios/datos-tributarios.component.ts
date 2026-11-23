import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  RetencionFuenteService,
  ConfiguracionRetencion,
  UvtAnual
} from '../services/retencion-fuente.service';

@Component({
  selector: 'app-datos-tributarios',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './datos-tributarios.component.html',
  styleUrl: './datos-tributarios.component.scss'
})
export class DatosTributariosComponent implements OnInit {

  // ── State ──
  uvtList = signal<UvtAnual[]>([]);
  configuraciones = signal<ConfiguracionRetencion[]>([]);
  loading = signal(true);
  loadingConfig = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  animateCards = signal(false);

  // ── Filters ──
  selectedAnio = signal<number>(new Date().getFullYear());
  filterConcepto = signal<string>('TODOS');
  filterTipoPersona = signal<string>('TODOS');
  searchTerm = signal('');

  // ── UVT Modal ──
  showUvtModal = signal(false);
  uvtEditAnio = signal<number>(new Date().getFullYear());
  uvtEditValor = signal<number>(0);
  savingUvt = signal(false);

  // Available years
  availableYears = computed(() => {
    const years = this.uvtList().map(u => u.anio);
    if (!years.includes(new Date().getFullYear())) {
      years.push(new Date().getFullYear());
    }
    return [...new Set(years)].sort((a, b) => b - a);
  });

  // Unique concepts for filter
  conceptosUnicos = computed(() => {
    const set = new Set(this.configuraciones().map(c => c.conceptoRetencion));
    return Array.from(set).sort();
  });

  // Unique tipos persona for filter
  tiposPersonaUnicos = computed(() => {
    const set = new Set(this.configuraciones().map(c => c.tipoPersona));
    return Array.from(set).sort();
  });

  // Filtered configurations
  filteredConfiguraciones = computed(() => {
    let list = this.configuraciones();
    const concepto = this.filterConcepto();
    const tipoPersona = this.filterTipoPersona();
    const search = this.searchTerm().toLowerCase();

    if (concepto !== 'TODOS') {
      list = list.filter(c => c.conceptoRetencion === concepto);
    }
    if (tipoPersona !== 'TODOS') {
      list = list.filter(c => c.tipoPersona === tipoPersona);
    }
    if (search) {
      list = list.filter(c =>
        c.conceptoRetencion.toLowerCase().includes(search) ||
        c.tipoOperacion.toLowerCase().includes(search) ||
        c.descripcion?.toLowerCase().includes(search) ||
        c.tipoPersona.toLowerCase().includes(search)
      );
    }
    return list;
  });

  // Current UVT value
  uvtActual = computed(() => {
    const anio = this.selectedAnio();
    return this.uvtList().find(u => u.anio === anio);
  });

  // Stats
  totalConfiguraciones = computed(() => this.configuraciones().length);
  configuracionesActivas = computed(() => this.configuraciones().filter(c => c.activo !== false).length);

  constructor(private retencionService: RetencionFuenteService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.retencionService.getAllUvt().subscribe({
      next: (uvts) => {
        this.uvtList.set(uvts);
        this.loadConfiguraciones();
        setTimeout(() => this.animateCards.set(true), 100);
      },
      error: () => {
        this.errorMessage.set('Error al cargar valores UVT');
        this.loading.set(false);
      }
    });
  }

  loadConfiguraciones(): void {
    this.loadingConfig.set(true);
    const anio = this.selectedAnio();
    this.retencionService.getConfiguracionesByAnio(anio).subscribe({
      next: (configs) => {
        this.configuraciones.set(configs);
        this.loadingConfig.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.configuraciones.set([]);
        this.loadingConfig.set(false);
        this.loading.set(false);
      }
    });
  }

  onAnioChange(): void {
    this.filterConcepto.set('TODOS');
    this.filterTipoPersona.set('TODOS');
    this.searchTerm.set('');
    this.loadConfiguraciones();
  }

  // ── UVT CRUD ──
  openUvtModal(uvt?: UvtAnual): void {
    if (uvt) {
      this.uvtEditAnio.set(uvt.anio);
      this.uvtEditValor.set(uvt.valorUvt);
    } else {
      this.uvtEditAnio.set(new Date().getFullYear() + 1);
      this.uvtEditValor.set(0);
    }
    this.showUvtModal.set(true);
  }

  closeUvtModal(): void {
    this.showUvtModal.set(false);
  }

  saveUvt(): void {
    this.savingUvt.set(true);
    const uvt: UvtAnual = {
      anio: this.uvtEditAnio(),
      valorUvt: this.uvtEditValor(),
      activo: true
    };
    this.retencionService.createOrUpdateUvt(uvt).subscribe({
      next: () => {
        this.savingUvt.set(false);
        this.showUvtModal.set(false);
        this.successMessage.set('Valor UVT guardado correctamente');
        this.loadData();
        setTimeout(() => this.successMessage.set(''), 3000);
      },
      error: () => {
        this.savingUvt.set(false);
        this.errorMessage.set('Error al guardar valor UVT');
        setTimeout(() => this.errorMessage.set(''), 3000);
      }
    });
  }

  // ── Helpers ──
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  formatPercent(value: number): string {
    return `${value}%`;
  }

  getTipoPersonaLabel(tipo: string): string {
    const labels: Record<string, string> = {
      'NATURAL': 'Persona Natural',
      'JURIDICA': 'Persona Jurídica',
      'GRAN_CONTRIBUYENTE': 'Gran Contribuyente',
      'TODOS': 'Todos'
    };
    return labels[tipo] || tipo;
  }

  getTipoPersonaBadgeClass(tipo: string): string {
    const classes: Record<string, string> = {
      'NATURAL': 'bg-blue-100 text-blue-700',
      'JURIDICA': 'bg-purple-100 text-purple-700',
      'GRAN_CONTRIBUYENTE': 'bg-amber-100 text-amber-700',
      'TODOS': 'bg-gray-100 text-gray-700'
    };
    return classes[tipo] || 'bg-gray-100 text-gray-700';
  }

  getConceptoIcon(concepto: string): string {
    const icons: Record<string, string> = {
      'COMPRAS': '🛒',
      'SERVICIOS': '🔧',
      'HONORARIOS': '💼',
      'ARRENDAMIENTOS': '🏠',
      'COMISIONES': '📊',
      'CONSULTORIA': '📋',
      'TRANSPORTE': '🚚'
    };
    return icons[concepto] || '📌';
  }
}
