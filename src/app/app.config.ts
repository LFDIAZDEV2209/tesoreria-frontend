// app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { routes } from './app.routes';

// 👇 Import de ng2-charts
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { RequestHeaderInterceptor } from './core/interceptors/request-header.interceptor';
import { GpAuthInterceptor } from './core/interceptors/gp-auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    // 👇 Interceptor personalizado que agrega headers
    { provide: HTTP_INTERCEPTORS, useClass: RequestHeaderInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: GpAuthInterceptor, multi: true },
    // 👇 Registro global de Chart.js + ng2-charts
    provideCharts(withDefaultRegisterables()),
  ]
};