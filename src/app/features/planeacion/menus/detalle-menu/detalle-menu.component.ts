import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import {
  TiempoComida, TIEMPOS_COMIDA, MenuCelda, MenuSemanal, MESES,
  CATEGORIAS_DESAYUNO, CATEGORIAS_MERIENDA, CATEGORIAS_ALMUERZO, CATEGORIAS_CENA,
  TODAS_CATEGORIAS, CategoriaMenu
} from '../../models/menu.model';

interface ProductoDisponible {
  id: number;
  nombre: string;
  categoria: string;
  categoriaIcon: string;
  tipo: string;
}

@Component({
  selector: 'app-detalle-menu',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, RouterModule, FormsModule],
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('slideRight', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-30px)' }),
        animate('400ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ opacity: 0, transform: 'translateX(-30px)' }))
      ])
    ]),
    trigger('dropAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8)' }),
        animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('staggerItems', [
      transition(':enter', [
        query('.stagger-item', [
          style({ opacity: 0, transform: 'translateY(10px)' }),
          stagger(30, animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0)' })))
        ], { optional: true })
      ])
    ]),
    trigger('successModal', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ opacity: 0 }))
      ])
    ])
  ],
  templateUrl: './detalle-menu.component.html',
  styleUrl: './detalle-menu.component.scss'
})
export class DetalleMenuComponent implements OnInit {

  // ═══ Data ═══
  tiemposComida = TIEMPOS_COMIDA;
  meses = MESES;
  menuNumeros = [1, 2, 3, 4, 5, 6, 7];

  // ═══ Menu loaded ═══
  menu = signal<MenuSemanal | null>(null);
  menuId = signal<number>(0);
  celdas = signal<MenuCelda[]>([]);

  // ═══ Edit mode ═══
  editMode = signal(false);
  editingCell = signal<string | null>(null);
  editingValue = signal('');
  saving = signal(false);
  showSuccess = signal(false);
  successMessage = signal('');

  // ═══ Drag state (edit mode) ═══
  draggingProduct = signal<ProductoDisponible | null>(null);
  dragOverCell = signal<string | null>(null);
  showProductPanel = signal(false);
  productoSearch = signal('');
  productoFilterCategoria = signal('');
  productosDisponibles = signal<ProductoDisponible[]>([]);

  // ═══ Export state ═══
  showExportMenu = signal(false);
  exporting = signal(false);

  // ═══ Sections ═══
  sections = computed(() => [
    { tiempo: 'DESAYUNO' as TiempoComida, label: 'Desayuno', icon: '🌅', color: '#FFB71B', categorias: CATEGORIAS_DESAYUNO },
    { tiempo: 'MERIENDA' as TiempoComida, label: 'Merienda', icon: '🍪', color: '#f97316', categorias: CATEGORIAS_MERIENDA },
    { tiempo: 'ALMUERZO' as TiempoComida, label: 'Almuerzo', icon: '☀️', color: '#045C94', categorias: CATEGORIAS_ALMUERZO },
    { tiempo: 'CENA' as TiempoComida, label: 'Cena', icon: '🌙', color: '#6B46C1', categorias: CATEGORIAS_CENA },
  ]);

  visibleMenuNumbers = computed(() => {
    const m = this.menu();
    return m ? this.menuNumeros.slice(0, m.cantidadMenus) : [];
  });

  totalCells = computed(() => {
    const m = this.menu();
    return m ? TODAS_CATEGORIAS.length * m.cantidadMenus : 0;
  });

  filledCells = computed(() => this.celdas().filter(c => c.productoNombre.trim()).length);

  completionPercent = computed(() => {
    const total = this.totalCells();
    return total > 0 ? Math.round((this.filledCells() / total) * 100) : 0;
  });

  filteredProducts = computed(() => {
    let prods = this.productosDisponibles();
    const search = this.productoSearch().toLowerCase();
    const cat = this.productoFilterCategoria();
    if (search) prods = prods.filter(p => p.nombre.toLowerCase().includes(search));
    if (cat) prods = prods.filter(p => p.tipo === cat);
    return prods;
  });

  categoriaOptions = [
    { value: 'Proteína', label: 'Proteína', icon: '🥩' },
    { value: 'Acompañamiento', label: 'Acompañamiento', icon: '🍚' },
    { value: 'Bebida', label: 'Bebida', icon: '🥤' },
    { value: 'Fruta', label: 'Fruta', icon: '🍎' },
    { value: 'Sopa', label: 'Sopa', icon: '🍲' },
  ];

