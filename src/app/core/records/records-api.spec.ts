import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { RecordsApi } from './records-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const P = `${BASE}/v1/orgs/${ORG}`;

describe('RecordsApi', () => {
  let api: RecordsApi;
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
    api = TestBed.inject(RecordsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists record types with the module filter and inactive flag', () => {
    api.listRecordTypes(ORG, { module: 'deviations', includeInactive: false }).subscribe();
    const req = http.expectOne((r) => r.url === `${P}/record-types`);
    expect(req.request.params.get('module')).toBe('deviations');
    expect(req.request.params.get('include_inactive')).toBe('false');
    req.flush([]);
  });

  it('omits an empty module filter', () => {
    api.listWorkflows(ORG, '').subscribe();
    const req = http.expectOne((r) => r.url === `${P}/workflows`);
    expect(req.request.params.has('module')).toBe(false);
    req.flush([]);
  });

  it('publishes versions quietly (errors are shown in place)', () => {
    api.publishRecordTypeVersion(ORG, 'rt1', { fields: [], change_note: 'x' }).subscribe();
    const req = http.expectOne(`${P}/record-types/rt1/versions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});

    const definition = { initial_state: 'open', states: [], transitions: [] };
    api.publishWorkflowVersion(ORG, 'wf1', definition, '').subscribe();
    const wf = http.expectOne(`${P}/workflows/wf1/versions`);
    expect(wf.request.body).toEqual({ definition, change_note: null });
    wf.flush({});
  });

  it('calls the AI draft, template and instance endpoints', () => {
    api.aiDraft(ORG, { module: 'risk', description: 'a process', lang: 'nb' }).subscribe();
    http.expectOne(`${P}/workflows/ai-draft`).flush({});

    api.installTemplate(ORG, 'deviation_default', { lang: 'en' }).subscribe();
    const install = http.expectOne(`${P}/record-templates/deviation_default/install`);
    expect(install.request.body).toEqual({ lang: 'en' });
    install.flush({});

    api.getInstance(ORG, 'deviation', 'd1').subscribe({ error: () => undefined });
    const inst = http.expectOne(`${P}/workflow-instances/deviation/d1`);
    expect(inst.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    inst.flush(
      { detail: { code: 'workflow_not_started' } },
      { status: 404, statusText: 'Not Found' },
    );

    api.transition(ORG, 'deviation', 'd1', 'close', { data: { a: 1 }, comment: 'ok' }).subscribe();
    const t = http.expectOne(`${P}/workflow-instances/deviation/d1/transitions/close`);
    expect(t.request.body).toEqual({ data: { a: 1 }, comment: 'ok' });
    t.flush({});
  });

  it('decides and withdraws approvals', () => {
    api.decide(ORG, 'ap1', { approve: false, comment: 'no' }).subscribe();
    const d = http.expectOne(`${P}/workflow-approvals/ap1/decision`);
    expect(d.request.body).toEqual({ approve: false, comment: 'no' });
    d.flush({});

    api.withdraw(ORG, 'ap1').subscribe();
    http
      .expectOne(`${P}/workflow-approvals/ap1/withdraw`)
      .flush(null, { status: 204, statusText: 'No Content' });

    api.listMyApprovals(ORG).subscribe();
    http.expectOne(`${P}/workflow-approvals`).flush({ items: [] });
  });
});
