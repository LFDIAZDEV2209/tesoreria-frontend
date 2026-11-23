import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';

/**
 * Agrega una barra de scroll horizontal SINCRONIZADA en la parte superior
 * de todas las tablas de la plataforma que ya tienen overflow-x (la barra
 * nativa inferior se mantiene). Detecta contenedores nuevos con un
 * MutationObserver y los actualiza con ResizeObserver.
 */
@Injectable({ providedIn: 'root' })
export class TopTableScrollService implements OnDestroy {
  private zone = inject(NgZone);
  private observado = new Map<HTMLElement, { barra: HTMLElement; espaciador: HTMLElement; ro: ResizeObserver; resync: () => void; sync: (e: Event) => void }>();
  private observadorMutaciones?: MutationObserver;
  private timer?: ReturnType<typeof setInterval>;
  private iniciado = false;
  private enCascada = false;

  iniciar(): void {
    if (this.iniciado || typeof MutationObserver === 'undefined') return;
    this.iniciado = true;
    this.zone.runOutsideAngular(() => {
      this.observadorMutaciones = new MutationObserver((muts) => {
        let toque = false;
        for (const m of muts) {
          m.addedNodes.forEach((n) => { if (n.nodeType === 1) { toque = true; } });
        }
        if (toque) this.programarBarrido();
      });
      this.observadorMutaciones.observe(document.body, { childList: true, subtree: true });
      this.programarBarrido();
      this.timer = setInterval(() => this.barrido(), 3000);
      window.addEventListener('resize', () => this.programarBarrido(), { passive: true });
    });
  }

  private programado = false;
  private programarBarrido(): void {
    if (this.programado) return;
    this.programado = true;
    requestAnimationFrame(() => { this.programado = false; this.barrido(); });
  }

  private barrido(): void {
    if (typeof document === 'undefined') return;
    // Limpieza: contenedores que ya no están en el DOM.
    this.observado.forEach((v, envoltura) => {
      if (!document.contains(envoltura) || !document.contains(v.barra)) {
        this.liberar(envoltura);
      } else {
        this.actualizar(envoltura);
      }
    });
    // Detectar envolturas de tabla con overflow horizontal.
    document.querySelectorAll('table').forEach((tabla) => {
      let nodo: HTMLElement | null = tabla instanceof HTMLElement ? tabla.parentElement : null;
      let saltos = 0;
      while (nodo && nodo !== document.body && saltos < 8) {
        const estilos = getComputedStyle(nodo);
        const overflow = estilos.overflowX;
        if (overflow === 'auto' || overflow === 'scroll') {
          this.enlazar(nodo, tabla as HTMLElement);
          return;
        }
        nodo = nodo.parentElement;
        saltos++;
      }
    });
  }

  private enlazar(envoltura: HTMLElement, tabla: HTMLElement): void {
    if (this.observado.has(envoltura) || envoltura.hasAttribute('data-top-scroll')) return;
    if (tabla.scrollWidth <= envoltura.clientWidth + 4) return;
    const barra = document.createElement('div');
    barra.setAttribute('data-top-scroll', '');
    barra.style.cssText = 'height:14px;overflow-x:auto;overflow-y:hidden;margin:0;padding:0;touch-action:pan-x;scrollbar-width:thin;scrollbar-color:rgba(100,116,139,.45) transparent;';
    const espaciador = document.createElement('div');
    espaciador.style.cssText = 'height:1px;';
    barra.appendChild(espaciador);
    if (envoltura.parentNode) {
      envoltura.parentNode.insertBefore(barra, envoltura);
    } else {
      return;
    }
    const resync = () => {
      if (this.enCascada) return;
      this.enCascada = true;
      envoltura.scrollLeft = barra.scrollLeft;
      this.enCascada = false;
    };
    const sync = () => {
      if (this.enCascada) return;
      this.enCascada = true;
      barra.scrollLeft = envoltura.scrollLeft;
      this.enCascada = false;
    };
    barra.addEventListener('scroll', resync, { passive: true });
    envoltura.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(() => this.actualizar(envoltura));
    ro.observe(envoltura);
    ro.observe(tabla);
    this.observado.set(envoltura, { barra, espaciador, ro, resync, sync });
    this.actualizar(envoltura);
  }

  private actualizar(envoltura: HTMLElement): void {
    const datos = this.observado.get(envoltura);
    if (!datos) return;
    const tabla = envoltura.querySelector('table');
    if (!tabla) return;
    const ancho = (tabla as HTMLElement).scrollWidth || envoltura.scrollWidth;
    datos.espaciador.style.width = ancho + 'px';
    const sinSobrante = ancho <= envoltura.clientWidth + 4;
    datos.barra.style.display = sinSobrante ? 'none' : 'block';
    datos.barra.scrollLeft = envoltura.scrollLeft;
  }

  private liberar(envoltura: HTMLElement): void {
    const datos = this.observado.get(envoltura);
    if (!datos) return;
    datos.ro.disconnect();
    datos.barra.removeEventListener('scroll', datos.resync);
    envoltura.removeEventListener('scroll', datos.sync);
    datos.barra.remove();
    this.observado.delete(envoltura);
  }

  ngOnDestroy(): void {
    this.observadorMutaciones?.disconnect();
    if (this.timer) clearInterval(this.timer);
    [...this.observado.keys()].forEach((e) => this.liberar(e));
  }
}
