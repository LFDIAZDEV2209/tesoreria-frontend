# Permisos por rol — Gestor Presupuestal

Documento de referencia de **quién puede hacer qué** en el Gestor Presupuestal
(proyecto de referencia en React/FastAPI) y su equivalencia en la migración a
NEXA / Tesorería (Angular + Spring Boot).

> Fuente de verdad backend: `gestor-presupuestal/backend/auth.py`
> (`requiere_contador`, `requiere_gerente_o_superadmin`, `requiere_puede_aprobar`,
> `requiere_superadmin`, `requiere_contador_o_superadmin`, `resolver_contador_id`).
> En NEXA se replica en `PresupuestoUsuario` + `PresupuestoAuthInterceptor`.

---

## 1. Roles

| Rol (gestor) | Descripción | Flags |
|---|---|---|
| **contador** | Dueño de su workspace. Todo lo que crea/importa queda bajo su `contador_id`. No ve datos de otro contador. | `es_workspace = true` (es una empresa). Un contador puede tener varias empresas (`UsuarioEmpresa` → `multiples_empresas`). |
| **gerente** | No tiene workspace propio. Ve el de cualquier contador eligiéndolo con `?como=<id>`. Puede ver todo, pero **solo aprueba si `puede_aprobar = true`** (Gerente Ejecutivo). Otros perfiles (Financiero, Director Contable) ven sin aprobar. | `puede_aprobar` configurable por superadmin. |
| **superadmin** | Todo lo del gerente **y siempre puede aprobar** (`puede_aprobar` se ignora). Además: gestiona cuentas (`/admin/usuarios`), ve la auditoría (`/admin/auditoria`), puede operar Pagos Proyectados y limpiar el workspace. | `puede_aprobar` efectivo = `true` siempre. |

Regla de aprobación del gestor (`_puede_aprobar`):

```
superadmin                      -> true
gerente con puede_aprobar=true  -> true
cualquier otro caso             -> false
```

---

## 2. Matriz de permisos por módulo/acción

Leyenda: ✅ permitido · ❌ prohibido (403) · 👁 solo lectura · ⚙️ requiere que el
workspace se resuelva con `?como=` (gerencia/superadmin).

### 2.1 Autenticación y sesión

| Acción | contador | gerente | superadmin |
|---|---|---|---|
| Login / logout / estado | ✅ | ✅ | ✅ |
| Editar su propio perfil (`PUT /auth/perfil`) | ✅ | ✅ | ✅ |
| Listar contadores (`GET /auth/contadores`, selector de empresa) | ✅ (solo los suyos) | ✅ | ✅ |

### 2.2 Módulos financieros (Proveedores, Anticipos, CxPagar, CxCobrar, Impuestos)

| Acción | contador | gerente | superadmin |
|---|---|---|---|
| Ver listados, resumen, exportar, plantilla (`GET`) | ✅ | 👁 ⚙️ | 👁 ⚙️ |
| Importar (preview/confirmar/estructura) | ✅ | ❌ | ❌ |
| Categorizar terceros (`PUT /categorias/asignar`, `POST /categorias/seed`) | ✅ | ❌ | ❌ |
| Limpiar datos del módulo (`DELETE /demo/{modulo}`) | ✅ | ❌ | ❌ |
| Cargar datos de ejemplo (`POST /demo/...`) | ✅ | ❌ | ❌ |
| Ver aprobación por factura (columna "Aprobación") | ✅ | ✅ | ✅ |

> En el gestor, gerencia/superadmin **ni siquiera navegan** estos módulos
> (`RequireContador` los redirige). En NEXA el backend aplica la misma regla
> (`PresupuestoModuloController`: "la importación la realiza el usuario operativo").

### 2.3 Presupuesto (contrato, períodos, mensual, consolidado)

