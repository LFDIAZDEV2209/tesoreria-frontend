import { SelectBuscableDirective } from '../../../../core/ui/select-buscable/select-buscable.directive';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { EstadoBadgeComponent } from '../estado-badge/estado-badge.component';
import { FiltroBancoComponent } from '../filtro-banco/filtro-banco.component';
import { MovimientoBancario } from '../../models/movimiento-bancario.model';

@Component({
  selector: 'app-tabla-movimientos',
  standalone: true,
  imports: [SelectBuscableDirective,
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    EstadoBadgeComponent,
  ],
  templateUrl: './tabla-movimientos.component.html',
  styleUrl: './tabla-movimientos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablaMovimientosComponent implements OnChanges, AfterViewInit {
  @Input() movimientos: MovimientoBancario[] = [];
  @Input() bancos: string[] = [];
  @Input() empresasUt: string[] = [];

  @Output() verDetalle = new EventEmitter<MovimientoBancario>();
  @Output() abrirControlDiario = new EventEmitter<MovimientoBancario>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  readonly displayedColumns: string[] = [
    'id',
    'tipoMovimiento',
    'fechaPago',
    'empresaUt',
    'banco',
    'cuenta',
    'valor',
    'estadoOc',
    'estadoEgreso',
    'estadoPago',
    'accion',
  ];

  readonly dataSource = new MatTableDataSource<MovimientoBancario>([]);

  /** Dropdown action menu state */
  openMenuId: number | null = null;

  readonly filtrosForm = this.fb.nonNullable.group({
    busqueda: '',
    fechaDesde: '',
    fechaHasta: '',
    banco: '',
    empresaUt: '',
  });

  constructor(private readonly fb: FormBuilder) {
    this.filtrosForm.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe(() => this.applyFilters());

    this.dataSource.filterPredicate = (item, filter) => {
      const parsed = JSON.parse(filter) as {
        busqueda: string;
        fechaDesde: string;
        fechaHasta: string;
        banco: string;
        empresaUt: string;
      };

      const matchBusqueda = parsed.busqueda
        ? [item.referencia, item.cuenta, item.empresaUt, item.tipoMovimiento]
            .join(' ')
            .toLowerCase()
            .includes(parsed.busqueda.toLowerCase())
        : true;

      const matchBanco = parsed.banco ? item.banco === parsed.banco : true;
      const matchEmpresa = parsed.empresaUt ? item.empresaUt === parsed.empresaUt : true;
      const matchDesde = parsed.fechaDesde ? item.fechaPago >= parsed.fechaDesde : true;
      const matchHasta = parsed.fechaHasta ? item.fechaPago <= parsed.fechaHasta : true;

      return matchBusqueda && matchBanco && matchEmpresa && matchDesde && matchHasta;
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['movimientos']) {
      this.dataSource.data = this.movimientos;
      this.applyFilters();
    }
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  setBanco(value: string | null): void {
    this.filtrosForm.patchValue({ banco: value ?? '' }, { emitEvent: true });
  }

  clearFilters(): void {
    this.filtrosForm.reset({
      busqueda: '',
      fechaDesde: '',
      fechaHasta: '',
      banco: '',
      empresaUt: '',
    });
  }

  toggleMenu(id: number): void {
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  private applyFilters(): void {
    this.dataSource.filter = JSON.stringify(this.filtrosForm.getRawValue());
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }
}
