import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ChangePassword, changePasswordErrorKey } from './change-password';

const STRONG = 'correct-horse-battery';

describe('changePasswordErrorKey', () => {
  it('maps a wrong current password (400)', () => {
    const err = new HttpErrorResponse({ status: 400, error: { detail: 'incorrect' } });
    expect(changePasswordErrorKey(err)).toBe('auth.changePassword.wrongCurrent');
  });

  it('maps a weak new password (422)', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'weak_password' } },
    });
    expect(changePasswordErrorKey(err)).toBe('auth.password.weak');
  });

  it('falls back to the generic message', () => {
    expect(changePasswordErrorKey(new HttpErrorResponse({ status: 500 }))).toBe('errors.generic');
  });
});

describe('ChangePassword', () => {
  function setup() {
    const result$ = new Subject<void>();
    const auth = { changePassword: vi.fn(() => result$) };
    const notifications = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ChangePassword, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: auth },
        { provide: NotificationService, useValue: notifications },
      ],
    });
    const fixture = TestBed.createComponent(ChangePassword);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const set = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('change-password-current', 'old-password');
    set('change-password-new', STRONG);
    set('change-password-confirm', STRONG);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    return { fixture, el, auth, notifications, result$ };
  }

  it('submits current + new password and confirms success', () => {
    const { auth, notifications, result$ } = setup();
    expect(auth.changePassword).toHaveBeenCalledWith('old-password', STRONG);
    result$.next();
    result$.complete();
    expect(notifications.success).toHaveBeenCalledWith('auth.changePassword.success');
  });

  it('shows the wrong-current-password message in place', () => {
    const { el, fixture, result$ } = setup();
    result$.error(new HttpErrorResponse({ status: 400, error: { detail: 'incorrect' } }));
    fixture.detectChanges();
    expect(el.textContent).toContain('auth.changePassword.wrongCurrent');
  });
});
