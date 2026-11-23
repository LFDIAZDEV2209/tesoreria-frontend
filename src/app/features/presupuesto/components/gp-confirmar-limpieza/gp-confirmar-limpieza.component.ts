import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GpIconComponent } from '../gp-icon/gp-icon.component';
import { GpOverlayDirective } from '../../directives/gp-overlay.directive';

/** Confirmación del Gestor: exige escribir el nombre de la empresa seleccionada. */
@Component({
  selector: 'app-gp-confirmar-limpieza', standalone: true,
  hostDirectives: [GpOverlayDirective],
  imports: [CommonModule, FormsModule, GpIconComponent],
  template: `<div class="gp-clear-backdrop" (click)="cerrar()"><section class="modal-glass" role="dialog" aria-modal="true" aria-labelledby="gp-clear-title" (click)="$event.stopPropagation()"><header><app-gp-icon name="alert" [size]="16"/><h2 id="gp-clear-title">{{titulo}}</h2><button class="btn-ghost" aria-label="Cerrar" [disabled]="ocupado" (click)="cerrar()">×</button></header><div class="gp-clear-body"><p>{{mensaje}}</p><ul *ngIf="borrados.length" class="gp-clear-list gp-clear-list--borrar"><li *ngFor="let item of borrados"><app-gp-icon name="trash" [size]="12"/>{{item}}</li></ul><ul *ngIf="conservados.length" class="gp-clear-list gp-clear-list--conservar"><li *ngFor="let item of conservados"><app-gp-icon name="check" [size]="12"/>{{item}}</li></ul><label>Para confirmar, escribe el nombre exacto de la empresa: <strong>{{empresa}}</strong><input class="field" aria-label="Confirmar nombre de empresa" [(ngModel)]="confirmacion" [placeholder]="empresa || ''" [disabled]="ocupado" autofocus></label><p *ngIf="error" role="alert">{{error}}</p></div><footer><button class="btn-ghost" [disabled]="ocupado" (click)="cerrar()">Cancelar</button><button class="btn-primary" [disabled]="ocupado || !coincide" (click)="confirmar.emit()"><app-gp-icon name="trash" [size]="14"/>{{ocupado ? 'Borrando…' : 'Borrar todo'}}</button></footer></section></div>`,
  styles: [`.gp-clear-backdrop{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.7);backdrop-filter:blur(8px)}section{width:100%;max-width:384px;max-height:92dvh;overflow:auto}header,footer{display:flex;align-items:center;gap:10px;padding:16px 24px;border-bottom:1px solid rgb(var(--bdr-rgb)/.08)}header>app-gp-icon{color:var(--err-solid)}h2{font-size:16px;font-weight:700;flex:1}.gp-clear-body{padding:20px 24px;font-size:14px}.gp-clear-body>p{padding:12px 14px;background:rgb(var(--err-rgb)/.08);border:1px solid rgb(var(--err-rgb)/.2);border-radius:8px}.gp-clear-list{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}.gp-clear-list li{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;font-size:12.5px;line-height:1.35}.gp-clear-list li app-gp-icon{flex:none}.gp-clear-list--borrar li{color:var(--err-solid);background:rgb(var(--err-rgb)/.06)}.gp-clear-list--conservar li{color:var(--ok-solid);background:rgb(var(--ok-rgb)/.07)}label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--tx-2);margin-top:16px}footer{justify-content:flex-end;border-bottom:0;border-top:1px solid rgb(var(--bdr-rgb)/.08)}footer .btn-primary{background:var(--err-solid);display:flex;align-items:center;gap:8px}`],
})
export class GpConfirmarLimpiezaComponent {
  @Input() titulo = 'Limpiar workspace';
  @Input() empresa: string | null = null;
  @Input() mensaje = '';
  @Input() borrados: string[] = [];
  @Input() conservados: string[] = [];
  @Input() error: string | null = null;
  @Input() ocupado = false;
  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();
  confirmacion = '';
  get coincide(): boolean { return !!this.empresa && this.confirmacion.trim().toLocaleLowerCase() === this.empresa.trim().toLocaleLowerCase(); }
  @HostListener('document:keydown.escape') cerrar(): void { if (!this.ocupado) this.cancelar.emit(); }
}
