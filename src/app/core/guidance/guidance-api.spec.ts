import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { GuidanceApi } from './guidance-api';

const BASE = 'http://api.test/api';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
    ],
  });
  return { api: TestBed.inject(GuidanceApi), http: TestBed.inject(HttpTestingController) };
}

describe('GuidanceApi', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads and writes the personal preferences (quietly, scoped to an org)', () => {
    const { api, http } = setup();
    api.getPreferences('org-1').subscribe();
    const get = http.expectOne(`${BASE}/v1/me/preferences?org_id=org-1`);
    expect(get.request.method).toBe('GET');
    expect(get.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    get.flush({ guidance_level: null, org_default: 'standard', effective: 'standard' });

    api.updatePreferences(null).subscribe();
    const put = http.expectOne(`${BASE}/v1/me/preferences`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ guidance_level: null });
    put.flush({ guidance_level: null, org_default: 'standard', effective: 'standard' });
  });

  it('reads and writes the org default', () => {
    const { api, http } = setup();
    api.getOrgGuidance('org-1').subscribe();
    http.expectOne(`${BASE}/v1/orgs/org-1/guidance`).flush({ default_level: 'standard' });
    api.updateOrgGuidance('org-1', 'beginner').subscribe();
    const put = http.expectOne(`${BASE}/v1/orgs/org-1/guidance`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ default_level: 'beginner' });
    put.flush({ default_level: 'beginner' });
  });

  it('lists, records and summarises learning progress', () => {
    const { api, http } = setup();
    api.listProgress('org-1', { module: 'platform', userId: 'u-2' }).subscribe();
    http
      .expectOne(`${BASE}/v1/orgs/org-1/learning/progress?module=platform&user_id=u-2`)
      .flush({ items: [] });

    api
      .recordProgress('org-1', {
        module: 'platform',
        lesson_key: 'platform.getting-started',
        event: 'quiz',
        score: 100,
        passed: true,
      })
      .subscribe();
    const post = http.expectOne(`${BASE}/v1/orgs/org-1/learning/progress`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      module: 'platform',
      lesson_key: 'platform.getting-started',
      event: 'quiz',
      score: 100,
      passed: true,
    });
    post.flush({});

    api.summary('org-1').subscribe();
    http.expectOne(`${BASE}/v1/orgs/org-1/learning/summary`).flush({ items: [] });
  });
});
