import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { OverlayContainer } from '@angular/cdk/overlay';
import { SidebarComponent } from './sidebar.component';
import { AuthService } from '../../core/services/auth.service';
import { GpNavigationComponent } from '../../features/presupuesto/components/gp-navigation/gp-navigation.component';
import { GpSessionService, EstadoSesionGp } from '../../features/presupuesto/services/gp-session.service';
import { PresupuestoContextService } from '../../features/presupuesto/services/presupuesto-context.service';

describe('Menús del Gestor: lateral y superior usan el mismo acceso', () => {
  let lateral: ComponentFixture<SidebarComponent>;
  let superior: ComponentFixture<GpNavigationComponent>;
  let ctx: PresupuestoContextService;
  let session: {estado: ReturnType<typeof signal<EstadoSesionGp|null>>; verificar: jasmine.Spy};
  const permisos = ['modulos.ver', 'pagos.ver', 'presupuesto.ver', 'presupuesto.resumen_gerencial'];
  const operativos = ['proveedores', 'cuentas-pagar', 'impuestos', 'otros-pagos', 'cuentas-cobrar', 'anticipos', 'pagos-proyectados', 'presupuesto'];
  const gerencia = ['resumen-gerencial', 'pagos-proyectados', 'presupuesto'];
  const administracion = ['usuarios', 'maestro-proveedores', 'categorias', 'auditoria'];

  function estado(rol: string): EstadoSesionGp {
    return {autenticado:true, usuario_id:1, nombre:'Prueba', rol_nexa:rol,
      rol:rol === 'superadmin' ? 'superadmin' : rol === 'gerente' ? 'gerente' : 'contador',
      permisos, debe_cambiar_password:false, multiples_empresas:false, puede_aprobar:false,
      solo_lectura:false, cargo:null, puede_operar_pagos:false};
  }
  beforeEach(() => {
    session = {estado:signal<EstadoSesionGp|null>(null), verificar:jasmine.createSpy('verificar')};
    ctx = new PresupuestoContextService({} as any);
    TestBed.configureTestingModule({
      imports: [SidebarComponent, GpNavigationComponent, NoopAnimationsModule],
      providers: [provideRouter([]), provideHttpClient(),
        {provide:GpSessionService, useValue:session},
        {provide:PresupuestoContextService, useValue:ctx},
        {provide:AuthService, useValue:{getCurrentUser:()=>({username:'Prueba', roles:[]}), logout:()=>{}}},
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  function renderizar(rol: string|null) {
    session.estado.set(rol === null ? null : estado(rol));
    lateral = TestBed.createComponent(SidebarComponent);
    superior = TestBed.createComponent(GpNavigationComponent);
    // El segundo fixture sustituye la raíz anterior; ambos deben estar conectados para probar foco y medidas.
    document.body.appendChild(lateral.nativeElement);
    lateral.componentInstance.gestorPresupuestalExpanded.set(true);
    superior.componentInstance.adminOpen.set(true);
    actualizar();
  }
  function actualizar() { lateral.detectChanges(); superior.detectChanges(); }
  function enlaces(fixture: ComponentFixture<unknown>, selector: string) {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(selector))
      .map(a => a.getAttribute('href')!.replace('/presupuesto/', ''));
  }
  function comparar(esperados: string[]) {
    expect(enlaces(lateral, '#gestor-menu-lateral a')).toEqual(esperados);
    expect(enlaces(superior, '.gp-nexa-tabs a, .gp-native-dropdown a')).toEqual(esperados);
  }

  for (const [rol, esperados] of [
    ['contador', operativos], ['gerente', gerencia], ['tesorero', ['pagos-proyectados']],
    ['superadmin', ['resumen-gerencial', ...operativos, 'historicos', ...administracion]],
    ['editor_contable', gerencia],
  ] as const) {
    it('muestra las mismas opciones para ' + rol, () => {
      renderizar(rol);
      comparar([...esperados]);
      expect(session.verificar).not.toHaveBeenCalled();
    });
  }
  it('carga la sesión desde el lateral aunque todavía no se haya entrado al Gestor', () => {
    renderizar(null);
    expect(session.verificar).toHaveBeenCalledTimes(1);
    comparar([]);
    expect(lateral.nativeElement.querySelector('[aria-controls="gestor-menu-lateral"]')).toBeNull();
    session.estado.set(estado('tesorero')); actualizar();
    comparar(['pagos-proyectados']);
    expect(ctx.permisos()).toBeNull();
  });
  it('no ofrece accesos con sesión cerrada o rol desconocido', () => {
    renderizar('no-autorizado'); comparar([]);
    session.estado.set({...estado('superadmin'), autenticado:false}); actualizar(); comparar([]);
    expect(lateral.nativeElement.querySelector('#gestor-menu-lateral')).toBeNull();
  });
  it('retira Administración y los módulos sobrantes al pasar de superadmin a Tesorería', () => {
    renderizar('superadmin');
    ctx.permisos.set({superAdmin:true, gerencia:true, puedeAprobar:true, rolGp:'superadmin', permisos});
    session.estado.set(estado('tesorero')); actualizar();
    comparar(['pagos-proyectados']);
    expect(superior.nativeElement.querySelector('[aria-label="Administración"]')).toBeNull();
  });
  it('una revocación efectiva elimina los enlaces en ambos menús', () => {
    renderizar('contador');
    ctx.permisos.set({superAdmin:false, gerencia:false, puedeAprobar:false, rolGp:'contador', permisos:['pagos.ver']});
    actualizar(); comparar(['otros-pagos', 'pagos-proyectados']);
    ctx.permisos.set({superAdmin:false, gerencia:false, puedeAprobar:false, rolGp:'contador', permisos:[]});
    actualizar(); comparar([]);
    expect(lateral.nativeElement.querySelector('#gestor-menu-lateral')).toBeNull();
  });
  it('Históricos aparece en ambos menús sólo cuando el perfil tiene acceso', () => {
    renderizar('contador'); comparar(operativos);
    ctx.permisos.set({superAdmin:false, gerencia:false, puedeAprobar:false, rolGp:'contador', permisos:[...permisos,'historicos.ver']});
    actualizar(); comparar([...operativos,'historicos']);
    ctx.permisos.set({superAdmin:false, gerencia:false, puedeAprobar:false, rolGp:'contador', permisos});
    actualizar(); comparar(operativos);
  });
  it('Tesorería sin pagos.ver no recibe enlaces aunque tenga permiso de pago', () => {
    renderizar('tesorero');
    session.estado.set({...estado('tesorero'), permisos:['pagos.pagar']}); actualizar(); comparar([]);
  });
  it('conserva el filtrado al plegar y expandir el menú lateral', () => {
    renderizar('gerente');
    lateral.componentInstance.toggleGestorPresupuestal(); actualizar(); comparar(gerencia);
    lateral.componentInstance.toggleGestorPresupuestal(); actualizar(); comparar(gerencia);
    expect(lateral.nativeElement.querySelector('[aria-controls="gestor-menu-lateral"]').getAttribute('aria-expanded')).toBe('true');
  });

  function minimizar() {
    lateral.nativeElement.querySelector('.sidebar').style.transition = 'none';
    lateral.nativeElement.querySelector('.sidebar-toggle').click();
    actualizar();
  }
  function boton(nombre: string): HTMLButtonElement {
    return lateral.nativeElement.querySelector('button[aria-label="' + nombre + '"]');
  }
  function pasarMouse(nombre: string) {
    boton(nombre).dispatchEvent(new MouseEvent('mouseenter'));
    actualizar();
  }
  function panel(): HTMLElement | null {
    return TestBed.inject(OverlayContainer).getContainerElement().querySelector('.sidebar-flyout');
  }
  function enlacesFlotantes() {
    return Array.from(panel()?.querySelectorAll('a') ?? []).map(a => a.getAttribute('href'));
  }

  it('abre cada submenú al pasar el mouse sin expandir la barra ni recortar el panel', () => {
    renderizar('superadmin'); minimizar();
    for (const [nombre, cantidad] of [['Proveedores', 4], ['Contabilidad', 2], ['Gestor Presupuestal', 14]] as const) {
      pasarMouse(nombre);
      expect(panel()?.querySelector('h2')?.textContent).toBe(nombre);
      expect(enlacesFlotantes().length).toBe(cantidad);
      expect(lateral.componentInstance.collapsed()).toBeTrue();
      expect(boton(nombre).getAttribute('aria-expanded')).toBe('true');
      expect(lateral.nativeElement.querySelector('.sidebar-nav').contains(panel())).toBeFalse();
      expect(TestBed.inject(OverlayContainer).getContainerElement().querySelectorAll('.sidebar-flyout').length).toBe(1);
    }
  });

  it('permite cruzar del icono al submenú y cierra al salir de ambos', fakeAsync(() => {
    renderizar('contador'); minimizar(); pasarMouse('Proveedores');
    boton('Proveedores').dispatchEvent(new MouseEvent('mouseleave'));
    tick(100);
    panel()!.dispatchEvent(new MouseEvent('mouseenter'));
    tick(200); actualizar();
    expect(panel()).not.toBeNull();
    panel()!.dispatchEvent(new MouseEvent('mouseleave'));
    tick(200); actualizar();
    expect(panel()).toBeNull();
    expect(boton('Proveedores').getAttribute('aria-expanded')).toBe('false');
  }));

  it('abre con clic o toque y conserva la barra compacta', fakeAsync(() => {
    renderizar('contador'); minimizar();
    boton('Contabilidad').click(); actualizar(); tick();
    expect(enlacesFlotantes()).toEqual(['/contabilidad/control-egresos', '/contabilidad/aprobacion-egresos']);
    expect(lateral.componentInstance.collapsed()).toBeTrue();
  }));

  it('permite entrar con flecha, navegar enlaces y volver al icono con Escape', fakeAsync(() => {
    renderizar('contador'); minimizar();
    const trigger = boton('Proveedores');
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    actualizar(); tick();
    const links = panel()!.querySelectorAll('a');
    expect(document.activeElement).toBe(links[0]);
    links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(links[1]);
    links[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    actualizar(); tick(200);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  }));

  it('conserva el panel mientras el teclado tiene el foco dentro', fakeAsync(() => {
    renderizar('contador'); minimizar(); pasarMouse('Proveedores');
    panel()!.querySelector('a')!.focus();
    panel()!.dispatchEvent(new MouseEvent('mouseleave'));
    tick(200); actualizar();
    expect(panel()).not.toBeNull();
    boton('Cerrar sesión').focus(); actualizar();
    expect(panel()).toBeNull();
  }));

  it('cierra al pulsar fuera y al expandir de nuevo la barra', fakeAsync(() => {
    renderizar('contador'); minimizar(); pasarMouse('Proveedores');
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    actualizar();
    expect(panel()).toBeNull();
    pasarMouse('Gestor Presupuestal');
    minimizar();
    expect(lateral.componentInstance.collapsed()).toBeFalse();
    expect(panel()).toBeNull();
    comparar(operativos);
    tick(200);
  }));

  it('actualiza el panel abierto cuando cambia el rol y lo retira si pierde acceso', () => {
    renderizar('superadmin'); minimizar(); pasarMouse('Gestor Presupuestal');
    expect(enlacesFlotantes()).toContain('/presupuesto/usuarios');
    session.estado.set(estado('tesorero')); actualizar();
    expect(enlacesFlotantes()).toEqual(['/presupuesto/pagos-proyectados']);
    session.estado.set({ ...estado('tesorero'), permisos: [] }); actualizar();
    expect(panel()).toBeNull();
    expect(boton('Gestor Presupuestal')).toBeNull();
    session.estado.set(estado('tesorero')); actualizar();
    expect(panel()).toBeNull();
  });

  it('centra los iconos sin reducirlos y deja el perfil visible en una ventana baja', () => {
    renderizar('superadmin'); minimizar();
    const sidebar: HTMLElement = lateral.nativeElement.querySelector('.sidebar');
    sidebar.style.transition = 'none';
    sidebar.style.height = '400px';
    const bounds = sidebar.getBoundingClientRect();
    expect(bounds.width).toBe(80);
    for (const control of lateral.nativeElement.querySelectorAll('.sidebar-control')) {
      const box = control.getBoundingClientRect();
      const icon = control.querySelector('svg').getBoundingClientRect();
      expect(box.width).toBe(48);
      expect(box.height).toBe(48);
      expect(icon.width).toBe(22);
      expect(icon.height).toBe(22);
      expect(Math.abs(icon.x + icon.width / 2 - (bounds.x + bounds.width / 2))).toBeLessThan(1);
    }
    const profile = lateral.nativeElement.querySelector('.sidebar-profile').getBoundingClientRect();
    expect(profile.bottom).toBeLessThanOrEqual(bounds.bottom);
    const nav: HTMLElement = lateral.nativeElement.querySelector('.sidebar-nav');
    expect(nav.scrollHeight).toBeGreaterThan(nav.clientHeight);
    expect(nav.scrollWidth).toBe(nav.clientWidth);
  });

  it('mantiene los menús largos dentro de la pantalla y permite llegar a Administración', fakeAsync(() => {
    renderizar('superadmin'); minimizar(); pasarMouse('Gestor Presupuestal');
    tick(32); actualizar();
    const flyout = panel()!;
    const bounds = flyout.getBoundingClientRect();
    expect(bounds.top).toBeGreaterThanOrEqual(11);
    expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight - 11);
    expect(bounds.right).toBeLessThanOrEqual(window.innerWidth - 11);
    const sidebarBounds = lateral.nativeElement.querySelector('.sidebar').getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(sidebarBounds.right);
    const links = flyout.querySelector('.flyout-links') as HTMLElement;
    expect(getComputedStyle(links).overflowY).toBe('auto');
    links.scrollTop = links.scrollHeight;
    const auditoria = links.querySelector('a[href="/presupuesto/auditoria"]')!.getBoundingClientRect();
    expect(auditoria.bottom).toBeLessThanOrEqual(bounds.bottom);
    expect(auditoria.top).toBeGreaterThanOrEqual(bounds.top);
  }));
});
