import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menus-placeholder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div class="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#045C94]/10 to-[#FFB71B]/10 flex items-center justify-center mb-6 animate-pulse">
        <span class="text-5xl">📋</span>
      </div>
      <h2 class="text-2xl font-extrabold text-[#213053] mb-2">Creación de Menús</h2>
      <p class="text-[#213053]/50 max-w-md">Este módulo está en desarrollo. Pronto podrás crear y gestionar menús completos a partir de productos registrados.</p>
      <div class="mt-6 px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
        🚧 Próximamente
      </div>
    </div>
  `
})
export class MenusPlaceholderComponent {}
