import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { InvitationApi, InvitePreview } from '../../../core/admin/invitation-api';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { AcceptInvite, acceptInviteErrorMessage } from './accept-invite';

const PREVIEW: InvitePreview = {
  valid: true,
  email: 'new@example.com',
  org_name: 'Acme',
  role_key: 'member',
  user_exists: false,
};

function setup(token: string | null) {
  const preview$ = new Subject<InvitePreview>();
  const accept$ = new Subject<unknown>();
  const invitations = {
    getInvite: vi.fn(() => preview$),
    acceptInvite: vi.fn(() => accept$),
  };
  const route = { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } };

  TestBed.configureTestingModule({
    imports: [AcceptInvite, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: InvitationApi, useValue: invitations },
      { provide: AuthService, useValue: { adoptSession: vi.fn() } },
      { provide: ThemeService, useValue: { theme: () => 'light', toggle: vi.fn() } },
      { provide: ActivatedRoute, useValue: route },
    ],
  });

  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AcceptInvite);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, invitations, preview$, navigate, route };
}

describe('AcceptInvite', () => {
  it('removes the token from the URL on load and keeps using it from memory', () => {
    const { el, fixture, invitations, preview$, navigate, route } = setup('inv-tkn');

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
    const { el, invitations, navigate } = setup(null);
    expect(navigate).not.toHaveBeenCalled();
    expect(invitations.getInvite).not.toHaveBeenCalled();
    expect(el.textContent).toContain('invite.invalid.title');
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
