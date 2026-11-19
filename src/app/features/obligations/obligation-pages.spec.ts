import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { ObligationDetail } from './obligation-detail';
import { ObligationsList } from './obligations-list';
import { makeEvaluation, makeObligation, makeObligationItem } from './obligations.testing';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function toasts() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

const SUMMARY = {
  total: 3,
  by_status: { active: 3 },
  by_compliance_status: { compliant: 1, partially_compliant: 1, non_compliant: 1 },
  not_fully_compliant: 2,
  not_evaluated: 0,
  without_schedule: 1,
  renewal_due: 0,
  evaluations_overdue: 1,
  expiring_soon: 0,
  expiring_within_days: 60,
  open_changes: 2,
};

describe('ObligationsList', () => {
  function setup(permissions: readonly string[] = ['obligations:read', 'obligations:write']) {
    const { http } = configureKit(ObligationsList, {
      permissions,
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(ObligationsList);
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const listUrl = kitUrl('obligations');
  const summaryUrl = kitUrl('obligations/summary');

  it('loads current obligations and the summary, and renders each row', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http.expectOne((r) => r.url === summaryUrl).flush(SUMMARY);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('status')).toBe('draft,active');
    expect(req.request.params.get('sort')).toBe('-updated_at');
    req.flush({ items: [makeObligationItem()], total: 1 });
    await render(fixture);
    const rows = el.querySelector('[data-testid="obligation-rows"]');
    expect(rows?.textContent).toContain('OB-0001');
    expect(rows?.textContent).toContain('Pollution Control Act permit');
    expect(rows?.textContent).toContain('Compliant');
    expect(el.querySelector('[data-testid="tile-not-fully"]')?.textContent).toContain('2');
    expect(el.querySelector('[data-testid="new-obligation"]')).toBeTruthy();
  });

  it('re-queries when a filter or summary tile is used', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http.expectOne((r) => r.url === summaryUrl).flush(SUMMARY);
    http.expectOne((r) => r.url === listUrl).flush({ items: [makeObligationItem()], total: 1 });
    await render(fixture);

    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-compliance"]')!;
    select.value = 'non_compliant';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const byCompliance = http.expectOne((r) => r.url === listUrl);
    expect(byCompliance.request.params.get('compliance')).toBe('non_compliant');
    byCompliance.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();

    el.querySelector<HTMLButtonElement>('[data-testid="tile-overdue"]')!.click();
    await render(fixture);
    const overdue = http.expectOne((r) => r.url === listUrl);
    expect(overdue.request.params.get('evaluation_overdue')).toBe('true');
    expect(overdue.request.params.get('compliance')).toBeNull();
    overdue.flush({ items: [], total: 0 });
    await render(fixture);

    el.querySelector<HTMLButtonElement>('[data-testid="tile-not-fully"]')!.click();
    await render(fixture);
    const notFully = http.expectOne((r) => r.url === listUrl);
    expect(notFully.request.params.get('compliance')).toBe('partially_compliant,non_compliant');
    expect(notFully.request.params.get('evaluation_overdue')).toBeNull();
    notFully.flush({ items: [], total: 0 });
    await render(fixture);

    el.querySelector<HTMLButtonElement>('[data-testid="tile-without-schedule"]')!.click();
    await render(fixture);
    const unplanned = http.expectOne((r) => r.url === listUrl);
    expect(unplanned.request.params.get('without_schedule')).toBe('true');
    unplanned.flush({ items: [makeObligationItem({ needs_schedule: true })], total: 1 });
    await render(fixture);
    expect(el.querySelector('[data-testid="row-no-plan"]')).toBeTruthy();
  });

  it('shows the teaching empty state for an empty register and hides "new" without write', async () => {
    const { http, fixture, el } = setup(['obligations:read']);
    await render(fixture);
    http.expectOne((r) => r.url === summaryUrl).flush({ ...SUMMARY, total: 0 });
    http.expectOne((r) => r.url === listUrl).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="obligation-rows"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-match"]')).toBeNull();
    expect(el.querySelector('[data-testid="new-obligation"]')).toBeNull();
  });
});

