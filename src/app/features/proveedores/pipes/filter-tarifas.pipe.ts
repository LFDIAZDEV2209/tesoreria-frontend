import { Pipe, PipeTransform } from '@angular/core';
import { ConfiguracionRetencion } from '../services/retencion-fuente.service';

@Pipe({
  name: 'filterTarifas',
  standalone: true,
})
export class FilterTarifasPipe implements PipeTransform {
  transform(
    configs: ConfiguracionRetencion[],
    filterType: 'min' | 'max',
  ): number {
    if (!configs || configs.length === 0) {
      return 0;
    }

    const tarifas = configs.map((c) => c.tarifaRetencion);

    if (filterType === 'min') {
      return Math.min(...tarifas);
    } else if (filterType === 'max') {
      return Math.max(...tarifas);
    }

    return 0;
  }
}
