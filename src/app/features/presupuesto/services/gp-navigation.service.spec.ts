import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { GpNavigationService } from './gp-navigation.service';
import { GpSessionService } from './gp-session.service';
import { PresupuestoContextService } from './presupuesto-context.service';

describe('Navegación del Director Contable', () => {
  const estado = signal<any>(null), permisos = signal<any>(null);
  let navigation: GpNavigationService;
  beforeEach(() => {
    estado.set({autenticado:true,rol:'contador',rol_nexa:'director_contable',permisos:['presupuesto.ver','admin.categorias']});
    permisos.set(null);
    TestBed.configureTestingModule({providers:[
      {provide:GpSessionService,useValue:{estado}},
      {provide:PresupuestoContextService,useValue:{permisos}},
    ]});
    navigation=TestBed.inject(GpNavigationService);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('muestra presupuesto y catálogos sin exponer usuarios ni auditoría', () => {
    expect(navigation.items().map(i=>i.path)).toEqual(['presupuesto']);
    expect(navigation.adminItems().map(i=>i.path)).toEqual(['maestro-proveedores','categorias']);
  });
  it('oculta el módulo Importar maestro aunque el permiso exista', () => {
    estado.set({autenticado:true,rol:'contador',rol_nexa:'contador',permisos:['modulos.importar']});
    expect(navigation.items().some(i=>i.path==='subir-archivos')).toBeFalse();
  });
  it('respeta revocación efectiva del permiso aunque la sesión lo conserve', () => {
    permisos.set({rolGp:'director_contable',permisos:['presupuesto.ver']});
    expect(navigation.adminItems()).toEqual([]);
  });
  it('no muestra administración a sesiones pendientes de cambiar contraseña', () => {
    estado.update(s=>({...s,debe_cambiar_password:true}));
    expect(navigation.visible()).toBeFalse();
  });
});
