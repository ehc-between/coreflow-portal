import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { InvitationApi, InvitePreview } from '../../../core/admin/invitation-api';
import { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { PendingInvitation } from '../../../core/auth/pending-invitation';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { AcceptInvite, acceptInviteErrorMessage } from './accept-invite';

const PREVIEW: InvitePreview = {
  valid: true,
  email: 'new@example.com',
  org_name: 'Acme',
  role_key: 'member',
  user_exists: false,
};

const EXISTING: InvitePreview = { ...PREVIEW, email: 'victim@example.com', user_exists: true };

function user(email: string): AuthUser {
  return { id: 'u-1', email, full_name: '', is_superuser: false, orgs: {} };
}

interface SetupOptions {
  token?: string | null;
  signedInAs?: string | null;
  stashed?: string;
}

function setup({ token = 'inv-tkn', signedInAs = null, stashed }: SetupOptions = {}) {
  const preview$ = new Subject<InvitePreview>();
  const accept$ = new Subject<unknown>();
  const invitations = {
    getInvite: vi.fn(() => preview$),
    acceptInvite: vi.fn(() => accept$),
  };
  const authUser = signal<AuthUser | null>(signedInAs ? user(signedInAs) : null);
  const auth = {
    isAuthenticated: () => authUser() !== null,
    user: authUser.asReadonly(),
    adoptSession: vi.fn(),
    restoreSession: vi.fn(() => of(false)),
    refresh: vi.fn(() => of(true)),
    logout: vi.fn(),
  };
  const notifications = { success: vi.fn(), error: vi.fn() };
  const route = { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } };

  TestBed.configureTestingModule({
    imports: [AcceptInvite, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: InvitationApi, useValue: invitations },
      { provide: AuthService, useValue: auth },
      { provide: NotificationService, useValue: notifications },
      { provide: ThemeService, useValue: { theme: () => 'light', toggle: vi.fn() } },
      { provide: ActivatedRoute, useValue: route },
    ],
  });

  const pending = TestBed.inject(PendingInvitation);
  if (stashed) {
    pending.stash(stashed);
  }
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AcceptInvite);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el.querySelectorAll('button'));
  const button = (label: string) => buttons().find((b) => b.textContent?.includes(label));
  return {
    fixture,
    el,
    invitations,
    preview$,
    accept$,
    navigate,
    navigateByUrl,
    route,
    auth,
    pending,
    notifications,
    button,
  };
}

