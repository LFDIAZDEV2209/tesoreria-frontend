import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { GpImportJsonComponent } from './gp-import-json.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoService } from '../../services/presupuesto.service';

describe('Importación JSON: validaciones, destino y respuestas', () => {
  let ctx:any,api:any,c:GpImportJsonComponent;
  const body={Proveedores:[{ProveedorID:'FIXTURE',Nombre:'PRUEBA'}]};
  function evento(text:string,name='estructura.json',size=text.length): Event {
    return {target:{files:[{name,size,text:()=>Promise.resolve(text)}]}} as any;
  }
  beforeEach(() => {
    ctx={empresaId:signal<number|null>(35),tienePermiso:jasmine.createSpy().and.returnValue(true)};
    api=jasmine.createSpyObj('api',['importarEstructura']);
    TestBed.configureTestingModule({providers:[{provide:PresupuestoContextService,useValue:ctx},{provide:PresupuestoService,useValue:api}]});
    c=TestBed.runInInjectionContext(()=>new GpImportJsonComponent()); TestBed.flushEffects();
  });
  afterEach(()=>TestBed.resetTestingModule());
  it('lee listas, muestra conteo y confirma una sola vez con empresa seleccionada', async () => {
    const response=new Subject<any>();api.importarEstructura.and.returnValue(response);
    await c.seleccionar(evento(JSON.stringify(body))); expect(c.conteo()).toBe(1);
    c.confirmar();c.confirmar();expect(api.importarEstructura).toHaveBeenCalledOnceWith(35,body);
    response.next({total_proveedores:1,total_movimientos:0});
    expect(c.resumen()).toContain('1 proveedores y 0 movimientos');expect(c.estructura()).toBeNull();
    expect(c.ocupado()).toBeFalse();
  });
  it('rechaza JSON mal formado, raíz no objeto, listas inválidas y archivo mayor al límite', async () => {
    for(const [text,name,size] of [['{','a.json',1],['[]','a.json',2],['{"Proveedores":{}}','a.json',20],['{}','a.json',2],['{}','a.xlsx',2],['{}','a.json',50*1024*1024+1]] as [string,string,number][]) {
      await c.seleccionar(evento(text,name,size));expect(c.error()).toBeTruthy();expect(c.estructura()).toBeNull();
    }
    expect(api.importarEstructura).not.toHaveBeenCalled();
  });
  it('un archivo lento no reemplaza la selección más reciente', async () => {
    let terminar!:(v:string)=>void;
    const pendiente=c.seleccionar({target:{files:[{name:'lento.json',size:1,text:()=>new Promise<string>(r=>terminar=r)}]}} as any);
    await c.seleccionar(evento('{"Anticipos":[]}'));
    terminar(JSON.stringify(body));await pendiente;
    expect(c.estructura()).toEqual({Anticipos:[]});expect(c.conteo()).toBe(0);
  });
  it('cambio de empresa borra archivo y descarta una lectura pendiente', async () => {
    let terminar!:(v:string)=>void;
    const pendiente=c.seleccionar({target:{files:[{name:'lento.json',size:1,text:()=>new Promise<string>(r=>terminar=r)}]}} as any);
    ctx.empresaId.set(36);TestBed.flushEffects(); terminar(JSON.stringify(body));await pendiente;
    expect(c.estructura()).toBeNull();c.confirmar();expect(api.importarEstructura).not.toHaveBeenCalled();
  });
  it('una respuesta antigua no muestra éxito ni borra un archivo nuevo de otra empresa', async () => {
    const response=new Subject<any>();api.importarEstructura.and.returnValue(response);
    await c.seleccionar(evento(JSON.stringify(body)));c.confirmar();
    ctx.empresaId.set(36);TestBed.flushEffects();await c.seleccionar(evento('{"Anticipos":[]}'));
    response.next({total_proveedores:1,total_movimientos:0});
    expect(c.resumen()).toBe('');expect(c.estructura()).toEqual({Anticipos:[]});expect(c.ocupado()).toBeFalse();
  });
  it('error del backend conserva archivo para corregir y revocación evita escritura', async () => {
    api.importarEstructura.and.returnValue(throwError(()=>({error:{message:'Fecha inválida'}})));
    await c.seleccionar(evento(JSON.stringify(body)));c.confirmar();
    expect(c.error()).toBe('Fecha inválida');expect(c.estructura()).toEqual(body);expect(c.ocupado()).toBeFalse();
    ctx.tienePermiso.and.returnValue(false);c.confirmar();expect(api.importarEstructura).toHaveBeenCalledTimes(1);
  });
  it('destruir el componente invalida una respuesta en curso', async () => {
    const response=new Subject<any>();api.importarEstructura.and.returnValue(response);
    await c.seleccionar(evento(JSON.stringify(body)));c.confirmar();c.ngOnDestroy();
    response.next({total_proveedores:1,total_movimientos:0});expect(c.resumen()).toBe('');
  });
});