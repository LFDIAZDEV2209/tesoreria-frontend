import { Component, signal, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Subject, takeUntil } from 'rxjs';
import { PASSWORD_REQUIREMENTS, passwordPolicyValidator, passwordOperationError } from '../../../core/services/password-policy';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slide-up {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }

    @keyframes glow-pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(255, 183, 27, 0.4); }
      50% { box-shadow: 0 0 35px rgba(255, 183, 27, 0.7); }
    }

    @keyframes shimmer {
      0% { background-position: -1000px 0; }
      100% { background-position: 1000px 0; }
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }

    .login-container {
      animation: fade-in 0.8s ease-out;
    }

    .login-card {
      animation: slide-up 1s cubic-bezier(0.34, 1.56, 0.64, 1);
      backdrop-filter: blur(16px) saturate(180%);
      background: rgba(33, 48, 83, 0.75);
      border: 2px solid rgba(255, 183, 27, 0.3);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 
                  0 0 60px rgba(255, 183, 27, 0.1);
      transition: all 0.3s ease;
    }

    .login-card:hover {
      background: rgba(33, 48, 83, 0.85);
      border-color: rgba(255, 183, 27, 0.5);
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5),
                  0 0 80px rgba(255, 183, 27, 0.2);
    }

    .logo-container {
      animation: float 3s ease-in-out infinite;
    }

    .input-glass {
      background: rgba(4, 92, 148, 0.2);
      backdrop-filter: blur(8px);
      border: 2px solid rgba(4, 92, 148, 0.4);
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .input-glass::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 183, 27, 0.1),
        transparent
      );
      transition: left 0.5s;
    }

    .input-glass:hover {
      border-color: rgba(4, 92, 148, 0.6);
      background: rgba(4, 92, 148, 0.3);
    }

    .input-glass:hover::before {
      left: 100%;
    }

    .input-glass:focus {
      background: rgba(4, 92, 148, 0.35);
      border-color: #FFB71B;
      box-shadow: 0 0 0 4px rgba(255, 183, 27, 0.15),
                  0 8px 16px rgba(255, 183, 27, 0.2);
      transform: translateY(-2px);
    }

    .input-glass::placeholder {
      color: rgba(240, 240, 240, 0.5);
    }

    .btn-primary {
      background: linear-gradient(135deg, #FFB71B 0%, #e6a415 50%, #cc9112 100%);
      background-size: 200% 200%;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(255, 183, 27, 0.4);
    }

    .btn-primary::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition: width 0.6s, height 0.6s;
    }

    .btn-primary:hover::before {
      width: 300px;
      height: 300px;
    }

    .btn-primary:hover:not(:disabled) {
      background-position: 100% 0;
      transform: translateY(-3px);
      box-shadow: 0 12px 28px rgba(255, 183, 27, 0.5),
                  0 0 40px rgba(255, 183, 27, 0.3);
    }

    .btn-primary:active:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(255, 183, 27, 0.4);
    }

    .btn-primary.loading {
      animation: shimmer 2s infinite linear;
      background: linear-gradient(
        90deg,
        #e6a415 0%,
        #FFB71B 50%,
        #e6a415 100%
      );
      background-size: 200% 100%;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinner {
      border: 3px solid rgba(33, 48, 83, 0.3);
      border-top-color: #213053;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      animation: spin 0.8s linear infinite;
    }

    .error-alert {
      animation: shake 0.5s ease-in-out, slide-up 0.5s ease-out;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2));
      backdrop-filter: blur(8px);
      border: 1px solid rgba(239, 68, 68, 0.4);
    }

    .link-accent {
      color: #FFB71B;
      position: relative;
      transition: all 0.3s ease;
    }

    .link-accent::after {
      content: '';
      position: absolute;
      width: 0;
      height: 2px;
      bottom: -2px;
      left: 0;
      background: #FFB71B;
      transition: width 0.3s ease;
    }

    .link-accent:hover {
      color: #ffc94d;
    }

    .link-accent:hover::after {
      width: 100%;
    }

    .checkbox-custom {
      appearance: none;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(4, 92, 148, 0.6);
      border-radius: 4px;
      background: rgba(4, 92, 148, 0.2);
      cursor: pointer;
      position: relative;
      transition: all 0.3s ease;
    }

    .checkbox-custom:hover {
      border-color: #FFB71B;
      background: rgba(4, 92, 148, 0.3);
    }

    .checkbox-custom:checked {
      background: linear-gradient(135deg, #FFB71B, #e6a415);
      border-color: #FFB71B;
    }

    .checkbox-custom:checked::after {
      content: '✓';
      position: absolute;
      color: #213053;
      font-size: 14px;
      font-weight: bold;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    .label-float {
      transition: all 0.3s ease;
      color: rgba(240, 240, 240, 0.9);
    }

    .input-group:focus-within .label-float {
      transform: scale(0.95);
      color: #FFB71B;
    }

    @keyframes gradient-shift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .title-gradient {
      background: linear-gradient(135deg, #ffffff, #FFB71B, #ffffff);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradient-shift 3s ease infinite;
    }

    .accent-glow {
      color: #FFB71B;
      text-shadow: 0 0 10px rgba(255, 183, 27, 0.5);
    }

    /* Carousel Styles - Smoother and Slower Transitions */
    .carousel-image {
      opacity: 0;
      transition: opacity 2.5s ease-in-out;
      z-index: 0;
    }

    .carousel-image.active {
      opacity: 1;
      z-index: 1;
    }
  `],
  template: `
    <div class="relative min-h-screen w-full overflow-hidden login-container">
      <!-- Background Carousel -->
      <div class="absolute inset-0 w-full h-full overflow-hidden">
        @for (image of carouselImages; track image; let i = $index) {
          <img 
            [src]="image" 
            [alt]="'Carousel image ' + (i + 1)"
            class="absolute inset-0 w-full h-full object-cover carousel-image"
            [class.active]="currentImageIndex() === i"
          />
        }
      </div>
      
      <!-- Overlay with brand colors -->
      <div class="absolute inset-0 bg-gradient-to-br from-[#213053]/80 via-[#213053]/60 to-[#045C94]/70"></div>

      <!-- Login Content -->
      <div class="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6">
        <div class="w-full max-w-md">
          <div *ngIf="recoverySuccess() && !showRecoveryForm()" role="status" class="bg-green-800 text-white rounded-xl p-4 mb-4">
            {{ recoverySuccess() }}
          </div>
          <!-- LOGIN CARD -->
          <div *ngIf="!showChangePasswordForm() && !showRecoveryForm()" class="login-card rounded-3xl shadow-2xl p-8 sm:p-12 relative">
            <!-- Logo -->
            <div class="flex justify-center mb-8 logo-container">
              <div class="relative">
                <div class="absolute inset-0 bg-[#FFB71B]/30 rounded-full blur-3xl"></div>
                <img 
                  src="assets/images/Fombilogo3.png" 
                  alt="Fombi Logo" 
                  class="relative h-20 sm:h-24 w-auto object-contain filter drop-shadow-2xl"
                />
              </div>
            </div>

            <!-- Title -->
            <div class="text-center mb-10">
              <h1 class="text-3xl sm:text-4xl font-bold mb-3 title-gradient">
                Inicia sesión en tu cuenta
              </h1>
              <p class="text-[#F0F0F0]/80 text-sm sm:text-base leading-relaxed">
                Ingresa tu dirección de email y contraseña para acceder al panel de administración.
              </p>
            </div>

            <!-- Form -->
            <form [formGroup]="loginForm" (ngSubmit)="onLogin()" class="space-y-6">
              <!-- Email Input -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">📧</span> Email
                </label>
                <input
                  type="text"
                  formControlName="username"
                  placeholder="ejemplo@correo.com"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="loginForm.get('username')?.errors?.['required'] && loginForm.get('username')?.touched">
                  <span>⚠️</span> El email es requerido
                </p>
              </div>

              <!-- Password Input -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">🔒</span> Contraseña
                </label>
                <input
                  type="password"
                  formControlName="password"
                  placeholder="••••••••"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="loginForm.get('password')?.errors?.['required'] && loginForm.get('password')?.touched">
                  <span>⚠️</span> La contraseña es requerida
                </p>
              </div>

              <!-- Remember & Forgot Password Row -->
              <div class="flex items-center justify-between text-sm">
                <label class="flex items-center text-[#F0F0F0]/80 cursor-pointer hover:text-white transition-colors">
                  <input type="checkbox" formControlName="rememberMe" class="checkbox-custom mr-2" />
                  <span class="font-medium">Recordar usuario</span>
                </label>
                <button type="button" (click)="openRecoveryForm()" class="link-accent font-semibold transition-colors">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              <!-- Error Message -->
              <div *ngIf="isError()" class="error-alert rounded-xl p-4">
                <p class="text-red-200 text-sm font-semibold flex items-center gap-2">
                  <span class="text-lg">❌</span>
                  {{ getError() }}
                </p>
              </div>

              <!-- Submit Button -->
              <button
                type="submit"
                [disabled]="isLoading() || !loginForm.valid"
                [class.loading]="isLoading()"
                class="btn-primary w-full py-4 rounded-xl text-[#213053] font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3 relative overflow-hidden"
              >
                <span *ngIf="!isLoading()" class="relative z-10 flex items-center gap-2">
                  <span class="text-lg">🚀</span> Iniciar Sesión
                </span>
                <div *ngIf="isLoading()" class="flex items-center gap-3">
                  <div class="spinner"></div>
                  <span class="relative z-10">Iniciando sesión...</span>
                </div>
              </button>
            </form>
          </div>

          <!-- CHANGE PASSWORD CARD -->
          <div *ngIf="showChangePasswordForm() && !showRecoveryForm()" class="login-card rounded-3xl shadow-2xl p-8 sm:p-12 relative">
            <!-- Title -->
            <div class="text-center mb-10">
              <div style="font-size: 40px; margin-bottom: 12px;">🔐</div>
              <h1 class="text-3xl sm:text-4xl font-bold mb-3 title-gradient">
                Cambiar Contraseña
              </h1>
              <p class="text-[#F0F0F0]/80 text-sm sm:text-base leading-relaxed">
                Este es tu primer inicio de sesión. Debes cambiar tu contraseña temporal.
              </p>
            </div>

            <form [formGroup]="changePasswordForm" (ngSubmit)="onChangePassword()" class="space-y-6">
              <!-- Current Password -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">🔑</span> Contraseña Temporal
                </label>
                <input
                  type="password"
                  formControlName="currentPassword"
                  placeholder="Ingresa tu contraseña temporal"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                  [class.border-red-500]="isFieldInvalid('currentPassword')"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="isFieldInvalid('currentPassword')">
                  <span>⚠️</span> Campo requerido
                </p>
              </div>

              <!-- New Password -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">🔒</span> Nueva Contraseña
                </label>
                <input
                  type="password"
                  formControlName="newPassword"
                  placeholder="Ingresa tu nueva contraseña"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                  [class.border-red-500]="isFieldInvalid('newPassword')"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="isFieldInvalid('newPassword')">
                  <span>⚠️</span> {{ passwordRequirements }}
                </p>

                <!-- Password strength indicator -->
                <div class="mt-3 text-xs space-y-2">
                  <div class="flex items-center gap-2">
                    <div [class]="'w-2 h-2 rounded-full transition ' + (hasUppercase() ? 'bg-green-400' : 'bg-gray-400')"></div>
                    <span class="text-white/70">Mayúscula</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div [class]="'w-2 h-2 rounded-full transition ' + (hasLowercase() ? 'bg-green-400' : 'bg-gray-400')"></div>
                    <span class="text-white/70">Minúscula</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div [class]="'w-2 h-2 rounded-full transition ' + (hasNumber() ? 'bg-green-400' : 'bg-gray-400')"></div>
                    <span class="text-white/70">Número</span>
                  </div>
                </div>
              </div>

              <!-- Confirm Password -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">✓</span> Confirmar Contraseña
                </label>
                <input
                  type="password"
                  formControlName="confirmPassword"
                  placeholder="Confirma tu nueva contraseña"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                  [class.border-red-500]="isFieldInvalid('confirmPassword')"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="changePasswordForm.errors?.['passwordMismatch'] && changePasswordForm.touched">
                  <span>⚠️</span> Las contraseñas no coinciden
                </p>
              </div>

              <!-- Error Message -->
              <div *ngIf="changePasswordError()" class="error-alert rounded-xl p-4">
                <p class="text-red-200 text-sm font-semibold flex items-center gap-2">
                  <span class="text-lg">❌</span>
                  {{ changePasswordError() }}
                </p>
              </div>

              <!-- Buttons Row -->
              <div class="flex gap-3">
                <!-- Submit Button -->
                <button
                  type="submit"
                  [disabled]="changePasswordLoading() || !changePasswordForm.valid"
                  [class.loading]="changePasswordLoading()"
                  class="btn-primary flex-1 py-4 rounded-xl text-[#213053] font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  <span *ngIf="!changePasswordLoading()" class="flex items-center gap-2">
                    <span class="text-lg">✓</span> Cambiar Contraseña
                  </span>
                  <div *ngIf="changePasswordLoading()" class="flex items-center gap-2">
                    <div class="spinner"></div>
                    <span>Procesando...</span>
                  </div>
                </button>

                <!-- Cancel Button -->
                <button
                  type="button"
                  (click)="cancelChangePassword()"
                  class="flex-1 py-4 rounded-xl text-white font-bold text-base border-2 border-white/30 hover:border-white/60 transition"
                >
                  Salir
                </button>
              </div>

              <!-- Info Message -->
              <div style="background-color: rgba(255, 183, 27, 0.15); border: 2px solid rgba(255, 183, 27, 0.3); border-radius: 12px; padding: 16px;">
                <p style="color: rgba(240, 240, 240, 0.9); font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 18px;">💡</span>
                  Tu contraseña debe contener mayúsculas, minúsculas y números para mayor seguridad.
                </p>
              </div>
            </form>
          </div>

          <!-- RECOVERY PASSWORD CARD - STEP 1 -->
          <div *ngIf="showRecoveryForm() && !showRecoveryCodeForm()" class="login-card rounded-3xl shadow-2xl p-8 sm:p-12 relative">
            <!-- Title -->
            <div class="text-center mb-10">
              <div style="font-size: 40px; margin-bottom: 12px;">🔑</div>
              <h1 class="text-3xl sm:text-4xl font-bold mb-3 title-gradient">
                Recuperar Contraseña
              </h1>
              <p class="text-[#F0F0F0]/80 text-sm sm:text-base leading-relaxed">
                Ingresa tu email para recibir un código de recuperación
              </p>
            </div>

            <form [formGroup]="recoveryPasswordForm" (ngSubmit)="requestRecoveryCode()" class="space-y-6">
              <!-- Email Input -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">📧</span> Correo Electrónico
                </label>
                <input
                  type="email"
                  formControlName="email"
                  autocomplete="email"
                  placeholder="ejemplo@correo.com"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="recoveryPasswordForm.get('email')?.errors?.['required'] && recoveryPasswordForm.get('email')?.touched">
                  <span>⚠️</span> El email es requerido
                </p>
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="recoveryPasswordForm.get('email')?.errors?.['email'] && recoveryPasswordForm.get('email')?.touched">
                  <span>⚠️</span> Email inválido
                </p>
              </div>

              <!-- Error Message -->
              <div *ngIf="recoveryError()" class="error-alert rounded-xl p-4">
                <p class="text-red-200 text-sm font-semibold flex items-center gap-2">
                  <span class="text-lg">❌</span>
                  {{ recoveryError() }}
                </p>
              </div>

              <!-- Success Message -->
              <div *ngIf="recoverySuccess()" class="bg-green-500/20 border border-green-500/40 rounded-xl p-4">
                <p class="text-green-200 text-sm font-semibold flex items-center gap-2">
                  <span class="text-lg">✅</span>
                  {{ recoverySuccess() }}
                </p>
              </div>

              <!-- Buttons -->
              <div class="flex gap-3">
                <button
                  type="submit"
                  [disabled]="recoveryLoading() || !recoveryPasswordForm.valid"
                  [class.loading]="recoveryLoading()"
                  class="flex-1 btn-primary py-4 rounded-xl text-[#213053] font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 relative overflow-hidden"
                >
                  <span *ngIf="!recoveryLoading()" class="relative z-10 flex items-center gap-2">
                    <span class="text-lg">📬</span> Enviar Código
                  </span>
                  <div *ngIf="recoveryLoading()" class="flex items-center gap-3">
                    <div class="spinner"></div>
                    <span class="relative z-10">Enviando...</span>
                  </div>
                </button>
                <button
                  type="button"
                  (click)="closeRecoveryForm()"
                  [disabled]="recoveryLoading()"
                  class="flex-1 py-4 rounded-xl text-white font-bold text-base border-2 border-white/30 hover:border-white/60 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>

          <!-- RECOVERY PASSWORD CARD - STEP 2 (Code & New Password) -->
          <div *ngIf="showRecoveryForm() && showRecoveryCodeForm()" class="login-card rounded-3xl shadow-2xl p-8 sm:p-12 relative">
            <!-- Title -->
            <div class="text-center mb-10">
              <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
              <h1 class="text-3xl sm:text-4xl font-bold mb-3 title-gradient">
                Establecer Nueva Contraseña
              </h1>
              <p class="text-[#F0F0F0]/80 text-sm sm:text-base leading-relaxed">
                Ingresa el código de recuperación y tu nueva contraseña
              </p>
            </div>

            <p *ngIf="recoverySuccess()" role="status" class="text-green-200 text-sm mb-4">{{ recoverySuccess() }}</p>
            <p class="text-white/80 text-sm mb-4">Usa el último código recibido. Solicitar otro código invalida el anterior cuando se emite el nuevo.</p>

            <form [formGroup]="recoveryCodeForm" (ngSubmit)="resetPassword()" class="space-y-6">
              <!-- Recovery Code -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">🔐</span> Código de Recuperación
                </label>
                <input
                  type="text"
                  formControlName="code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  placeholder="Código de 6 dígitos"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="recoveryCodeForm.get('code')?.errors?.['required'] && recoveryCodeForm.get('code')?.touched">
                  <span>⚠️</span> El código es requerido
                </p>
                <p *ngIf="recoveryCodeForm.get('code')?.errors?.['pattern'] && recoveryCodeForm.get('code')?.touched" class="text-red-300 text-xs mt-2">Ingresa exactamente 6 dígitos.</p>
              </div>

              <!-- New Password -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">🔒</span> Nueva Contraseña
                </label>
                <input
                  type="password"
                  formControlName="newPassword"
                  placeholder="Ingresa tu nueva contraseña"
                  autocomplete="new-password"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="recoveryCodeForm.get('newPassword')?.invalid && recoveryCodeForm.get('newPassword')?.touched">
                  <span>⚠️</span> {{ passwordRequirements }}
                </p>
              </div>

              <!-- Confirm Password -->
              <div class="input-group">
                <label class="label-float block font-semibold mb-2 text-sm flex items-center gap-2">
                  <span class="accent-glow text-lg">✓</span> Confirmar Contraseña
                </label>
                <input
                  type="password"
                  formControlName="confirmPassword"
                  placeholder="Confirma tu nueva contraseña"
                  autocomplete="new-password"
                  class="input-glass w-full px-5 py-3.5 rounded-xl text-white placeholder-white/50 outline-none text-sm sm:text-base font-medium"
                />
                <p class="text-red-300 text-xs mt-2 font-medium ml-1 flex items-center gap-1" 
                   *ngIf="recoveryCodeForm.errors?.['passwordMismatch'] && recoveryCodeForm.touched">
                  <span>⚠️</span> Las contraseñas no coinciden
                </p>
              </div>

              <!-- Error Message -->
              <div *ngIf="recoveryError()" class="error-alert rounded-xl p-4">
                <p class="text-red-200 text-sm font-semibold flex items-center gap-2">
                  <span class="text-lg">❌</span>
                  {{ recoveryError() }}
                </p>
              </div>

              <!-- Buttons -->
              <div class="flex gap-3">
                <button
                  type="submit"
                  [disabled]="recoveryLoading() || !recoveryCodeForm.valid"
                  [class.loading]="recoveryLoading()"
                  class="flex-1 btn-primary py-4 rounded-xl text-[#213053] font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 relative overflow-hidden"
                >
                  <span *ngIf="!recoveryLoading()" class="relative z-10 flex items-center gap-2">
                    <span class="text-lg">🚀</span> Cambiar Contraseña
                  </span>
                  <div *ngIf="recoveryLoading()" class="flex items-center gap-3">
                    <div class="spinner"></div>
                    <span class="relative z-10">Guardando...</span>
                  </div>
                </button>
                <button
                  type="button"
                  (click)="backToEmailStep()"
                  [disabled]="recoveryLoading()"
                  class="flex-1 py-4 rounded-xl text-white font-bold text-base border-2 border-white/30 hover:border-white/60 transition"
                >
                  Atrás
                </button>
              </div>
              <button type="button" (click)="requestRecoveryCode()" [disabled]="recoveryLoading() || recoveryCooldown() > 0" class="text-white underline disabled:opacity-50">
                {{ recoveryCooldown() > 0 ? 'Solicitar otro código en ' + recoveryCooldown() + ' s' : 'Solicitar otro código' }}
              </button>
            </form>
          </div>

          <!-- Help Info -->
          <div class="mt-6 bg-gradient-to-r from-[#FFB71B]/15 to-[#FFB71B]/10 backdrop-blur-md border-2 border-[#FFB71B]/30 rounded-2xl p-5 shadow-lg">
            <p class="text-sm text-[#F0F0F0]/90 leading-relaxed">
              <span class="font-bold flex items-center gap-2 mb-2 text-[#FFB71B]">
                <span class="text-xl">💡</span> ¿Necesitas ayuda?
              </span>
              <span class="text-[#F0F0F0]/80">
                Si olvidaste tus credenciales, comunícate con tu jefe inmediato para recuperar el acceso al sistema.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent implements OnDestroy {
  loginForm: FormGroup;
  changePasswordForm!: FormGroup;
  recoveryPasswordForm!: FormGroup;
  recoveryCodeForm!: FormGroup;
  isError = signal(false);
  changePasswordError = signal('');
  changePasswordLoading = signal(false);
  showChangePasswordForm = signal(false);
  
  // Recovery Password Signals
  showRecoveryForm = signal(false);
  showRecoveryCodeForm = signal(false);
  recoveryError = signal('');
  recoverySuccess = signal('');
  recoveryLoading = signal(false);
  recoveryEmail = signal('');
  recoveryCooldown = signal(0);
  readonly passwordRequirements = PASSWORD_REQUIREMENTS;
  private readonly destroyed = new Subject<void>();
  private recoveryCooldownTimer?: ReturnType<typeof setInterval>;
  hasUppercase = signal(false);
  hasLowercase = signal(false);
  hasNumber = signal(false);
  carouselImages: string[] = [
   'assets/images/Carrusel1_1.jpg',
   'assets/images/Carrusel2_2.jpg',
   'assets/images/Carrusel3_3.jpg'
  ];
  currentImageIndex = signal(0);
  private carouselInterval: any;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      rememberMe: [false]
    });

    // Cargar credenciales guardadas si existen
    this.loadSavedCredentials();

    // Inicializar formulario de cambio de contraseña
    this.initializeChangePasswordForm();

    // Inicializar formulario de recuperación de contraseña
    this.initializeRecoveryPasswordForm();

    // Limpiar el flag de cambio de contraseña al llegar al login
    this.authService.requirePasswordChange.set(false);

    if (this.authService.isAuthenticated()) {
      const user = this.authService.getCurrentUser();
      if (user) {
        const redirectRoute = this.getRedirectRouteByRole(user);
        this.router.navigate([redirectRoute]);
      }
    }

    // Usar effect para escuchar cambios en requirePasswordChange signal
    effect(() => {
      if (this.authService.requirePasswordChange()) {
        this.showChangePasswordForm.set(true);
      }
    }, { allowSignalWrites: true });

    // Start automatic carousel
    this.startCarousel();
  }

  private initializeChangePasswordForm(): void {
    this.changePasswordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordPolicyValidator]],
      confirmPassword: ['', Validators.required]
    }, {
      validators: this.passwordMatchValidator
    });

    // Listener para validar fortaleza de contraseña
    this.changePasswordForm.get('newPassword')?.valueChanges.pipe(takeUntil(this.destroyed)).subscribe((password: string) => {
      this.hasUppercase.set(/[A-Z]/.test(password));
      this.hasLowercase.set(/[a-z]/.test(password));
      this.hasNumber.set(/[0-9]/.test(password));
    });
  }

  private initializeRecoveryPasswordForm(): void {
    // Paso 1: Formulario para solicitar código (email)
    this.recoveryPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    // Paso 2: Formulario para validar código y nueva contraseña
    this.recoveryCodeForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
      newPassword: ['', [Validators.required, passwordPolicyValidator]],
      confirmPassword: ['', Validators.required]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  private passwordMatchValidator(group: FormGroup): {[key: string]: any} | null {
    const password = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { 'passwordMismatch': true };
  }

  startCarousel(): void {
    this.carouselInterval = setInterval(() => {
      this.currentImageIndex.update(index => 
        (index + 1) % this.carouselImages.length
      );
    }, 10000); // Changed to 10 seconds (10000ms) for slower transitions
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    if (this.recoveryCooldownTimer) clearInterval(this.recoveryCooldownTimer);
    if (this.carouselInterval) {
      clearInterval(this.carouselInterval);
    }
  }

  onLogin(): void {
    if (!this.loginForm.valid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.authService.clearError();
    this.isError.set(false);

    const credentials = {
      username: this.loginForm.get('username')?.value,
      password: this.loginForm.get('password')?.value
    };

    // Guardar credenciales si está marcado "Recordarme"
    const rememberMe = this.loginForm.get('rememberMe')?.value;
    if (rememberMe) {
      this.saveCredentials(credentials.username);
    } else {
      this.clearSavedCredentials();
    }

    this.authService.login(credentials).subscribe({
      next: (response: any) => {
      },
      error: (err: any) => {
        this.isError.set(true);
        setTimeout(() => this.isError.set(false), 4000);
      }
    });
  }

  isLoading(): boolean {
    return this.authService.isLoading();
  }

  getError(): string {
    return this.authService.getError() || 'Error en la autenticación';
  }

  // Todos los usuarios ingresan al presupuesto (vista inicial de la plataforma)
  private getRedirectRouteByRole(user: any): string {
    return '/presupuesto/presupuesto';
  }

  onChangePassword(): void {
    if (this.changePasswordLoading() || !this.changePasswordForm.valid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    this.changePasswordLoading.set(true);
    this.changePasswordError.set('');

    const user = this.authService.getCurrentUser();
    const newPassword = this.changePasswordForm.get('newPassword')?.value;
    const currentPassword = this.changePasswordForm.get('currentPassword')?.value;
    const confirmPassword = this.changePasswordForm.get('confirmPassword')?.value;

    this.authService.changePassword(user?.userId, currentPassword, newPassword, confirmPassword).pipe(takeUntil(this.destroyed)).subscribe({
      next: (response: any) => {
        this.changePasswordLoading.set(false);
        // Limpiar la sesión y redirigir al login
        this.authService.logout();
        this.showChangePasswordForm.set(false);
        this.changePasswordForm.reset();
        this.loginForm.reset();
        this.clearSavedCredentials();
      },
      error: (err: any) => {
        this.changePasswordLoading.set(false);
        this.changePasswordError.set(passwordOperationError(err));
      }
    });
  }

  cancelChangePassword(): void {
    this.authService.logout();
    this.showChangePasswordForm.set(false);
    this.changePasswordForm.reset();
    this.loginForm.reset();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.changePasswordForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  private navigateByRole(): void {
    const user = this.authService.getCurrentUser();
    if (user) {
      const redirectRoute = this.getRedirectRouteByRole(user);
      this.router.navigate([redirectRoute]);
    }
  }

  // ========== FUNCIONES DE RECUPERACIÓN DE CONTRASEÑA ==========

  openRecoveryForm(): void {
    if (this.recoveryLoading()) return;
    this.showRecoveryForm.set(true);
    this.recoveryPasswordForm.reset();
    this.recoveryCodeForm.reset();
    this.recoveryError.set('');
    this.recoverySuccess.set('');
    this.showRecoveryCodeForm.set(false);
    this.recoveryEmail.set('');
  }

  closeRecoveryForm(): void {
    if (this.recoveryLoading()) return;
    this.showRecoveryForm.set(false);
    this.showRecoveryCodeForm.set(false);
    this.recoveryPasswordForm.reset();
    this.recoveryCodeForm.reset();
    this.recoveryError.set('');
    this.recoverySuccess.set('');
    this.recoveryEmail.set('');
  }

  requestRecoveryCode(): void {
    if (this.recoveryLoading() || (this.showRecoveryCodeForm() && this.recoveryCooldown() > 0)) return;
    const emailControl = this.recoveryPasswordForm.get('email');
    emailControl?.setValue((emailControl.value ?? '').trim());
    if (!this.recoveryPasswordForm.valid) {
      this.recoveryPasswordForm.markAllAsTouched();
      return;
    }

    this.recoveryLoading.set(true);
    this.recoveryError.set('');
    this.recoverySuccess.set('');

    const email = this.recoveryPasswordForm.get('email')?.value;
    this.recoveryEmail.set(email);

    this.authService.requestPasswordRecovery(email).pipe(takeUntil(this.destroyed)).subscribe({
      next: () => {
        this.recoveryLoading.set(false);
        this.recoverySuccess.set('Si el correo corresponde a una cuenta habilitada, recibirás un código. Revisa también la carpeta de correo no deseado.');
        this.recoveryCodeForm.reset();
        this.showRecoveryCodeForm.set(true);
        this.startRecoveryCooldown();
      },
      error: (err: any) => {
        this.recoveryLoading.set(false);
        this.recoveryError.set(passwordOperationError(err, 'request'));
      }
    });
  }

  resetPassword(): void {
    if (this.recoveryLoading() || !this.showRecoveryCodeForm() || !this.recoveryEmail()) return;
    if (!this.recoveryCodeForm.valid) {
      this.recoveryCodeForm.markAllAsTouched();
      return;
    }

    this.recoveryLoading.set(true);
    this.recoveryError.set('');
    this.recoverySuccess.set('');

    const code = this.recoveryCodeForm.get('code')?.value;
    const newPassword = this.recoveryCodeForm.get('newPassword')?.value;
    const confirmPassword = this.recoveryCodeForm.get('confirmPassword')?.value;
    const email = this.recoveryEmail();

    this.authService.resetPasswordWithCode(email, code, newPassword, confirmPassword).pipe(takeUntil(this.destroyed)).subscribe({
      next: () => {
        this.recoveryLoading.set(false);
        this.closeRecoveryForm();
        this.loginForm.reset();
        this.clearSavedCredentials();
        this.recoverySuccess.set('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
      },
      error: (err: any) => {
        this.recoveryLoading.set(false);
        this.recoveryError.set(passwordOperationError(err, 'recovery'));
      }
    });
  }

  backToEmailStep(): void {
    if (this.recoveryLoading()) return;
    this.showRecoveryCodeForm.set(false);
    this.recoveryCodeForm.reset();
    this.recoveryError.set('');
    this.recoverySuccess.set('');
    this.recoveryEmail.set('');
  }

  private startRecoveryCooldown(): void {
    if (this.recoveryCooldownTimer) clearInterval(this.recoveryCooldownTimer);
    const availableAt = Date.now() + 60000;
    this.recoveryCooldown.set(60);
    this.recoveryCooldownTimer = setInterval(() => {
      this.recoveryCooldown.set(Math.max(0, Math.ceil((availableAt - Date.now()) / 1000)));
      if (this.recoveryCooldown() === 0) clearInterval(this.recoveryCooldownTimer);
    }, 1000);
  }

  /**
   * Recordar únicamente el usuario; las contraseñas pertenecen al gestor del navegador.
   */
  private saveCredentials(username: string): void {
    try {
      localStorage.removeItem('login_credentials');
      localStorage.setItem('login_username', username);
    } catch {
      // Remembering a username is optional when browser storage is unavailable.
    }
  }

  /**
   * Carga las credenciales guardadas desde localStorage
   */
  private loadSavedCredentials(): void {
    try {
      localStorage.removeItem('login_credentials');
      const username = localStorage.getItem('login_username');
      if (username) this.loginForm.patchValue({ username, rememberMe: true });
    } catch {
      // A browser storage policy must not prevent the user from signing in.
    }
  }

  /**
   * Borra las credenciales guardadas
   */
  private clearSavedCredentials(): void {
    try {
      localStorage.removeItem('login_credentials');
      localStorage.removeItem('login_username');
    } catch {
      // Do not log browser errors that may contain credential storage contents.
    }
  }
}



