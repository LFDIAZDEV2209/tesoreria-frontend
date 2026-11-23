import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import {
  Producto, CategoriaProducto, CATEGORIAS_PRODUCTO, TipoProducto, TIPOS_PRODUCTO,
  RESTRICCIONES, RestriccionAlimentaria, ModalidadServicio
} from '../../models/producto.model';

type SortField = 'codigo' | 'nombre' | 'categoria' | 'precioVenta' | 'costoUnitario' | 'estado' | 'fechaCreacion';
type SortDirection = 'asc' | 'desc';

interface TableFilter {
  search: string;
  categoria: CategoriaProducto | '';
  tipoProducto: TipoProducto | '';
  estado: 'ACTIVO' | 'INACTIVO' | '';
}

@Component({
  selector: 'app-listado-productos',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, RouterModule, FormsModule],
  animations: [
    trigger('fadeSlideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('500ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('staggerRows', [
      transition(':enter', [
        query('.table-row-anim', [
          style({ opacity: 0, transform: 'translateX(-20px)' }),
          stagger(40, animate('350ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateX(0)' })))
        ], { optional: true })
      ])
    ]),
    trigger('cardPop', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.9)' }),
        animate('400ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'scale(1)' }))
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
    trigger('detailPanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(30px)' }),
        animate('350ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateX(30px)' }))
      ])
    ])
  ],
  templateUrl: './listado-productos.component.html',
  styleUrl: './listado-productos.component.scss'
})
export class ListadoProductosComponent implements OnInit {

  // ═══ Data ═══
  productos = signal<Producto[]>([]);
  categorias = CATEGORIAS_PRODUCTO;
  tiposProducto = TIPOS_PRODUCTO;
  restricciones = RESTRICCIONES;

  // ═══ Filters ═══
  filters = signal<TableFilter>({
    search: '',
    categoria: '',
    tipoProducto: '',
    estado: ''
  });
  showFilters = signal(false);

  // ═══ Sorting ═══
  sortField = signal<SortField>('codigo');
  sortDirection = signal<SortDirection>('asc');

  // ═══ Pagination ═══
  currentPage = signal(1);
  pageSize = signal(10);
  pageSizeOptions = [5, 10, 20, 50];

  // ═══ View mode ═══
  viewMode = signal<'table' | 'grid'>('table');

  // ═══ Detail panel ═══
  selectedProduct = signal<Producto | null>(null);

  // ═══ Computed ═══
  filteredProducts = computed(() => {
    let data = [...this.productos()];
    const f = this.filters();

    // Search
    if (f.search) {
      const q = f.search.toLowerCase();
      data = data.filter(p =>
        p.identificacion.codigo.toLowerCase().includes(q) ||
        p.identificacion.nombre.toLowerCase().includes(q) ||
        p.identificacion.descripcionCorta.toLowerCase().includes(q)
      );
    }

    // Category
    if (f.categoria) {
      data = data.filter(p => p.identificacion.categoria === f.categoria);
    }

    // Type
    if (f.tipoProducto) {
      data = data.filter(p => p.especificaciones.tipoProducto === f.tipoProducto);
    }

    // Estado
    if (f.estado) {
      data = data.filter(p => p.identificacion.estado === f.estado);
    }

    // Sort
    const field = this.sortField();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      let valA: any, valB: any;
      switch (field) {
        case 'codigo': valA = a.identificacion.codigo; valB = b.identificacion.codigo; break;
        case 'nombre': valA = a.identificacion.nombre; valB = b.identificacion.nombre; break;
        case 'categoria': valA = a.identificacion.categoria; valB = b.identificacion.categoria; break;
        case 'precioVenta': valA = a.precios.precioVenta; valB = b.precios.precioVenta; break;
        case 'costoUnitario': valA = a.costos.costoUnitario; valB = b.costos.costoUnitario; break;
        case 'estado': valA = a.identificacion.estado; valB = b.identificacion.estado; break;
        case 'fechaCreacion': valA = a.fechaCreacion || ''; valB = b.fechaCreacion || ''; break;
        default: valA = ''; valB = '';
      }
      if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
      return (valA - valB) * dir;
    });

