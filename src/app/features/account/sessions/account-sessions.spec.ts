import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { UserSession } from '../../../core/auth/mfa.models';
import { APP_CONFIG } from '../../../core/config/app-config';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AccountSessions, describeUserAgent } from './account-sessions';

const BASE = 'http://test/api';
const SESSIONS = `${BASE}/v1/auth/sessions`;

const CURRENT: UserSession = {
  id: 's-current',
  signed_in_at: '2026-11-10T08:00:00Z',
  last_used_at: '2026-11-16T08:00:00Z',
  expires_at: '2026-12-10T08:00:00Z',
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  ip: '10.0.0.1',
  mfa: true,
  mfa_method: 'totp',
  current: true,
};
const OTHER: UserSession = {
  ...CURRENT,
  id: 's-other',
  user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1',
  last_used_at: '2026-11-16T09:00:00Z',
  mfa: false,
  current: false,
};

async function setup() {
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AccountSessions, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: NotificationService, useValue: toasts },
    ],
  });
  const auth = TestBed.inject(AuthService);
  const endLocal = vi.spyOn(auth, 'endLocalSession').mockImplementation(() => undefined);
  const fixture = TestBed.createComponent(AccountSessions);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  const list = http.expectOne(SESSIONS);
  expect(list.request.withCredentials).toBe(true);
  list.flush([OTHER, CURRENT]);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const rows = () => [...root.querySelectorAll('[data-testid="session-row"]')];
  const revoke = async (id: string) => {
    root.querySelector<HTMLButtonElement>(`[data-testid="session-revoke-${id}"] button`)!.click();
    await fixture.whenStable();
    const confirm = [
      ...root.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
    ].find((b) => b.textContent?.includes('auth.sessions.revoke'))!;
    confirm.click();
    await fixture.whenStable();
  };
  return { fixture, http, toasts, endLocal, rows, revoke };
}

describe('AccountSessions', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists this device first with its badges and a readable device name', async () => {
    const { rows } = await setup();
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Chrome · Windows');
    expect(rows()[0].textContent).toContain('auth.sessions.current');
    expect(rows()[0].textContent).toContain('auth.sessions.verified');
    expect(rows()[1].textContent).toContain('Safari · iOS');
    expect(rows()[1].textContent).not.toContain('auth.sessions.verified');
  });

  it('signs out another device and drops it from the list', async () => {
    const { fixture, http, toasts, endLocal, rows, revoke } = await setup();
    await revoke('s-other');
    const req = http.expectOne(`${SESSIONS}/s-other`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(rows()).toHaveLength(1);
    expect(toasts.success).toHaveBeenCalledWith('auth.sessions.revokedToast');
    expect(endLocal).not.toHaveBeenCalled();
  });

  it('signing out this device ends the local session too', async () => {
    const { http, endLocal, revoke } = await setup();
    await revoke('s-current');
    http.expectOne(`${SESSIONS}/s-current`).flush(null, { status: 204, statusText: 'No Content' });
    expect(endLocal).toHaveBeenCalled();
  });

  it('reports a failure and reloads the list', async () => {
    const { fixture, http, toasts, revoke } = await setup();
    await revoke('s-other');
    http
      .expectOne(`${SESSIONS}/s-other`)
      .flush({ detail: { code: 'session_not_found' } }, { status: 404, statusText: 'x' });
    await fixture.whenStable();
    expect(toasts.error).toHaveBeenCalledWith('auth.sessions.revokeFailed');
    http.expectOne(SESSIONS).flush([CURRENT]);
  });
});

describe('describeUserAgent', () => {
  it('names common browsers and systems, or gives up', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/130.0',
      ),
    ).toBe('Firefox · macOS');
    expect(
      describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0'),
    ).toBe('Edge · Windows');
    expect(describeUserAgent('curl/8.0')).toBeNull();
    expect(describeUserAgent(null)).toBeNull();
  });
});
