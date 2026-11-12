import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { suggestionsFrom } from '../aspect-editor';
import { periodLabel } from '../env-trend-chart';
import {
  draftMaxScore,
  keyFromLabel,
  toScoringIn,
  validateScoringDraft,
} from '../scoring-settings';
import { makeAspect, makeMethod, makePlan, makeMetric } from '../environment.testing';
import { EnvironmentApi, aspectListParams } from './environment-api';
import {
  dayToDatetime,
  kgToTonnes,
  localToUtc,
  previewScore,
  sortKey,
  statusesForFilter,
  toDay,
} from './environment-display';
import { environmentErrorKey, fieldErrors } from './environment-errors';
import {
  aspectFormFrom,
  emptyAspectForm,
  emptyMeasurementForm,
  metricFormFrom,
  parseDecimal,
  planFormFrom,
  toAspectCreate,
  toAspectUpdate,
  toMeasurementCreate,
  toMetricUpdate,
  toPlanCreate,
  toPlanUpdate,
  validateAspectForm,
  validateDrillForm,
  validateMeasurementForm,
  validateMetricForm,
  validatePlanForm,
} from './form-models';

const BASE = 'http://test/api';
const url = (path: string) => `${BASE}/v1/orgs/org-1/environment${path}`;

describe('EnvironmentApi', () => {
  let api: EnvironmentApi;
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
    api = TestBed.inject(EnvironmentApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists aspects with csv status, booleans and no empty params', () => {
    api
      .listAspects('org-1', {
        q: '  fuel ',
        status: ['draft', 'active'],
        significant: true,
        impact_type: 'air',
        owner: 'me',
        sort: '-score',
        limit: 25,
        offset: 0,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === url('/aspects'));
    expect(req.request.params.get('q')).toBe('fuel');
    expect(req.request.params.get('status')).toBe('draft,active');
    expect(req.request.params.get('significant')).toBe('true');
    expect(req.request.params.get('impact_type')).toBe('air');
    expect(req.request.params.get('owner')).toBe('me');
    expect(req.request.params.get('sort')).toBe('-score');
    expect(req.request.params.has('condition')).toBe(false);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [], total: 0 });
  });

  it('uses the documented paths and methods', () => {
    const calls: [() => unknown, string, string][] = [
      [() => api.overview('org-1').subscribe(), 'GET', '/overview'],
      [() => api.scoring('org-1').subscribe(), 'GET', '/scoring'],
      [() => api.updateScoring('org-1', makeMethod()).subscribe(), 'PUT', '/scoring'],
      [() => api.getAspect('org-1', 'a-1').subscribe(), 'GET', '/aspects/a-1'],
      [
        () => api.createAspect('org-1', { activity: 'A', aspect: 'B' }).subscribe(),
        'POST',
        '/aspects',
      ],
      [() => api.updateAspect('org-1', 'a-1', { site: 'X' }).subscribe(), 'PATCH', '/aspects/a-1'],
      [() => api.reviewAspect('org-1', 'a-1', {}).subscribe(), 'POST', '/aspects/a-1/review'],
      [() => api.deleteAspect('org-1', 'a-1').subscribe(), 'DELETE', '/aspects/a-1'],
      [() => api.listPlans('org-1').subscribe(), 'GET', '/emergency-plans'],
      [() => api.createPlan('org-1', { title: 'T' }).subscribe(), 'POST', '/emergency-plans'],
      [() => api.updatePlan('org-1', 'p-1', {}).subscribe(), 'PATCH', '/emergency-plans/p-1'],
      [() => api.reviewPlan('org-1', 'p-1', {}).subscribe(), 'POST', '/emergency-plans/p-1/review'],
      [() => api.deletePlan('org-1', 'p-1').subscribe(), 'DELETE', '/emergency-plans/p-1'],
      [() => api.listDrills('org-1', 'p-1').subscribe(), 'GET', '/emergency-plans/p-1/drills'],
      [
        () =>
          api
            .recordDrill('org-1', 'p-1', { held_at: '2026-01-01T10:00:00', outcome: 'effective' })
            .subscribe(),
        'POST',
        '/emergency-plans/p-1/drills',
      ],
      [
        () => api.deleteDrill('org-1', 'p-1', 'd-1').subscribe(),
        'DELETE',
        '/emergency-plans/p-1/drills/d-1',
      ],
      [() => api.listMetrics('org-1').subscribe(), 'GET', '/metrics'],
      [
        () => api.createMetric('org-1', { name: 'N', category: 'energy', unit: 'kWh' }).subscribe(),
        'POST',
        '/metrics',
      ],
      [() => api.updateMetric('org-1', 'm-1', {}).subscribe(), 'PATCH', '/metrics/m-1'],
      [() => api.deleteMetric('org-1', 'm-1').subscribe(), 'DELETE', '/metrics/m-1'],
      [() => api.listMeasurements('org-1', 'm-1').subscribe(), 'GET', '/metrics/m-1/measurements'],
      [
        () =>
          api
            .recordMeasurement('org-1', 'm-1', { period_start: '2026-01-01', value: 1 })
            .subscribe(),
        'POST',
        '/metrics/m-1/measurements',
      ],
      [
        () => api.updateMeasurement('org-1', 'x-1', { value: 2 }).subscribe(),
        'PATCH',
        '/measurements/x-1',
      ],
      [() => api.deleteMeasurement('org-1', 'x-1').subscribe(), 'DELETE', '/measurements/x-1'],
    ];
    for (const [call, method, path] of calls) {
      call();
      const req = http.expectOne((r) => r.url === url(path) && r.method === method);
      req.flush(null);
    }
  });

  it('requests the trend and emissions with their parameters', () => {
    api.trend('org-1', 'm-1', 'quarter', '2025-01-01', '2026-01-01').subscribe();
    const trend = http.expectOne((r) => r.url === url('/metrics/m-1/trend'));
    expect(trend.request.params.get('bucket')).toBe('quarter');
    expect(trend.request.params.get('from')).toBe('2025-01-01');
    expect(trend.request.params.get('to')).toBe('2026-01-01');
    trend.flush({});
    api.emissions('org-1', 2025).subscribe();
    const em = http.expectOne((r) => r.url === url('/emissions'));
    expect(em.request.params.get('year')).toBe('2025');
    em.flush({});
  });
});

