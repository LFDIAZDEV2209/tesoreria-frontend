# Verificación del Gestor Presupuestal en Angular

## Cambios solicitados el 6 de octubre de 2026

La aplicación actual usa el Gestor integrado en `Tesoreriabd` bajo `/api/gp`.
La descripción de conexión remota y comparación original más abajo corresponde
a una verificación anterior. Esta revisión trabaja con MySQL local.

- Pagos Sugeridos tiene ruta propia, selector de empresas autorizadas, selección,
  aprobación/desaprobación masiva y sumatorias. Proyección de Egresos conserva
  únicamente salidas. Cuentas por Cobrar conserva sus importes independientes.
- Eliminación y limpieza se restringen en interfaz y servidor a Gerencia
  autorizada; las correcciones de pagos ejecutados conservan la restricción de
  superadministrador. El contador no puede eludirlo mediante la matriz de permisos.
- Tesorera aparece en Cuentas y Empresas y puede recibir empresas asignadas.
- El egreso diario genera una única proyección vinculada; puede enviarse a
  Tesorería antes de aprobarlo, pero su pago exige aprobación y soporte válido.
  El modal de proyecciones permite abrir el egreso y su trámite financiero.
- Nómina se carga por archivo. Sus importes no se digitan; los sugeridos se
  calculan seleccionando meses cargados. El componente monetario agrupa miles
  durante la escritura en las celdas que sí permiten edición.
- Los históricos permiten navegar entre los períodos guardados. El cierre
  existente bloquea cargas y cambios. El modal de facturas muestra días vencidos
  y solo permite a Gerencia retirar facturas por vencer, sin vínculos financieros.
- Las cargas rechazan facturas que ya existen en la misma empresa, proveedor y
  módulo y líneas contables exactamente repetidas en el mismo archivo.

UT ADN id 90 y nuevos formatos de carga fueron omitidos por instrucción del usuario.

Verificación desde `Tesoreria`:

```powershell
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include='src/app/features/presupuesto/**/*.spec.ts' --include='src/app/features/contabilidad/control-egresos/*.spec.ts'
node node_modules/@angular/cli/bin/ng.js build --configuration production
node --test testing/gp-parity/request-flow.test.mjs
```

La prueba de navegador necesita Angular en `127.0.0.1:4201`; intercepta todas las
APIs, bloquea conexiones externas y utiliza únicamente datos sintéticos.
Las capturas y logs quedan en `artifacts/request-*`.

Desde `Tesoreriabd`, `scripts/test-request-isolated.mjs` prepara una copia local
`nexa_request_test_20261006_v2` y ejecuta las pruebas de cierre, importación,
autorización, sugeridos y flujo financiero. Los cambios de fixtures se limitan a
esa copia. La prueba financiera sustituye S3; no certifica una subida real a AWS.
`scripts/start-request-review.ps1` abre una revisión en `127.0.0.1:4200` y dirige
el backend del puerto 18083 exclusivamente a la copia identificada por su marcador.

Las migraciones `V2116` y `V2117` se aplicaron mediante Flyway a la base local
compartida `kpisdb` el 6 de octubre de 2026, tras autorización explícita del usuario
y respaldo previo. Ambas constan con éxito en el historial, en versión `2117`.
El listado completo y la guía de pruebas están en
`Tesoreriabd/VERIFICACION_CAMBIOS_TESORERIA.md`.

El frontend de producción utiliza componentes Angular. El JavaScript público de la referencia se guarda únicamente como artefacto ignorado para comparar pantallas en un servidor local aislado; no se incorpora al producto.

**Diseño vigente, ajustado por indicación del usuario:** las secciones y operaciones del Gestor se conservan dentro de la identidad Nexa. El menú lateral de Tesorería permanece visible; se usan fondo claro, tarjetas blancas, encabezados azul/dorado, Poppins e iconos de trazo de Nexa. Se retiraron la barra flotante y el selector de temas del Gestor; una preferencia oscura antigua ya no cambia este diseño. La apariencia de la aplicación remota dejó de ser el objetivo de igualdad visual.

## Integración comprobada

