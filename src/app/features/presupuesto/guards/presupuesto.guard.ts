import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of, map, catchError, take } from 'rxjs';
import { PresupuestoService } from '../services/presupuesto.service';
import { AuthorizationService } from '../../../core/services/authorization.service';

/**
 * Solo Gerencia (SUPER_ADMIN / ADMIN) para resumen gerencial y auditoría.
 * El backend también protege (403) — esto es solo UX.
 */
export const gerenciaGuard: CanActivateFn = () => {
  const auth = inject(AuthorizationService);
  const router = inject(Router);
  if (auth.hasAnyRole(['SUPER_ADMIN', 'ADMIN'])) return true;
  return router.createUrlTree(['/presupuesto/proveedores']);
};

/**
 * Solo superadmin para la pantalla Usuarios del GP (asignar empresas y
 * permiso de aprobar) — igual que admin/usuarios del gestor original.
 */
export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthorizationService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) return true;
  return router.createUrlTree(['/presupuesto/resumen-gerencial']);
};

/** Usa la matriz del servidor; una asignación no depende del nombre del rol NEXA. */
export function permisoGpGuard(codigo: string, ...alternativos: string[]): CanActivateFn {
  return () => {
    const api = inject(PresupuestoService);
    const router = inject(Router);
    const denegado = router.createUrlTree(['/presupuesto/proveedores']);
    return api.permisosGp().pipe(
      take(1),
      map(p => p.superAdmin || [codigo, ...alternativos].some(permiso => p.permisos?.includes(permiso)) ? true : denegado),
      catchError(() => of(denegado)),
    );
  };
}