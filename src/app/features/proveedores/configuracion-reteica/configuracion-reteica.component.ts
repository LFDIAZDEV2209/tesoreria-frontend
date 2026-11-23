import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReteicaService } from '../../../services/reteica.service';
import {
  ReteicaTarifaRequest,
  ReteicaTarifaResponse,
  ApiError,
} from '../../../models/reteica.models';

@Component({
  selector: 'app-configuracion-reteica',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './configuracion-reteica.component.html',
  styleUrl: './configuracion-reteica.component.scss',
})
export class ConfiguracionReteicaComponent implements OnInit {
  // ── State ──
  tarifas = signal<ReteicaTarifaResponse[]>([]);
  loading = signal(false);
  selectedYear = signal<number>(new Date().getFullYear());

  // ── Catalogs ──
  aniosDisponibles = signal<number[]>([]);
  municipiosCatalog = signal<string[]>([]);
  departamentosCatalog = signal<string[]>([]);

  // ── Filters ──
  searchText = signal('');
  filterMunicipio = signal('');
  filterDepartamento = signal('');

  // ── Pagination ──
  currentPage = signal(1);
  pageSize = signal(10);

  // ── Modals ──
  showAddModal = signal(false);
  showDeleteConfirm = signal(false);
  tarifaToDelete = signal<ReteicaTarifaResponse | null>(null);

  // ── Add/Edit form ──
  editingTarifa = signal<ReteicaTarifaResponse | null>(null);
  newTarifa: ReteicaTarifaRequest = this.emptyTarifa();
  saving = signal(false);
  saveError = signal('');

  // ── Toast ──
  showToast = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error'>('success');