  private dragGhostEl: HTMLElement | null = null;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.menuId.set(id);
    this.productosDisponibles.set(this.generateMockProducts());
    this.loadMenu(id);
  }

  // ═══ Load menu data (mock) ═══
  private loadMenu(id: number): void {
    const mockMenus = this.generateMockMenus();
    const found = mockMenus.find(m => m.id === id);
    if (found) {
      this.menu.set(found);
      this.celdas.set([...found.celdas]);
    }
  }

  // ═══ Cell helpers ═══
  getCellValue(categoriaId: string, menuNum: number): string {
    const celda = this.celdas().find(c => c.categoriaId === categoriaId && c.menuNumero === menuNum);
    return celda?.productoNombre || '';
  }

  getCellKey(categoriaId: string, menuNum: number): string {
    return `${categoriaId}-${menuNum}`;
  }

  setCellValue(categoriaId: string, menuNum: number, nombre: string, productoId?: number): void {
    this.celdas.update(celdas => {
      const idx = celdas.findIndex(c => c.categoriaId === categoriaId && c.menuNumero === menuNum);
      if (idx >= 0) {
        const copy = [...celdas];
        copy[idx] = { ...copy[idx], productoNombre: nombre, productoId };
        return copy;
      } else {
        return [...celdas, { categoriaId, menuNumero: menuNum, productoNombre: nombre, productoId }];
      }
    });
  }

  clearCell(categoriaId: string, menuNum: number): void {
    this.celdas.update(c => c.filter(x => !(x.categoriaId === categoriaId && x.menuNumero === menuNum)));
  }

  // ═══ Edit mode ═══
  toggleEditMode(): void {
    this.editMode.update(v => !v);
    if (!this.editMode()) {
      this.showProductPanel.set(false);
      this.editingCell.set(null);
    }
  }

  startEdit(categoriaId: string, menuNum: number): void {
    if (!this.editMode()) return;
    this.editingCell.set(this.getCellKey(categoriaId, menuNum));
    this.editingValue.set(this.getCellValue(categoriaId, menuNum));
  }

  confirmEdit(categoriaId: string, menuNum: number): void {
    const val = this.editingValue().trim();
    if (val) {
      this.setCellValue(categoriaId, menuNum, val);
    } else {
      this.clearCell(categoriaId, menuNum);
    }
    this.editingCell.set(null);
    this.editingValue.set('');
  }

  cancelEdit(): void {
    this.editingCell.set(null);
    this.editingValue.set('');
  }

  isEditing(categoriaId: string, menuNum: number): boolean {
    return this.editingCell() === this.getCellKey(categoriaId, menuNum);
  }

  // ═══ Drag & Drop (edit mode) ═══
  onDragStart(event: DragEvent, product: ProductoDisponible): void {
    this.draggingProduct.set(product);
    const ghost = document.createElement('div');
    ghost.innerHTML = `<span>${product.categoriaIcon}</span><span>${product.nombre}</span>`;
    ghost.style.cssText = `
      position: fixed; top: -200px; left: -200px; z-index: 99999;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; border-radius: 12px;
      background: linear-gradient(135deg, #045C94, #0369a1);
      color: white; font-size: 13px; font-weight: 700;
      box-shadow: 0 12px 32px rgba(4,92,148,0.4), 0 4px 12px rgba(0,0,0,0.15);
      border: 2px solid rgba(255,255,255,0.25);
      pointer-events: none; white-space: nowrap; font-family: inherit;
    `;
    document.body.appendChild(ghost);
    this.dragGhostEl = ghost;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', product.nombre);
      event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    }
  }

  onDragEnd(): void {
    this.draggingProduct.set(null);
    this.dragOverCell.set(null);
    if (this.dragGhostEl) { this.dragGhostEl.remove(); this.dragGhostEl = null; }
  }

  onDragOver(event: DragEvent, categoriaId: string, menuNum: number): void {
    if (!this.editMode()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragOverCell.set(this.getCellKey(categoriaId, menuNum));
  }

  onDragLeave(categoriaId: string, menuNum: number): void {
    if (this.dragOverCell() === this.getCellKey(categoriaId, menuNum)) {
      this.dragOverCell.set(null);
    }
  }

  onDrop(event: DragEvent, categoriaId: string, menuNum: number): void {
    if (!this.editMode()) return;
    event.preventDefault();
    const prod = this.draggingProduct();
    if (prod) this.setCellValue(categoriaId, menuNum, prod.nombre, prod.id);
    this.draggingProduct.set(null);
    this.dragOverCell.set(null);
  }

  // ═══ Save ═══
  saveChanges(): void {
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.editMode.set(false);
      this.showProductPanel.set(false);
      this.successMessage.set('Los cambios se han guardado correctamente.');
      this.showSuccess.set(true);
    }, 1500);
  }

  closeSuccess(): void {
    this.showSuccess.set(false);
  }

  // ═══ Export ═══
  toggleExportMenu(): void {
    this.showExportMenu.update(v => !v);
  }

  closeExportMenu(): void {
    this.showExportMenu.set(false);
  }

  exportCSV(): void {
    this.showExportMenu.set(false);
    const menu = this.menu();
    if (!menu) return;

    const headers = ['Tiempo', 'Categoría', ...this.visibleMenuNumbers().map(n => `Menú ${n}`)];
    const rows: string[][] = [];

    for (const section of this.sections()) {
      for (const cat of section.categorias) {
        const row = [section.label, cat.nombre];
        for (const num of this.visibleMenuNumbers()) {
          row.push(this.getCellValue(cat.id, num));
        }
        rows.push(row);
      }
    }

    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const BOM = '\uFEFF';
    this.downloadFile(BOM + csvContent, `${menu.nombre}.csv`, 'text/csv;charset=utf-8');
  }

  exportExcel(): void {
    this.showExportMenu.set(false);
    const menu = this.menu();
    if (!menu) return;

    const colCount = 2 + this.visibleMenuNumbers().length;
    const menuHeaders = this.visibleMenuNumbers().map(n => `<th>Menú ${n}</th>`).join('');

    // Section colors for Excel
    const sectionColors: Record<string, { bg: string; text: string; border: string }> = {
      'DESAYUNO': { bg: '#FFF8E1', text: '#E65100', border: '#FFB71B' },
      'MERIENDA': { bg: '#FFF3E0', text: '#BF360C', border: '#f97316' },
      'ALMUERZO': { bg: '#E3F2FD', text: '#01579B', border: '#045C94' },
      'CENA': { bg: '#EDE7F6', text: '#4A148C', border: '#6B46C1' },
    };

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8">
    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
    <x:Name>${menu.nombre}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    <style>
      table { border-collapse: collapse; font-family: Calibri, sans-serif; font-size: 11pt; width: 100%; }
      .title-row td { font-size: 18pt; font-weight: bold; color: #045C94; padding: 12px 8px 4px; border: none; }
      .subtitle-row td { font-size: 10pt; color: #666; padding: 2px 8px 12px; border: none; }
      .spacer td { height: 8px; border: none; }
      th { background: #213053; color: white; padding: 10px 12px; text-align: center; font-weight: bold; font-size: 11pt; border: 1px solid #1a2540; }
      th.th-tiempo { text-align: center; width: 100px; }
      th.th-cat { text-align: left; width: 150px; }
      td { padding: 8px 10px; border: 1px solid #ddd; text-align: center; font-size: 10pt; vertical-align: middle; }
      .section-row td { font-weight: bold; font-size: 12pt; text-align: center; padding: 10px; letter-spacing: 2px; }
      .cat-label { text-align: left; font-weight: 600; background: #fafbff; color: #213053; }
      .tiempo-cell { font-weight: 700; text-align: center; vertical-align: middle; }
      .empty-cell { color: #ccc; }
      .stats-row td { background: #f8faff; border: 1px solid #e0e5ee; }
      .stats-label { text-align: right; font-weight: 600; color: #666; font-size: 9pt; }
      .stats-value { text-align: left; font-weight: 700; color: #213053; font-size: 10pt; }
    </style></head><body>
    <table>
      <tr class="title-row"><td colspan="${colCount}">📋 ${menu.nombre}</td></tr>
      <tr class="subtitle-row"><td colspan="${colCount}">${menu.mes} ${menu.anio} — ${menu.cantidadMenus} menús — Completado: ${this.completionPercent()}% — Estado: ${menu.estado}</td></tr>
      <tr class="spacer"><td colspan="${colCount}"></td></tr>
      <tr><th class="th-tiempo">Tiempo</th><th class="th-cat">Categoría</th>${menuHeaders}</tr>`;

    for (const section of this.sections()) {
      const sc = sectionColors[section.tiempo] || { bg: '#f0f4ff', text: '#213053', border: '#045C94' };
      html += `<tr class="section-row"><td colspan="${colCount}" style="background:${sc.bg}; color:${sc.text}; border-bottom: 3px solid ${sc.border};">${section.icon} ${section.label.toUpperCase()}</td></tr>`;

      for (let i = 0; i < section.categorias.length; i++) {
        const cat = section.categorias[i];
        html += '<tr>';
        if (i === 0) {
          html += `<td class="tiempo-cell" rowspan="${section.categorias.length}" style="background:${sc.bg}; color:${sc.text}; border-left: 3px solid ${sc.border};">${section.label}</td>`;
        }
        html += `<td class="cat-label">${cat.nombre}</td>`;
        for (const num of this.visibleMenuNumbers()) {
          const val = this.getCellValue(cat.id, num);
          html += val ? `<td>${val}</td>` : '<td class="empty-cell">—</td>';
        }
        html += '</tr>';
      }
    }

    html += `<tr class="spacer"><td colspan="${colCount}"></td></tr>
    <tr class="stats-row"><td class="stats-label" colspan="2">Celdas completadas:</td><td class="stats-value" colspan="${colCount - 2}">${this.filledCells()} / ${this.totalCells()} (${this.completionPercent()}%)</td></tr>
    <tr class="stats-row"><td class="stats-label" colspan="2">Creado por:</td><td class="stats-value" colspan="${colCount - 2}">${menu.creadoPor || '—'}</td></tr>
    <tr class="stats-row"><td class="stats-label" colspan="2">Fecha:</td><td class="stats-value" colspan="${colCount - 2}">${menu.fechaCreacion ? new Date(menu.fechaCreacion).toLocaleDateString('es-CO') : '—'}</td></tr>
    </table></body></html>`;

    const BOM = '\uFEFF';
    this.downloadFile(BOM + html, `${menu.nombre}.xls`, 'application/vnd.ms-excel;charset=utf-8');
  }

  exportPDF(): void {
    this.showExportMenu.set(false);
    const menu = this.menu();
    if (!menu) return;

    const colCount = 2 + this.visibleMenuNumbers().length;
    const menuHeaders = this.visibleMenuNumbers().map(n => `<th>Menú ${n}</th>`).join('');

    const sectionColors: Record<string, { bg: string; text: string; border: string; light: string }> = {
      'DESAYUNO': { bg: '#FFF8E1', text: '#E65100', border: '#FFB71B', light: '#FFF3E0' },
      'MERIENDA': { bg: '#FFF3E0', text: '#BF360C', border: '#f97316', light: '#FFE0B2' },
      'ALMUERZO': { bg: '#E3F2FD', text: '#01579B', border: '#045C94', light: '#BBDEFB' },
      'CENA': { bg: '#EDE7F6', text: '#4A148C', border: '#6B46C1', light: '#D1C4E9' },
    };

    let bodyRows = '';
    for (const section of this.sections()) {
      const sc = sectionColors[section.tiempo] || { bg: '#f0f4ff', text: '#213053', border: '#045C94', light: '#e8efff' };
      bodyRows += `<tr class="section-row"><td colspan="${colCount}" style="background:${sc.bg}; color:${sc.text}; border-bottom: 3px solid ${sc.border}; border-left: 4px solid ${sc.border};">${section.icon} ${section.label.toUpperCase()}</td></tr>`;

      for (let i = 0; i < section.categorias.length; i++) {
        const cat = section.categorias[i];
        bodyRows += '<tr class="cat-row">';
        if (i === 0) {
          bodyRows += `<td class="tiempo-cell" rowspan="${section.categorias.length}" style="background:${sc.bg}; color:${sc.text}; border-left: 4px solid ${sc.border}; font-weight: 800;">${section.label}</td>`;
        }
        bodyRows += `<td class="cat-label">${cat.nombre}</td>`;
        for (const num of this.visibleMenuNumbers()) {
          const val = this.getCellValue(cat.id, num);
          bodyRows += val ? `<td>${val}</td>` : '<td class="empty">—</td>';
        }
        bodyRows += '</tr>';
      }
    }

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${menu.nombre}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; padding: 24px 20px; background: white; color: #213053; }

      /* Header */
      .header { text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #045C94; }
      .header h1 { font-size: 24px; font-weight: 900; color: #045C94; letter-spacing: -0.5px; }
      .header .subtitle { font-size: 13px; color: #666; margin-top: 4px; font-weight: 500; }

      /* Meta cards */
      .meta { display: flex; justify-content: center; gap: 24px; margin: 16px 0 20px; padding: 12px 0; }
      .meta-item { text-align: center; padding: 8px 16px; border-radius: 8px; background: #f8faff; border: 1px solid #e0e5ee; }
      .meta-item .label { font-size: 8px; text-transform: uppercase; color: #999; font-weight: 800; letter-spacing: 1px; display: block; margin-bottom: 2px; }
      .meta-item .value { font-size: 15px; font-weight: 800; color: #213053; }
      .meta-item .value.accent { color: #045C94; }

      /* Table */
      table { width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #d0d5dd; border-radius: 4px; overflow: hidden; }
      thead th { background: #213053; color: white; padding: 10px 8px; text-align: center; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #1a2540; }
      thead th.th-tiempo { width: 80px; text-align: center; }
      thead th.th-cat { width: 130px; text-align: left; }

      /* Section rows */
      .section-row td { font-weight: 800; font-size: 12px; text-align: center; padding: 8px; letter-spacing: 3px; text-transform: uppercase; }

      /* Data rows */
      .cat-row td { padding: 6px 8px; border-bottom: 1px solid #e8ecf0; font-size: 9px; vertical-align: middle; }
      .cat-row:hover td { background: rgba(4, 92, 148, 0.02); }
      .cat-label { text-align: left !important; font-weight: 700; color: #213053; background: #fafbff; border-right: 2px solid #e0e5ee; }
      .tiempo-cell { text-align: center; vertical-align: middle; font-size: 10px; }
      .cat-row td:not(.cat-label):not(.tiempo-cell) { text-align: center; font-size: 9px; color: #333; }
      .empty { color: #ccc; font-size: 8px; }

      /* Footer */
      .footer { margin-top: 24px; text-align: center; font-size: 8px; color: #aaa; border-top: 1px solid #e8ecf0; padding-top: 12px; }
      .footer strong { color: #666; }

      @media print {
        body { padding: 10px; }
        table { font-size: 8px; }
        .meta-item { padding: 4px 10px; }
        .header h1 { font-size: 20px; }
      }
      @page { size: landscape; margin: 10mm; }
    </style>
    </head><body>
    <div class="header">
      <h1>📋 ${menu.nombre}</h1>
      <div class="subtitle">${menu.mes} ${menu.anio} — Programación mensual de menús</div>
    </div>
    <div class="meta">
      <div class="meta-item"><span class="label">Menús</span><span class="value">${menu.cantidadMenus}</span></div>
      <div class="meta-item"><span class="label">Estado</span><span class="value">${menu.estado}</span></div>
      <div class="meta-item"><span class="label">Completado</span><span class="value accent">${this.completionPercent()}%</span></div>
      <div class="meta-item"><span class="label">Celdas</span><span class="value">${this.filledCells()} / ${this.totalCells()}</span></div>
      <div class="meta-item"><span class="label">Creado</span><span class="value">${menu.fechaCreacion ? new Date(menu.fechaCreacion).toLocaleDateString('es-CO') : '—'}</span></div>
    </div>
    <table>
      <thead><tr><th class="th-tiempo">Tiempo</th><th class="th-cat">Categoría</th>${menuHeaders}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="footer">Generado el <strong>${new Date().toLocaleDateString('es-CO')}</strong> — Sistema de Planeación de Menús — Tesorería</div>
    </body></html>`;

    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (printWindow) {
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); }, 600);
    }
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ═══ Navigation ═══
  goBack(): void {
    this.router.navigate(['/planeacion/menus/listado']);
  }

  getTiempoColor(tiempo: TiempoComida): string {
    return this.tiemposComida.find(t => t.value === tiempo)?.color || '#045C94';
  }

  getEstadoClass(estado: string): string {
    switch (estado) {
      case 'BORRADOR': return 'bg-amber-100 text-amber-700';
      case 'PUBLICADO': return 'bg-emerald-100 text-emerald-700';
      case 'ARCHIVADO': return 'bg-gray-100 text-gray-500';
      default: return '';
    }
  }

  getEstadoDot(estado: string): string {
    switch (estado) {
      case 'BORRADOR': return 'bg-amber-400';
      case 'PUBLICADO': return 'bg-emerald-500';
      case 'ARCHIVADO': return 'bg-gray-400';
      default: return '';
    }
  }

  getEstadoLabel(estado: string): string {
    switch (estado) {
      case 'BORRADOR': return 'Borrador';
      case 'PUBLICADO': return 'Publicado';
      case 'ARCHIVADO': return 'Archivado';
      default: return estado;
    }
  }

  // ═══ Mock data ═══
  private generateMockMenus(): MenuSemanal[] {
    const allCats = TODAS_CATEGORIAS;
    const statuses: MenuSemanal['estado'][] = ['PUBLICADO', 'PUBLICADO', 'PUBLICADO', 'BORRADOR', 'ARCHIVADO', 'PUBLICADO', 'BORRADOR', 'PUBLICADO', 'ARCHIVADO', 'PUBLICADO', 'BORRADOR', 'PUBLICADO'];
    const productNames = [
      'Huevo revuelto', 'Arepa de huevo', 'Salchicha', 'Huevo cocido x2', 'Arepa de queso',
      'Arroz calentado', 'Arroz Blanco', 'Arroz con espinaca', 'Lentejas guisadas', 'Frijol rojo',
      'Café con leche', 'Jugo fruta', 'Avena fría', 'Chocolate', 'Limonada de panela',
      'Fruta de Temporada', 'Pollo broaster', 'Carne en salsa de ajo', 'Cerdo al horno', 'Arroz de Ajo',
      'Garbanzo', 'Pure de ñame', 'Platano maduro', 'Ensalada mixta', 'Tajada de plátano maduro',
      'Cerdo BBQ', 'Pollo al horno', 'Carne molida', 'Stroganoff de cerdo', 'Hamburguesa',
      'Arroz al curry', 'Arroz de cebolla', 'Papa casco en finas hierbas', 'Moneditas de papa',
      'Tinto', 'Chocolate frío', 'Avena bolsita', 'Agua Panela', 'Pan mogolla', 'Galleta',
      'Bollo', 'Yuca cocida', 'Ensalada de papa', 'Patacón guineo verde',
      'Sandwich tajado de jamón y queso', 'Cerdo asado', 'Panza guisada', 'Arroz con pollo',
      'Pollo con verduras', 'Pastas - Carne desmechada'
    ];

    return this.meses.map((mes, i) => {
      const cantMenus = 7;
      const celdas: MenuCelda[] = [];
      // Fill cells realistically
      for (const cat of allCats) {
        for (let num = 1; num <= cantMenus; num++) {
          // ~85% fill rate
          if (Math.random() > 0.15) {
            celdas.push({
              categoriaId: cat.id,
              menuNumero: num,
              productoNombre: productNames[Math.floor(Math.random() * productNames.length)]
            });
          }
        }
      }
      return {
        id: i + 1,
        nombre: `Menú ${mes.label} 2025`,
        mes: mes.label,
        anio: 2025,
        mesNumero: mes.value,
        cantidadMenus: cantMenus,
        celdas,
        estado: statuses[i] || 'BORRADOR',
        fechaCreacion: new Date(2025, i, Math.floor(Math.random() * 28) + 1).toISOString(),
        creadoPor: 'admin',
        costoEstimado: Math.floor(Math.random() * 5000000) + 2000000
      };
    });
  }

  private generateMockProducts(): ProductoDisponible[] {
    return [
      { id: 1, nombre: 'Huevo revuelto', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 2, nombre: 'Arepa de huevo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 3, nombre: 'Salchicha', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 4, nombre: 'Huevo cocido x2', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 5, nombre: 'Arepa de queso', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 8, nombre: 'Pollo broaster', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 9, nombre: 'Carne en salsa de ajo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 10, nombre: 'Cerdo al horno', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 14, nombre: 'Cerdo BBQ', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 15, nombre: 'Pollo al horno', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 16, nombre: 'Carne molida', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 19, nombre: 'Hamburguesa', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 20, nombre: 'Pastas - Carne desmechada', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 31, nombre: 'Arroz Blanco', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 32, nombre: 'Arroz con espinaca', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 33, nombre: 'Arroz de Ajo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 36, nombre: 'Lentejas guisadas', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 37, nombre: 'Frijol rojo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 38, nombre: 'Garbanzo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 40, nombre: 'Platano maduro', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 43, nombre: 'Ensalada mixta', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 45, nombre: 'Tajada de plátano maduro', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 47, nombre: 'Yuca cocida', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 55, nombre: 'Bollo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 70, nombre: 'Café con leche', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 71, nombre: 'Jugo fruta', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 72, nombre: 'Avena fría', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 73, nombre: 'Chocolate', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 74, nombre: 'Tinto', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 80, nombre: 'Agua Panela', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 81, nombre: 'Limonada de panela', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 90, nombre: 'Fruta de Temporada', categoria: 'REFRIGERIOS', categoriaIcon: '🥪', tipo: 'Fruta' },
    ];
  }
}
