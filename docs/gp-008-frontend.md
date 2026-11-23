# GP-008 P7–P10 — entrega gpfrontend

Rama: `feature/gp-008-p7a10`. Fuente: `../gp-008-p7a10/brief-herdr.md`.
Cambios exclusivamente en el frontend. Sin push, migraciones ni cambios de backend.

## Implementación y decisiones

- **P9:** `GpVistaPeriodosComponent` conserva la vista mensual y permite alternar a `GpModuloAnualComponent` en Proveedores, Anticipos, Cuentas por Pagar, Cuentas por Cobrar, Impuestos y Provisiones. Comparte selección con el shell. Tabla por tercero y mes, encabezados/tercero/totales fijos y desplazamiento contenido, selector de año cuando hay varios, selector saldo/débito/crédito, totales del contrato y exportación Excel de la medida visible. La primera consulta omite año para descubrir todos los años disponibles. La exportación usa la dependencia XLSX existente y los datos recibidos, sin inventar un endpoint anual de exportación. Los endpoints anuales conservan `empresaId` y no reciben `vistaMes` ni `periodoConsulta`. Incluye skeleton, vacío, error y reintento; cancela consultas anteriores al cambiar de empresa o destruir el componente.
- **P8:** una provisión MANUAL/IMPORTADO con estado proyectado y `aprobado=false` se puede editar/eliminar aunque su mes sea anterior. Se conserva el permiso efectivo del servidor, sin ampliar la regla general `puedeEditarMes`. Aprobados, pagados y cancelados no admiten edición/eliminación, tampoco por superadmin. Guardar una edición y eliminar requieren confirmación; los mensajes humanos del 409 se muestran mediante el traductor existente. Se conserva el formulario ante error. Observaciones protegidas quedan en solo lectura.
- **P10:** nueva entrada **Historial** en el shell y ruta `/presupuesto/historial`, con `historicos.ver`, reutilizando `AuditoriaComponent`. `PresupuestoAuditoriaService` consulta el endpoint consolidado del brief. Filtros por empresa asignada, periodo y usuario; columnas fecha/usuario/acción/periodo/detalle legible. El endpoint admite solo empresaId y devuelve las últimas 200 acciones sin paginación. Periodo y usuario se filtran en cliente sobre ese conjunto, con el límite visible. Los periodos se extraen de detalle, incluyendo periodoAnterior; no se deducen de la fecha de edición. Auditoría administrativa existente permanece separada. Se revisó creación de periodos y `GpPeriodoService.puedeCrear`; ya utilizan `presupuesto.abrir_periodos`, por lo que no se duplicó ese flujo.
- **P7:** reutiliza `GpAnticipoLegalizacionService` y el modal existentes. Acepta PDF no vacío de máximo 10 MiB, validando extensión, MIME cuando está disponible y cabecera `%PDF-`. Valor opcional positivo y observación. Muestra soportes en orden reciente con fecha, usuario, valor y observación; permite consultar sin permiso de carga. Después de registrar mantiene abierto el modal para consultar o añadir otra legalización. Error de consulta visible con reintento; no se etiqueta como pendiente si falló la consulta. Abre presigned URL en pestaña nueva desde el gesto del usuario. Controles de archivo accesibles por teclado y filas que se adaptan al ancho.

## Endpoints utilizados

- `GET /api/gp/{modulo}/anual?empresaId=&anio=`: proveedores, anticipos, cuentas-pagar, cuentas-cobrar, impuestos.
- `GET /api/gp/pagos-proyectados/provisiones/anual?empresaId=&anio=`.
- `GET /api/presupuesto/auditoria?empresaId=`.
- CRUD existente de pagos bajo `/api/gp/pagos-proyectados` (alias del contrato).
- GET/POST existentes `/api/gp/anticipos/legalizaciones` y `GET /{id}/archivo`.

## Archivos

Dentro de `src/app/features/presupuesto/`:

- Nuevos `components/gp-modulo-anual/gp-modulo-anual.component.{ts,html,scss}`.
- Nuevo `components/gp-vista-periodos/gp-vista-periodos.component.ts`.
- Nuevo `models/modulo-anual.model.ts`.
- Nuevo `services/presupuesto-auditoria.service.ts`.
- Nuevos `services/gp-008.spec.ts` y `pages/pagos-proyectados/provisiones-edicion.spec.ts`.
- Modificados `services/presupuesto.service.ts`, `services/presupuesto-context.service.ts`, `services/gp-navigation.service.ts`.
- Modificados `components/gp-navigation/gp-navigation.component.ts`, `presupuesto.routes.ts`.
- Modificado `pages/auditoria/auditoria.component.ts`.
- Modificados `pages/modulo-page/modulo-page.component.{ts,html,scss,spec.ts}`.
- Modificados `pages/pagos-proyectados/pagos-proyectados-page.component.{ts,html,spec.ts}`.

También `src/app/core/interceptors/gp-auth.interceptor.ts` y este informe.

## Validación de la primera ronda

