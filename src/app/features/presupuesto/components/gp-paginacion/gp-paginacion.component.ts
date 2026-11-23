import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-gp-paginacion', standalone: true,
  template: `<nav [attr.aria-label]="'Paginación de ' + etiqueta">
    <span>{{ datos.desde }}–{{ datos.hasta }} de {{ datos.total }} {{ etiqueta }}</span>
    <div><button type="button" [disabled]="datos.pagina <= 1" (click)="cambiar.emit(datos.pagina - 1)" [attr.aria-label]="'Página anterior de ' + etiqueta">Anterior</button>
      <span aria-live="polite">Página {{ datos.pagina }} de {{ datos.paginas }}</span>
      <button type="button" [disabled]="datos.pagina >= datos.paginas" (click)="cambiar.emit(datos.pagina + 1)" [attr.aria-label]="'Página siguiente de ' + etiqueta">Siguiente</button></div>
  </nav>`,
  styles: [`nav, nav>div{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}nav{padding:14px 16px;font-size:12px;color:var(--tx-2,#475569)}button{padding:7px 12px;border:1px solid #cbd5e1;border-radius:8px;background:var(--bg-surface,#fff)}button:disabled{opacity:.4;cursor:not-allowed}button:focus-visible{outline:2px solid #045c94;outline-offset:2px}`],
})
export class GpPaginacionComponent {
  @Input({required:true}) datos!: {desde:number;hasta:number;total:number;pagina:number;paginas:number};
  @Input() etiqueta = 'registros';
  @Output() cambiar = new EventEmitter<number>();
}
