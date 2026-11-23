import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Contrato, Mensual, FilaMensual, FilaNomina, formatoMiles,
  DetalleTerceroMensual, DetallePagoMensual,
} from './models/presupuesto.model';

// ─── Identidad visual del documento — corporativa, independiente del tema ──
const RGB = {
  primario: [30, 58, 95] as [number, number, number],
  acento: [74, 111, 165] as [number, number, number],
  acentoSuave: [232, 240, 248] as [number, number, number],
  ink: [31, 33, 32] as [number, number, number],
  muted: [107, 114, 122] as [number, number, number],
  zebra: [247, 250, 253] as [number, number, number],
  borde: [210, 224, 238] as [number, number, number],
  blanco: [255, 255, 255] as [number, number, number],
};

const MARGEN = 40;

function money(v: number | undefined | null): string {
  if (!v) return '-';
  const signo = v < 0 ? '-' : '';
  return `${signo}$ ${Math.round(Math.abs(v)).toLocaleString('es-CO')}`;
}

function valorCeldaPdf(f: FilaMensual | FilaNomina, v: number | undefined | null): string {
  if (f.campo === 'racionesEntregadas') return formatoMiles(v ?? 0);
  return money(v);
}

function fechaLegible(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function mesCorto(mes: string): string {
  const [a, m] = mes.split('-');
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${nombres[Number(m) - 1]} ${a.slice(2)}`;
}

function pct(v: number): string {
  return `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;
}

function esDestacada(concepto: string, destacadas: string[]): boolean {
  return destacadas.some((d) => concepto.toLowerCase() === d.toLowerCase());
}

function fontSizeParaAncho(doc: jsPDF, texto: string, anchoMax: number, tamanoBase: number): number {
  let tamano = tamanoBase;
  doc.setFontSize(tamano);
  while (tamano > 6.5 && doc.getTextWidth(texto) > anchoMax) {
    tamano -= 0.5;
    doc.setFontSize(tamano);
  }
  return tamano;
}

function ajustarCeldaParaAncho(doc: jsPDF, data: any): void {
  const texto = data.cell.text.join(' ');
  if (!texto) return;
  const disponible = data.cell.width - data.cell.padding('left') - data.cell.padding('right');
  doc.setFont(data.cell.styles.font, data.cell.styles.fontStyle);
  let tamano = data.cell.styles.fontSize;
  doc.setFontSize(tamano);
  while (tamano > 4.5 && doc.getTextWidth(texto) > disponible) {
    tamano -= 0.5;
    doc.setFontSize(tamano);
  }
  data.cell.styles.fontSize = tamano;
}

function anchosColumnasNumericas(
  doc: jsPDF, head: string[], body: string[][], indices: number[],
  anchoDisponible: number, fontSize: number, cellPadding: number,
): Record<number, { halign: 'right'; cellWidth: number }> {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const anchosHead = indices.map((i) => doc.getTextWidth(head[i] ?? ''));
  doc.setFont('helvetica', 'normal');
  const anchos = indices.map((i, idx) => {
    let max = anchosHead[idx];
    for (const fila of body) {
      const w = doc.getTextWidth(fila[i] ?? '');
      if (w > max) max = w;
    }
    return max;
  });
  const relleno = cellPadding * 2 + 3;
  const conRelleno = anchos.map((a) => a + relleno);
  const total = conRelleno.reduce((s, a) => s + a, 0);
  const factor = total > 0 ? anchoDisponible / total : 1;
  const resultado: Record<number, { halign: 'right'; cellWidth: number }> = {};
  indices.forEach((i, idx) => {
    resultado[i] = { halign: 'right', cellWidth: conRelleno[idx] * factor };
  });
  return resultado;
}

function dibujarPortada(doc: jsPDF, contrato: Contrato, mensual: Mensual, pageWidth: number): number {
  doc.setFillColor(...RGB.primario);
  doc.rect(0, 0, pageWidth, 108, 'F');

  doc.setTextColor(...RGB.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('GESTOR PRESUPUESTAL', MARGEN, 24);

  doc.setFontSize(20);
  doc.text(contrato.nombreEmpresa || 'Presupuesto Proyectado', MARGEN, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Presupuesto Proyectado', MARGEN, 66);

  doc.setFontSize(9);
  if (contrato.numeroContrato) doc.text(contrato.numeroContrato, MARGEN, 82);

  const y0 = 130;
  const meses = mensual.meses;
  const totalContratoFila = mensual.filasContrato.find((f) => f.concepto === 'Total Contrato');
  const agotamientoFila = mensual.filasContrato.find((f) => f.concepto === 'Agotamiento Presupuestal');
  let mesRef: string | undefined = meses.length ? meses[meses.length - 1] : undefined;
  if (totalContratoFila) {
    for (let i = meses.length - 1; i >= 0; i--) {
      const v = totalContratoFila.valores[meses[i]];
      if (v != null && v !== 0) { mesRef = meses[i]; break; }
    }
  }
  const totalContrato = totalContratoFila ? ((totalContratoFila.valores[mesRef!] ?? 0) || contrato.valorInicialContrato) : contrato.valorInicialContrato;
  const agotamiento = agotamientoFila ? (agotamientoFila.valores[mesRef!] ?? 0) : 0;
  const pctEjecutado = totalContrato ? 1 - agotamiento / totalContrato : 0;

  const tarjetas: [string, string][] = [
    ['FECHA INICIAL', fechaLegible(contrato.fechaInicial)],
    ['FECHA FINAL', fechaLegible(contrato.fechaFinal)],
    ['DIAS DE ENTREGA', contrato.diasEntregaAlimentacion != null ? `${contrato.diasEntregaAlimentacion} dias` : '—'],
    ['TOTAL CONTRATO', money(totalContrato)],
    ['AGOTAMIENTO', money(agotamiento)],
    ['% EJECUTADO', pct(pctEjecutado)],
  ];

  const colWidth = (pageWidth - MARGEN * 2 - 5 * 8) / 6;
  tarjetas.forEach(([label, valor], i) => {
    const x = MARGEN + i * (colWidth + 8);
    doc.setDrawColor(...RGB.borde);
    doc.setFillColor(...RGB.acentoSuave);
    doc.roundedRect(x, y0, colWidth, 52, 4, 4, 'FD');
    doc.setTextColor(...RGB.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(label, x + 7, y0 + 15, { maxWidth: colWidth - 12 });
    doc.setTextColor(...RGB.primario);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSizeParaAncho(doc, valor, colWidth - 14, 10));
    doc.text(valor, x + 7, y0 + 34);
    doc.setFont('helvetica', 'normal');
  });

  return y0 + 52 + 26;
}

function tituloSeccion(doc: jsPDF, titulo: string, y: number, pageWidth: number): number {
  doc.setFillColor(...RGB.acento);
  doc.rect(MARGEN, y, pageWidth - MARGEN * 2, 20, 'F');
  doc.setTextColor(...RGB.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(titulo.toUpperCase(), MARGEN + 8, y + 14);
  return y + 20;
}

function espacioDisponible(doc: jsPDF, y: number): boolean {
  const pageHeight = doc.internal.pageSize.getHeight();
  return y < pageHeight - 120;
}

function finalY(doc: jsPDF, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

function seccionMeses(
  doc: jsPDF, titulo: string, meses: string[], filas: (FilaMensual | FilaNomina)[],
  y: number, pageWidth: number, destacadas: string[] = [],
): number {
  if (filas.length === 0 || meses.length === 0) return y;
  if (!espacioDisponible(doc, y)) {
    doc.addPage();
    y = MARGEN;
  }
  y = tituloSeccion(doc, titulo, y, pageWidth);

  const tieneTotal = filas.some((f) => 'total' in f);
  const head = ['Concepto', ...meses.map(mesCorto), ...(tieneTotal ? ['Total a pagar'] : [])];
  const body = filas.map((f) => {
    const fila = [f.concepto, ...meses.map((m) => valorCeldaPdf(f, f.valores[m]))];
    if (tieneTotal) fila.push('total' in f ? money((f as FilaNomina).total) : '');
    return fila;
  });

  const anchoCol0 = 100;
  const anchoDisponible = pageWidth - MARGEN * 2 - anchoCol0;
  const columnasNumericas = anchosColumnasNumericas(
    doc, head, body, Array.from({ length: meses.length + (tieneTotal ? 1 : 0) }, (_, i) => i + 1),
    anchoDisponible, 7.5, 4,
  );

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: MARGEN, right: MARGEN },
    styles: { font: 'helvetica', fontSize: 7.5, textColor: RGB.ink, cellPadding: 4, lineColor: RGB.borde, lineWidth: 0.5, overflow: 'visible' },
    headStyles: { fillColor: RGB.primario, textColor: RGB.blanco, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: RGB.zebra },
    columnStyles: {
      0: { cellWidth: anchoCol0, fontStyle: 'bold', overflow: 'linebreak' },
      ...columnasNumericas,
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const concepto = String((data.row.raw as (string | number)[])[0]);
        if (esDestacada(concepto, destacadas)) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = RGB.acentoSuave;
        }
      }
    },
    willDrawCell: (data) => ajustarCeldaParaAncho(doc, data),
  });

  return finalY(doc, y) + 22;
}

