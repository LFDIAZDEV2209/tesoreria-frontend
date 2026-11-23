import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { MovimientoBancario } from '../../models/movimiento-bancario.model';
import { ControlDiarioPago } from '../../models/egreso.model';
import { TesoreriaService } from '../../services/tesoreria.service';

@Component({
  selector: 'app-control-diario',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  templateUrl: './control-diario.component.html',
  styleUrl: './control-diario.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlDiarioComponent implements OnInit {
  @Input() modalMode = false;
  @Input() movimientoContexto: MovimientoBancario | null = null;
  @Output() cerrar = new EventEmitter<void>();

  rows: ControlDiarioPago[] = [];
  loading = false;

  constructor(
    private readonly tesoreriaService: TesoreriaService,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.tesoreriaService
      .getControlDiario(this.movimientoContexto)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (rows) => {
          this.rows = rows;
          this.cdr.markForCheck();
        },
        error: () => {
          this.rows = [];
          this.snackBar.open('No fue posible cargar el control diario', 'Cerrar', {
            duration: 2600,
          });
          this.cdr.markForCheck();
        },
      });
  }

  volverBandeja(): void {
    if (this.modalMode) {
      this.cerrar.emit();
      return;
    }
  }

  totalIngresos(row: ControlDiarioPago): number {
    return row.ingresosCliente + row.ingresosApi + row.otrosIngresos;
  }

  totalEgresos(row: ControlDiarioPago): number {
    return (
      row.pagosProveedores +
      row.pagosPresupuesto +
      row.pagosNomina +
      row.rechazos +
      row.gastosBancarios
    );
  }

  saldoFinal(row: ControlDiarioPago): number {
    return row.saldoInicial + this.totalIngresos(row) - this.totalEgresos(row);
  }

  diferenciaSaldo(row: ControlDiarioPago): number {
    return this.saldoFinal(row) - row.saldoBancario;
  }

  guardar(): void {
    this.tesoreriaService.guardarControlDiario(this.rows).subscribe((result) => {
      this.snackBar.open(result.mensaje, 'Cerrar', {
        duration: 2500,
      });
    });
  }
}
