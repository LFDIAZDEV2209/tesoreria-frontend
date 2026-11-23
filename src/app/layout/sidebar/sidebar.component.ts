import { Component, OnDestroy, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CdkOverlayOrigin, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { filter } from 'rxjs/operators';
import { GpNavigationService } from '../../features/presupuesto/services/gp-navigation.service';
import { PresupuestoContextService } from '../../features/presupuesto/services/presupuesto-context.service';
import { GpIconComponent } from '../../features/presupuesto/components/gp-icon/gp-icon.component';
import { AuthService } from '../../core/services/auth.service';

interface SidebarLink {
  path: string;
  label: string;
  icon: string;
}

interface SidebarEntry {
  id: string;
  label: string;
  icon: string;
  path?: string;
  prefix?: string;
  expanded?: WritableSignal<boolean>;
  links?: SidebarLink[];
  adminLinks?: SidebarLink[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, OverlayModule, GpIconComponent],
  host: { '[class.nexa-sidebar-colapsado]': 'collapsed()' },
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnDestroy {
  readonly gpNavigation = inject(GpNavigationService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly gpCtx = inject(PresupuestoContextService);
  private readonly document = inject(DOCUMENT);

  readonly collapsed = signal(false);
  readonly currentRoute = signal(this.router.url);
  readonly proveedoresExpanded = signal(false);
  readonly contabilidadExpanded = signal(false);
  readonly gestorPresupuestalExpanded = signal(false);
  readonly gerenciaFinancieraExpanded = signal(false);
  readonly cargueEgresosExpanded = signal(false);
  readonly currentUser = computed(() => this.authService.getCurrentUser());
  readonly puedeAprobarEgresos = computed(() => this.gpCtx.tienePermiso('egresos.aprobar_gerencia'));

  readonly entries = computed<SidebarEntry[]>(() => [
    {
      id: 'proveedores', label: 'Proveedores', icon: 'building', prefix: '/proveedores',
      expanded: this.proveedoresExpanded,
      links: [
        { path: '/proveedores/gestion', label: 'Gestión de Proveedores', icon: 'building' },
        { path: '/proveedores/configuracion-retencion', label: 'Retención en la Fuente', icon: 'coins' },
        { path: '/proveedores/configuracion-reteica', label: 'ReteICA', icon: 'bank' },
        { path: '/proveedores/datos-tributarios', label: 'Datos Tributarios', icon: 'calculator' },
      ],
    },
    {
      id: 'contabilidad', label: 'Contabilidad', icon: 'calculator', prefix: '/contabilidad',
      expanded: this.contabilidadExpanded,
      links: [
        { path: '/contabilidad/control-egresos', label: 'Control Egresos', icon: 'shield' },
        { path: '/contabilidad/aprobacion-egresos', label: 'Eliminaciones de Egresos', icon: 'edit' },
      ],
    },
    {
      id: 'tesoreria', label: 'Cargue de C. Egreso', icon: 'upload', prefix: '/tesoreria/bandeja',
      expanded: this.cargueEgresosExpanded,
      links: [
        { path: '/tesoreria/bandeja', label: 'Bandeja de Pagos', icon: 'upload' },
        { path: '/tesoreria/historico-egresos', label: 'Histórico de Egresos', icon: 'clock' },
      ],
    },
    { id: 'tesoreria-pagos', label: 'Tesorería', icon: 'coins', path: '/tesoreria/pagos' },
    { id: 'bancos', label: 'Control de Bancos', icon: 'wallet', path: '/tesoreria/control-bancos' },
    ...(this.puedeAprobarEgresos() ? [{
      id: 'gerencia-financiera', label: 'Gerencia Financiera', icon: 'shield', prefix: '/gerencia-financiera',
      expanded: this.gerenciaFinancieraExpanded,
      links: [
        { path: '/gerencia-financiera/aprobacion-egresos', label: 'Aprobación de Egresos', icon: 'shield' },
        { path: '/gerencia-financiera/historico-aprobados', label: 'Histórico de Aprobados', icon: 'clock' },
      ],
    }] : []),
    ...(this.gpNavigation.visible() ? [{
      id: 'gestor', label: 'Gestor Presupuestal', icon: 'chart', prefix: '/presupuesto',
      expanded: this.gestorPresupuestalExpanded,
      links: this.gpNavigation.items().map(item => ({ ...item, path: '/presupuesto/' + item.path })),
      adminLinks: this.gpNavigation.adminItems().map(item => ({ ...item, path: '/presupuesto/' + item.path })),
    }] : []),
    { id: 'calendario', label: 'Calendario de Pagos', icon: 'calendar', path: '/tesoreria/calendario-pagos' },
  ]);

  private readonly openId = signal<string | null>(null);
  readonly flyoutEntry = computed(() => this.collapsed()
    ? this.entries().find(entry => entry.id === this.openId()) ?? null : null);
  flyoutOrigin?: CdkOverlayOrigin;
  readonly flyoutPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 24 },
    { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: 24 },
  ];
  private closeTimer?: ReturnType<typeof setTimeout>;
  private focusTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    if (this.authService.getCurrentUser()) this.gpNavigation.verificarSesion();
    if (this.authService.getCurrentUser()) this.gpCtx.cargarPermisos();
    this.expandCurrentGroup(this.router.url);
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(event => {
      this.currentRoute.set(event.urlAfterRedirects);
      this.expandCurrentGroup(event.urlAfterRedirects);
      this.closeFlyout();
    });
    // El panel abierto también desaparece si la sesión pierde acceso al grupo.
    effect(() => {
      const id = this.openId();
      if (id && !this.entries().some(entry => entry.id === id)) this.closeFlyout();
    }, { allowSignalWrites: true });
  }

  private expandCurrentGroup(url: string): void {
    if (url.startsWith('/proveedores')) this.proveedoresExpanded.set(true);
    if (url.startsWith('/contabilidad')) this.contabilidadExpanded.set(true);
    if (url.startsWith('/presupuesto')) this.gestorPresupuestalExpanded.set(true);
    if (url.startsWith('/gerencia-financiera')) this.gerenciaFinancieraExpanded.set(true);
    if (url.startsWith('/tesoreria/bandeja') || url.startsWith('/tesoreria/historico-egresos')) {
      this.cargueEgresosExpanded.set(true);
    }
  }

  trackEntry(_index: number, entry: SidebarEntry): string { return entry.id; }
  trackLink(_index: number, link: SidebarLink): string { return link.path; }

  isActive(entry: SidebarEntry): boolean {
    if (entry.prefix && this.currentRoute().startsWith(entry.prefix)) return true;
    if (entry.links?.some(l => this.currentRoute().startsWith(l.path))) return true;
    return !!entry.path && this.currentRoute().startsWith(entry.path);
  }

  isExpanded(entry: SidebarEntry): boolean {
    return this.collapsed() ? this.openId() === entry.id : !!entry.expanded?.();
  }

  submenuId(entry: SidebarEntry): string {
    return entry.id + (this.collapsed() ? '-menu-flotante' : '-menu-lateral');
  }

  toggleSidebar(): void {
    this.closeFlyout();
    this.collapsed.update(value => !value);
  }

  toggleGestorPresupuestal(): void {
    this.gestorPresupuestalExpanded.update(value => !value);
  }

  activateGroup(entry: SidebarEntry, origin: CdkOverlayOrigin, event: MouseEvent): void {
    if (this.collapsed()) {
      // El clic también permite acceder desde pantallas táctiles.
      this.openFlyout(entry, origin, event.detail === 0);
    } else {
      entry.expanded?.update(value => !value);
    }
  }

  openFlyout(entry: SidebarEntry, origin: CdkOverlayOrigin, focusFirst = false): void {
    if (!this.collapsed()) return;
    this.cancelClose();
    clearTimeout(this.focusTimer);
    this.flyoutOrigin = origin;
    this.openId.set(entry.id);
    if (focusFirst) {
      this.focusTimer = setTimeout(() => this.flyoutPanel()?.querySelector<HTMLAnchorElement>('a')?.focus());
    }
  }

  cancelClose(): void {
    clearTimeout(this.closeTimer);
  }

  scheduleClose(): void {
    this.cancelClose();
    // Permite cruzar el espacio entre el icono y su panel sin cerrarlo accidentalmente.
    this.closeTimer = setTimeout(() => {
      const focused = this.document.activeElement;
      if (!this.flyoutPanel()?.contains(focused)
        && !this.flyoutOrigin?.elementRef.nativeElement.contains(focused)) this.closeFlyout();
    }, 180);
  }

  closeFlyout(restoreFocus = false): void {
    this.cancelClose();
    clearTimeout(this.focusTimer);
    this.openId.set(null);
    if (restoreFocus) this.flyoutOrigin?.elementRef.nativeElement.focus();
  }

  onOutsideClick(event: MouseEvent): void {
    if (!this.flyoutOrigin?.elementRef.nativeElement.contains(event.target)) this.closeFlyout();
  }

  onTriggerKeydown(event: KeyboardEvent, entry: SidebarEntry, origin: CdkOverlayOrigin): void {
    if (!this.collapsed()) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown'
      || (event.key === 'Tab' && !event.shiftKey && this.openId() === entry.id)) {
      event.preventDefault();
      this.openFlyout(entry, origin, true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeFlyout();
    }
  }

  onPanelKeydown(event: KeyboardEvent): void {
    if (!this.flyoutPanel()?.contains(event.target as Node)) return;
    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      this.closeFlyout(true);
      return;
    }
    const links = Array.from(this.flyoutPanel()?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const index = links.indexOf(this.document.activeElement as HTMLAnchorElement);
    if (event.key === 'Tab' && event.shiftKey && index === 0) {
      event.preventDefault();
      this.closeFlyout(true);
    } else if (event.key === 'Tab' && !event.shiftKey && index === links.length - 1) {
      // El overlay está al final del documento: devolver el foco permite continuar por la barra.
      this.closeFlyout(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
    }
  }

  private flyoutPanel(): HTMLElement | null {
    return this.document.getElementById(this.openId() + '-menu-flotante');
  }

  onLogout(): void {
    this.closeFlyout();
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) this.authService.logout();
  }

  ngOnDestroy(): void {
    this.cancelClose();
    clearTimeout(this.focusTimer);
  }
}