function seccionTerceros(
  doc: jsPDF, titulo: string, meses: string[], detalle: DetalleTerceroMensual[],
  totalPorMes: Record<string, number>, y: number, pageWidth: number,
  labelEntidad: string, labelTotal: string,
): number {
  if (detalle.length === 0 || meses.length === 0) return y;
  if (!espacioDisponible(doc, y)) {
    doc.addPage();
    y = MARGEN;
  }
  y = tituloSeccion(doc, `${titulo} — ${detalle.length} ${detalle.length === 1 ? 'tercero' : 'terceros'}`, y, pageWidth);

  const mesesVisibles = meses;
  const head = [labelEntidad, ...mesesVisibles.map(mesCorto), 'Total', 'Sugerido', 'Saldo Pendiente'];
  const body = detalle.map((p) => [
    p.nombre,
    ...mesesVisibles.map((m) => money(p.valores[m])),
    money(p.total),
    money(p.pagoSugerido),
    money(p.saldoPendiente),
  ]);
  const totalGeneral = detalle.reduce((s, p) => s + p.total, 0);
  const totalSugerido = detalle.reduce((s, p) => s + (p.pagoSugerido ?? 0), 0);
  const totalSaldo = detalle.reduce((s, p) => s + p.saldoPendiente, 0);
  body.push([
    labelTotal,
    ...mesesVisibles.map((m) => money(totalPorMes[m])),
    money(totalGeneral),
    money(totalSugerido),
    money(totalSaldo),
  ]);

  const anchoCol0 = 90;
  const anchoDisponible = pageWidth - MARGEN * 2 - anchoCol0;
  const columnasNumericas = anchosColumnasNumericas(
    doc, head, body, Array.from({ length: mesesVisibles.length + 3 }, (_, i) => i + 1),
    anchoDisponible, 7, 3.5,
  );
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: MARGEN, right: MARGEN },
    styles: { font: 'helvetica', fontSize: 7, textColor: RGB.ink, cellPadding: 3.5, lineColor: RGB.borde, lineWidth: 0.5, overflow: 'visible' },
    headStyles: { fillColor: RGB.primario, textColor: RGB.blanco, fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: RGB.zebra },
    columnStyles: {
      0: { cellWidth: anchoCol0, overflow: 'linebreak' },
      ...columnasNumericas,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = RGB.acentoSuave;
      }
    },
    willDrawCell: (data) => ajustarCeldaParaAncho(doc, data),
  });

  return finalY(doc, y) + 22;
}