describe('environment helpers', () => {
  it('builds list params without empty values', () => {
    expect(aspectListParams({ status: [] })).toEqual(
      expect.objectContaining({ status: undefined, q: undefined }),
    );
  });

  it('maps errors to scoped keys', () => {
    const coded = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'metric_retired' } },
    });
    expect(environmentErrorKey(coded)).toBe('environment.errors.metric_retired');
    expect(environmentErrorKey(new HttpErrorResponse({ status: 403, error: {} }))).toBe(
      'environment.errors.forbidden',
    );
    expect(environmentErrorKey(new HttpErrorResponse({ status: 404, error: {} }))).toBe(
      'environment.errors.notFound',
    );
    const scores = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'invalid_scores', errors: { severity: 'out_of_range', x: 3 } } },
    });
    expect(fieldErrors(scores)).toEqual({ severity: 'out_of_range' });
  });

  it('converts dates and sorts', () => {
    expect(toDay('2026-03-04T10:00:00')).toBe('2026-03-04');
    expect(dayToDatetime('2026-03-04')).toBe('2026-03-04T00:00:00');
    expect(dayToDatetime('')).toBeNull();
    expect(localToUtc('')).toBeNull();
    expect(localToUtc('2026-03-04T10:00')).toMatch(/^2026-03-0\dT\d{2}:\d{2}:00$/);
    expect(sortKey('-updated_at')).toBe('updated_atDesc');
    expect(statusesForFilter('open')).toEqual(['draft', 'active']);
    expect(statusesForFilter('all')).toEqual([]);
    expect(kgToTonnes(12345)).toBe(12.35);
  });

  it('previews the score like the backend', () => {
    const sum = makeMethod();
    expect(previewScore(sum, { severity: 4, probability: 3, extent: 2 })).toBeNull();
    expect(
      previewScore(sum, { severity: 4, probability: 3, extent: 2, stakeholder_concern: 4 }),
    ).toBe(13);
    const weighted = makeMethod({
      criteria: [
        { key: 'a', label: { en: 'A' }, weight: 1.5 },
        { key: 'b', label: { en: 'B' }, weight: 1 },
      ],
    });
    expect(previewScore(weighted, { a: 3, b: 2 })).toBe(6.5);
    expect(previewScore({ ...weighted, method: 'product' }, { a: 3, b: 2 })).toBe(6);
  });

  it('normalises AI aspect suggestions', () => {
    expect(suggestionsFrom(null)).toEqual([]);
    const [s] = suggestionsFrom({
      aspects: [
        {
          aspect: 'Fuel use',
          impact_type: 'bogus',
          condition: 'emergency',
          lifecycle_stages: ['use', 'x'],
        },
        { nope: true },
      ],
    });
    expect(s.impact_type).toBe('other');
    expect(s.condition).toBe('emergency');
    expect(s.lifecycle_stages).toEqual(['use']);
    expect(s.impact).toBe('');
  });

  it('labels trend periods by bucket', () => {
    expect(periodLabel('2026-04-01', 'quarter', 'en')).toBe('Q2 2026');
    expect(periodLabel('2026-01-01', 'year', 'en')).toBe('2026');
    expect(periodLabel('2026-01-01', 'month', 'en')).toContain('26');
  });
});

