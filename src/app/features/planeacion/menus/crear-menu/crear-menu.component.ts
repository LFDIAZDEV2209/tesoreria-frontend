import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import {
  TiempoComida, TIEMPOS_COMIDA, CategoriaMenu, MenuCelda, MenuSemanal, MESES,
  CATEGORIAS_DESAYUNO, CATEGORIAS_MERIENDA, CATEGORIAS_ALMUERZO, CATEGORIAS_CENA
} from '../../models/menu.model';
import { Producto, CATEGORIAS_PRODUCTO } from '../../models/producto.model';

interface ProductoDisponible {
  id: number;
  nombre: string;
  categoria: string;
  categoriaIcon: string;
  tipo: string;
}

@Component({
  selector: 'app-crear-menu',
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
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, height: 0, overflow: 'hidden' }),
        animate('300ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, height: '*' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, height: 0, overflow: 'hidden' }))
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
  templateUrl: './crear-menu.component.html',
  styleUrl: './crear-menu.component.scss'
})
export class CrearMenuComponent implements OnInit {

  // ═══ Data ═══
  tiemposComida = TIEMPOS_COMIDA;
  meses = MESES;
  menuNumeros = [1, 2, 3, 4, 5, 6, 7];

  // ═══ Menu state ═══
  menuNombre = signal('');
  selectedMes = signal(new Date().getMonth() + 1);
  selectedAnio = signal(new Date().getFullYear());
  cantidadMenus = signal(7);
  celdas = signal<MenuCelda[]>([]);

  // ═══ Products panel ═══
  productosDisponibles = signal<ProductoDisponible[]>([]);
  productoSearch = signal('');
  productoFilterCategoria = signal('');
  showProductPanel = signal(true);

  // ═══ Drag state ═══
  draggingProduct = signal<ProductoDisponible | null>(null);
  dragOverCell = signal<string | null>(null); // "categoriaId-menuNumero"

  // ═══ UI State ═══
  showSuccess = signal(false);
  saving = signal(false);
  editingCell = signal<string | null>(null);
  editingValue = signal('');

  // ═══ Sections config ═══
  sections = computed(() => [
    { tiempo: 'DESAYUNO' as TiempoComida, label: 'Desayuno', icon: '🌅', color: '#FFB71B', categorias: CATEGORIAS_DESAYUNO },
    { tiempo: 'MERIENDA' as TiempoComida, label: 'Merienda', icon: '🍪', color: '#f97316', categorias: CATEGORIAS_MERIENDA },
    { tiempo: 'ALMUERZO' as TiempoComida, label: 'Almuerzo', icon: '☀️', color: '#045C94', categorias: CATEGORIAS_ALMUERZO },
    { tiempo: 'CENA' as TiempoComida, label: 'Cena', icon: '🌙', color: '#6B46C1', categorias: CATEGORIAS_CENA },
  ]);

  // ═══ Filtered products ═══
  filteredProducts = computed(() => {
    let prods = this.productosDisponibles();
    const search = this.productoSearch().toLowerCase();
    const cat = this.productoFilterCategoria();
    if (search) {
      prods = prods.filter(p => p.nombre.toLowerCase().includes(search));
    }
    if (cat) {
      prods = prods.filter(p => p.categoria === cat);
    }
    return prods;
  });

  // ═══ Menu completeness ═══
  totalCells = computed(() => {
    const cats = [...CATEGORIAS_DESAYUNO, ...CATEGORIAS_MERIENDA, ...CATEGORIAS_ALMUERZO, ...CATEGORIAS_CENA];
    return cats.length * this.cantidadMenus();
  });

  filledCells = computed(() => this.celdas().filter(c => c.productoNombre.trim()).length);

  completionPercent = computed(() => {
    const total = this.totalCells();
    return total > 0 ? Math.round((this.filledCells() / total) * 100) : 0;
  });

  mesLabel = computed(() => {
    const m = this.meses.find(x => x.value === this.selectedMes());
    return m ? m.label : '';
  });