function seccionPagosProyectados(
  doc: jsPDF, meses: string[], detalle: DetallePagoMensual[],
  totalPorMes: Record<string, number>, y: number, pageWidth: number, titulo = 'Pagos Proyectados',
): number {
  if (detalle.length === 0 || meses.length === 0) return y;
  if (!espacioDisponible(doc, y)) {
    doc.addPage();
    y = MARGEN;
  }
  y = tituloSeccion(doc, `${titulo} — ${detalle.length} ${detalle.length === 1 ? 'beneficiario' : 'beneficiarios'}`, y, pageWidth);

  const mesesVisibles = meses;
  const head = ['Beneficiario', ...mesesVisibles.map(mesCorto), 'Total', 'Ejecutado', 'Por ejecutar'];
  const body = detalle.map((p) => [
    p.nombre,
    ...mesesVisibles.map((m) => money(p.valores[m])),
    money(p.total),
    money(p.montoPagado),
    money(p.montoPendiente),
  ]);
  const totalGeneral = detalle.reduce((s, p) => s + p.total, 0);
  const totalPagado = detalle.reduce((s, p) => s + p.montoPagado, 0);
  const totalPendiente = detalle.reduce((s, p) => s + p.montoPendiente, 0);
  body.push([
    `${titulo} (Total)`,
    ...mesesVisibles.map((m) => money(totalPorMes[m])),
    money(totalGeneral),
    money(totalPagado),
    money(totalPendiente),
  ]);

  const anchoCol0 = 90;
  const anchoDisponible = pageWidth - MARGEN * 2 - anchoCol0;
  const columnasNumericas = anchosColumnasNumericas(
    doc, head, body, Array.from({ length: mesesVisibles.length + 3 }, (_, i) => i + 1),
    anchoDisponible, 7, 3.5,
  );
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: MARGEN, right: MARGEN },
    styles: { font: 'helvetica', fontSize: 7, textColor: RGB.ink, cellPadding: 3.5, lineColor: RGB.borde, lineWidth: 0.5, overflow: 'visible' },
    headStyles: { fillColor: RGB.primario, textColor: RGB.blanco, fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: RGB.zebra },
    columnStyles: {
      0: { cellWidth: anchoCol0, overflow: 'linebreak' },
      ...columnasNumericas,
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = RGB.acentoSuave;
      }
    },
    willDrawCell: (data) => ajustarCeldaParaAncho(doc, data),
  });

  return finalY(doc, y) + 22;
}

