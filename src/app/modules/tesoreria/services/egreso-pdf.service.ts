import { Injectable } from '@angular/core';
import { Egreso } from '../models/egreso.model';
import { MovimientoBancario } from '../models/movimiento-bancario.model';

export interface EgresoPdfDraft {
  entidadLinea1: string;
  entidadLinea2: string;
  nit: string;
  direccion: string;
  telefono: string;
  ciudad: string;
  tituloComprobante: string;
  codigoComprobante: string;
  fechaElaboracion: string;
  cuentaDebito: string;
  cuentaCredito: string;
  terceroDebito: string;
  terceroCredito: string;
  detalleDebito: string;
  detalleCredito: string;
  descripcion: string;
  observaciones: string;
}

interface EgresoPdfPayload {
  egreso: Egreso;
  movimiento: MovimientoBancario;
  draft?: EgresoPdfDraft;
}

@Injectable({
  providedIn: 'root',
})
export class EgresoPdfService {
  crearDraft(egreso: Egreso, movimiento: MovimientoBancario): EgresoPdfDraft {
    const descripcion = (egreso.observaciones || `PAGO ${movimiento.referencia}`).toUpperCase();
    const ultimaCuenta = this.last4Digits(movimiento.cuenta);

    return {
      entidadLinea1: 'UNION TEMPORAL',
      entidadLinea2: 'AGROCAPITAL',
      nit: 'NIT 901.987.526-6',
      direccion: 'CR 46 76 230',
      telefono: 'Telefono: (3007380087)',
      ciudad: 'Barranquilla - Colombia',
      tituloComprobante: `EGRESO - CTA ${ultimaCuenta}`,
      codigoComprobante: egreso.numeroEgreso,
      fechaElaboracion: this.formatDate(egreso.fecha),
      cuentaDebito: '23359501 - Otros',
      cuentaCredito: `11100501 - ${movimiento.banco} CTA`,
      terceroDebito: this.toUpper(egreso.proveedor),
      terceroCredito: this.toUpper(movimiento.banco),
      detalleDebito: `Ref: ${movimiento.referencia}`,
      detalleCredito: `Cuenta: ${movimiento.cuenta}`,
      descripcion,
      observaciones: descripcion,
    };
  }

  async generarPdf(payload: EgresoPdfPayload): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const { egreso, movimiento } = payload;
    const draft = payload.draft ?? this.crearDraft(egreso, movimiento);
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 297;
    const margin = 14;

    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.3);
    doc.roundedRect(8, 8, pageWidth - 16, 194, 1.8, 1.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(17, 90, 160);
    doc.text('AgroCapital', margin + 8, 28);

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(draft.entidadLinea1, 117, 24);
    doc.text(draft.entidadLinea2, 117, 29);
    doc.setFont('helvetica', 'normal');
    doc.text(draft.nit, 117, 34);
    doc.text(draft.direccion, 117, 39);
    doc.text(draft.telefono, 117, 44);
    doc.text(draft.ciudad, 117, 49);

    doc.setDrawColor(145, 145, 145);
    doc.rect(160, 20, 96, 24);
    doc.line(160, 32, 256, 32);
    doc.line(210, 20, 210, 44);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(draft.tituloComprobante, 163, 27);
    doc.setFontSize(9.5);
    doc.text(draft.codigoComprobante, 247, 27, { align: 'right' });
    doc.text('Fecha de elaboracion', 163, 39);
    doc.setFont('helvetica', 'normal');
    doc.text(draft.fechaElaboracion, 247, 39, { align: 'right' });

    const tableY = 78;
    this.drawTableHeader(doc, tableY);

    const rows = this.buildRows(egreso, draft);
    let rowY = tableY + 9;

    rows.forEach((row, index) => {
      this.drawRow(doc, rowY, index + 1, row.cuentaContable, row.tercero, row.detalle, row.descripcion, row.debito, row.credito);
      rowY += 22;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total', 198, rowY + 9);
    doc.text(this.formatCurrency(egreso.valor), 228, rowY + 9, { align: 'right' });
    doc.text(this.formatCurrency(egreso.valor), 254, rowY + 9, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Observaciones', 20, rowY + 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(draft.observaciones, 20, rowY + 39, { maxWidth: 230 });

    doc.save(`${draft.codigoComprobante || egreso.numeroEgreso}.pdf`);
  }

  private drawTableHeader(doc: any, y: number): void {
    doc.setFillColor(226, 226, 226);
    doc.rect(16, y, 240, 9, 'F');

    doc.setDrawColor(163, 163, 163);
    doc.rect(16, y, 240, 9);

    const separators = [22, 79, 112, 145, 183, 219];
    separators.forEach((lineX) => doc.line(lineX, y, lineX, y + 53));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('#', 19, y + 6);
    doc.text('Cuenta contable', 38, y + 6);
    doc.text('Tercero', 94, y + 6);
    doc.text('Detalle', 127, y + 6);
    doc.text('Descripcion', 157, y + 6);
    doc.text('Debito', 197, y + 6);
    doc.text('Credito', 231, y + 6);
  }

  private drawRow(
    doc: any,
    y: number,
    index: number,
    cuentaContable: string,
    tercero: string,
    detalle: string,
    descripcion: string,
    debito: number,
    credito: number,
  ): void {
    doc.setDrawColor(176, 176, 176);
    doc.rect(16, y - 5, 240, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.3);

    doc.text(String(index), 18, y + 6);
    doc.text(cuentaContable, 24, y + 3, { maxWidth: 53 });
    doc.text(tercero, 80, y + 3, { maxWidth: 31 });
    doc.text(detalle, 114, y + 3, { maxWidth: 31 });
    doc.text(descripcion, 147, y + 3, { maxWidth: 34 });
    doc.text(this.formatCurrency(debito), 216, y + 6, { align: 'right' });
    doc.text(this.formatCurrency(credito), 254, y + 6, { align: 'right' });
  }

  private buildRows(egreso: Egreso, draft: EgresoPdfDraft): Array<{
    cuentaContable: string;
    tercero: string;
    detalle: string;
    descripcion: string;
    debito: number;
    credito: number;
  }> {
    return [
      {
        cuentaContable: draft.cuentaDebito,
        tercero: draft.terceroDebito,
        detalle: draft.detalleDebito,
        descripcion: draft.descripcion,
        debito: egreso.valor,
        credito: 0,
      },
      {
        cuentaContable: draft.cuentaCredito,
        tercero: draft.terceroCredito,
        detalle: draft.detalleCredito,
        descripcion: draft.descripcion,
        debito: 0,
        credito: egreso.valor,
      },
    ];
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private last4Digits(value: string): string {
    const digits = (value || '').replace(/\D/g, '');
    return digits.slice(-4) || '0000';
  }

  private toUpper(value: string): string {
    return (value || '').toUpperCase();
  }
}
