import { SelectBuscableDirective } from '../../../core/ui/select-buscable/select-buscable.directive';
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { RoleService } from '../../../core/services/role.service';
import { AuthorizationService } from '../../../core/services/authorization.service';
import { User } from '../../../core/models/user.model';
import { Role, RoleName, SUPERVISOR_ALLOWED_ROLES } from '../../../core/models/role.model';


@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, FormsModule, ReactiveFormsModule],
  styles: [`
    /* =====================================================
       ANIMACIONES BASE
       ===================================================== */
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes fade-in-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes slide-in-down {
      from { opacity: 0; transform: translateY(-18px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .animate-fade-in {
      animation: fade-in 0.5s ease-out;
    }

    .animate-fade-in-up {
      animation: fade-in-up 0.5s cubic-bezier(0.4,0,0.2,1);
    }

    /* =====================================================
       COLORES BASE
       ===================================================== */
    .text-navy { color: #213053; }
    .text-navy-80 { color: rgba(33, 48, 83, 0.8); }
    .text-navy-40 { color: rgba(33, 48, 83, 0.4); }

    /* =====================================================
       KPI CARDS - VERSIÓN COMPACTA
       ===================================================== */
    .kpi-section-compact {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
      animation: fade-in-up 0.5s ease-out;
    }

    .kpi-card-compact {
      background: white;
      border-radius: 1rem;
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 3px 15px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.8);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      cursor: default;
    }

    .kpi-card-compact::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
      transition: left 0.6s;
    }

    .kpi-card-compact:hover {
      transform: translateY(-4px) scale(1.01);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.06);
    }

    .kpi-card-compact:hover::before {
      left: 100%;
    }

    .kpi-card-compact:hover .kpi-icon-wrapper-compact {
      transform: scale(1.08) rotate(3deg);
    }

    .kpi-icon-wrapper-compact {
      width: 3rem;
      height: 3rem;
      border-radius: 0.875rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
    }

    .kpi-icon-wrapper-compact svg {
      width: 1.5rem;
      height: 1.5rem;
      stroke-width: 2.5;
    }

    .kpi-icon-purple {
      background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%);
      color: white;
    }

    .kpi-icon-teal {
      background: linear-gradient(135deg, #0D9488 0%, #14B8A6 100%);
      color: white;
    }

    .kpi-icon-danger {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }

    .kpi-icon-indigo {
      background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%);
      color: white;
    }

    .kpi-icon-primary {
      background: linear-gradient(135deg, #045C94 0%, #0572b9 100%);
      color: white;
    }

    .kpi-icon-gray {
      background: linear-gradient(135deg, #475569 0%, #64748b 100%);
      color: white;
    }

    .kpi-content-compact {
      flex: 1;
      min-width: 0;
    }

    .kpi-label-compact {
      display: block;
      font-size: 0.688rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(33, 48, 83, 0.6);
      margin-bottom: 0.375rem;
    }

    .kpi-value-wrapper-compact {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .kpi-value-compact {
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1;
      color: #213053;
      letter-spacing: -0.02em;
    }

    .kpi-trend-compact {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.688rem;
      font-weight: 600;
      padding: 0.2rem 0.4rem;
      border-radius: 0.375rem;
    }

    .kpi-trend-up {
      background: rgba(16, 185, 129, 0.1);
      color: #059669;
    }

    .kpi-trend-neutral {
      background: rgba(100, 116, 139, 0.1);
      color: #64748b;
    }

    .kpi-badge-compact {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.625rem;
      border-radius: 0.375rem;
      font-size: 0.688rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .kpi-badge-info {
      background: rgba(59, 130, 246, 0.15);
      color: #2563eb;
    }

    .kpi-badge-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #dc2626;
    }

    /* Variantes de color para KPI cards */
    .kpi-purple { border-left: 3px solid #9333EA; }
    .kpi-teal { border-left: 3px solid #14B8A6; }
    .kpi-danger { border-left: 3px solid #ef4444; }
    .kpi-indigo { border-left: 3px solid #6366F1; }
    .kpi-primary { border-left: 3px solid #045C94; }
    .kpi-gray { border-left: 3px solid #64748b; }

    /* =====================================================
       TABLA Y RESPONSIVE
       ===================================================== */
    .table-row {
      transition: all 0.2s ease;
    }

    .table-row:hover {
      background: linear-gradient(135deg, rgba(33, 48, 83, 0.03) 0%, rgba(4, 92, 148, 0.05) 100%);
    }

    /* =====================================================
       RESPONSIVE ADJUSTMENTS
       ===================================================== */
    @media (max-width: 1024px) {
      .kpi-section-compact {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }

      .kpi-value-compact {
        font-size: 1.375rem;
      }
    }

    @media (max-width: 768px) {
      .kpi-section-compact {
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }

      .kpi-card-compact {
        padding: 1rem;
      }

      .kpi-icon-wrapper-compact {
        width: 2.75rem;
        height: 2.75rem;
      }

      .kpi-icon-wrapper-compact svg {
        width: 1.375rem;
        height: 1.375rem;
      }

      .kpi-value-compact {
        font-size: 1.25rem;
      }
    }

    @media (max-width: 640px) {
      .kpi-section-compact {
        grid-template-columns: 1fr;
      }

      .kpi-icon-wrapper-compact {
        width: 2.5rem;
        height: 2.5rem;
      }

      .kpi-icon-wrapper-compact svg {
        width: 1.25rem;
        height: 1.25rem;
      }

      .kpi-value-compact {
        font-size: 1.125rem;
      }

      .kpi-label-compact {
        font-size: 0.625rem;
      }
    }
  `],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-[#fdfdfd] via-[#f0f0f0] to-[#e4e8f3] p-3">
      <!-- Header -->
      <div class="bg-gradient-to-r from-[#213053] via-[#1b2844] to-[#045C94] text-white shadow-2xl rounded-2xl mb-3">
        <div class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center text-xl">
              👥
            </div>
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-[#FFB71B] font-semibold mb-0.5">Panel de Control</p>
              <h1 class="text-xl font-bold font-iconic mb-0.5 tracking-tight">Gestión de Usuarios</h1>
              <p class="text-white/90 text-xs">Administra permisos, roles y acceso al sistema</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Cards - Compact -->
      <section class="kpi-section-compact">
        <div class="kpi-card-compact kpi-purple">
          <div class="kpi-icon-wrapper-compact kpi-icon-purple">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
          </div>
          <div class="kpi-content-compact">
            <span class="kpi-label-compact">Total</span>
            <div class="kpi-value-wrapper-compact">
              <span class="kpi-value-compact">{{ getTotalUsers() }}</span>
              <span class="kpi-trend-compact kpi-trend-neutral">Usuarios</span>
            </div>
          </div>
        </div>

        <div class="kpi-card-compact kpi-teal">
          <div class="kpi-icon-wrapper-compact kpi-icon-teal">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div class="kpi-content-compact">
            <span class="kpi-label-compact">Activos</span>
            <div class="kpi-value-wrapper-compact">
              <span class="kpi-value-compact">{{ getActiveUsers() }}</span>
              <span class="kpi-trend-compact kpi-trend-up">Activo</span>
            </div>
          </div>
        </div>

        
        <div class="kpi-card-compact kpi-indigo">
          <div class="kpi-icon-wrapper-compact kpi-icon-indigo">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
          </div>
          <div class="kpi-content-compact">
            <span class="kpi-label-compact">Super Admin</span>
            <div class="kpi-value-wrapper-compact">
              <span class="kpi-value-compact">{{ getSuperAdminCount() }}</span>
              <span class="kpi-badge-compact kpi-badge-info">Máximo</span>
            </div>
          </div>
        </div>

        <div class="kpi-card-compact kpi-primary">
          <div class="kpi-icon-wrapper-compact kpi-icon-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div class="kpi-content-compact">
            <span class="kpi-label-compact">Admin</span>
            <div class="kpi-value-wrapper-compact">
              <span class="kpi-value-compact">{{ getAdminCount() }}</span>
              <span class="kpi-badge-compact kpi-badge-info">Gestión</span>
            </div>
          </div>
        </div>

        <div class="kpi-card-compact kpi-gray">
          <div class="kpi-icon-wrapper-compact kpi-icon-gray">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </div>
          <div class="kpi-content-compact">
            <span class="kpi-label-compact">Usuarios</span>
            <div class="kpi-value-wrapper-compact">
              <span class="kpi-value-compact">{{ getUserCount() }}</span>
              <span class="kpi-trend-compact kpi-trend-neutral">Regular</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Users Table -->
      <div class="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-white/50 overflow-x-auto animate-fade-in">
        <!-- Table Header with Filters -->
        <div class="bg-gradient-to-r from-[#213053] via-[#1b2844] to-[#045C94] px-6 py-3">
          <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-white">Lista de Usuarios</h2>
              <p class="text-white/90 mt-0.5 text-xs">Gestiona usuarios, roles y permisos</p>
            </div>
            
            <!-- Filters -->
            <div class="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <input 
                type="text" 
                placeholder="🔍 Buscar usuario..."
                [(ngModel)]="searchTerm"
                (ngModelChange)="filterUsers()"
                class="px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:border-white/40 text-sm flex-1 lg:w-64">
              
              <select 
                [(ngModel)]="filterRole"
                (change)="filterUsers()"
                class="px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 text-sm appearance-none cursor-pointer">
                <option value="" class="bg-[#213053]">Todos los roles</option>
                <option value="SUPER_ADMIN" class="bg-[#213053]">👑 Super Admin</option>
                <option value="ADMIN" class="bg-[#213053]">👨‍💼 Admin</option>
                <option value="DOCUMENT_ADMIN" class="bg-[#213053]">📄 Admin Documentos</option>
                <option value="SUPERVISOR" class="bg-[#213053]">🔍 Supervisor</option>
                <option value="USER" class="bg-[#213053]">👤 Usuario</option>
              </select>

              <button 
                (click)="refreshUsers()"
                class="px-4 py-2 bg-[#154e43] text-white font-semibold rounded-lg hover:bg-[#0f3d34] transition-all shadow-md text-xs whitespace-nowrap flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Actualizar
              </button>
            </div>
          </div>
        </div>

        <!-- Desktop Table -->
        <div class="hidden md:block overflow-hidden">
          <table class="w-full">
            <thead class="bg-[#f4f4f4] border-b-2 border-[#213053]/10 sticky top-0">
              <tr>
                <th class="px-2 py-2 text-left text-[10px] font-bold text-[#213053] uppercase tracking-wide whitespace-nowrap">Usuario</th>
                <th class="px-2 py-2 text-left text-[10px] font-bold text-[#213053] uppercase tracking-wide whitespace-nowrap">Email</th>
                <th class="px-2 py-2 text-left text-[10px] font-bold text-[#213053] uppercase tracking-wide whitespace-nowrap">Rol</th>
                <th class="px-2 py-2 text-center text-[10px] font-bold text-[#213053] uppercase tracking-wide whitespace-nowrap">Nivel</th>
                <th class="px-2 py-2 text-center text-[10px] font-bold text-[#213053] uppercase tracking-wide whitespace-nowrap">Estado</th>
                <th class="px-2 py-2 text-center text-[10px] font-bold text-[#213053] uppercase tracking-wide whitespace-nowrap">Emp.</th>
                <th class="px-2 py-2 text-center text-[10px] font-bold text-[#213053] uppercase tracking-wide whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr *ngFor="let user of filteredUsers()" class="table-row">
                <td class="px-2 py-2 whitespace-nowrap">
                  <div class="flex items-center gap-1">
                    <div class="w-8 h-8 bg-gradient-to-br from-[#213053] to-[#045C94] rounded-full flex items-center justify-center text-white font-bold text-[10px] shadow-md">
                      {{ user.username.charAt(0).toUpperCase() }}
                    </div>
                    <div class="min-w-0">
                      <p class="text-[11px] font-semibold text-gray-900 truncate">{{ user.username }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-2 py-2 text-[11px] text-gray-700 truncate max-w-[140px]">{{ user.email || 'N/A' }}</td>
                <td class="px-2 py-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold max-w-[90px] truncate inline-block"
                    [ngClass]="getRoleClass(user.roles)"
                    [title]="getRoleLabel(user.roles)">
                    {{ getRoleLabel(user.roles) }}
                  </span>
                </td>
                <td class="px-2 py-2 text-center">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 inline-block">
                    L{{ user.level || '1' }}
                  </span>
                </td>
                <td class="px-2 py-2 text-center">
                  <span class="text-[11px] font-bold"
                    [ngClass]="{
                      'text-green-600': user.active,
                      'text-red-600': !user.active
                    }">
                    {{ user.active ? '✅' : '❌' }}
                  </span>
                </td>
                <td class="px-2 py-2 text-center">
                  <span class="text-[11px] font-semibold"
                    [ngClass]="{
                      'text-green-600': user.employeeId,
                      'text-gray-400': !user.employeeId
                    }">
                    {{ user.employeeId ? '✓' : '-' }}
                  </span>
                </td>
                <td class="px-2 py-2 text-center">
                  <div class="relative inline-block">
                    <button 
                      (click)="openMenuId() === user.id ? openMenuId.set(null) : openMenuId.set(user.id)"
                      class="p-1 text-gray-600 hover:text-[#213053] hover:bg-gray-100 rounded transition-all">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 8c1.1 0 2-1 2-2s-1-2-2-2-2 1-2 2 1 2 2 2zm0 2c-1.1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2zm0 6c-1.1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2z"/>
                      </svg>
                    </button>
                    
                    <!-- Dropdown Menu -->
                    <div *ngIf="openMenuId() === user.id" class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50 animate-fade-in">
                      <button 
                        (click)="openEditModal(user); openMenuId.set(null)"
                        class="w-full text-left px-4 py-2 hover:bg-blue-50 text-blue-600 text-sm font-medium flex items-center gap-2 border-b border-gray-100">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                        Editar
                      </button>
                      <button 
                        (click)="toggleUserStatus(user); openMenuId.set(null)"
                        [ngClass]="{
                          'text-red-600 hover:bg-red-50': user.active,
                          'text-green-600 hover:bg-green-50': !user.active
                        }"
                        class="w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 border-b border-gray-100">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path *ngIf="user.active" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                          <path *ngIf="!user.active" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        {{ user.active ? 'Desactivar' : 'Activar' }}
                      </button>
                      <button 
                        (click)="openMenuId.set(null)"
                        class="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 text-sm font-medium flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                        Cerrar
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
              <tr *ngIf="filteredUsers().length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500 text-sm">
                  No se encontraron usuarios
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card View -->
        <div class="md:hidden p-4 space-y-3">
          <div *ngFor="let user of filteredUsers()" 
            class="bg-white rounded-lg shadow-md p-4 animate-fade-in"
            [ngClass]="getMobileBorderClass(user)">
            
            <div class="flex items-start justify-between gap-2 mb-3">
              <div class="flex items-center gap-2 flex-1">
                <div class="w-10 h-10 bg-gradient-to-br from-[#213053] to-[#045C94] rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md">
                  {{ user.username.charAt(0).toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-gray-900 truncate text-sm">{{ user.username }}</p>
                  <p class="text-xs text-gray-500 truncate">{{ user.email || 'Sin email' }}</p>
                </div>
              </div>
              <span class="px-2 py-1 rounded text-xs font-semibold"
                [ngClass]="{
                  'bg-green-100 text-green-700': user.active,
                  'bg-red-100 text-red-700': !user.active
                }">
                {{ user.active ? '✅' : '❌' }}
              </span>
            </div>

            <div class="grid grid-cols-3 gap-2 mb-3">
              <div class="bg-gray-50 rounded p-2">
                <p class="text-xs text-gray-600 font-semibold">Rol</p>
                <p class="text-xs text-gray-900 font-bold truncate" [title]="getRoleLabel(user.roles)">{{ getRoleLabel(user.roles) }}</p>
              </div>
              <div class="bg-gray-50 rounded p-2">
                <p class="text-xs text-gray-600 font-semibold">Nivel</p>
                <p class="text-xs text-gray-900 font-bold">L{{ user.level || '1' }}</p>
              </div>
              <div class="bg-gray-50 rounded p-2">
                <p class="text-xs text-gray-600 font-semibold">Emp.</p>
                <p class="text-xs text-gray-900 font-bold">{{ user.employeeId ? '✓' : '-' }}</p>
              </div>
            </div>

            <div class="flex gap-2">
              <button 
                (click)="openEditModal(user)"
                class="flex-1 px-3 py-2 bg-[#045C94] hover:bg-[#0572b9] text-white rounded-lg text-xs font-semibold transition shadow-md">
                ✏️ Editar
              </button>
              <button 
                (click)="toggleUserStatus(user)"
                [ngClass]="{
                  'bg-red-600 hover:bg-red-700': user.active,
                  'bg-green-600 hover:bg-green-700': !user.active
                }"
                class="flex-1 px-3 py-2 text-white rounded-lg text-xs font-semibold transition shadow-md">
                {{ user.active ? '🚫 Desha.' : '✅ Activ.' }}
              </button>
            </div>
          </div>

          <div *ngIf="filteredUsers().length === 0" 
            class="bg-white rounded-lg shadow-md p-8 text-center text-gray-500 text-sm">
            No se encontraron usuarios
          </div>
        </div>
      </div>

      <!-- Edit Modal -->
      <div *ngIf="showEditModal" 
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 my-8 animate-fade-in">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 bg-gradient-to-br from-[#213053] to-[#045C94] rounded-xl flex items-center justify-center text-white text-xl">
              ✏️
            </div>
            <div>
              <h2 class="text-xl font-bold text-[#213053]">Editar Usuario</h2>
              <p class="text-xs text-gray-600">Modifica la información del usuario</p>
            </div>
          </div>
          
          <form [formGroup]="editForm" (ngSubmit)="saveUser()">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <!-- Username -->
              <div>
                <label class="block text-xs font-bold text-[#213053] uppercase tracking-wider mb-2">Nombre de Usuario</label>
                <input 
                  type="text" 
                  formControlName="username"
                  [disabled]="true"
                  class="w-full px-4 py-2 bg-gray-100 border-2 border-gray-200 rounded-lg text-gray-600 cursor-not-allowed text-sm">
                <p class="text-xs text-gray-500 mt-1">🔒 No se puede modificar</p>
              </div>

              <!-- ID -->
              <div>
                <label class="block text-xs font-bold text-[#213053] uppercase tracking-wider mb-2">ID del Usuario</label>
                <input 
                  type="text" 
                  formControlName="id"
                  [disabled]="true"
                  class="w-full px-4 py-2 bg-gray-100 border-2 border-gray-200 rounded-lg text-gray-600 cursor-not-allowed text-sm">
              </div>

              <!-- Email -->
              <div>
                <label class="block text-xs font-bold text-[#213053] uppercase tracking-wider mb-2">Email</label>
                <input 
                  type="email" 
                  formControlName="email"
                  class="w-full px-4 py-2 border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#213053] focus:ring-4 focus:ring-[#213053]/10 transition-all text-sm">
              </div>

              <!-- Role -->
              <div>
                <label class="block text-xs font-bold text-[#213053] uppercase tracking-wider mb-2">Rol del Usuario</label>
                <select 
                  formControlName="role"
                  (change)="onRoleChange()"
                  class="w-full px-4 py-2 border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#213053] focus:ring-4 focus:ring-[#213053]/10 transition-all text-sm cursor-pointer">
                  <option value="USER" *ngIf="canAssignRole('USER')">👤 Usuario (USER)</option>
                  <option value="SUPERVISOR" *ngIf="canAssignRole('SUPERVISOR')">🔍 Supervisor (SUPERVISOR)</option>
                  <option value="DOCUMENT_ADMIN" *ngIf="canAssignRole('DOCUMENT_ADMIN')">📄 Admin Documentos (DOCUMENT_ADMIN)</option>
                  <option value="ADMIN" *ngIf="canAssignRole('ADMIN')">👨‍💼 Administrador (ADMIN)</option>
                  <option value="SUPER_ADMIN" *ngIf="canAssignRole('SUPER_ADMIN')">👑 Super Administrador (SUPER_ADMIN)</option>
                </select>
                <p class="text-xs text-amber-600 mt-1" *ngIf="isSupervisorUser()">
                  ⚠️ Como Supervisor, solo puedes asignar roles de Usuario
                </p>
                <p class="text-xs text-purple-600 mt-1" *ngIf="!canAssignRole('SUPER_ADMIN') && editForm.get('role')?.value !== 'SUPER_ADMIN'">
                  🔒 Solo un Super Admin puede asignar el rol Super Admin
                </p>
              </div>

              <!-- Level -->
              <div [ngClass]="{'opacity-50 pointer-events-none': !isUserRole()}">
                <label class="block text-xs font-bold text-[#213053] uppercase tracking-wider mb-2">Nivel de Acceso</label>
                <select 
                  formControlName="level"
                  class="w-full px-4 py-2 border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#213053] focus:ring-4 focus:ring-[#213053]/10 transition-all text-sm cursor-pointer">
                  <option value="1">Nivel 1 - Básico</option>
                  <option value="2">Nivel 2 - Intermedio</option>
                  <option value="3">Nivel 3 - Avanzado</option>
                </select>
                <p class="text-xs text-gray-500 mt-1" *ngIf="!isUserRole()">
                  💡 Solo aplica para usuarios regulares
                </p>
              </div>

              <!-- Status -->
              <div>
                <label class="block text-xs font-bold text-[#213053] uppercase tracking-wider mb-2">Estado</label>
                <select 
                  formControlName="active"
                  class="w-full px-4 py-2 border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-[#213053] focus:ring-4 focus:ring-[#213053]/10 transition-all text-sm cursor-pointer">
                  <option [value]="true">✅ Activo</option>
                  <option [value]="false">❌ Inactivo</option>
                </select>
              </div>
            </div>

            <!-- Info Box -->
            <div class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-lg">
              <p class="text-sm font-semibold text-blue-800 mb-2">💡 Nota sobre roles</p>
              <ul class="text-xs text-blue-700 space-y-1">
                <li>👤 <strong>Usuario:</strong> Tiene acceso básico, puede tener niveles 1-3</li>
                <li>🔍 <strong>Supervisor:</strong> Acceso a todos los módulos, solo crea usuarios nivel 1-3</li>
                <li>📄 <strong>Admin Documentos:</strong> Acceso a lista empleados (lectura), validación documental y reportes</li>
                <li>👨‍💼 <strong>Admin:</strong> Acceso administrativo, sin niveles</li>
                <li>👑 <strong>Super Admin:</strong> Acceso total, único que puede crear otros Super Admin</li>
              </ul>
            </div>

            <div class="flex gap-3">
              <button 
                type="button"
                (click)="deleteUserFromModal()"
                class="px-4 py-2.5 bg-red-900 hover:bg-red-950 text-white rounded-lg font-semibold transition text-sm">
                🗑️ Eliminar Usuario
              </button>
              <button 
                type="button"
                (click)="closeEditModal()"
                class="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition text-sm">
                ✕ Cancelar
              </button>
              <button 
                type="submit"
                class="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#213053] to-[#045C94] hover:from-[#1b2844] hover:to-[#0572b9] text-white rounded-lg font-semibold transition shadow-md text-sm">
                ✓ Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
})
export class UserManagementComponent implements OnInit {
  users = signal<User[]>([]);
  filteredUsers = signal<User[]>([]);
  searchTerm = '';
  filterRole = '';
  showEditModal = false;
  currentUserRoles: any[] = [];
  editForm: FormGroup;
  allowedRoles = signal<RoleName[]>([]);
  openMenuId = signal<string | number | null | undefined>(null);


