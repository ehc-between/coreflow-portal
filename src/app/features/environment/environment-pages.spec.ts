import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { AspectDetail } from './aspect-detail';
import { AspectEditor } from './aspect-editor';
import { AspectsList } from './aspects-list';
import { EmissionsPage } from './emissions-page';
import { EnvironmentOverviewPage } from './environment-overview';
import {
  makeAspect,
  makeDrill,
  makeEmissions,
  makeMeasurement,
  makeMethod,
  makeMetric,
  makeOverview,
  makePlan,
} from './environment.testing';
import { MetricDetail } from './metric-detail';
import { PlanDetail } from './plan-detail';
import { ScoringSettings } from './scoring-settings';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function toasts() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

const env = (path: string) => kitUrl(`environment/${path}`);

/** Answer the platform kit requests a detail page makes (tasks, watchers, links, flows). */
function flushKit(http: HttpTestingController): void {
  for (const req of http.match((r) => !r.url.includes('/environment/'))) {
    req.flush(req.request.url.endsWith('/watch') ? { watching: false } : { items: [], total: 0 });
  }
}

function setup<T>(component: Type<T>, permissions: readonly string[]) {
  const notify = toasts();
  const { http } = configureKit(component, {
    permissions,
    providers: [
      ...provideFakeGuidance().providers,
      { provide: NotificationService, useValue: notify },
    ],
  });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(component);
  return { http, notify, fixture, el: fixture.nativeElement as HTMLElement };
}

const ALL = ['environment:read', 'environment:write', 'environment:manage', 'environment:record'];

describe('EnvironmentOverviewPage', () => {
  it('shows what needs follow-up first, clickable numbers and no requirement cards without access', async () => {
    const { http, fixture, el } = setup(EnvironmentOverviewPage, ['environment:read']);
    await render(fixture);
    http.expectOne(env('overview')).flush(makeOverview());
    await render(fixture);
    expect(el.querySelector('[data-testid="page-title"]')?.textContent).toContain('Environment');
    expect(el.querySelector('[data-testid="tile-aspectsTotal"]')?.textContent).toContain('5');
    // U30: one key-figures band; four headline tiles first, the rest behind "Show all".
    const band = el.querySelector('[data-testid="overview-tiles"]')!;
    const tiles = Array.from(band.querySelectorAll<HTMLElement>('a[data-testid^="tile-"]'));
    expect(tiles.slice(0, 4).map((t) => t.dataset['testid'])).toEqual([
      'tile-aspectsTotal',
      'tile-aspectsSignificant',
      'tile-plansActive',
      'tile-emissionsYtd',
    ]);
    expect(tiles.filter((t) => !t.hasAttribute('data-kpi-extra')).length).toBe(4);
    const attention = el.querySelector('[data-testid="overview-attention"]');
    expect(attention?.querySelectorAll('li').length).toBe(2);
    const drill = el.querySelector<HTMLAnchorElement>('[data-testid="attention-plansDrill"]')!;
    expect(drill.getAttribute('href')).toBe('/environment/emergency-plans?attention=drill_overdue');
    const tile = el.querySelector<HTMLAnchorElement>('[data-testid="tile-aspectsSignificant"]')!;
    expect(tile.getAttribute('href')).toBe('/environment/aspects?significance=significant');
    expect(el.querySelector('[data-testid="overview-obligations"]')).toBeNull();
    expect(el.querySelector('[data-testid="overview-objectives"]')).toBeNull();
  });

  it('shows obligations with evaluation status, objectives and ISO 14001 coverage', async () => {
    const { http, fixture, el } = setup(EnvironmentOverviewPage, ['environment:read']);
    await render(fixture);
    http.expectOne(env('overview')).flush(
      makeOverview({
        plans_drill_overdue: 0,
        aspects_draft: 0,
        obligations: [
          {
            id: 'ob-1',
            code: 'OB-0003',
            title: 'Discharge permit',
            status: 'active',
            compliance_status: 'compliant',
            next_evaluation_at: '2027-03-01T00:00:00',
            evaluation_overdue: false,
            last_evaluated_at: null,
            url: '/obligations/ob-1',
          },
        ],
        obligations_total: 1,
        obligations_evaluation_overdue: 0,
        next_compliance_evaluation_at: '2027-03-01T00:00:00',
        objectives: [
          {
            id: 'o-1',
            code: 'OBJ-003',
            title: 'Cut electricity 10 %',
            status: 'active',
            progress: 40,
            due_date: '2027-12-31',
            url: '/objectives/o-1',
          },
        ],
        requirements: { standard_key: 'iso14001-2015', covered: 6, applicable: 20, pct: 30 },
      }),
    );
    await render(fixture);
    expect(el.querySelector('[data-testid="overview-all-good"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="overview-obligations"]')?.textContent).toContain(
      'OB-0003',
    );
    expect(el.querySelector('[data-testid="overview-objectives"]')?.textContent).toContain(
      'OBJ-003',
    );
    expect(el.querySelector('[data-testid="overview-coverage"]')?.textContent).toContain('30 %');
  });
});

