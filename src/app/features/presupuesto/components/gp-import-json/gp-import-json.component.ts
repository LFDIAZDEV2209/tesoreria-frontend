import { Component, inject, signal, effect, untracked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresupuestoService } from '../../services/presupuesto.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { mensajeError } from '../../services/gp-errores';
@Component({
 selector: 'app-gp-import-json', standalone: true, imports: [CommonModule],
 template: `
 <section *ngIf="ctx.tienePermiso('modulos.importar')" class="bg-surface rounded-xl p-4 space-y-3 border">
   <h2 class="font-semibold">Importar estructura JSON</h2>
   <p class="text-sm text-t2">Carga Proveedores, Anticipos, CuentasPorCobrar y CuentasPorPagar con el formato del Gestor Presupuestal. Los registros se agregarán a {{ctx.nombreEmpresa()}}.</p>
   <label class="block">Archivo JSON (máximo 50 MB)
     <input type="file" accept=".json,application/json" (change)="seleccionar($event)" [disabled]="ocupado()" class="block w-full max-w-full mt-2" />
   </label>
   <p *ngIf="error()" role="alert" class="text-rose-700">{{error()}}</p>
   <p *ngIf="resumen()" role="status" class="text-emerald-800">{{resumen()}}</p>
   <div *ngIf="estructura()" class="space-y-2">
     <p>{{conteo()}} registros preparados. Se validarán categorías, fechas, montos y relaciones al confirmar.</p>
     <button (click)="confirmar()" [disabled]="ocupado() || !ctx.empresaId()" class="bg-blue-900 text-white px-4 py-2 rounded-lg disabled:opacity-50">{{ocupado() ? 'Importando…' : 'Confirmar importación JSON'}}</button>
   </div>
 </section>`
})
export class GpImportJsonComponent implements OnDestroy {
 readonly ctx=inject(PresupuestoContextService);
 private readonly api=inject(PresupuestoService);
 readonly estructura=signal<Record<string,unknown>|null>(null);
 readonly error=signal(''); readonly resumen=signal(''); readonly ocupado=signal(false); readonly conteo=signal(0);
 private empresaArchivo: number|null=null;
 private solicitud=0;
 constructor() {
   effect(() => {
     const empresa=this.ctx.empresaId();
     untracked(() => {
       if(empresa!==this.empresaArchivo) {
         this.solicitud++; this.empresaArchivo=empresa;
         this.estructura.set(null); this.conteo.set(0); this.error.set(''); this.resumen.set(''); this.ocupado.set(false);
       }
     });
   }, {allowSignalWrites:true});
 }
 ngOnDestroy(): void { this.solicitud++; }
 async seleccionar(event: Event): Promise<void> {
   if(this.ocupado()) return;
   const solicitud=++this.solicitud;
   const empresa=this.ctx.empresaId();
   this.empresaArchivo=empresa; this.conteo.set(0);
   const vigente=()=>solicitud===this.solicitud && empresa===this.ctx.empresaId();
   const input=event.target as HTMLInputElement;
   const archivo=input.files?.[0];
   input.value=''; // Permite volver a seleccionar el mismo archivo tras corregirlo o cambiar empresa.
   this.estructura.set(null); this.error.set(''); this.resumen.set('');
   if(!archivo) return;
   if(!archivo.name.toLowerCase().endsWith('.json')) {this.error.set('Seleccione un archivo .json.'); return;}
   if(archivo.size>50*1024*1024) {this.error.set('El archivo supera el límite de 50 MB.'); return;}
   try {
     const texto=await archivo.text();
     if(!vigente()) return;
     const body=JSON.parse(texto);
     if(!body || typeof body!=='object' || Array.isArray(body)) throw new Error('Se requiere un objeto JSON.');
     const claves=['Proveedores','Anticipos','CuentasPorCobrar','CuentasPorPagar','proveedores','anticipos','cuentas_por_cobrar','cuentas_por_pagar'];
     const presentes=claves.filter(k => k in body);
     if(!presentes.length || presentes.some(k => !Array.isArray(body[k]))) throw new Error('La estructura debe contener listas de módulos.');
     this.conteo.set(presentes.reduce((n,k)=>n+body[k].length,0)); this.empresaArchivo=empresa; this.estructura.set(body);
   } catch(err) {if(vigente()) this.error.set(err instanceof Error?err.message:'JSON inválido.');}
 }
 confirmar(): void {
   const empresa=this.ctx.empresaId(), body=this.estructura();
   if(this.ocupado() || !empresa || !body || !this.ctx.tienePermiso('modulos.importar')) return;
   if(empresa!==this.empresaArchivo) {this.error.set('La empresa cambió. Seleccione nuevamente el archivo para confirmar su destino.'); return;}
   const solicitud=this.solicitud;
   const vigente=()=>solicitud===this.solicitud && empresa===this.ctx.empresaId();
   this.ocupado.set(true); this.error.set('');
   this.api.importarEstructura(empresa,body).subscribe({next: resultado => {
     if(!vigente()) return;
     this.ocupado.set(false); this.estructura.set(null);
     this.resumen.set('Importación confirmada: '+resultado.total_proveedores+' proveedores y '+resultado.total_movimientos+' movimientos.');
   }, error: err => {if(!vigente()) return; this.ocupado.set(false); this.error.set(mensajeError(err, 'No se pudo importar la estructura. Revisa el archivo e intenta de nuevo.'));}});
 }
}
