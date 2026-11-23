import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthorizationService } from '../../../core/services/authorization.service';

export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthorizationService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) return true;
  return router.createUrlTree(['/presupuesto/dashboard']);
};