import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Skeleton que respeta la estructura real del contenido (sin pantallas congeladas). */
@Component({
  selector: 'app-gp-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container [ngSwitch]="tipo">
      <div *ngSwitchCase="'kpis'" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <div *ngFor="let i of [1,2,3,4,5]" class="relative overflow-hidden bg-surface rounded-2xl border border-white/40 p-5 shadow-card">
          <div class="h-2.5 w-1/3 rounded-full bg-gray-200"></div>
          <div class="h-6 w-2/3 rounded-full bg-gray-200 mt-3"></div>
          <div class="absolute -right-3 -top-3 w-14 h-14 rounded-full bg-elevated"></div>
          <div class="absolute inset-0 shimmer"></div>
        </div>
      </div>
      <div *ngSwitchCase="'chart'" class="card !p-5">
        <div class="h-4 w-1/3 rounded-full bg-gray-200"></div>
        <div class="h-40 mt-4 rounded-xl bg-elevated relative overflow-hidden">
          <div class="absolute inset-0 shimmer"></div>
        </div>
      </div>
      <div *ngSwitchCase="'table'">
        <div class="card !p-0 overflow-hidden">
          <div class="p-4 border-b border-bdr/10 flex gap-3">
            <div class="h-9 w-64 rounded-xl bg-gray-200"></div>
            <div class="h-9 w-44 rounded-xl bg-gray-200"></div>
            <div class="h-9 w-36 rounded-xl bg-gray-200"></div>
          </div>
          <div class="relative overflow-hidden">
            <div *ngFor="let i of [1,2,3,4,5,6,7]" class="h-11 border-b border-gray-50 flex items-center gap-6 px-4">
              <div class="h-3 w-28 rounded-full bg-gray-200"></div>
              <div class="h-3 w-40 rounded-full bg-elevated"></div>
              <div class="h-3 w-20 rounded-full bg-elevated"></div>
              <div class="h-3 w-24 rounded-full bg-elevated ml-auto"></div>
            </div>
            <div class="absolute inset-0 shimmer"></div>
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class GpSkeletonComponent {
  @Input() tipo: 'kpis' | 'chart' | 'table' = 'kpis';
}
