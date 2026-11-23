import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [AppComponent],
      providers: [provideRouter([]), provideHttpClient()]}).compileComponents();
  });
  it('muestra la salida de rutas sin sidebar en login', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.isLoginPage.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-sidebar')).toBeNull();
  });
});
