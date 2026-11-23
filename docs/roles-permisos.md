# Roles y permisos de NEXA

> Implementación real (backend + frontend + BD + auditoría). La configuración
> se administra en **Configuración → Roles y permisos** (`/configuracion/roles-permisos`)
> y en **Usuarios y Accesos** (`/presupuesto/usuarios`).

## 1. Roles de negocio (catálogo único)

Fuente de verdad: `PresupuestoPermisosCatalogo` (backend) + tabla `presupuesto_rol_permiso`.

| Rol (`rolGp`) | Quién es en NEXA | Alcance |
|---|---|---|
| `contador` | Cualquier usuario con acceso operativo (por defecto) | Su workspace (o los asignados): importar SIIGO, contrato, periodos, nómina (digitar), categorizar, pagos proyectados y **egresos** (registrar, retenciones, enviar a revisión, solicitar eliminación). **No** aprueba, **no** administra. |
| `gerente` | Rol `ADMIN` de NEXA | Ve todos los workspaces: pago sugerido por proveedor, recalcular sugeridos, observaciones, Todas las Empresas, atajo de aprobar facturas con Pago Sugerido. |
| `superadmin` | Rol `SUPER_ADMIN` | Todo + usuarios + roles/permisos + auditoría + operar pagos + limpiar workspace. |
| `tesorero` | Rol `TESORERO` (BD: `Tesorería`) | Bandeja de egresos **ya aprobados por Gerencia Financiera**, tramitar pago (PAGADO) y validar comprobante. |
| `gerente_financiero` | Rol `GERENTE_FINANCIERO` (Gerencia Financiera) | Revisa los egresos del contador: aprueba (pasan a Tesorería) o rechaza con observación (vuelven al contador). |
| `director_contable` | Rol `DIRECTOR_CONTABLE` | Consulta presupuesto, abre años/meses y administra proveedores y categorías. No aprueba egresos. |
| `editor_contable` | Rol `EDITOR_CONTABLE` (BD: `Contabilidad`) | Aprobar/rechazar solicitudes de eliminación de egresos. |

**NO existe `gerente_ejecutivo`**: la regla es `rol = gerente AND puede_aprobar = true`
(ver `docs/seguridad-autorizacion.md`).

## 2. Permisos (agrupados)

Autenticación y sesión · Módulos financieros · Presupuesto · Pagos proyectados ·
Administración y notificaciones · **Control de egresos** · **Tesorería (pagos)** ·
**Aprobación de eliminaciones**.

Ver la matriz completa en `docs/matriz-permisos.md`.

## 3. `puede_aprobar`

- Controlado **exclusivamente por superadmin** (Usuarios y Accesos).
- Solo aplica a: `presupuesto.aprobar` (aprobar/rechazar) y `presupuesto.aprobar_nomina`.
- **`rol != gerente` + `puede_aprobar = true` NO convierte en aprobador** (regla implementada
  en `PresupuestoAutorizacionService`).
- Gerencia normal = `rol = gerente` + `puede_aprobar = false` (ve y opera, no aprueba).
- Gerente Ejecutivo = `rol = gerente` + `puede_aprobar = true` (aprueba/rechaza presupuesto y nómina).

## 4. Cómo se aplica (capas)

```
X-User-Name (identidad)
   ↓
PresupuestoAuthInterceptor  → existe + activo + acceso NEXA + rolGp + puede_aprobar
   ↓
PresupuestoEndpointsPermisos (matriz ENDPOINT → PERMISO)  → 403 si falta el permiso
   ↓
Servicios (EgresoRegistradoService, etc.) → permiso POR TRANSICIÓN + estado + causal oficial
   ↓
PresupuestoEmpresaService.resolverEmpresa → 403 si la empresa no está asignada (workspace isolation)
   ↓
Auditoría (presupuesto_auditoria)
```

- La pantalla de roles guarda en `presupuesto_rol_permiso` y **invalida la caché**:
  el cambio surte efecto inmediato (no hay JWT que revocar).
- El frontend oculta/deshabilita acciones (`*appGpPermiso`, `PresupuestoContextService.tienePermiso`)
  **solo como UX**; el backend siempre revalida.

