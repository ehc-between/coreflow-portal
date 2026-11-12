import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { emptyMap } from './map-model';
import { ProcessesApi } from './processes-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path = '') => `${BASE}/v1/orgs/${ORG}/processes${path}`;

describe('ProcessesApi', () => {
  let api: ProcessesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(ProcessesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with filters as query params (status as csv)', () => {
    api
      .list(ORG, {
        q: '  buy ',
        status: ['draft', 'active'],
        category: 'core',
        owner: 'me',
        review_due: true,
        sort: '-updated_at',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url());
    const p = req.request.params;
    expect(req.request.method).toBe('GET');
    expect(p.get('q')).toBe('buy');
    expect(p.get('status')).toBe('draft,active');
    expect(p.get('category')).toBe('core');
    expect(p.get('owner')).toBe('me');
    expect(p.get('review_due')).toBe('true');
    expect(p.get('sort')).toBe('-updated_at');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    expect(p.has('department_id')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('creates, updates and deletes without the generic toast', () => {
    api.create(ORG, { title: 'Purchasing' }).subscribe();
    const create = http.expectOne(url());
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ title: 'Purchasing' });
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.update(ORG, 'p-1', { title: 'Buying', change_reason: 'rename' }).subscribe();
    const update = http.expectOne(url('/p-1'));
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ title: 'Buying', change_reason: 'rename' });
    update.flush({});

    api.delete(ORG, 'p-1').subscribe();
    const del = http.expectOne(url('/p-1'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('saves the map, changes the status and records a review', () => {
    api.saveMap(ORG, 'p-1', emptyMap(), '').subscribe();
    const map = http.expectOne(url('/p-1/map'));
    expect(map.request.method).toBe('PUT');
    expect(map.request.body).toEqual({ map: emptyMap(), change_reason: null });
    map.flush({});

    api.changeStatus(ORG, 'p-1', 'active', 'ready').subscribe();
    const status = http.expectOne(url('/p-1/status'));
    expect(status.request.body).toEqual({ status: 'active', change_reason: 'ready' });
    status.flush({});

    api.recordReview(ORG, 'p-1', { notes: 'ok', next_review_at: null }).subscribe();
    const review = http.expectOne(url('/p-1/reviews'));
    expect(review.request.method).toBe('POST');
    review.flush({});
  });

  it('reads the turtle and the interaction map', () => {
    api.turtle(ORG, 'p-1').subscribe();
    http.expectOne(url('/p-1/turtle')).flush({});
    api.interactionMap(ORG, true).subscribe();
    const im = http.expectOne((r) => r.url === url('/interaction-map'));
    expect(im.request.params.get('include_retired')).toBe('true');
    im.flush({ nodes: [], edges: [] });
  });

  it('manages interactions and the description document', () => {
    api
      .addInteraction(ORG, 'p-1', { target_process_id: 'p-2', direction: 'incoming', label: 'x' })
      .subscribe();
    const add = http.expectOne(url('/p-1/interactions'));
    expect(add.request.body).toEqual({
      target_process_id: 'p-2',
      direction: 'incoming',
      label: 'x',
    });
    add.flush({});

    api.removeInteraction(ORG, 'p-1', 'i-1').subscribe();
    expect(http.expectOne(url('/p-1/interactions/i-1')).request.method).toBe('DELETE');

    api.attachDescriptionDocument(ORG, 'p-1', 'd-1').subscribe();
    const attach = http.expectOne(url('/p-1/description-document'));
    expect(attach.request.method).toBe('PUT');
    expect(attach.request.body).toEqual({ document_id: 'd-1' });
    attach.flush({});

    api.createDescriptionDocument(ORG, 'p-1').subscribe();
    const create = http.expectOne(url('/p-1/description-document'));
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({});
    create.flush({});

    api.detachDescriptionDocument(ORG, 'p-1').subscribe();
    expect(http.expectOne(url('/p-1/description-document')).request.method).toBe('DELETE');
  });
});
