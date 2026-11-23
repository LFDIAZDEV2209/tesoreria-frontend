import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AuthorizationService } from '../../../core/services/authorization.service';
import { PresupuestoToastService } from '../../presupuesto/services/presupuesto-toast.service';
import { GpIconComponent } from '../../presupuesto/components/gp-icon/gp-icon.component';
import { GpModalComponent } from '../../presupuesto/components/gp-modal/gp-modal.component';
import { PASSWORD_REQUIREMENTS, passwordPolicyErrors, passwordOperationError } from '../../../core/services/password-policy';
import { LoginResponse } from '../../../core/models/auth.model';

interface FilaInfo {
  icono: string;
  label: string;
  valor: string;
}

interface OpcionAdmin {
  titulo: string;
  desc: string;
  ruta: string;
  icono: string;
}

const ETIQUETA_ROL: Record<string, string> = {
  DIRECTOR_CONTABLE: 'Director Contable',
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  DOCUMENT_ADMIN: 'Admin de Documentos',
  SUPERVISOR: 'Supervisor',
  USER_NIVEL_1: 'Usuario Nivel 1',
  USER_NIVEL_2: 'Usuario Nivel 2',
  USER_NIVEL_3: 'Usuario Nivel 3',
  USER: 'Usuario',
};

/**
 * "Mi Perfil" — se abre al hacer clic en la tarjeta "Sesión activa" del
 * sidebar. Muestra la información personal del usuario y, para superadmin,
 * las configuraciones de administración (roles y permisos del Gestor
 * Presupuestal, usuarios del GP y auditoría).
 */
@Component({
  selector: 'app-mi-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule, GpIconComponent, GpModalComponent],
  templateUrl: './mi-perfil.component.html',
  styleUrls: ['./mi-perfil.component.scss'],
})
export class MiPerfilComponent {

  usuario = signal<LoginResponse | null>(null);

  // ── Foto y "Acerca de mí" (locales al navegador, por usuario) ──
  fotoUrl = signal<string | null>(null);
  acerca = signal('');
  editandoAcerca = signal(false);
  acercaDraft = signal('');

  // ── Cambiar contraseña ──
  showPasswordModal = signal(false);
  claveActual = signal('');
  claveNueva = signal('');
  claveConfirmar = signal('');
  errorClave = signal<string | null>(null);
  guardandoClave = signal(false);

  employee = computed(() => this.usuario()?.employee ?? null);

  nombreCompleto = computed(() => {
    const e = this.employee();
    const armado = [e?.['firstName'], e?.['lastName']].filter(Boolean).join(' ');
    return (e?.['fullName'] || armado || this.usuario()?.username || 'Usuario').toString();
  });

  iniciales = computed(() => {
    const partes = this.nombreCompleto().trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '👤';
  });

  email = computed(() => this.employee()?.['corporateEmail'] || this.usuario()?.email || '—');

  rolLabel = computed(() => {
    const rol = this.authorization.hasRole('DIRECTOR_CONTABLE') && !this.authorization.hasAnyRole(['SUPER_ADMIN', 'ADMIN'])
      ? 'DIRECTOR_CONTABLE' : this.authorization.getHighestRole();
    return ETIQUETA_ROL[rol] ?? rol ?? 'Usuario';
  });

  perfilGestion = computed(() => (this.employee()?.['isDirectManager'] ? 'Jefe directo' : null));

  empresa = computed(() => this.employee()?.['companyName'] || null);

  area = computed(() => this.employee()?.['area'] || this.employee()?.['department'] || null);

  jefeDirecto = computed(() => this.employee()?.['directManager'] || this.employee()?.['supervisorName'] || null);

  informacion = computed<FilaInfo[]>(() => {
    const u = this.usuario();
    const e = this.employee();
    const filas: FilaInfo[] = [
      { icono: 'user', label: 'Nombre completo', valor: this.nombreCompleto() },
      { icono: 'users', label: 'Usuario', valor: u?.username ?? '—' },
      { icono: 'file', label: 'Email', valor: this.email() },
    ];
    if (u?.employeeId) filas.push({ icono: 'building', label: 'ID Empleado', valor: String(u.employeeId) });
    const cargo = e?.['jobPosition'] || e?.['positionName'];
    if (cargo) filas.push({ icono: 'suitcase', label: 'Cargo', valor: String(cargo) });
    if (this.area()) filas.push({ icono: 'layers', label: 'Área', valor: String(this.area()) });
    return filas;
  });

  esSuperadmin = computed(() => this.authorization.isSuperAdmin());

