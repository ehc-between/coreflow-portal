import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { LocationsApi } from './locations-api';
import { LocationsService } from './locations.service';

const BASE = 'http://test/api';
const ROOT = `${BASE}/v1/orgs/org-1`;

describe('LocationsApi', () => {
  let api: LocationsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(LocationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads where a requirement is filled in, quietly (no error toast)', () => {
    api.forRequirement('org-1', 'iso9001-2026:4.2.r1', 'nb').subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/requirement-locations`);
    expect(req.request.params.get('ref')).toBe('iso9001-2026:4.2.r1');
    expect(req.request.params.get('lang')).toBe('nb');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});
  });

  it('evaluates in bulk or previews an override', () => {
    api
      .evaluate(
        'org-1',
        { preview: { target_ref: 'r', location_key: 'k', rules: [{ kind: 'has_entries' }] } },
        'en',
      )
      .subscribe();
    const req = http.expectOne(`${ROOT}/requirement-locations/evaluate?lang=en`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.preview.location_key).toBe('k');
    req.flush({ items: {} });
  });

  it('reads the vocabulary, what a place fulfils and the entity-type index', () => {
    api.vocabulary('org-1', 'en', { module: 'context' }).subscribe();
    http.expectOne(`${ROOT}/locations?module=context&lang=en`).flush([]);
    api.requirementsOf('org-1', 'context.interested_parties', 'nb').subscribe();
    http.expectOne(`${ROOT}/locations/context.interested_parties/requirements?lang=nb`).flush({});
    api.byEntityType('org-1', ['risk', 'interested_party']).subscribe();
    http
      .expectOne(`${ROOT}/locations/requirements-by-entity-type?types=risk,interested_party`)
      .flush({});
  });

  it('creates, updates and retires overrides', () => {
    api
      .createOverride('org-1', {
        target_ref: 'iso9001-2026:4.2.r3',
        location_key: 'context.interested_parties',
        action: 'disable',
        justification: 'Eget dokument',
      })
      .subscribe();
    const create = http.expectOne(`${ROOT}/requirement-locations/overrides`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.action).toBe('disable');
    create.flush({});
    api.updateOverride('org-1', 'ov-1', { justification: 'x', rules: [] }).subscribe();
    expect(http.expectOne(`${ROOT}/requirement-locations/overrides/ov-1`).request.method).toBe(
      'PATCH',
    );
    api.deleteOverride('org-1', 'ov-1').subscribe();
    expect(http.expectOne(`${ROOT}/requirement-locations/overrides/ov-1`).request.method).toBe(
      'DELETE',
    );
  });
});

describe('LocationsService', () => {
  let service: LocationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    service = TestBed.inject(LocationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shares one request per place, and drops the cache on invalidate', () => {
    const key = 'context.interested_parties';
    service.requirementsOf('org-1', key, 'nb').subscribe();
    service.requirementsOf('org-1', key, 'nb').subscribe();
    http.expectOne(`${ROOT}/locations/${key}/requirements?lang=nb`).flush({ items: [] });
    service.requirementsOf('org-1', key, 'nb').subscribe();
    http.expectNone(`${ROOT}/locations/${key}/requirements?lang=nb`);
    const before = service.version();
    service.invalidate();
    expect(service.version()).toBe(before + 1);
    service.requirementsOf('org-1', key, 'nb').subscribe();
    http.expectOne(`${ROOT}/locations/${key}/requirements?lang=nb`).flush({ items: [] });
  });

  it('keeps the cache on query-only navigation and drops it on a new page', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/context/interested-parties');
    service.vocabulary('org-1', 'en').subscribe();
    http.expectOne(`${ROOT}/locations?lang=en`).flush([]);
    await router.navigateByUrl('/context/interested-parties?status=active');
    service.vocabulary('org-1', 'en').subscribe();
    http.expectNone(`${ROOT}/locations?lang=en`);
    await router.navigateByUrl('/processes');
    service.vocabulary('org-1', 'en').subscribe();
    http.expectOne(`${ROOT}/locations?lang=en`).flush([]);
  });

  it('turns failures into empty results', () => {
    let result: unknown = 'unset';
    service.requirementsOf('org-1', 'x.y', 'en').subscribe((r) => (result = r));
    http
      .expectOne(`${ROOT}/locations/x.y/requirements?lang=en`)
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(result).toBeNull();
  });
});
