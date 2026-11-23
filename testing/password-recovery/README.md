# Recuperación de contraseña

Suite aislada de Angular 18/Jasmine/Karma. Usa `HttpTestingController` y dobles de servicios: no llama al backend, SMTP ni bases de datos y no utiliza cuentas reales.

Desde `Tesoreria`, con Chrome instalado:

```powershell
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node node_modules/@angular/cli/bin/ng.js test --watch=false --progress=false --karma-config=testing/password-recovery/karma.cjs --ts-config=testing/password-recovery/tsconfig.json --include=src/app/core/services/auth-recovery.spec.ts --include=src/app/features/auth/login/login-recovery.spec.ts
```

Resultado verificado el 21 de octubre de 2026: **36 pruebas aprobadas**, Chrome Headless 155, Windows.

Comprueba el contrato HTTP 202 para solicitud, el vínculo email/OTP, las contraseñas y confirmaciones exactas, rechazo de respuestas sin éxito explícito, ausencia de logs sensibles, política de contraseña/UTF-8, mensajes seguros, concurrencia, reenvío, limpieza de secretos, contexto de correo, los tres formularios de cambio de contraseña y la eliminación del almacenamiento legado de contraseñas.

La validación real del OTP, su consumo, expiración, concurrencia, entrega SMTP y persistencia son responsabilidad de las pruebas de integración del backend. Estas pruebas de frontend no afirman haber realizado una entrega real de correo.

Contratos conservados:

- `POST /api/auth/request-password-reset`: `{email}`; HTTP 202 confirma aceptación de la solicitud, sin confirmar existencia de cuenta ni entrega.
- `POST /api/auth/confirm-password-reset`: `{email,token,newPassword,confirmPassword}`; el backend verifica el OTP y cambia la contraseña de forma atómica.
- `POST /api/auth/change-password`: `{userId,currentPassword,newPassword,confirmPassword}`; exige la contraseña actual como prueba.
