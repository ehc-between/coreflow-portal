import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ResetPassword } from './reset-password';

const STRONG = 'correct-horse-battery';

function setup(token: string | null) {
  const result$ = new Subject<void>();
  const auth = { confirmPasswordReset: vi.fn(() => result$) };

  TestBed.configureTestingModule({
    imports: [ResetPassword, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: ThemeService, useValue: { theme: () => 'light', toggle: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
      },
    ],
  });

  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ResetPassword);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  function fill(password: string, confirm = password): void {
    for (const [id, value] of [
      ['reset-password-new', password],
      ['reset-password-confirm', confirm],
    ]) {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
    }
  }

  function submit(): void {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  return { fixture, el, auth, result$, navigate, fill, submit };
}

describe('ResetPassword', () => {
  it('shows the invalid-link state when the token is missing', () => {
    const { el } = setup(null);
    expect(el.textContent).toContain('auth.reset.invalidTitle');
    expect(el.querySelector('form')).toBeNull();
  });

  it('submits the token + new password and returns to login with a notice', () => {
    const { auth, result$, navigate, fill, submit } = setup('tkn');
    fill(STRONG);
    submit();
    expect(auth.confirmPasswordReset).toHaveBeenCalledWith('tkn', STRONG);
    result$.next();
    result$.complete();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { notice: 'passwordReset' } });
  });

  it('does not submit when the passwords do not match or are too short', () => {
    const { auth, el, fixture, fill, submit } = setup('tkn');
    fill(STRONG, `${STRONG}x`);
    submit();
    fixture.detectChanges();
    expect(auth.confirmPasswordReset).not.toHaveBeenCalled();
    expect(el.textContent).toContain('auth.password.mismatch');

    fill('short');
    submit();
    fixture.detectChanges();
    expect(auth.confirmPasswordReset).not.toHaveBeenCalled();
    expect(el.textContent).toContain('auth.password.tooShort');
  });

  it('switches to the invalid-link state on an invalid/expired token', () => {
    const { el, fixture, result$, fill, submit } = setup('tkn');
    fill(STRONG);
    submit();
    result$.error(
      new HttpErrorResponse({
        status: 400,
        error: { detail: { code: 'invalid_or_expired_token' } },
      }),
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('auth.reset.invalidBody');
    expect(el.querySelector('a[href="/forgot-password"]')).not.toBeNull();
  });

  it('shows the weak-password message on a 422', () => {
    const { el, fixture, result$, fill, submit } = setup('tkn');
    fill(STRONG);
    submit();
    result$.error(
      new HttpErrorResponse({
        status: 422,
        error: { detail: { code: 'weak_password', message: 'too common' } },
      }),
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('auth.password.weak');
  });
});
