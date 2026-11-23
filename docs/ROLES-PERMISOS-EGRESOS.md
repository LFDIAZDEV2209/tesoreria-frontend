# Roles y permisos — Módulo Control de Egresos (Contabilidad ↔ Tesorería)

Documento funcional para quien implementa **roles y permisos**.
Fecha: 2026-09-16 · Rama: `feature/control-egresos`

---

## 1. Flujo del proceso

```
CONTADOR registra egreso (formulario + imagen OCR, retenciones)
   → estado REGISTRADO
   → envía a revisión → estado EN_REVISION_GERENCIA
GERENCIA FINANCIERA (rol gerente_financiero) lo revisa
   → aprueba → estado ENVIADO_TESORERIA (pasa al módulo de Tesorería)
   → rechaza con observación → estado REGISTRADO (vuelve al contador)
TESORERO lo ve en bandeja, verifica duplicado y monto
   → tramita el pago (sube comprobante, el sistema compara)
   → confirma el egreso designado → estado PAGADO
Si hay que borrarlo: CONTADOR solicita eliminación con causal
   → estado ELIMINAR_SOLICITADO
EDITOR CONTABLE aprueba (→ ELIMINADO) o rechaza (→ REGISTRADO)
```

Reglas duras (ya implementadas en backend):
- El **número de egreso es único global**: no se puede repetir aunque cambien NIT/valor/fecha (solo reutilizable si fue ELIMINADO). Error `422`.
- Transiciones válidas: `REGISTRADO → EN_REVISION_GERENCIA → ENVIADO_TESORERIA → PAGADO`;
  `EN_REVISION_GERENCIA → REGISTRADO` (rechazo de Gerencia Financiera, con observación obligatoria);
  `REGISTRADO|EN_REVISION_GERENCIA|ENVIADO_TESORERIA → ELIMINAR_SOLICITADO`;
  `ELIMINAR_SOLICITADO → ELIMINADO (aprueba) | REGISTRADO (rechaza)`.
- **Nadie llega a Tesorería sin la aprobación de Gerencia Financiera** (no existe el salto directo).
- La solicitud de eliminación **exige causal** (40 causales oficiales, ver §5).
- En tramitar-pago solo se deja pagar si NO hay duplicado y el monto del
  comprobante coincide con el total a pagar.

---

## 2. Rol CONTADOR

**Responsabilidad:** dice cuánto hay que pagar. Registra cada egreso una sola vez.

**Vistas (frontend):**
- `Contabilidad → Control Egresos` (`/contabilidad/control-egresos`)

**Puede:**
- Registrar egresos (formulario manual o subiendo imagen/factura con OCR).
- Ver la lista de egresos, sus retenciones (fuente + ICA) y el neto a pagar.
- Editar retenciones manualmente (botón `Rete.`, modal de ajuste).
- Enviar el egreso a aprobación de Gerencia Financiera (botón `Enviar`).
- Solicitar la eliminación de un egreso **con causal obligatoria** (botón `Eliminar` → modal).
- Ver el aviso de "primera y única vez" y los bloqueos por duplicado.

**NO puede:**
- Eliminar directamente (solo solicitar; lo aprueba el editor).
- Tramitar pagos ni marcar PAGADO.
- Aprobar o rechazar eliminaciones.

## 3. Rol TESORERO

**Responsabilidad:** hace el pago. Sube el comprobante y el sistema compara.

**Vistas (frontend):**
- `Tesorería → Bandeja → pestaña Egresos del Contador` (`/tesoreria/bandeja`)
- `Tesorería → Tramitar Pago` (`/tesoreria/tramitar-pago/:id`)

**Puede:**
- Ver egresos enviados con su monto, verificación de duplicado (`✓ Verificado` / `⚠ Duplicado`).
- Entrar a tramitar pago: ver N° egreso, desglose (bruto − retefuente − reteica = neto) y tarjeta **Pago Proyectado**.
- Subir/arrastrar el comprobante de pago (PDF, imagen, Excel).
- Confirmar el pago en el modal *"Este es el egreso que el contador le ha designado pagar"* (solo si el monto coincide y no hay duplicado).

**NO puede:**
- Registrar ni editar egresos.
- Editar retenciones.
- Eliminar ni aprobar eliminaciones.

