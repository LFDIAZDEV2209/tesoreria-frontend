# Tesorería — Frontend

Aplicación web (Angular 18) del módulo de Tesorería y Gestión Presupuestal: autenticación con OTP, tablero de KPIs, solicitudes y egresos de tesorería, pagos proyectados, proveedores, viáticos, contabilidad, presupuesto y administración de usuarios/roles.

## Stack

- Angular 18 + TypeScript (modo estricto)
- SCSS + Tailwind CSS
- RxJS y formularios reactivos
- Proxy de desarrollo hacia la API Spring Boot

## Requisitos

- Node.js 20 LTS o superior
- npm 10+

## Arranque local

```bash
npm install
npm start
```

La app queda en `http://localhost:4200`. Las peticiones a `/api` se redirigen a `http://localhost:8081` según `proxy.conf.json` (hay una variante en `proxy-8082.conf.json`).

## Build

```bash
npm run build
```

Los artefactos quedan en `dist/`.

## Tests

```bash
npm test
```

## Estructura

```
src/app/core/          servicios, modelos, guards e interceptores
src/app/features/      módulos funcionales (tesorería, presupuesto, contabilidad, ...)
src/app/shared/        componentes reutilizables
src/environments/      configuración por entorno
testing/               utilidades de QA (paridad GP, recuperación de contraseña)
```

## Configuración

`src/environments/environment.ts` y `environment.prod.ts` definen la URL base de la API y los endpoints. Por defecto la app consume rutas relativas (`/api`), resueltas por el proxy en desarrollo y por el reverse proxy en producción.

## Nota sobre esta copia

Snapshot técnico de demostración. Los correos, dominios, rutas locales y datos de ejemplo fueron reemplazados por valores genéricos; no se incluyen credenciales, llaves ni volcados de bases de datos.