  visibleMenuNumbers = computed(() =>
    this.menuNumeros.slice(0, this.cantidadMenus())
  );

  categoriaOptions = CATEGORIAS_PRODUCTO;

  ngOnInit(): void {
    this.productosDisponibles.set(this.generateMockProducts());
  }

  // ═══ Cell value helpers ═══
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
    this.celdas.update(celdas => celdas.filter(c => !(c.categoriaId === categoriaId && c.menuNumero === menuNum)));
  }

  // ═══ Drag & Drop ═══
  private dragGhostEl: HTMLElement | null = null;

  onDragStart(event: DragEvent, product: ProductoDisponible): void {
    this.draggingProduct.set(product);

    // Create custom opaque drag ghost
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost-custom';
    ghost.innerHTML = `<span class="drag-ghost-icon">${product.categoriaIcon}</span><span class="drag-ghost-text">${product.nombre}</span>`;
    ghost.style.cssText = `
      position: fixed; top: -200px; left: -200px; z-index: 99999;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; border-radius: 12px;
      background: linear-gradient(135deg, #045C94, #0369a1);
      color: white; font-size: 13px; font-weight: 700;
      box-shadow: 0 12px 32px rgba(4,92,148,0.4), 0 4px 12px rgba(0,0,0,0.15);
      border: 2px solid rgba(255,255,255,0.25);
      pointer-events: none; white-space: nowrap;
      font-family: inherit;
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
    // Remove custom ghost element
    if (this.dragGhostEl) {
      this.dragGhostEl.remove();
      this.dragGhostEl = null;
    }
  }

  onDragOver(event: DragEvent, categoriaId: string, menuNum: number): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.dragOverCell.set(this.getCellKey(categoriaId, menuNum));
  }

  onDragLeave(categoriaId: string, menuNum: number): void {
    if (this.dragOverCell() === this.getCellKey(categoriaId, menuNum)) {
      this.dragOverCell.set(null);
    }
  }

  onDrop(event: DragEvent, categoriaId: string, menuNum: number): void {
    event.preventDefault();
    const prod = this.draggingProduct();
    if (prod) {
      this.setCellValue(categoriaId, menuNum, prod.nombre, prod.id);
    }
    this.draggingProduct.set(null);
    this.dragOverCell.set(null);
  }

  // ═══ Inline edit ═══
  startEdit(categoriaId: string, menuNum: number): void {
    const key = this.getCellKey(categoriaId, menuNum);
    this.editingCell.set(key);
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

  // ═══ Save ═══
  saveMenu(): void {
    this.saving.set(true);
    const menu: MenuSemanal = {
      nombre: this.menuNombre() || `Menú ${this.mesLabel()} ${this.selectedAnio()}`,
      mes: this.mesLabel(),
      anio: this.selectedAnio(),
      mesNumero: this.selectedMes(),
      cantidadMenus: this.cantidadMenus(),
      celdas: this.celdas(),
      estado: 'BORRADOR',
      fechaCreacion: new Date().toISOString(),
      creadoPor: 'admin'
    };
    console.log('Menu guardado:', menu);
    setTimeout(() => {
      this.saving.set(false);
      this.showSuccess.set(true);
    }, 1500);
  }

  closeSuccess(): void {
    this.showSuccess.set(false);
  }

  // ═══ Utility ═══
  clearAllCells(): void {
    this.celdas.set([]);
  }

  getTiempoColor(tiempo: TiempoComida): string {
    return this.tiemposComida.find(t => t.value === tiempo)?.color || '#045C94';
  }

  // ═══ Mock Products ═══
  private generateMockProducts(): ProductoDisponible[] {
    return [
      // Proteínas
      { id: 1, nombre: 'Huevo revuelto', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 2, nombre: 'Arepa de huevo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 3, nombre: 'Salchicha', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 4, nombre: 'Huevo cocido x2', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 5, nombre: 'Salchichón ahogao\'', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 6, nombre: 'Sandwich tajado de jamón y queso', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 7, nombre: 'Arepa de queso', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 8, nombre: 'Pollo broaster', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 9, nombre: 'Carne en salsa de ajo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 10, nombre: 'Cerdo al horno', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 11, nombre: 'Cerdo asado', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 12, nombre: 'Panza guisada', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 13, nombre: 'Arroz con pollo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 14, nombre: 'Cerdo BBQ', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 15, nombre: 'Pollo al horno', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 16, nombre: 'Carne molida', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 17, nombre: 'Pollo con verduras', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 18, nombre: 'Stroganoff de cerdo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 19, nombre: 'Hamburguesa', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      { id: 20, nombre: 'Pastas - Carne desmechada', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Proteína' },
      // Acompañamientos
      { id: 30, nombre: 'Arroz calentado', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 31, nombre: 'Arroz Blanco', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 32, nombre: 'Arroz con espinaca', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 33, nombre: 'Arroz de Ajo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 34, nombre: 'Arroz al curry', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 35, nombre: 'Arroz de cebolla', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 36, nombre: 'Lentejas guisadas', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 37, nombre: 'Frijol rojo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 38, nombre: 'Garbanzo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 39, nombre: 'Pure de ñame', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 40, nombre: 'Platano maduro', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 41, nombre: 'Moneditas de papa', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 42, nombre: 'Papa casco en finas hierbas', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 43, nombre: 'Ensalada mixta', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 44, nombre: 'Ensalada tropical', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 45, nombre: 'Tajada de plátano maduro', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 46, nombre: '2 tajadas de pan tajado', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 47, nombre: 'Yuca cocida', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 48, nombre: 'Ensalada de papa', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 49, nombre: 'Palomitos', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 50, nombre: 'Papa chips', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 51, nombre: 'Patacón guineo verde', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 52, nombre: 'Ají picante', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 53, nombre: 'Cayeye con ahogao\'', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 54, nombre: 'Calentado de lentejas', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 55, nombre: 'Bollo', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Acompañamiento' },
      { id: 56, nombre: 'Pan mogolla', categoria: 'REFRIGERIOS', categoriaIcon: '🥪', tipo: 'Acompañamiento' },
      { id: 57, nombre: 'Galleta', categoria: 'REFRIGERIOS', categoriaIcon: '🥪', tipo: 'Acompañamiento' },
      { id: 58, nombre: 'Empanada mini', categoria: 'REFRIGERIOS', categoriaIcon: '🥪', tipo: 'Acompañamiento' },
      { id: 59, nombre: 'SNACK', categoria: 'REFRIGERIOS', categoriaIcon: '🥪', tipo: 'Acompañamiento' },
      // Bebidas
      { id: 70, nombre: 'Café con leche', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 71, nombre: 'Jugo fruta', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 72, nombre: 'Avena fría', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 73, nombre: 'Chocolate', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 74, nombre: 'Tinto', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 75, nombre: 'Chocolate frío', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 76, nombre: 'Jugo de botella', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 77, nombre: 'Avena bolsita', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 78, nombre: 'Leche saborizada', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 79, nombre: 'Jugo de fruta', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 80, nombre: 'Agua Panela', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      { id: 81, nombre: 'Limonada de panela', categoria: 'BEBIDAS', categoriaIcon: '🥤', tipo: 'Bebida' },
      // Frutas
      { id: 90, nombre: 'Fruta de Temporada', categoria: 'REFRIGERIOS', categoriaIcon: '🥪', tipo: 'Fruta' },
      { id: 91, nombre: 'Fruta de temporada', categoria: 'REFRIGERIOS', categoriaIcon: '🥪', tipo: 'Fruta' },
      // Sopas
      { id: 100, nombre: 'Sopa trifásica (Res, pollo, cerdo)', categoria: 'ALIMENTOS_PREPARADOS', categoriaIcon: '🍽️', tipo: 'Sopa' },
    ];
  }
}