## 3.1 Rol GERENCIA FINANCIERA (rol `gerente_financiero`)

**Responsabilidad:** revisa los egresos que monta el contador antes de que lleguen a Tesorería.

**Vistas (frontend):**
- `Contabilidad → Control Egresos` (`/contabilidad/control-egresos`) — KPI "En revisión — G. Financiera" y acciones Aprobar / Rechazar.

**Puede:**
- Ver los egresos de sus empresas con su evidencia (factura, retenciones, neto, pago proyectado).
- **Aprobar**: el egreso pasa a `ENVIADO_TESORERIA` y aparece en la bandeja del tesorero.
- **Rechazar con observación obligatoria**: vuelve a `REGISTRADO` con el motivo visible para el contador.

**NO puede:**
- Registrar ni editar egresos, ajustar retenciones, enviar a Tesorería,
  pagar ni aprobar eliminaciones.

## 4. Rol EDITOR CONTABLE (aprueba eliminaciones)

**Responsabilidad:** decide sobre las solicitudes de eliminación.

**Vistas (frontend):**
- `Contabilidad → Aprobación Egresos` (`/contabilidad/aprobacion-egresos`)

**Puede:**
- Ver la bandeja de solicitudes (N° egreso, proveedor, neto, **quién la solicitó y la causal**).
- **Aprobar** (el egreso pasa a ELIMINADO y desaparece de las listas).
- **Rechazar** (el egreso vuelve a REGISTRADO).

**NO puede:**
- Registrar, editar retenciones, enviar a tesorería ni tramitar pagos.
  (Si también es contador en la práctica, tendrá ambos roles.)

## 5. Causales de cancelación / eliminación (lista oficial)

Al solicitar la eliminación la causal es **obligatoria** (una de estas 40):

Egreso creado por error · Egreso duplicado · Valor incorrecto ·
Beneficiario incorrecto · Cuenta bancaria incorrecta · Concepto incorrecto ·
Soporte inválido · Soporte inexistente · Factura anulada · Operación anulada ·
Pago no autorizado · Falta de aprobación · Cambio en el valor a pagar ·
Nota crédito aplicada · Obligación cancelada · Servicio o producto no adquirido ·
Error contable · Error de parametrización · Centro de costo incorrecto ·
Cuenta contable incorrecta · Datos del proveedor incorrectos ·
Pago rechazado por la entidad financiera · Cuenta bancaria inactiva o bloqueada ·
Cambio de beneficiario · Solicitud de cancelación del área responsable ·
Registro generado fuera del proceso autorizado · Registro generado en período incorrecto ·
Incumplimiento de requisitos documentales · Inconsistencia entre factura y egreso ·
Reversión de la operación · Cambio en las condiciones de pago ·
Error en la fecha de pago · Error en el tipo de moneda · Error en la tasa de cambio ·
Egreso no corresponde a la operación · Egreso generado por error del sistema ·
Egreso generado por carga masiva incorrecta · Proveedor no autorizado ·
Operación sujeta a revisión o auditoría · Otra causal debidamente justificada

---

## 6. Matriz de permisos sugerida (para implementar)

| Recurso / acción | CONTADOR | GERENCIA FINANCIERA | TESORERO | EDITOR_CONTABLE | ADMIN |
|---|---|---|---|---|---|
| Ver Control de Egresos y registrar | ✅ | ❌ (solo ver) | ❌ | ❌ | ✅ |
| Enviar a revisión de Gerencia Financiera | ✅ | ❌ | ❌ | ❌ | ✅ |
| Aprobar / rechazar el egreso en revisión | ❌ | ✅ | ❌ | ❌ | ✅ |
| Enviar a Tesorería | ❌ (automático al aprobar) | ❌ | ❌ | ❌ | ❌ |
| Ajustar retenciones manual | ✅ | ❌ | ❌ | ❌ | ✅ |
| Solicitar eliminación (con causal) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Ver bandeja Tesorería / tramitar pago | ❌ | ❌ | ✅ | ❌ | ✅ |
| Subir comprobante y confirmar pago | ❌ | ❌ | ✅ | ❌ | ✅ |
| Ver bandeja Aprobación Egresos | ❌ | ❌ | ❌ | ✅ (solo ver otros roles) | ✅ |
| Aprobar / rechazar eliminación | ❌ | ❌ | ❌ | ✅ | ✅ |

