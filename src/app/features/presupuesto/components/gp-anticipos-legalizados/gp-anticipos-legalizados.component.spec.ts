import { HttpResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, Subject } from 'rxjs';
import { GpAnticiposLegalizadosComponent } from './gp-anticipos-legalizados.component';
import {
  AnticipoLegalizadoFila, GpAnticipoLegalizacionService, LegalizacionAnticipo,
  RepositorioAnticiposLegalizados,
} from '../../services/gp-anticipo-legalizacion.service';
import { PresupuestoContextService } from '../../services/presupuesto-context.service';
import { PresupuestoToastService } from '../../services/presupuesto-toast.service';

function fila(over: Partial<AnticipoLegalizadoFila> = {}): AnticipoLegalizadoFila {
  return {
    movimientoId: 1, periodo: '2026-04', nit: '900', nombre: 'PROVEEDOR', comprobante: 'C-1',
    fecha: '2026-04-01', saldo: -100000, categoria: null,
    total: 0, vigentes: 0, anuladas: 0, ultimaLegalizacion: null,
    ...over,
  };
}

function pagina(over: Partial<RepositorioAnticiposLegalizados> = {}): RepositorioAnticiposLegalizados {
  return {
    content: [], page: 0, size: 20, totalElements: 0, totalPages: 0,
    periodos: ['2026-05', '2026-04'],
    resumen: { total: 0, legalizados: 0, pendientes: 0, saldoLegalizado: 0, saldoPendiente: 0, valorLegalizado: 0 },
    ...over,
  };
}

function comprobante(over: Partial<LegalizacionAnticipo> = {}): LegalizacionAnticipo {
  return {
    id: 1, movimientoId: 7, nit: '900', nombreTercero: 'PROVEEDOR UNO', periodo: '2026-04',
    valorLegalizado: 250000, observacion: null, archivoNombre: 'soporte.pdf', archivoTipo: 'application/pdf',
    archivoBytes: 1024, creadoPor: 'ana', creadoEn: '2026-05-01T10:00:00',
    anulada: false, motivoAnulacion: null, anuladoPor: null, anuladoEn: null,
    ...over,
  };
}

