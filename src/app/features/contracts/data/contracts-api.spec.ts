import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ContractsApi } from './contracts-api';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/contracts${path}`;

describe('ContractsApi', () => {
  let api: ContractsApi;
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
    api = TestBed.inject(ContractsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists deadlines with the window and unwraps the items', () => {
    let count = -1;
    api.deadlines('org-1', 30, false).subscribe((items) => (count = items.length));
    const req = http.expectOne((r) => r.url === url('/deadlines'));
    expect(req.request.params.get('within_days')).toBe('30');
    expect(req.request.params.get('include_overdue')).toBe('false');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [{}, {}] });
    expect(count).toBe(2);
  });

  it('uses the documented paths and methods for the sub-resources', () => {
    api.create('org-1', { title: 'T', contract_type: 'nda' }).subscribe();
    api.update('org-1', 'c-1', { title: 'U', change_reason: 'why' }).subscribe();
    api.delete('org-1', 'c-1').subscribe();
    api.action('org-1', 'c-1', 'submit').subscribe();
    api.addParty('org-1', 'c-1', { name: 'A', role: 'supplier', is_internal: false }).subscribe();
    api.updateParty('org-1', 'c-1', 'p-1', { name: 'B' }).subscribe();
    api.removeParty('org-1', 'c-1', 'p-1').subscribe();
    api
      .addKeyDate('org-1', 'c-1', { kind: 'payment', label: 'Pay', due_date: '2026-01-01' })
      .subscribe();
    api.updateKeyDate('org-1', 'c-1', 'k-1', { done: true }).subscribe();
    api.removeKeyDate('org-1', 'c-1', 'k-1').subscribe();
    api.addVersion('org-1', 'c-1', { change_summary: 'v2' }).subscribe();
    api.updateVersion('org-1', 'c-1', 'v-1', { signed: true }).subscribe();
    api.obligations('org-1', 'c-1').subscribe();
    api.addObligation('org-1', 'c-1', { title: 'Report' }).subscribe();

    const expected: [string, string][] = [
      ['POST', ''],
      ['PATCH', '/c-1'],
      ['DELETE', '/c-1'],
      ['POST', '/c-1/submit'],
      ['POST', '/c-1/parties'],
      ['PATCH', '/c-1/parties/p-1'],
      ['DELETE', '/c-1/parties/p-1'],
      ['POST', '/c-1/key-dates'],
      ['PATCH', '/c-1/key-dates/k-1'],
      ['DELETE', '/c-1/key-dates/k-1'],
      ['POST', '/c-1/versions'],
      ['PATCH', '/c-1/versions/v-1'],
      ['GET', '/c-1/obligations'],
      ['POST', '/c-1/obligations'],
    ];
    for (const [method, path] of expected) {
      http.expectOne({ method, url: url(path) }).flush({});
    }
  });
});
