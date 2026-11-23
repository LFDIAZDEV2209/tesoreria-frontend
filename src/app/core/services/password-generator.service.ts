import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PasswordGeneratorService {

  /**
   * Genera una contraseña temporal segura
   * - 12 caracteres de longitud
   * - Incluye mayúsculas, minúsculas, números y caracteres especiales
   * @returns Contraseña temporal generada
   */
  generateTemporaryPassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*_-=+';
    
    const allChars = uppercase + lowercase + numbers + special;
    let password = '';
    
    // Asegurar al menos un carácter de cada tipo
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Llenar el resto aleatoriamente (12 caracteres totales)
    for (let i = password.length; i < 12; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Mezclar la contraseña para que no sea predecible
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Genera un correo por defecto basado en el nombre del empleado
   * Formato: nombre.apellido@empresa.com
   * @param firstName Nombre del empleado
   * @param lastName Apellido del empleado
   * @returns Correo generado por defecto
   */
  generateDefaultEmail(firstName: string, lastName: string): string {
    if (!firstName || !lastName) {
      // Si no hay nombre o apellido, generar correo aleatorio
      return `user.${Date.now()}@empresa.com`;
    }
    
    const sanitizedFirstName = firstName.trim().toLowerCase().replace(/\s+/g, '');
    const sanitizedLastName = lastName.trim().toLowerCase().replace(/\s+/g, '');
    
    return `${sanitizedFirstName}.${sanitizedLastName}@empresa.com`;
  }

  /**
   * Obtiene el correo del empleado o genera uno por defecto
   * @param email Correo del empleado (puede estar vacío)
   * @param firstName Nombre del empleado
   * @param lastName Apellido del empleado
   * @returns Correo existente o generado por defecto
   */
  getEmailOrDefault(email: string | null | undefined, firstName: string, lastName: string): string {
    if (email && email.trim().length > 0) {
      return email.trim();
    }
    return this.generateDefaultEmail(firstName, lastName);
  }
}
