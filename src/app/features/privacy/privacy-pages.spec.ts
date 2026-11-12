import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { makeBreach, makeDpia, makeDsr, makeRopa } from './privacy.testing';
import { PrivacyOverview } from './privacy-overview';
import { PrivacyRegisterDetail } from './register-detail';
import { PrivacyRegisterEdit } from './register-edit';
import { PrivacyRegisterList } from './register-list';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function toasts() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

const ALL = [
  'privacy:read',
  'privacy:write',
  'privacy:manage',
  'privacy:approve',
  'privacy:requests',
];

/** Answer the look-ups the pages make on the side (members, attachments, ref lists). */
function flushSide(http: HttpTestingController) {
  for (const req of http.match((r) => r.url === kitUrl('attachments'))) {
    req.flush([]);
  }
  for (const req of http.match(
    (r) =>
      r.url.startsWith(kitUrl('privacy/ropa')) &&
      r.params.has('limit') &&
      r.params.get('limit') === '200',
  )) {
    req.flush({ items: [], total: 0 });
  }
}

describe('PrivacyRegisterList', () => {
  function setup(register: string, permissions: readonly string[] = ALL) {
    const { http } = configureKit(PrivacyRegisterList, {
      permissions,
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(PrivacyRegisterList);
    fixture.componentRef.setInput('register', register);
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('loads the open records of a register and shows their deadlines', async () => {
    const { http, fixture, el } = setup('dsr');
    await render(fixture);
    const req = http.expectOne((r) => r.url === kitUrl('privacy/data-subject-requests'));
    expect(req.request.params.get('status')).toBe('received,verifying,in_progress');
    expect(req.request.params.get('sort')).toBe('-created_at');
    req.flush({ items: [makeDsr()], total: 1 });
    await render(fixture);
    const rows = el.querySelector('[data-testid="privacy-rows"]');
    expect(rows?.textContent).toContain('DSR-0001');
    expect(rows?.textContent).toContain('privacy.dsr.daysLeft');
    expect(el.querySelector('[data-testid="privacy-new"]')).toBeTruthy();
  });

  it('re-queries with a register filter and the overdue switch', async () => {
    const { http, fixture, el } = setup('ropa');
    await render(fixture);
    http
      .expectOne((r) => r.url === kitUrl('privacy/ropa'))
      .flush({ items: [makeRopa()], total: 1 });
    await render(fixture);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-legal_basis"]')!;
    select.value = 'consent';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne((r) => r.url === kitUrl('privacy/ropa'));
    expect(req.request.params.get('legal_basis')).toBe('consent');
    req.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();

    const overdue = el.querySelector<HTMLInputElement>('[data-testid="filter-overdue"]')!;
    overdue.checked = true;
    overdue.dispatchEvent(new Event('change'));
    await render(fixture);
    const again = http.expectOne((r) => r.url === kitUrl('privacy/ropa'));
    expect(again.request.params.get('overdue')).toBe('true');
    again.flush({ items: [], total: 0 });
  });

  it('offers no overdue filter for consents and hides "new" without write permission', async () => {
    const { http, fixture, el } = setup('consent', ['privacy:read', 'privacy:requests']);
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('privacy/consents')).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="filter-overdue"]')).toBeNull();
    expect(el.querySelector('[data-testid="privacy-new"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="privacy-rows"]')).toBeNull();
  });

  it('hides "new" for a reader', async () => {
    const { http, fixture, el } = setup('processor', ['privacy:read']);
    await render(fixture);
    http.expectOne((r) => r.url === kitUrl('privacy/processors')).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="privacy-new"]')).toBeNull();
  });
});

