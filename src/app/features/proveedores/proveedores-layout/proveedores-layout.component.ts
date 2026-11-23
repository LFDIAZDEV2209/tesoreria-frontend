import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RouterLink,
  RouterOutlet,
  Router,
  ActivatedRoute,
} from '@angular/router';

@Component({
  selector: 'app-proveedores-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: './proveedores-layout.component.html',
  styleUrl: './proveedores-layout.component.scss',
})
export class ProveedoresLayoutComponent {
  menuItems = [
    {
      path: '/proveedores/gestion',
      label: 'Gestión de Proveedores',
      icon: '🏢',
      description: 'Administra la información de tus proveedores',
    },
    {
      path: '/proveedores/configuracion-retencion',
      label: 'Retención en la Fuente (2026)',
      icon: '💰',
      description: 'Tasas tributarias precargadas',
    },
    {
      path: '/proveedores/configuracion-reteica',
      label: 'ReteICA (2026)',
      icon: '🏛️',
      description: 'Retención de Industria y Comercio por municipio',
    },
    {
      path: '/proveedores/datos-tributarios',
      label: 'Datos Tributarios',
      icon: '📊',
      description: 'Información fiscal y contribuciones',
    },
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  isActive(path: string): boolean {
    return this.router.url.includes(path.split('/').pop() || '');
  }
}
