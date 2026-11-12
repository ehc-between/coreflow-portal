import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { AiGovernanceApi } from './ai-governance-api';
import { emptyAnswers } from './ai-governance-display';

const BASE = 'http://test/api';
const ORG = 'org-1';
const ROOT = `${BASE}/v1/orgs/${ORG}/ai-governance`;

describe('AiGovernanceApi', () => {
  let api: AiGovernanceApi;
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
    api = TestBed.inject(AiGovernanceApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists systems with filters and drops empty ones', () => {
    api
      .listSystems(ORG, {
        q: 'bot',
        status: 'in_use',
        risk_class: '',
        sort: '-name',
        limit: 25,
        offset: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${ROOT}/systems`);
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('q')).toBe('bot');
    expect(p.get('status')).toBe('in_use');
    expect(p.has('risk_class')).toBe(false);
    expect(p.get('sort')).toBe('-name');
    expect(p.get('limit')).toBe('25');
    expect(p.get('offset')).toBe('50');
    req.flush({ items: [], total: 0 });
  });

  it('creates and updates a system without the generic error toast', () => {
    const body = {
      name: 'Bot',
      description: null,
      intended_purpose: null,
      ai_act_role: 'deployer' as const,
      status: 'planned' as const,
      provider_name: null,
      models: [],
      data_categories: [],
      uses_personal_data: false,
      owner_user_id: null,
      department_id: null,
      next_review_at: null,
    };
    api.createSystem(ORG, body).subscribe();
    const create = http.expectOne(`${ROOT}/systems`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(body);
    expect(create.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    create.flush({});

    api.updateSystem(ORG, 's-1', { name: 'New', change_reason: 'rename' }).subscribe();
    const patch = http.expectOne(`${ROOT}/systems/s-1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ name: 'New', change_reason: 'rename' });
    patch.flush({});
  });

  it('registers the platform features, previews a classification and saves documentation', () => {
    api.registerPlatformFeatures(ORG, 'nb').subscribe();
    const reg = http.expectOne(`${ROOT}/systems/register-platform-features`);
    expect(reg.request.body).toEqual({ lang: 'nb' });
    reg.flush({ created: 3, items: [] });

    const answers = emptyAnswers();
    api.previewClassification(ORG, { answers, ai_system_id: 's-1', lang: 'en' }).subscribe();
    const preview = http.expectOne(`${ROOT}/classification/preview`);
    expect(preview.request.method).toBe('POST');
    expect(preview.request.body).toEqual({ answers, ai_system_id: 's-1', lang: 'en' });
    preview.flush({});

    api
      .updateDocumentation(ORG, 's-1', { logging: 'Logs kept 6 months', post_market_plan: null })
      .subscribe();
    const doc = http.expectOne(`${ROOT}/systems/s-1/documentation`);
    expect(doc.request.method).toBe('PUT');
    expect(doc.request.body).toEqual({
      sections: { logging: 'Logs kept 6 months', post_market_plan: null },
    });
    doc.flush({});

    api.technicalDocumentation(ORG, 's-1').subscribe();
    http.expectOne(`${ROOT}/systems/s-1/technical-documentation`).flush({});
  });

  it('drives the assessment workflow', () => {
    api
      .completeAssessment(ORG, 'a-1', { create_tasks: true, due_in_days: 30, lang: 'en' })
      .subscribe();
    const complete = http.expectOne(`${ROOT}/assessments/a-1/complete`);
    expect(complete.request.method).toBe('POST');
    expect(complete.request.body).toEqual({ create_tasks: true, due_in_days: 30, lang: 'en' });
    complete.flush({});

    api.approveAssessment(ORG, 'a-1').subscribe();
    http.expectOne(`${ROOT}/assessments/a-1/approve`).flush({});
    api.reopenAssessment(ORG, 'a-1').subscribe();
    http.expectOne(`${ROOT}/assessments/a-1/reopen`).flush({});
    api.deleteAssessment(ORG, 'a-1').subscribe();
    const del = http.expectOne(`${ROOT}/assessments/a-1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);

    api.listAssessments(ORG, { ai_system_id: 's-1', kind: 'fria' }).subscribe();
    const list = http.expectOne((r) => r.url === `${ROOT}/assessments`);
    expect(list.request.params.get('ai_system_id')).toBe('s-1');
    expect(list.request.params.get('kind')).toBe('fria');
    list.flush({ items: [], total: 0 });
  });

  it('records monitoring, links incidents, schedules reviews and records literacy', () => {
    api
      .addMonitoring(ORG, 's-1', {
        kind: 'accuracy',
        metric: 'precision',
        value: 0.9,
        threshold: 0.8,
        result: 'pass',
        notes: null,
        measured_at: null,
      })
      .subscribe();
    expect(http.expectOne(`${ROOT}/systems/s-1/monitoring`).request.body.metric).toBe('precision');

    api.linkIncident(ORG, 's-1', 'd-1').subscribe();
    expect(http.expectOne(`${ROOT}/systems/s-1/incidents`).request.body).toEqual({
      deviation_id: 'd-1',
    });

    api
      .scheduleReview(ORG, 's-1', {
        rrule: 'FREQ=MONTHLY;INTERVAL=3',
        start_at: '2026-12-01T00:00:00',
      })
      .subscribe();
    expect(http.expectOne(`${ROOT}/systems/s-1/review-schedule`).request.body.rrule).toBe(
      'FREQ=MONTHLY;INTERVAL=3',
    );

    api
      .addLiteracy(ORG, {
        user_id: 'u-1',
        topic: 'Basics',
        source: 'training',
        completed_at: '2026-11-01T00:00:00',
      })
      .subscribe();
    expect(http.expectOne(`${ROOT}/literacy`).request.method).toBe('POST');

    api.literacyCoverage(ORG).subscribe();
    http.expectOne(`${ROOT}/literacy/coverage`).flush({});

    api
      .updateSettings(ORG, {
        policy_document_id: null,
        officer_user_id: 'u-1',
        literacy_validity_months: 24,
        review_interval_months: 12,
      })
      .subscribe();
    const put = http.expectOne(`${ROOT}/settings`);
    expect(put.request.method).toBe('PUT');
    put.flush({});
  });
});