| Acción | contador | gerente | superadmin |
|---|---|---|---|
| Ver contrato, períodos, mensual, consolidado, detalle | ✅ | 👁 ⚙️ | 👁 ⚙️ |
| Editar contrato (`PUT /presupuesto/contrato`) | ✅ | ❌ | ❌ |
| Editar período / flujo de caja / nómina (`PUT /periodos/{periodo}`) | ✅ | ❌ | ❌ |
| Observaciones por proveedor (`PUT /proveedores/{nit}/observacion`) | ✅ | ✅ ⚙️ | ✅ ⚙️ |
| Pago Sugerido por **categoría** (`PUT /presupuesto/pago-sugerido`) | ✅ | ❌ | ❌ |
| Pago Sugerido por **proveedor** (`PUT /proveedores/{nit}/pago-sugerido`) | ❌ | ✅ ⚙️ | ✅ ⚙️ |
| Recalcular sugeridos (`PUT /proveedores/recalcular-sugeridos`) | ❌ | ✅ ⚙️ | ✅ ⚙️ |
| **Aprobar / rechazar presupuesto** (`PUT /aprobar`, `PUT /rechazar`) | ❌ | ✅ solo si `puede_aprobar` ⚙️ | ✅ ⚙️ |
| **Aprobar nómina del mes** (`PUT /periodos/{periodo}/nomina-aprobada`) | ❌ | ✅ solo si `puede_aprobar` ⚙️ | ✅ ⚙️ |
| Resumen gerencial de **Todas las Empresas** (`GET /resumen-gerencial`) | ❌ | ✅ | ✅ |

### 2.4 Pagos Proyectados

| Acción | contador | gerente | superadmin |
|---|---|---|---|
| Ver listado, candidatos, sugeridos, resumen | ✅ | 👁 ⚙️ | 👁 ⚙️ |
| Crear / editar / eliminar pago, marcar pagado, importar, plantilla | ✅ | ❌ | ✅ ⚙️ (`requiere_contador_o_superadmin`) |
| Editar / eliminar un pago **ya pagado** | ❌ (bloqueado) | ❌ | ✅ con auditoría |
| Aprobar / desaprobar pago (`PUT /{id}/aprobar`) | ❌ | ✅ solo si `puede_aprobar` ⚙️ | ✅ ⚙️ |
| Aprobar facturas sugeridas / por proveedor con Pago Sugerido | ❌ | ✅ solo si `puede_aprobar` ⚙️ | ✅ ⚙️ |
| **Limpiar workspace** (`DELETE /bulk/limpiar-workspace`) | ❌ | ❌ | ✅ ⚙️ |

> "Limpiar workspace" borra todos los Pagos Proyectados de la empresa y deja en
> blanco el Pago Sugerido de sus proveedores. El Contrato y el Flujo de Caja
> (digitado a mano o importado) se conservan. Queda en auditoría.

### 2.5 Administración y notificaciones

| Acción | contador | gerente | superadmin |
|---|---|---|---|
| Ver notificaciones / marcar leídas | ✅ (las suyas) | ✅ ⚙️ | ✅ ⚙️ |
| Listar usuarios del GP (`GET /usuarios`) | ❌ | ❌ | ✅ |
| Crear / editar cuentas GP (`POST /usuarios`, `PUT /usuarios/{id}`) | ❌ | ❌ | ✅ |
| Asignar empresas a un usuario (`PUT /usuarios/{id}/empresas`) | ❌ | ❌ | ✅ |
| Ver auditoría (`GET /auditoria`) | ❌ | ❌ | ✅ |

### 2.6 Resolución del workspace (`?como=`)

| Rol | Workspace efectivo |
|---|---|
| contador con 1 empresa | Su propia cuenta (`contador_id = usuario.id`). |
| contador con varias empresas | Debe enviar `?como=<empresa>`; si no, 400. Solo empresas asignadas (403 si no). |
| gerente / superadmin | Debe enviar `?como=<contador activo con es_workspace>`; si falta, 400; inexistente/inactivo, 404. |

---

## 3. Gating de la interfaz (frontend del gestor)

| Elemento | contador | gerente | superadmin |
|---|---|---|---|
| Módulos financieros en el navbar | ✅ | ❌ | ❌ |
| "Todas las Empresas" (resumen gerencial) | ❌ | ✅ | ✅ |
| Presupuesto 2026 / Pagos Proyectados | ✅ (los suyos) | ✅ (del contador elegido) | ✅ |
| Botones Aprobar / Rechazar / nómina | ❌ | ✅ solo si `puede_aprobar` | ✅ |
| "Editar contrato" y celdas editables | ✅ | ❌ (solo lectura) | ❌ (solo lectura) |
| Pago Sugerido por proveedor editable | ❌ | ✅ | ✅ |
| Pagos: "Plantilla / Importar / Nuevo pago / Cargar ejemplo" | ✅ | ❌ | ✅ |
| Pagos: "Limpiar workspace" | ❌ | ❌ | ✅ |
| Menú Admin: **Usuarios** y **Auditoría** | ❌ | ❌ | ✅ |
| Selector de empresa (workspace) | Solo si tiene 2+ | ✅ | ✅ |

