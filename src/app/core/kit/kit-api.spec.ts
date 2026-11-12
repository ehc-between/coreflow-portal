import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { KitApi } from './kit-api';
import { kitErrorKey } from './kit-errors';

const BASE = 'http://test/api';
const ORG = 'org-1';
const url = (path: string) => `${BASE}/v1/orgs/${ORG}/${path}`;

describe('KitApi', () => {
  let api: KitApi;
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
    api = TestBed.inject(KitApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists links with repeated link_type params and no toast', () => {
    api.links(ORG, 'deviation', 'd1', ['caused_by', 'mitigates']).subscribe();
    const req = http.expectOne((r) => r.url === url('links'));
    expect(req.request.params.get('entity_type')).toBe('deviation');
    expect(req.request.params.get('entity_id')).toBe('d1');
    expect(req.request.params.getAll('link_type')).toEqual(['caused_by', 'mitigates']);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [] });
  });

  it('omits link_type when not filtering', () => {
    api.links(ORG, 'document', 'x').subscribe();
    const req = http.expectOne((r) => r.url === url('links'));
    expect(req.request.params.has('link_type')).toBe(false);
    req.flush({ items: [] });
  });

  it('creates and deletes links', () => {
    const body = {
      source_type: 'deviation',
      source_id: 'd1',
      target_type: 'document',
      target_id: 'doc1',
      link_type: 'caused_by',
    };
    api.createLink(ORG, body).subscribe();
    const create = http.expectOne(url('links'));
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(body);
    create.flush({});

    api.deleteLink(ORG, 'l1').subscribe();
    const del = http.expectOne(url('links/l1'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('covers comments: list, create, patch, delete', () => {
    api.comments(ORG, 'deviation', 'd1').subscribe();
    const list = http.expectOne((r) => r.url === url('comments'));
    expect(list.request.params.get('entity_type')).toBe('deviation');
    list.flush({ items: [] });

    api
      .createComment(ORG, {
        entity_type: 'deviation',
        entity_id: 'd1',
        body: 'Hi',
        mentions: ['u2'],
      })
      .subscribe();
    const create = http.expectOne(url('comments'));
    expect(create.request.body.mentions).toEqual(['u2']);
    create.flush({});

    api.updateComment(ORG, 'c1', { body: 'Edited' }).subscribe();
    const patch = http.expectOne(url('comments/c1'));
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});

    api.deleteComment(ORG, 'c1').subscribe();
    http.expectOne(url('comments/c1')).flush(null, { status: 204, statusText: 'No Content' });
  });

  it('maps access subjects to mention candidates', () => {
    let result: unknown;
    api.mentionCandidates(ORG).subscribe((r) => (result = r));
    http.expectOne(url('access-subjects')).flush({
      users: [{ id: 'u1', name: 'Ada', email: 'ada@x.io' }],
      departments: [{ id: 'dep', name: 'QA' }],
    });
    expect(result).toEqual([{ id: 'u1', name: 'Ada', email: 'ada@x.io' }]);
  });

  it('covers revisions: list, detail, compare', () => {
    api.revisions(ORG, 'document', 'x').subscribe();
    http.expectOne((r) => r.url === url('revisions')).flush({ items: [] });
    api.revision(ORG, 'r1').subscribe();
    http.expectOne(url('revisions/r1')).flush({});
    api.compareRevisions(ORG, 'r1', 'r2').subscribe();
    const cmp = http.expectOne((r) => r.url === url('revisions/compare'));
    expect(cmp.request.params.get('from_id')).toBe('r1');
    expect(cmp.request.params.get('to_id')).toBe('r2');
    cmp.flush({});
  });

  it('pages the timeline and only sends include_audit when asked', () => {
    api.timeline(ORG, 'deviation', 'd1').subscribe();
    const first = http.expectOne((r) => r.url === url('timeline'));
    expect(first.request.params.get('limit')).toBe('50');
    expect(first.request.params.has('before')).toBe(false);
    expect(first.request.params.has('include_audit')).toBe(false);
    first.flush({ items: [], next_before: null });

    api
      .timeline(ORG, 'deviation', 'd1', { before: '2026-01-01T00:00:00', includeAudit: true })
      .subscribe();
    const next = http.expectOne((r) => r.url === url('timeline'));
    expect(next.request.params.get('before')).toBe('2026-01-01T00:00:00');
    expect(next.request.params.get('include_audit')).toBe('true');
    next.flush({ items: [], next_before: null });
  });

  it('searches with comma-separated types', () => {
    api.search(ORG, 'pump', { types: ['document', 'deviation'], limit: 5 }).subscribe();
    const req = http.expectOne((r) => r.url === url('search'));
    expect(req.request.params.get('q')).toBe('pump');
    expect(req.request.params.get('types')).toBe('document,deviation');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush({ items: [] });
  });

  it('resolves entities and the type catalog', () => {
    api.entity(ORG, 'deviation', 'd1').subscribe();
    http.expectOne(url('entities/deviation/d1')).flush({});
    api.entityTypes(ORG).subscribe();
    http.expectOne(url('entity-types')).flush({ items: [], link_types: [] });
  });
});

describe('kitErrorKey', () => {
  const err = (status: number, detail?: unknown) =>
    new HttpErrorResponse({ status, error: detail === undefined ? null : { detail } });

  it('maps known backend codes', () => {
    expect(kitErrorKey(err(409, { code: 'link_exists' }))).toBe('kit.errors.link_exists');
    expect(kitErrorKey(err(422, { code: 'mention_no_access' }))).toBe(
      'kit.errors.mention_no_access',
    );
    expect(kitErrorKey(err(404, { code: 'module_disabled' }))).toBe('kit.errors.module_disabled');
  });

  it('falls back on the status', () => {
    expect(kitErrorKey(err(0))).toBe('kit.errors.network');
    expect(kitErrorKey(err(403, 'No access to this organization'))).toBe('kit.errors.forbidden');
    expect(kitErrorKey(err(404, { code: 'something_new' }))).toBe('kit.errors.notFound');
    expect(kitErrorKey(err(500))).toBe('kit.errors.generic');
    expect(kitErrorKey(new Error('x'))).toBe('kit.errors.generic');
  });
});
