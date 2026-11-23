import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthorizationService } from '../../../core/services/authorization.service';

/**
 * Configuraciones de superadmin (roles y permisos del Gestor Presupuestal):
 * solo SUPER_ADMIN. El backend también protege (403) — esto es solo UX.
 */
export const configuracionSuperadminGuard: CanActivateFn = () => {
  const auth = inject(AuthorizationService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) return true;
  return router.createUrlTree(['/presupuesto/dashboard']);
};
