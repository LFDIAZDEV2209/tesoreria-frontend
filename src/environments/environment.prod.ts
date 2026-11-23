/**
 * Environment Configuration - Production
 *
 * Usado en: build de producción (ng build --prod)
 * API Backend: http://localhost:8081
 */

export const environment = {
  production: true,
  apiUrl: '/api',
  // Backend del Gestor Presupuestal: ruta relativa; el reverse proxy
  gpApiUrl: '/api/gp',
  tesoreriaUseMockData: false,
  useMockApi: false,
  enableOtpVerification: true,

  // Configuración de notificaciones por correo
  notifications: {
    salaryChangeRecipient: 'director.gestionhumana@example.com',
  },

  // Endpoints principales
  endpoints: {
    auth: {
      login: '/auth/login',
      changePassword: '/auth/change-password',
      logout: '/auth/logout',
    },
    users: '/users',
    employees: '/employees',
    roles: '/roles',
    areas: '/areas',
    dependencies: '/dependencies',
    positions: '/positions',
    levels: '/levels',
    kpis: '/kpis',
    assignments: '/assignments',
    indicators: '/indicators',
    evidences: '/indicator-evidences',
    employeeAssignments: '/employee-assignments',
    certificates: '/certificates',
    reports: '/reports',
    dashboard: '/dashboard',
    corporateDocuments: '/corporate-documents',
    proveedores: '/proveedores',
    contabilidad: '/contabilidad',
  },
};
