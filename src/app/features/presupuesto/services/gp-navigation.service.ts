import { Injectable, computed, inject } from '@angular/core';
import { GpSessionService } from './gp-session.service';
import { PresupuestoContextService } from './presupuesto-context.service';

const ITEMS = [
  // 'subir-archivos' (Importar maestro) se oculta de la navegación: la carga
  // del maestro se realiza importando en los módulos; la ruta sigue existiendo.
  { path: 'pagos-sugeridos', label: 'Pagos Sugeridos', icon: 'shield', permiso: 'pagos.ver' },
  { path: 'proveedores', label: 'Proveedores', icon: 'users', permiso: 'modulos.ver' },
  { path: 'cuentas-pagar', label: 'Cuentas por Pagar', icon: 'credit-card', permiso: 'modulos.ver' },
  { path: 'impuestos', label: 'Impuestos, Estampillas y Seguros', icon: 'bank', permiso: 'modulos.ver' },
  { path: 'otros-pagos', label: 'Provisiones', icon: 'coins', permiso: 'pagos.ver' },
  { path: 'cuentas-cobrar', label: 'Cuentas por Cobrar', icon: 'hand-coins', permiso: 'modulos.ver' },
  { path: 'anticipos', label: 'Anticipos', icon: 'clock', permiso: 'modulos.ver' },
  { path: 'pagos-proyectados', label: 'Proyección de Egresos', icon: 'calendar-clock', permiso: 'pagos.ver' },
  { path: 'presupuesto', label: 'Presupuesto', icon: 'chart', permiso: 'presupuesto.ver' },
  { path: 'historicos', label: 'Históricos', icon: 'calendar', permiso: 'historicos.ver' },
  { path: 'estados-historico', label: 'Histórico de estados', icon: 'activity', permiso: 'historicos.ver' },
  { path: 'historial', label: 'Historial', icon: 'clock', permiso: 'historicos.ver' },
];
const EMPRESAS = { path: 'resumen-gerencial', label: 'Todas las Empresas', icon: 'layout-dashboard', permiso: 'presupuesto.resumen_gerencial' };
const ADMIN_ITEMS = [
  { path: 'usuarios', label: 'Cuentas y Empresas', icon: 'user-cog' },
  { path: 'maestro-proveedores', label: 'Proveedores', icon: 'warehouse' },
  { path: 'categorias', label: 'Categorías', icon: 'tags' },
  { path: 'auditoria', label: 'Auditoría', icon: 'scroll-text' },
];

/** Una única lista de navegación para las pestañas y el menú lateral del Gestor. */
@Injectable({ providedIn: 'root' })
export class GpNavigationService {
  private readonly session = inject(GpSessionService);
  private readonly ctx = inject(PresupuestoContextService);
  private readonly rol = computed(() => {
    const estado = this.session.estado();
    return estado?.autenticado && !estado.debe_cambiar_password ? estado.rol_nexa ?? estado.rol : null;
  });

  readonly items = computed(() => {
    const rol = this.rol();
    const candidatos = rol === 'tesorero' ? ITEMS.filter(i => i.path === 'pagos-proyectados')
      : rol === 'contador' || rol === 'director_contable' ? ITEMS
      : rol === 'superadmin' ? [EMPRESAS, ...ITEMS]
      : rol === 'gerente' || rol === 'editor_contable'
        ? [EMPRESAS, ...ITEMS.filter(i => ['presupuesto', 'comparar-presupuestos', 'periodos', 'pagos-proyectados', 'pagos-sugeridos', 'historicos', 'estados-historico', 'historial'].includes(i.path))]
        : [];
    // El estado de sesión permite construir el lateral incluso fuera del GP;
    // dentro del módulo se usan los permisos efectivos ya cargados en el contexto.
    const permisos = this.ctx.permisos();
    const codigos = permisos?.rolGp === rol ? permisos?.permisos : this.session.estado()?.permisos;
    return candidatos.filter(i => rol === 'superadmin' || codigos?.includes(i.permiso));
  });

  readonly adminItems = computed(() => {
    const rol = this.rol();
    if (rol === 'superadmin') return ADMIN_ITEMS;
    if (!rol) return [];
    const permisos = this.ctx.permisos();
    const codigos = permisos?.rolGp === rol ? permisos.permisos : this.session.estado()?.permisos;
    return codigos?.includes('admin.categorias')
      ? ADMIN_ITEMS.filter(i => ['maestro-proveedores', 'categorias'].includes(i.path)) : [];
  });
  readonly visible = computed(() => this.items().length > 0 || this.adminItems().length > 0);

  verificarSesion(): void {
    if (this.session.estado() === null) this.session.verificar();
  }
}
