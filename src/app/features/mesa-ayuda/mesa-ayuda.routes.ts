import { Routes } from '@angular/router';

export const MESA_AYUDA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => 
      import('./pages/dashboard-mesa-ayuda/dashboard-mesa-ayuda.component')
        .then(m => m.DashboardMesaAyudaComponent),
    title: 'Mesa de Ayuda - Dashboard'
  },
  {
    path: 'nivel/1',
    loadComponent: () => 
      import('./pages/bandeja-tickets/bandeja-tickets.component')
        .then(m => m.BandejaTicketsComponent),
    data: { nivel: 1 },
    title: 'Mesa de Ayuda - Soporte Nivel 1'
  },
  {
    path: 'nivel/2',
    loadComponent: () => 
      import('./pages/bandeja-tickets/bandeja-tickets.component')
        .then(m => m.BandejaTicketsComponent),
    data: { nivel: 2 },
    title: 'Mesa de Ayuda - Soporte Nivel 2'
  },
  {
    path: 'nivel/3',
    loadComponent: () => 
      import('./pages/bandeja-tickets/bandeja-tickets.component')
        .then(m => m.BandejaTicketsComponent),
    data: { nivel: 3 },
    title: 'Mesa de Ayuda - Soporte Nivel 3'
  },
  {
    path: 'ticket/:id',
    loadComponent: () => 
      import('./pages/ticket-detail/ticket-detail.component')
        .then(m => m.TicketDetailComponent),
    title: 'Mesa de Ayuda - Detalle de Ticket'
  }
];
