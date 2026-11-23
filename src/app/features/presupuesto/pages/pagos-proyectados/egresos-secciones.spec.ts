import { coincideBusqueda, paginar, seccionDeModulo } from './egresos-secciones';
describe('Secciones de egresos',()=>{
  it('separa cuentas por cobrar, anticipos y provisiones sin convertirlas en proveedores',()=>{
    expect(seccionDeModulo('cx_cobrar')).toBe('cx_cobrar');expect(seccionDeModulo('anticipos')).toBe('anticipos');
    expect(seccionDeModulo('manual')).toBe('provisiones');expect(seccionDeModulo('importado')).toBe('provisiones');
    expect(seccionDeModulo(null)).toBe('provisiones');expect(seccionDeModulo('desconocido')).toBe('otros');
  });
  it('busca por varias palabras sin tildes y conserva filtros por NIT',()=>{
    expect(coincideBusqueda('nomina 901','Nómina administrativa','901')).toBeTrue();
    expect(coincideBusqueda('901','Nómina','902')).toBeFalse();
  });
  it('corrige páginas fuera del rango después de filtrar y nunca pierde el último registro',()=>{
    const filas=Array.from({length:21},(_,i)=>i);
    expect(paginar(filas,3,10).filas).toEqual([20]);expect(paginar([1],3,10).pagina).toBe(1);
    expect(paginar([],3,10)).toEqual({filas:[],pagina:1,paginas:1,total:0,desde:0,hasta:0});
  });
});