describe('AspectsList', () => {
  it('loads open aspects and shows significance and missing controls', async () => {
    const { http, fixture, el } = setup(AspectsList, ['environment:read', 'environment:write']);
    await render(fixture);
    const req = http.expectOne((r) => r.url === env('aspects'));
    expect(req.request.params.get('status')).toBe('draft,active');
    expect(req.request.params.get('sort')).toBe('code');
    req.flush({
      items: [makeAspect({ controls_missing: true, threshold: 12, max_score: 20 })],
      total: 1,
    });
    await render(fixture);
    const rows = el.querySelector('[data-testid="aspect-rows"]');
    expect(rows?.textContent).toContain('ASP-001');
    expect(rows?.textContent).toContain('Wash water discharge');
    // Significant (warn) and "no controls" (warn); an active status is not repeated.
    expect(rows?.querySelectorAll('app-status-badge [data-tone="warn"]').length).toBe(2);
    expect(el.querySelector('[data-testid="new-aspect"]')).toBeTruthy();
  });

  it('filters on significance and on follow-up, and hides "new" without write', async () => {
    const { http, fixture, el } = setup(AspectsList, ['environment:read']);
    await render(fixture);
    http.expectOne((r) => r.url === env('aspects')).flush({ items: [makeAspect()], total: 1 });
    await render(fixture);
    expect(el.querySelector('[data-testid="new-aspect"]')).toBeNull();
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-significance"]')!;
    select.value = 'significant';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne((r) => r.url === env('aspects'));
    expect(req.request.params.get('significant')).toBe('true');
    req.flush({ items: [makeAspect()], total: 1 });
    await render(fixture);
    const attention = el.querySelector<HTMLSelectElement>('[data-testid="filter-attention"]')!;
    attention.value = 'needs_emergency_plan';
    attention.dispatchEvent(new Event('change'));
    await render(fixture);
    const req2 = http.expectOne((r) => r.url === env('aspects'));
    expect(req2.request.params.get('attention')).toBe('needs_emergency_plan');
    req2.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();
  });
});

