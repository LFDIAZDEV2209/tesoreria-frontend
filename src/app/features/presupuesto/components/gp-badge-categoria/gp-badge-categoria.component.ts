import {Component,Input} from '@angular/core';
import {CommonModule} from '@angular/common';
@Component({selector:'app-gp-badge-categoria',standalone:true,imports:[CommonModule],template:`<span class="cat-badge" [ngClass]="clase" [title]="detalle || ''">{{categoria || 'Sin categoría'}}</span><span *ngIf="detalle" class="text-xs text-t3 ml-1">{{detalle}}</span>`})
export class GpBadgeCategoriaComponent {
 @Input() categoria:string|null|undefined=null;
 @Input() detalle:string|null|undefined=null;
 get clase():string{return this.categoria?'cat-'+this.categoria.replace(/\s+/g,'-'):'cat-sin';}
}
