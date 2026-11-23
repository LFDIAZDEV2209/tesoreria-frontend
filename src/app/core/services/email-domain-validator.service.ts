import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EmailDomainValidatorService {

  // Dominios permitidos para la corporación
  private readonly ALLOWED_DOMAINS = [
    '@example.com',
    '@example.org'
  ];

  /**
   * Valida si un email tiene uno de los dominios permitidos
   * @param email Correo electrónico a validar
   * @returns true si el email tiene un dominio permitido, false en caso contrario
   */
  isValidDomain(email: string): boolean {
    if (!email || email.trim().length === 0) {
      return false;
    }

    const normalizedEmail = email.trim().toLowerCase();
    return this.ALLOWED_DOMAINS.some(domain => normalizedEmail.endsWith(domain));
  }

  /**
   * Valida si un email es válido y tiene dominio permitido
   * @param email Correo electrónico a validar
   * @returns Objeto con validación y mensaje de error si aplica
   */
  validateEmail(email: string | null | undefined): { isValid: boolean; error?: string } {
    if (!email || email.trim().length === 0) {
      return {
        isValid: false,
        error: 'El correo electrónico es obligatorio'
      };
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validar formato básico de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return {
        isValid: false,
        error: 'Formato de correo electrónico inválido'
      };
    }

    // Validar dominio
    if (!this.isValidDomain(normalizedEmail)) {
      return {
        isValid: false,
        error: `Solo se aceptan correos con dominios: ${this.ALLOWED_DOMAINS.join(', ')}`
      };
    }

    return { isValid: true };
  }

  /**
   * Obtiene la lista de dominios permitidos
   */
  getAllowedDomains(): string[] {
    return [...this.ALLOWED_DOMAINS];
  }
}
