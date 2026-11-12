import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { AspectDetail } from './aspect-detail';
import { AspectEditor } from './aspect-editor';
import { AspectsList } from './aspects-list';
import { EnvironmentOverviewPage } from './environment-overview';
import {
  makeAspect,
  makeDrill,
  makeMeasurement,
  makeMethod,
  makeMetric,
  makePlan,
} from './environment.testing';
import { MetricDetail } from './metric-detail';
import { PlanDetail } from './plan-detail';

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

/** Answer the platform kit requests a detail page makes (tasks, watchers, links). */
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
  it('shows the headline numbers and what needs attention', async () => {
    const { http, fixture, el } = setup(EnvironmentOverviewPage, ['environment:read']);
    await render(fixture);
    http.expectOne(env('overview')).flush({
      aspects_total: 5,
      aspects_significant: 2,
      aspects_draft: 1,
      aspects_review_overdue: 0,
      plans_total: 2,
      plans_active: 2,
      plans_drill_overdue: 1,
      plans_review_overdue: 0,
      metrics_active: 3,
      measurements_last_12_months: 30,
      emissions_ytd_kg: 12500,
    });
    await render(fixture);
    expect(el.querySelector('[data-testid="overview-aspects"]')?.textContent).toContain('5');
    const attention = el.querySelector('[data-testid="overview-attention"]');
    expect(attention?.querySelectorAll('li').length).toBe(2);
  });
});

describe('AspectsList', () => {
  it('loads open aspects and shows score and significance', async () => {
    const { http, fixture, el } = setup(AspectsList, ['environment:read', 'environment:write']);
    await render(fixture);
    const req = http.expectOne((r) => r.url === env('aspects'));
    expect(req.request.params.get('status')).toBe('draft,active');
    expect(req.request.params.get('sort')).toBe('-updated_at');
    req.flush({ items: [makeAspect()], total: 1 });
    await render(fixture);
    const rows = el.querySelector('[data-testid="aspect-rows"]');
    expect(rows?.textContent).toContain('ASP-001');
    expect(rows?.textContent).toContain('Wash water discharge');
    expect(rows?.textContent).toContain('environment.aspect.significant');
    expect(el.querySelector('[data-testid="new-aspect"]')).toBeTruthy();
  });

  it('filters on significance and hides "new" without write', async () => {
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
    req.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();
  });
});

describe('AspectEditor', () => {
  it('previews the score and creates the aspect', async () => {
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
    expect(el.querySelector('[data-testid="score-preview"]')?.textContent).toContain(
      'environment.aspect.significant',
    );
    el.querySelector<HTMLElement>('[data-testid="aspect-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne((r) => r.url === env('aspects') && r.method === 'POST');
    expect(req.request.body.activity).toBe('Vehicle washing');
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

  it('does not submit without the required fields', async () => {
    const { http, fixture, el } = setup(AspectEditor, ALL);
    await render(fixture);
    http.expectOne(env('scoring')).flush(makeMethod());
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="aspect-save"] button')!.click();
    await render(fixture);
    expect(http.match((r) => r.method === 'POST')).toEqual([]);
    expect(el.textContent).toContain('environment.form.errors.required');
  });
});

describe('AspectDetail', () => {
  it('renders the evaluation and marks the aspect as reviewed', async () => {
    const { http, fixture, el, notify } = setup(AspectDetail, ALL);
    fixture.componentRef.setInput('id', 'a-1');
    await render(fixture);
    http.expectOne(env('scoring')).flush(makeMethod());
    http.expectOne(env('aspects/a-1')).flush(makeAspect());
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="aspect-heading"]')?.textContent).toContain(
      'Wash water discharge',
    );
    expect(el.querySelector('[data-testid="aspect-scores"]')?.textContent).toContain('Severity');
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
  it('lists drills and records a new one', async () => {
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
    const outcome = document.querySelector<HTMLInputElement>(
      '[data-testid="drill-outcome-effective"]',
    )!;
    outcome.click();
    await render(fixture);
    document.querySelector<HTMLElement>('[data-testid="drill-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(
      (r) => r.url === env('emergency-plans/p-1/drills') && r.method === 'POST',
    );
    expect(req.request.body.outcome).toBe('effective');
    expect(req.request.body.held_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    req.flush(makeDrill({ outcome: 'effective' }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('environment.notices.drillRecorded');
    http.expectOne(env('emergency-plans/p-1')).flush(makePlan({ drill_count: 1 }));
    http.expectOne(env('emergency-plans/p-1/drills')).flush({ items: [], total: 0 });
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
  it('shows the trend and measurements and records a value', async () => {
    const { http, fixture, el, notify } = setup(MetricDetail, ALL);
    fixture.componentRef.setInput('id', 'm-1');
    await render(fixture);
    http.expectOne(env('metrics/m-1')).flush(makeMetric());
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
      .flush({ items: [makeMeasurement()], total: 1 });
    await render(fixture);
    flushKit(http);
    await render(fixture);
    expect(el.querySelector('[data-testid="trend-chart"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="measurement-rows"]')?.textContent).toContain('500');

    el.querySelector<HTMLElement>('[data-testid="record-measurement"] button')!.click();
    await render(fixture);
    const value = document.querySelector<HTMLInputElement>('[data-testid="measurement-value"]')!;
    value.value = '420,5';
    value.dispatchEvent(new Event('input'));
    await render(fixture);
    document.querySelector<HTMLElement>('[data-testid="measurement-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(
      (r) => r.url === env('metrics/m-1/measurements') && r.method === 'POST',
    );
    expect(req.request.body.value).toBe(420.5);
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
