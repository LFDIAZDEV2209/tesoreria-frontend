import { GpSessionService } from '../services/gp-session.service';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GpPermisoDirective } from './gp-permiso.directive';
import { PresupuestoContextService } from '../services/presupuesto-context.service';
import { PresupuestoService } from '../services/presupuesto.service';
@Component({standalone:true,imports:[GpPermisoDirective],template:`<button *appGpPermiso="'pagos.operar'">Operar</button>`})
class HostPermiso {}
describe('Directiva de permisos con respuesta autoritativa',()=>{
 function preparar(){
  TestBed.configureTestingModule({imports:[HostPermiso],providers:[{provide:GpSessionService,useValue:null},{provide:AuthService,useValue:{cambiosSesion$:new BehaviorSubject(null)}},PresupuestoContextService,{provide:PresupuestoService,useValue:{}}]});
  const fixture=TestBed.createComponent(HostPermiso);const ctx=TestBed.inject(PresupuestoContextService);fixture.detectChanges();return {fixture,ctx};
 }
 it('no muestra acciones mientras se consulta la autorización',()=>{const {fixture}=preparar();expect(fixture.nativeElement.querySelector('button')).toBeNull();});
 it('una matriz vacía deniega la acción',()=>{const {fixture,ctx}=preparar();ctx.permisos.set({superAdmin:false,permisos:[]} as any);fixture.detectChanges();expect(fixture.nativeElement.querySelector('button')).toBeNull();});
 it('aplica concesión y revocación sin recrear la página',()=>{const {fixture,ctx}=preparar();ctx.permisos.set({superAdmin:false,permisos:['pagos.operar']} as any);fixture.detectChanges();expect(fixture.nativeElement.querySelector('button')).not.toBeNull();ctx.permisos.set({superAdmin:false,permisos:[]} as any);fixture.detectChanges();expect(fixture.nativeElement.querySelector('button')).toBeNull();});
 it('el superadmin conserva el acceso del catálogo',()=>{const {fixture,ctx}=preparar();ctx.permisos.set({superAdmin:true,permisos:[]} as any);fixture.detectChanges();expect(fixture.nativeElement.querySelector('button')).not.toBeNull();});
});