describe('AcceptInvite', () => {
  it('removes the token from the URL on load and keeps using it from memory', () => {
    const { el, fixture, invitations, preview$, navigate, route } = setup();

    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      queryParams: { token: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(invitations.getInvite).toHaveBeenCalledWith('inv-tkn');

    preview$.next(PREVIEW);
    fixture.detectChanges();

    const password = el.querySelector<HTMLInputElement>('#invite-password')!;
    password.value = 'correct-horse-battery';
    password.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(invitations.acceptInvite).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'inv-tkn', password: 'correct-horse-battery' }),
    );
  });

  it('shows the invalid-link state without a token (e.g. a reload after scrubbing)', () => {
    const { el, invitations, navigate } = setup({ token: null });
    expect(navigate).not.toHaveBeenCalled();
    expect(invitations.getInvite).not.toHaveBeenCalled();
    expect(el.textContent).toContain('invite.invalid.title');
  });

  describe('existing account', () => {
    it('signed out: offers no password form and never accepts on the token alone', () => {
      const { el, fixture, invitations, preview$, auth, button } = setup();
      preview$.next(EXISTING);
      fixture.detectChanges();

      // The startup session restore is resolved before deciding.
      expect(auth.restoreSession).toHaveBeenCalled();
      expect(el.textContent).toContain('invite.existing.body');
      expect(el.querySelector('#invite-password')).toBeNull();
      expect(button('invite.accept')).toBeUndefined();
      expect(invitations.acceptInvite).not.toHaveBeenCalled();
    });

    it('signed out: sign-in keeps the token in memory and returns to this page', () => {
      const { fixture, preview$, navigate, pending, button } = setup();
      preview$.next(EXISTING);
      fixture.detectChanges();
      navigate.mockClear();

      button('auth.action.signIn')!.click();

      expect(navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/invite/accept' },
      });
      // Not put back in the URL: only the in-memory stash carries it.
      expect(JSON.stringify(navigate.mock.calls)).not.toContain('inv-tkn');
      expect(pending.take()).toBe('inv-tkn');
    });

    it('after signing in as the invited account: accepts with the session, not a password', () => {
      const {
        el,
        fixture,
        invitations,
        preview$,
        accept$,
        auth,
        navigateByUrl,
        notifications,
        button,
      } = setup({ token: null, stashed: 'inv-tkn', signedInAs: 'Victim@Example.com' });

      expect(invitations.getInvite).toHaveBeenCalledWith('inv-tkn');
      preview$.next(EXISTING);
      fixture.detectChanges();
      expect(el.textContent).toContain('invite.existing.signedIn');

      button('invite.accept')!.click();
      expect(invitations.acceptInvite).toHaveBeenCalledWith({ token: 'inv-tkn' });

      accept$.next({ ok: true, requires_login: false });
      // Session refreshed so the new org's membership is picked up.
      expect(auth.refresh).toHaveBeenCalled();
      expect(notifications.success).toHaveBeenCalledWith('invite.joinedToast', { org: 'Acme' });
      expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('signed in as a different account (the inviter): refuses to accept and offers a switch', () => {
      const { el, fixture, invitations, preview$, auth, pending, button } = setup({
        signedInAs: 'attacker@example.com',
      });
      preview$.next(EXISTING);
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="invite-mismatch"]')).not.toBeNull();
      expect(button('invite.accept')).toBeUndefined();
      expect(invitations.acceptInvite).not.toHaveBeenCalled();

      button('invite.switchAccount')!.click();
      expect(auth.logout).toHaveBeenCalledWith('/invite/accept');
      expect(pending.take()).toBe('inv-tkn');
    });

    it('shows the mismatch when the server refuses with invitation_email_mismatch', () => {
      const { el, fixture, preview$, accept$, navigateByUrl, button } = setup({
        signedInAs: 'victim@example.com',
      });
      preview$.next(EXISTING);
      fixture.detectChanges();

      button('invite.accept')!.click();
      accept$.error(
        new HttpErrorResponse({
          status: 403,
          error: { detail: { code: 'invitation_email_mismatch', message: 'x' } },
        }),
      );
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="invite-mismatch"]')).not.toBeNull();
      expect(button('invite.accept')).toBeUndefined();
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('shows "temporarily unavailable" when the limiter is down during an existing-account accept', () => {
      const { el, fixture, preview$, accept$, navigateByUrl, button } = setup({
        signedInAs: 'victim@example.com',
      });
      preview$.next(EXISTING);
      fixture.detectChanges();

      button('invite.accept')!.click();
      accept$.error(
        new HttpErrorResponse({
          status: 503,
          error: { detail: { code: 'rate_limiter_unavailable', retry_after: 30 } },
        }),
      );
      fixture.detectChanges();

      expect(el.textContent).toContain('errors.temporarilyUnavailableSeconds');
      expect(el.querySelector('[data-testid="invite-mismatch"]')).toBeNull();
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('sends the user to sign in when the server answers requires_login', () => {
      const { fixture, preview$, accept$, navigate, auth, button } = setup({
        signedInAs: 'victim@example.com',
      });
      preview$.next(EXISTING);
      fixture.detectChanges();
      navigate.mockClear();

      button('invite.accept')!.click();
      accept$.next({ ok: false, requires_login: true });

      expect(auth.refresh).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/invite/accept' },
      });
    });
  });
});

describe('acceptInviteErrorMessage', () => {
  const httpError = (status: number, error: unknown = null) =>
    new HttpErrorResponse({ status, error });

  it('shows "temporarily unavailable" when the limiter backend is down (503)', () => {
    const err = httpError(503, { detail: { code: 'rate_limiter_unavailable', retry_after: 30 } });
    expect(acceptInviteErrorMessage(err)).toEqual({
      key: 'errors.temporarilyUnavailableSeconds',
      params: { seconds: 30 },
    });
  });

  it('shows the generic "slow down" message for any 429', () => {
    expect(acceptInviteErrorMessage(httpError(429, { detail: { code: 'rate_limited' } }))).toEqual({
      key: 'errors.rateLimited',
    });
    expect(
      acceptInviteErrorMessage(
        httpError(429, { detail: { code: 'too_many_attempts', retry_after: 90 } }),
      ),
    ).toEqual({ key: 'errors.rateLimitedMinutes', params: { minutes: 2 } });
  });

  it('keeps the weak-password and generic invite messages', () => {
    expect(acceptInviteErrorMessage(httpError(422, { detail: { code: 'weak_password' } }))).toEqual(
      {
        key: 'auth.password.weak',
      },
    );
    expect(acceptInviteErrorMessage(httpError(500))).toEqual({ key: 'invite.error' });
  });
});
