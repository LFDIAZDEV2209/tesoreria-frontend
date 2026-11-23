# Seguridad y autorización (backend)

## 1. Modelo de identidad

NEXA **no usa JWT**: la identidad viaja en el header `X-User-Name` (lo agrega el
interceptor del frontend a TODAS las peticiones). El backend:

1. `PresupuestoAuthInterceptor` valida existencia + `active` + acceso a NEXA
   (`usuario_acceso_nexa`), calcula `gerencia`/`puedeAprobar` y **resuelve el rol de
   negocio** (`superadmin | gerente | tesorero | editor_contable | contador`).
2. `PresupuestoEndpointsPermisos` mapea **método + ruta → permiso**; si la ruta tiene
   regla y el permiso no está concedido → **403**.
3. Los servicios aplican reglas finas (transición de estado, causal oficial, workspace).

Ventaja de no usar JWT: **la revocación es inmediata** (el estado se lee de la BD en
cada request; la matriz tiene caché invalidada al guardar). No hay claims obsoletos.

## 2. Rutas protegidas

`/api/presupuesto/**` · `/api/contabilidad/**` · `/api/tesoreria/**` · `/api/v1/comprobantes/**`
(registradas en `PresupuestoWebConfig`).

## 3. Regla `puede_aprobar`

```java
if (permiso.requierePuedeAprobar()) {
    boolean esGerenteOSuperadmin = usuario.superAdmin() || "gerente".equals(rolGp);
    if (!esGerenteOSuperadmin || !usuario.puedeAprobar()) return false;   // 403
}
```

- Solo `presupuesto.aprobar` (aprobar/rechazar) y `presupuesto.aprobar_nomina` la exigen.
- Un `contador`/`tesorero`/`editor_contable` con `puede_aprobar = true` **no** aprueba.
- El switch `puede_aprobar` lo administra únicamente el superadmin
  (`PUT /api/presupuesto/usuarios/{id}` → `admin.usuarios_editar`, con auditoría).

## 4. Workspace isolation

`PresupuestoEmpresaService.resolverEmpresa(usuario, empresaId)` se invoca en las rutas
de datos del GP (y en `exigirConEmpresa`):

- Gerencia (`SUPER_ADMIN`/`ADMIN`) ve todas.
- Operativo: solo `presupuesto_usuario_empresa` asignadas (o la empresa de su empleado).
- Empresa inexistente o no asignada → **403** (`PresupuestoForbiddenException`).

## 5. Estados y transiciones (egresos)

`EgresoRegistradoService.actualizarEstado` valida, en este orden:

1. Transición permitida: `REGISTRADO→EN_REVISION_GERENCIA→ENVIADO_TESORERIA→PAGADO`;
   `EN_REVISION_GERENCIA→REGISTRADO` (rechazo de Gerencia Financiera, con observación obligatoria);
   `REGISTRADO|EN_REVISION_GERENCIA|ENVIADO_TESORERIA→ELIMINAR_SOLICITADO`;
   `ELIMINAR_SOLICITADO→ELIMINADO|REGISTRADO`.
2. **Permiso de ESA transición** (`egresos.enviar_tesoreria` para enviar a revisión,
   `egresos.aprobar_gerencia` para aprobar/rechazar —Gerencia Financiera—,
   `egresos.treasury.process_payment` para pagar, `egresos.solicitar_eliminacion`,
   `egresos.deletion.approve/reject`).
3. Blindaje anti-duplicado (factura+NIT+valor+fecha) antes de enviar a revisión,
   aprobar, enviar a Tesorería o pagar.
4. Causal **oficial** obligatoria para `ELIMINAR_SOLICITADO` (si no pertenece a las 40 → 422);
   observación obligatoria para el rechazo de Gerencia Financiera (si falta → 422).

## 6. Manejo de errores

| Código | Cuándo |
|---|---|
| 401 | Sin `X-User-Name`, usuario inexistente/inactivo o sin acceso a NEXA |
| 403 | Autenticado pero sin permiso/rol/workspace/estado válido |
| 404 | Recurso inexistente (`ResourceNotFoundException`) |
| 422 | Validación de negocio (`TesoreriaValidationException` / `PresupuestoValidationException`) |

## 7. Auditoría

`presupuesto_auditoria` (usuario, acción, entidad, detalle, fecha) vía
`PresupuestoAuditoriaService.registrar(...)`. Cubre: aprobar/rechazar presupuesto,
nómina, pago sugerido, borrar pagos, solicitar/aprobar/rechazar eliminaciones de
egresos, alta/edición de usuarios, cambio de rol, asignación de empresas, reset de
clave y cambios de la matriz de permisos. **Nunca** registra contraseñas, tokens ni OTP.

## 8. Frontend (solo experiencia)

- `PresupuestoContextService.tienePermiso(codigo)` / `rolGp()` leen `GET /api/presupuesto/permisos`.
- Directiva `*appGpPermiso="'pagos.operar'"` oculta acciones no permitidas y se
  re-evalúa cuando llega la respuesta.
- Mensajes claros cuando falta el permiso; **la ocultación nunca sustituye al backend**.

## 9. Pendientes conocidos

- `/api/tesoreria/**` (Control de Bancos legado) conserva la validación de identidad;
  su matriz de permisos específica queda para la siguiente fase (no se rompió nada).
- El helper `msj()` del frontend muestra el mensaje del backend (que no revela
  información sensible: rol + nombre del permiso).
