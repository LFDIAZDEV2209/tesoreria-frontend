import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { RoleService } from '../../../core/services/role.service';
import { PasswordGeneratorService } from '../../../core/services/password-generator.service';
import { Role, RoleName, SUPER_ADMIN_ONLY_ROLES } from '../../../core/models/role.model';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, ReactiveFormsModule, RouterModule],
  styles: [`
    @keyframes fade-in-up {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in-up { animation: fade-in-up 0.45s cubic-bezier(0.4,0,0.2,1); }

    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    .shimmer-btn {
      background: linear-gradient(90deg, #045c94 0%, #0a7dc4 40%, #FFB71B 60%, #045c94 100%);
      background-size: 200% auto;
      animation: shimmer 3s linear infinite;
    }

    .field-focus:focus-within label { color: #FFB71B; }
    .input-base {
      transition: border-color .2s, box-shadow .2s;
    }
    .input-base:focus {
      outline: none;
      border-color: #045c94;
      box-shadow: 0 0 0 3px rgba(4,92,148,.18);
    }
  `],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 p-6">

      <!-- Page Header -->
      <div class="mb-8 animate-fade-in-up">
        <div class="flex items-center gap-3 mb-1">
          <a
            routerLink="/users/management"
            class="flex items-center gap-1 text-sm text-slate-500 hover:text-[#045c94] transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            Gestión de Usuarios
          </a>
          <span class="text-slate-300">/</span>
          <span class="text-sm text-[#045c94] font-medium">Crear Usuario</span>
        </div>

        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#045c94] to-[#0a7dc4] flex items-center justify-center shadow-lg">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-[#213053]">Crear Nuevo Usuario</h1>
            <p class="text-sm text-slate-500">Solo los Super Administradores pueden crear usuarios y asignar roles</p>
          </div>
        </div>
      </div>

      <!-- Form Card -->
      <div class="max-w-2xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-fade-in-up"
             style="animation-delay:.08s">

          <!-- Card Header -->
          <div class="px-8 py-5 border-b border-slate-100 bg-gradient-to-r from-[#045c94]/5 to-transparent">
            <h2 class="text-base font-semibold text-[#213053]">Datos del Usuario</h2>
            <p class="text-xs text-slate-400 mt-0.5">Completa todos los campos requeridos</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-8 space-y-6">

            <!-- Username -->
            <div class="field-focus">
              <label class="block text-sm font-medium text-slate-600 mb-1.5 transition-colors">
                Nombre de usuario <span class="text-red-500">*</span>
              </label>
              <input
                formControlName="username"
                type="text"
                placeholder="ej: jdoe"
                class="input-base w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-[#213053] placeholder-slate-300 text-sm"
              />
              @if (f['username'].invalid && f['username'].touched) {
                <p class="mt-1 text-xs text-red-500">
                  {{ getUsernameError() }}
                </p>
              }
            </div>

            <!-- Email -->
            <div class="field-focus">
              <label class="block text-sm font-medium text-slate-600 mb-1.5 transition-colors">
                Correo electrónico <span class="text-red-500">*</span>
              </label>
              <input
                formControlName="email"
                type="email"
                placeholder="ej: jdoe@empresa.com"
                class="input-base w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-[#213053] placeholder-slate-300 text-sm"
              />
              @if (f['email'].invalid && f['email'].touched) {
                <p class="mt-1 text-xs text-red-500">Ingresa un correo válido</p>
              }
            </div>

            <!-- Password -->
            <div class="field-focus">
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-sm font-medium text-slate-600 transition-colors">
                  Contraseña temporal <span class="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  (click)="generatePassword()"
                  class="flex items-center gap-1 text-xs text-[#045c94] hover:text-[#FFB71B] transition-colors"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  Generar automáticamente
                </button>
              </div>
              <div class="relative">
                <input
                  formControlName="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  placeholder="Mínimo 8 caracteres"
                  class="input-base w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50/60 text-[#213053] placeholder-slate-300 text-sm"
                />
                <button
                  type="button"
                  (click)="showPassword.set(!showPassword())"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#045c94] transition-colors"
                >
                  @if (showPassword()) {
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21"/>
                    </svg>
                  } @else {
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  }
                </button>
              </div>
              @if (f['password'].invalid && f['password'].touched) {
                <p class="mt-1 text-xs text-red-500">La contraseña debe tener al menos 8 caracteres</p>
              }
              <p class="mt-1 text-xs text-slate-400">
                El usuario deberá cambiar esta contraseña en su primer inicio de sesión.
              </p>
            </div>

            <!-- Role -->
            <div class="field-focus">
              <label class="block text-sm font-medium text-slate-600 mb-1.5 transition-colors">
                Rol <span class="text-red-500">*</span>
              </label>

              @if (rolesLoading()) {
                <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                  <span class="h-4 w-4 border-2 border-[#045c94]/30 border-t-[#045c94] rounded-full animate-spin"></span>
                  <span class="text-sm text-slate-400">Cargando roles...</span>
                </div>
              } @else {
                <select
                  formControlName="roleId"
                  class="input-base w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-[#213053] text-sm appearance-none cursor-pointer"
                >
                  <option value="" disabled>Selecciona un rol</option>
                  @for (role of availableRoles(); track role.id) {
                    <option [value]="role.id">{{ getRoleDisplayName(role.name) }}</option>
                  }
                </select>
              }

              @if (f['roleId'].invalid && f['roleId'].touched) {
                <p class="mt-1 text-xs text-red-500">Selecciona un rol para el usuario</p>
              }

              <!-- Role descriptions -->
              @if (f['roleId'].value) {
                <div class="mt-2 px-3 py-2 rounded-lg bg-[#045c94]/5 border border-[#045c94]/10">
                  <p class="text-xs text-[#045c94]">{{ getRoleDescription(f['roleId'].value) }}</p>
                </div>
              }
            </div>

            <!-- Require password change toggle -->
            <div class="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <input
                formControlName="requirePasswordChange"
                type="checkbox"
                id="requirePasswordChange"
                class="w-4 h-4 rounded accent-[#FFB71B] cursor-pointer"
              />
              <label for="requirePasswordChange" class="text-sm text-amber-700 cursor-pointer select-none">
                Requerir cambio de contraseña en el primer inicio de sesión
              </label>
            </div>

            <!-- Error message -->
            @if (errorMessage()) {
              <div class="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p class="text-sm text-red-600">{{ errorMessage() }}</p>
              </div>
            }

            <!-- Success message -->
            @if (successMessage()) {
              <div class="flex items-start gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
                <svg class="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p class="text-sm text-green-700">{{ successMessage() }}</p>
              </div>
            }

            <!-- Actions -->
            <div class="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <a
                routerLink="/users/management"
                class="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </a>
              <button
                type="submit"
                [disabled]="loading() || form.invalid"
                class="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed
                       enabled:hover:scale-[1.02] enabled:active:scale-95"
                [class.shimmer-btn]="!loading() && form.valid"
                [class.bg-slate-300]="loading() || form.invalid"
              >
                @if (loading()) {
                  <span class="flex items-center gap-2">
                    <span class="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Creando usuario...
                  </span>
                } @else {
                  Crear Usuario
                }
              </button>
            </div>

          </form>
        </div>
      </div>

    </div>
  `,
})
export class CreateUserComponent implements OnInit {

  form: FormGroup;
  showPassword    = signal(false);
  loading         = signal(false);
  rolesLoading    = signal(true);
  errorMessage    = signal('');
  successMessage  = signal('');
  availableRoles  = signal<Role[]>([]);

  private readonly roleDescriptions: Record<string, string> = {
    SUPER_ADMIN:    'Acceso total al sistema. Puede crear usuarios, asignar roles y configurar todo.',
    ADMIN:          'Administrador con acceso a la mayoría de módulos, excepto la gestión de Super Admins.',
    DOCUMENT_ADMIN: 'Puede visualizar y validar documentos, empleados y reportes.',
    SUPERVISOR:     'Supervisa a usuarios de nivel 1, 2 y 3. Acceso a bandeja y seguimiento.',
    USER_NIVEL_3:   'Usuario operativo con permisos avanzados de nivel 3.',
    USER_NIVEL_2:   'Usuario operativo con permisos de nivel 2.',
    USER_NIVEL_1:   'Usuario operativo con permisos básicos de nivel 1.',
    USER:           'Usuario estándar con acceso mínimo al sistema.',
  };

  private readonly roleDisplayNames: Record<string, string> = {
    SUPER_ADMIN:    'Super Administrador',
    ADMIN:          'Administrador',
    DOCUMENT_ADMIN: 'Administrador de Documentos',
    SUPERVISOR:     'Supervisor',
    USER_NIVEL_3:   'Usuario Nivel 3',
    USER_NIVEL_2:   'Usuario Nivel 2',
    USER_NIVEL_1:   'Usuario Nivel 1',
    USER:           'Usuario',
  };

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private roleService: RoleService,
    private passwordGenerator: PasswordGeneratorService,
    private router: Router,
  ) {
    this.form = this.fb.group({
      username:              ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^\S+$/)]],
      email:                 ['', [Validators.required, Validators.email]],
      password:              ['', [Validators.required, Validators.minLength(8)]],
      roleId:                ['', Validators.required],
      requirePasswordChange: [true],
    });
  }

  ngOnInit(): void {
    this.loadRoles();
  }

  get f(): { [key: string]: AbstractControl } {
    return this.form.controls;
  }

  generatePassword(): void {
    const pwd = this.passwordGenerator.generateTemporaryPassword();
    this.form.patchValue({ password: pwd });
    this.showPassword.set(true);
  }

  getRoleDisplayName(name: string): string {
    return this.roleDisplayNames[name] ?? name;
  }

  getRoleDescription(roleId: string | number): string {
    const role = this.availableRoles().find(r => String(r.id) === String(roleId));
    if (!role) return '';
    return this.roleDescriptions[role.name] ?? '';
  }

  getUsernameError(): string {
    const ctrl = this.f['username'];
    if (ctrl.hasError('required'))    return 'El nombre de usuario es obligatorio';
    if (ctrl.hasError('minlength'))   return 'Debe tener al menos 3 caracteres';
    if (ctrl.hasError('pattern'))     return 'No debe contener espacios';
    return '';
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const { username, email, password, roleId, requirePasswordChange } = this.form.value;

    const selectedRole = this.availableRoles().find(r => String(r.id) === String(roleId));

    this.userService.createUser({
      username,
      email,
      password,
      active: true,
      roles: selectedRole ? [selectedRole] : [],
      requirePasswordChange,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.successMessage.set(`Usuario "${username}" creado correctamente. Redirigiendo...`);
        setTimeout(() => this.router.navigate(['/users/management']), 1800);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message ?? err?.error ?? 'Error al crear el usuario. Intenta de nuevo.';
        this.errorMessage.set(typeof msg === 'string' ? msg : JSON.stringify(msg));
      },
    });
  }

  private loadRoles(): void {
    this.rolesLoading.set(true);
    this.roleService.getRoles().subscribe({
      next: (roles) => {
        this.availableRoles.set(roles);
        this.rolesLoading.set(false);
      },
      error: () => {
        // Fallback: cargar roles estáticos si el API falla
        this.availableRoles.set(this.getStaticRoles());
        this.rolesLoading.set(false);
      },
    });
  }

  private getStaticRoles(): Role[] {
    const names: RoleName[] = [
      'SUPER_ADMIN', 'ADMIN', 'DOCUMENT_ADMIN',
      'SUPERVISOR', 'USER_NIVEL_3', 'USER_NIVEL_2', 'USER_NIVEL_1', 'USER',
    ];
    return names.map((name, i) => ({ id: i + 1, name }));
  }
}
