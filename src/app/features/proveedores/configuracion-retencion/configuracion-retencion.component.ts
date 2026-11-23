import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  RetencionFuenteService,
  ConfiguracionRetencion,
  ApiError,
} from '../services/retencion-fuente.service';

@Component({
  selector: 'app-configuracion-retencion',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule],
  templateUrl: './configuracion-retencion.component.html',
  styleUrl: './configuracion-retencion.component.scss',
})
export class ConfiguracionRetencionComponent implements OnInit {
  // ── State ──
  configuraciones = signal<ConfiguracionRetencion[]>([]);
  loadingConfiguraciones = signal(false);
  selectedYear = signal<number>(new Date().getFullYear());

  // ── Filters ──
  searchText = signal('');
  filterTipoOperacion = signal('');
  filterTipoPersona = signal('');

  // ── Modals ──
  showAddModal = signal(false);
  showNewYearModal = signal(false);
  showImportModal = signal(false);

  // ── Add record form ──
  newConfig: ConfiguracionRetencion = this.emptyConfig();
  savingConfig = signal(false);
  saveError = signal('');

  // ── New Year form ──
  newYearTarget = signal<number>(new Date().getFullYear() + 1);
  copyFromYear = signal<number | ''>('');
  creatingYear = signal(false);
  createYearError = signal('');

  // ── Import state ──
  importFile = signal<File | null>(null);
  importPreview = signal<ConfiguracionRetencion[]>([]);
  importErrors = signal<string[]>([]);
  importing = signal(false);
  importDone = signal(false);