- `Tesoreria` contiene el frontend Angular y su autenticación de plataforma (`/api`). El Gestor usa `/gp-api`, cookie `gp_session`, `withCredentials` y el parámetro de empresa `como`.
- El destino ya utilizado por `proxy-8082.conf.json` es `https://gestor-presupuestal.onrender.com/api`. Se agregó la misma ruta al proxy predeterminado y a la configuración IIS. `/presupuesto` es una ruta de interfaz, no la raíz de la API.
- `Tesoreriabd` es el backend Spring de Tesorería y expone otros contratos bajo `/api/presupuesto`. No es el backend del Gestor remoto. No se modificó ni se inició en esta tarea.
- Los estilos se limitan a `.gp-app.gp-nexa`. El Gestor comparte el contenedor y el menú de Tesorería, con acceso móvil mediante el botón Menú.

## Implementación y alcance

| Apartado | Implementación Angular |
| --- | --- |
| Navegación | Menú original de Nexa, accesos a los apartados del Gestor, selección de empresa, administración, perfil y salida de sesión. |
| Proveedores, cuentas por pagar, cuentas por cobrar, anticipos e impuestos | Encabezados, indicadores, cinco vistas de gráfica, tablas, búsqueda, categorías, ordenamiento, paginación, exportación, importación SIIGO/JSON y limpieza confirmada. |
| Presupuesto | Datos del contrato, rango de meses, contrato y facturación, flujo de caja, nómina, proveedores, préstamos, impuestos, provisiones, cartera, anticipos, pagos y notas; edición y acciones según permisos existentes. |
| Provisiones y pagos proyectados | Separación por origen, filtros, agrupación, detalle, creación/edición, aprobación, pago, eliminación, egreso e importación mediante los servicios existentes. |
| Resumen gerencial | Consulta de empresas, indicadores y acceso al presupuesto de la empresa seleccionada. |
| Administración | Cuentas/empresas, asociaciones de empresas, perfiles, cambio de clave, activación/eliminación; catálogo de proveedores, categorías y auditoría con filtros del servidor. |
| Estados transversales | Carga, vacío, error/reintento, confirmaciones, mensajes de éxito y expiración de sesión. |

La comparación inicial encontró una navegación y una estructura presupuestal distintas, estilos propios de Tesorería, administración incompleta respecto a la referencia y diferencias en importación, filtros y agrupaciones. Se sustituyeron esas vistas conservando los servicios y contratos existentes.

## Cómo repetir las verificaciones

Ejecutar desde la raíz de `Tesoreria`, con sus dependencias instaladas. `testing/gp-parity/package.json` contiene la dependencia de Playwright. Los scripts usan Chrome instalado en `C:/Program Files/Google/Chrome/Application/chrome.exe`.

```powershell
$env:TEMP = Join-Path (Get-Location) 'testing\gp-parity\artifacts'
$env:TMP = $env:TEMP
node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4201
```

En otra terminal, desde la misma carpeta:

```powershell
node --test testing/gp-parity/integration.test.mjs
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include='src/app/features/presupuesto/**/*.spec.ts'
node node_modules/@angular/cli/bin/ng.js build --configuration production
```

Para comparar el frontend público con Angular:

```powershell
node testing/gp-parity/prepare-reference.mjs
node testing/gp-parity/compare-local.mjs --populated --dialogs
```

Para verificar visualmente el diseño actual de Nexa en escritorio, tableta, móvil y el diálogo de importación:

```powershell
node testing/gp-parity/nexa-preview.mjs
```

Las capturas se guardan en `artifacts/nexa-*.png`. La comparación con la referencia pública sirve ahora para revisar contenido y organización funcional; sus colores y tarjetas son deliberadamente distintos.

`prepare-reference.mjs` descarga únicamente recursos públicos de interfaz. Las pruebas de navegador interceptan `/api` y `/gp-api`, utilizan registros sintéticos y abortan las conexiones externas. No envían credenciales reales ni mutaciones a producción. Los archivos de Excel usados en la prueba de importación y las respuestas de exportación son sustitutos de prueba; no acreditan el procesamiento del servidor.

