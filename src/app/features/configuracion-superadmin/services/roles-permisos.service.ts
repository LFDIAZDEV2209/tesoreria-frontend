import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RolPermisos } from '../models/roles-permisos.model';

/** Matriz por defecto del gestor (no editable contra ese backend). */
const CATALOGO: { codigo: string; grupo: string; nombre: string; descripcion: string; orden: number; requierePuedeAprobar: boolean }[] = [
  { codigo: 'presupuesto.ver', grupo: 'Presupuesto', nombre: 'Consultar el presupuesto', descripcion: 'Ver contrato, meses y flujo de caja.', orden: 1, requierePuedeAprobar: false },
  { codigo: 'presupuesto.editar_contrato', grupo: 'Presupuesto', nombre: 'Editar el contrato', descripcion: 'Digitar datos del contrato.', orden: 2, requierePuedeAprobar: false },
  { codigo: 'presupuesto.editar_periodos', grupo: 'Presupuesto', nombre: 'Editar los meses', descripcion: 'Digitar facturación, flujo de caja y nómina.', orden: 3, requierePuedeAprobar: false },
  { codigo: 'presupuesto.aprobar', grupo: 'Presupuesto', nombre: 'Aprobar el presupuesto', descripcion: 'Aprobar o rechazar el presupuesto mensual.', orden: 4, requierePuedeAprobar: true },
  { codigo: 'presupuesto.aprobar_nomina', grupo: 'Presupuesto', nombre: 'Aprobar la nómina', descripcion: 'Visto bueno a la nómina de cada mes.', orden: 5, requierePuedeAprobar: true },
  { codigo: 'presupuesto.resumen_gerencial', grupo: 'Presupuesto', nombre: 'Ver Todas las Empresas', descripcion: 'Panorámica de todas las empresas.', orden: 6, requierePuedeAprobar: false },
  { codigo: 'modulos.ver', grupo: 'Módulos', nombre: 'Consultar módulos', descripcion: 'Ver y exportar los módulos financieros.', orden: 7, requierePuedeAprobar: false },
  { codigo: 'modulos.importar', grupo: 'Módulos', nombre: 'Importar archivos', descripcion: 'Cargar movimientos de un módulo.', orden: 8, requierePuedeAprobar: false },
  { codigo: 'modulos.limpiar', grupo: 'Módulos', nombre: 'Limpiar un módulo', descripcion: 'Borrar datos importados de un módulo.', orden: 9, requierePuedeAprobar: false },
  { codigo: 'pagos.ver', grupo: 'Pagos proyectados', nombre: 'Consultar los pagos', descripcion: 'Ver pagos y facturas sugeridas.', orden: 10, requierePuedeAprobar: false },
  { codigo: 'pagos.operar', grupo: 'Pagos proyectados', nombre: 'Agendar y pagar', descripcion: 'Crear, editar, eliminar y marcar pagos.', orden: 11, requierePuedeAprobar: false },
  { codigo: 'pagos.aprobar', grupo: 'Pagos proyectados', nombre: 'Aprobar pagos', descripcion: 'Visto bueno antes de ejecutar.', orden: 12, requierePuedeAprobar: false },
  { codigo: 'admin.auditoria', grupo: 'Administración', nombre: 'Ver la auditoría', descripcion: 'Registro de acciones importantes.', orden: 13, requierePuedeAprobar: false },
  { codigo: 'admin.categorias', grupo: 'Administración', nombre: 'Administrar categorías', descripcion: 'Crear/activar categorías globales.', orden: 14, requierePuedeAprobar: false },
  { codigo: 'admin.usuarios', grupo: 'Administración', nombre: 'Administrar usuarios', descripcion: 'Cuentas de acceso del GP.', orden: 15, requierePuedeAprobar: false },
];

const DEFECTO: Record<string, string[]> = {
  contador: ['presupuesto.ver', 'presupuesto.editar_contrato', 'presupuesto.editar_periodos', 'modulos.ver', 'modulos.importar', 'modulos.limpiar', 'pagos.ver', 'pagos.operar'],
  gerente: ['presupuesto.ver', 'presupuesto.resumen_gerencial', 'modulos.ver', 'pagos.ver', 'pagos.aprobar', 'presupuesto.aprobar', 'presupuesto.aprobar_nomina'],
  superadmin: CATALOGO.map((c) => c.codigo),
};

const NOMBRES: Record<string, { nombre: string; descripcion: string }> = {
  contador: { nombre: 'Contador', descripcion: 'Opera su workspace; no aprueba ni administra.' },
  gerente: { nombre: 'Gerente', descripcion: 'Ve y decide sobre el workspace elegido; aprueba solo con puede_aprobar.' },
  superadmin: { nombre: 'Superadmin', descripcion: 'Todo + administra usuarios, auditoría y categorías.' },
};

/**
 * Roles y permisos del Gestor Presupuestal (backend Tesoreriabd, solo
 * superadmin). Equivale a la configuración del gestor original
 * (contador | gerente | superadmin).
 */
@Injectable({ providedIn: 'root' })
export class RolesPermisosService {

  /** Matriz por defecto (el gestor no expone configuración editable). */
  listar(): Observable<RolPermisos[]> {
    return new Observable<RolPermisos[]>((obs) => {
      obs.next(Object.keys(DEFECTO).map((rol) => ({
        rol,
        nombre: NOMBRES[rol].nombre,
        descripcion: NOMBRES[rol].descripcion,
        permisos: CATALOGO.map((c) => ({
          codigo: c.codigo, grupo: c.grupo, nombre: c.nombre, descripcion: c.descripcion,
          orden: c.orden, requierePuedeAprobar: c.requierePuedeAprobar,
          habilitado: DEFECTO[rol].includes(c.codigo),
        })),
      })));
      obs.complete();
    });
  }

  /** No soportado contra el backend del gestor: la matriz es la del rol. */
  guardarRol(rol: string, permisos: Record<string, boolean>): Observable<RolPermisos> {
    return new Observable<RolPermisos>((obs) => {
      obs.error(new Error('La configuración de permisos es fija en el backend del gestor (rol + puede_aprobar).'));
    });
  }
}
