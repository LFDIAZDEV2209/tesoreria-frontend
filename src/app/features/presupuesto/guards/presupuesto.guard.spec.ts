import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { PresupuestoService } from '../services/presupuesto.service';
import { permisoGpGuard } from './presupuesto.guard';

describe('Rutas GP según matriz efectiva del backend', () => {
  let api: any;
  beforeEach(() => {
    api = jasmine.createSpyObj('api', ['permisosGp']);
    TestBed.configureTestingModule({providers:[provideRouter([]), {provide:PresupuestoService,useValue:api}]});
  });
  afterEach(() => TestBed.resetTestingModule());
  async function entrar(codigo='admin.auditoria') {
    return firstValueFrom(TestBed.runInInjectionContext(() => permisoGpGuard(codigo)({} as any,{} as any)) as Observable<boolean|UrlTree>);
  }
  it('contador con permiso asignado puede entrar sin exigir ADMIN', async () => {
    api.permisosGp.and.returnValue(of({superAdmin:false,rolGp:'contador',permisos:['admin.auditoria']}));
    expect(await entrar()).toBeTrue();
  });
  it('gerente sin permiso es rechazado y la revocación se consulta nuevamente', async () => {
    api.permisosGp.and.returnValues(of({permisos:['admin.auditoria']}),of({gerencia:true,permisos:[]}));
    expect(await entrar()).toBeTrue();
    expect(TestBed.inject(Router).serializeUrl(await entrar() as UrlTree)).toBe('/presupuesto/proveedores');
    expect(api.permisosGp).toHaveBeenCalledTimes(2);
  });
  it('superadmin conserva acceso y auditoría no concede resumen gerencial', async () => {
    api.permisosGp.and.returnValues(of({superAdmin:true,permisos:[]}),of({permisos:['admin.auditoria']}));
    expect(await entrar()).toBeTrue();
    expect(await entrar('presupuesto.resumen_gerencial')).toBeInstanceOf(UrlTree);
  });
  it('fallo de carga de permisos deniega la ruta', async () => {
    api.permisosGp.and.returnValue(throwError(() => new Error('sin sesión')));
    expect(await entrar()).toBeInstanceOf(UrlTree);
  });
});