describe('AspectEditor', () => {
  it('previews "score of max · significant from" and creates the aspect', async () => {
    const { http, fixture, el, notify } = setup(AspectEditor, ALL);
    await render(fixture);
    http.expectOne(env('scoring')).flush(makeMethod());
    await render(fixture);
    const type = (testid: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('aspect-activity', 'Vehicle washing');
    type('aspect-aspect', 'Wash water');
    const impact = el.querySelector<HTMLSelectElement>('[data-testid="aspect-impact-type"]')!;
    expect(impact.value).toBe('');
    impact.value = 'water';
    impact.dispatchEvent(new Event('change'));
    for (const [key, value] of [
      ['severity', '4'],
      ['probability', '3'],
      ['extent', '2'],
      ['stakeholder_concern', '4'],
    ]) {
      const select = el.querySelector<HTMLSelectElement>(`[data-testid="score-${key}"]`)!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }
    await render(fixture);
    const severity = el.querySelector<HTMLSelectElement>('[data-testid="score-severity"]')!;
    expect(severity.textContent).toContain('5 – Severe and lasting harm');
    const preview = el.querySelector('[data-testid="score-preview"]')?.textContent ?? '';
    expect(preview).toContain('environment.aspect.scoreLine');
    expect(
      el.querySelector('[data-testid="score-preview"] app-status-badge [data-tone="warn"]'),
    ).toBeTruthy();
    el.querySelector<HTMLElement>('[data-testid="aspect-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne((r) => r.url === env('aspects') && r.method === 'POST');
    expect(req.request.body.activity).toBe('Vehicle washing');
    expect(req.request.body.impact_type).toBe('water');
    expect(req.request.body.obligation_ids).toEqual([]);
    expect(req.request.body.scores).toEqual({
      severity: 4,
      probability: 3,
      extent: 2,
      stakeholder_concern: 4,
    });
    req.flush(makeAspect());
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('environment.notices.created', {
      code: 'ASP-001',
    });
  });

  it('does not submit without the required fields and says what to fix', async () => {
    const { http, fixture, el } = setup(AspectEditor, ALL);
    await render(fixture);
    http.expectOne(env('scoring')).flush(makeMethod());
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="aspect-save"] button')!.click();
    await render(fixture);
    expect(http.match((r) => r.method === 'POST')).toEqual([]);
    expect(el.textContent).toContain('environment.form.errors.required');
    expect(el.textContent).toContain('environment.form.errors.chooseOne');
    expect(el.textContent).toContain('environment.form.fixErrors');
  });
});

describe('AspectDetail', () => {
  it('renders the evaluation, the connections and marks the aspect as reviewed', async () => {
    const { http, fixture, el, notify } = setup(AspectDetail, ALL);
    fixture.componentRef.setInput('id', 'a-1');
    await render(fixture);
    http.expectOne(env('scoring')).flush(makeMethod());
    http.expectOne(env('aspects/a-1')).flush(
      makeAspect({
        threshold: 12,
        max_score: 20,
        obligations: [
          {
            entity_type: 'compliance_obligation',
            id: 'ob-1',
            code: 'OB-0003',
            title: 'Discharge permit',
            url: '/obligations/ob-1',
          },
        ],
        controls: [
          {
            entity_type: 'document',
            id: 'd-1',
            code: 'PRO-010',
            title: 'Washing procedure',
            url: '/documents/d-1',
          },
        ],
      }),
    );
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="page-title"]')?.textContent).toContain(
      'Wash water discharge',
    );
    expect(el.querySelector('[data-testid="aspect-scores"]')?.textContent).toContain('Severity');
    expect(el.querySelector('[data-testid="aspect-score"]')?.textContent).toContain(
      'environment.aspect.scoreLine',
    );
    expect(el.querySelector('[data-testid="aspect-obligations"]')?.textContent).toContain(
      'OB-0003',
    );
    expect(el.querySelector('[data-testid="aspect-linked-controls"]')?.textContent).toContain(
      'PRO-010',
    );
    expect(el.querySelector('[data-testid="aspect-notices"]')).toBeNull();
    el.querySelector<HTMLElement>('[data-testid="aspect-review"] button')!.click();
    await render(fixture);
    const confirm = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) =>
      b.textContent?.includes('environment.review.confirm'),
    ) as HTMLButtonElement;
    confirm.click();
    await render(fixture);
    const req = http.expectOne(env('aspects/a-1/review'));
    expect(req.request.body.next_review_at).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
    req.flush(makeAspect({ last_reviewed_at: '2026-11-12T10:00:00' }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('environment.notices.reviewed', {
      code: 'ASP-001',
    });
  });

  it('says what is missing and starts "create emergency plan" from the aspect', async () => {
    const { http, fixture, el } = setup(AspectDetail, ALL);
    const start = vi.spyOn(TestBed.inject(CreateFlowService), 'start').mockResolvedValue(true);
    fixture.componentRef.setInput('id', 'a-1');
    await render(fixture);
    http.expectOne(env('scoring')).flush(makeMethod());
    http.expectOne(env('aspects/a-1')).flush(
      makeAspect({
        condition: 'emergency',
        controls_missing: true,
        needs_emergency_plan: true,
        operational_controls: null,
      }),
    );
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="aspect-notice-controls"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="aspect-notice-plan"]')).toBeTruthy();
    el.querySelector<HTMLElement>('[data-testid="aspect-make-plan"] button')!.click();
    expect(start).toHaveBeenCalledWith('env_aspect.to_emergency_plan', 'env_aspect', 'a-1');
  });

  it('shows a coded error when the aspect cannot be loaded', async () => {
    const { http, fixture, el } = setup(AspectDetail, ['environment:read']);
    fixture.componentRef.setInput('id', 'a-1');
    await render(fixture);
    http.expectOne(env('scoring')).flush(makeMethod());
    http
      .expectOne(env('aspects/a-1'))
      .flush({ detail: { code: 'aspect_not_found' } }, { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(el.textContent).toContain('environment.errors.aspect_not_found');
  });
});

