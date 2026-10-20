import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { APP_CONFIG } from '../config/app-config';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const BASE = 'http://test/api';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
      ],
    });
    TestBed.inject(AuthService).adoptSession({
      access_token: 'tok',
      token_type: 'bearer',
      expires_in: 900,
      user: { id: 'u', email: 'e@x.no', full_name: 'E', is_superuser: false, orgs: {} },
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function authHeaderFor(path: string): string | null {
    client.post(`${BASE}${path}`, null).subscribe();
    const req = http.expectOne(`${BASE}${path}`);
    const header = req.request.headers.get('Authorization');
    req.flush({});
    return header;
  }

  it('attaches the bearer to logout-all (not mistaken for logout)', () => {
    expect(authHeaderFor('/v1/auth/logout-all')).toBe('Bearer tok');
    expect(authHeaderFor('/v1/auth/change-password')).toBe('Bearer tok');
  });

  it('leaves session-managing and public auth endpoints untouched', () => {
    expect(authHeaderFor('/v1/auth/logout')).toBeNull();
    expect(authHeaderFor('/v1/auth/login')).toBeNull();
    expect(authHeaderFor('/v1/auth/password-reset/request')).toBeNull();
    expect(authHeaderFor('/v1/auth/password-reset/confirm')).toBeNull();
  });
});
