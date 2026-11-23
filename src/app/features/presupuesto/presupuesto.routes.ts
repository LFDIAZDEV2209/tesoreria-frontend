import { Routes } from '@angular/router';
import { permisoGpGuard } from './guards/presupuesto.guard';
import { superAdminGuard } from './guards/presupuesto-superadmin.guard';
import { GpShellComponent } from './pages/gp-shell/gp-shell.component';

export const PRESUPUESTO_ROUTES: Routes = [
  {
    path: '',
    component: GpShellComponent,
    children: [
  { path: 'historial', canActivate: [permisoGpGuard('historicos.ver')], loadComponent: () => import('./pages/auditoria/auditoria.component').then(m => m.AuditoriaComponent) },
  { path: 'pagos-sugeridos', canActivate: [permisoGpGuard('pagos.ver')], data: { vista: 'sugeridos' }, loadComponent: () => import('./pages/pagos-proyectados/pagos-proyectados-page.component').then(m => m.PagosProyectadosPageComponent) },
  { path: 'comparar-presupuestos', redirectTo: 'historicos/comparar-presupuestos', pathMatch: 'full' },
  { path: 'periodos', redirectTo: 'historicos/periodos', pathMatch: 'full' },
  { path: 'historicos/comparar-presupuestos', redirectTo: 'historicos/periodos', pathMatch: 'full' },
  { path: 'historicos/periodos', canActivate: [permisoGpGuard('historicos.ver', 'presupuesto.abrir_periodos', 'presupuesto.ver')], loadComponent: () => import('./pages/historicos/historicos-page.component').then(m => m.HistoricosPageComponent) },
  { path: 'historicos', redirectTo: 'historicos/periodos', pathMatch: 'full' },
  { path: 'historicos/comparar', redirectTo: 'historicos/periodos', pathMatch: 'full' },
  { path: 'historicos/:id', redirectTo: 'historicos/periodos', pathMatch: 'full' },
  {
    path: 'estados-historico',
    canActivate: [permisoGpGuard('historicos.ver')],
    loadComponent: () => import('./pages/estados-historico/estados-historico-page.component').then(m => m.EstadosHistoricoPageComponent),
  },
  {
    path: 'otros-pagos',
    loadComponent: () => import('./pages/pagos-proyectados/pagos-proyectados-page.component').then(m => m.PagosProyectadosPageComponent),
    data: { origen: 'manual' },
  },
  {
    path: 'maestro-proveedores',
    canActivate: [permisoGpGuard('admin.categorias')],
    loadComponent: () => import('./pages/maestro-proveedores/maestro-proveedores.component').then(m => m.MaestroProveedoresComponent),
  },
  { path: 'admin/proveedores', redirectTo: 'maestro-proveedores', pathMatch: 'full' },
  { path: 'admin/usuarios', redirectTo: 'usuarios', pathMatch: 'full' },
  { path: 'admin/categorias', redirectTo: 'categorias', pathMatch: 'full' },
  { path: 'admin/auditoria', redirectTo: 'auditoria', pathMatch: 'full' },
  {
    path: 'categorias',
    canActivate: [permisoGpGuard('admin.categorias')],
    loadComponent: () => import('./pages/categorias/categorias.component').then(m => m.CategoriasComponent),
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'presupuesto',
  },
  {
    path: 'dashboard',
    redirectTo: 'presupuesto', pathMatch: 'full',
  },
  {
    path: 'proveedores',
    loadComponent: () =>
      import('./pages/modulo-page/modulo-page.component').then((m) => m.ModuloPageComponent),
    data: { modulo: 'proveedores', titulo: 'Proveedores' },
  },
  {
    path: 'anticipos',
    loadComponent: () =>
      import('./pages/modulo-page/modulo-page.component').then((m) => m.ModuloPageComponent),
    data: { modulo: 'anticipos', titulo: 'Anticipos' },
  },
  {
    path: 'cuentas-pagar',
    loadComponent: () =>
      import('./pages/modulo-page/modulo-page.component').then((m) => m.ModuloPageComponent),
    data: { modulo: 'cx_pagar', titulo: 'Cuentas por Pagar' },
  },
  {
    path: 'cuentas-cobrar',
    loadComponent: () =>
      import('./pages/modulo-page/modulo-page.component').then((m) => m.ModuloPageComponent),
    data: { modulo: 'cx_cobrar', titulo: 'Cuentas por Cobrar' },
  },
  {
    path: 'impuestos',
    loadComponent: () =>
      import('./pages/modulo-page/modulo-page.component').then((m) => m.ModuloPageComponent),
    data: { modulo: 'impuestos', titulo: 'Impuestos' },
  },
  {
    path: 'subir-archivos',
    canActivate: [permisoGpGuard('modulos.importar')],
    loadComponent: () => import('./pages/subir-archivos/subir-archivos.component').then(m => m.SubirArchivosComponent),
  },
  {
    path: 'presupuesto',
    loadComponent: () =>
      import('./pages/presupuesto/presupuesto-page.component').then((m) => m.PresupuestoPageComponent),
  },
  {
    path: 'aprobacion-consolidada',
    redirectTo: 'presupuesto', pathMatch: 'full',
  },
  {
    path: 'pagos-proyectados',
    loadComponent: () =>
      import('./pages/pagos-proyectados/pagos-proyectados-page.component').then((m) => m.PagosProyectadosPageComponent),
  },
  {
    path: 'resumen-gerencial',
    canActivate: [permisoGpGuard('presupuesto.resumen_gerencial')],
    loadComponent: () =>
      import('./pages/resumen-gerencial/resumen-gerencial.component').then((m) => m.ResumenGerencialComponent),
  },
  {
    path: 'auditoria',
    canActivate: [permisoGpGuard('admin.auditoria')],
    loadComponent: () =>
      import('./pages/auditoria/auditoria-registro.component').then((m) => m.AuditoriaRegistroComponent),
  },
  {
    path: 'usuarios',
    canActivate: [superAdminGuard],
    loadComponent: () =>
      import('./pages/cuentas/cuentas.component').then((m) => m.CuentasComponent),
  },
  {
    path: 'usuarios-empresas',
    redirectTo: 'usuarios', pathMatch: 'full',
  },
    ],
  },
];
