# Matriz de permisos (Rol → Permiso → Vista → Acción → Endpoint)

Leyenda: ✔ = permitido por defecto · ⚙ = permitido solo si además
`puede_aprobar = true` **y** rol `gerente`/`superadmin` · — = no permitido.

| Módulo | Vista | Acción | Permiso | Endpoint | contador | gerente | tesorero | editor_contable | superadmin |
|---|---|---|---|---|---|---|---|---|---|
| Sesión | Login | Entrar/salir | `auth.login` | `POST /api/auth/login` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Sesión | Mi Perfil | Editar perfil | `auth.perfil` | `/api/users/*` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Sesión | Selector | Cambiar empresa | `auth.selector_empresa` | `GET /api/presupuesto/empresas` | ✔ | ✔ | — | — | ✔ |
| Módulos | Proveedores/Anticipos/CxP/CxC/Impuestos | Consultar/exportar | `modulos.ver` | `GET /api/presupuesto/{modulo}` · `…/resumen` · `…/exportar` | ✔ | ✔ | — | — | ✔ |
| Módulos | Import wizard | Importar SIIGO | `modulos.importar` | `POST /api/presupuesto/importacion/preview\|confirmar\|maestro` | ✔ | — | — | — | ✔ |
| Módulos | Tabla | Asignar categoría | `modulos.categorizar` | `PUT /api/presupuesto/categorias/asignar` | ✔ | — | — | — | ✔ |
| Módulos | Tabla | Limpiar módulo | `modulos.limpiar` | `DELETE /api/presupuesto/{modulo}/limpiar` | ✔ | — | — | — | ✔ |
| Módulos | Rail | Cargar ejemplo | `modulos.demo` | `POST /api/presupuesto/demo/completo` · `categorias/seed` | ✔ | — | — | — | ✔ |
| Módulos | Facturas | Ver aprobación | `modulos.ver_aprobacion` | `GET /api/presupuesto/proveedores` | ✔ | ✔ | — | — | ✔ |
| Presupuesto | Presupuesto 2026 | Consultar | `presupuesto.ver` | `GET /api/presupuesto/contrato\|periodos\|mensual` | ✔ | ✔ | — | — | ✔ |
| Presupuesto | Contrato | Editar contrato | `presupuesto.editar_contrato` | `PUT /api/presupuesto/contrato` | ✔ | — | — | — | ✔ |
| Presupuesto | Mensual | Editar meses | `presupuesto.editar_periodos` | `PUT /api/presupuesto/periodos/{p}` | ✔ | — | — | — | ✔ |
| Presupuesto | Terceros | Observaciones | `presupuesto.observaciones` | `PUT /api/presupuesto/consolidado/observacion/{nit}` | ✔ | ✔ | — | — | ✔ |
| Presupuesto | Consolidado | Pago sugerido categoría | `presupuesto.pago_sugerido_categoria` | `PUT /api/presupuesto/consolidado/pago-sugerido` | ✔ | — | — | — | ✔ |
| Presupuesto | Proveedores | Pago sugerido proveedor | `presupuesto.pago_sugerido_proveedor` | `PUT /api/presupuesto/proveedores/{nit}/pago-sugerido` | — | ✔ | — | — | ✔ |
| Presupuesto | Proveedores | Recalcular sugeridos | `presupuesto.recalcular_sugeridos` | `PUT /api/presupuesto/proveedores/recalcular-sugeridos` | — | ✔ | — | — | ✔ |
| Presupuesto | Presupuesto 2026 | Aprobar/rechazar | `presupuesto.aprobar` | `PUT /api/presupuesto/aprobar\|rechazar` | — | ⚙ | — | — | ✔ |
| Presupuesto | Nómina | Aprobar nómina | `presupuesto.aprobar_nomina` | `PUT /api/presupuesto/periodos/{p}/nomina-aprobada` | — | ⚙ | — | — | ✔ |
| Presupuesto | Todas las Empresas | Ver resumen | `presupuesto.resumen_gerencial` | `GET /api/presupuesto/resumen-gerencial` | — | ✔ | — | — | ✔ |
| Pagos | Pagos Proyectados | Consultar | `pagos.ver` | `GET /api/presupuesto/pagos-proyectados…` | ✔ | ✔ | — | — | ✔ |
| Pagos | Pagos Proyectados | Agendar/editar/pagar/eliminar/importar | `pagos.operar` | `POST/PUT/DELETE /api/presupuesto/pagos-proyectados…` | ✔ | — | — | — | ✔ |
| Pagos | Pagos Proyectados | Corregir pagados | `pagos.editar_pagados` | `PUT …/{id}` (pagado) | — | — | — | — | ✔ |
| Pagos | Pagos Proyectados | Aprobar pago | `pagos.aprobar` | `PUT …/{id}/aprobar` | — | ✔ | — | — | ✔ |
| Pagos | Sugeridos | Aprobar facturas | `pagos.aprobar_sugeridas` | `PUT …/sugeridos/aprobar` · `…/proveedores/{nit}/aprobar-sugerido` | — | ✔ | — | — | ✔ |
| Pagos | Workspace | Limpiar workspace | `pagos.limpiar_workspace` | `DELETE …/bulk/limpiar-workspace` | — | — | — | — | ✔ |
| Egresos | Control de Egresos | Registrar/cotizar/duplicados | `egresos.registrar` | `POST /api/contabilidad/egresos-registrados` · `/cotizar` · `GET /check-duplicado` | ✔ | — | — | — | ✔ |
| Egresos | Control de Egresos | Consultar | `egresos.ver` | `GET /api/contabilidad/egresos-registrados[/{id}]` | ✔ | — | ✔ | ✔ | ✔ |
| Egresos | Control de Egresos | Ajustar retenciones | `egresos.editar_retenciones` | `PATCH …/{id}/retenciones` | ✔ | — | — | — | ✔ |
| Egresos | Control de Egresos | Enviar a revisión | `egresos.enviar_tesoreria` | `PATCH …/{id}/estado` (EN_REVISION_GERENCIA) | ✔ | — | — | — | ✔ |
| Egresos | Control de Egresos | Aprobar/rechazar egreso (Gerencia Financiera) | `egresos.aprobar_gerencia` | `PATCH …/{id}/estado` (ENVIADO_TESORERIA o REGISTRADO con observación) | — | — | — | — | ✔ |
| Egresos | Control de Egresos | Solicitar eliminación | `egresos.solicitar_eliminacion` | `PATCH …/{id}/estado` (ELIMINAR_SOLICITADO) + causal oficial | ✔ | — | — | — | ✔ |
| Tesorería | Bandeja de egresos | Ver enviados | `egresos.tesoreria.listar` | `GET …/para-tesoreria` | — | — | ✔ | — | ✔ |
| Tesorería | Tramitar pago | Pagar/confirmar | `egresos.treasury.process_payment` | `PATCH …/{id}/estado` (PAGADO) | — | — | ✔ | — | ✔ |
| Tesorería | Comprobante | Validar comprobante | `egresos.treasury.upload_receipt` | `POST /api/v1/comprobantes/validar` | — | — | ✔ | — | ✔ |
| Eliminaciones | Aprobación Egresos | Ver solicitudes | `egresos.deletion.listar` | `GET …/solicitudes-eliminacion` | — | — | — | ✔ | ✔ |
| Eliminaciones | Aprobación Egresos | Aprobar | `egresos.deletion.approve` | `PATCH …/{id}/estado` (ELIMINADO) | — | — | — | ✔ | ✔ |
| Eliminaciones | Aprobación Egresos | Rechazar | `egresos.deletion.reject` | `PATCH …/{id}/estado` (REGISTRADO) | — | — | — | ✔ | ✔ |
| Admin | Notificaciones | Ver/leer | `admin.notificaciones` | `GET/PUT /api/presupuesto/notificaciones` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Admin | Usuarios y Accesos | Listar | `admin.usuarios_listar` | `GET /api/presupuesto/usuarios` | — | — | — | — | ✔ |
| Admin | Usuarios y Accesos | Editar/activar/clave | `admin.usuarios_editar` | `PUT /api/presupuesto/usuarios/{id}` · `…/password` | — | — | — | — | ✔ |
| Admin | Usuarios y Accesos | Asignar empresas | `admin.usuarios_empresas` | `PUT /api/presupuesto/usuarios/{id}/empresas` | — | — | — | — | ✔ |
| Admin | Roles y permisos | Configurar matriz | `roles.manage` (superadmin-only por controlador) | `GET/PUT /api/presupuesto/configuracion/roles-permisos` | — | — | — | — | ✔ |
| Admin | Auditoría | Ver bitácora | `admin.auditoria` | `GET /api/presupuesto/auditoria` | — | — | — | — | ✔ |

