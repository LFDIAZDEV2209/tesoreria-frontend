export interface Egreso {
  id: number;
  movimientoId: number;
  numeroEgreso: string;
  fecha: string;
  valor: number;
  proveedor: string;
  observaciones?: string;
}

export interface CrearEgresoRequest {
  movimientoId: number;
  proveedor: string;
  valor: number;
  observaciones?: string;
}

export interface ControlDiarioPago {
  id: number;
  fecha: string;
  banco: string;
  cuenta: string;
  empresaUt: string;
  saldoInicial: number;
  ingresosCliente: number;
  ingresosApi: number;
  otrosIngresos: number;
  pagosProveedores: number;
  pagosPresupuesto: number;
  pagosNomina: number;
  rechazos: number;
  gastosBancarios: number;
  saldoBancario: number;
  observaciones: string;
}
