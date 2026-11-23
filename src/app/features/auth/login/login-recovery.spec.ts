import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { of, Subject, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { ChangePasswordRequiredComponent } from '../change-password-required/change-password-required.component';
import { AuthService } from '../../../core/services/auth.service';
import { MiPerfilComponent } from '../../perfil/mi-perfil/mi-perfil.component';

describe('Formularios de recuperación y cambio de contraseña', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let auth: jasmine.SpyObj<AuthService>;
  let originalStorage: Array<[string, string | null]>;
  beforeEach(async () => {
    originalStorage = ['login_credentials', 'login_username'].map(key => [key, localStorage.getItem(key)]);
    originalStorage.forEach(([key]) => localStorage.removeItem(key));
    auth = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'getCurrentUser', 'login', 'requestPasswordRecovery', 'resetPasswordWithCode', 'changePassword', 'logout', 'clearError']);
    (auth as AuthService).requirePasswordChange = signal(false);
    auth.isAuthenticated.and.returnValue(false);
    auth.getCurrentUser.and.returnValue({ userId: 123, username: 'otp-test', email: 'otp-test@example.invalid', roles: [] });
    auth.requestPasswordRecovery.and.returnValue(of({ success: true, message: 'Solicitud aceptada.' }));
    auth.resetPasswordWithCode.and.returnValue(of({ success: true, message: 'Contraseña actualizada.' }));
    auth.changePassword.and.returnValue(of('Contraseña actualizada.'));
    auth.login.and.returnValue(of({ userId: 123, username: 'otp-test', email: 'otp-test@example.invalid', roles: [] }));
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [{ provide: AuthService, useValue: auth }, { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) }]
    }).compileComponents();
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  });
  afterEach(() => {
    fixture.destroy();
    originalStorage.forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
  });

  const populate = (component: LoginComponent, code = '012345', password = 'NuevaClave1') => {
    component.recoveryCodeForm.setValue({ code, newPassword: password, confirmPassword: password });
  };
  const request = (component: LoginComponent) => {
    component.openRecoveryForm();
    component.recoveryPasswordForm.setValue({ email: ' otp-test@example.invalid ' });
    component.requestRecoveryCode();
  };

  it('solicita por correo normalizado y muestra aceptación condicional inmediatamente', () => {
    request(component);
    expect(auth.requestPasswordRecovery).toHaveBeenCalledOnceWith('otp-test@example.invalid');
    expect(component.showRecoveryCodeForm()).toBeTrue();
    expect(component.recoverySuccess()).toContain('Si el correo corresponde');
    expect(component.recoveryCooldown()).toBe(60);
  });

  it('impide solicitudes simultáneas y cierre antes de la respuesta', () => {
    const response = new Subject<any>();
    auth.requestPasswordRecovery.and.returnValue(response);
    request(component);
    component.requestRecoveryCode();
    component.closeRecoveryForm();
    expect(auth.requestPasswordRecovery).toHaveBeenCalledTimes(1);
    expect(component.showRecoveryForm()).toBeTrue();
    response.next({ success: true, message: 'Solicitud recibida.' });
    expect(component.showRecoveryCodeForm()).toBeTrue();
  });

  it('no permite confirmar sin solicitud previa aunque los controles sean válidos', () => {
    populate(component);
    component.resetPassword();
    expect(auth.resetPasswordWithCode).not.toHaveBeenCalled();
  });

  for (const code of ['', '12345', '1234567', '12AB56', 'aa-bb-cc-uuid']) {
    it(`no envía el código mal formado ${code || '(vacío)'}`, () => {
      request(component);
      populate(component, code);
      component.resetPassword();
      expect(auth.resetPasswordWithCode).not.toHaveBeenCalled();
    });
  }

  for (const password of ['Abc1', 'abcdefghi1', 'ABCDEFGHI1', 'Abcdefghij', 'Abcdefg1' + 'é'.repeat(33)]) {
    it(`impide confirmar contraseña que incumple política (longitud ${password.length})`, () => {
      request(component);
      populate(component, '012345', password);
      component.resetPassword();
      expect(auth.resetPasswordWithCode).not.toHaveBeenCalled();
    });
  }

  it('rechaza confirmación distinta antes de llamar al backend', () => {
    request(component);
    populate(component);
    component.recoveryCodeForm.patchValue({ confirmPassword: 'OtraClave1' });
    component.resetPassword();
    expect(auth.resetPasswordWithCode).not.toHaveBeenCalled();
  });

  it('confirma OTP con email y limpia secretos al finalizar, sin permitir reutilización local', () => {
    request(component);
    populate(component, '012345', ' NuevaClave1 ');
    component.resetPassword();
    expect(auth.resetPasswordWithCode).toHaveBeenCalledOnceWith('otp-test@example.invalid', '012345', ' NuevaClave1 ', ' NuevaClave1 ');
    expect(component.showRecoveryForm()).toBeFalse();
    expect(component.recoveryEmail()).toBe('');
    expect(component.recoveryCodeForm.get('code')?.value).toBeNull();
    expect(component.recoveryCodeForm.get('newPassword')?.value).toBeNull();
    expect(component.recoverySuccess()).toContain('Inicia sesión');
    component.resetPassword();
    expect(auth.resetPasswordWithCode).toHaveBeenCalledTimes(1);
  });

  for (const condition of ['incorrecto', 'expirado', 'consumido']) {
    it(`mantiene formulario con mensaje seguro si backend rechaza código ${condition}`, () => {
      request(component);
      populate(component);
      auth.resetPasswordWithCode.and.returnValue(throwError(() => ({status: 400, error: {errorDetails: 'SECRETO_INTERNO', message: 'No exponer correo real'}})));
      component.resetPassword();
      expect(component.showRecoveryCodeForm()).toBeTrue();
      expect(component.recoveryLoading()).toBeFalse();
      expect(component.recoveryError()).toContain('No se pudo validar el código');
      expect(component.recoveryError()).not.toContain('SECRETO_INTERNO');
      expect(component.recoveryError()).not.toContain('correo real');
      expect(component.recoverySuccess()).toBe('');
    });
  }

  it('reenviar respeta cooldown y borra código/password anteriores', () => {
    request(component);
    populate(component);
    component.requestRecoveryCode();
    expect(auth.requestPasswordRecovery).toHaveBeenCalledTimes(1);
    component.recoveryCooldown.set(0);
    component.requestRecoveryCode();
    expect(auth.requestPasswordRecovery).toHaveBeenCalledTimes(2);
    expect(component.recoveryCodeForm.get('code')?.value).toBeNull();
    expect(component.recoveryCodeForm.get('newPassword')?.value).toBeNull();
  });

  it('no conserva estado si la solicitud falla ni expone detalles del proveedor', () => {
    auth.requestPasswordRecovery.and.returnValue(throwError(() => ({status: 503, error: {errorDetails: 'SMTP SECRET'}})));
    request(component);
    expect(component.showRecoveryCodeForm()).toBeFalse();
    expect(component.recoveryLoading()).toBeFalse();
    expect(component.recoveryError()).toContain('temporalmente');
    expect(component.recoveryError()).not.toContain('SMTP SECRET');
  });

  it('cambiar correo elimina el contexto y exige nueva solicitud', () => {
    request(component);
    populate(component);
    component.backToEmailStep();
    populate(component);
    component.resetPassword();
    expect(component.recoveryEmail()).toBe('');
    expect(auth.resetPasswordWithCode).not.toHaveBeenCalled();
  });

  it('cambio forzado en login envía contraseña actual y confirmación originales', () => {
    component.changePasswordForm.setValue({currentPassword: ' Actual1 ', newPassword: ' NuevaClave1 ', confirmPassword: ' NuevaClave1 '});
    component.onChangePassword();
    expect(auth.changePassword).toHaveBeenCalledOnceWith(123, ' Actual1 ', ' NuevaClave1 ', ' NuevaClave1 ');
    expect(auth.logout).toHaveBeenCalled();
    expect(component.changePasswordForm.get('currentPassword')?.value).toBeNull();
  });

  it('pantalla independiente de cambio forzado exige la contraseña actual', () => {
    const change = new ChangePasswordRequiredComponent(TestBed.inject(FormBuilder), auth, TestBed.inject(Router));
    change.ngOnInit();
    change.changePasswordForm.setValue({currentPassword: ' Actual1 ', newPassword: 'NuevaClave1', confirmPassword: 'NuevaClave1'});
    change.onSubmit();
    expect(auth.changePassword).toHaveBeenCalledOnceWith(123, ' Actual1 ', 'NuevaClave1', 'NuevaClave1');
    expect(auth.logout).toHaveBeenCalled();
  });

  it('recordar usuario conserva únicamente nombre y nunca contraseña', () => {
    component.loginForm.setValue({username: 'otp-test', password: ' NuevaClave1 ', rememberMe: true});
    component.onLogin();
    expect(localStorage.getItem('login_username')).toBe('otp-test');
    expect(localStorage.getItem('login_credentials')).toBeNull();
    expect(auth.login).toHaveBeenCalledWith({username: 'otp-test', password: ' NuevaClave1 '});
  });

  it('Mi Perfil prueba la contraseña actual exacta y borra secretos al completar', () => {
    const profile = new MiPerfilComponent(auth, {} as any, {mostrar: jasmine.createSpy('mostrar')} as any, TestBed.inject(Router), {} as any);
    profile.claveActual.set(' Actual1 ');
    profile.claveNueva.set(' NuevaClave1 ');
    profile.claveConfirmar.set(' NuevaClave1 ');
    profile.cambiarClave();
    expect(auth.changePassword).toHaveBeenCalledOnceWith(123, ' Actual1 ', ' NuevaClave1 ', ' NuevaClave1 ');
    expect(profile.claveActual()).toBe('');
    expect(profile.claveNueva()).toBe('');
    expect(auth.logout).toHaveBeenCalled();
  });

  it('purga contraseñas legacy guardadas en btoa sin rellenarlas', () => {
    fixture.destroy();
    localStorage.setItem('login_credentials', btoa(JSON.stringify({username: 'legacy-test', password: 'ClaveLegacy1'})));
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    expect(localStorage.getItem('login_credentials')).toBeNull();
    expect(component.loginForm.get('password')?.value).toBe('');
  });
});