Roles: `contador`, `gerente_financiero`, `tesorero`, `editor_contable`, `ADMIN` (Gerencia NEXA).

### Endpoints backend involucrados (`/api/contabilidad/egresos-registrados`)
| Endpoint | CONTADOR | GERENCIA FINANCIERA | TESORERO | EDITOR |
|---|---|---|---|---|
| `POST /` (registrar) | ✅ | ❌ | ❌ | ❌ |
| `GET /` (listar) | ✅ | ✅ | ❌ | ❌ |
| `POST /cotizar` | ✅ | ❌ | ❌ | ❌ |
| `GET /check-duplicado` | ✅ | ❌ | ✅ (verificación) | ❌ |
| `GET /para-tesoreria` | ❌ | ❌ | ✅ | ❌ |
| `GET /{id}` | ✅ | ✅ | ✅ | ✅ |
| `PATCH /{id}/estado` → `EN_REVISION_GERENCIA` | ✅ | ❌ | ❌ | ❌ |
| `PATCH /{id}/estado` → `ENVIADO_TESORERIA` | ❌ | ✅ (aprobación) | ❌ | ❌ |
| `PATCH /{id}/estado` → `REGISTRADO` (rechazo con observación) | ❌ | ✅ | ❌ | ❌ |
| `PATCH /{id}/estado` → `PAGADO` | ❌ | ❌ | ✅ | ❌ |
| `PATCH /{id}/estado` → `ELIMINAR_SOLICITADO` (+causal) | ✅ | ❌ | ❌ | ❌ |
| `PATCH /{id}/estado` → `ELIMINADO` / `REGISTRADO` (resolver) | ❌ | ❌ | ❌ | ✅ |
| `PATCH /{id}/retenciones` | ✅ | ❌ | ❌ | ❌ |
| `GET /solicitudes-eliminacion` | ❌ | ❌ | ❌ | ✅ |

### Rutas frontend por rol
- Contador: `/contabilidad/control-egresos`
- Gerencia Financiera: `/contabilidad/control-egresos` (KPI "En revisión — G. Financiera" y acciones Aprobar/Rechazar)
- Tesorero: `/tesoreria/bandeja` (vista Egresos), `/tesoreria/tramitar-pago/:id`
- Editor: `/contabilidad/aprobacion-egresos`

---

## 7. Estado actual (temporal, pendiente de roles reales)

- **Hoy NO hay sistema de roles en el código** (solo `AuthGuard`: exige login).
- Puesta temporal: los botones de eliminar/aprobar y el aviso se muestran
  únicamente si el usuario logueado es `admin`
  (`control-egresos.component.ts` y `aprobacion-egresos.component.ts`, señal `esAdmin`).
- El backend **no valida roles**: acepta `X-User-Name` (lo envía el interceptor).
- Al implementar roles: reemplazar `esAdmin` por el rol real
  (`EDITOR_CONTABLE` para aprobar; `CONTADOR`/`TESORERO` según matriz),
  agregar guarda de rutas por rol y validación de rol en el backend
  (Spring Security o filtro por `X-User-Name` → rol en BD).

## Integración con presupuesto (2026-10-07)

Al pasar de `EN_REVISION_GERENCIA` a `ENVIADO_TESORERIA`, se aprueba automáticamente el pago presupuestal vinculado. Tesorería recibe el egreso aprobado y puede continuar el pago sin una aprobación manual adicional del vínculo. Esto no marca el egreso ni el pago como pagados.

Las etiquetas de Control de Egresos son:

- `EN_REVISION_GERENCIA`: **Enviado para aprobación**.
- `ENVIADO_TESORERIA`: **Aprobado — en Tesorería**.

El Director Contable (`DIRECTOR_CONTABLE` / `director_contable`) abre los meses mediante `presupuesto.abrir_periodos` y administra proveedores/categorías mediante `admin.categorias`; no sustituye a Gerencia Financiera en la aprobación del egreso. La edición manual de nómina se conserva, el Excel maestro la omite con advertencias y el presupuesto aprobado bloquea sus datos hasta ser rechazado, salvo la excepción de superadmin.
