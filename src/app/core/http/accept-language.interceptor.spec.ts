import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { APP_CONFIG } from '../config/app-config';
import { acceptLanguageInterceptor } from './accept-language.interceptor';

function setup(lang: string) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([acceptLanguageInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test/api' } },
      { provide: TranslocoService, useValue: { getActiveLang: () => lang } },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    ctrl: TestBed.inject(HttpTestingController),
  };
}

describe('acceptLanguageInterceptor', () => {
  it('sends the active UI language to the API', () => {
    const { http, ctrl } = setup('nb');
    http.get('http://api.test/api/v1/orgs/o/ai-governance/overview').subscribe();
    const req = ctrl.expectOne('http://api.test/api/v1/orgs/o/ai-governance/overview');
    expect(req.request.headers.get('Accept-Language')).toBe('nb');
    req.flush({});
  });

  it('leaves other hosts and explicit headers alone', () => {
    const { http, ctrl } = setup('nb');
    http.get('/assets/i18n/en.json').subscribe();
    http.get('http://api.test/api/v1/x', { headers: { 'Accept-Language': 'en' } }).subscribe();
    expect(ctrl.expectOne('/assets/i18n/en.json').request.headers.has('Accept-Language')).toBe(
      false,
    );
    expect(ctrl.expectOne('http://api.test/api/v1/x').request.headers.get('Accept-Language')).toBe(
      'en',
    );
    ctrl.verify();
  });
});
