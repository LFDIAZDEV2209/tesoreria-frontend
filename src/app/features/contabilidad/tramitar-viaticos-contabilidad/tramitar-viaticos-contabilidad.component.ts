import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ContabilidadService } from '../services/contabilidad.service';

interface TextractKeyValuePair {
  key: string;
  value: string;
}

interface TextractAnalyzeResponse {
  plainText?: string;
  tables?: string[][][];
  keyValuePairs?: TextractKeyValuePair[];
  sheetNames?: string[];
  fileKey?: string;
  fileUrl?: string;
}

@Component({
  selector: 'app-tramitar-viaticos-contabilidad',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, ReactiveFormsModule],
  templateUrl: './tramitar-viaticos-contabilidad.component.html',
  styleUrl: './tramitar-viaticos-contabilidad.component.scss',
})
export class TramitarViaticosContabilidadComponent implements OnInit {
  readonly decisionOptions = [
    { value: 'APROBADO', label: 'Aprobado' },
    { value: 'AJUSTADO', label: 'Aprobado con ajuste' },
    { value: 'RECHAZADO', label: 'Rechazado' },
  ];

  solicitud = signal<any | null>(null);
  loading = signal(true);
  saving = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  showConfirmDifferenceModal = signal(false);
  confirmDifferenceDetails = signal<string[]>([]);
  pendingSubmitData = signal<{
    solicitudId: number;
    payload: {
      numeroOrdenEgreso: string;
      montoDesembolsoAprobado: number;
      confirmarDiferenciaMonto?: boolean;
      respuestaContabilidad: string;
      observacionesContabilidad?: string;
    };
  } | null>(null);
  pasoActual = signal(1);
  expandedItems = signal<number[]>([0]);
  itemSupportFiles = signal<Record<number, File | null>>({});
  egresoFile = signal<File | null>(null);
  egresoFileName = signal('');
  egresoDragOver = signal(false);
  egresoUploading = signal(false);
  egresoAnalyzing = signal(false);
  egresoAnalyzingProgress = signal(0);
  egresoError = signal('');
  egresoTextractResult = signal<TextractAnalyzeResponse | null>(null);
  egresoNumeroDetectado = signal('');
  egresoMontoDetectado = signal<number | null>(null);