> La matriz vive en código en `PresupuestoEndpointsPermisos` (endpoint → permiso) y en
> `presupuesto_rol_permiso` (rol → permiso). Los permisos con ⚙ exigen `puede_aprobar`.
>
> **Rol `gerente_financiero` (Gerencia Financiera, NEXA `GERENTE_FINANCIERO`):**
> `auth.login`, `auth.perfil`, `auth.selector_empresa`, `egresos.ver`,
> `egresos.aprobar_gerencia`, `admin.notificaciones`. Aprueba (→ Tesorería) o
> rechaza con observación (→ contador) los egresos en `EN_REVISION_GERENCIA`.

## Director Contable y reglas transversales (2026-10-07)

| Acción | Permiso | Director Contable | Contador por defecto | Superadmin |
|---|---|---|---|---|
| Consultar presupuesto | `presupuesto.ver` | Sí | Sí | Sí |
| Abrir años y meses | `presupuesto.abrir_periodos` | Sí | Sí, solo de sus empresas asignadas | Sí |
| Administrar proveedores y categorías | `admin.categorias` | Sí | No | Sí |
| Editar periodos y nómina manual | `presupuesto.editar_periodos` | No | Sí | Sí |

El rol NEXA es `DIRECTOR_CONTABLE` y el rol GP es `director_contable`. Sus otros permisos predeterminados son `auth.login`, `auth.perfil`, `auth.selector_empresa` y `admin.notificaciones`. No recibe aprobación de egresos ni administración de usuarios.

Los permisos de escritura no evitan el candado por presupuesto aprobado: contrato, periodos, limpieza, categorías, importaciones y pagos sugeridos quedan bloqueados hasta rechazarlo (con excepción de superadmin). El importador maestro ignora nómina y devuelve `advertencias`, visibles al finalizar. Aprobar el egreso también aprueba su pago vinculado antes de enviarlo a Tesorería.