describe('aspect form model', () => {
  it('requires activity, aspect and an override reason', () => {
    expect(Object.keys(validateAspectForm(emptyAspectForm()))).toEqual(['activity', 'aspect']);
    const v = emptyAspectForm({ activity: 'A', aspect: 'B', override: 'significant' });
    expect(validateAspectForm(v)).toEqual({
      override_reason: 'environment.form.errors.overrideReason',
    });
  });

  it('creates a body with trimmed text, nulls and only set scores', () => {
    const body = toAspectCreate(
      emptyAspectForm({
        activity: ' Washing ',
        aspect: 'Wash water',
        scores: { severity: 3, probability: null },
        review_due: '2027-01-01',
      }),
    );
    expect(body.activity).toBe('Washing');
    expect(body.impact).toBeNull();
    expect(body.scores).toEqual({ severity: 3 });
    expect(body.significance_override).toBeNull();
    expect(body.review_due_at).toBe('2027-01-01T00:00:00');
  });

  it('patches only changed fields and merges scores (null clears)', () => {
    const original = aspectFormFrom(makeAspect());
    const next = {
      ...original,
      site: 'Depot 2',
      scores: { ...original.scores, severity: 5, extent: null },
    };
    const body = toAspectUpdate(original, next, ' Moved ');
    expect(body).toEqual({
      site: 'Depot 2',
      scores: { severity: 5, extent: null },
      change_reason: 'Moved',
    });
    expect(toAspectUpdate(original, original, 'x')).toEqual({});
  });

  it('sends the override reason with an override', () => {
    const original = aspectFormFrom(makeAspect());
    const body = toAspectUpdate(
      original,
      { ...original, override: 'not_significant', override_reason: 'Neighbours agree' },
      '',
    );
    expect(body.significance_override).toBe(false);
    expect(body.override_reason).toBe('Neighbours agree');
  });
});

describe('plan form model', () => {
  it('validates the title and named contacts', () => {
    const v = planFormFrom(makePlan());
    expect(validatePlanForm({ ...v, title: ' ' })).toHaveProperty('title');
    expect(
      validatePlanForm({ ...v, contacts: [{ name: '', role: 'Fire', phone: '', email: '' }] }),
    ).toHaveProperty(['contacts.0']);
  });

  it('drops empty contacts and the schedule when off', () => {
    const v = planFormFrom(makePlan({ drill_rrule: null }));
    const body = toPlanCreate({
      ...v,
      contacts: [
        { name: 'Ada', role: '', phone: '123', email: '' },
        { name: '', role: '', phone: '', email: '' },
      ],
    });
    expect(body.contacts).toEqual([{ name: 'Ada', role: null, phone: '123', email: null }]);
    expect(body.drill_rrule).toBeNull();
    expect(body.drill_start).toBeNull();
  });

  it('replaces or stops the drill schedule as a pair', () => {
    const original = planFormFrom(makePlan());
    expect(toPlanUpdate(original, { ...original, drill_rrule: 'FREQ=MONTHLY' }, '')).toEqual({
      drill_rrule: 'FREQ=MONTHLY',
      drill_start: '2026-06-01T00:00:00',
    });
    expect(toPlanUpdate(original, { ...original, drill_enabled: false }, 'No longer used')).toEqual(
      {
        drill_rrule: null,
        change_reason: 'No longer used',
      },
    );
  });
});

