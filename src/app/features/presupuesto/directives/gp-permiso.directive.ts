import { Directive, Input, OnDestroy, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { PresupuestoContextService } from '../services/presupuesto-context.service';

/**
 * Directiva estructural de permisos de NEXA.
 *
 *   <button *appGpPermiso="'pagos.operar'">Agendar pago</button>
 *   <button *appGpPermiso="['presupuesto.aprobar']">Aprobar</button>
 *
 * Muestra el contenido solo si el usuario tiene el permiso de negocio; se
 * re-evalúa cuando llega /permisos (carga asíncrona) y cuando cambia la
 * configuración de roles.
 *
 * IMPORTANTE: la ocultación es SOLO experiencia de usuario. El backend valida
 * el permiso en cada endpoint y responde 403 si no corresponde.
 */
@Directive({
  selector: '[appGpPermiso]',
  standalone: true,
})
export class GpPermisoDirective implements OnDestroy {

  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly ctx = inject(PresupuestoContextService);

  private codigos: string[] = [];
  private mostrando = false;

  constructor() {
    // Se re-evalúa cuando el contexto carga (o recarga) los permisos.
    effect(() => {
      this.ctx.permisos();
      this.refrescar();
    });
  }

  @Input() set appGpPermiso(valor: string | string[]) {
    this.codigos = Array.isArray(valor) ? valor : [valor];
    this.refrescar();
  }

  ngOnDestroy(): void {
    this.vcr.clear();
  }

  private refrescar(): void {
    // Sin respuesta, con error o con lista vacía no se concede ninguna acción.
    const permitido = this.codigos.length > 0 && this.codigos.some((c) => this.ctx.tienePermiso(c));

    if (permitido && !this.mostrando) {
      this.vcr.createEmbeddedView(this.tpl);
      this.mostrando = true;
    } else if (!permitido && this.mostrando) {
      this.vcr.clear();
      this.mostrando = false;
    }
  }
}
