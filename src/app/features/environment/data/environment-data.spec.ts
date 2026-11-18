import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { aspectNotices } from '../aspect-detail';
import { aspectPrefill, suggestionsFrom } from '../aspect-editor';
import {
  ASPECT_DEFAULT_FILTERS,
  aspectQuery,
  groupByActivity,
  moreFiltersCount,
  parseAspectFilters,
} from '../aspects-list';
import { exportFileName, scopeMeasured, scopeShare } from '../emissions-page';
import { axisLabel, niceMax, periodLabel, targetPerBucket } from '../env-trend-chart';
import { attentionItems } from '../environment-overview';
import { flowButtonKey } from '../flow-buttons';
import { changeArrow, parseMetricFilters } from '../metrics-list';
import { participantNames, planNotices } from '../plan-detail';
import { planPrefill, prefillAspectIds } from '../plan-editor';
import { parsePlanFilters } from '../plans-list';
import { addPicked } from '../record-picker';
import {
  draftFromMethod,
  draftMaxScore,
  draftScale,
  emptyCriterion,
  toScoringIn,
  validateScoringDraft,
} from '../scoring-settings';
import {
  makeAspect,
  makeDrill,
  makeEmissions,
  makeMethod,
  makeMetric,
  makeOverview,
  makePlan,
} from '../environment.testing';
import { EnvironmentApi, aspectListParams } from './environment-api';
import {
  changeIsGood,
  dayToDatetime,
  displayUnit,
  kgToTonnes,
  levelText,
  localToUtc,
  outcomeBadgeValue,
  previewScore,
  scaleValues,
  sortKey,
  statusesForFilter,
  targetBadgeValue,
  toDay,
} from './environment-display';
import { environmentErrorKey, fieldErrors } from './environment-errors';
import {
  aspectFormFrom,
  contactDraftFrom,
  drillHeadCount,
  emptyAspectForm,
  emptyContact,
  emptyDrillForm,
  emptyMeasurementForm,
  emptyMetricForm,
  metricFormFrom,
  parseDecimal,
  planFormFrom,
  toAspectCreate,
  toAspectUpdate,
  toDrillCreate,
  toMeasurementCreate,
  toMetricCreate,
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

  it('lists aspects with csv status, booleans, follow-up filters and no empty params', () => {
    api
      .listAspects('org-1', {
        q: '  fuel ',
        status: ['draft', 'active'],
        significant: true,
        impact_type: 'air',
        owner: 'me',
        attention: 'without_controls',
        process_id: 'proc-1',
        sort: 'activity',
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
    expect(req.request.params.get('attention')).toBe('without_controls');
    expect(req.request.params.get('process_id')).toBe('proc-1');
    expect(req.request.params.get('sort')).toBe('activity');
    expect(req.request.params.has('condition')).toBe(false);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [], total: 0 });
  });

  it('filters plans on follow-up and metrics on their target', () => {
    api.listPlans('org-1', { attention: 'drill_overdue' }).subscribe();
    const plans = http.expectOne((r) => r.url === url('/emergency-plans'));
    expect(plans.request.params.get('attention')).toBe('drill_overdue');
    plans.flush({ items: [], total: 0 });
    api.listMetrics('org-1', { target: 'off_track', status: ['active'] }).subscribe();
    const metrics = http.expectOne((r) => r.url === url('/metrics'));
    expect(metrics.request.params.get('target')).toBe('off_track');
    expect(metrics.request.params.get('status')).toBe('active');
    metrics.flush({ items: [], total: 0 });
  });

  it('uses the documented paths and methods', () => {
    const calls: [() => unknown, string, string][] = [
      [() => api.overview('org-1').subscribe(), 'GET', '/overview'],
      [() => api.scoring('org-1').subscribe(), 'GET', '/scoring'],
      [
        () => api.updateScoring('org-1', toScoringIn(draftFromMethod(makeMethod()))).subscribe(),
        'PUT',
        '/scoring',
      ],
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

  it('requests the trend, the emissions and the CSV export', () => {
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
    api.exportEmissions('org-1', 2025, 'nb').subscribe();
    const csv = http.expectOne((r) => r.url === url('/emissions/export'));
    expect(csv.request.params.get('year')).toBe('2025');
    expect(csv.request.params.get('lang')).toBe('nb');
    expect(csv.request.responseType).toBe('blob');
    csv.flush(new Blob(['x']));
  });
});

describe('environment helpers', () => {
  it('builds list params without empty values', () => {
    expect(aspectListParams({ status: [] })).toEqual(
      expect.objectContaining({ status: undefined, q: undefined, attention: undefined }),
    );
  });

  it('maps errors to scoped keys', () => {
    const coded = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'invalid_obligation' } },
    });
    expect(environmentErrorKey(coded)).toBe('environment.errors.invalid_obligation');
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

  it('converts dates, sorts, units and tonnes', () => {
    expect(toDay('2026-03-04T10:00:00')).toBe('2026-03-04');
    expect(dayToDatetime('2026-03-04')).toBe('2026-03-04T00:00:00');
    expect(dayToDatetime('')).toBeNull();
    expect(localToUtc('')).toBeNull();
    expect(localToUtc('2026-03-04T10:00')).toMatch(/^2026-03-0\dT\d{2}:\d{2}:00$/);
    expect(sortKey('-updated_at')).toBe('updated_atDesc');
    expect(statusesForFilter('open')).toEqual(['draft', 'active']);
    expect(statusesForFilter('all')).toEqual([]);
    expect(kgToTonnes(12345)).toBe(12.35);
    expect(displayUnit('m3')).toBe('m³');
    expect(displayUnit('kg co2e')).toBe('kg CO₂e');
    expect(displayUnit('kWh')).toBe('kWh');
  });

  it('maps outcomes and target status to badge values (never red for a target)', () => {
    expect(outcomeBadgeValue('effective')).toBe('compliant');
    expect(outcomeBadgeValue('partially_effective')).toBe('partial');
    expect(outcomeBadgeValue('ineffective')).toBe('non_compliant');
    expect(targetBadgeValue('on_track')).toBe('met');
    expect(targetBadgeValue('off_track')).toBe('partial');
    expect(targetBadgeValue('no_data')).toBe('not_assessed');
  });

  it('judges changes by the metric direction', () => {
    expect(changeIsGood(-8, 'decrease')).toBe(true);
    expect(changeIsGood(8, 'decrease')).toBe(false);
    expect(changeIsGood(8, 'increase')).toBe(true);
    expect(changeIsGood(0.1, 'decrease')).toBeNull();
    expect(changeArrow(-12)).toBe('↓');
    expect(changeArrow(3)).toBe('↑');
    expect(changeArrow(0)).toBe('→');
    expect(changeArrow(null)).toBe('');
  });

  it('previews the score like the backend and describes the levels', () => {
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
    expect(scaleValues(sum)).toEqual([1, 2, 3, 4, 5]);
    expect(levelText(sum.criteria[0], 5, 'nb')).toBe('Alvorlig og varig skade');
    expect(levelText(sum.criteria[0], 5, 'de')).toBe('Severe and lasting harm');
    expect(levelText(sum.criteria[1], 5, 'nb')).toBe('');
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

  it('labels trend periods and scales the axis and the target', () => {
    expect(periodLabel('2026-04-01', 'quarter', 'en')).toBe('Q2 2026');
    expect(periodLabel('2026-01-01', 'year', 'en')).toBe('2026');
    expect(periodLabel('2026-01-01', 'month', 'en')).toContain('26');
    expect(axisLabel('2026-10-01', 'month', 'en')).toBe('Oct');
    expect(niceMax(13800)).toBe(20000);
    expect(niceMax(0)).toBe(1);
    expect(niceMax(240)).toBe(250);
    expect(targetPerBucket(120000, 'month')).toBe(10000);
    expect(targetPerBucket(120000, 'quarter')).toBe(30000);
    expect(targetPerBucket(null, 'year')).toBeNull();
  });

  it('names the flow button labels', () => {
    expect(flowButtonKey('env_aspect.to_document')).toBe(
      'environment.flowButtons.env_aspect_to_document',
    );
  });
});

describe('overview', () => {
  it('lists only what needs follow-up, most important first, with filtered links', () => {
    const items = attentionItems(
      makeOverview({
        aspects_without_controls: 2,
        aspects_needing_plan: 1,
        plans_drill_overdue: 1,
        aspects_draft: 0,
        metrics_off_target: 3,
      }),
    );
    expect(items.map((i) => i.key)).toEqual([
      'withoutControls',
      'needsPlan',
      'plansDrill',
      'metricsOffTarget',
    ]);
    expect(items[0].query).toEqual({ attention: 'without_controls' });
    expect(items[3]).toEqual(
      expect.objectContaining({ link: '/environment/metrics', query: { target: 'off_track' } }),
    );
  });
});

describe('list filters', () => {
  it('reads aspect filters from the URL and ignores unknown values', () => {
    const f = parseAspectFilters({
      attention: 'needs_emergency_plan',
      significance: 'significant',
      process_id: '11111111-2222-3333-4444-555555555555',
      sort: 'bogus',
      impactType: 'nope',
    });
    expect(f.attention).toBe('needs_emergency_plan');
    expect(f.significance).toBe('significant');
    expect(f.process).toBe('11111111-2222-3333-4444-555555555555');
    expect(f.sort).toBe('code');
    expect(f.impactType).toBe('');
    expect(moreFiltersCount(f)).toBe(1);
    const q = aspectQuery(' fuel ', { ...f, group: '1' }, 25);
    expect(q).toEqual(
      expect.objectContaining({
        q: 'fuel',
        significant: true,
        attention: 'needs_emergency_plan',
        process_id: f.process,
        sort: 'activity',
        offset: 25,
      }),
    );
    expect(parseAspectFilters({})).toEqual(ASPECT_DEFAULT_FILTERS);
  });

  it('groups aspects by activity in the order they came', () => {
    const groups = groupByActivity([
      makeAspect({ id: '1', activity: 'Washing' }),
      makeAspect({ id: '2', activity: 'Printing' }),
      makeAspect({ id: '3', activity: 'Washing ' }),
    ]);
    expect(groups.map((g) => [g.activity, g.rows.length])).toEqual([
      ['Washing', 2],
      ['Printing', 1],
    ]);
  });

  it('reads plan and metric filters from the URL', () => {
    expect(parsePlanFilters({ attention: 'drill_overdue' }).attention).toBe('drill_overdue');
    expect(parsePlanFilters({ attention: 'x' }).attention).toBe('');
    const m = parseMetricFilters({ target: 'off_track', scope: 'scope2', status: 'all' });
    expect(m).toEqual(
      expect.objectContaining({ target: 'off_track', scope: 'scope2', status: 'all' }),
    );
  });
});

describe('aspect detail and plan detail', () => {
  it('lists what needs attention on an aspect', () => {
    expect(aspectNotices(makeAspect())).toEqual([]);
    expect(
      aspectNotices(
        makeAspect({ controls_missing: true, needs_emergency_plan: true, review_overdue: true }),
      ),
    ).toEqual(['controls', 'plan', 'review']);
    expect(aspectNotices(makeAspect({ evaluated: false }))).toEqual(['unscored']);
  });

  it('lists what needs attention on a plan', () => {
    expect(planNotices(makePlan())).toEqual([]);
    expect(
      planNotices(makePlan({ drill_overdue: true, open_revision_tasks: 2, aspects: [] })),
    ).toEqual(['drill', 'revision', 'noAspects']);
  });

  it('names drill participants and counts the others', () => {
    expect(
      participantNames(
        makeDrill({
          participants: 5,
          participant_list: [
            { id: 'u-1', name: 'Kari' },
            { id: 'u-2', name: 'Ola' },
          ],
        }),
      ),
    ).toEqual({ names: 'Kari, Ola', others: 3 });
    expect(participantNames(makeDrill({ participant_list: [] }))).toEqual({
      names: '',
      others: 12,
    });
  });
});

describe('aspect form model', () => {
  it('requires activity, aspect, the type of impact and an override reason', () => {
    expect(Object.keys(validateAspectForm(emptyAspectForm()))).toEqual([
      'activity',
      'aspect',
      'impact_type',
    ]);
    const v = emptyAspectForm({
      activity: 'A',
      aspect: 'B',
      impact_type: 'water',
      override: 'significant',
    });
    expect(validateAspectForm(v)).toEqual({
      override_reason: 'environment.form.errors.overrideReason',
    });
  });

  it('creates a body with trimmed text, nulls, links and only set scores', () => {
    const body = toAspectCreate(
      emptyAspectForm({
        activity: ' Washing ',
        aspect: 'Wash water',
        impact_type: 'water',
        scores: { severity: 3, probability: null },
        review_due: '2027-01-01',
        process: { id: 'proc-1', code: 'PRS-1', title: 'Maintenance' },
        obligations: [{ id: 'ob-1', code: 'OB-0003', title: 'Discharge permit' }],
      }),
    );
    expect(body.activity).toBe('Washing');
    expect(body.impact).toBeNull();
    expect(body.impact_type).toBe('water');
    expect(body.scores).toEqual({ severity: 3 });
    expect(body.significance_override).toBeNull();
    expect(body.review_due_at).toBe('2027-01-01T00:00:00');
    expect(body.process_id).toBe('proc-1');
    expect(body.obligation_ids).toEqual(['ob-1']);
    expect(body).not.toHaveProperty('legal_requirement');
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

  it('sends the obligation list when it changes ([] clears it)', () => {
    const original = aspectFormFrom(
      makeAspect({
        obligations: [
          { entity_type: 'compliance_obligation', id: 'ob-1', code: 'OB-1', title: 'T' },
        ],
      }),
    );
    expect(original.obligations.map((o) => o.id)).toEqual(['ob-1']);
    expect(toAspectUpdate(original, { ...original, obligations: [] }, '')).toEqual({
      obligation_ids: [],
    });
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

  it('fills a new aspect from a create-from-here prefill', () => {
    const f = aspectPrefill(emptyAspectForm(), { title: 'Noise', description: 'Loud', x: 1 });
    expect(f.aspect).toBe('Noise');
    expect(f.impact).toBe('Loud');
  });
});

describe('plan form model', () => {
  it('validates the title and named external contacts', () => {
    const v = planFormFrom(makePlan());
    expect(validatePlanForm({ ...v, title: ' ' })).toHaveProperty('title');
    expect(
      validatePlanForm({ ...v, contacts: [{ ...emptyContact('external'), role: 'Fire' }] }),
    ).toHaveProperty(['contacts.0']);
    expect(validatePlanForm({ ...v, contacts: [emptyContact('member')] })).toEqual({});
  });

  it('sends members by id and external contacts by name, and the covered aspects', () => {
    const v = planFormFrom(makePlan({ drill_rrule: null }));
    const body = toPlanCreate({
      ...v,
      aspects: [{ id: 'a-1', code: 'ASP-001', title: 'Spill' }],
      contacts: [
        { ...emptyContact('member'), user_id: 'u-1', phone: '123' },
        { ...emptyContact('external'), name: 'Fire service', phone: '110' },
        emptyContact('external'),
        emptyContact('member'),
      ],
    });
    expect(body.contacts).toEqual([
      { user_id: 'u-1', role: null, phone: '123', email: null },
      { name: 'Fire service', role: null, phone: '110', email: null },
    ]);
    expect(body.aspect_ids).toEqual(['a-1']);
    expect(body.drill_rrule).toBeNull();
    expect(body.drill_start).toBeNull();
    expect(contactDraftFrom({ user_id: 'u-2', name: 'Ada' })).toEqual(
      expect.objectContaining({ kind: 'member', user_id: 'u-2', name: 'Ada' }),
    );
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

  it('reads the prefill of "Create emergency plan" on an aspect', () => {
    const prefill = {
      title: 'Solvent spill',
      scenario: 'Storage of solvents',
      status: 'draft',
      aspect_ids: ['a-1', 3],
    };
    const f = planPrefill(planFormFrom(makePlan()), prefill);
    expect(f.title).toBe('Solvent spill');
    expect(f.status).toBe('draft');
    expect(prefillAspectIds(prefill)).toEqual(['a-1']);
    expect(
      addPicked([{ id: 'a-1', code: null, title: 'x' }], { id: 'a-1', code: null, title: 'x' }),
    ).toHaveLength(1);
  });
});

describe('metric and measurement form models', () => {
  it('parses decimals with a comma and validates factor, target and years', () => {
    expect(parseDecimal('2,68')).toBe(2.68);
    expect(parseDecimal('abc')).toBeNaN();
    const v = metricFormFrom(makeMetric());
    expect(validateMetricForm({ ...v, emission_factor: '-1' })).toHaveProperty('emission_factor');
    expect(validateMetricForm({ ...v, name: '', unit: '' })).toEqual(
      expect.objectContaining({ name: expect.any(String), unit: expect.any(String) }),
    );
    expect(validateMetricForm({ ...v, target_value: '100', target_year: '' })).toEqual({
      target_year: 'environment.form.errors.targetYear',
    });
    expect(validateMetricForm({ ...v, baseline_year: '24' })).toEqual({
      baseline_year: 'environment.form.errors.year',
    });
  });

  it('creates a metric with direction, target, baseline and factor source', () => {
    const body = toMetricCreate(
      emptyMetricForm({
        name: 'Electricity',
        unit: 'kWh',
        direction: 'decrease',
        target_value: '120 000',
        target_year: '2027',
        baseline_value: '150000',
        baseline_year: '2024',
        emission_factor: '0,019',
        factor_source: 'NVE',
        factor_year: '2025',
      }),
    );
    expect(body).toEqual(
      expect.objectContaining({
        direction: 'decrease',
        target_value: 120000,
        target_year: 2027,
        baseline_value: 150000,
        baseline_year: 2024,
        emission_factor: 0.019,
        factor_source: 'NVE',
        factor_year: 2025,
        collection_rrule: 'FREQ=MONTHLY',
      }),
    );
  });

  it('patches changed metric fields only', () => {
    const v = metricFormFrom(makeMetric());
    expect(toMetricUpdate(v, { ...v, emission_factor: '0,5' })).toEqual({ emission_factor: 0.5 });
    expect(toMetricUpdate(v, { ...v, collection_enabled: false })).toEqual({
      collection_rrule: null,
    });
    expect(toMetricUpdate(v, { ...v, target_value: '400', target_year: '2027' })).toEqual({
      target_value: 400,
      target_year: 2027,
    });
  });

  it('defaults to last month, checks the period and sends the source', () => {
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
    expect(
      toMeasurementCreate({ ...m, value: '1 234,5', period_end: '', source: 'invoice' }),
    ).toEqual({
      period_start: '2026-02-01',
      period_end: null,
      value: 1234.5,
      source: 'invoice',
      site: null,
      note: null,
    });
    expect(toMeasurementCreate({ ...m, value: '1' }).source).toBeNull();
  });

  it('rejects drills in the future, requires an outcome and counts the participants', () => {
    const now = new Date(2026, 5, 1, 12, 0);
    const errors = validateDrillForm({ ...emptyDrillForm('2026-06-02T10:00'), others: '2.5' }, now);
    expect(errors).toEqual({
      held_at: 'environment.errors.drill_in_future',
      outcome: 'environment.form.errors.required',
      others: 'environment.form.errors.wholeNumber',
    });
    const form = {
      ...emptyDrillForm('2026-05-02T10:00'),
      outcome: 'effective' as const,
      participant_user_ids: ['u-1', 'u-2'],
      others: '3',
      plan_revision_needed: true,
    };
    expect(drillHeadCount(form)).toBe(5);
    expect(drillHeadCount(emptyDrillForm())).toBeNull();
    const body = toDrillCreate(form);
    expect(body.participants).toBe(5);
    expect(body.participant_user_ids).toEqual(['u-1', 'u-2']);
    expect(body.plan_revision_needed).toBe(true);
  });
});

describe('emissions', () => {
  it('says "not mapped" instead of zero and computes shares', () => {
    const e = makeEmissions();
    expect(scopeMeasured(e, 'scope1')).toBe(true);
    expect(scopeMeasured(e, 'scope3')).toBe(false);
    expect(scopeMeasured({ ...e, scope_status: undefined }, 'scope2')).toBe(true);
    expect(scopeShare(e, 'scope1')).toBe(75);
    expect(exportFileName(2026, 'nb')).toBe('utslipp-2026.csv');
    expect(exportFileName(2026, 'en')).toBe('emissions-2026.csv');
  });
});

describe('scoring settings model', () => {
  it('validates the draft like the backend (names, not keys)', () => {
    const draft = {
      method: 'sum' as const,
      criteria: [
        { ...emptyCriterion(), key: 'severity', label: { en: 'Severity', nb: '' } },
        { ...emptyCriterion(), label: { en: 'severity', nb: '' } },
        { ...emptyCriterion(), weight: '0' },
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
      'criteria.1.label': 'environment.scoring.errors.duplicate',
      'criteria.2.label': 'environment.scoring.errors.label',
      'criteria.2.weight': 'environment.scoring.errors.weight',
    });
  });

  it('builds the PUT body with descriptions and levels, and leaves new keys to the backend', () => {
    const draft = {
      method: 'sum' as const,
      criteria: [
        {
          key: 'severity',
          label: { en: 'Severity', nb: 'Alvorlighet' },
          description: { en: 'How much harm', nb: '' },
          weight: '1,5',
          levels: { '1': { en: 'None', nb: 'Ingen' }, '9': { en: 'Off scale', nb: '' } },
        },
        { ...emptyCriterion(), label: { en: '', nb: 'Støy' } },
      ],
      scale_min: '1',
      scale_max: '5',
      threshold: '6',
      legal_requirement_significant: true,
      emergency_significant: true,
    };
    expect(toScoringIn(draft)).toEqual({
      method: 'sum',
      criteria: [
        {
          key: 'severity',
          label: { en: 'Severity', nb: 'Alvorlighet' },
          description: { en: 'How much harm' },
          weight: 1.5,
          levels: { '1': { en: 'None', nb: 'Ingen' } },
        },
        { label: { nb: 'Støy' }, description: {}, weight: 1, levels: {} },
      ],
      scale_min: 1,
      scale_max: 5,
      threshold: 6,
      legal_requirement_significant: true,
      emergency_significant: true,
    });
    expect(draftMaxScore(draft)).toBe(12.5);
    expect(draftMaxScore({ ...draft, method: 'product' })).toBe(25);
    expect(draftScale(draft)).toEqual([1, 2, 3, 4, 5]);
    expect(draftScale({ ...draft, scale_max: 'x' })).toEqual([]);
  });

  it('reads a method with level descriptions into a draft', () => {
    const d = draftFromMethod(makeMethod());
    expect(d.criteria[0].levels['5']).toEqual({
      en: 'Severe and lasting harm',
      nb: 'Alvorlig og varig skade',
    });
    expect(d.criteria[1].description).toEqual({ en: '', nb: '' });
  });
});
