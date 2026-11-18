import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { UxMetricsApi } from './ux-metrics-api';

describe('UxMetricsApi', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api' } },
      ],
    });
    return { api: TestBed.inject(UxMetricsApi), http: TestBed.inject(HttpTestingController) };
  }

  it('posts a batch quietly, with only the contract keys', () => {
    const { api, http } = setup();
    const events = [{ source: 'nav' as const, target: '/risk', from_path: '/dashboard', count: 2 }];
    api.record('o 1', events).subscribe();
    const req = http.expectOne('http://api/v1/orgs/o%201/ux-events');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ events });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ accepted: 1, enabled: true });
    http.verify();
  });

  it('reads the summary with days and limit', () => {
    const { api, http } = setup();
    api.summary('o1', 7, 20).subscribe();
    const req = http.expectOne((r) => r.url === 'http://api/v1/orgs/o1/ux-events/summary');
    expect(req.request.params.get('days')).toBe('7');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({});
    http.verify();
  });
});
