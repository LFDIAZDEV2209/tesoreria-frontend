import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, HostListener, computed, effect, inject, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { GpSessionService } from '../../services/gp-session.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { GpErrorStateComponent } from '../gp-error-state/gp-error-state.component';
import { GpNotificacionesComponent } from '../gp-notificaciones/gp-notificaciones.component';
import { mensajeError } from '../../services/gp-errores';
import { environment } from '../../../../../environments/environment';
import { Empresa } from '../../models/presupuesto.model';
import { GpNavigationService } from '../../services/gp-navigation.service';
import { GpPeriodoService } from '../../services/gp-periodo.service';
import { periodoHistorico } from '../../models/historico.model';

@Component({
  selector: 'app-gp-navigation', standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, RouterLink, RouterLinkActive, GpIconComponent, GpErrorStateComponent, GpNotificacionesComponent],
  templateUrl: './gp-navigation.component.html',
  styleUrls: ['../../styles/reference.css', './gp-navigation.component.scss', '../../styles/nexa.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class GpNavigationComponent {
  readonly session = inject(GpSessionService);
  readonly ctx = inject(PresupuestoContextService);
  readonly periodos = inject(GpPeriodoService);
  readonly etiquetaPeriodo = periodoHistorico;
  /** Estado del período activo como chip visual (texto + tono). */
  readonly estadoPeriodo = computed<{ texto: string; tono: 'info' | 'ok' | 'warn' | 'muted' }>(() => {
    if (this.periodos.loading()) return { texto: 'Consultando período…', tono: 'info' };
    if (this.periodos.error()) return { texto: 'Pendiente de consulta', tono: 'warn' };
    if (this.periodos.cerrado()) return { texto: 'Mes aprobado · Edición de Gerencia y Superadmin', tono: 'muted' };
    if (this.periodos.creado()) return { texto: 'Mes abierto', tono: 'ok' };
    return { texto: 'Mes no creado', tono: 'warn' };
  });
  readonly navigation = inject(GpNavigationService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(PresupuestoToastService);
  private readonly router = inject(Router);
  readonly adminOpen = signal(false);
  readonly accountOpen = signal(false);
  readonly mostrarSelector = computed(() => this.session.estado()?.rol !== 'contador' || this.ctx.empresas().length > 1);
  readonly saving = signal(false);
  readonly error = signal('');
  nombre = '';
  actual = '';
  nueva = '';
  repetir = '';
  constructor() {
    effect(() => { if (this.session.estado()?.debe_cambiar_password && !this.nombre) this.nombre = this.session.estado()?.nombre || ''; });
  }
  necesitaEmpresa(): boolean {
    return !this.ctx.empresaId() && !/\/(historicos|periodos|resumen-gerencial|usuarios|categorias|auditoria|historial)(?:[/?#]|$)/.test(this.router.url);
  }
  readonly mesesConsulta = computed(() => [...new Set([...this.ctx.estadosMes().map(m => m.periodo), ...this.periodos.datosEmpresa(), ...this.periodos.pagosEmpresa()])].sort().reverse());
  esVistaMensual():boolean {
    if (/^\/presupuesto\/(proveedores|cuentas-pagar|impuestos|otros-pagos|cuentas-cobrar|anticipos)(?:[/?#]|$)/.test(this.router.url)
        && (this.ctx.vistaCompleta() || this.ctx.vistaLegalizados())) return false;
    return /^\/presupuesto\/(pagos-sugeridos|proveedores|cuentas-pagar|impuestos|otros-pagos|cuentas-cobrar|anticipos)(?:[/?#]|$)/.test(this.router.url);
  }
  esVistaHistorica(): boolean {
    return /^\/presupuesto\/historicos(?:[/?#]|$)/.test(this.router.url);
  }
  administracionActiva(): boolean {
    return /\/presupuesto\/(usuarios|maestro-proveedores|categorias|auditoria)(?:[/?#]|$)/.test(this.router.url);
  }
  readonly gruposEmpresas = computed(() => {
    const grupos = new Map<string, Empresa[]>();
    for (const empresa of this.ctx.empresas()) {
      const responsable = empresa.responsable || 'Empresas';
      grupos.set(responsable, [...(grupos.get(responsable) || []),empresa]);
    }
    return [...grupos].sort(([a],[b]) => a.localeCompare(b)).map(([responsable,empresas])=>({responsable,empresas}));
  });
  readonly items = this.navigation.items;
  readonly adminItems = this.navigation.adminItems;
  readonly roleName = computed(() => this.session.estado()?.cargo ||
    (this.session.estado()?.rol_nexa === 'director_contable' ? 'Director Contable' :
     this.session.estado()?.rol_nexa === 'tesorero' ? 'Tesorería' :
     this.session.estado()?.rol_nexa === 'gerente_financiero' ? 'Gerencia Financiera' :
      { contador: 'Contador', gerente: 'Gerencia', superadmin: 'Superadmin',
        gerente_financiero: 'Gerencia Financiera', director_contable: 'Director Contable',
        tesorero: 'Tesorería', editor_contable: 'Editor Contable',
        auxiliar_contable: 'Auxiliar Contable' }[this.session.estado()?.rol ?? 'contador']));
  abrirCuenta(): void {
    this.nombre = this.session.estado()?.nombre || '';
    this.actual = this.nueva = this.repetir = '';
    this.error.set(''); this.accountOpen.set(true);
  }
  cerrarCuenta(): void {
    if (!this.saving() && !this.session.estado()?.debe_cambiar_password) this.accountOpen.set(false);
  }
  @HostListener('document:click', ['$event']) outsideAdmin(event: MouseEvent): void {
    if (!(event.target as Element)?.closest('.gp-native-admin')) this.adminOpen.set(false);
  }
  @HostListener('document:keydown.escape') escape(): void { this.adminOpen.set(false); this.cerrarCuenta(); }
  guardarPerfil(): void {
    if (this.saving()) return;
    const cambio = !!(this.nueva || this.repetir);
    if (this.session.estado()?.debe_cambiar_password && (!this.nombre.trim() || !cambio)) { this.error.set('Pon tu nombre completo y una clave nueva para continuar.'); return; }
    if (cambio && this.nueva !== this.repetir) { this.error.set('Las claves nuevas no coinciden.'); return; }
    if (cambio && this.nueva.length < 8) { this.error.set('La clave nueva debe tener al menos 8 caracteres.'); return; }
    const body: Record<string, string> = {};
    if (this.nombre.trim()) body['nombre'] = this.nombre.trim();
    if (cambio) { body['password_actual'] = this.actual; body['password_nueva'] = this.nueva; }
    this.saving.set(true); this.error.set('');
    this.http.put<{nombre: string}>(`${environment.gpApiUrl}/auth/perfil`, body).subscribe({
      next: perfil => {
        const estado = this.session.estado();
        if (estado) this.session.estado.set({ ...estado, nombre: perfil.nombre, debe_cambiar_password: false });
        this.actual = this.nueva = this.repetir = '';
        this.saving.set(false); this.accountOpen.set(false); this.toast.mostrar('Datos actualizados');
      },
      error: err => { this.saving.set(false); this.error.set(mensajeError(err, 'No se pudo actualizar el perfil.')); },
    });
  }
  salir(): void { this.session.logout(); }
}