- `npx tsc -p tsconfig.app.json --noEmit`: sin errores.
- `npx ng build --configuration development`: compilación de desarrollo correcta.
- ChromeHeadless/Karma: 61 pruebas en las cuatro suites seleccionadas (`gp-008`, `provisiones-edicion`, `modulo-page`, `pagos-proyectados-page`). Cubren contratos HTTP, renders de tabla/carga/error/vacío, PDF, permisos, 409 y aislamiento de respuestas.
- `git diff --check`: sin errores.

## Situación al finalizar la primera ronda (actualizada abajo)

- Al verificar el entorno, `localhost:8081` no tenía listener; `localhost:4202` sirve este repo pero redirige al login. No se declara validación visual autenticada ni E2E real de P7–P10.
- QA/backend deben verificar con datos DEV los totales API/UI, permisos efectivos del contador (en particular `pagos.eliminar`), 409 reales, filtros de auditoría y registro de todas las mutaciones. La persistencia de auditoría pertenece al backend.
- Falta probar subida real y URL presigned contra almacenamiento DEV. No se subieron archivos ni se modificaron datos de negocio durante este trabajo frontend.
- Los archivos de `testing/` que produce el agente QA y `.codegraph/` no forman parte de los commits de gpfrontend.

## Commits locales de implementación

- `1b57c67`: P9, vista de todos los meses.
- `a20eb4a`: P8, provisiones pendientes de meses anteriores.
- `913a821`: P7, PDF e historial de legalizaciones.
- `b481508`: P10, historial filtrable.
- `5405c51`: P7, validación de permisos/recarga.
- `eaf47cf`: P8, conflictos y protección.
- `1ad4225`: contratos, pruebas y manejo de sesión anual.


## Ronda 2: contratos reales y correcciones visuales — 2026-10-15

Se leyeron `../Tesoreriabd/docs/gp-008-p7a10-backend.md`, `GestorAnualController`, `GestorPagoController`, `PresupuestoPagoService`, `PresupuestoAnualDTO` y `PresupuestoAuditoriaController`. Backend solo consultado; pruebas contra localhost:8081 y frontend de este repo en localhost:4202.

### Diferencias conciliadas

- **Anuales:** paths absolutos y DTO existentes ya coincidían: `filas[].valores['YYYY-MM']`, `debito/credito/saldo`, `totalAnio`, `totalesMes`, `totalGeneral`. `anio` es opcional y puede volver null; `anios` aparece en la consulta sin año y se omite al filtrar por uno. Se conserva el catálogo inicial para poder volver a todos los años. Se reforzó el interceptor para retirar incluso parámetros mensuales aportados accidentalmente por el llamador.
- **Pagos:** el estado real es `proyectado`, con `aprobado=false`, origen manual/importado y permisos efectivos independientes. PUT usa cuerpo snake_case, DELETE devuelve `{ok:true}` y cancela lógicamente. Crear/editar/notas/eliminar ahora reciben explícitamente la empresa del formulario; el interceptor conserva el alias legacy `como` aceptado por el backend. La regla existente y los mensajes humanos del 409 coincidieron con el servicio real.
- **Centavos:** durante la prueba real se detectó que abrir una edición redondeaba 234.56 a 235. Se eliminó ese redondeo, se separó el modelo decimal del formato COP y se permite entrada con coma decimal. Confirmación y PUT preservan el valor exacto de centavos; probado con 234.56 y 1.234,56.
- **Historial:** `/api/presupuesto/auditoria` acepta solo `empresaId`, devuelve un array de las últimas 200 acciones, sin paginado ni parámetros periodo/usuario. Se retiraron esos parámetros, se ajustaron tipos a `usuarioNombre/usuarioId/empresaId/detalle` y se muestra el alcance del filtro local. El detalle puede referir varios periodos y se filtra cualquiera de ellos. El 403 tiene mensaje específico de permiso y reintento.

### Hallazgos visuales resueltos

- `gp-modulo-anual.component.{html,scss}`: columnas numéricas con mínimo 192 px en escritorio / 176 px en móvil, nowrap y tabular-nums. El formato COP existente conserva miles, coma decimal y espacio no separable junto al símbolo monetario.
- Toolbar con padding y wrap; botones sin contracción, exportación dentro del card.
- Scroll horizontal contenido, suave salvo preferencia de movimiento reducido. Encabezados superiores, encabezados de fila (tercero) y totales sticky. Primera columna de 256 px en escritorio / 144 px en móvil.
- Playwright autenticado: escritorio y 390 × 844. En móvil: documento de 390 px, grilla visible de 364 px con contenido de 1376 px, cero celdas numéricas con overflow interno, tercero fijo después de desplazar 400 px y botón de exportación contenido. Capturas locales en `.playwright-cli/gp008-r2-anual-desktop.png` y `.playwright-cli/gp008-r2-anual-mobile.png`.

### Integración y verificación