  // ── Computed ──
  availableYears = computed(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => cur - i);
  });

  allYears = computed(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => cur + 2 - i);
  });

  operaciones = computed(() => {
    const ops = new Set<string>();
    this.configuraciones().forEach((c) => ops.add(c.tipoOperacion));
    return Array.from(ops).sort();
  });

  configuracionesFiltradas = computed(() => {
    const search = this.searchText().toLowerCase().trim();
    const operacion = this.filterTipoOperacion();
    const persona = this.filterTipoPersona();
    return this.configuraciones().filter((c) => {
      const matchesSearch =
        !search ||
        this.getConceptoRetencionLabel(c.conceptoRetencion)
          .toLowerCase()
          .includes(search) ||
        this.getTipoOperacionLabel(c.tipoOperacion)
          .toLowerCase()
          .includes(search);
      return (
        matchesSearch &&
        (!operacion || c.tipoOperacion === operacion) &&
        (!persona || c.tipoPersona === persona)
      );
    });
  });

  hayFiltrosActivos = computed(
    () =>
      !!this.searchText() ||
      !!this.filterTipoOperacion() ||
      !!this.filterTipoPersona(),
  );

  constructor(private retencionFuenteService: RetencionFuenteService) {}

  ngOnInit(): void {
    this.loadConfiguraciones();
  }

  // ── Data loading ──

  private loadConfiguraciones(): void {
    this.loadingConfiguraciones.set(true);
    this.retencionFuenteService
      .getConfiguracionesByAnio(this.selectedYear())
      .subscribe({
        next: (data) => {
          this.configuraciones.set(
            data.sort((a, b) =>
              a.tipoOperacion !== b.tipoOperacion
                ? a.tipoOperacion.localeCompare(b.tipoOperacion)
                : a.tipoPersona.localeCompare(b.tipoPersona),
            ),
          );
          this.loadingConfiguraciones.set(false);
        },
        error: (err) => {
          const msg = (err?.error as ApiError)?.message;
          if (msg) console.warn('Retefuente:', msg);
          this.configuraciones.set([]);
          this.loadingConfiguraciones.set(false);
        },
      });
  }

  onYearChange(year: number): void {
    this.selectedYear.set(year);
    this.loadConfiguraciones();
  }

  refreshData(): void {
    this.loadConfiguraciones();
  }

  clearFilters(): void {
    this.searchText.set('');
    this.filterTipoOperacion.set('');
    this.filterTipoPersona.set('');
  }

  // ── Add record modal ──

  openAddModal(): void {
    this.newConfig = this.emptyConfig();
    this.saveError.set('');
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  saveConfig(): void {
    if (
      !this.newConfig.conceptoRetencion ||
      !this.newConfig.tipoOperacion ||
      !this.newConfig.tipoPersona
    ) {
      this.saveError.set('Complete todos los campos obligatorios.');
      return;
    }
    this.savingConfig.set(true);
    this.saveError.set('');
    this.retencionFuenteService.createConfiguracion(this.newConfig).subscribe({
      next: () => {
        this.savingConfig.set(false);
        this.showAddModal.set(false);
        this.loadConfiguraciones();
      },
      error: (err) => {
        this.savingConfig.set(false);
        const apiErr = err?.error as ApiError;
        if (apiErr?.status === 409) {
          this.saveError.set(
            'Ya existe una configuración con ese concepto, operación, persona y año.',
          );
        } else {
          this.saveError.set(
            apiErr?.message ||
              'Error al guardar. Verifique los datos e intente nuevamente.',
          );
        }
      },
    });
  }

  private emptyConfig(): ConfiguracionRetencion {
    return {
      conceptoRetencion: '',
      tipoOperacion: '',
      tipoPersona: '',
      baseMinimaUvt: 0,
      tarifaRetencion: 0,
      anioVigencia: this.selectedYear?.() ?? new Date().getFullYear(),
      activo: true,
    };
  }

  // ── New Year modal ──

  openNewYearModal(): void {
    this.newYearTarget.set(new Date().getFullYear() + 1);
    this.copyFromYear.set('');
    this.createYearError.set('');
    this.showNewYearModal.set(true);
  }

  closeNewYearModal(): void {
    this.showNewYearModal.set(false);
  }

  createNewYear(): void {
    const targetYear = this.newYearTarget();
    if (!targetYear || targetYear < 2000 || targetYear > 2100) {
      this.createYearError.set('Ingrese un año válido (2000–2100).');
      return;
    }
    const fromYear = this.copyFromYear();
    this.creatingYear.set(true);
    this.createYearError.set('');

    if (fromYear) {
      this.retencionFuenteService
        .getConfiguracionesByAnio(Number(fromYear))
        .subscribe({
          next: (configs) => {
            if (!configs.length) {
              this.creatingYear.set(false);
              this.createYearError.set(
                'El año de origen no tiene configuraciones para copiar.',
              );
              return;
            }
            const cloned = configs.map(({ id, ...c }) => ({
              ...c,
              anioVigencia: targetYear,
            }));
            forkJoin(
              cloned.map((c) =>
                this.retencionFuenteService.createConfiguracion(c),
              ),
            ).subscribe({
              next: () => {
                this.creatingYear.set(false);
                this.showNewYearModal.set(false);
                this.selectedYear.set(targetYear);
                this.loadConfiguraciones();
              },
              error: (err) => {
                this.creatingYear.set(false);
                const apiErr = err?.error as ApiError;
                this.createYearError.set(
                  apiErr?.message ||
                    'Error al crear las configuraciones. Intente nuevamente.',
                );
              },
            });
          },
          error: () => {
            this.creatingYear.set(false);
            this.createYearError.set(
              'Error al obtener configuraciones del año origen.',
            );
          },
        });
    } else {
      // Blank year – just navigate to it
      this.creatingYear.set(false);
      this.showNewYearModal.set(false);
      this.selectedYear.set(targetYear);
      this.loadConfiguraciones();
    }
  }

  // ── Import modal ──

  openImportModal(): void {
    this.importFile.set(null);
    this.importPreview.set([]);
    this.importErrors.set([]);
    this.importDone.set(false);
    this.showImportModal.set(true);
  }

  closeImportModal(): void {
    this.showImportModal.set(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.parseExcelFile(file);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.parseExcelFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private parseExcelFile(file: File): void {
    this.importFile.set(file);
    this.importPreview.set([]);
    this.importErrors.set([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
      }) as unknown[][];
      const errors: string[] = [];
      const configs: ConfiguracionRetencion[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || (row as unknown[]).every((v) => v === '' || v == null))
          continue;
        const [anio, concepto, operacion, persona, baseUvt, tarifa] =
          row as unknown[];
        if (!anio || !concepto || !operacion || !persona) {
          errors.push(
            `Fila ${i + 1}: faltan campos obligatorios (año, concepto, operación, persona).`,
          );
          continue;
        }
        configs.push({
          anioVigencia: Number(anio),
          conceptoRetencion: String(concepto).trim(),
          tipoOperacion: String(operacion).trim(),
          tipoPersona: String(persona).trim(),
          baseMinimaUvt: Number(baseUvt) || 0,
          tarifaRetencion: Number(tarifa) || 0,
          activo: true,
        });
      }
      this.importPreview.set(configs);
      this.importErrors.set(errors);
    };
    reader.readAsArrayBuffer(file);
  }

  confirmImport(): void {
    const configs = this.importPreview();
    if (!configs.length) return;
    this.importing.set(true);
    forkJoin(
      configs.map((c) => this.retencionFuenteService.createConfiguracion(c)),
    ).subscribe({
      next: () => {
        this.importing.set(false);
        this.importDone.set(true);
        this.loadConfiguraciones();
      },
      error: (err) => {
        this.importing.set(false);
        const apiErr = err?.error as ApiError;
        const msg =
          apiErr?.status === 409
            ? 'Algunos registros ya existen y fueron omitidos.'
            : apiErr?.message || 'Error al importar algunos registros.';
        this.importErrors.update((errs) => [...errs, msg]);
      },
    });
  }

  // ── Download Excel template ──

  downloadTemplate(): void {
    const headers = [
      'anioVigencia',
      'conceptoRetencion',
      'tipoOperacion',
      'tipoPersona',
      'baseMinimaUvt',
      'tarifaRetencion',
    ];
    const examples = [
      [2026, 'COMPRAS_GENERALES', 'COMPRAS', 'PERSONA_JURIDICA', 27, 2.5],
      [2026, 'HONORARIOS', 'HONORARIOS', 'PERSONA_NATURAL_DECLARANTE', 0, 10],
      [
        2026,
        'SERVICIOS_GENERALES',
        'SERVICIOS',
        'PERSONA_NATURAL_NO_DECLARANTE',
        4,
        6,
      ],
    ];
    const concepts = [
      ['VALOR', 'DESCRIPCION'],
      ['COMPRAS_GENERALES', 'Compras Generales'],
      ['COMPRAS_TARJETA', 'Compras Tarjeta Deb/Cred'],
      ['SERVICIOS_GENERALES', 'Servicios Generales'],
      ['HONORARIOS', 'Honorarios'],
      ['COMISIONES', 'Comisiones'],
      ['CONSULTORIA', 'Consultoria'],
      ['ARRENDAMIENTO_INMUEBLES', 'Arrendamiento Inmuebles'],
      ['ARRENDAMIENTO_MUEBLES', 'Arrendamiento Muebles'],
      ['TRANSPORTE_CARGA', 'Transporte Carga'],
      ['TRANSPORTE_PASAJEROS', 'Transporte Pasajeros'],
      ['OTROS_INGRESOS', 'Otros Ingresos'],
      ['CONTRATOS_CONSTRUCCION', 'Contratos Construccion'],
      ['HOTELES_RESTAURANTES', 'Hoteles y Restaurantes'],
      ['LICENCIAMIENTO_SOFTWARE', 'Licenciamiento Software'],
      ['SERVICIOS_TEMPORALES', 'Servicios Temporales (AIU)'],
      ['VIGILANCIA_ASEO', 'Vigilancia y Aseo (AIU)'],
    ];
    const operations = [
      ['VALOR', 'DESCRIPCION'],
      ['COMPRAS', 'Compras'],
      ['SERVICIOS', 'Servicios'],
      ['HONORARIOS', 'Honorarios'],
      ['ARRENDAMIENTOS', 'Arrendamientos'],
      ['COMISIONES', 'Comisiones'],
      ['TRANSPORTE', 'Transporte'],
      ['OTROS', 'Otros'],
      ['BIENES', 'Bienes'],
      ['IVA', 'IVA'],
    ];
    const personas = [
      ['VALOR', 'DESCRIPCION'],
      ['PERSONA_JURIDICA', 'Persona Juridica'],
      ['PERSONA_NATURAL_DECLARANTE', 'Persona Natural Declarante'],
      ['PERSONA_NATURAL_NO_DECLARANTE', 'Persona Natural No Declarante'],
    ];
    const wb = XLSX.utils.book_new();
    const wsData = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    wsData['!cols'] = [
      { wch: 14 },
      { wch: 30 },
      { wch: 22 },
      { wch: 32 },
      { wch: 16 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsData, 'Datos');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(concepts),
      'ConceptosRetencion',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(operations),
      'TiposOperacion',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(personas),
      'TiposPersona',
    );
    XLSX.writeFile(wb, 'plantilla_retefuente.xlsx');
  }

  // ── Labels ──

  getOperacionIcon(operacion: string): string {
    const icons: { [key: string]: string } = {
      COMPRAS: '🛒',
      SERVICIOS: '🔧',
      HONORARIOS: '💼',
      ARRENDAMIENTOS: '🏢',
      COMISIONES: '💰',
      TRANSPORTE: '🚚',
      OTROS: '📋',
      BIENES: '📦',
      IVA: '🧾',
    };
    return icons[operacion] || '📊';
  }

  getTipoOperacionLabel(value: string): string {
    const labels: { [key: string]: string } = {
      COMPRAS: 'Compras',
      SERVICIOS: 'Servicios',
      HONORARIOS: 'Honorarios',
      ARRENDAMIENTOS: 'Arrendamientos',
      COMISIONES: 'Comisiones',
      TRANSPORTE: 'Transporte',
      OTROS: 'Otros',
      BIENES: 'Bienes',
      IVA: 'IVA',
    };
    return labels[value] || value;
  }

  getConceptoRetencionLabel(value: string): string {
    const labels: { [key: string]: string } = {
      COMPRAS_GENERALES: 'Compras Generales',
      COMPRAS_TARJETA: 'Compras Tarjeta Déb/Créd',
      SERVICIOS_GENERALES: 'Servicios Generales',
      HONORARIOS: 'Honorarios',
      COMISIONES: 'Comisiones',
      CONSULTORIA: 'Consultoría',
      ARRENDAMIENTO_INMUEBLES: 'Arrend. Inmuebles',
      ARRENDAMIENTO_MUEBLES: 'Arrend. Muebles',
      TRANSPORTE_CARGA: 'Transporte Carga',
      TRANSPORTE_PASAJEROS: 'Transporte Pasajeros',
      OTROS_INGRESOS: 'Otros Ingresos',
      CONTRATOS_CONSTRUCCION: 'Contratos Construcción',
      HOTELES_RESTAURANTES: 'Hoteles y Restaurantes',
      LICENCIAMIENTO_SOFTWARE: 'Licenciamiento Software',
      SERVICIOS_TEMPORALES: 'Servicios Temporales (AIU)',
      VIGILANCIA_ASEO: 'Vigilancia y Aseo (AIU)',
    };
    return labels[value] || value;
  }

  getTipoPersonaRetencionLabel(value: string): string {
    const labels: { [key: string]: string } = {
      PERSONA_JURIDICA: 'Persona Jurídica',
      PERSONA_NATURAL_DECLARANTE: 'Persona Natural Declarante',
      PERSONA_NATURAL_NO_DECLARANTE: 'Persona Natural No Declarante',
    };
    return labels[value] || value;
  }
}
