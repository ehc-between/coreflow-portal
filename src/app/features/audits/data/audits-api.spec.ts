import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { AuditsApi } from './audits-api';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}/audits`;

describe('AuditsApi', () => {
  let api: AuditsApi;
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
    api = TestBed.inject(AuditsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the overview', () => {
    api.overview(ORG).subscribe();
    http.expectOne(`${ROOT}/overview`).flush({});
  });

  it('lists plans with filters as query params and skips empty ones', () => {
    api
      .listPlans(ORG, {
        q: 'supplier',
        status: 'planned,in_progress',
        kind: 'internal',
        sort: '-planned_start',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/plans`);
    const p = req.request.params;
    expect(p.get('q')).toBe('supplier');
    expect(p.get('status')).toBe('planned,in_progress');
    expect(p.get('kind')).toBe('internal');
    expect(p.get('sort')).toBe('-planned_start');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    expect(p.has('programme_id')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('only sends overdue=true for the findings filter when set', () => {
    api.listFindings(ORG, { plan_id: 'p-1', overdue: false }).subscribe();
    const first = http.expectOne((r) => r.url === `${ROOT}/findings`);
    expect(first.request.params.get('plan_id')).toBe('p-1');
    expect(first.request.params.has('overdue')).toBe(false);
    first.flush({ items: [], total: 0 });

    api.listFindings(ORG, { overdue: true, owner: 'u-1' }).subscribe();
    const second = http.expectOne((r) => r.url === `${ROOT}/findings`);
    expect(second.request.params.get('overdue')).toBe('true');
    expect(second.request.params.get('owner')).toBe('u-1');
    second.flush({ items: [], total: 0 });
  });

  it('posts transitions with the action and an optional reason, without the generic toast', () => {
    api.transitionPlan(ORG, 'p-1', 'cancel', 'Postponed').subscribe();
    const req = http.expectOne(`${ROOT}/plans/p-1/transition`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ action: 'cancel', reason: 'Postponed' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({});

    api.transitionFinding(ORG, 'f-1', 'submit').subscribe();
    const finding = http.expectOne(`${ROOT}/findings/f-1/transition`);
    expect(finding.request.body).toEqual({ action: 'submit', reason: null });
    finding.flush({});

    api.transitionProgramme(ORG, 'g-1', 'approve').subscribe();
    http.expectOne(`${ROOT}/programmes/g-1/transition`).flush({});
  });

  it('checks and assigns auditors on the plan', () => {
    api.checkAuditor(ORG, 'p-1', 'u-2', 'lead').subscribe();
    const check = http.expectOne((r) => r.url === `${ROOT}/plans/p-1/auditor-check`);
    expect(check.request.params.get('user_id')).toBe('u-2');
    expect(check.request.params.get('role')).toBe('lead');
    check.flush({ user_id: 'u-2', competence_ok: true, independence_ok: true, issues: [] });

    api
      .assignAuditor(ORG, 'p-1', { user_id: 'u-2', role: 'lead', override_reason: 'Only one' })
      .subscribe();
    const assign = http.expectOne(`${ROOT}/plans/p-1/auditors`);
    expect(assign.request.body).toEqual({
      user_id: 'u-2',
      role: 'lead',
      override_reason: 'Only one',
    });
    assign.flush({});

    api.removeAuditor(ORG, 'p-1', 'a-1').subscribe();
    expect(http.expectOne(`${ROOT}/plans/p-1/auditors/a-1`).request.method).toBe('DELETE');
  });

  it('drives the checklist: generate, bulk add (assistant drafts) and answer', () => {
    api.generateChecklist(ORG, 'p-1', { lang: 'nb' }).subscribe();
    expect(http.expectOne(`${ROOT}/plans/p-1/checklist/generate`).request.body).toEqual({
      lang: 'nb',
    });

    api
      .addChecklistItems(ORG, 'p-1', [{ question: 'How?', clause_ref: 'iso9001:8.4' }], 'ai')
      .subscribe();
    expect(http.expectOne(`${ROOT}/plans/p-1/checklist/bulk`).request.body).toEqual({
      items: [{ question: 'How?', clause_ref: 'iso9001:8.4' }],
      source: 'ai',
    });

    api.updateChecklistItem(ORG, 'p-1', 'i-1', { result: 'conforming' }).subscribe();
    const patch = http.expectOne(`${ROOT}/plans/p-1/checklist/i-1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ result: 'conforming' });
  });

  it('raises findings on a plan, adds actions and links deviations', () => {
    api.createFinding(ORG, 'p-1', { title: 'Gap', finding_type: 'minor_nc' }).subscribe();
    expect(http.expectOne(`${ROOT}/plans/p-1/findings`).request.body).toEqual({
      title: 'Gap',
      finding_type: 'minor_nc',
    });

    api.createFindingAction(ORG, 'f-1', { title: 'Fix it' }).subscribe();
    expect(http.expectOne(`${ROOT}/findings/f-1/actions`).request.method).toBe('POST');

    api.linkDeviation(ORG, 'f-1', 'd-1').subscribe();
    expect(http.expectOne(`${ROOT}/findings/f-1/deviations`).request.body).toEqual({
      deviation_id: 'd-1',
    });
  });

  it('manages the register and certifications', () => {
    api.listProfiles(ORG, { framework: 'iso9001', active: true }).subscribe();
    const list = http.expectOne((r) => r.url === `${ROOT}/auditors`);
    expect(list.request.params.get('framework')).toBe('iso9001');
    expect(list.request.params.get('active')).toBe('true');

    api.listCertifications(ORG, { expiring_within_days: 90 }).subscribe();
    const certs = http.expectOne((r) => r.url === `${ROOT}/certifications`);
    expect(certs.request.params.get('expiring_within_days')).toBe('90');

    api.deleteCertification(ORG, 'c-1').subscribe();
    expect(http.expectOne(`${ROOT}/certifications/c-1`).request.method).toBe('DELETE');
  });
});