  opcionesAdmin = signal<OpcionAdmin[]>([
    {
      titulo: 'Usuarios y Accesos',
      desc: 'Da acceso a NEXA, asigna roles, empresas del Gestor Presupuestal y claves temporales',
      ruta: '/presupuesto/usuarios',
      icono: 'users',
    },
    {
      titulo: 'Empresas por Usuario',
      desc: 'Matriz rápida para asignar empresas y el permiso de aprobación por cuenta',
      ruta: '/presupuesto/usuarios-empresas',
      icono: 'building',
    },
    {
      titulo: 'Gestión de Roles y Permisos',
      desc: 'Configura qué permisos tiene cada rol del Gestor Presupuestal',
      ruta: '/configuracion/roles-permisos',
      icono: 'shield',
    },
    {
      titulo: 'Auditoría del Gestor Presupuestal',
      desc: 'Revisa quién hizo qué en cada empresa',
      ruta: '/presupuesto/auditoria',
      icono: 'file',
    },
  ]);

  constructor(
    private authService: AuthService,
    private authorization: AuthorizationService,
    private toast: PresupuestoToastService,
    private router: Router,
    private location: Location,
  ) {
    const user = this.authService.getCurrentUser();
    this.usuario.set(user);
    if (user) {
      const foto = localStorage.getItem(this.claveFoto());
      if (foto) this.fotoUrl.set(foto);
      this.acerca.set(localStorage.getItem(this.claveAcerca()) ?? '');
    }
  }

  volver(): void {
    this.location.back();
  }

  ir(ruta: string): void {
    this.router.navigateByUrl(ruta);
  }

  // ── Foto de perfil ──

  subirFoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      this.toast.error('Solo se aceptan imágenes.');
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      this.toast.error('La imagen no puede superar 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      this.fotoUrl.set(dataUrl);
      localStorage.setItem(this.claveFoto(), dataUrl);
      this.toast.mostrar('Foto de perfil actualizada');
    };
    reader.readAsDataURL(archivo);
  }

  quitarFoto(): void {
    this.fotoUrl.set(null);
    localStorage.removeItem(this.claveFoto());
    this.toast.mostrar('Foto de perfil eliminada');
  }

  // ── Acerca de mí ──

  editarAcerca(): void {
    this.acercaDraft.set(this.acerca());
    this.editandoAcerca.set(true);
  }

  guardarAcerca(): void {
    const texto = this.acercaDraft().trim();
    this.acerca.set(texto);
    localStorage.setItem(this.claveAcerca(), texto);
    this.editandoAcerca.set(false);
    this.toast.mostrar('Descripción actualizada');
  }

  cancelarAcerca(): void {
    this.editandoAcerca.set(false);
  }

  // ── Cambiar contraseña ──

  abrirCambioClave(): void {
    this.claveActual.set('');
    this.claveNueva.set('');
    this.claveConfirmar.set('');
    this.errorClave.set(null);
    this.showPasswordModal.set(true);
  }

  cerrarCambioClave(): void {
    if (this.guardandoClave()) return;
    this.showPasswordModal.set(false);
    this.claveActual.set('');
    this.claveNueva.set('');
    this.claveConfirmar.set('');
  }

  cambiarClave(): void {
    if (this.guardandoClave()) return;
    const actual = this.claveActual();
    const nueva = this.claveNueva();
    const confirmar = this.claveConfirmar();
    if (!actual) {
      this.errorClave.set('Ingresa tu contraseña actual.');
      return;
    }
    if (passwordPolicyErrors(nueva)) {
      this.errorClave.set(PASSWORD_REQUIREMENTS);
      return;
    }
    if (nueva !== confirmar) {
      this.errorClave.set('Las contraseñas no coinciden.');
      return;
    }
    const userId = this.usuario()?.userId;
    if (!userId) {
      this.errorClave.set('No se pudo identificar el usuario de la sesión.');
      return;
    }
    this.errorClave.set(null);
    this.guardandoClave.set(true);
    this.authService.changePassword(userId, actual, nueva, confirmar).subscribe({
      next: () => {
        this.guardandoClave.set(false);
        this.cerrarCambioClave();
        localStorage.removeItem('login_credentials');
        this.toast.mostrar('Contraseña actualizada correctamente');
        this.authService.logout();
      },
      error: (e: any) => {
        this.guardandoClave.set(false);
        this.errorClave.set(passwordOperationError(e));
      },
    });
  }

  // ── Helpers ──

  private claveFoto(): string {
    return `nexa_perfil_foto_${this.usuario()?.username ?? 'anon'}`;
  }

  private claveAcerca(): string {
    return `nexa_perfil_acerca_${this.usuario()?.username ?? 'anon'}`;
  }
}