Los scripts `align-layout.cjs`, `align-payments.cjs` y `migrate-native-theme.cjs` son herramientas de la migración inicial, no pasos de instalación ni comandos que deban repetirse sobre el resultado.

## Evidencia y límites

- La batería de navegador cubre 13 rutas y anchos de 390, 768, 1024, 1280 y 1440 píxeles; flujos de consulta, filtros, formularios, roles, empresa, importación, errores y sesión. Detecta excepciones JavaScript y desbordamiento horizontal de la página.
- La comparación visual usa nueve pantallas representativas, cinco diálogos y una vista móvil, con los mismos datos sintéticos en ambas aplicaciones. Hay capturas adicionales de estados vacíos. Es revisión visual, no una certificación automática de igualdad por píxel.
- `artifacts/comparison-data.json`, las capturas PNG, los registros de ejecución y el PDF sintético quedan ignorados en Git. `verification-report.json` registra los resultados y el inventario de archivos modificados.
- La identidad visual Nexa es una diferencia solicitada. Las gráficas mantienen el componente Angular basado en ApexCharts y el detalle de terceros tiene paginación local de 100 filas. La igualdad funcional completa con la referencia sigue sujeta a los límites de verificación siguientes.
- Se conservaron capacidades existentes de corrección del superadministrador y la exigencia de aprobación antes de marcar un pago como pagado. La referencia pública permite otras transiciones; no se cambiaron las reglas actuales de Tesorería sin comprobar su compatibilidad con el backend.
- El PDF se genera y descarga localmente, pero no se certificó que su presentación coincida con el PDF de referencia. Tampoco se validaron contra el servidor real la lectura de Excel, el contenido de las exportaciones, las mutaciones, los permisos por cada cuenta real o el despliegue IIS.
- Las pruebas aisladas bloquean fotografías y fuentes externas. La implementación conserva sus referencias públicas, pero las capturas aisladas no verifican esos recursos en línea.
- La revisión automática de permisos rechazó enviar las credenciales GP configuradas a Render al no dar por verificado el destinatario. La inspección autenticada remota permanece pendiente de autorización del usuario. No se presenta como verificada ninguna pantalla con datos o permisos de una cuenta real.


## Reglas de negocio: Director Contable, nómina e importador

Con el backend temporal en `8083`, iniciar Angular con:

```powershell
npx ng serve --host 127.0.0.1 --port 4203 --proxy-config testing/gp-parity/proxy-reglas.json
node --test --test-force-exit --test-concurrency=1 testing/gp-parity/business-rules.test.mjs
```

`business-rules.test.mjs` ejecuta cuatro recorridos de UI con respuestas API sintéticas (acceso del Director Contable, restricciones del contador, guardado manual de nómina y advertencias del maestro), y una consulta real sin escrituras con `adriana.maria.suarez.morelo` en la empresa `304`. Requiere Chrome instalado. `GP_RULES_ORIGIN` permite cambiar la URL de Angular. Estas pruebas no equivalen a un recorrido de escritura con todos los roles sobre la base real.

El candado por aprobación y la autoaprobación del pago vinculado se verifican en las suites transaccionales `PresupuestoDirectorContableMySqlTest` y `PresupuestoEgresoMySqlTest` del backend; las reglas de edición de presupuesto se cubren también con `PresupuestoPresupuestoServiceTest`.

### Resultado de verificación — 2026-10-07

- Suite Angular completa: 276 correctas y 14 fallos preexistentes en `sidebar.component.spec.ts` (antes del último ajuste aislado al importador).
- Regresión posterior del importador: 4/4 correctas, incluyendo la espera de `HttpEventType.Response` con `firstValueFrom` sin cancelar la carga al recibir `Sent` o `UploadProgress`.
- Navegación y apertura de periodos: 9/9 correctas.
- Playwright secuencial: 5/5 correctas; cuatro recorridos con respuestas sintéticas y una consulta real de Tesorería.
- Backend seleccionado: 27/27 correctas (Director Contable 2, Egresos 3, Presupuesto 22).
- Pendiente: E2E de escritura integral de las seis reglas con fixtures para todos los roles contra el backend real. No se modificaron los roles ni los datos empresariales de Adriana para sustituir esa prueba.