  // ── Computed ──
  availableYears = computed(() => {
    const anios = this.aniosDisponibles();
    if (anios.length) return anios.sort((a, b) => b - a);
    const cur = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => cur - i);
  });

  municipios = computed(() => {
    const set = new Set<string>();
    this.tarifas().forEach((t) => set.add(t.municipio));
    return Array.from(set).sort();
  });

  departamentos = computed(() => {
    const set = new Set<string>();
    this.tarifas().forEach((t) => set.add(t.departamento));
    return Array.from(set).sort();
  });

  tarifasFiltradas = computed(() => {
    const search = this.searchText().toLowerCase().trim();
    const municipio = this.filterMunicipio();
    const departamento = this.filterDepartamento();
    return this.tarifas().filter((t) => {
      const matchSearch =
        !search ||
        t.municipio.toLowerCase().includes(search) ||
        t.actividadEconomica.toLowerCase().includes(search) ||
        (t.codigoActividad || '').toLowerCase().includes(search) ||
        (t.codigoDane || '').toLowerCase().includes(search);
      return (
        matchSearch &&
        (!municipio || t.municipio === municipio) &&
        (!departamento || t.departamento === departamento)
      );
    });
  });

  hayFiltrosActivos = computed(
    () =>
      !!this.searchText() ||
      !!this.filterMunicipio() ||
      !!this.filterDepartamento(),
  );

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.tarifasFiltradas().length / this.pageSize())),
  );

  tarifasPaginadas = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.tarifasFiltradas().slice(start, start + this.pageSize());
  });

  paginationPages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | '...')[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      for (
        let i = Math.max(2, current - 1);
        i <= Math.min(total - 1, current + 1);
        i++
      ) {
        pages.push(i);
      }
      if (current < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  constructor(private reteicaService: ReteicaService) {
    effect(
      () => {
        // Reset to page 1 whenever filters change
        this.searchText();
        this.filterMunicipio();
        this.filterDepartamento();
        this.currentPage.set(1);
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.loadCatalogs();
    this.loadTarifas();
  }

  // ── Data loading ──

  private loadCatalogs(): void {
    this.reteicaService.getAniosDisponibles().subscribe({
      next: (anios) => this.aniosDisponibles.set(anios),
      error: () => {},
    });
    this.reteicaService.getMunicipios().subscribe({
      next: (m) => this.municipiosCatalog.set(m),
      error: () => {},
    });
    this.reteicaService.getDepartamentos().subscribe({
      next: (d) => this.departamentosCatalog.set(d),
      error: () => {},
    });
  }

  private loadTarifas(): void {
    this.loading.set(true);
    this.reteicaService.getTarifasByAnio(this.selectedYear()).subscribe({
      next: (data) => {
        this.tarifas.set(
          data.sort((a, b) =>
            a.municipio !== b.municipio
              ? a.municipio.localeCompare(b.municipio)
              : a.actividadEconomica.localeCompare(b.actividadEconomica),
          ),
        );
        this.loading.set(false);
      },
      error: (err) => {
        const msg = (err?.error as ApiError)?.message;
        if (msg) console.warn('ReteICA:', msg);
        this.tarifas.set([]);
        this.loading.set(false);
      },
    });
  }

  onYearChange(year: number): void {
    this.selectedYear.set(year);
    this.loadTarifas();
  }

  refreshData(): void {
    this.loadTarifas();
  }

  clearFilters(): void {
    this.searchText.set('');
    this.filterMunicipio.set('');
    this.filterDepartamento.set('');
    this.currentPage.set(1);
  }

  goToPage(page: number | '...'): void {
    if (page === '...') return;
    this.currentPage.set(page);
  }

  prevPage(): void {
    if (this.currentPage() > 1) this.currentPage.set(this.currentPage() - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages())
      this.currentPage.set(this.currentPage() + 1);
  }

  // ── Add/Edit modal ──

  openAddModal(): void {
    this.editingTarifa.set(null);
    this.newTarifa = this.emptyTarifa();
    this.saveError.set('');
    this.showAddModal.set(true);
  }

  openEditModal(tarifa: ReteicaTarifaResponse): void {
    this.editingTarifa.set(tarifa);
    this.newTarifa = {
      municipio: tarifa.municipio,
      departamento: tarifa.departamento,
      codigoDane: tarifa.codigoDane,
      actividadEconomica: tarifa.actividadEconomica,
      codigoActividad: tarifa.codigoActividad,
      tarifaPorMil: tarifa.tarifaPorMil,
      anioVigencia: tarifa.anioVigencia,
      vigente: tarifa.vigente,
      descripcion: tarifa.descripcion,
    };
    this.saveError.set('');
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editingTarifa.set(null);
  }

  saveTarifa(): void {
    if (
      !this.newTarifa.municipio ||
      !this.newTarifa.departamento ||
      !this.newTarifa.actividadEconomica ||
      !this.newTarifa.tarifaPorMil ||
      !this.newTarifa.anioVigencia
    ) {
      this.saveError.set('Complete todos los campos obligatorios.');
      return;
    }
    this.saving.set(true);
    this.saveError.set('');

    const editing = this.editingTarifa();
    const obs = editing
      ? this.reteicaService.updateTarifa(editing.id, this.newTarifa)
      : this.reteicaService.createTarifa(this.newTarifa);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.showAddModal.set(false);
        this.displayToast(
          editing
            ? 'Tarifa actualizada correctamente'
            : 'Tarifa creada correctamente',
          'success',
        );
        this.editingTarifa.set(null);
        this.loadTarifas();
      },
      error: (err) => {
        this.saving.set(false);
        const apiErr = err?.error as ApiError;
        if (apiErr?.status === 409) {
          this.saveError.set(
            'Ya existe una tarifa ReteICA con ese municipio, actividad y año.',
          );
        } else {
          this.saveError.set(
            apiErr?.message ||
              'Error al guardar. Verifique los datos e intente nuevamente.',
          );
        }
        this.displayToast('Error al guardar la tarifa', 'error');
      },
    });
  }

  // ── Delete ──

  confirmDelete(tarifa: ReteicaTarifaResponse): void {
    this.tarifaToDelete.set(tarifa);
    this.showDeleteConfirm.set(true);
  }

  closeDeleteConfirm(): void {
    this.showDeleteConfirm.set(false);
    this.tarifaToDelete.set(null);
  }

  deleteTarifa(): void {
    const tarifa = this.tarifaToDelete();
    if (!tarifa) return;
    this.reteicaService.deleteTarifa(tarifa.id).subscribe({
      next: () => {
        this.closeDeleteConfirm();
        this.loadTarifas();
      },
      error: (err) => {
        const apiErr = err?.error as ApiError;
        console.error('Error al eliminar tarifa:', apiErr?.message);
        this.closeDeleteConfirm();
      },
    });
  }

  // ── Helpers ──

  private emptyTarifa(): ReteicaTarifaRequest {
    return {
      municipio: '',
      departamento: '',
      codigoDane: '',
      actividadEconomica: '',
      codigoActividad: '',
      tarifaPorMil: 0,
      anioVigencia: this.selectedYear?.() ?? new Date().getFullYear(),
      vigente: true,
      descripcion: '',
    };
  }

  formatTarifaPorMil(valor: number): string {
    return valor.toFixed(2) + '‰';
  }

  private displayToast(
    message: string,
    type: 'success' | 'error' = 'success',
  ): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 4000);
  }
}