describe('metric and measurement form models', () => {
  it('parses decimals with a comma and validates the factor', () => {
    expect(parseDecimal('2,68')).toBe(2.68);
    expect(parseDecimal('abc')).toBeNaN();
    const v = metricFormFrom(makeMetric());
    expect(validateMetricForm({ ...v, emission_factor: '-1' })).toHaveProperty('emission_factor');
    expect(validateMetricForm({ ...v, name: '', unit: '' })).toEqual(
      expect.objectContaining({ name: expect.any(String), unit: expect.any(String) }),
    );
  });

  it('patches changed metric fields only', () => {
    const v = metricFormFrom(makeMetric());
    expect(toMetricUpdate(v, { ...v, emission_factor: '0,5' })).toEqual({ emission_factor: 0.5 });
    expect(toMetricUpdate(v, { ...v, collection_enabled: false })).toEqual({
      collection_rrule: null,
    });
  });

  it('defaults to last month and checks the period', () => {
    const m = emptyMeasurementForm(new Date(2026, 2, 15));
    expect(m.period_start).toBe('2026-02-01');
    expect(m.period_end).toBe('2026-02-28');
    expect(validateMeasurementForm({ ...m, value: '' })).toHaveProperty('value');
    expect(validateMeasurementForm({ ...m, value: '10', period_end: '2026-01-01' })).toEqual({
      period_end: 'environment.errors.invalid_period',
    });
    expect(
      validateMeasurementForm({
        ...m,
        value: '1',
        period_start: '2025-01-01',
        period_end: '2026-01-02',
      }),
    ).toEqual({ period_end: 'environment.errors.period_too_long' });
    expect(toMeasurementCreate({ ...m, value: '1 234,5', period_end: '' })).toEqual({
      period_start: '2026-02-01',
      period_end: null,
      value: 1234.5,
      site: null,
      note: null,
    });
  });

  it('rejects drills in the future and requires an outcome', () => {
    const now = new Date(2026, 5, 1, 12, 0);
    const errors = validateDrillForm(
      {
        held_at: '2026-06-02T10:00',
        kind: 'drill',
        outcome: '',
        participants: '2.5',
        findings: '',
        lessons_learned: '',
        plan_revision_needed: false,
      },
      now,
    );
    expect(errors).toEqual({
      held_at: 'environment.errors.drill_in_future',
      outcome: 'environment.form.errors.required',
      participants: 'environment.form.errors.wholeNumber',
    });
  });
});

describe('scoring settings model', () => {
  it('validates the draft like the backend', () => {
    const draft = {
      method: 'sum' as const,
      criteria: [
        { key: 'severity', en: 'Severity', nb: '', weight: '1' },
        { key: 'severity', en: '', nb: '', weight: '0' },
      ],
      scale_min: '3',
      scale_max: '2',
      threshold: '-1',
      legal_requirement_significant: true,
      emergency_significant: false,
    };
    expect(validateScoringDraft(draft)).toEqual({
      scale_max: 'environment.scoring.errors.notAboveMin',
      threshold: 'environment.scoring.errors.threshold',
      'criteria.1.key': 'environment.scoring.errors.key',
      'criteria.1.label': 'environment.scoring.errors.label',
      'criteria.1.weight': 'environment.scoring.errors.weight',
    });
  });

  it('builds the PUT body and the max score', () => {
    const draft = {
      method: 'sum' as const,
      criteria: [{ key: 'severity', en: 'Severity', nb: 'Alvorlighet', weight: '1,5' }],
      scale_min: '1',
      scale_max: '5',
      threshold: '6',
      legal_requirement_significant: true,
      emergency_significant: true,
    };
    expect(toScoringIn(draft)).toEqual({
      method: 'sum',
      criteria: [{ key: 'severity', label: { en: 'Severity', nb: 'Alvorlighet' }, weight: 1.5 }],
      scale_min: 1,
      scale_max: 5,
      threshold: 6,
      legal_requirement_significant: true,
      emergency_significant: true,
    });
    expect(draftMaxScore(draft)).toBe(7.5);
    expect(draftMaxScore({ ...draft, method: 'product' })).toBe(5);
    expect(keyFromLabel('Interested party concern')).toBe('interested_party_concern');
    expect(keyFromLabel('Støy')).toBe('st_y');
  });
});
