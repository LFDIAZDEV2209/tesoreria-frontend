import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validador personalizado que verifica si el valor está completamente en mayúsculas
 * @returns Retorna un objeto de validación si el valor no está en mayúsculas, null si es válido
 */
export function uppercaseValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null; // Permitir valores vacíos
    }

    const value = String(control.value).trim();
    
    // Verificar si contiene letras
    if (!/[a-zA-Z]/.test(value)) {
      return null; // Si no contiene letras, es válido (ej: números puros)
    }

    // Verificar si todas las letras están en mayúsculas
    if (value === value.toUpperCase()) {
      return null; // Es válido
    }

    return {
      uppercase: {
        requiredValue: value.toUpperCase(),
        actualValue: value
      }
    };
  };
}

/**
 * Validador que convierte automáticamente a mayúsculas mientras se escribe
 * (solo para lectura en el control, no modifica el DOM)
 */
export function autoUppercaseValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }

    const currentValue = String(control.value);
    const uppercaseValue = currentValue.toUpperCase();

    // Si el valor no está en mayúsculas, actualizar sin disparar validación
    if (currentValue !== uppercaseValue) {
      control.setValue(uppercaseValue, { emitEvent: false });
    }

    return null;
  };
}
