import { Routes } from '@angular/router';
import { AuthGuardService } from './core/guards/auth.guard';
import { configuracionSuperadminGuard } from './features/configuracion-superadmin/guards/configuracion-superadmin.guard';
import { permisoGpGuard } from './features/presupuesto/guards/presupuesto.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  {
    // Perfil del usuario en sesión (clic en "Sesión activa" del sidebar).
    path: 'mi-perfil',
    canActivate: [AuthGuardService],
    loadComponent: () =>
      import('./features/perfil/mi-perfil/mi-perfil.component').then(
        (m) => m.MiPerfilComponent,
      ),
  },
  {
    // Configuraciones de superadmin (accesibles desde "Sesión activa" en el
    // sidebar): roles y permisos del Gestor Presupuestal.
    path: 'configuracion',
    canActivate: [AuthGuardService, configuracionSuperadminGuard],
    children: [
      {
        path: 'roles-permisos',
        loadComponent: () =>
          import('./features/configuracion-superadmin/pages/roles-permisos/roles-permisos.component').then(
            (m) => m.RolesPermisosComponent,
          ),
      },
      { path: '', redirectTo: 'roles-permisos', pathMatch: 'full' },
    ],
  },
  {
    path: 'auth',
    children: [
      {
        path: 'change-password-required',
        canActivate: [AuthGuardService],
        loadComponent: () =>
          import('./features/auth/change-password-required/change-password-required.component').then(
            (m) => m.ChangePasswordRequiredComponent,
          ),
      },
    ],
  },
  {
    path: 'users',
    canActivate: [AuthGuardService],
    children: [
      {
        path: 'management',
        loadComponent: () =>
          import('./features/employee-management/user-management/user-management.component').then(
            (m) => m.UserManagementComponent,
          ),
      },
    ],
  },
  {
    path: 'tesoreria',
    canActivate: [AuthGuardService],
    loadChildren: () =>
      import('./modules/tesoreria/tesoreria.routes').then(
        (m) => m.TESORERIA_ROUTES,
      ),
  },
  {
    path: 'viaticos',
    canActivate: [AuthGuardService],
    loadChildren: () =>
      import('./modules/viaticos/viaticos.routes').then(
        (m) => m.VIATICOS_ROUTES,
      ),
  },
  {
    path: 'compras',
    canActivate: [AuthGuardService],
    children: [
      {
        path: 'gestion',
        loadComponent: () =>
          import('./features/compras/gestion-compras/gestion-compras.component').then(
            (m) => m.GestionComprasComponent,
          ),
      },
      {
        path: 'tramitar/:solicitudId',
        loadComponent: () =>
          import('./features/compras/tramitar-requisicion/tramitar-requisicion.component').then(
            (m) => m.TramitarRequisicionComponent,
          ),
      },
      {
        path: 'seguimiento',
        loadComponent: () =>
          import('./features/compras/seguimiento-requisiciones/seguimiento-requisiciones.component').then(
            (m) => m.SeguimientoRequisicionesComponent,
          ),
      },
      {
        path: 'visto-bueno/:solicitudId',
        loadComponent: () =>
          import('./features/compras/visto-bueno-jefe/visto-bueno-jefe.component').then(
            (m) => m.VistoBuenoJefeComponent,
          ),
      },
      {
        path: 'bandeja-visto-bueno',
        loadComponent: () =>
          import('./features/compras/bandeja-visto-bueno/bandeja-visto-bueno.component').then(
            (m) => m.BandejaVistoBuenoComponent,
          ),
      },
      {
        path: '',
        redirectTo: 'gestion',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'cadena-suministros',
    canActivate: [AuthGuardService],
    children: [
      {
        path: 'bandeja-visto-bueno',
        loadComponent: () =>
          import('./features/cadena-suministros/bandeja-visto-bueno/bandeja-visto-bueno-cs.component').then(
            (m) => m.BandejaVistoBuenoCsComponent,
          ),
      },
      {
        path: 'visto-bueno/:solicitudId',
        loadComponent: () =>
          import('./features/cadena-suministros/visto-bueno-cs/visto-bueno-cs.component').then(
            (m) => m.VistoBuenoCsComponent,
          ),
      },
      {
        path: 'tramitar-orden/:solicitudId/:ordenId',
        loadComponent: () =>
          import('./features/cadena-suministros/tramitar-orden-cs/tramitar-orden-cs.component').then(
            (m) => m.TramitarOrdenCsComponent,
          ),
      },
      {
        path: '',
        redirectTo: 'bandeja-visto-bueno',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'proveedores',
    canActivate: [AuthGuardService],
    loadComponent: () =>
      import('./features/proveedores/proveedores-layout/proveedores-layout.component').then(
        (m) => m.ProveedoresLayoutComponent,
      ),
    children: [
      {
        path: 'gestion',
        loadComponent: () =>
          import('./features/proveedores/gestion-proveedores/gestion-proveedores.component').then(
            (m) => m.GestionProveedoresComponent,
          ),
      },
      {
        path: 'datos-tributarios',
        loadComponent: () =>
          import('./features/proveedores/datos-tributarios/datos-tributarios.component').then(
            (m) => m.DatosTributariosComponent,
          ),
      },
      {
        path: 'configuracion-retencion',
        loadComponent: () =>
          import('./features/proveedores/configuracion-retencion/configuracion-retencion.component').then(
            (m) => m.ConfiguracionRetencionComponent,
          ),
      },
      {
        path: 'configuracion-reteica',
        loadComponent: () =>
          import('./features/proveedores/configuracion-reteica/configuracion-reteica.component').then(
            (m) => m.ConfiguracionReteicaComponent,
          ),
      },
      {
        path: '',
        redirectTo: 'gestion',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'contabilidad',
    canActivate: [AuthGuardService],
    children: [
      {
        path: 'tramitar/:registroId',
        loadComponent: () =>
          import('./features/contabilidad/tramitar-contabilidad/tramitar-contabilidad.component').then(
            (m) => m.TramitarContabilidadComponent,
          ),
      },
      {
        path: 'tramitar-viaticos/:solicitudViaticosId',
        loadComponent: () =>
          import('./features/contabilidad/tramitar-viaticos-contabilidad/tramitar-viaticos-contabilidad.component').then(
            (m) => m.TramitarViaticosContabilidadComponent,
          ),
      },
      {
        path: 'control-egresos',
        loadComponent: () =>
          import('./features/contabilidad/control-egresos/control-egresos.component').then(
            (m) => m.ControlEgresosComponent,
          ),
      },
      {
        path: 'aprobacion-egresos',
        loadComponent: () =>
          import('./features/contabilidad/aprobacion-egresos/aprobacion-egresos.component').then(
            (m) => m.AprobacionEgresosComponent,
          ),
      },
      {
        path: '',
        redirectTo: 'control-egresos',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'gerencia-financiera',
    canActivate: [AuthGuardService, permisoGpGuard('egresos.aprobar_gerencia')],
    children: [
      {
        path: 'aprobacion-egresos',
        loadComponent: () =>
          import('./features/gerencia-financiera/aprobacion-egresos/aprobacion-egresos-gerencia.component').then(
            (m) => m.AprobacionEgresosGerenciaComponent,
          ),
      },
      {
        path: 'historico-aprobados',
        loadComponent: () =>
          import('./features/gerencia-financiera/historico-aprobados/historico-aprobados.component').then(
            (m) => m.HistoricoAprobadosComponent,
          ),
      },
      { path: '', redirectTo: 'aprobacion-egresos', pathMatch: 'full' },
    ],
  },
  {
    path: 'planeacion',
    canActivate: [AuthGuardService],
    children: [
      {
        path: 'productos/crear',
        loadComponent: () =>
          import('./features/planeacion/productos/crear-producto/crear-producto.component').then(
            (m) => m.CrearProductoComponent,
          ),
      },
      {
        path: 'productos/listado',
        loadComponent: () =>
          import('./features/planeacion/productos/listado-productos/listado-productos.component').then(
            (m) => m.ListadoProductosComponent,
          ),
      },
      {
        path: 'menus/crear',
        loadComponent: () =>
          import('./features/planeacion/menus/crear-menu/crear-menu.component').then(
            (m) => m.CrearMenuComponent,
          ),
      },
      {
        path: 'menus/listado',
        loadComponent: () =>
          import('./features/planeacion/menus/listado-menus/listado-menus.component').then(
            (m) => m.ListadoMenusComponent,
          ),
      },
      {
        path: 'menus/detalle/:id',
        loadComponent: () =>
          import('./features/planeacion/menus/detalle-menu/detalle-menu.component').then(
            (m) => m.DetalleMenuComponent,
          ),
      },
      {
        path: 'minutas',
        loadComponent: () =>
          import('./features/planeacion/minutas/minutas-placeholder.component').then(
            (m) => m.MinutasPlaceholderComponent,
          ),
      },
      {
        path: '',
        redirectTo: 'productos/crear',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'mesa-ayuda',
    canActivate: [AuthGuardService],
    loadChildren: () =>
      import('./features/mesa-ayuda/mesa-ayuda.routes').then(
        (m) => m.MESA_AYUDA_ROUTES,
      ),
  },
  {
    path: 'presupuesto',
    canActivate: [AuthGuardService],
    loadChildren: () =>
      import('./features/presupuesto/presupuesto.routes').then(
        (m) => m.PRESUPUESTO_ROUTES,
      ),
  },
  {
    // Vista inicial: presupuesto (el AuthGuard envía a /login si no hay sesión)
    path: '',
    redirectTo: '/presupuesto/presupuesto',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: '/login',
  },
];