function agregarPieDePagina(doc: jsPDF, contrato: Contrato, pageWidth: number): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPaginas = doc.getNumberOfPages();
  const generado = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });

  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RGB.borde);
    doc.line(MARGEN, pageHeight - 34, pageWidth - MARGEN, pageHeight - 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...RGB.muted);
    doc.text(`Gestor Presupuestal${contrato.numeroContrato ? ' · ' + contrato.numeroContrato : ''}`, MARGEN, pageHeight - 20);
    doc.text(`Generado el ${generado}`, MARGEN, pageHeight - 10);
    doc.text(`Página ${i} de ${totalPaginas}`, pageWidth - MARGEN, pageHeight - 20, { align: 'right' });
  }
}

/** Genera y descarga el PDF del presupuesto (mismo layout que la referencia). */
export function generarPresupuestoPdf(contrato: Contrato, mensual: Mensual, mesesVisibles?: string[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = dibujarPortada(doc, contrato, mensual, pageWidth);
  const meses = Array.from(new Set([...(mesesVisibles?.length ? mesesVisibles : []), ...mensual.meses])).sort();

  y = seccionMeses(doc, 'Sección A · Contrato y Facturación', meses, mensual.filasContrato, y, pageWidth,
    ['Total Contrato', 'Agotamiento Presupuestal', 'Pendiente por Cobrar']);
  y = seccionMeses(doc, 'Flujo de Caja', meses, mensual.filasFlujoCaja, y, pageWidth, ['TOTAL DISPONIBLE']);
  y = seccionMeses(doc, 'Nómina', meses, mensual.filasNomina, y, pageWidth, ['Beneficio a Empleados (Total Nómina)']);
  y = seccionMeses(doc, 'Estampillas', meses, mensual.filasEstampillas, y, pageWidth, ['TOTAL ESTAMPILLAS']);

  y = seccionTerceros(doc, 'Proveedores', meses, mensual.proveedores.detalle, mensual.proveedores.total, y, pageWidth, 'Proveedor', 'Proveedores (Total)');
  y = seccionTerceros(doc, 'Anticipos', meses, mensual.anticipos.detalle, mensual.anticipos.total, y, pageWidth, 'Proveedor', 'Anticipos (Total)');
  y = seccionTerceros(doc, 'Otras Cuentas por Pagar', meses, mensual.prestamos.detalle, mensual.prestamos.total, y, pageWidth, 'Prestamista', 'Otras Cuentas por Pagar (Total)');
  y = seccionTerceros(doc, 'Cuentas por Cobrar', meses, mensual.cuentasCobrar.detalle, mensual.cuentasCobrar.total, y, pageWidth, 'Tercero', 'Cuentas por Cobrar (Total)');
  y = seccionTerceros(doc, 'Impuestos, Estampillas y Seguros', meses, mensual.impuestosEstampillasSeguros.detalle, mensual.impuestosEstampillasSeguros.total, y, pageWidth, 'Tercero', 'Impuestos, Estampillas y Seguros (Total)');
  y = seccionPagosProyectados(doc, meses, mensual.pagosProyectados.detalle, mensual.pagosProyectados.total, y, pageWidth);
  if (mensual.cobrosProyectados?.detalle?.length) {
    y = seccionPagosProyectados(doc, meses, mensual.cobrosProyectados.detalle, mensual.cobrosProyectados.total, y, pageWidth, "Cobros Proyectados");
  }
  y = seccionPagosProyectados(doc, meses, mensual.provisiones.detalle, mensual.provisiones.total, y, pageWidth, "Provisiones");

  const observaciones = meses.filter(m => mensual.notas?.[m]?.trim()).map(m => [mesCorto(m), mensual.notas[m]]);
  if (observaciones.length) {
    if (!espacioDisponible(doc, y)) { doc.addPage(); y = MARGEN; }
    y = tituloSeccion(doc, 'Observaciones', y, pageWidth);
    autoTable(doc, {
      startY: y, head: [['Mes', 'Observación']], body: observaciones,
      margin: {left: MARGEN, right: MARGEN, bottom: 42}, rowPageBreak: 'avoid',
      styles: {font: 'helvetica', fontSize: 8, textColor: RGB.ink, cellPadding: 5, overflow: 'linebreak', lineColor: RGB.borde, lineWidth: 0.5},
      headStyles: {fillColor: RGB.primario, textColor: RGB.blanco, fontStyle: 'bold'},
      alternateRowStyles: {fillColor: RGB.zebra}, columnStyles: {0: {cellWidth: 80}},
    });
  }
  agregarPieDePagina(doc, contrato, pageWidth);

  const fechaArchivo = new Date().toISOString().slice(0, 10);
  const sufijo = contrato.numeroContrato ? contrato.numeroContrato.replace(/[^a-zA-Z0-9-]/g, '') : 'PRESUPUESTO';
  doc.save(`Presupuesto_${sufijo}_${fechaArchivo}.pdf`);
}
