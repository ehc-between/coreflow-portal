import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ForgotPassword, forgotPasswordErrorMessage } from './forgot-password';

function httpError(status: number, error: unknown = null, headers?: HttpHeaders) {
  return new HttpErrorResponse({ status, error, headers });
}

describe('forgotPasswordErrorMessage', () => {
  it('shows the wait time in seconds for short rate limits', () => {
    const err = httpError(429, { detail: { code: 'too_many_attempts', retry_after: 42 } });
    expect(forgotPasswordErrorMessage(err)).toEqual({
      key: 'auth.forgot.tooManyRequestsSeconds',
      params: { seconds: 42 },
    });
  });

  it('shows the wait time in minutes (rounded up), also from Retry-After', () => {
    const err = httpError(429, null, new HttpHeaders({ 'Retry-After': '600' }));
    expect(forgotPasswordErrorMessage(err)).toEqual({
      key: 'auth.forgot.tooManyRequestsMinutes',
      params: { minutes: 10 },
    });
  });

  it('falls back to a plain rate-limit message, and to generic for other errors', () => {
    expect(forgotPasswordErrorMessage(httpError(429))).toEqual({
      key: 'auth.forgot.tooManyRequests',
    });
    expect(forgotPasswordErrorMessage(httpError(500))).toEqual({ key: 'errors.generic' });
  });
});

describe('ForgotPassword', () => {
  it('shows the rate-limit message in place on a 429', () => {
    const result$ = new Subject<void>();
    TestBed.configureTestingModule({
      imports: [ForgotPassword, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { requestPasswordReset: vi.fn(() => result$) } },
        { provide: ThemeService, useValue: { theme: () => 'light', toggle: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ForgotPassword);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const email = el.querySelector<HTMLInputElement>('#forgot-email')!;
    email.value = 'a@example.com';
    email.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    result$.error(httpError(429, { detail: { code: 'too_many_attempts', retry_after: 30 } }));
    fixture.detectChanges();

    expect(el.textContent).toContain('auth.forgot.tooManyRequestsSeconds');
    expect(el.querySelector('form')).not.toBeNull();
  });
});
