import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PagoProyectado } from './models/presupuesto.model';

// Misma identidad visual del PDF de Presupuesto — consistencia entre reportes.
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

function fechaLegible(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fechaHoraLegible(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function money(v: number | undefined | null): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v ?? 0);
}

/** Listado simple de facturas de Cuentas por Pagar ya autorizadas por
 * Gerencia (aprobadas desde el flujo de "facturas sugeridas") — soporte
 * para el pago, no reemplaza el PDF de Presupuesto Proyectado. */
export function generarFacturasAutorizadasPdf(facturas: PagoProyectado[], nombreContrato?: string | null): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...RGB.primario);
  doc.rect(0, 0, pageWidth, 74, 'F');
  doc.setTextColor(...RGB.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('GESTOR PRESUPUESTAL', MARGEN, 26);
  doc.setFontSize(17);
  doc.text('Facturas Autorizadas para Pago', MARGEN, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (nombreContrato) doc.text(nombreContrato, MARGEN, 64);

  const head = ['Proveedor', 'NIT', 'Factura', 'F. Vencimiento', 'Monto', 'Aprobado por', 'Aprobado el'];
  const body = facturas.map((f) => [
    f.nombre,
    f.nit ?? '—',
    (f.concepto ?? '—').replace(/^Factura\s*/i, ''),
    fechaLegible(f.fechaProyectada),
    money(f.montoProyectado),
    f.aprobadoPor ?? '—',
    fechaHoraLegible(f.aprobadoEn),
  ]);
  const total = facturas.reduce((acc, f) => acc + (f.montoProyectado ?? 0), 0);
  body.push(['TOTAL', '', '', '', money(total), '', '']);

  autoTable(doc, {
    startY: 96,
    rowPageBreak: 'avoid',
    head: [head],
    body,
    margin: { left: MARGEN, right: MARGEN },
    styles: { font: 'helvetica', fontSize: 8, textColor: RGB.ink, cellPadding: 5, lineColor: RGB.borde, lineWidth: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: RGB.primario, textColor: RGB.blanco, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: RGB.zebra },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 65 },
      2: { cellWidth: 85 },
      3: { cellWidth: 65 },
      4: { cellWidth: 60, halign: 'right' as const },
      5: { cellWidth: 55 },
      6: { cellWidth: pageWidth - 2 * MARGEN - 440 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = RGB.acentoSuave;
      }
    },
  });

  const fecha = new Date().toISOString().slice(0, 10);
  doc.save(`facturas_autorizadas_${fecha}.pdf`);
}
