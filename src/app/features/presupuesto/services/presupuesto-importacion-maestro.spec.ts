import { HttpEventType, HttpResponse } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { PresupuestoService } from './presupuesto.service';

describe('Respuesta final del importador maestro', () => {
  it('no cancela la carga al recibir eventos de envío o progreso', async () => {
    const events = new Subject<any>();
    const http = jasmine.createSpyObj('HttpClient', ['post']);
    http.post.and.returnValue(events);
    const service = new PresupuestoService(http, {} as any, {} as any);
    const progress = jasmine.createSpy('progress');
    const result = firstValueFrom(service.importarMaestro(304, new File(['fixture'], 'maestro.xlsx'), progress));
    events.next({type: HttpEventType.Sent});
    events.next({type: HttpEventType.UploadProgress, loaded: 50, total: 100});
    expect(events.observed).toBeTrue();
    expect(progress).toHaveBeenCalledWith(50);
    const body = {ok: true, advertencias: ['Nómina ignorada']};
    events.next(new HttpResponse({body}));
    expect(await result).toEqual(body as any);
    expect(events.observed).toBeFalse();
  });
});
