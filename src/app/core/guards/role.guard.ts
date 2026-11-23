import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthorizationService } from '../services/authorization.service';

/**
 * Guard de roles. En los metadatos de la ruta configura:
 *   data: { roles: ['SUPER_ADMIN'] }
 * El usuario debe tener al menos uno de los roles indicados.
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authorizationService = inject(AuthorizationService);
  const router = inject(Router);

  const requiredRoles: string[] = route.data?.['roles'] ?? [];

  if (requiredRoles.length === 0) return true;

  const hasAccess = authorizationService.hasAnyRole(requiredRoles);

  if (!hasAccess) {
    router.navigate(['/users/management']);
    return false;
  }

  return true;
};
