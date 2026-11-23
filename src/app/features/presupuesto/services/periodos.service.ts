import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AnioPanorama, ComparacionPanorama, EntradaPanorama, VistaPanorama } from '../models/panorama.model';

export function importeExcel(valor: unknown, obligatorio = false): number | null {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
    if (obligatorio) throw new Error('Aprobado y Pagado deben contener importes.');
    return null;
  }
  let numero: number;
  if (typeof valor === 'number') numero = valor;
  else {
    let texto = String(valor).trim().replace(/COP|\$|\s/gi, '');
    const coma = texto.lastIndexOf(','), punto = texto.lastIndexOf('.');
    if (coma >= 0 && punto >= 0) texto = coma > punto ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/,/g, '');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, '');
    else if (coma >= 0) texto = texto.replace(',', '.');
    if (!/^-?\d+(\.\d{1,2})?$/.test(texto)) throw new Error('Importe inválido: ' + String(valor));
    numero = Number(texto);
  }
  if (!Number.isFinite(numero) || !Number.isSafeInteger(Math.round(numero * 100)) || Math.abs(numero * 100 - Math.round(numero * 100)) > .001)
    throw new Error('Los importes deben ser finitos y tener como máximo dos decimales, sin pérdida de precisión.');
  return numero;
}
const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function filasExcelPanorama(filas: Record<string, unknown>[]): EntradaPanorama[] {
  if (!filas.length || filas.length > 5000) throw new Error('El archivo debe tener entre 1 y 5000 empresas.');
  const encabezados = Object.keys(filas[0]);
  const columna = (nombre: string) => encabezados.find(k => normalizar(k) === nombre) ?? encabezados.find(k => normalizar(k).startsWith(nombre));
  const id = encabezados.find(k => normalizar(k) === 'empresaid');
  const empresa = encabezados.find(k => normalizar(k) === 'empresa') ?? columna('nombreempresa');
  const aprobado = columna('aprobado'), pagado = columna('pagado'), pendiente = columna('pendiente'), liquidez = columna('liquidez'), contador = columna('contador');
  if ((!empresa && !id) || !aprobado || !pagado) throw new Error('Faltan columnas: Empresa (o EmpresaId), Aprobado y Pagado. Descarga la plantilla.');
  const resultado: EntradaPanorama[] = [];
  filas.forEach((fila, indice) => {
    if (Object.values(fila).every(v => v === '' || v === null || v === undefined)) return;
    try {
      const nombre = String(empresa ? fila[empresa] ?? '' : '').trim();
      const empresaId = id && fila[id] !== '' && fila[id] !== null && fila[id] !== undefined ? Number(fila[id]) : null;
      if ((!nombre && empresaId === null) || (empresaId !== null && (!Number.isSafeInteger(empresaId) || empresaId <= 0))) throw new Error('Empresa o EmpresaId inválidos.');
      const ap = importeExcel(fila[aprobado!], true)!, pg = importeExcel(fila[pagado!], true)!;
      const pd = pendiente ? importeExcel(fila[pendiente]) : null;
      if (ap < 0 || pg < 0 || pg > ap) throw new Error('Pagado no puede superar Aprobado; ambos deben ser no negativos.');
      if (pd !== null && Math.round(pd * 100) !== Math.round(ap * 100) - Math.round(pg * 100)) throw new Error('Pendiente debe ser Aprobado menos Pagado.');
      resultado.push({empresaId, empresa:nombre, contador:contador ? String(fila[contador] ?? '').trim() || null : null,
        aprobado:ap, pagado:pg, pendiente:pd, liquidez:liquidez ? importeExcel(fila[liquidez]) : null});
    } catch (e) { throw new Error('Fila ' + (indice + 2) + ': ' + (e instanceof Error ? e.message : String(e))); }
  });
  if (!resultado.length) throw new Error('No hay empresas para cargar.');
  return resultado;
}

@Injectable({providedIn:'root'})
export class PeriodosService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.gpApiUrl + '/periodos';
  catalogo() { return this.http.get<AnioPanorama[]>(this.url); }
  consultar(periodo: string) { return this.http.get<VistaPanorama>(this.url + '/' + periodo); }
  crearAnio(anio: number, crearMeses: boolean) { return this.http.post<void>(this.url + '/anios', {anio, crearMeses}); }
  crearMes(periodo: string, empresaId: number) { return this.http.post<void>(this.url + '/' + periodo, {}, {params:{empresaId}}); }
  aprobarMes(periodo: string, empresaId: number) { return this.http.put<void>(this.url + '/' + periodo + '/aprobar', {}, {params:{empresaId}}); }
  contenidoMes(periodo:string,empresaId:number) { return this.http.get<{periodo:string;datos:{tipo:string;registros:number}[]}>(this.url+'/'+periodo+'/contenido',{params:{empresaId}}); }
  eliminarMes(periodo: string, empresaId:number) { return this.http.delete<void>(this.url + '/' + periodo,{params:{empresaId}}); }
  eliminarAnio(anio: number) { return this.http.delete<void>(this.url + '/anios/' + anio); }
  importar(periodo: string, archivo: string, filas: EntradaPanorama[]) { return this.http.post<void>(this.url + '/' + periodo + '/importar', {archivo, filas}); }
  quitar(periodo: string) { return this.http.delete<void>(this.url + '/' + periodo + '/informacion'); }
  comparar(origen: string, destino: string) { return this.http.get<ComparacionPanorama>(this.url + '/comparar', {params:{origen,destino}}); }
  async leerArchivo(archivo: File): Promise<EntradaPanorama[]> {
    if (!/\.(xlsx|xls|csv)$/i.test(archivo.name) || archivo.size > 10 * 1024 * 1024) throw new Error('Selecciona un Excel o CSV de hasta 10 MB.');
    const XLSX = await import('xlsx');
    const libro = XLSX.read(await archivo.arrayBuffer(), {type:'array'});
    const hoja = libro.Sheets[libro.SheetNames[0]];
    if (!hoja) throw new Error('El archivo no tiene hojas.');
    return filasExcelPanorama(XLSX.utils.sheet_to_json<Record<string,unknown>>(hoja, {defval:''}));
  }
}
