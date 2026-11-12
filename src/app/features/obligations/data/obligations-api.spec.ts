import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ObligationsApi, obligationListParams } from './obligations-api';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/obligations${path}`;

describe('ObligationsApi', () => {
  let api: ObligationsApi;
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
    api = TestBed.inject(ObligationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('builds the list query with csv filters and drops unset values', () => {
    expect(
      obligationListParams({
        q: '  noise ',
        status: ['draft', 'active'],
        compliance: ['non_compliant'],
        type: [],
        owner: 'me',
        evaluation_overdue: true,
        expiring_within_days: 60,
        sort: 'valid_until',
      }),
    ).toEqual({
      q: 'noise',
      status: 'draft,active',
      type: undefined,
      compliance: 'non_compliant',
      framework: undefined,
      owner: 'me',
      evaluation_overdue: true,
      expiring_within_days: 60,
      sort: 'valid_until',
      limit: undefined,
      offset: undefined,
    });
  });

  it('lists obligations without the generic error toast', () => {
    api.list('org-1', { status: ['active'], limit: 25 }).subscribe();
    const req = http.expectOne((r) => r.url === url(''));
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.get('limit')).toBe('25');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [], total: 0 });
  });

  it('asks for the summary with the expiry window', () => {
    api.summary('org-1', 30).subscribe();
    const req = http.expectOne((r) => r.url === url('/summary'));
    expect(req.request.params.get('expiring_within_days')).toBe('30');
    req.flush({});
  });

  it('unwraps the evaluation and change lists', () => {
    let evaluations = -1;
    let changes = -1;
    api.evaluations('org-1', 'o-1').subscribe((items) => (evaluations = items.length));
    api.changes('org-1', 'o-1').subscribe((items) => (changes = items.length));
    http.expectOne(url('/o-1/evaluations')).flush({ items: [{}, {}] });
    http.expectOne(url('/o-1/changes')).flush({ items: [{}] });
    expect(evaluations).toBe(2);
    expect(changes).toBe(1);
  });

  it('uses the documented paths and methods for the sub-resources', () => {
    api.get('org-1', 'o-1').subscribe();
    api.create('org-1', { title: 'T' }).subscribe();
    api.update('org-1', 'o-1', { title: 'U', change_reason: 'why' }).subscribe();
    api.delete('org-1', 'o-1').subscribe();
    api.evaluate('org-1', 'o-1', { result: 'compliant' }).subscribe();
    api.removeEvaluation('org-1', 'o-1', 'e-1').subscribe();
    api.actions('org-1', 'o-1').subscribe();
    api.addAction('org-1', 'o-1', { title: 'Fix' }).subscribe();
    api.addChange('org-1', 'o-1', { title: 'Amendment' }).subscribe();
    api.updateChange('org-1', 'o-1', 'c-1', { status: 'assessed' }).subscribe();
    api.removeChange('org-1', 'o-1', 'c-1').subscribe();

    const expected: [string, string][] = [
      ['GET', '/o-1'],
      ['POST', ''],
      ['PATCH', '/o-1'],
      ['DELETE', '/o-1'],
      ['POST', '/o-1/evaluations'],
      ['DELETE', '/o-1/evaluations/e-1'],
      ['GET', '/o-1/actions'],
      ['POST', '/o-1/actions'],
      ['POST', '/o-1/changes'],
      ['PATCH', '/o-1/changes/c-1'],
      ['DELETE', '/o-1/changes/c-1'],
    ];
    for (const [method, path] of expected) {
      http.expectOne({ method, url: url(path) }).flush({});
    }
  });
});