  form!: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private contabilidadService: ContabilidadService,
  ) {}

  goBack(): void {
    this.router.navigate(['/contabilidad/gestion']);
  }

  irPaso2(): void {
    this.pasoActual.set(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  irPaso1(): void {
    this.pasoActual.set(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onEgresoDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.egresoDragOver.set(true);
  }

  onEgresoDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.egresoDragOver.set(false);
  }

  onEgresoDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.egresoDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.handleEgresoFile(files[0]);
    }
  }

  onEgresoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleEgresoFile(input.files[0]);
      input.value = '';
    }
  }

  removeEgresoFile(): void {
    this.egresoFile.set(null);
    this.egresoFileName.set('');
    this.egresoError.set('');
    this.egresoUploading.set(false);
    this.egresoAnalyzing.set(false);
    this.egresoAnalyzingProgress.set(0);
    this.egresoTextractResult.set(null);
    this.egresoNumeroDetectado.set('');
    this.egresoMontoDetectado.set(null);
  }

  analyzeEgresoDocument(): void {
    const file = this.egresoFile();
    if (!file || this.egresoAnalyzing()) {
      return;
    }

    this.egresoUploading.set(true);
    this.egresoAnalyzing.set(true);
    this.egresoAnalyzingProgress.set(0);
    this.egresoError.set('');

    const progressInterval = window.setInterval(() => {
      const current = this.egresoAnalyzingProgress();
      if (current < 88) {
        this.egresoAnalyzingProgress.set(current + Math.random() * 10 + 2);
      }
    }, 420);

    this.contabilidadService.analyzeEgresoDocument(file).subscribe({
      next: (result) => {
        window.clearInterval(progressInterval);
        this.egresoAnalyzingProgress.set(100);

        window.setTimeout(() => {
          this.egresoUploading.set(false);
          this.egresoAnalyzing.set(false);
          this.egresoTextractResult.set(result);
          this.applyTextractResult(result);
        }, 450);
      },
      error: (error) => {
        window.clearInterval(progressInterval);
        this.egresoUploading.set(false);
        this.egresoAnalyzing.set(false);
        this.egresoAnalyzingProgress.set(0);
        const message =
          error?.error?.detail ||
          error?.error?.error ||
          'No fue posible analizar el documento de egreso con Textract.';
        this.egresoError.set(message);
      },
    });
  }

  getEgresoStatusLabel(): string {
    if (this.egresoAnalyzing()) {
      return 'Analizando OCR';
    }
    const match = this.hasEgresoAmountMatch();
    if (match === true) {
      return 'Coincide con valor aprobado';
    }
    if (match === false) {
      return 'Monto no coincide';
    }
    if (this.egresoNumeroDetectado() || this.egresoMontoDetectado() != null) {
      return 'Valores extraídos';
    }
    if (this.egresoFile()) {
      return 'Documento listo para leer';
    }
    return 'Sin documento cargado';
  }

  getEgresoPreviewUrl(): string {
    return this.egresoTextractResult()?.fileUrl ?? '';
  }

  getEgresoFileSizeLabel(): string {
    const file = this.egresoFile();
    if (!file) {
      return '';
    }

    const bytes = file.size;
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getEgresoDetectedAmountLabel(): string {
    const amount = this.egresoMontoDetectado();
    if (amount == null) {
      return 'Pendiente de detectar';
    }
    return this.formatCurrency(amount);
  }

  getApprovedAmountForEgresoComparison(): number | null {
    return this.totalAprobadoItems > 0 ? this.totalAprobadoItems : null;
  }

  getApprovedAmountForEgresoComparisonLabel(): string {
    const amount = this.getApprovedAmountForEgresoComparison();
    if (amount == null) {
      return 'Pendiente por aprobar';
    }
    return this.formatCurrency(amount);
  }

  getEgresoComparisonDifference(): number | null {
    const detected = this.egresoMontoDetectado();
    const approved = this.getApprovedAmountForEgresoComparison();
    if (detected == null || approved == null) {
      return null;
    }
    return detected - approved;
  }

  hasEgresoAmountMatch(): boolean | null {
    const difference = this.getEgresoComparisonDifference();
    if (difference == null) {
      return null;
    }
    return Math.abs(difference) < 0.01;
  }

  getEgresoComparisonStatusLabel(): string {
    const match = this.hasEgresoAmountMatch();
    if (match === null) {
      return 'Pendiente de comparar';
    }
    return match ? 'Coincide con lo aprobado' : 'No coincide con lo aprobado';
  }

  getEgresoComparisonDetailLabel(): string {
    const difference = this.getEgresoComparisonDifference();
    if (difference == null) {
      return 'Adjunte y lea el egreso para validar si el valor detectado coincide con el monto aprobado de la solicitud.';
    }

    if (Math.abs(difference) < 0.01) {
      return 'El valor leído por Textract coincide exactamente con el total aprobado en la solicitud de viáticos.';
    }

    const comparisonWord = difference > 0 ? 'supera' : 'está por debajo de';
    return `El valor del egreso ${comparisonWord} lo aprobado por ${this.formatCurrency(Math.abs(difference))}.`;
  }

  getEgresoComparisonDifferenceLabel(): string {
    const difference = this.getEgresoComparisonDifference();
    if (difference == null) {
      return 'Pendiente de comparar';
    }
    return this.formatCurrency(Math.abs(difference));
  }

  isEgresoComparisonMismatch(): boolean {
    return this.hasEgresoAmountMatch() === false;
  }

  readonly itemColors = [
    { bg: '#045C94', light: 'rgba(4,92,148,0.1)', border: 'rgba(4,92,148,0.25)', text: '#045C94' },
    { bg: '#7c3aed', light: 'rgba(124,58,237,0.1)', border: 'rgba(124,58,237,0.25)', text: '#7c3aed' },
    { bg: '#059669', light: 'rgba(5,150,105,0.1)', border: 'rgba(5,150,105,0.25)', text: '#059669' },
    { bg: '#d97706', light: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.25)', text: '#d97706' },
    { bg: '#e11d48', light: 'rgba(225,29,72,0.1)', border: 'rgba(225,29,72,0.25)', text: '#e11d48' },
    { bg: '#0d9488', light: 'rgba(13,148,136,0.1)', border: 'rgba(13,148,136,0.25)', text: '#0d9488' },
  ];

  getItemColor(index: number): { bg: string; light: string; border: string; text: string } {
    return this.itemColors[index % this.itemColors.length];
  }

  isItemExpanded(index: number): boolean {
    return this.expandedItems().includes(index);
  }

  toggleItem(index: number): void {
    this.expandedItems.update((current) =>
      current.includes(index)
        ? current.filter((itemIndex) => itemIndex !== index)
        : [...current, index].sort((left, right) => left - right),
    );
  }

  onSupportFileSelected(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.itemSupportFiles.update((current) => ({
      ...current,
      [index]: file,
    }));
  }

  clearSupportFile(index: number, input?: HTMLInputElement): void {
    this.itemSupportFiles.update((current) => ({
      ...current,
      [index]: null,
    }));

    if (input) {
      input.value = '';
    }
  }

  getSupportFileName(index: number): string {
    return this.itemSupportFiles()[index]?.name ?? '';
  }

  getItemIcon(item: any): string {
    const tipo = (
      item?.tipoViatico ||
      item?.conceptoDetallado ||
      item?.descripcion ||
      ''
    ).toLowerCase();
    if (tipo.includes('hotel') || tipo.includes('aloja') || tipo.includes('hospedaje')) return 'hotel';
    if (tipo.includes('transport') || tipo.includes('vuelo') || tipo.includes('aer') || tipo.includes('taxi') || tipo.includes('bus')) return 'transport';
    if (tipo.includes('aliment') || tipo.includes('comid') || tipo.includes('rest') || tipo.includes('desayuno') || tipo.includes('almuerzo') || tipo.includes('cena')) return 'food';
    if (tipo.includes('combustible') || tipo.includes('gasolina') || tipo.includes('peaje')) return 'fuel';
    if (tipo.includes('inscripcion') || tipo.includes('capacitacion') || tipo.includes('curso') || tipo.includes('evento')) return 'education';
    return 'wallet';
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      numeroOrdenEgreso: ['', [Validators.required, Validators.maxLength(120)]],
      montoDesembolsoAprobado: [null, [Validators.required, Validators.min(0.01)]],
      mensajeGeneral: ['', [Validators.required, Validators.maxLength(1500)]],
      observacionesContabilidad: ['', [Validators.maxLength(2000)]],
      itemResponses: this.fb.array([]),
    });

    const solicitudId = Number(this.route.snapshot.paramMap.get('solicitudViaticosId'));
    if (!Number.isFinite(solicitudId) || solicitudId <= 0) {
      this.router.navigate(['/contabilidad/gestion']);
      return;
    }

    this.contabilidadService.getSolicitudViaticosById(solicitudId).subscribe({
      next: (data) => {
        this.solicitud.set(data);

        const items = this.requestedItems;
        this.buildItemResponses(items);
        this.expandedItems.set(items.length ? [0] : []);
        this.itemSupportFiles.set({});

        const totalSugerido =
          this.totalAprobadoItems > 0
            ? this.totalAprobadoItems
            : Number(data?.totalGeneral ?? 0);

        this.form.patchValue({
          montoDesembolsoAprobado: totalSugerido > 0 ? totalSugerido : null,
          mensajeGeneral:
            'Tesorería: egreso validado por contabilidad y listo para gestión de desembolso.',
        });

        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No fue posible cargar la solicitud de viáticos.');
        this.loading.set(false);
      },
    });
  }

  get totalSolicitado(): number {
    return Number(this.solicitud()?.totalGeneral ?? 0);
  }

  get requestedItems(): any[] {
    const items = this.solicitud()?.items;
    return Array.isArray(items) ? items : [];
  }

  get itemResponses(): FormArray {
    return this.form.get('itemResponses') as FormArray;
  }

  get totalAprobadoItems(): number {
    return this.itemResponses.controls.reduce((acc, ctrl) => {
      const decision = String(ctrl.get('decision')?.value ?? 'APROBADO');
      const value = Number(ctrl.get('montoAprobado')?.value ?? 0);
      if (decision === 'RECHAZADO') {
        return acc;
      }
      return acc + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  get diferenciaDesembolso(): number {
    return this.totalSolicitado - this.totalAprobadoItems;
  }

  get solicitudSoportes(): string[] {
    const s = this.solicitud();
    if (!s) return [];

    const links: string[] = [];
    const add = (value: unknown) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        links.push(value.trim());
      }
    };

    add(s.soportePrincipalUrl);
    if (Array.isArray(s.soportesAdicionalesUrls)) {
      s.soportesAdicionalesUrls.forEach((url: unknown) => add(url));
    }
    if (Array.isArray(s.soportes)) {
      s.soportes.forEach((value: unknown) => add(value));
    }

    return [...new Set(links)];
  }

  trackByIndex(index: number): number {
    return index;
  }

  recalculateMontoDesembolsoFromItems(): void {
    const suggested = this.totalAprobadoItems;
    if (suggested > 0) {
      this.form.patchValue(
        {
          montoDesembolsoAprobado: suggested,
        },
        { emitEvent: false },
      );
    }
  }

  getMontoAprobadoDisplay(index: number): string {
    const control = this.itemResponses.at(index)?.get('montoAprobado');
    if (control?.value === null || control?.value === undefined || control?.value === '') {
      return '';
    }
    const value = Number(control.value);
    return this.formatAmountForInput(value);
  }

  onMontoAprobadoInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value;
    const cursor = input.selectionStart ?? rawValue.length;

    if (!rawValue.trim()) {
      this.itemResponses.at(index)?.get('montoAprobado')?.setValue(null, { emitEvent: false });
      input.value = '';
      this.recalculateMontoDesembolsoFromItems();
      return;
    }

    const digitsBeforeCursor = this.countDigits(rawValue.slice(0, cursor));
    const numericValue = this.parseAmountInput(rawValue);
    if (numericValue === null) {
      this.itemResponses.at(index)?.get('montoAprobado')?.setValue(null, { emitEvent: false });
      input.value = '';
      this.recalculateMontoDesembolsoFromItems();
      return;
    }

    this.itemResponses.at(index)?.get('montoAprobado')?.setValue(numericValue, { emitEvent: false });
    const formattedValue = this.formatAmountForInput(numericValue);
    input.value = formattedValue;

    const nextCaret = this.findCaretByDigitIndex(formattedValue, digitsBeforeCursor);
    input.setSelectionRange(nextCaret, nextCaret);
    this.recalculateMontoDesembolsoFromItems();
  }

  getMontoDesembolsoDisplay(): string {
    const controlValue = this.form.get('montoDesembolsoAprobado')?.value;
    if (controlValue === null || controlValue === undefined || controlValue === '') {
      return '';
    }
    const value = Number(controlValue);
    return this.formatAmountForInput(value);
  }

  onMontoDesembolsoInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value;
    const cursor = input.selectionStart ?? rawValue.length;

    if (!rawValue.trim()) {
      this.form.get('montoDesembolsoAprobado')?.setValue(null, { emitEvent: false });
      input.value = '';
      return;
    }

    const digitsBeforeCursor = this.countDigits(rawValue.slice(0, cursor));
    const numericValue = this.parseAmountInput(rawValue);
    if (numericValue === null) {
      this.form.get('montoDesembolsoAprobado')?.setValue(null, { emitEvent: false });
      input.value = '';
      return;
    }

    this.form.get('montoDesembolsoAprobado')?.setValue(numericValue, { emitEvent: false });
    const formattedValue = this.formatAmountForInput(numericValue);
    input.value = formattedValue;

    const nextCaret = this.findCaretByDigitIndex(formattedValue, digitsBeforeCursor);
    input.setSelectionRange(nextCaret, nextCaret);
  }

  getItemSupportLinks(item: any): string[] {
    const links: string[] = [];
    const add = (value: unknown) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        links.push(value.trim());
      }
    };

    add(item?.soporteUrl);
    add(item?.soporte);

    if (Array.isArray(item?.soportes)) {
      item.soportes.forEach((url: unknown) => add(url));
    }

    if (Array.isArray(item?.soportesUrls)) {
      item.soportesUrls.forEach((url: unknown) => add(url));
    }

    return [...new Set(links)];
  }

  isSolicitudAdelanto(): boolean {
    const tipo = String(
      this.solicitud()?.tipoSolicitudViaticos ?? this.solicitud()?.tipoSolicitud ?? '',
    ).toUpperCase();
    return tipo === 'ADELANTO_VIATICOS' || tipo === 'ADELANTO';
  }

  formatItemDate(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  getItemDisplayName(item: any, index: number): string {
    return (
      item?.conceptoDetallado ||
      item?.descripcion ||
      item?.concepto ||
      item?.tipoViatico ||
      `Item ${index + 1}`
    );
  }

  private buildItemResponses(items: any[]): void {
    this.itemResponses.clear();

    items.forEach((item) => {
      const solicitado = Number(item?.valorTotal ?? 0);
      this.itemResponses.push(
        this.fb.group({
          decision: ['APROBADO', Validators.required],
          montoAprobado: [solicitado > 0 ? solicitado : null, [Validators.required, Validators.min(0)]],
          observacion: ['', [Validators.maxLength(700)]],
        }),
      );
    });
  }

  private handleEgresoFile(file: File): void {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.xlsx', '.xls', '.docx', '.doc'];
    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
    if (!allowed.includes(ext)) {
      this.egresoError.set('Tipo de archivo no soportado. Permitidos: PDF, imágenes, Excel y Word.');
      return;
    }

    this.egresoFile.set(file);
    this.egresoFileName.set(file.name);
    this.egresoError.set('');
    this.egresoUploading.set(false);
    this.egresoAnalyzing.set(false);
    this.egresoAnalyzingProgress.set(0);
    this.egresoTextractResult.set(null);
    this.egresoNumeroDetectado.set('');
    this.egresoMontoDetectado.set(null);

    window.setTimeout(() => this.analyzeEgresoDocument(), 0);
  }

  private applyTextractResult(result: TextractAnalyzeResponse): void {
    const extracted = this.extractEgresoData(result);

    this.egresoNumeroDetectado.set(extracted.numeroOrdenEgreso ?? '');
    this.egresoMontoDetectado.set(extracted.montoDesembolsado);

    const patch: Record<string, unknown> = {};
    if (extracted.numeroOrdenEgreso) {
      patch['numeroOrdenEgreso'] = extracted.numeroOrdenEgreso;
    }
    if (extracted.montoDesembolsado != null && extracted.montoDesembolsado > 0) {
      patch['montoDesembolsoAprobado'] = extracted.montoDesembolsado;
    }

    if (Object.keys(patch).length > 0) {
      this.form.patchValue(patch, { emitEvent: false });
    }
  }

  private extractEgresoData(result: TextractAnalyzeResponse): {
    numeroOrdenEgreso: string | null;
    montoDesembolsado: number | null;
  } {
    const keyValuePairs = result.keyValuePairs ?? [];
    const plainText = result.plainText ?? '';

    const numeroOrdenEgreso =
      this.findValueByKey(keyValuePairs, [
        'numero orden egreso',
        'número orden egreso',
        'orden de egreso',
        'numero de egreso',
        'número de egreso',
        'nro egreso',
        'comprobante egreso',
        'egreso',
      ]) ?? this.extractEgresoNumberFromText(plainText);

    const montoDesembolsado =
      this.findAmountByKey(keyValuePairs, [
        'monto desembolsado',
        'valor desembolsado',
        'valor a pagar',
        'neto a pagar',
        'monto total',
        'valor total',
        'total',
        'desembolso',
      ]) ?? this.extractBestAmountFromText(plainText);

    return {
      numeroOrdenEgreso: numeroOrdenEgreso?.trim() || null,
      montoDesembolsado,
    };
  }

  private findValueByKey(keyValuePairs: TextractKeyValuePair[], candidates: string[]): string | null {
    for (const candidate of candidates) {
      const match = keyValuePairs.find((pair) => this.normalizeText(pair.key).includes(this.normalizeText(candidate)));
      if (match?.value?.trim()) {
        return match.value.trim();
      }
    }
    return null;
  }

  private findAmountByKey(keyValuePairs: TextractKeyValuePair[], candidates: string[]): number | null {
    for (const candidate of candidates) {
      const match = keyValuePairs.find((pair) => this.normalizeText(pair.key).includes(this.normalizeText(candidate)));
      const amount = this.parseCurrencyValue(match?.value ?? '');
      if (amount != null && amount > 0) {
        return amount;
      }
    }
    return null;
  }

  private extractEgresoNumberFromText(plainText: string): string | null {
    const directMatch = plainText.match(/\bEGR[-\s]?[A-Z0-9-]{4,}\b/i);
    if (directMatch?.[0]) {
      return directMatch[0].replace(/\s+/g, '');
    }

    const egresoMatch = plainText.match(/(?:orden\s+de\s+egreso|numero\s+de\s+egreso|nro\s+egreso|egreso)\s*[:#-]?\s*([A-Z0-9-]{4,})/i);
    return egresoMatch?.[1]?.trim() ?? null;
  }

  private extractBestAmountFromText(plainText: string): number | null {
    const matches = plainText.match(/(?:COP\$?|\$)?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|(?:COP\$?|\$)?\s*\d+(?:[.,]\d{1,2})?/gi) ?? [];
    const parsed = matches
      .map((value) => this.parseCurrencyValue(value))
      .filter((value): value is number => value != null && value > 0)
      .sort((left, right) => right - left);

    return parsed[0] ?? null;
  }

  private parseCurrencyValue(rawValue: string): number | null {
    const cleaned = String(rawValue ?? '').replace(/[^\d,.-]/g, '');
    if (!/\d/.test(cleaned)) {
      return null;
    }

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized = cleaned;

    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = cleaned.replace(/,/g, '');
      }
    } else if (lastComma > -1) {
      const decimals = cleaned.length - lastComma - 1;
      normalized = decimals === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
    } else if (lastDot > -1) {
      const decimals = cleaned.length - lastDot - 1;
      normalized = decimals === 3 ? cleaned.replace(/\./g, '') : cleaned;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeText(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildRespuestaContabilidad(): string {
    const detalleItems = this.itemResponses.controls
      .map((ctrl: AbstractControl, index: number) => {
        const item = this.requestedItems[index] ?? {};
        const decision = String(ctrl.get('decision')?.value ?? 'APROBADO');
        const montoAprobado = Number(ctrl.get('montoAprobado')?.value ?? 0);
        const observacion = String(ctrl.get('observacion')?.value ?? '').trim();
        const soporteFileName = this.getSupportFileName(index);

        const solicitado = Number(item?.valorTotal ?? 0);
        const nombre = this.getItemDisplayName(item, index);
        const tipo = item?.tipoViatico ? ` (${item.tipoViatico})` : '';
        const estadoLabel =
          decision === 'APROBADO'
            ? 'Aprobado'
            : decision === 'AJUSTADO'
              ? 'Aprobado con ajuste'
              : 'Rechazado';

        const parts = [
          `${index + 1}. ${nombre}${tipo}: ${estadoLabel}.`,
          `Solicitado ${this.formatCurrency(solicitado)}.`,
          `Aprobado ${this.formatCurrency(montoAprobado)}.`,
        ];

        if (observacion) {
          parts.push(`Observacion: ${observacion}.`);
        }
        if (soporteFileName) {
          parts.push(`Soporte adjunto: ${soporteFileName}.`);
        }

        return parts.join(' ');
      })
      .join('\n');

    const resumen = `Total solicitado: ${this.formatCurrency(this.totalSolicitado)}. Total aprobado: ${this.formatCurrency(this.totalAprobadoItems)}. Diferencia: ${this.formatCurrency(this.diferenciaDesembolso)}.`;

    return [detalleItems, resumen].filter(Boolean).join('\n\n');
  }

  private buildObservacionesContabilidad(): string {
    const tesoreriaMessage = String(
      this.form.get('mensajeGeneral')?.value ?? '',
    ).trim();

    const itemNotes = this.itemResponses.controls
      .map((ctrl: AbstractControl, index: number) => {
        const observacion = String(ctrl.get('observacion')?.value ?? '').trim();
        if (!observacion) {
          return '';
        }

        const item = this.requestedItems[index] ?? {};
        const nombre = this.getItemDisplayName(item, index);
        return `Item ${index + 1} (${nombre}): ${observacion}`;
      })
      .filter(Boolean)
      .join(' | ');

    return [tesoreriaMessage, itemNotes].filter(Boolean).join(' | ');
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  }

  private parseAmountInput(rawValue: string): number | null {
    if (!/\d/.test(String(rawValue ?? ''))) {
      return null;
    }

    const normalized = String(rawValue ?? '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  private formatAmountForInput(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  }

  private countDigits(value: string): number {
    return (value.match(/\d/g) ?? []).length;
  }

  private findCaretByDigitIndex(formattedValue: string, digitIndex: number): number {
    if (digitIndex <= 0) {
      return 0;
    }

    let seenDigits = 0;
    for (let i = 0; i < formattedValue.length; i += 1) {
      if (/\d/.test(formattedValue.charAt(i))) {
        seenDigits += 1;
        if (seenDigits >= digitIndex) {
          return i + 1;
        }
      }
    }

    return formattedValue.length;
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const solicitudId = Number(this.route.snapshot.paramMap.get('solicitudViaticosId'));
    const montoDesembolsoAprobado = Number(this.form.get('montoDesembolsoAprobado')?.value ?? 0);
    const differenceVsDetected = this.getEgresoComparisonDifference();
    const hasDetectedMismatch =
      differenceVsDetected != null && Math.abs(differenceVsDetected) >= 0.01;
    const differenceVsSolicitado = montoDesembolsoAprobado - this.totalSolicitado;
    const exceedsRequestedTotal =
      this.totalSolicitado > 0 && differenceVsSolicitado > 0.01;

    const requiresConfirmation = hasDetectedMismatch || exceedsRequestedTotal;

    const payload = {
      numeroOrdenEgreso: String(this.form.get('numeroOrdenEgreso')?.value ?? '').trim(),
      montoDesembolsoAprobado,
      confirmarDiferenciaMonto: requiresConfirmation,
      respuestaContabilidad: this.buildRespuestaContabilidad(),
      observacionesContabilidad: this.buildObservacionesContabilidad(),
    };

    if (requiresConfirmation) {
      const details: string[] = [
        'El monto final presenta diferencias frente a los valores de referencia.',
      ];

      if (hasDetectedMismatch && differenceVsDetected != null) {
        details.push(
          `Diferencia contra valor detectado en egreso: ${this.formatCurrency(Math.abs(differenceVsDetected))}.`,
        );
      }

      if (exceedsRequestedTotal) {
        details.push(
          `Excede el total solicitado por: ${this.formatCurrency(Math.abs(differenceVsSolicitado))}.`,
        );
      }

      details.push('¿Está seguro de enviar la solicitud a Tesorería con esta diferencia?');

      this.confirmDifferenceDetails.set(details);
      this.pendingSubmitData.set({ solicitudId, payload });
      this.showConfirmDifferenceModal.set(true);
      return;
    }

    this.executeSubmit(solicitudId, payload);
  }

  closeDifferenceConfirmModal(): void {
    this.showConfirmDifferenceModal.set(false);
    this.confirmDifferenceDetails.set([]);
    this.pendingSubmitData.set(null);
  }

  confirmDifferenceAndSubmit(): void {
    const pending = this.pendingSubmitData();
    if (!pending || this.saving()) {
      return;
    }

    this.showConfirmDifferenceModal.set(false);
    this.confirmDifferenceDetails.set([]);
    this.pendingSubmitData.set(null);
    this.executeSubmit(pending.solicitudId, pending.payload);
  }

  private executeSubmit(
    solicitudId: number,
    payload: {
      numeroOrdenEgreso: string;
      montoDesembolsoAprobado: number;
      confirmarDiferenciaMonto?: boolean;
      respuestaContabilidad: string;
      observacionesContabilidad?: string;
    },
  ): void {

    this.saving.set(true);
    this.contabilidadService
      .tramitarSolicitudViaticosContabilidad(solicitudId, payload, this.itemSupportFiles())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.successMessage.set(
            'Solicitud tramitada. La gestión fue enviada a la bandeja de Tesorería.',
          );
          setTimeout(() => {
            this.router.navigate(['/tesoreria/bandeja']);
          }, 1200);
        },
        error: (error) => {
          const message =
            error?.error?.message ||
            (typeof error?.error === 'string' ? error.error : '') ||
            'No fue posible tramitar la solicitud de viáticos.';
          this.errorMessage.set(message);
          this.saving.set(false);
        },
      });
  }
}
