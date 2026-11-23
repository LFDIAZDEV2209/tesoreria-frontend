import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { MenuSemanal, MESES } from '../../models/menu.model';

@Component({
  selector: 'app-listado-menus',
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
        query('.row-anim', [
          style({ opacity: 0, transform: 'translateX(-20px)' }),
          stagger(60, animate('350ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateX(0)' })))
        ], { optional: true })
      ])
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        query('.card-anim', [
          style({ opacity: 0, transform: 'scale(0.9) translateY(15px)' }),
          stagger(50, animate('400ms cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'scale(1) translateY(0)' })))
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
    ])
  ],
  templateUrl: './listado-menus.component.html',
  styleUrl: './listado-menus.component.scss'
})
export class ListadoMenusComponent implements OnInit {

  constructor(private router: Router) {}

  menus = signal<MenuSemanal[]>([]);
  meses = MESES;
  searchQuery = signal('');
  filterEstado = signal<'' | 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO'>('');
  filterAnio = signal<number | ''>('');

  filteredMenus = computed(() => {
    let data = this.menus();
    const q = this.searchQuery().toLowerCase();
    const estado = this.filterEstado();
    const anio = this.filterAnio();

    if (q) data = data.filter(m => m.nombre.toLowerCase().includes(q) || m.mes.toLowerCase().includes(q));
    if (estado) data = data.filter(m => m.estado === estado);
    if (anio) data = data.filter(m => m.anio === anio);

    return data;
  });

  // Stats
  statsBorradores = computed(() => this.menus().filter(m => m.estado === 'BORRADOR').length);
  statsPublicados = computed(() => this.menus().filter(m => m.estado === 'PUBLICADO').length);
  statsArchivados = computed(() => this.menus().filter(m => m.estado === 'ARCHIVADO').length);

  showFilters = signal(false);
  viewMode = signal<'table' | 'grid'>('table');

  // Color mapping for months
  getMonthColor(mes: string): string {
    const colors: Record<string, string> = {
      'Enero': '#045C94', 'Febrero': '#6B46C1', 'Marzo': '#0D9488',
      'Abril': '#f97316', 'Mayo': '#ec4899', 'Junio': '#059669',
      'Julio': '#dc2626', 'Agosto': '#FFB71B', 'Septiembre': '#7c3aed',
      'Octubre': '#0891b2', 'Noviembre': '#be185d', 'Diciembre': '#166534'
    };
    return colors[mes] || '#045C94';
  }

  getMonthIcon(mes: string): string {
    const icons: Record<string, string> = {
      'Enero': '❄️', 'Febrero': '💜', 'Marzo': '🌸',
      'Abril': '🌧️', 'Mayo': '🌷', 'Junio': '☀️',
      'Julio': '🏖️', 'Agosto': '🌻', 'Septiembre': '🍂',
      'Octubre': '🎃', 'Noviembre': '🍁', 'Diciembre': '🎄'
    };
    return icons[mes] || '📋';
  }

  getEstadoIcon(estado: string): string {
    switch (estado) {
      case 'BORRADOR': return '📝';
      case 'PUBLICADO': return '✅';
      case 'ARCHIVADO': return '📦';
      default: return '📋';
    }
  }

  formatCurrency(value: number | undefined): string {
    if (!value) return '$0';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  }

  ngOnInit(): void {
    this.menus.set(this.generateMockMenus());
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

  getCellsPercent(menu: MenuSemanal): number {
    const total = menu.cantidadMenus * 16; // 16 categories
    const filled = menu.celdas.filter(c => c.productoNombre.trim()).length;
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterEstado.set('');
    this.filterAnio.set('');
  }

  hasActiveFilters(): boolean {
    return !!(this.searchQuery() || this.filterEstado() || this.filterAnio());
  }

  viewMenu(menu: MenuSemanal): void {
    this.router.navigate(['/planeacion/menus/detalle', menu.id]);
  }

  private generateMockMenus(): MenuSemanal[] {
    const statuses: MenuSemanal['estado'][] = ['PUBLICADO', 'PUBLICADO', 'PUBLICADO', 'BORRADOR', 'ARCHIVADO', 'PUBLICADO', 'BORRADOR', 'PUBLICADO', 'ARCHIVADO', 'PUBLICADO', 'BORRADOR', 'PUBLICADO'];
    return this.meses.map((mes, i) => ({
      id: i + 1,
      nombre: `Menú ${mes.label} 2025`,
      mes: mes.label,
      anio: 2025,
      mesNumero: mes.value,
      cantidadMenus: 7,
      celdas: Array.from({ length: Math.floor(Math.random() * 80) + 30 }, (_, j) => ({
        categoriaId: `CAT_${j}`,
        menuNumero: (j % 7) + 1,
        productoNombre: `Producto ${j + 1}`
      })),
      estado: statuses[i] || 'BORRADOR',
      fechaCreacion: new Date(2025, i, Math.floor(Math.random() * 28) + 1).toISOString(),
      creadoPor: 'admin',
      costoEstimado: Math.floor(Math.random() * 5000000) + 2000000
    }));
  }
}