describe('GpAnticiposLegalizadosComponent', () => {
  let api: jasmine.SpyObj<GpAnticipoLegalizacionService>;
  let toast: jasmine.SpyObj<PresupuestoToastService>;
  let ctx: { empresaId: ReturnType<typeof signal<number | null>>; nombreEmpresa: () => string; permisos: () => unknown };

  beforeEach(() => {
    api = jasmine.createSpyObj('GpAnticipoLegalizacionService', ['repositorio', 'listar', 'registrar', 'contenidosArchivo', 'quitar']);
    api.repositorio.and.returnValue(of(pagina()));
    api.listar.and.returnValue(of([]));
    toast = jasmine.createSpyObj('PresupuestoToastService', ['mostrar', 'error']);
    ctx = {
      empresaId: signal<number | null>(35),
      nombreEmpresa: () => 'Empresa de prueba',
      permisos: () => ({ superAdmin: false, permisos: ['modulos.importar'] }),
    };
    TestBed.configureTestingModule({
      imports: [GpAnticiposLegalizadosComponent, NoopAnimationsModule],
      providers: [
        { provide: GpAnticipoLegalizacionService, useValue: api },
        { provide: PresupuestoToastService, useValue: toast },
        { provide: PresupuestoContextService, useValue: ctx },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  function crear() {
    const fixture = TestBed.createComponent(GpAnticiposLegalizadosComponent);
    // Primer ciclo: el effect consulta la API y escribe las señales;
    // segundo ciclo: el template pinta la respuesta (patrón del spec GP-008).
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  it('destaca el mes del anticipo en el encabezado antes y después de legalizar', () => {
    const fixture = crear(); const page = fixture.componentInstance;
    const mov = fila({movimientoId:7,periodo:'2026-07',fecha:'05/08/2026'});
    page.abrirLegalizar(mov); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(`· Anticipo de ${page.etiqueta('2026-07')}`);
    page.legalizaciones.set(new Map([[7,[comprobante()]]]));
    mov.vigentes=1; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Anticipo legalizado');
    expect(fixture.nativeElement.textContent).toContain(`· Anticipo de ${page.etiqueta('2026-07')}`);
  });

  it('el toast del repositorio confirma el mes y conserva el texto si falta', () => {
    const page = crear().componentInstance;
    const file = new File(['%PDF-1.7'], 'soporte.pdf', {type:'application/pdf'});
    api.registrar.and.returnValue(of(comprobante()));
    page.abrirLegalizar(fila({movimientoId:7,periodo:'2026-07',nombre:'PROVEEDOR'}));
    page.archivoLegalizar.set(file); page.registrarLegalizacion();
    expect(toast.mostrar).toHaveBeenCalledWith(`Comprobante registrado para PROVEEDOR · se aplica en ${page.etiqueta('2026-07')}`);
    page.abrirLegalizar(fila({movimientoId:7,periodo:null,nombre:'PROVEEDOR'}));
    page.archivoLegalizar.set(file); page.registrarLegalizacion();
    expect(toast.mostrar.calls.mostRecent().args[0]).toBe('Comprobante de legalización registrado para PROVEEDOR');
  });

  it('cruza meses con el estado de legalización de cada anticipo', () => {
    api.repositorio.and.returnValue(of(pagina({
      content: [
        fila({ movimientoId: 7, periodo: '2026-04', nombre: 'PROVEEDOR UNO', total: 1, vigentes: 1 }),
        fila({ movimientoId: 8, periodo: '2026-03', nombre: 'PROVEEDOR DOS' }),
        fila({ movimientoId: 9, periodo: '2026-05', nombre: 'PROVEEDOR TRES', total: 1, vigentes: 0, anuladas: 1 }),
      ],
      totalElements: 3, totalPages: 1,
      resumen: { total: 3, legalizados: 1, pendientes: 2, saldoLegalizado: -500000, saldoPendiente: -1000000, valorLegalizado: 250000 },
    })));
    api.listar.and.returnValue(of([comprobante()]));

    const fixture = crear();
    const texto = fixture.nativeElement.textContent as string;

    expect(api.repositorio).toHaveBeenCalledWith(35, jasmine.objectContaining({ page: 0, size: 20, estado: 'todos' }));
    expect(api.listar).toHaveBeenCalledWith(35, [7, 8, 9]);
    expect(texto).toContain('PROVEEDOR UNO');
    expect(texto).toContain('Legalizado');
    expect(texto).toContain('Pendiente de legalizar');
    expect(texto).toContain('1 anulada');
    expect(texto).toContain('1 de 3 legalizados');
    expect(texto).toContain('3 anticipos');
    // El selector de meses se alimenta del catálogo del backend.
    const opciones = [...fixture.nativeElement.querySelectorAll('select option')]
      .map((o) => (o as HTMLOptionElement).textContent ?? '');
    expect(opciones.some((t) => t.includes('Abril'))).toBe(true);
  });

  it('filtra por estado, rango de meses y página', () => {
    const fixture = crear();
    api.repositorio.calls.reset();

    fixture.componentInstance.onEstado('pendientes');
    expect(api.repositorio).toHaveBeenCalledWith(35, jasmine.objectContaining({ estado: 'pendientes', page: 0 }));

    api.repositorio.calls.reset();
    fixture.componentInstance.onFecha('desde', '2026-04');
    expect(api.repositorio).toHaveBeenCalledWith(35, jasmine.objectContaining({ desde: '2026-04' }));

    api.repositorio.calls.reset();
    fixture.componentInstance.paginar(1);
    expect(api.repositorio).not.toHaveBeenCalled();

    api.repositorio.calls.reset();
    fixture.componentInstance.limpiarFiltros();
    expect(api.repositorio).toHaveBeenCalledWith(35, jasmine.objectContaining({ texto: '', desde: '', hasta: '', estado: 'todos' }));
  });

  it('muestra carga, error con mensaje propio y vacío sin romper la vista', () => {
    const respuesta = new Subject<RepositorioAnticiposLegalizados>();
    api.repositorio.and.returnValue(respuesta);
    const fixture = crear();
    expect(fixture.nativeElement.querySelector('app-gp-skeleton')).not.toBeNull();

    respuesta.error({ status: 404 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('todavía no está disponible');

    api.repositorio.and.returnValue(of(pagina()));
    fixture.componentInstance.cargar();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin anticipos por ahora');
  });

  it('abre el modal de legalización y consulta los comprobantes que faltan', () => {
    api.repositorio.and.returnValue(of(pagina({
      content: [fila({ movimientoId: 7, nombre: 'PROVEEDOR UNO', total: 1, vigentes: 1 })],
      totalElements: 1, totalPages: 1,
    })));
    const fixture = crear();
    api.listar.calls.reset();

    fixture.componentInstance.abrirLegalizar(fila({ movimientoId: 7, nombre: 'PROVEEDOR UNO', total: 1, vigentes: 1 }));
    fixture.detectChanges();

    expect(api.listar).toHaveBeenCalledWith(35, [7]);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Comprobantes de legalización');
    expect(fixture.nativeElement.querySelector('.gl-dropzone')).not.toBeNull();
  });

  it('sin permiso de importar el modal queda en modo consulta', () => {
    ctx.permisos = () => ({ superAdmin: false, permisos: ['modulos.ver'] });
    const fixture = crear();

    fixture.componentInstance.abrirLegalizar(fila({ movimientoId: 7, total: 1, vigentes: 1 }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Modo consulta');
    expect(fixture.nativeElement.querySelector('.gl-dropzone')).toBeNull();
  });

  it('exige un PDF real antes de registrar la legalización', async () => {
    const fixture = crear();
    const componente = fixture.componentInstance;

    await componente.onArchivoLegalizar({ target: { files: [new File(['texto'], 'falso.pdf', { type: 'application/pdf' })], value: '' } } as any);
    expect(componente.archivoLegalizar()).toBeNull();
    expect(componente.errorArchivoLegalizar()).toContain('PDF válido');

    await componente.onArchivoLegalizar({ target: { files: [new File(['%PDF-1.7\n'], 'soporte.pdf', { type: 'application/pdf' })], value: '' } } as any);
    expect(componente.archivoLegalizar()?.name).toBe('soporte.pdf');
    expect(componente.errorArchivoLegalizar()).toBe('');
  });

  it('formatea miles y limita a dos decimales sin perder la coma al escribir', () => {
    const page = crear().componentInstance;
    expect(page.formatearValorMiles('1500000,50')).toBe('1.500.000,50');
    expect(page.formatearValorMiles('1500000,')).toBe('1.500.000,');
    expect(page.formatearValorMiles('1.500.000,509')).toBe('1.500.000,50');
    expect(page.formatearValorMiles(',5')).toBe('0,5');
    expect(page.formatearValorMiles('')).toBe('');
  });

  it('parsea el importe colombiano y rechaza cero, negativos y texto inválido', () => {
    const page = crear().componentInstance;
    expect(page.parsearValorMiles('1.500.000,50')).toBe(1500000.5);
    for (const v of ['', '0', '-1', 'abc', '1,234', '1,2,3', 'Infinity']) {
      expect(page.parsearValorMiles(v)).withContext(v).toBeNull();
    }
  });

  it('rechaza importes inválidos antes de registrar y permite dejarlos vacíos', () => {
    const page = crear().componentInstance;

    page.abrirLegalizar(fila({movimientoId:7}));
    page.archivoLegalizar.set(new File(['%PDF-1.7'], 'soporte.pdf', {type: 'application/pdf'}));
    api.registrar.and.returnValue(of({} as any));
    page.valorLegalizar = '0'; page.registrarLegalizacion();
    expect(api.registrar).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('El valor legalizado debe ser mayor a cero, o puedes dejarlo vacío.');
    page.valorLegalizar = ''; page.registrarLegalizacion();
    expect(api.registrar.calls.mostRecent().args[3]).toBeNull();
  });

  it('limpia el importe al abrir el modal y quitar el archivo', () => {
    const page = crear().componentInstance;
    page.valorLegalizar = '1.000,50'; page.abrirLegalizar(fila({movimientoId:7}));
    expect(page.valorLegalizar).toBe('');
    page.valorLegalizar = '2.000,50'; page.quitarArchivoLegalizar();
    expect(page.valorLegalizar).toBe('');
  });

  it('abre antes de consultar, muestra el blob y libera la URL al minuto', fakeAsync(() => {
    const page = crear().componentInstance;
    const respuesta = new Subject<HttpResponse<Blob>>();
    const ventana = {opener: {}, close: jasmine.createSpy('close'), location: {replace: jasmine.createSpy('replace')}};
    spyOn(window, 'open').and.returnValue(ventana as any);
    const blob = new Blob(['%PDF-1.7'], {type: 'application/pdf'});
    spyOn(URL, 'createObjectURL').and.returnValue('blob:comprobante');
    spyOn(URL, 'revokeObjectURL');
    api.contenidosArchivo.and.callFake(() => { expect(window.open).toHaveBeenCalledWith('about:blank', '_blank'); return respuesta; });
    page.verDocumentoLegalizacion({id:5} as any);
    expect(ventana.opener).toBeNull();
    expect(api.contenidosArchivo).toHaveBeenCalledWith(35,5);
    respuesta.next(new HttpResponse({body:blob}));
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(ventana.location.replace).toHaveBeenCalledWith('blob:comprobante');
    tick(59999); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    tick(1); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante');
  }));

  it('cierra la pestaña ante respuesta vacía o fallida y error de descarga', () => {
    const page = crear().componentInstance;
    const ventana = {close: jasmine.createSpy('close')};
    spyOn(window, 'open').and.returnValue(ventana as any);
    for (const respuesta of [new HttpResponse<Blob>(), new HttpResponse({body:new Blob([])}), new HttpResponse({status:500,body:new Blob(['error'])})]) {
      api.contenidosArchivo.and.returnValue(of(respuesta));
      page.verDocumentoLegalizacion({id:5} as any);
    }
    const fallo = new Subject<HttpResponse<Blob>>();
    api.contenidosArchivo.and.returnValue(fallo);
    page.verDocumentoLegalizacion({id:5} as any); fallo.error({status:403});
    expect(ventana.close).toHaveBeenCalledTimes(4);
    expect(toast.error).toHaveBeenCalledTimes(4);
    expect(toast.error).toHaveBeenCalledWith('No se pudo abrir el comprobante de legalización. Intenta de nuevo.');
  });

  it('descarta el PDF si cambia la empresa durante la descarga', () => {
    const page = crear().componentInstance;
    const respuesta = new Subject<HttpResponse<Blob>>();
    const ventana = {close:jasmine.createSpy('close'),location:{replace:jasmine.createSpy('replace')}};
    spyOn(window, 'open').and.returnValue(ventana as any);
    spyOn(URL,'createObjectURL');
    api.contenidosArchivo.and.returnValue(respuesta);
    page.verDocumentoLegalizacion({id:5} as any); ctx.empresaId.set(36);
    respuesta.next(new HttpResponse({body:new Blob(['%PDF-1.7'])}));
    expect(ventana.close).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('avisa si el navegador bloquea la pestaña del comprobante', () => {
    const page = crear().componentInstance;
    spyOn(window, 'open').and.returnValue(null);
    spyOn(URL, 'createObjectURL');
    api.contenidosArchivo.and.returnValue(of(new HttpResponse({body:new Blob(['%PDF-1.7'])})));
    page.verDocumentoLegalizacion({id:5} as any);
    expect(toast.error).toHaveBeenCalledWith('Permite las ventanas emergentes y vuelve a abrir el comprobante.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('evita doble eliminación y Esc respeta la petición en curso', () => {
    const page = crear().componentInstance;

    const respuesta = new Subject<void>(); api.quitar.and.returnValue(respuesta);
    page.quitarConfirm.set({id:5,anulada:false} as any);
    page.quitar(); page.quitar(); page.onEscape();
    expect(api.quitar).toHaveBeenCalledTimes(1);
    expect(page.quitarConfirm()).not.toBeNull();
    respuesta.error({status:500});
    expect(page.quitando()).toBeFalse();
    page.onEscape();
    expect(page.quitarConfirm()).toBeNull();
  });

  it('quitar recarga la página, los comprobantes y el resumen del repositorio', () => {
    const fixture = crear(); const page = fixture.componentInstance;
    page.quitarConfirm.set(comprobante());
    api.quitar.and.returnValue(of(void 0));
    const actualizado = pagina({content:[fila({movimientoId:7,saldo:-250000})], totalElements:1, totalPages:1,
      resumen:{total:1, legalizados:0, pendientes:1, saldoLegalizado:0, saldoPendiente:-250000,valorLegalizado:0}});
    api.repositorio.and.returnValue(of(actualizado));
    api.repositorio.calls.reset(); api.listar.calls.reset();
    page.quitar();
    expect(api.quitar).toHaveBeenCalledWith(35,1);
    expect(api.repositorio).toHaveBeenCalledTimes(1);
    expect(api.listar).toHaveBeenCalledWith(35,[7]);
    expect(page.pagina()).toEqual(actualizado);
    expect(page.resumen()).toEqual(actualizado.resumen);
    expect(page.quitarConfirm()).toBeNull();
    expect(toast.mostrar).toHaveBeenCalledWith('Comprobante quitado · soporte.pdf');
  });

  it('la fila anulada conserva badge y motivo sin botones', () => {
    api.repositorio.and.returnValue(of(pagina({content:[fila({movimientoId:7})],totalElements:1,totalPages:1})));
    api.listar.and.returnValue(of([comprobante({anulada:true,motivoAnulacion:'Duplicado'})]));
    const fixture = crear(); fixture.componentInstance.abrirLegalizar(fila({movimientoId:7})); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Duplicado');
    expect(fixture.nativeElement.querySelectorAll('.gl-btn-danger').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.gl-btn-suave').length).toBe(0);
  });

  it('formatea el input real y muestra la confirmación sin campo de motivo', () => {
    const fixture = crear(); const page = fixture.componentInstance;
    page.abrirLegalizar(fila({movimientoId:7})); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#repoLegalizarValor');
    input.value='1500000,509'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(input.value).toBe('1.500.000,50'); expect(page.valorLegalizar).toBe('1.500.000,50');
    input.value='1.500.000,509'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(input.value).toBe('1.500.000,50');
    expect(input.getAttribute('aria-describedby')).toBe('legalizarValorAyuda');
    page.quitarConfirm.set(comprobante()); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('¿Quitar este comprobante de legalización?');
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });
});