describe('PrivacyOverview', () => {
  it('shows the key figures and hides request figures without privacy:requests', async () => {
    const { http } = configureKit(PrivacyOverview, {
      permissions: ['privacy:read'],
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(PrivacyOverview);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http.expectOne(kitUrl('privacy/overview')).flush({
      ropa_active: 3,
      ropa_total: 4,
      dpias_open: 1,
      dpias_required_undecided: 0,
      dsr_open: null,
      dsr_overdue: null,
      breaches_open: 1,
      breaches_clock_running: 1,
      breaches_overdue: 0,
      processors_without_dpa: 2,
      transfers_missing_tia: 0,
      reviews_overdue: 0,
    });
    http
      .expectOne((r) => r.url === kitUrl('privacy/breaches'))
      .flush({ items: [makeBreach()], total: 1 });
    http.expectNone((r) => r.url === kitUrl('privacy/data-subject-requests'));
    await render(fixture);
    expect(el.querySelector('[data-testid="kpi-ropaActive"]')?.textContent).toContain('3');
    expect(el.querySelector('[data-testid="kpi-dsrOpen"]')).toBeNull();
    expect(el.querySelector('[data-testid="attention-breaches"]')?.textContent).toContain(
      'BR-0001',
    );
    expect(el.querySelector('[data-testid="register-card-dsr"]')).toBeNull();
    expect(el.querySelector('[data-testid="register-card-ropa"]')).toBeTruthy();
  });
});

describe('PrivacyRegisterDetail', () => {
  function setup(register: string, id: string, permissions: readonly string[] = ALL) {
    const notify = toasts();
    const { http } = configureKit(PrivacyRegisterDetail, {
      permissions,
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(PrivacyRegisterDetail);
    fixture.componentRef.setInput('register', register);
    fixture.componentRef.setInput('id', id);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  it('extends a data subject request with a reason', async () => {
    const { http, fixture, el, notify } = setup('dsr', 'd-1');
    await render(fixture);
    http.expectOne(kitUrl('privacy/data-subject-requests/d-1')).flush(makeDsr());
    await render(fixture);
    flushSide(http);
    expect(el.querySelector('[data-testid="dsr-deadline"]')?.textContent).toContain(
      'privacy.dsr.daysLeft',
    );
    el.querySelector<HTMLElement>('[data-testid="dsr-extend"] button')!.click();
    await render(fixture);
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[role="dialog"] textarea, [role="alertdialog"] textarea',
    )!;
    textarea.value = 'Many requests this month';
    textarea.dispatchEvent(new Event('input'));
    await render(fixture);
    const dialog = textarea.closest('[role="dialog"], [role="alertdialog"]')!;
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('privacy.dsr.extend') && !b.disabled,
    )!;
    confirm.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/data-subject-requests/d-1/extend'));
    expect(req.request.body).toEqual({ reason: 'Many requests this month' });
    req.flush(makeDsr({ extended: true, extension_reason: 'Many requests this month' }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('privacy.notices.extended', { code: 'DSR-0001' });
    expect(el.querySelector('[data-testid="dsr-extend"]')).toBeNull();
  });

  it('shows the breach clock and keeps revisions for breaches', async () => {
    const { http, fixture, el } = setup('breach', 'b-1');
    await render(fixture);
    http.expectOne(kitUrl('privacy/breaches/b-1')).flush(makeBreach());
    await render(fixture);
    flushSide(http);
    expect(el.querySelector('[data-testid="breach-clock"]')?.textContent).toContain(
      'privacy.breach.clock.hoursLeft',
    );
    expect(el.querySelector('[data-testid="tab-revisions"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="breach-decide"]')).toBeTruthy();
  });

  it('lets an approver approve a DPIA awaiting a decision', async () => {
    const { http, fixture, el, notify } = setup('dpia', 'p-1');
    await render(fixture);
    http.expectOne(kitUrl('privacy/dpias/p-1')).flush(makeDpia());
    await render(fixture);
    flushSide(http);
    el.querySelector<HTMLElement>('[data-testid="decide-approve"] button')!.click();
    await render(fixture);
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')!;
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('privacy.decision.approve') && !b.disabled,
    )!;
    confirm.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/dpias/p-1/decision'));
    expect(req.request.body).toEqual({ decision: 'approved', comment: null });
    req.flush(
      makeDpia({ status: 'approved', decided_at: '2026-11-12T10:00:00', decided_by: 'u-1' }),
    );
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('privacy.notices.approved', { code: 'DPIA-0001' });
    expect(el.querySelector('[data-testid="decision-summary"]')).toBeTruthy();
  });

  it('hides decisions, edit and delete without the permissions', async () => {
    const { http, fixture, el } = setup('dpia', 'p-1', ['privacy:read']);
    await render(fixture);
    http.expectOne(kitUrl('privacy/dpias/p-1')).flush(makeDpia());
    await render(fixture);
    flushSide(http);
    expect(el.querySelector('[data-testid="decide-approve"]')).toBeNull();
    expect(el.querySelector('[data-testid="privacy-edit"]')).toBeNull();
    expect(el.querySelector('[data-testid="privacy-delete"]')).toBeNull();
    expect(el.querySelector('[data-testid="status-select"]')).toBeNull();
  });

  it('asks for an outcome before completing a request', async () => {
    const { http, fixture, el } = setup('dsr', 'd-1');
    await render(fixture);
    http.expectOne(kitUrl('privacy/data-subject-requests/d-1')).flush(makeDsr());
    await render(fixture);
    flushSide(http);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="status-select"]')!;
    select.value = 'completed';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="status-apply"] button')!.click();
    await render(fixture);
    http.expectNone(kitUrl('privacy/data-subject-requests/d-1'));
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '[role="dialog"] textarea, [role="alertdialog"] textarea',
    )!;
    textarea.value = 'Sent a copy of the data';
    textarea.dispatchEvent(new Event('input'));
    await render(fixture);
    const dialog = textarea.closest('[role="dialog"], [role="alertdialog"]')!;
    Array.from(dialog.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('privacy.detail.applyStatus') && !b.disabled)!
      .click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/data-subject-requests/d-1'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'completed', outcome: 'Sent a copy of the data' });
    req.flush(makeDsr({ status: 'completed', outcome: 'Sent', closed_at: '2026-11-12T10:00:00' }));
  });
});

describe('PrivacyRegisterEdit', () => {
  it('creates a breach and opens it', async () => {
    const notify = toasts();
    const { http } = configureKit(PrivacyRegisterEdit, {
      permissions: ALL,
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(PrivacyRegisterEdit);
    fixture.componentRef.setInput('register', 'breach');
    const el = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await render(fixture);

    el.querySelector<HTMLElement>('[data-testid="privacy-save"] button')!.click();
    await render(fixture);
    http.expectNone(kitUrl('privacy/breaches'));
    expect(el.textContent).toContain('privacy.form.required');

    const title = el.querySelector<HTMLInputElement>('[data-testid="field-title"]')!;
    title.value = 'Lost laptop';
    title.dispatchEvent(new Event('input'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="privacy-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/breaches'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.title).toBe('Lost laptop');
    expect(req.request.body.aware_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(req.request.body).not.toHaveProperty('authority_notification_required');
    req.flush(makeBreach());
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('privacy.notices.created', { code: 'BR-0001' });
    expect(navigate).toHaveBeenCalledWith(['/privacy', 'breaches', 'b-1']);
  });

  it('shows a coded error from the backend in place', async () => {
    const { http } = configureKit(PrivacyRegisterEdit, {
      permissions: ALL,
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: toasts() },
      ],
    });
    const fixture = TestBed.createComponent(PrivacyRegisterEdit);
    fixture.componentRef.setInput('register', 'ropa');
    fixture.componentRef.setInput('id', 'r-1');
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http.expectOne(kitUrl('privacy/ropa/r-1')).flush(makeRopa());
    await render(fixture);
    const purposes = el.querySelector<HTMLTextAreaElement>('[data-testid="field-purposes"]')!;
    purposes.value = 'Pay salaries and pensions';
    purposes.dispatchEvent(new Event('input'));
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="privacy-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/ropa/r-1'));
    expect(req.request.body).toEqual({ purposes: 'Pay salaries and pensions' });
    req.flush(
      { detail: { code: 'ropa_incomplete', fields: ['security_measures'] } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await render(fixture);
    expect(el.querySelector('[data-testid="form-error"]')?.textContent).toContain(
      'privacy.errors.ropa_incomplete',
    );
  });
});