- 24 GET reales: seis endpoints anuales × año omitido, vacío, 2026 y 1900. Todos 200; verificados tipos numéricos, llaves, totales, respuesta vacía y catálogo de años. El frontend omite el parámetro cuando selecciona todos los años.
- Browser: mensual septiembre → anual sin `vistaMes/periodoConsulta` → mensual conserva el periodo → anual. Provisiones con años 2025/2026: seleccionar 2025 devuelve una fila y conserva las tres opciones del selector, incluida Todos los años.
- Fixture propia `GPFE-008-R2-1792099604338`, pago 4702: creada como contador, PUT a febrero de 2025 con 234.56 aceptado. Botón Editar disponible en ese mes; Eliminar ausente para contador. DELETE contador 403; gerencia 200 `{ok:true}`; segundo DELETE 409 `PRESUPUESTO_CONFLICT`. Con edición abierta y cancelación concurrente, guardar desde UI mostró el mensaje real del 409 y mantuvo el formulario. Fixture cancelada y ausente del anual al finalizar; no se modificaron filas de negocio existentes.
- Historial en browser llamó exactamente `/api/presupuesto/auditoria?empresaId=91`; confirmó 403 y mensaje de permiso.
- `npx tsc -p tsconfig.app.json --noEmit`: correcto.
- `npx ng test --watch=false --browsers=ChromeHeadless` con `--include` para `gp-008.spec.ts`, `modulo-page.component.spec.ts`, `pagos-proyectados-page.component.spec.ts`, `provisiones-edicion.spec.ts` y el nuevo `auditoria.component.spec.ts`: **68 pruebas correctas**.
- `npx ng build --configuration development`: correcto.
- `git diff --check`: correcto.

### Pendientes externos

- **P10 bloqueado para los perfiles QA:** el backend exige `admin.auditoria` y tanto contador como gerencia reciben 403, aunque el shell permite Historial por `historicos.ver`. Backend/producto deben conciliar esa autorización para habilitar la lista al perfil previsto. No se amplían permisos desde frontend.
- Contador no tiene `pagos.eliminar`; gerencia sí. Se respeta esa configuración. Si contador debe eliminar, corresponde cambiar el permiso en backend.
- La subida real de PDF y presigned de P7 sigue pendiente de QA/almacenamiento; los specs del flujo existente permanecen verdes.
- No se editaron backend ni archivos QA en `testing/`; el índice `.codegraph/` y archivos QA concurrentes quedan fuera de los commits.

### Archivos de esta ronda

Modificados: interceptor GP; `presupuesto.service.ts`; `presupuesto-auditoria.service.ts`; componente Historial; HTML/SCSS de `gp-modulo-anual`; TS/HTML/spec de `pagos-proyectados-page`; `gp-008.spec.ts`; este informe. Nuevo: `pages/auditoria/auditoria.component.spec.ts`. Se reutilizan servicios/componentes existentes, sin componentes productivos nuevos ni cambios globales de diseño.

### Commits locales de ronda 2

- `5d47a8c`: conciliación de contratos, empresa explícita y auditoría.
- `b52228a`: anchos, importes y toolbar de la grilla anual.
- `6b221ed`: conservación de centavos en proyecciones.

Sin push.

## Ajuste GPQA-01 — eliminación por contador

Sustituye la restricción de la ronda 2: una provisión manual/importada en estado `proyectado`, con `aprobado=false`, permite eliminar con `pagos.operar` sin exigir `pagos.eliminar`, incluso en meses anteriores. Se mantiene el acceso de perfiles que ya poseen `pagos.eliminar`; otros módulos conservan su regla. Aprobados, ejecutados, cancelados y consulta histórica permanecen bloqueados. La confirmación revalida estado/empresa y los errores 403/409 mantienen el mensaje humano del backend.

Verificado con `npx tsc -p tsconfig.app.json --noEmit` y suites afectadas de pagos/provisiones/auditoría/contratos: 58 pruebas correctas. No se tocó `modulo-page`. El reporte QA referido no estaba en la ruta indicada; se utilizaron los hallazgos explícitos del encargo y `../gp-008-p7a10/kb-fixes-backend.md`.

## Ajuste GPQA-04 — historial restringido y filtros compatibles

`PresupuestoAuditoriaService.listar` recibe periodo/usuario opcionales y envía solo filtros no vacíos como query params. Historial continúa filtrando localmente el conjunto autorizado que devuelve el backend; el texto informa ese alcance sin prometer acceso a toda la empresa. Un 403 conserva la explicación de permiso y el reintento; al volver 200 se conservan y aplican los filtros.

Al verificar el backend el 15/10/2026, `PresupuestoAuditoriaController` aún aceptaba solo empresaId y localhost:8081 devolvía 403 al contador, tanto sin filtros como con `periodo=2026-10&usuario=gpqa.contador`. Queda preparado para el cambio de backend; el filtrado local cubre versiones que ignoran esos parámetros. No se implementa autorización en cliente ni se consulta otra ruta para eludir el 403. Pruebas HTTP de parámetros/valores vacíos y transición 403→200 correctas dentro de las 58 pruebas afectadas.
