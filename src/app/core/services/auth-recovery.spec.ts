import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';
import { passwordPolicyErrors, passwordOperationError } from './password-policy';

describe('Recuperación: contrato HTTP y secretos', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let previousUser: string | null;
  const base = `${environment.apiUrl}/auth`;
  beforeEach(() => {
    previousUser = localStorage.getItem('currentUser');
    localStorage.removeItem('currentUser');
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) }]
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    if (previousUser === null) localStorage.removeItem('currentUser');
    else localStorage.setItem('currentUser', previousUser);
  });

  for (const email of ['otp-test@example.invalid', 'unregistered@example.invalid']) {
    it(`acepta HTTP202 sin distinguir existencia de cuenta (${email})`, () => {
      let accepted = false;
      auth.requestPasswordRecovery(` ${email} `).subscribe(response => accepted = response.success);
      const req = http.expectOne(`${base}/request-password-reset`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email });
      req.flush({ success: true, message: 'Solicitud recibida.' }, { status: 202, statusText: 'Accepted' });
      expect(accepted).toBeTrue();
    });
  }

  it('vincula OTP al correo y preserva contraseña y confirmación exactas', () => {
    const logout = spyOn(auth, 'logout');
    const password = ' NuevaClave1 ';
    auth.resetPasswordWithCode('otp-test@example.invalid', '012345', password, password).subscribe();
    const req = http.expectOne(`${base}/confirm-password-reset`);
    expect(req.request.body).toEqual({ email: 'otp-test@example.invalid', token: '012345', newPassword: password, confirmPassword: password });
    req.flush({ success: true, message: 'Contraseña actualizada.' });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('no anuncia éxito ni cierra sesión con success:false', () => {
    const logout = spyOn(auth, 'logout');
    const failure = jasmine.createSpy('failure');
    auth.resetPasswordWithCode('otp-test@example.invalid', '012345', 'NuevaClave1', 'NuevaClave1')
      .subscribe({ next: () => fail('No debe aceptar success:false'), error: failure });
    http.expectOne(`${base}/confirm-password-reset`).flush({ success: false, message: 'No completado.' });
    expect(failure).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('rechaza solicitud aceptada con cuerpo incompleto', () => {
    const failure = jasmine.createSpy('failure');
    auth.requestPasswordRecovery('otp-test@example.invalid').subscribe({ next: () => fail('Respuesta inválida'), error: failure });
    http.expectOne(`${base}/request-password-reset`).flush({ message: 'Sin resultado' });
    expect(failure).toHaveBeenCalled();
  });

  it('no registra OTP, contraseñas, respuestas ni errores HTTP', () => {
    const log = spyOn(console, 'log');
    const error = spyOn(console, 'error');
    auth.resetPasswordWithCode('otp-test@example.invalid', '012345', 'NuevaClave1', 'NuevaClave1').subscribe({ error: () => {} });
    http.expectOne(`${base}/confirm-password-reset`).flush({ errorDetails: 'No mostrar detalles' }, { status: 400, statusText: 'Bad Request' });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('envía la contraseña actual como prueba y la confirmación original', () => {
    auth.changePassword(123, ' Actual1 ', 'NuevaClave1', 'Distinta1').subscribe();
    const req = http.expectOne(`${base}/change-password`);
    expect(req.request.body).toEqual({ userId: 123, currentPassword: ' Actual1 ', newPassword: 'NuevaClave1', confirmPassword: 'Distinta1' });
    req.flush('Contraseña actualizada.');
  });

  it('login preserva espacios de la contraseña recién establecida', () => {
    auth.login({ username: ' otp-test ', password: ' NuevaClave1 ' }).subscribe({ error: () => {} });
    const req = http.expectOne(`${base}/login`);
    expect(req.request.body).toEqual({ username: 'otp-test', password: ' NuevaClave1 ' });
    req.flush({ message: 'Acceso rechazado' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('comprueba complejidad, longitud y límite UTF8 de BCrypt', () => {
    expect(passwordPolicyErrors('Clave12')).not.toBeNull();
    expect(passwordPolicyErrors('solominusculas1')).not.toBeNull();
    expect(passwordPolicyErrors('NuevaClave1')).toBeNull();
    expect(passwordPolicyErrors('Abcdefg1' + 'é'.repeat(32))).toBeNull();
    expect(passwordPolicyErrors('Abcdefg1' + 'é'.repeat(33))?.['maxBytes']).toBeTrue();
  });

  it('traduce indisponibilidad/red/límite sin mostrar datos del servidor', () => {
    expect(passwordOperationError({status: 0})).toContain('conectar');
    expect(passwordOperationError({status: 429})).toContain('Espera un minuto');
    expect(passwordOperationError({status: 503})).toContain('temporalmente');
    expect(passwordOperationError({status: 400}, 'recovery')).toContain('incorrecto');
  });
});
