import { Routes } from '@angular/router';

export const VIATICOS_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('../../features/viaticos/dashboard-viaticos/dashboard-viaticos.component').then(
        (m) => m.DashboardViaticosComponent,
      ),
  },
  {
    path: 'mis-solicitudes',
    loadComponent: () =>
      import('../../features/viaticos/bandeja-viaticos/bandeja-viaticos.component').then(
        (m) => m.BandejaViaticosComponent,
      ),
  },
];
