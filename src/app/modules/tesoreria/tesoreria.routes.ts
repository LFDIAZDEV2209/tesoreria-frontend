import { Routes } from '@angular/router';

export const TESORERIA_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'bandeja',
    pathMatch: 'full',
  },
  {
    path: 'bandeja',
    loadComponent: () =>
      import('./pages/bandeja-tesoreria/bandeja-tesoreria.component').then(
        (m) => m.BandejaTesoreriaComponent,
      ),
  },
  {
    path: 'historico-egresos',
    loadComponent: () =>
      import('./pages/historico-egresos/historico-egresos.component').then(
        (m) => m.HistoricoEgresosComponent,
      ),
  },
  {
    path: 'pagos',
    loadComponent: () =>
      import('./pages/tesoreria-pagos/tesoreria-pagos.component').then(
        (m) => m.TesoreriaPagosComponent,
      ),
  },
  {
    path: 'conciliacion/:id',
    loadComponent: () =>
      import('./pages/conciliacion-detalle/conciliacion-detalle.component').then(
        (m) => m.ConciliacionDetalleComponent,
      ),
  },
  {
    path: 'solicitud',
    loadComponent: () =>
      import('../../features/tesoreria/solicitud-tesoreria/solicitud-tesoreria.component').then(
        (m) => m.SolicitudTesoreriaComponent,
      ),
  },
  {
    path: 'solicitud-viaticos',
    loadComponent: () =>
      import('../../features/tesoreria/solicitud-viaticos/solicitud-viaticos.component').then(
        (m) => m.SolicitudViaticosComponent,
      ),
  },
  {
    path: 'bandeja-solicitudes',
    loadComponent: () =>
      import('../../features/tesoreria/bandeja-solicitudes/bandeja-solicitudes.component').then(
        (m) => m.BandejaSolicitudesComponent,
      ),
  },
  {
    path: 'visto-bueno',
    loadComponent: () =>
      import('../../features/tesoreria/bandeja-visto-bueno/bandeja-visto-bueno.component').then(
        (m) => m.BandejaVistoBuenoTesoreriaComponent,
      ),
  },
  {
    path: 'gerencia-viaticos',
    loadComponent: () =>
      import('../../features/tesoreria/gerencia-viaticos/gerencia-viaticos.component').then(
        (m) => m.GerenciaViaticosComponent,
      ),
  },
  {
    path: 'calendario-pagos',
    loadComponent: () =>
      import('./pages/calendario-pagos/calendario-pagos.component').then(
        (m) => m.CalendarioPagosComponent,
      ),
  },
  {
    path: 'tramitar-pago/:id',
    loadComponent: () =>
      import('./pages/tramitar-pago/tramitar-pago.component').then(
        (m) => m.TramitarPagoComponent,
      ),
  },
  {
    path: 'control-bancos',
    loadComponent: () =>
      import('./pages/control-bancos/control-bancos.component').then(
        (m) => m.ControlBancosComponent,
      ),
  },
  {
    path: 'crear-banco',
    loadComponent: () =>
      import('./pages/crear-banco/crear-banco.component').then(
        (m) => m.CrearBancoComponent,
      ),
  },
  {
    path: 'control-diario-pagos/:id',
    loadComponent: () =>
      import('./pages/control-diario-pagos/control-diario-pagos.component').then(
        (m) => m.ControlDiarioPagosComponent,
      ),
  },
  {
    path: 'revisar-solicitud/:id',
    loadComponent: () =>
      import('../../features/tesoreria/revisar-solicitud/revisar-solicitud.component').then(
        (m) => m.RevisarSolicitudComponent,
      ),
  },
];
