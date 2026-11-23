# Gestor conectado a Java

El Gestor usa `/api/gp` de Tesoreriabd, con el acceso de Nexa. Se quitaron el proxy a Render, las credenciales compartidas y la segunda sesión. Se mantienen Angular, el menú principal, las tarjetas, iconos y colores Nexa.

La instancia habitual usa `localhost:4201 -> proxy-8082.conf.json -> localhost:8082 -> MySQL local localhost:3307/kpisdb`. La carga anterior solo existía en una base aislada; se corrigió importando el respaldo en **kpisdb**, con respaldo previo. Admin ahora recibe las 26 empresas, 3.094 movimientos y 1.695 pagos. No se cambió la contraseña ni el proxy; basta recargar el navegador.

Para comprobar esa conexión sin modificar datos:

```powershell
node testing/gp-parity/configured-backend.test.mjs
```

La prueba usa una sesión de navegador aislada con la identidad admin existente y el contrato Nexa `X-User-Name`; no lee contraseñas ni simula respuestas de API. Comprueba selección inicial con 26 empresas, 13 apartados y tres tamaños de pantalla, conservando el menú Nexa. Resultado: 14 verificaciones correctas, sin errores de API/JavaScript ni llamadas a Render. No crea empresas de prueba en kpisdb.

Para la base aislada de pruebas de escritura, arrancar Tesoreriabd con `testing/gestor/application-local.yaml` y ejecutar desde Tesoreria:

```powershell
node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4201 --proxy-config testing/gp-parity/proxy-local.json
```

Las empresas seleccionadas se guardan con `gp_nexa_empresa_id`: no se reutilizan IDs de Render. La asignación de empresas usa el `empresa_id` positivo de Nexa; el ID negativo de las filas de empresas solo distingue esas filas de cuentas personales en la administración.

Pruebas:

- `ng test --watch=false --browsers=ChromeHeadless --include='src/app/features/presupuesto/**/*.spec.ts'`: 125 pruebas unitarias.
- `node --test testing/gp-parity/integration.test.mjs`: 18 pruebas de interfaz con contratos sintéticos, errores, roles y responsive.
- `node testing/gp-parity/local-backend.test.mjs`: 13 apartados contra Java/MySQL reales, a 390/768/1440 px, más creación de empresa desde Angular. Requiere la importación y las identidades locales creadas por `Tesoreriabd/testing/gestor/verify-local.mjs`. No simula las respuestas de API.

Capturas e informes locales quedan en `testing/gp-parity/artifacts`, excluido de Git. La exportación por API también escribe únicamente en `Tesoreriabd/local-data`, con credenciales suministradas por variables de entorno.

Consultar `Tesoreriabd/docs/gestor/MIGRACION_LOCAL.md` para la importación explícita, correspondencia de IDs, pruebas y las tres diferencias descriptivas de agrupación que aún existen en el mensual. Las dos rutas demo se implementaron desde el código original y se probaron únicamente en la base aislada. El cambio no despliega la aplicación ni carga datos en producción.

## Archivos modificados

- `proxy-8082.conf.json`
- `proxy.conf.json`
- `src/app/core/interceptors/gp-auth.interceptor.ts`
- `src/app/core/interceptors/request-header.interceptor.ts`
- `src/app/core/services/auth.service.ts`
- `src/app/features/presupuesto/components/gp-navigation/gp-navigation.component.html`
- `src/app/features/presupuesto/components/gp-navigation/gp-navigation.component.ts`
- `src/app/features/presupuesto/pages/cuentas/cuentas.component.html`
- `src/app/features/presupuesto/pages/cuentas/cuentas.component.ts`
- `src/app/features/presupuesto/pages/gp-shell/gp-shell.component.ts`
- `src/app/features/presupuesto/services/gp-mapper.spec.ts`
- `src/app/features/presupuesto/services/gp-mapper.ts`
- `src/app/features/presupuesto/services/gp-session.service.ts`
- `src/app/features/presupuesto/services/presupuesto-context.service.spec.ts`
- `src/app/features/presupuesto/services/presupuesto-context.service.ts`
- `src/app/features/presupuesto/services/presupuesto.service.ts`
- `src/environments/environment.prod.ts`
- `src/environments/environment.ts`
- `src/web.config`
- `testing/gp-parity/BACKEND_LOCAL.md`
- `testing/gp-parity/export-render.mjs`
- `testing/gp-parity/fixtures.mjs`
- `testing/gp-parity/integration.test.mjs`
- `testing/gp-parity/local-backend.test.mjs`
- `testing/gp-parity/proxy-local.json`
- `testing/gp-parity/configured-backend.test.mjs`
