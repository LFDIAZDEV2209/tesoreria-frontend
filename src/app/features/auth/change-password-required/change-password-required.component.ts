import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PASSWORD_REQUIREMENTS, passwordPolicyValidator, passwordOperationError } from '../../../core/services/password-policy';

@Component({
  selector: 'app-change-password-required',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-[#fdfdfd] via-[#f0f0f0] to-[#e4e8f3] flex items-center justify-center p-4">
      <!-- Container -->
      <div class="max-w-md w-full">
        <!-- Card -->
        <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <!-- Header con gradiente -->
          <div class="bg-gradient-to-r from-[#213053] to-[#045C94] px-8 py-8 text-center">
            <div class="mb-4 text-5xl">🔐</div>
            <h1 class="text-2xl font-bold text-white mb-2">Cambiar Contraseña</h1>
            <p class="text-white/80 text-sm">Este es tu primer inicio de sesión. Debes cambiar tu contraseña temporal.</p>
          </div>

          <!-- Form -->
          <div class="px-8 py-8">
            <form [formGroup]="changePasswordForm" (ngSubmit)="onSubmit()">
              <!-- Current Password -->
              <div class="mb-6">
                <label class="block text-sm font-semibold text-gray-700 mb-2">
                  Contraseña Temporal
                </label>
                <input
                  type="password"
                  formControlName="currentPassword"
                  placeholder="Ingresa tu contraseña temporal"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#045C94] focus:border-transparent transition"
                  [class.border-red-500]="isFieldInvalid('currentPassword')"
                />
                <p *ngIf="isFieldInvalid('currentPassword')" class="text-red-500 text-xs mt-1">
                  ⚠️ Campo requerido
                </p>
              </div>

              <!-- New Password -->
              <div class="mb-6">
                <label class="block text-sm font-semibold text-gray-700 mb-2">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  formControlName="newPassword"
                  placeholder="Ingresa tu nueva contraseña"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#045C94] focus:border-transparent transition"
                  [class.border-red-500]="isFieldInvalid('newPassword')"
                />
                <p *ngIf="isFieldInvalid('newPassword')" class="text-red-500 text-xs mt-1">
                  ⚠️ {{ passwordRequirements }}
                </p>
                <!-- Password strength indicator -->
                <div class="mt-3 text-xs space-y-1">
                  <div class="flex items-center gap-2">
                    <div [class]="'w-2 h-2 rounded-full transition' + (hasUppercase ? ' bg-green-500' : ' bg-gray-300')"></div>
                    <span>Mayúscula</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div [class]="'w-2 h-2 rounded-full transition' + (hasLowercase ? ' bg-green-500' : ' bg-gray-300')"></div>
                    <span>Minúscula</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div [class]="'w-2 h-2 rounded-full transition' + (hasNumber ? ' bg-green-500' : ' bg-gray-300')"></div>
                    <span>Número</span>
                  </div>
                </div>
              </div>

              <!-- Confirm Password -->
              <div class="mb-6">
                <label class="block text-sm font-semibold text-gray-700 mb-2">
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  formControlName="confirmPassword"
                  placeholder="Confirma tu nueva contraseña"
                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#045C94] focus:border-transparent transition"
                  [class.border-red-500]="isFieldInvalid('confirmPassword')"
                />
                <p *ngIf="isFieldInvalid('confirmPassword')" class="text-red-500 text-xs mt-1">
                  ⚠️ Las contraseñas no coinciden
                </p>
              </div>

              <!-- Error Message -->
              <div *ngIf="errorMessage" class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p class="text-red-600 text-sm font-medium">{{ errorMessage }}</p>
              </div>

              <!-- Submit Button -->
              <button
                type="submit"
                [disabled]="!changePasswordForm.valid || loading"
                class="w-full bg-gradient-to-r from-[#213053] to-[#045C94] text-white font-bold py-3 px-4 rounded-lg hover:shadow-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span *ngIf="!loading">Cambiar Contraseña</span>
                <span *ngIf="loading" class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Procesando...
                </span>
              </button>

              <!-- Info Message -->
              <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p class="text-blue-700 text-xs font-medium">
                  💡 Tu contraseña debe contener mayúsculas, minúsculas y números para mayor seguridad.
                </p>
              </div>
            </form>
          </div>
        </div>

        <!-- Footer Info -->
        <div class="text-center mt-6 text-sm text-gray-600">
          <p>Cambio de contraseña requerido para continuar</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class ChangePasswordRequiredComponent implements OnInit {
  changePasswordForm!: FormGroup;
  loading = false;
  errorMessage = '';
  readonly passwordRequirements = PASSWORD_REQUIREMENTS;

  hasUppercase = false;
  hasLowercase = false;
  hasNumber = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.changePasswordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordPolicyValidator]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator.bind(this)
    });

    // Watch new password changes para validar complejidad
    this.changePasswordForm.get('newPassword')?.valueChanges.subscribe((value: string) => {
      this.validatePasswordStrength(value);
    });
  }

  validatePasswordStrength(password: string): void {
    this.hasUppercase = /[A-Z]/.test(password);
    this.hasLowercase = /[a-z]/.test(password);
    this.hasNumber = /[0-9]/.test(password);
  }

  passwordMatchValidator(form: FormGroup): { [key: string]: boolean } | null {
    const newPassword = form.get('newPassword');
    const confirmPassword = form.get('confirmPassword');

    if (!newPassword || !confirmPassword) {
      return null;
    }

    return newPassword.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.changePasswordForm.get(fieldName);
    const isPasswordMismatch = fieldName === 'confirmPassword' && this.changePasswordForm.hasError('passwordMismatch');
    return !!(field && field.invalid && field.touched) || isPasswordMismatch;
  }

  onSubmit(): void {
    if (this.loading || !this.changePasswordForm.valid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    this.loading = true;

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.errorMessage = 'Error: Usuario no autenticado';
      this.loading = false;
      return;
    }

    const newPassword = this.changePasswordForm.get('newPassword')?.value;
    const currentPassword = this.changePasswordForm.get('currentPassword')?.value;
    const confirmPassword = this.changePasswordForm.get('confirmPassword')?.value;

    this.authService.changePassword(currentUser.userId, currentPassword, newPassword, confirmPassword).subscribe({
      next: () => {
        this.loading = false;
        this.changePasswordForm.reset();
        localStorage.removeItem('login_credentials');
        this.authService.logout();
      },
      error: (error) => {
        this.errorMessage = passwordOperationError(error);
        this.loading = false;
      }
    });
  }

  private getRedirectRouteByRole(user: any): string {
    if (!user.roles || user.roles.length === 0) {
      return '/kpis/management';
    }

    const roleNames = user.roles.map((r: any) => r.name?.toUpperCase() || '');

    const hasUserNivel1 = roleNames.some((r: string) => r === 'USER_NIVEL_1');
    const hasUserNivel2 = roleNames.some((r: string) => r === 'USER_NIVEL_2');
    const hasUserNivel3 = roleNames.some((r: string) => r === 'USER_NIVEL_3');

    if (hasUserNivel1) return '/kpis/employee/1';
    if (hasUserNivel2 || hasUserNivel3) return '/kpis/management';

    const isSuperAdmin = roleNames.includes('SUPER_ADMIN');
    const isAdmin = roleNames.includes('ADMIN');

    if (isSuperAdmin || isAdmin) return '/dashboard';
    if (roleNames.includes('USER')) return '/kpis/management';

    return '/kpis/management';
  }
}