    return data;
  });

  totalItems = computed(() => this.filteredProducts().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));

  paginatedProducts = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredProducts().slice(start, start + this.pageSize());
  });

  visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;

    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  // ═══ Stats ═══
  statsActivos = computed(() => this.productos().filter(p => p.identificacion.estado === 'ACTIVO').length);
  statsInactivos = computed(() => this.productos().filter(p => p.identificacion.estado === 'INACTIVO').length);
  statsCategorias = computed(() => new Set(this.productos().map(p => p.identificacion.categoria)).size);
  statsPromedioVenta = computed(() => {
    const prods = this.productos();
    if (prods.length === 0) return 0;
    return prods.reduce((sum, p) => sum + p.precios.precioVenta, 0) / prods.length;
  });

  ngOnInit(): void {
    this.productos.set(this.generateMockProducts());
  }

  // ═══ Actions ═══
  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  updateFilter(key: keyof TableFilter, value: string): void {
    this.filters.update(f => ({ ...f, [key]: value }));
    this.currentPage.set(1);
  }

  clearFilters(): void {
    this.filters.set({ search: '', categoria: '', tipoProducto: '', estado: '' });
    this.currentPage.set(1);
  }

  hasActiveFilters(): boolean {
    const f = this.filters();
    return !!(f.search || f.categoria || f.tipoProducto || f.estado);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  selectProduct(product: Producto): void {
    this.selectedProduct.set(
      this.selectedProduct()?.identificacion.codigo === product.identificacion.codigo ? null : product
    );
  }

  getCategoriaLabel(cat: CategoriaProducto): string {
    return this.categorias.find(c => c.value === cat)?.label || cat;
  }

  getCategoriaIcon(cat: CategoriaProducto): string {
    return this.categorias.find(c => c.value === cat)?.icon || '📋';
  }

  getTipoIcon(tipo: TipoProducto): string {
    return this.tiposProducto.find(t => t.value === tipo)?.icon || '📋';
  }

  getTipoLabel(tipo: TipoProducto): string {
    return this.tiposProducto.find(t => t.value === tipo)?.label || tipo;
  }

  getRestriccionLabel(r: RestriccionAlimentaria): string {
    return this.restricciones.find(x => x.value === r)?.label || r;
  }

  getModalidadLabel(m: ModalidadServicio): string {
    const labels: Record<string, string> = { 'PARA_LLEVAR': 'Para Llevar', 'CONSUMO_EN_SITIO': 'En Sitio', 'CATERING': 'Catering' };
    return labels[m] || m;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  getMargin(p: Producto): string {
    if (p.costos.costoUnitario > 0) {
      return ((p.precios.precioVenta - p.costos.costoUnitario) / p.costos.costoUnitario * 100).toFixed(1);
    }
    return '—';
  }

  // ═══ Mock Data Generator ═══
  private generateMockProducts(): Producto[] {
    const products: Producto[] = [
      this.mockProduct('PRD-001', 'Arroz con Pollo Especial', 'Arroz con pollo tradicional colombiano con verduras de temporada', 'ALIMENTOS_PREPARADOS', 'PLATO', 8500, 15000, 'ACTIVO', ['CONSUMO_EN_SITIO', 'PARA_LLEVAR'], 450, ['Fit'], [], ['Apio']),
      this.mockProduct('PRD-002', 'Jugo Natural de Naranja', 'Jugo fresco de naranja sin azúcar añadida, 100% natural', 'BEBIDAS', 'BEBIDA', 2500, 5500, 'ACTIVO', ['PARA_LLEVAR', 'CONSUMO_EN_SITIO'], 120, ['Light', 'Sin Azúcar'], [], []),
      this.mockProduct('PRD-003', 'Combo Ejecutivo Premium', 'Plato fuerte + bebida + postre del día, opción premium', 'COMBOS', 'COMBO', 14000, 25000, 'ACTIVO', ['CONSUMO_EN_SITIO'], 850, ['Premium', 'Gourmet'], [], ['Lácteos', 'Gluten']),
      this.mockProduct('PRD-004', 'Sándwich Integral Vegetariano', 'Sándwich de pan integral con aguacate, tomate y queso campesino', 'REFRIGERIOS', 'REFRIGERIO', 5200, 9800, 'ACTIVO', ['PARA_LLEVAR', 'CATERING'], 380, ['Fit', 'Artesanal'], ['VEGETARIANO'], ['Lácteos', 'Gluten']),
      this.mockProduct('PRD-005', 'Crema de Verduras', 'Crema de verduras de temporada con toque de jengibre', 'ALIMENTOS_PREPARADOS', 'PLATO', 4500, 8000, 'ACTIVO', ['CONSUMO_EN_SITIO', 'CATERING'], 220, ['Light', 'Bajo en Calorías'], ['VEGANO', 'SIN_GLUTEN'], ['Apio']),
      this.mockProduct('PRD-006', 'Agua Mineral Premium', 'Agua mineral embotellada 600ml sin gas', 'BEBIDAS', 'BEBIDA', 800, 2500, 'ACTIVO', ['PARA_LLEVAR', 'CONSUMO_EN_SITIO'], 0, [], [], []),
      this.mockProduct('PRD-007', 'Bandeja Paisa Tradicional', 'Bandeja paisa completa con frijoles, arroz, carne, chicharrón, huevo, plátano y arepa', 'ALIMENTOS_PREPARADOS', 'PLATO', 12000, 22000, 'ACTIVO', ['CONSUMO_EN_SITIO'], 1100, ['Tradicional'], [], ['Huevos']),
      this.mockProduct('PRD-008', 'Ensalada César Gourmet', 'Ensalada César con pollo grillado, croutones artesanales y parmesano', 'ALIMENTOS_PREPARADOS', 'PLATO', 7500, 14500, 'ACTIVO', ['CONSUMO_EN_SITIO', 'PARA_LLEVAR'], 350, ['Fit', 'Gourmet'], [], ['Lácteos', 'Gluten', 'Huevos']),
      this.mockProduct('PRD-009', 'Smoothie Tropical', 'Mezcla de mango, piña, banano y leche de coco', 'BEBIDAS', 'BEBIDA', 3500, 7500, 'ACTIVO', ['PARA_LLEVAR'], 280, ['Orgánico'], ['VEGANO'], []),
      this.mockProduct('PRD-010', 'Combo Infantil', 'Nuggets de pollo + jugo + postre infantil', 'COMBOS', 'COMBO', 8000, 14000, 'ACTIVO', ['CONSUMO_EN_SITIO', 'PARA_LLEVAR'], 620, ['Económico'], [], ['Gluten', 'Lácteos']),
      this.mockProduct('PRD-011', 'Galletas de Avena Artesanales', 'Galletas caseras de avena con pasas y canela, paquete x6', 'REFRIGERIOS', 'REFRIGERIO', 3000, 6500, 'ACTIVO', ['PARA_LLEVAR', 'CATERING'], 300, ['Artesanal'], ['VEGETARIANO'], ['Gluten', 'Huevos']),
      this.mockProduct('PRD-012', 'Wraps de Pollo BBQ', 'Wrap de tortilla de trigo con pollo en salsa BBQ y vegetales', 'REFRIGERIOS', 'REFRIGERIO', 6000, 11000, 'INACTIVO', ['PARA_LLEVAR'], 420, [], [], ['Gluten']),
      this.mockProduct('PRD-013', 'Café Latte Orgánico', 'Café latte con leche orgánica, opción caliente o frío', 'BEBIDAS', 'BEBIDA', 2800, 6000, 'ACTIVO', ['PARA_LLEVAR', 'CONSUMO_EN_SITIO'], 180, ['Orgánico', 'Premium'], [], ['Lácteos']),
      this.mockProduct('PRD-014', 'Pasta Primavera Vegana', 'Pasta penne con vegetales de temporada en salsa de tomate natural', 'ALIMENTOS_PREPARADOS', 'PLATO', 7000, 13000, 'ACTIVO', ['CONSUMO_EN_SITIO'], 480, ['Gourmet'], ['VEGANO'], []),
      this.mockProduct('PRD-015', 'Catering Box Corporativo', 'Caja individual: sándwich + fruta + bebida + snack', 'COMBOS', 'COMBO', 10000, 18500, 'ACTIVO', ['CATERING'], 650, ['Premium'], [], ['Gluten', 'Lácteos']),
      this.mockProduct('PRD-016', 'Fruta Picada del Día', 'Mix de frutas frescas de temporada cortadas 250g', 'REFRIGERIOS', 'REFRIGERIO', 2200, 5000, 'ACTIVO', ['PARA_LLEVAR', 'CONSUMO_EN_SITIO'], 120, ['Fit', 'Light', 'Sin Azúcar'], ['VEGANO', 'SIN_GLUTEN'], []),
      this.mockProduct('PRD-017', 'Hamburguesa Clásica', 'Hamburguesa de res 200g con lechuga, tomate, queso y papas', 'ALIMENTOS_PREPARADOS', 'PLATO', 9000, 16500, 'INACTIVO', ['CONSUMO_EN_SITIO', 'PARA_LLEVAR'], 780, ['Tradicional'], [], ['Gluten', 'Lácteos', 'Sésamo']),
      this.mockProduct('PRD-018', 'Limonada de Coco', 'Limonada natural con leche de coco y hierbabuena', 'BEBIDAS', 'BEBIDA', 2000, 4500, 'ACTIVO', ['PARA_LLEVAR', 'CONSUMO_EN_SITIO'], 90, ['Light'], ['VEGANO'], []),
      this.mockProduct('PRD-019', 'Empanadas x3', 'Trío de empanadas colombianas: carne, pollo y queso', 'REFRIGERIOS', 'REFRIGERIO', 3800, 7000, 'ACTIVO', ['PARA_LLEVAR', 'CATERING'], 540, ['Tradicional', 'Económico'], [], ['Gluten']),
      this.mockProduct('PRD-020', 'Ajiaco Santafereño', 'Ajiaco tradicional con pollo, papa criolla, mazorca y guascas', 'ALIMENTOS_PREPARADOS', 'PLATO', 9500, 18000, 'ACTIVO', ['CONSUMO_EN_SITIO'], 580, ['Tradicional', 'Gourmet'], ['SIN_GLUTEN'], []),
      this.mockProduct('PRD-021', 'Granola Bowl', 'Bowl de granola con yogurt griego, frutas y miel', 'REFRIGERIOS', 'REFRIGERIO', 4200, 8500, 'ACTIVO', ['CONSUMO_EN_SITIO', 'PARA_LLEVAR'], 340, ['Fit', 'Orgánico'], ['VEGETARIANO'], ['Lácteos', 'Frutos secos']),
      this.mockProduct('PRD-022', 'Té Matcha Latte', 'Té matcha japonés con leche vegetal espumada', 'BEBIDAS', 'BEBIDA', 3200, 7000, 'ACTIVO', ['PARA_LLEVAR', 'CONSUMO_EN_SITIO'], 150, ['Premium', 'Orgánico'], ['VEGANO'], []),
      this.mockProduct('PRD-023', 'Pollo al Curry Thai', 'Pollo en salsa curry rojo con arroz jazmín y verduras', 'ALIMENTOS_PREPARADOS', 'PLATO', 10000, 19000, 'ACTIVO', ['CONSUMO_EN_SITIO'], 620, ['Gourmet'], ['SIN_GLUTEN'], ['Cacahuetes']),
      this.mockProduct('PRD-024', 'Combo Saludable', 'Ensalada + proteína + agua + fruta', 'COMBOS', 'COMBO', 11000, 20000, 'ACTIVO', ['CONSUMO_EN_SITIO', 'CATERING'], 450, ['Fit', 'Light'], [], []),
      this.mockProduct('PRD-025', 'Brownie de Chocolate', 'Brownie artesanal de chocolate belga con nueces', 'REFRIGERIOS', 'REFRIGERIO', 3500, 7500, 'INACTIVO', ['PARA_LLEVAR', 'CONSUMO_EN_SITIO'], 420, ['Artesanal', 'Premium'], ['VEGETARIANO'], ['Gluten', 'Huevos', 'Lácteos', 'Frutos secos']),
    ];
    return products;
  }

  private mockProduct(
    codigo: string, nombre: string, desc: string, cat: CategoriaProducto,
    tipo: TipoProducto, costo: number, precio: number, estado: 'ACTIVO' | 'INACTIVO',
    modalidades: ModalidadServicio[], calorias: number,
    etiquetas: string[], restricciones: RestriccionAlimentaria[], alergenos: string[]
  ): Producto {
    const daysAgo = Math.floor(Math.random() * 90);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    return {
      id: parseInt(codigo.replace('PRD-', '')),
      identificacion: { codigo, nombre, descripcionCorta: desc, categoria: cat, estado },
      costos: { costoUnitario: costo, tipoCosto: 'ESTANDAR' },
      precios: { precioVenta: precio, margenPorcentaje: parseFloat(((precio - costo) / costo * 100).toFixed(1)), impuestosIncluidos: true, tipoImpuesto: 'IVA_19', moneda: 'COP' },
      especificaciones: {
        tipoProducto: tipo,
        tamanoPresentacion: 'Porción estándar',
        unidadMedida: tipo === 'BEBIDA' ? 'ml' : 'g',
        gramajePesoNeto: tipo === 'BEBIDA' ? 500 : 350,
        porciones: 1,
        calorias,
        alergenos,
        restricciones,
        informacionNutricional: ''
      },
      operacion: {
        modalidad: modalidades,
        requierePreparacion: tipo !== 'BEBIDA',
        tiempoEstimadoPreparacion: tipo === 'PLATO' ? 20 : tipo === 'COMBO' ? 25 : 10,
        requiereCadenaFria: tipo === 'BEBIDA'
      },
      opcional: {
        ingredientesPrincipales: [],
        etiquetas,
        observaciones: ''
      },
      fechaCreacion: date.toISOString().split('T')[0],
      creadoPor: 'admin'
    };
  }
}
