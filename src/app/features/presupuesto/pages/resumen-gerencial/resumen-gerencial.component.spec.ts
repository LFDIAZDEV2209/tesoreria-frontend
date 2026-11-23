import { of } from 'rxjs';
import { ResumenGerencialComponent } from './resumen-gerencial.component';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';

describe('Listado de todas las empresas',()=>{
  it('mantiene la consulta original y permite entrar a una empresa',()=>{
    const filas=[{empresaId:1,nombreEmpresa:'Empresa',responsable:'Contador',totalAprobado:100,totalPagado:40,totalPendientePago:60,totalDisponible:90}];
    const ctx=new PresupuestoContextService({} as any);ctx.empresas.set([{id:1,name:'Empresa'}]);
    const router=jasmine.createSpyObj('Router',['navigate']);
    const page=new ResumenGerencialComponent({resumenGerencial:()=>of(filas)} as any,ctx,{mostrar:()=>{}} as any,router);
    page.ngOnInit();expect(page.filas()).toEqual(filas);
    page.ir(filas[0]);expect(ctx.empresaId()).toBe(1);expect(router.navigate).toHaveBeenCalledWith(['/presupuesto/pagos-proyectados']);
  });
});