  constructor(
    private userService: UserService,
    private roleService: RoleService,
    private authService: AuthorizationService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.editForm = this.fb.group({
      id: [''],
      username: [''],
      email: [''],
      level: [''],
      role: ['USER'],
      active: [true]
    });
    this.allowedRoles.set(this.authService.getAllowedRolesToCreate());
  }


  ngOnInit(): void {
    this.loadUsers();
  }


  loadUsers(): void {
    this.userService.getUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.filteredUsers.set(users);
      },
      error: (err) => {
        alert('Error al cargar los usuarios');
      }
    });
  }


  filterUsers(): void {
    const term = this.searchTerm.toLowerCase();
    let filtered = this.users().filter(user => 
      user.username?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term) || 
      false
    );


    if (this.filterRole) {
      filtered = filtered.filter(user => {
        if (this.filterRole === 'SUPER_ADMIN') {
          return this.isSuperAdmin(user);
        } else if (this.filterRole === 'ADMIN') {
          return this.isAdmin(user) && !this.isSuperAdmin(user);
        } else if (this.filterRole === 'DOCUMENT_ADMIN') {
          return this.isDocumentAdmin(user);
        } else if (this.filterRole === 'SUPERVISOR') {
          return user.roles?.some(r => r.name === 'SUPERVISOR') || false;
        } else if (this.filterRole === 'USER') {
          return !this.isAdmin(user) && !this.isSuperAdmin(user) && !this.isDocumentAdmin(user) && !user.roles?.some(r => r.name === 'SUPERVISOR');
        }
        return true;
      });
    }


    this.filteredUsers.set(filtered);
  }


  refreshUsers(): void {
    this.loadUsers();
  }


  // Helper methods to avoid complex expressions in template
  isSuperAdmin(user: User): boolean {
    return user.roles?.some(r => r.name === 'SUPER_ADMIN') || false;
  }


  isAdmin(user: User): boolean {
    return user.roles?.some(r => r.name === 'ADMIN') || false;
  }


  isDocumentAdmin(user: User): boolean {
    return user.roles?.some(r => r.name === 'DOCUMENT_ADMIN') || false;
  }


  isRegularUser(user: User): boolean {
    return !this.isAdmin(user) && !this.isSuperAdmin(user) && !this.isDocumentAdmin(user);
  }


  getMobileBorderClass(user: User): string {
    if (this.isSuperAdmin(user)) return 'border-l-4 border-purple-500';
    if (this.isAdmin(user)) return 'border-l-4 border-blue-500';
    if (this.isDocumentAdmin(user)) return 'border-l-4 border-teal-500';
    return 'border-l-4 border-gray-400';
  }


  isUserRole(): boolean {
    const role = this.editForm.get('role')?.value;
    return role === 'USER';
  }


  getTotalUsers(): number {
    return this.users().length;
  }


  getActiveUsers(): number {
    return this.users().filter(u => u.active).length;
  }


  getInactiveUsers(): number {
    return this.users().filter(u => !u.active).length;
  }


  getSuperAdminCount(): number {
    return this.users().filter(u => this.isSuperAdmin(u)).length;
  }


  getAdminCount(): number {
    return this.users().filter(u => this.isAdmin(u) && !this.isSuperAdmin(u)).length;
  }


  getDocumentAdminCount(): number {
    return this.users().filter(u => this.isDocumentAdmin(u)).length;
  }


  getUserCount(): number {
    return this.users().filter(u => this.isRegularUser(u)).length;
  }


  getRoleLabel(roles?: any[]): string {
    if (!roles || roles.length === 0) return 'Usuario';
    const superAdmin = roles.find(r => r.name === 'SUPER_ADMIN');
    if (superAdmin) return '👑 Super Admin';
    const admin = roles.find(r => r.name === 'ADMIN');
    if (admin) return '👨‍💼 Admin';
    const documentAdmin = roles.find(r => r.name === 'DOCUMENT_ADMIN');
    if (documentAdmin) return '📄 Admin Docs';
    const supervisor = roles.find(r => r.name === 'SUPERVISOR');
    if (supervisor) return '🔍 Supervisor';
    return '👤 Usuario';
  }


  getRoleClass(roles?: any[]): any {
    if (!roles || roles.length === 0) return { 'bg-gray-100 text-gray-700': true };
    const hasSuperAdmin = roles.some(r => r.name === 'SUPER_ADMIN');
    const hasAdmin = roles.some(r => r.name === 'ADMIN');
    const hasDocumentAdmin = roles.some(r => r.name === 'DOCUMENT_ADMIN');
    const hasSupervisor = roles.some(r => r.name === 'SUPERVISOR');
    
    if (hasSuperAdmin) {
      return { 'bg-purple-100 text-purple-700': true };
    }
    if (hasAdmin) {
      return { 'bg-blue-100 text-blue-700': true };
    }
    if (hasDocumentAdmin) {
      return { 'bg-teal-100 text-teal-700': true };
    }
    if (hasSupervisor) {
      return { 'bg-amber-100 text-amber-700': true };
    }
    return { 'bg-gray-100 text-gray-700': true };
  }


  canAssignRole(roleName: string): boolean {
    return this.authService.canAssignRole(roleName);
  }


  isSupervisorUser(): boolean {
    return this.authService.isSupervisor() && !this.authService.isSuperAdmin() && !this.authService.isAdmin();
  }


  openEditModal(user: User): void {
    this.currentUserRoles = user.roles || [];
    
    let userRole = 'USER';
    if (user.roles && user.roles.length > 0) {
      if (this.isSuperAdmin(user)) {
        userRole = 'SUPER_ADMIN';
      } else if (this.isAdmin(user)) {
        userRole = 'ADMIN';
      } else if (this.isDocumentAdmin(user)) {
        userRole = 'DOCUMENT_ADMIN';
      } else if (user.roles.some(r => r.name === 'SUPERVISOR')) {
        userRole = 'SUPERVISOR';
      } else if (user.roles.some(r => r.name?.startsWith('USER'))) {
        userRole = 'USER';
      }
    }


    this.editForm.patchValue({
      id: user.id,
      username: user.username,
      email: user.email || '',
      level: user.level || 1,
      role: userRole,
      active: user.active || false
    });
    this.showEditModal = true;
  }


  closeEditModal(): void {
    this.showEditModal = false;
    this.editForm.reset();
    this.currentUserRoles = [];
  }


  saveUser(): void {
    if (!this.editForm.valid) {
      alert('Por favor completa los campos requeridos');
      return;
    }


    const userId = this.editForm.get('id')?.value;
    if (!userId) {
      alert('Error: ID de usuario no disponible');
      return;
    }


    const selectedRole = this.editForm.get('role')?.value;
    const updateData: any = {
      email: this.editForm.get('email')?.value,
      active: this.editForm.get('active')?.value
    };


    if (selectedRole === 'USER') {
      updateData.level = this.editForm.get('level')?.value;
    } else {
      updateData.level = null;
    }


    this.userService.updateUser(userId, updateData).subscribe({
      next: () => {
        const currentRole = this.currentUserRoles?.[0]?.name || 'USER';
        if (selectedRole !== currentRole) {
          this.changeUserRole(userId, selectedRole);
        } else {
          alert('Usuario actualizado exitosamente');
          this.closeEditModal();
          this.loadUsers();
        }
      },
      error: (err) => {
        let errorMessage = 'Error al actualizar el usuario';
        if (err.status === 404) {
          errorMessage = 'Usuario no encontrado';
        } else if (err.status === 400) {
          errorMessage = `Datos inválidos: ${err.error?.message || 'Verifica los campos'}`;
        } else if (err.status === 500) {
          errorMessage = 'Error en el servidor. Verifica que el email sea único y válido.';
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        }
        alert(errorMessage);
      }
    });
  }


  private changeUserRole(userId: string, newRole: string): void {
    const userLevel = this.editForm.get('level')?.value || 1;
    
    if (newRole === 'USER') {
      // Asignar USER con el nivel especificado
      this.assignUserLevelRoleOnEdit(userId, userLevel);
    } else {
      this.userService.updateUserRole(userId, newRole).subscribe({
        next: (updatedUser) => {
          alert('Usuario y rol actualizados exitosamente');
          this.closeEditModal();
          this.loadUsers();
        },
        error: (err: any) => {
          this.roleService.getRoleByName(newRole as any).subscribe({
            next: (role) => {
              this.assignNewRole(userId, role);
            },
            error: (err2: any) => {
              alert('Error al actualizar el rol. Por favor, recarga e intenta de nuevo.');
              this.closeEditModal();
              this.loadUsers();
            }
          });
        }
      });
    }
  }


  private assignUserLevelRoleOnEdit(userId: string, userLevel: number): void {
    const levelRoleMap: { [key: number]: string } = {
      1: 'USER_NIVEL_1',
      2: 'USER_NIVEL_2',
      3: 'USER_NIVEL_3'
    };
    
    const levelRoleName = levelRoleMap[userLevel] || 'USER_NIVEL_1';
    this.roleService.getRoleByName(levelRoleName as any).subscribe({
      next: (levelRole) => {
        const roleId = typeof levelRole.id === 'number' ? levelRole.id.toString() : levelRole.id;
        this.userService.assignRole(userId, roleId).subscribe({
          next: () => {
            // Remover el rol USER que se asigna automáticamente en el backend
            this.removeUserBaseRoleOnEdit(userId);
          },
          error: (err) => {
            alert('Usuario actualizado pero hubo un error al asignar el nivel. Por favor, recarga e intenta de nuevo.');
            this.closeEditModal();
            this.loadUsers();
          }
        });
      },
      error: (err) => {
        alert('Error al asignar el nivel. Por favor, recarga e intenta de nuevo.');
        this.closeEditModal();
        this.loadUsers();
      }
    });
  }


  private removeUserBaseRoleOnEdit(userId: string): void {
    this.roleService.getRoleByName('USER' as any).subscribe({
      next: (userRole) => {
        const roleId = typeof userRole.id === 'number' ? userRole.id.toString() : userRole.id;
        
        this.userService.removeRole(userId, roleId).subscribe({
          next: () => {
            alert('Usuario y rol actualizados exitosamente');
            this.closeEditModal();
            this.loadUsers();
          },
          error: (err) => {
            // Aún así mostrar éxito
            alert('Usuario y rol actualizados exitosamente (pero el rol USER no se pudo remover)');
            this.closeEditModal();
            this.loadUsers();
          }
        });
      },
      error: (err) => {
        // Si no se puede obtener el rol USER, proceder de todos modos
        alert('Usuario y rol actualizados exitosamente');
        this.closeEditModal();
        this.loadUsers();
      }
    });
  }


  private assignNewRole(userId: string, role: any): void {
    const roleId = typeof role.id === 'number' ? role.id.toString() : role.id;
    this.userService.assignRole(userId, roleId).subscribe({
      next: () => {
        alert('Usuario y rol actualizados exitosamente');
        this.closeEditModal();
        this.loadUsers();
      },
      error: (err: any) => {
        alert('Usuario actualizado pero hubo un error al cambiar el rol. Por favor, recarga e intenta de nuevo.');
        this.closeEditModal();
        this.loadUsers();
      }
    });
  }


  onRoleChange(): void {
    // La UI se actualiza automáticamente
  }


  deleteUserConfirm(user: User): void {
    if (!user.id) {
      alert('Error: ID de usuario no disponible');
      return;
    }


    const dialogMessage = `¿Estás seguro de que deseas eliminar al usuario "${user.username}"?\n\n⚠️ Esta acción no se puede deshacer.`;
    
    if (confirm(dialogMessage)) {
      this.userService.deleteUser(String(user.id)).subscribe({
        next: () => {
          alert(`Usuario "${user.username}" eliminado exitosamente`);
          this.loadUsers();
        },
        error: (err) => {
          let errorMessage = 'Error al eliminar el usuario';
          if (err.status === 404) {
            errorMessage = 'Usuario no encontrado';
          } else if (err.status === 409) {
            errorMessage = 'No se puede eliminar este usuario. Verifique dependencias.';
          } else if (err.status === 500) {
            errorMessage = 'Error en el servidor al eliminar el usuario';
          } else if (err.error?.message) {
            errorMessage = err.error.message;
          }
          alert(errorMessage);
        }
      });
    }
  }


  deleteUserFromModal(): void {
    const userId = this.editForm.get('id')?.value;
    const username = this.editForm.get('username')?.value;
    
    if (!userId) {
      alert('Error: ID de usuario no disponible');
      return;
    }


    const dialogMessage = `¿Estás seguro de que deseas eliminar al usuario "${username}"?\n\n⚠️ Esta acción no se puede deshacer.`;
    
    if (confirm(dialogMessage)) {
      this.userService.deleteUser(userId).subscribe({
        next: () => {
          alert(`✅ Usuario "${username}" eliminado exitosamente`);
          this.closeEditModal();
          this.loadUsers();
        },
        error: (err) => {
          let errorMessage = 'Error al eliminar el usuario';
          if (err.status === 404) {
            errorMessage = 'Usuario no encontrado';
          } else if (err.status === 409) {
            errorMessage = 'No se puede eliminar este usuario. Verifique dependencias.';
          } else if (err.status === 500) {
            errorMessage = 'Error en el servidor al eliminar el usuario';
          } else if (err.error?.message) {
            errorMessage = err.error.message;
          }
          alert(errorMessage);
        }
      });
    }
  }


  toggleUserStatus(user: User): void {
    const newStatus = !user.active;
    const message = newStatus ? 'activar' : 'desactivar';
    const userId = String(user.id || '');
    
    if (!userId || userId === 'undefined') {
      alert('Error: ID de usuario no disponible');
      return;
    }


    if (confirm(`¿Deseas ${message} el usuario ${user.username}?`)) {
      this.userService.updateUser(userId, { active: newStatus }).subscribe({
        next: () => {
          alert(`Usuario ${message}do exitosamente`);
          this.loadUsers();
        },
        error: (err) => {
          let errorMessage = `Error al ${message} el usuario`;
          if (err.status === 404) {
            errorMessage = 'Usuario no encontrado';
          } else if (err.status === 500) {
            errorMessage = 'Error en el servidor al actualizar el estado';
          }
          alert(errorMessage);
        }
      });
    }
  }
}

