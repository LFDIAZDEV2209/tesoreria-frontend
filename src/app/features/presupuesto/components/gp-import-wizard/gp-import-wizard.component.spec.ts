import { of, Subject, throwError } from 'rxjs';
import { GpImportWizardComponent } from './gp-import-wizard.component';

describe('SIIGO: límite de archivo antes de enviar', () => {
  for (const bytes of [50 * 1024 * 1024, 50 * 1024 * 1024 + 1]) {
    it(`procesa correctamente un archivo de ${bytes} bytes`, () => {
      const api = jasmine.createSpyObj('api', ['previewImportacion']);
      api.previewImportacion.and.returnValue(of({ proveedores: [], totalMovimientos: 0 }));
      const component = new GpImportWizardComponent(api, { empresaId: () => 35, tienePermiso: () => true } as any);
      const archivo = new File([new Uint8Array(bytes)], 'limite.xlsx');
      component.subir(archivo);
      if (bytes > 50 * 1024 * 1024) {
        expect(api.previewImportacion).not.toHaveBeenCalled();
        expect(component.error()).toContain('50 MB');
        expect(component.step()).toBe(1);
      } else {
        expect(api.previewImportacion).toHaveBeenCalledTimes(1);
        expect(component.step()).toBe(2);
      }
      expect(component.loading()).toBeFalse();
    });
  }
});

describe('SIIGO: clasificación, permisos y respuestas pendientes', () => {
  let api: any;
  let component: GpImportWizardComponent;
  let empresa: number;
  let permisos: Set<string>;
  const archivo = () => new File(['fixture'], 'fixture.xlsx');
  const preview = (categoria: string|null='OTROS', detalle: string|null='Inicial') => ({
    importacionId: 10, proveedores: [{nit:'123',categoria,categoriaDetalle:detalle}],totalMovimientos:1,
  });
  beforeEach(()=>{
    empresa=35; permisos=new Set(['modulos.importar','modulos.categorizar']);
    api=jasmine.createSpyObj('api',['previewImportacion','asignarCategoria','confirmarImportacion']);
    api.previewImportacion.and.returnValue(of(preview()));
    api.asignarCategoria.and.returnValue(of({}));
    api.confirmarImportacion.and.returnValue(of({totalFilas:1,totalProveedores:1}));
    component=new GpImportWizardComponent(api,{empresaId:()=>empresa,tienePermiso:(p:string)=>permisos.has(p)} as any);
    component.modulo='anticipos';
  });
  it('persiste una modificación de detalle aunque siga siendo OTROS',async()=>{
    component.subir(archivo()); component.cambiarDetalle('123','Detalle corregido');
    await component.confirmar();
    expect(api.asignarCategoria).toHaveBeenCalledWith(35,'123','OTROS','Detalle corregido','anticipos');
    expect(api.confirmarImportacion).toHaveBeenCalledWith(35,10);
    expect(component.step()).toBe(3);
  });
  it('conserva una categoría histórica sin reasignarla y permite confirmar sin categoría',async()=>{
    for(const categoria of ['HISTORICA INACTIVA',null]){
      api.previewImportacion.and.returnValue(of(preview(categoria,null)));
      component.subir(archivo()); await component.confirmar();
    }
    expect(api.asignarCategoria).not.toHaveBeenCalled();
    expect(api.confirmarImportacion.calls.count()).toBe(2);
  });
  it('bloquea OTROS vacío y cambios de categoría sin permiso',async()=>{
    component.subir(archivo());component.cambiarDetalle('123','  ');
    await component.confirmar();expect(component.error()).toContain('detalle');
    component.cambiarDetalle('123','Nuevo');permisos.delete('modulos.categorizar');
    await component.confirmar();expect(component.error()).toContain('permiso');
    expect(api.asignarCategoria).not.toHaveBeenCalled();expect(api.confirmarImportacion).not.toHaveBeenCalled();
  });
  it('no duplica confirmaciones mientras guarda las categorías',async()=>{
    const guardado=new Subject<any>(); api.asignarCategoria.and.returnValue(guardado);
    component.subir(archivo());component.cambiarDetalle('123','Nuevo');
    const primera=component.confirmar(); await component.confirmar();
    expect(api.asignarCategoria.calls.count()).toBe(1);
    guardado.next({});await primera;
    expect(api.confirmarImportacion.calls.count()).toBe(1);
  });
  it('no confirma en otra empresa después de guardar una categoría',async()=>{
    const guardado=new Subject<any>();api.asignarCategoria.and.returnValue(guardado);
    component.subir(archivo());component.cambiarDetalle('123','Nuevo');
    const promesa=component.confirmar();empresa=36;guardado.next({});await promesa;
    expect(api.confirmarImportacion).not.toHaveBeenCalled();expect(component.step()).toBe(2);
  });
  it('descarta previews tardíos de otra empresa y tras destruir el asistente',()=>{
    const carga=new Subject<any>();api.previewImportacion.and.returnValue(carga);
    component.subir(archivo());empresa=36;carga.next(preview());
    expect(component.preview()).toBeNull();
    component.ngOnDestroy();empresa=35;carga.next(preview());
    expect(component.preview()).toBeNull();
  });
  it('revocación de importar impide subir y confirmar',async()=>{
    permisos.delete('modulos.importar');component.subir(archivo());
    expect(api.previewImportacion).not.toHaveBeenCalled();
    permisos.add('modulos.importar');component.subir(archivo());
    permisos.delete('modulos.importar');await component.confirmar();
    expect(api.confirmarImportacion).not.toHaveBeenCalled();
  });
  it('error de clasificación evita confirmar y deja reintentar',async()=>{
    api.asignarCategoria.and.returnValue(throwError(()=>({error:{message:'Categoría inactiva'}})));
    component.subir(archivo());component.cambiarCategoria('123','FRUVER');await component.confirmar();
    expect(component.error()).toBe('Categoría inactiva');expect(component.loading()).toBeFalse();
    expect(api.confirmarImportacion).not.toHaveBeenCalled();
  });
});