describe('ObligationDetail', () => {
  function setup(obligation = makeObligation()) {
    const notify = toasts();
    const { http } = configureKit(ObligationDetail, {
      permissions: ['obligations:read', 'obligations:write', 'obligations:evaluate'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(ObligationDetail);
    fixture.componentRef.setInput('id', obligation.id);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  async function loaded(obligation = makeObligation()) {
    const ctx = setup(obligation);
    await render(ctx.fixture);
    ctx.http.expectOne(kitUrl(`obligations/${obligation.id}`)).flush(obligation);
    await render(ctx.fixture);
    for (const req of ctx.http.match((r) => r.url === kitUrl('attachments'))) {
      req.flush([]);
    }
    for (const req of ctx.http.match(kitUrl(`obligations/${obligation.id}/evaluations`))) {
      req.flush({ items: [makeEvaluation()] });
    }
    for (const req of ctx.http.match(kitUrl(`obligations/${obligation.id}/changes`))) {
      req.flush({ items: [] });
    }
    for (const req of ctx.http.match(kitUrl(`obligations/${obligation.id}/actions`))) {
      req.flush({ items: [], total: 0 });
    }
    await render(ctx.fixture);
    return ctx;
  }

  it('renders the obligation, its duties, the next step and the evaluation history', async () => {
    const { el } = await loaded();
    expect(el.querySelector('[data-testid="page-title"]')?.textContent).toContain(
      'Pollution Control Act permit',
    );
    expect(el.querySelector('[data-testid="duty-rows"]')?.textContent).toContain(
      'Measure noise every quarter',
    );
    expect(el.querySelector('[data-testid="duty-rows"]')?.textContent).toContain('OB-0001-2');
    expect(
      el.querySelector('[data-testid="obligation-compliance"]')?.getAttribute('data-kind'),
    ).toBe('compliant');
    expect(el.querySelector('[data-testid="record-missing-item"]')).toBeNull();
    expect(el.querySelector('[data-testid="evaluation-rows"]')?.textContent).toContain(
      'Noise within limits.',
    );
    expect(el.querySelector('[data-testid="evaluation-add"]')).toBeTruthy();
  });

  it('records a non-compliant evaluation with a follow-up action', async () => {
    const { el, http, fixture, notify } = await loaded();
    el.querySelector<HTMLElement>('[data-testid="evaluation-add"] button')!.click();
    await render(fixture);
    const duty = el.querySelector<HTMLSelectElement>('[data-testid="evaluation-duty-OB-0001-1"]')!;
    duty.value = 'non_compliant';
    duty.dispatchEvent(new Event('change'));
    await render(fixture);
    expect(el.querySelector('[data-testid="evaluation-followup"]')).toBeTruthy();
    // Without findings the evaluation is not sent.
    el.querySelector<HTMLElement>('[data-testid="evaluation-save"] button')!.click();
    await render(fixture);
    http.expectNone({ method: 'POST', url: kitUrl('obligations/o-1/evaluations') });
    expect(el.textContent).toContain('obligations.evaluations.problems.findings');
    const notes = el.querySelector<HTMLTextAreaElement>('[data-testid="evaluation-notes"]')!;
    notes.value = 'Q3 measurement missing';
    notes.dispatchEvent(new Event('input'));
    const title = el.querySelector<HTMLInputElement>('[data-testid="evaluation-followup-title"]')!;
    expect(title.value).toBe('OB-0001-1: Measure noise every quarter');
    title.value = 'Replace the filter';
    title.dispatchEvent(new Event('input'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="evaluation-save"] button')!.click();
    await render(fixture);

    const req = http.expectOne({ method: 'POST', url: kitUrl('obligations/o-1/evaluations') });
    // The overall result is derived on the server from the duty results.
    expect(req.request.body.result).toBeNull();
    expect(req.request.body.duty_results).toEqual([
      { duty_id: 'd-1', result: 'non_compliant', note: null },
    ]);
    expect(req.request.body.notes).toBe('Q3 measurement missing');
    expect(req.request.body.evaluated_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(req.request.body.follow_up.title).toBe('Replace the filter');
    expect(req.request.body.follow_up.assignee).toEqual({ type: 'user', value: 'u-1' });
    expect(req.request.body.follow_up.due_at).toBeTruthy();
    expect(req.request.body.create_deviation).toBe(false);
    req.flush({
      evaluation: makeEvaluation({ id: 'e-2', result: 'non_compliant', notes: null }),
      follow_up_task_id: 't-9',
      obligation: makeObligation({ compliance_status: 'non_compliant', evaluation_count: 2 }),
    });
    await render(fixture);
    for (const r of http.match(kitUrl('obligations/o-1/actions'))) {
      r.flush({ items: [], total: 0 });
    }
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('obligations.notices.evaluated', {
      code: 'OB-0001',
    });
    expect(
      el.querySelector('[data-testid="obligation-compliance"]')?.getAttribute('data-kind'),
    ).toBe('non_compliant');
  });

  it('hides recording for a retired obligation', async () => {
    const { el } = await loaded(makeObligation({ status: 'retired' }));
    expect(el.querySelector('[data-testid="evaluation-add"]')).toBeNull();
    expect(el.textContent).toContain('obligations.detail.sentence.retired');
  });

  it('shows a coded error when the obligation cannot be loaded', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http
      .expectOne(kitUrl('obligations/o-1'))
      .flush({ detail: 'not found' }, { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(el.textContent).toContain('obligations.errors.notFound');
  });
});
