/**
 * Roles y permisos del Gestor Presupuestal — replica del gestor original
 * (gestor-presupuestal/backend/auth.py). El backend (Tesoreriabd) devuelve el
 * catálogo completo con su estado; el superadmin lo administra desde
 * "Configuraciones Superadmin > Gestión de Roles y Permisos".
 */

export interface PermisoEstado {
  codigo: string;
  grupo: string;
  nombre: string;
  /** Explicación en lenguaje simple de qué permite este permiso. */
  descripcion: string;
  orden: number;
  /** En el gestor original exige además el flag por usuario puede_aprobar. */
  requierePuedeAprobar: boolean;
  habilitado: boolean;
}

export interface RolPermisos {
  rol: string;
  nombre: string;
  descripcion: string;
  permisos: PermisoEstado[];
}

/** Permisos de un rol agrupados para la tabla de la pantalla. */
export interface GrupoPermisos {
  grupo: string;
  permisos: PermisoEstado[];
}
