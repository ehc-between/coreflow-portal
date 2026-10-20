import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { AuthSession } from './auth.models';
import { AuthService } from './auth.service';

const BASE = 'http://test/api';
const AUTH = `${BASE}/v1/auth`;

const SESSION: AuthSession = {
  access_token: 'tok',
  token_type: 'bearer',
  expires_in: 900,
  user: { id: 'u-1', email: 'ada@example.com', full_name: 'Ada', is_superuser: false, orgs: {} },
};

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let router: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigate: vi.fn(), navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: Router, useValue: router },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signIn(): void {
    auth.adoptSession(SESSION);
    expect(auth.isAuthenticated()).toBe(true);
  }

  it('logs in with credentials and suppresses the generic error toast', () => {
    auth.login('ada@example.com', 'pw').subscribe();
    const req = http.expectOne(`${AUTH}/login`);
    expect(req.request.body).toEqual({ email: 'ada@example.com', password: 'pw' });
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(SESSION);
    expect(auth.user()?.email).toBe('ada@example.com');
  });

  it('logout clears state and routes to /login', () => {
    signIn();
    auth.logout();
    const req = http.expectOne(`${AUTH}/logout`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ok: true });
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {});
  });

  it('logout still clears state when the request fails', () => {
    signIn();
    auth.logout();
    http.expectOne(`${AUTH}/logout`).flush(null, { status: 500, statusText: 'err' });
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {});
  });

  it('logoutAll clears state and routes to /login with a notice on success', () => {
    signIn();
    let done = false;
    auth.logoutAll().subscribe(() => (done = true));
    const req = http.expectOne(`${AUTH}/logout-all`);
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true });
    expect(done).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { notice: 'signedOutAll' },
    });
  });

  it('logoutAll keeps the session when the request fails', () => {
    signIn();
    let failed = false;
    auth.logoutAll().subscribe({ error: () => (failed = true) });
    http.expectOne(`${AUTH}/logout-all`).flush(null, { status: 500, statusText: 'err' });
    expect(failed).toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('changePassword posts old/new password', () => {
    auth.changePassword('old-pw', 'new-password-123').subscribe();
    const req = http.expectOne(`${AUTH}/change-password`);
    expect(req.request.body).toEqual({ old_password: 'old-pw', new_password: 'new-password-123' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('requestPasswordReset posts the email', () => {
    let done = false;
    auth.requestPasswordReset('ada@example.com').subscribe(() => (done = true));
    const req = http.expectOne(`${AUTH}/password-reset/request`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ada@example.com' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({}, { status: 202, statusText: 'Accepted' });
    expect(done).toBe(true);
  });

  it('confirmPasswordReset posts the token and new password', () => {
    let done = false;
    auth.confirmPasswordReset('tkn', 'new-password-123').subscribe(() => (done = true));
    const req = http.expectOne(`${AUTH}/password-reset/confirm`);
    expect(req.request.body).toEqual({ token: 'tkn', new_password: 'new-password-123' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });
});
