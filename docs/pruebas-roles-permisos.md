# Pruebas de roles y permisos

## 1. Pruebas unitarias backend (JUnit + Mockito)

Clases nuevas/actualizadas:

| Clase | Casos |
|---|---|
| `PresupuestoAutorizacionServiceTest` (11) | contador (positivos y negativos), contador con `puede_aprobar=true` que **no** aprueba, gerencia normal, gerente ejecutivo, superadmin (todo), tesorero, editor contable, matriz revocada/ampliada, permiso desconocido |
| `PresupuestoEndpointsPermisosTest` (7) | contrato/periodos, aprobar/rechazar, pagos (operar/aprobar/sugeridas/limpiar), módulos, egresos (específicas antes que genéricas), rutas sin regla, query string y método incorrecto |
| `PresupuestoAuthInterceptorTest` (12) | 401 (sin header/inexistente/inactivo/sin acceso), superadmin entra sin fila, admin hereda aprobación, operativo no, flag TRUE/FALSE, rol de negocio tesorero/editor, ruta con regla + permiso denegado → 403, permiso concedido → pasa |
| `PresupuestoCausalesTest` (4) | 40 causales, únicas y no vacías; acepta oficial (con tolerancia de espacios/mayúsculas); rechaza inventadas/null/SQL; devuelve el texto canónico |

Ejecución: `mvnw test -Dtest=Presupuesto*Test` (34 casos) — **todos en verde**.

> Nota: se corrigió `PresupuestoAuthInterceptorTest`, que estaba desactualizado
> (constructor de 1 argumento cuando la clase ya recibía 2) y **no compilaba**.

## 2. Matriz de pruebas por API (endpoints reales, sin UI)

Ejecutadas contra `localhost:8080` con el header `X-User-Name` (identidad real):

| Rol | Permiso / acción | Endpoint | Resultado |
|---|---|---|---|
| contador (`alberto.valle`) | aprobar presupuesto | `PUT /api/presupuesto/aprobar` | **403** ✔ |
| contador | editar pago sugerido | `PUT /api/presupuesto/proveedores/{nit}/pago-sugerido` | **403** ✔ |
| contador | ver auditoría | `GET /api/presupuesto/auditoria` | **403** ✔ |
| contador | consultar pagos | `GET /api/presupuesto/pagos-proyectados` | **200** ✔ |
| contador | workspace ajeno | `GET /api/presupuesto/contrato?empresaId=11` | **403** ✔ (isolation) |
| gerente ejecutivo (`analista.datos`, `puede_aprobar` heredado) | aprobar presupuesto | `PUT /api/presupuesto/aprobar` | **200** ✔ |
| superadmin (`admin`) | ver auditoría | `GET /api/presupuesto/auditoria` | **200** ✔ |
| tesorero (`zz.tesorero`) | bandeja de pagos | `GET /api/contabilidad/egresos-registrados/para-tesoreria` | **200** ✔ |
| tesorero | registrar egreso | `POST /api/contabilidad/egresos-registrados` | **403** ✔ |
| tesorero | aprobar presupuesto | `PUT /api/presupuesto/aprobar` | **403** ✔ |
| editor (`zz.editor`) | ver solicitudes | `GET …/solicitudes-eliminacion` | **200** ✔ |
| editor | registrar egreso | `POST …/egresos-registrados` | **403** ✔ |
| contador | ver solicitudes de eliminación | `GET …/solicitudes-eliminacion` | **403** ✔ |
| usuario inexistente/sin acceso | cualquier ruta protegida | — | **401** ✔ |

## 3. Flujo completo de egresos (extremo a extremo)

| # | Paso | Actor | Resultado |
|---|---|---|---|
| 1 | Crear egreso | contador | **201** ✔ |
| 2 | Enviar a Tesorería | contador | **200** ✔ |
| 3 | Intentar pagar | editor | **403** (“no tiene el permiso Tramitar el pago”) ✔ |
| 4 | Pagar | tesorero | **200** ✔ |
| 5 | Crear 2.º egreso | contador | **201** ✔ |
| 6 | Solicitar eliminación con causal **inventada** | contador | **422** (“no es válida… elija una oficial”) ✔ |
| 7 | Solicitar eliminación con causal **oficial** | contador | **200** ✔ |
| 8 | Intentar aprobar la eliminación | tesorero | **403** ✔ |
| 9 | Ver solicitud (con `solicitadoPor`) | editor | **200** ✔ |
| 10 | Aprobar eliminación | editor | **200** ✔ |

Los egresos de prueba (`ZZ-TEST-*`) se eliminaron al terminar.

## 4. Pruebas del switch `puede_aprobar`

- superadmin: puede activarlo/desactivarlo (`admin.usuarios_editar` + auditoría).
- `rol = contador` + `puede_aprobar = true` → **no** aprueba (caso unitario
  `contadorConPuedeAprobarTrueNOLoSConvierteEnAprobador`).
- `rol = gerente` + flag → aprueba; sin flag → 403 con mensaje explicativo
  (“requiere «Puede aprobar»”).

## 5. Cómo reproducir

```powershell
# Backend: pruebas unitarias
cd Tesoreriabd; .\mvnw.cmd test "-Dtest=Presupuesto*Test"

# API (con el backend arriba y datos de ejemplo)
$h = @{ 'X-User-Name' = 'alberto.valle' }
Invoke-WebRequest -Uri "http://localhost:8080/api/presupuesto/aprobar?empresaId=30" -Method PUT -Headers $h   # → 403
```

## 6. Pendientes de prueba

- Tests de UI (el proyecto frontend no tiene infraestructura de tests: 0 specs).
- Matriz completa de `/api/tesoreria/**` (fase siguiente).
