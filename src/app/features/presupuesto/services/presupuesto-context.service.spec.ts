import { DefaultUrlSerializer, NavigationEnd, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { PresupuestoContextService } from './presupuesto-context.service';
import { PresupuestoService } from './presupuesto.service';

describe('Permisos efectivos GP', () => {
  let api: jasmine.SpyObj<PresupuestoService>;
  let ctx: PresupuestoContextService;
  let seleccionAnterior: string | null;
  beforeEach(() => {
    seleccionAnterior = localStorage.getItem('gp_nexa_empresa_id');
    api = jasmine.createSpyObj('PresupuestoService', ['empresas', 'permisosGp']);
    api.empresas.and.returnValue(of([]));
    api.permisosGp.and.returnValue(of({gerencia: true, superAdmin: false, puedeAprobar: true, permisos: []}));
    ctx = new PresupuestoContextService(api);
  });
  afterEach(() => {
    if (seleccionAnterior === null) localStorage.removeItem('gp_nexa_empresa_id');
    else localStorage.setItem('gp_nexa_empresa_id', seleccionAnterior);
  });
  it('espera la autorización antes de publicar una empresa persistida de otra sesión', () => {
    localStorage.setItem('gp_nexa_empresa_id', '99');
    const empresas = new Subject<any[]>();
    api.empresas.and.returnValue(empresas);
    ctx = new PresupuestoContextService(api);
    ctx.cargar();
    expect(ctx.empresaId()).toBeNull();
    empresas.next([{id: 35, name: 'Empresa autorizada'}]);
    expect(ctx.empresaId()).toBe(35);
    expect(localStorage.getItem('gp_nexa_empresa_id')).toBe('35');
  });
  it('restaura la preferencia únicamente si figura en las empresas autorizadas', () => {
    localStorage.setItem('gp_nexa_empresa_id', '35');
    api.empresas.and.returnValue(of([{id: 35, name: 'Empresa autorizada'}] as any));
    ctx.cargar();
    expect(ctx.empresaId()).toBe(35);
  });
  it('cerrar sesión descarta respuestas de empresas y permisos de la identidad anterior', () => {
    const empresas = new Subject<any[]>();
    const permisos = new Subject<any>();
    api.empresas.and.returnValue(empresas);
    api.permisosGp.and.returnValue(permisos);
    ctx.cargar(); ctx.limpiarSesion();
    empresas.next([{id: 99, name: 'Empresa anterior'}]);
    permisos.next({superAdmin: true, permisos: ['presupuesto.aprobar']});
    expect(ctx.empresaId()).toBeNull();
    expect(ctx.empresas()).toEqual([]);
    expect(ctx.tienePermiso('presupuesto.aprobar')).toBeFalse();
  });
  it('una lista vacia revoca permisos aunque sea gerente aprobador', () => {
    ctx.cargarPermisos();
    expect(ctx.tienePermiso('presupuesto.aprobar')).toBeFalse();
    expect(ctx.tienePermiso('modulos.importar')).toBeFalse();
  });
  it('solo concede los permisos efectivos recibidos', () => {
    ctx.permisos.set({gerencia: false, superAdmin: false, puedeAprobar: false, permisos: ['modulos.ver']});
    expect(ctx.tienePermiso('modulos.ver')).toBeTrue();
    expect(ctx.tienePermiso('modulos.importar')).toBeFalse();
  });
  it('reserva confirmar pagos a Tesorería aunque otro perfil reciba el permiso', () => {
    for (const rolGp of ['contador','gerente','superadmin','editor_contable','auxiliar_contable']) {
      ctx.permisos.set({rolGp,superAdmin:rolGp==='superadmin',permisos:['pagos.pagar']} as any);
      expect(ctx.tienePermiso('pagos.pagar')).withContext(rolGp).toBeFalse();
    }
    ctx.permisos.set({rolGp:'tesorero',permisos:['pagos.pagar']} as any);
    expect(ctx.tienePermiso('pagos.pagar')).toBeTrue();
    ctx.permisos.set({rolGp:'tesorero',permisos:[]} as any);
    expect(ctx.tienePermiso('pagos.pagar')).toBeFalse();
  });
  it('recargar elimina un permiso revocado', () => {
    ctx.permisos.set({gerencia: true, superAdmin: false, puedeAprobar: true, permisos: ['presupuesto.aprobar']});
    ctx.cargar();
    expect(ctx.tienePermiso('presupuesto.aprobar')).toBeFalse();
  });
  it('un error no conserva permisos antiguos', () => {
    ctx.permisos.set({gerencia: true, superAdmin: false, puedeAprobar: true, permisos: ['presupuesto.aprobar']});
    api.permisosGp.and.returnValue(throwError(() => new Error('403')));
    ctx.cargarPermisos();
    expect(ctx.tienePermiso('presupuesto.aprobar')).toBeFalse();
  });
  it('una respuesta tardía no restituye un permiso recién revocado', () => {
    const vieja = new Subject<any>(); const actual = new Subject<any>();
    api.permisosGp.and.returnValues(vieja, actual);
    ctx.cargarPermisos(); ctx.cargarPermisos(true);
    actual.next({superAdmin: false, permisos: []});
    vieja.next({superAdmin: false, permisos: ['modulos.importar']});
    expect(ctx.tienePermiso('modulos.importar')).toBeFalse();
  });
  it('el fallo de una consulta anterior no sustituye la respuesta vigente', () => {
    const vieja = new Subject<any>(); const actual = new Subject<any>();
    api.permisosGp.and.returnValues(vieja, actual);
    ctx.cargarPermisos(); ctx.cargarPermisos(true);
    actual.next({superAdmin: false, permisos: ['modulos.ver']});
    vieja.error(new Error('respuesta anterior'));
    expect(ctx.tienePermiso('modulos.ver')).toBeTrue();
  });
  it('no publica empresas de una consulta anterior a la última recarga', () => {
    const vieja = new Subject<any[]>(); const actual = new Subject<any[]>();
    api.empresas.and.returnValues(vieja, actual);
    ctx.cargar(); ctx.cargar(true);
    actual.next([{id: 36, name: 'Actual'}]);
    vieja.next([{id: 35, name: 'Anterior'}]);
    expect(ctx.empresaId()).toBe(36);
    expect(ctx.empresas().map(e => e.id)).toEqual([36]);
  });
  it('no permite seleccionar una empresa ausente del listado autorizado', () => {
    ctx.empresas.set([{id: 35, name: 'Autorizada'}]);
    ctx.seleccionar(35); ctx.seleccionar(36);
    expect(ctx.empresaId()).toBeNull();
    expect(ctx.error()).toBeNull();
    expect(localStorage.getItem('gp_nexa_empresa_id')).toBeNull();
  });

  describe('workspace explícito en URL', () => {
    let events: Subject<any>;
    let router: Router;
    function iniciar(url: string): void {
      events = new Subject();
      router = {url, events, parseUrl: (value: string) => new DefaultUrlSerializer().parse(value),
        navigate: jasmine.createSpy('navigate').and.resolveTo(true)} as unknown as Router;
      api.empresas.and.returnValue(of([{id: 35, name: 'A'}, {id: 37, name: 'C'}]));
      localStorage.setItem('gp_nexa_empresa_id', '37');
      ctx = new PresupuestoContextService(api, null, router);
      ctx.cargar();
    }
    for (const query of ['como=35', 'empresaId=35', 'como=35&empresaId=35']) {
      it('prioriza la empresa autorizada de ' + query, () => {
        iniciar('/presupuesto/dashboard?' + query);
        expect(ctx.empresaId()).toBe(35);
        expect(ctx.error()).toBeNull();
      });
    }
    for (const query of ['como=0', 'como=-1', 'como=abc', 'como=35&empresaId=37',
      'como=35&como=37', 'empresaId=35&empresaId=37', 'como=9007199254740993']) {
      it('rechaza sin fallback ' + query, () => {
        iniciar('/presupuesto/dashboard?' + query);
        expect(ctx.empresaId()).toBeNull();
        expect(ctx.error()).toBeTruthy();
        expect(localStorage.getItem('gp_nexa_empresa_id')).toBe('37');
      });
    }
    it('descarta en silencio una URL con empresa no autorizada vigente', () => {
      iniciar('/presupuesto/dashboard?como=36');
      expect(ctx.empresaId()).toBeNull();
      expect(ctx.error()).toBeNull();
      expect(localStorage.getItem('gp_nexa_empresa_id')).toBeNull();
    });
    it('resuelve la URL solo con la lista de empresas vigente', () => {
      iniciar('/presupuesto/dashboard?como=35');
      const pendientes = new Subject<any[]>();
      api.empresas.and.returnValue(pendientes);
      ctx.limpiarSesion(); ctx.cargar();
      expect(ctx.empresaId()).toBeNull();
      pendientes.next([{id: 37, name: 'C'}]);
      expect(ctx.empresaId()).toBeNull();
      expect(ctx.error()).toBeNull();
      expect(localStorage.getItem('gp_nexa_empresa_id')).toBeNull();
    });
    it('cambiar la URL invalida la empresa anterior y puede recuperarse', () => {
      iniciar('/presupuesto/dashboard?como=35');
      events.next(new NavigationEnd(2, '', '/presupuesto/dashboard?como=36'));
      expect(ctx.empresaId()).toBeNull();
      events.next(new NavigationEnd(3, '', '/presupuesto/dashboard?como=37'));
      expect(ctx.empresaId()).toBe(37);
      expect(ctx.error()).toBeNull();
    });
    it('el selector sustituye el alias por la empresa canónica', () => {
      iniciar('/presupuesto/dashboard?como=35');
      ctx.seleccionarEnUrl(37);
      expect(router.navigate).toHaveBeenCalledWith([], {queryParams: {empresaId: 37, como: null},
        queryParamsHandling: 'merge', replaceUrl: true});
      expect(ctx.empresaId()).toBe(37);
    });
    it('no interpreta como de otro módulo', () => {
      iniciar('/tesoreria/bandeja?como=35');
      expect(ctx.empresaId()).toBe(37);
    });
  });
});

describe('Edición del mes que el contador está cerrando', () => {
  let ctx: PresupuestoContextService;
  beforeEach(() => {
    ctx = new PresupuestoContextService({} as any);
    ctx.permisos.set({rolGp:'contador',gerencia:false,superAdmin:false,puedeAprobar:false,permisos:['presupuesto.editar_periodos']});
    ctx.mesActivo.set('2026-10');
    ctx.estadosMes.set([
      {periodo:'2026-08',aprobado:false},
      {periodo:'2026-09',aprobado:false},
      {periodo:'2026-10',aprobado:false},
      {periodo:'2026-11',aprobado:false},
    ]);
  });
  it('el contador edita el mes habilitado y el inmediatamente anterior', () => {
    expect(ctx.puedeEditarMes('2026-10')).toBeTrue();
    expect(ctx.puedeEditarMes('2026-09')).toBeTrue();
  });
  it('el contador no edita meses más antiguos ni los que aún no habilita', () => {
    expect(ctx.puedeEditarMes('2026-08')).toBeFalse();
    expect(ctx.puedeEditarMes('2026-11')).toBeFalse();
    expect(ctx.puedeEditarMes('2027-01')).toBeFalse();
  });
  it('un mes aprobado sigue bloqueado aunque sea el anterior o el habilitado', () => {
    ctx.estadosMes.update(meses => meses.map(m => m.periodo==='2026-09'||m.periodo==='2026-10' ? {...m,aprobado:true} : m));
    expect(ctx.puedeEditarMes('2026-09')).toBeFalse();
    expect(ctx.puedeEditarMes('2026-10')).toBeFalse();
  });
  it('el cierre de diciembre funciona con enero del año siguiente habilitado', () => {
    ctx.mesActivo.set('2027-01');
    ctx.estadosMes.set([{periodo:'2026-12',aprobado:false},{periodo:'2027-01',aprobado:false}]);
    expect(ctx.puedeEditarMes('2026-12')).toBeTrue();
  });
  it('Gerencia y Superadmin conservan la corrección de cualquier mes', () => {
    ctx.permisos.set({rolGp:'gerente',gerencia:true,superAdmin:false,puedeAprobar:true,permisos:[]});
    ctx.estadosMes.update(meses => meses.map(m => ({...m,aprobado:true})));
    expect(ctx.puedeEditarMes('2026-08')).toBeTrue();
    ctx.permisos.set({gerencia:false,superAdmin:true,puedeAprobar:false,permisos:[]});
    expect(ctx.puedeEditarMes('2026-08')).toBeTrue();
  });
});
