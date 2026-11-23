import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConciliacionDetalle } from '../../models/conciliacion.model';
import { TesoreriaService } from '../../services/tesoreria.service';

@Component({
  selector: 'app-conciliacion-detalle',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule,
  ],
  templateUrl: './conciliacion-detalle.component.html',
  styleUrl: './conciliacion-detalle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConciliacionDetalleComponent implements OnInit {
  detalle: ConciliacionDetalle | null = null;
  loading = false;

  readonly vincularForm = this.fb.nonNullable.group({
    ocCodigo: ['', [Validators.required, Validators.minLength(4)]],
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly fb: FormBuilder,
    private readonly tesoreriaService: TesoreriaService,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const rawId = this.route.snapshot.paramMap.get('id') ?? '';
    const id = Number(rawId);

    if (!Number.isSafeInteger(id) || id <= 0) {
      this.router.navigate(['/tesoreria/bandeja']);
      return;
    }

    this.loadDetalle(id);
  }

  volver(): void {
    this.router.navigate(['/tesoreria/bandeja']);
  }

  vincularOc(): void {
    if (!this.detalle || this.vincularForm.invalid) {
      this.vincularForm.markAllAsTouched();
      return;
    }

    this.tesoreriaService
      .vincularOc(this.detalle.movimiento.id, this.vincularForm.controls.ocCodigo.value)
      .subscribe({ next: (result) => {
        this.snackBar.open(result.mensaje, 'Cerrar', { duration: 2500 });
        this.loadDetalle(this.detalle!.movimiento.id);
      }, error: (error: any) => {  this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); } });
  }

  generarEgreso(): void {
    if (!this.detalle) {
      return;
    }

    this.tesoreriaService
      .generarEgreso({
        movimientoId: this.detalle.movimiento.id,
        proveedor: this.detalle.movimiento.empresaUt,
        valor: this.detalle.movimiento.valor,
      })
      .subscribe({ next: (egreso) => {
        this.snackBar.open(`Egreso ${egreso.numeroEgreso} generado`, 'Cerrar', {
          duration: 2500,
        });
        this.loadDetalle(this.detalle!.movimiento.id);
      }, error: (error: any) => {  this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); } });
  }

  marcarConciliado(): void {
    if (!this.detalle) {
      return;
    }

    this.tesoreriaService.marcarConciliadoManual(this.detalle.movimiento.id).subscribe({ next: (result) => {
      this.snackBar.open(result.mensaje, 'Cerrar', { duration: 2500 });
      this.loadDetalle(this.detalle!.movimiento.id);
    }, error: (error: any) => {  this.snackBar.open(error?.error?.message || error?.error?.detail || 'No fue posible completar la operación en Tesorería.', 'Cerrar', {duration:3500}); this.cdr.markForCheck(); } });
  }

  private loadDetalle(id: number): void {
    this.loading = true;
    this.cdr.markForCheck();

    this.tesoreriaService.getDetalleConciliacion(id).subscribe({
      next: (detalle) => {
        this.detalle = detalle;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.detalle = null;
        this.loading = false;
        this.snackBar.open('No fue posible cargar el detalle de conciliacion', 'Cerrar', {
          duration: 3000,
        });
        this.cdr.markForCheck();
      },
    });
  }
}