describe('PlanDetail', () => {
  it('lists drills and records a new one with participants', async () => {
    const { http, fixture, el, notify } = setup(PlanDetail, ALL);
    fixture.componentRef.setInput('id', 'p-1');
    await render(fixture);
    http.expectOne(env('emergency-plans/p-1')).flush(makePlan());
    http.expectOne(env('emergency-plans/p-1/drills')).flush({ items: [makeDrill()], total: 1 });
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="drill-rows"]')?.textContent).toContain(
      'Spill kit was missing',
    );
    el.querySelector<HTMLElement>('[data-testid="record-drill"] button')!.click();
    await render(fixture);
    expect(document.querySelector('[data-testid="drill-save"]')?.textContent).toContain(
      'environment.drill.save.drill',
    );
    document.querySelector<HTMLInputElement>('[data-testid="drill-outcome-effective"]')!.click();
    await render(fixture);
    document.querySelector<HTMLElement>('[data-testid="drill-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(
      (r) => r.url === env('emergency-plans/p-1/drills') && r.method === 'POST',
    );
    expect(req.request.body.outcome).toBe('effective');
    expect(req.request.body.participant_user_ids).toEqual([]);
    expect(req.request.body.held_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    req.flush(makeDrill({ outcome: 'effective', plan_revision_needed: false }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('environment.notices.drillRecorded');
    http.expectOne(env('emergency-plans/p-1')).flush(makePlan({ drill_count: 1 }));
    http.expectOne(env('emergency-plans/p-1/drills')).flush({ items: [], total: 0 });
  });

  it('offers a deviation after a real event is recorded', async () => {
    const { http, fixture, notify } = setup(PlanDetail, [...ALL, 'deviations:write']);
    fixture.componentRef.setInput('id', 'p-1');
    await render(fixture);
    http.expectOne(env('emergency-plans/p-1')).flush(makePlan());
    http.expectOne(env('emergency-plans/p-1/drills')).flush({ items: [], total: 0 });
    await render(fixture);
    flushKit(http);
    await render(fixture);
    fixture.nativeElement.querySelector('[data-testid="record-drill"] button').click();
    await render(fixture);
    document.querySelector<HTMLInputElement>('[data-testid="drill-kind-real_event"]')!.click();
    document.querySelector<HTMLInputElement>('[data-testid="drill-outcome-ineffective"]')!.click();
    await render(fixture);
    expect(document.querySelector('[data-testid="drill-save"]')?.textContent).toContain(
      'environment.drill.save.real_event',
    );
    document.querySelector<HTMLElement>('[data-testid="drill-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(
      (r) => r.url === env('emergency-plans/p-1/drills') && r.method === 'POST',
    );
    expect(req.request.body.kind).toBe('real_event');
    req.flush(makeDrill({ id: 'd-9', kind: 'real_event', plan_revision_needed: true }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('environment.notices.drillRecordedWithTask');
    expect(document.body.textContent).toContain('environment.drill.deviationPromptTitle');
    http.match((r) => r.url.includes('/emergency-plans/p-1')).forEach((r) => r.flush(makePlan()));
  });

  it('hides recording without the record permission', async () => {
    const { http, fixture, el } = setup(PlanDetail, ['environment:read']);
    fixture.componentRef.setInput('id', 'p-1');
    await render(fixture);
    http.expectOne(env('emergency-plans/p-1')).flush(makePlan());
    http.expectOne(env('emergency-plans/p-1/drills')).flush({ items: [], total: 0 });
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="record-drill"]')).toBeNull();
    expect(el.querySelector('[data-testid="plan-edit"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-drills"]')).toBeTruthy();
  });
});

describe('MetricDetail', () => {
  it('shows the target, the trend and measurements and records a value', async () => {
    const { http, fixture, el, notify } = setup(MetricDetail, ALL);
    fixture.componentRef.setInput('id', 'm-1');
    await render(fixture);
    http.expectOne(env('metrics/m-1')).flush(
      makeMetric({
        target_value: 4800,
        target_year: 2027,
        direction: 'decrease',
        last_12_months_value: 5200,
        target_status: 'off_track',
      }),
    );
    const trend = http.expectOne((r) => r.url === env('metrics/m-1/trend'));
    expect(trend.request.params.get('bucket')).toBe('month');
    trend.flush({
      metric_id: 'm-1',
      unit: 'l',
      bucket: 'month',
      points: [{ period: '2026-02-01', value: 500, co2e_kg: 1340, count: 1, change_pct: null }],
      total: 500,
      total_co2e_kg: 1340,
    });
    http
      .expectOne((r) => r.url === env('metrics/m-1/measurements'))
      .flush({ items: [makeMeasurement({ source: 'invoice', attachment_count: 1 })], total: 1 });
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="metric-target"]')?.textContent).toContain(
      'environment.metric.targetText.decrease',
    );
    expect(el.querySelector('[data-testid="trend-chart"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="trend-target"]')).toBeTruthy();
    const rows = el.querySelector('[data-testid="measurement-rows"]')?.textContent ?? '';
    expect(rows).toContain('500');
    expect(rows).toContain('environment.sources.invoice');

    el.querySelector<HTMLElement>('[data-testid="record-measurement"] button')!.click();
    await render(fixture);
    const value = document.querySelector<HTMLInputElement>('[data-testid="measurement-value"]')!;
    value.value = '420,5';
    value.dispatchEvent(new Event('input'));
    const source = document.querySelector<HTMLSelectElement>('[data-testid="measurement-source"]')!;
    source.value = 'meter_reading';
    source.dispatchEvent(new Event('change'));
    await render(fixture);
    document.querySelector<HTMLElement>('[data-testid="measurement-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(
      (r) => r.url === env('metrics/m-1/measurements') && r.method === 'POST',
    );
    expect(req.request.body.value).toBe(420.5);
    expect(req.request.body.source).toBe('meter_reading');
    expect(req.request.body.period_start).toMatch(/^\d{4}-\d{2}-01$/);
    req.flush(makeMeasurement({ value: 420.5 }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('environment.notices.measurementRecorded');
  });

  it('switches the trend bucket', async () => {
    const { http, fixture, el } = setup(MetricDetail, ['environment:read']);
    fixture.componentRef.setInput('id', 'm-1');
    await render(fixture);
    http.expectOne(env('metrics/m-1')).flush(makeMetric());
    http
      .expectOne((r) => r.url === env('metrics/m-1/trend'))
      .flush({
        metric_id: 'm-1',
        unit: 'l',
        bucket: 'month',
        points: [],
        total: 0,
        total_co2e_kg: null,
      });
    http.expectOne((r) => r.url === env('metrics/m-1/measurements')).flush({ items: [], total: 0 });
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="record-measurement"]')).toBeNull();
    expect(el.querySelector('[data-testid="trend-empty"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="metric-no-target"]')).toBeTruthy();
    el.querySelector<HTMLButtonElement>('[data-testid="bucket-year"]')!.click();
    await render(fixture);
    const req = http.expectOne((r) => r.url === env('metrics/m-1/trend'));
    expect(req.request.params.get('bucket')).toBe('year');
    req.flush({
      metric_id: 'm-1',
      unit: 'l',
      bucket: 'year',
      points: [],
      total: 0,
      total_co2e_kg: null,
    });
  });
});

describe('EmissionsPage', () => {
  it('shows "not mapped" for a scope without data and lists what is left out', async () => {
    const { http, fixture, el } = setup(EmissionsPage, ALL);
    await render(fixture);
    http.expectOne((r) => r.url === env('emissions')).flush(makeEmissions());
    await render(fixture);
    expect(el.querySelector('[data-testid="scope-scope3"]')?.textContent).toContain(
      'environment.emissions.notMeasured',
    );
    expect(el.querySelector('[data-testid="scope-scope1"]')?.textContent).not.toContain(
      'environment.emissions.notMeasured',
    );
    expect(el.querySelector('[data-testid="emissions-gaps"]')?.textContent).toContain('MET-003');
    expect(el.querySelector('[data-testid="emissions-table"]')?.textContent).toContain(
      'environment.metric.factorFrom',
    );
    expect(el.querySelector('[data-testid="emissions-change"]')?.textContent).toContain(
      'environment.emissions.up',
    );
  });
});

describe('ScoringSettings', () => {
  it('hides technical keys, shows level descriptions and the change log', async () => {
    const { http, fixture, el } = setup(ScoringSettings, ALL);
    await render(fixture);
    http.expectOne(env('scoring')).flush(
      makeMethod({
        is_default: false,
        updated_at: '2026-10-01T09:00:00',
        updated_by_name: 'Kari Nordmann',
        history: [
          {
            at: '2026-10-01T09:00:00',
            actor_name: 'Kari Nordmann',
            method: 'sum',
            threshold: 12,
            criteria: ['Severity'],
            recomputed: 6,
          },
        ],
      }),
    );
    await render(fixture);
    expect(el.textContent).not.toContain('stakeholder_concern');
    const levels = Array.from(el.querySelectorAll<HTMLInputElement>('input.cf-level')).map(
      (i) => i.value,
    );
    expect(levels).toContain('Severe and lasting harm');
    expect(el.querySelector('[data-testid="scoring-history"]')?.textContent).toContain(
      'Kari Nordmann',
    );
  });
});
