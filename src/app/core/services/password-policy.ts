import { AbstractControl, ValidationErrors } from '@angular/forms';

export const PASSWORD_REQUIREMENTS = 'Usa al menos 8 caracteres, con mayúscula, minúscula y número; máximo 72 bytes (los caracteres especiales pueden ocupar más de un byte).';

export function passwordPolicyErrors(password: string): ValidationErrors | null {
  const errors: ValidationErrors = {};
  if (password.length < 8) errors['minlength'] = true;
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    errors['complexity'] = true;
  }
  if (new TextEncoder().encode(password).length > 72) errors['maxBytes'] = true;
  return Object.keys(errors).length ? errors : null;
}

export function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  return passwordPolicyErrors(control.value ?? '');
}

/** Never display provider diagnostics, exception details or echoed request secrets. */
export function passwordOperationError(error: { status?: number }, operation: 'change' | 'request' | 'recovery' = 'change'): string {
  if (error?.status === 0) return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.';
  if (error?.status === 429) return 'Demasiados intentos. Espera un minuto antes de volver a solicitar un código.';
  if (error?.status && error.status >= 500) return 'El servicio no está disponible temporalmente. Intenta nuevamente más tarde.';
  if (operation === 'request') return 'No se pudo solicitar el código. Revisa el formato del correo e intenta nuevamente.';
  return operation === 'recovery'
    ? 'No se pudo validar el código. Puede ser incorrecto, haber expirado o ya estar utilizado. Solicita uno nuevo si es necesario.'
    : 'No se pudo cambiar la contraseña. Revisa la contraseña actual y los requisitos de la nueva contraseña.';
}