## 5. Causales oficiales (40)

- Backend (autoridad): `PresupuestoCausales.ELIMINACION_EGRESO` (40), expuestas en
  `GET /api/contabilidad/egresos-registrados/causales-eliminacion`.
- El frontend las consume de ese endpoint (respaldo local en `control-egresos.model.ts`).
- Al solicitar eliminación el backend valida la causal: una inventada devuelve **422**
  y la oficial queda en el egreso (`causal_eliminacion`) con el solicitante.

## 6. Endpoints clave

| Acción | Endpoint | Permiso |
|---|---|---|
| Aprobar/rechazar presupuesto | `PUT /api/presupuesto/aprobar\|rechazar` | `presupuesto.aprobar` + rol gerente + `puede_aprobar` |
| Aprobar nómina | `PUT /api/presupuesto/periodos/{p}/nomina-aprobada` | `presupuesto.aprobar_nomina` + gerente + flag |
| Pago sugerido proveedor | `PUT /api/presupuesto/proveedores/{nit}/pago-sugerido` | `presupuesto.pago_sugerido_proveedor` |
| Agendar/pagar/eliminar pago | `POST/PUT/DELETE /api/presupuesto/pagos-proyectados…` | `pagos.operar` |
| Aprobar pago / sugeridas | `PUT …/{id}/aprobar`, `PUT …/sugeridos/aprobar` | `pagos.aprobar` / `pagos.aprobar_sugeridas` |
| Importar SIIGO | `POST /api/presupuesto/importacion/*` | `modulos.importar` |
| Limpiar módulo | `DELETE /api/presupuesto/{modulo}/limpiar` | `modulos.limpiar` |
| Registrar egreso | `POST /api/contabilidad/egresos-registrados` | `egresos.registrar` |
| Enviar a revisión de Gerencia Financiera | `PATCH …/{id}/estado` → EN_REVISION_GERENCIA | `egresos.enviar_tesoreria` |
| Aprobar/rechazar egreso | `PATCH …/{id}/estado` → ENVIADO_TESORERIA / REGISTRADO | `egresos.aprobar_gerencia` |
| Pagar (tesorero) | `PATCH …/{id}/estado` → PAGADO | `egresos.treasury.process_payment` |
| Validar comprobante | `POST /api/v1/comprobantes/validar` | `egresos.treasury.upload_receipt` |
| Solicitar eliminación | `PATCH …/{id}/estado` → ELIMINAR_SOLICITADO | `egresos.solicitar_eliminacion` + causal oficial |
| Aprobar/rechazar eliminación | `PATCH …/{id}/estado` → ELIMINADO / REGISTRADO | `egresos.deletion.approve` / `reject` |
| Ver auditoría | `GET /api/presupuesto/auditoria` | `admin.auditoria` |

## Reglas de operación del presupuesto (2026-10-07)

- Abrir años o meses exige `presupuesto.abrir_periodos`, asignado por defecto al Director Contable, al contador (únicamente para las empresas que tenga asignadas en `presupuesto_usuario_empresa`) y disponible para superadmin. `presupuesto.editar_periodos` permite editar datos, pero no abrir meses. Una asignación explícita del permiso permite designar otro responsable.
- El importador maestro está disponible en `/presupuesto/subir-archivos` y en el menú **Importar maestro**, protegido por `modulos.importar`. Sus advertencias aparecen al finalizar la importación.
- `admin.categorias` habilita Proveedores y Categorías en la navegación y sus rutas. Usuarios y Auditoría mantienen su acceso restringido.
- Un presupuesto aprobado bloquea cambios del contrato, periodos, importaciones, limpieza de módulos, categorización y pagos sugeridos. Rechazar el presupuesto libera ese candado; los cierres históricos siguen vigentes. Superadmin conserva su excepción al candado por aprobación.
- La nómina puede digitarse manualmente en meses editables. El importador maestro ignora las columnas de nómina y muestra advertencias; no sobrescribe esos valores.
- Aprobar un egreso en Gerencia Financiera lo pasa a Tesorería y aprueba automáticamente su pago vinculado. No exige una segunda aprobación manual del pago.
