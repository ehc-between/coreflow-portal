import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from '../notifications/notification.service';
import { SKIP_ERROR_TOAST, errorInterceptor, httpErrorMessageKey } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let notify: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    notify = vi.spyOn(TestBed.inject(NotificationService), 'error');
  });

  afterEach(() => controller.verify());

  function fail(
    status: number,
    body: object | null,
    headers: Record<string, string> = {},
    context?: HttpContext,
  ): void {
    http.get('/api/v1/x', { context }).subscribe({ error: () => undefined });
    controller.expectOne('/api/v1/x').flush(body, { status, statusText: 'x', headers });
  }

  it('toasts a "slow down" message with the wait time on a per-user 429', () => {
    fail(429, { detail: { code: 'rate_limited', retry_after: 42 } }, { 'Retry-After': '42' });
    expect(notify).toHaveBeenCalledWith('errors.rateLimitedSeconds', { seconds: 42 });
  });

  it('uses the Retry-After header when the 429 body has no wait', () => {
    fail(429, null, { 'Retry-After': '600' });
    expect(notify).toHaveBeenCalledWith('errors.rateLimitedMinutes', { minutes: 10 });
  });

  it('toasts "temporarily unavailable" for a coded limiter 503', () => {
    fail(503, { detail: { code: 'rate_limiter_unavailable', retry_after: 30 } });
    expect(notify).toHaveBeenCalledWith('errors.temporarilyUnavailableSeconds', { seconds: 30 });
  });

  it('keeps the neutral messages for other failures', () => {
    fail(500, null);
    expect(notify).toHaveBeenLastCalledWith('errors.server');
    fail(404, null);
    expect(notify).toHaveBeenLastCalledWith('errors.notFound');
  });

  it('stays quiet for opted-out requests and auth statuses', () => {
    fail(
      429,
      { detail: { code: 'rate_limited' } },
      {},
      new HttpContext().set(SKIP_ERROR_TOAST, true),
    );
    fail(401, null);
    expect(notify).not.toHaveBeenCalled();
  });

  it('maps 429 to the slow-down key for in-place callers', () => {
    expect(httpErrorMessageKey(429)).toBe('errors.rateLimited');
  });
});