Rutas protegidas en el gestor: `RequireContador`, `RequireGerencia`,
`RequireSuperadmin`, `RequireSesion`, `RequireEmpresa`.

---

## 4. Equivalencia en Tesorería / NEXA

| Concepto gestor | Equivalente NEXA |
|---|---|
| contador | Usuario sin rol de gerencia (`USER...`) con empresa(s) en `presupuesto_usuario_empresa` (o la empresa de su empleado si no hay asignaciones). |
| gerente | Rol `ADMIN`. |
| superadmin | Rol `SUPER_ADMIN`. `PresupuestoUsuario.superAdmin = true`. |
| `puede_aprobar` | Columna `users.puede_aprobar`: `true`/`false` explícito; `null` = hereda del rol (ADMIN/SUPER_ADMIN pueden aprobar). Endpoint `GET /api/presupuesto/permisos`. |
| `?como=` | `empresaId` explícito en cada request; `PresupuestoEmpresaService.resolverEmpresa` valida acceso. |
| Menú Admin > Usuarios | Página **Usuarios** del GP (`/presupuesto/usuarios`, superadmin) + endpoints `GET/PUT /api/presupuesto/usuarios`. Creación de cuentas y cambio de clave: gestión de usuarios de NEXA. |
| Menú Admin > Auditoría | Página **Auditoría** del GP (`/presupuesto/auditoria`). En NEXA el backend la permite a Gerencia (`ADMIN`/`SUPER_ADMIN`). |
| Limpiar workspace | `DELETE /api/presupuesto/pagos-proyectados/bulk/limpiar-workspace` (superadmin). |
| Limpiar módulo | `DELETE /api/presupuesto/{modulo}/limpiar` (operativo). |
| Demo (cargar datos de ejemplo) | **No migrado** (decisión de alcance); solo se migró "Limpiar". |

### Resumen de permisos efectivos en NEXA

| | Operativo (contador) | ADMIN (gerencia) | SUPER_ADMIN |
|---|---|---|---|
| Ve todas las empresas | Solo asignadas | ✅ | ✅ |
| Importa / limpia módulos | ✅ | ❌ | ❌ |
| Edita contrato, períodos, flujo, nómina | ✅ | ❌ | ❌ |
| Aprobar/rechazar presupuesto y nómina | ❌ | ✅ si `puede_aprobar ≠ false` | ✅ |
| Aprueba pagos / sugeridos | ❌ | ✅ si `puede_aprobar ≠ false` | ✅ |
| Opera pagos (crear/editar/pagar/importar) | ✅ | ❌ | ✅ |
| Edita/elimina pagos ya pagados | ❌ | ❌ | ✅ (auditado) |
| Limpiar workspace de pagos | ❌ | ❌ | ✅ |
| Resumen "Todas las Empresas" / Auditoría | ❌ | ✅ | ✅ |
| Pantalla Usuarios (empresas + `puede_aprobar`) | ❌ | ❌ | ✅ |

---

## 5. Configuración de roles y permisos en NEXA (superadmin)

La matriz de este documento es la fuente de los valores por defecto que siembra
la migración `V2075__crear_presupuesto_roles_permisos.sql` (Tesoreriabd,
tabla `presupuesto_rol_permiso`). El superadmin puede verla y editarla desde:

- **Entrada**: sidebar → tarjeta **Sesión activa** → **Mi Perfil** → **Configuraciones de Administración** → **Gestión de Roles y Permisos**.
- **Ruta**: `/configuracion/roles-permisos` (guard de `SUPER_ADMIN`).
- **Pantalla**: `src/app/features/configuracion-superadmin/pages/roles-permisos/`.
- **Backend**: `GET/PUT /api/presupuesto/configuracion/roles-permisos[/{rol}]`
  (`PresupuestoConfiguracionController`, solo superadmin); catálogo y defaults
  en `PresupuestoPermisosCatalogo`; cada guardado queda en auditoría.

> Por ahora la pantalla administra la matriz (los roles y permisos son
> exactamente los de las tablas 2.x/3); el gating real del módulo sigue siendo
> el descrito arriba. Aplicar la configuración al comportamiento del GP es una
> fase posterior.
