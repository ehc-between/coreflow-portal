import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { AdminApi } from './admin-api';

const BASE = 'http://test/api';

describe('AdminApi.resetUserMfa', () => {
  it('posts the reset for the user and handles errors in place', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    let done = false;
    TestBed.inject(AdminApi)
      .resetUserMfa('u-9')
      .subscribe(() => (done = true));
    const req = http.expectOne(`${BASE}/v1/admin/users/u-9/mfa/reset`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
    http.verify();
  });
});
