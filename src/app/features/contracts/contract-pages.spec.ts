import { HttpRequest } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { ContractDetail } from './contract-detail';
import { ContractDeadlines } from './contract-deadlines';
import { ContractsList } from './contracts-list';
import { makeContract, makeContractItem } from './contracts.testing';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function toasts() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

describe('ContractsList', () => {
  function setup(permissions: readonly string[] = ['contracts:read', 'contracts:write']) {
    const { http } = configureKit(ContractsList, {
      permissions,
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(ContractsList);
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const listUrl = kitUrl('contracts');
  /** The page request (the KPI tiles ask for one row each). */
  const isPage = (r: HttpRequest<unknown>) => r.url === listUrl && r.params.get('limit') === '25';
  const isKpi = (r: HttpRequest<unknown>) => r.url === listUrl && r.params.get('limit') === '1';

  function flushKpis(http: ReturnType<typeof setup>['http'], total = 2) {
    for (const req of http.match(isKpi)) {
      req.flush({ items: [], total });
    }
  }

  it('loads open contracts and renders each row with its status, warning and next deadline', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    const req = http.expectOne(isPage);
    expect(req.request.params.get('status')).toBe('draft,in_review,approved,active');
    expect(req.request.params.get('sort')).toBe('-updated_at');
    req.flush({
      items: [
        makeContractItem({ warnings: ['notice_soon', 'dpa_missing'], notice_due_in_days: 31 }),
      ],
      total: 1,
    });
    flushKpis(http);
    await render(fixture);
    const rows = el.querySelector('[data-testid="contract-rows"]');
    expect(rows?.textContent).toContain('CT-0001');
    expect(rows?.textContent).toContain('Hosting agreement');
    expect(rows?.textContent).toContain('Cloudy AS');
    expect(el.querySelector('[data-testid="row-notice"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="row-warning-dpa_missing"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="new-contract"]')).toBeTruthy();
    // One page only: no pager footer.
    expect(el.querySelector('app-pager')).toBeNull();
    expect(el.querySelector('[data-testid="kpi-dpa_missing"]')?.textContent).toContain('2');
  });

  it('re-queries when a filter changes, and filters on what needs attention', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http.expectOne(isPage).flush({ items: [makeContractItem()], total: 1 });
    flushKpis(http);
    await render(fixture);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-type"]')!;
    select.value = 'dpa';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne(isPage);
    expect(req.request.params.get('type')).toBe('dpa');
    req.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();

    const attention = el.querySelector<HTMLSelectElement>('[data-testid="filter-attention"]')!;
    attention.value = 'dpa_missing';
    attention.dispatchEvent(new Event('change'));
    await render(fixture);
    const filtered = http.expectOne(isPage);
    expect(filtered.request.params.get('warning')).toBe('dpa_missing');
    filtered.flush({ items: [], total: 0 });
  });

  it('shows the teaching empty state for an empty register and hides "new" without write', async () => {
    const { http, fixture, el } = setup(['contracts:read']);
    await render(fixture);
    http.expectOne(isPage).flush({ items: [], total: 0 });
    flushKpis(http, 0);
    await render(fixture);
    expect(el.querySelector('[data-testid="contract-rows"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-match"]')).toBeNull();
    expect(el.querySelector('[data-testid="new-contract"]')).toBeNull();
  });
});

describe('ContractDeadlines', () => {
  it('shows the owner and counterparty, filters on mine and offers a follow-up task', async () => {
    const { http } = configureKit(ContractDeadlines, {
      permissions: ['contracts:read'],
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(ContractDeadlines);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    const url = kitUrl('contracts/deadlines');
    http
      .expectOne((r) => r.url === url)
      .flush({
        items: [
          {
            contract_id: 'c-1',
            code: 'CT-0001',
            title: 'Hosting',
            contract_type: 'supplier',
            status: 'active',
            owner: { id: 'u-1', name: 'Ada' },
            counterparties: ['Cloudy AS'],
            kind: 'notice_deadline',
            label: null,
            due_date: '2099-12-17',
            days_left: 31,
            overdue: false,
            key_date_id: null,
            url: '/contracts/c-1',
          },
        ],
      });
    await render(fixture);
    const meta = el.querySelector('[data-testid="deadline-meta"]')?.textContent ?? '';
    expect(meta).toContain('Cloudy AS');
    expect(el.querySelector('[data-testid="deadline-task"]')?.getAttribute('href')).toContain(
      'entity_id=c-1',
    );
    const mine = el.querySelector<HTMLInputElement>('[data-testid="deadline-mine"]')!;
    mine.checked = true;
    mine.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne((r) => r.url === url);
    expect(req.request.params.get('owner')).toBe('me');
    req.flush({ items: [] });
  });
});

describe('ContractDetail', () => {
  function setup(contract = makeContract()) {
    const notify = toasts();
    const { http } = configureKit(ContractDetail, {
      permissions: ['contracts:read', 'contracts:write', 'contracts:approve'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(ContractDetail);
    fixture.componentRef.setInput('id', contract.id);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  async function loaded(contract = makeContract(), candidates: unknown[] = []) {
    const ctx = setup(contract);
    await render(ctx.fixture);
    ctx.http.expectOne(kitUrl(`contracts/${contract.id}`)).flush(contract);
    await render(ctx.fixture);
    for (const req of ctx.http.match((r) => r.url === kitUrl('attachments'))) {
      req.flush([]);
    }
    for (const req of ctx.http.match(kitUrl(`contracts/${contract.id}/obligations`))) {
      req.flush({ items: [], total: 0 });
    }
    for (const req of ctx.http.match(kitUrl(`contracts/${contract.id}/dpa-candidates`))) {
      req.flush({ items: candidates });
    }
    await render(ctx.fixture);
    return ctx;
  }

  function dialog(el: HTMLElement): Element {
    return document.querySelector('[role="dialog"], [role="alertdialog"]') ?? el;
  }

  function confirmButton(el: HTMLElement, label: string): HTMLButtonElement {
    return Array.from(dialog(el).querySelectorAll('button')).find((b) =>
      b.textContent?.includes(label),
    )!;
  }

  it('renders the contract, its parties, warnings and the DPA status', async () => {
    const { el } = await loaded(makeContract({ warnings: ['dpa_missing', 'review_date_missing'] }));
    expect(el.querySelector('[data-testid="page-title"]')?.textContent).toContain(
      'Hosting agreement',
    );
    expect(el.textContent).toContain('Cloudy AS');
    // Missing DPA: the compliance "gap" tone (red), never neutral.
    expect(
      el.querySelector('[data-testid="dpa-status"] [data-tone]')?.getAttribute('data-tone'),
    ).toBe('fail');
    expect(el.querySelector('[data-testid="warning-review_date_missing"]')).toBeTruthy();
    // Renew is the one primary step; ending the contract sits in its own menu.
    expect(el.querySelector('[data-testid="action-renew"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="action-end-menu"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="action-approve"]')).toBeNull();
    expect(el.querySelector('[data-testid="summary-approved"]')).toBeTruthy();
  });

  it('links a matching DPA in one click', async () => {
    const candidate = {
      id: 'c-2',
      code: 'CT-0002',
      title: 'DPA Cloudy',
      status: 'active',
      dpa_status: 'covered',
      counterparties: ['Cloudy AS'],
      match: 'org_number',
      linked: false,
      url: '/contracts/c-2',
    };
    const { el, http, fixture, notify } = await loaded(makeContract(), [candidate]);
    expect(el.querySelector('[data-testid="dpa-candidates"]')?.textContent).toContain(
      'contracts.dpa.match.org_number',
    );
    el.querySelector<HTMLElement>('[data-testid="dpa-link-CT-0002"] button')!.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('contracts/c-1/dpa-links'));
    expect(req.request.body).toEqual({ dpa_id: 'c-2' });
    req.flush(
      makeContract({ dpa: { required: true, status: 'covered', linked_dpa_ids: ['c-2'] } }),
    );
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('contracts.notices.dpaLinked', { code: 'CT-0002' });
  });

  it('approves only with every review question answered and a note', async () => {
    const contract = makeContract({
      status: 'in_review',
      allowed_actions: ['approve', 'reject'],
      review_items: ['requirements_defined', 'security_clauses'],
      submitted_by: { id: 'u-2', name: 'Bo' },
    });
    const { el, http, fixture } = await loaded(contract);
    el.querySelector<HTMLElement>('[data-testid="action-approve"] button')!.click();
    await render(fixture);
    const root = dialog(el);
    expect(root.querySelector('[data-testid="approve-submitter"]')).toBeTruthy();
    const confirm = confirmButton(el, 'contracts.actions.approve');
    expect(confirm.disabled).toBe(true);
    const answer = (key: string, value: string) => {
      const radio = root.querySelector<HTMLInputElement>(`[data-testid="review-${key}-${value}"]`)!;
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    };
    answer('requirements_defined', 'yes');
    answer('security_clauses', 'no');
    const note = root.querySelector<HTMLTextAreaElement>('[data-testid="action-note"]')!;
    note.value = 'Checked against the offer';
    note.dispatchEvent(new Event('input'));
    await render(fixture);
    // A "no" means send it back instead.
    expect(confirm.disabled).toBe(true);
    answer('security_clauses', 'na');
    await render(fixture);
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('contracts/c-1/approve'));
    expect(req.request.body).toEqual({
      note: 'Checked against the offer',
      checklist: [
        { key: 'requirements_defined', answer: 'yes' },
        { key: 'security_clauses', answer: 'na' },
      ],
    });
    req.flush(makeContract({ status: 'approved', allowed_actions: ['activate'] }));
    await render(fixture);
  });

  it('explains segregation of duties when the user may not approve their own contract', async () => {
    const { el } = await loaded(
      makeContract({
        status: 'in_review',
        allowed_actions: ['reject'],
        approval_blocked_reason: 'self_approval',
      }),
    );
    expect(el.querySelector('[data-testid="self-approval-note"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="action-approve"]')).toBeNull();
  });

  it('terminates only with a reason, from the "end the contract" menu', async () => {
    const { el, http, fixture, notify } = await loaded();
    el.querySelector<HTMLElement>('[data-testid="action-end-menu"] button')!.click();
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="action-terminate"]')!.click();
    await render(fixture);
    const confirm = confirmButton(el, 'contracts.actions.terminate');
    expect(confirm.disabled).toBe(true);
    const note = dialog(el).querySelector<HTMLTextAreaElement>('[data-testid="action-note"]')!;
    note.value = 'Moving to another provider';
    note.dispatchEvent(new Event('input'));
    await render(fixture);
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('contracts/c-1/terminate'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body.note).toBe('Moving to another provider');
    expect(req.request.body.effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush(makeContract({ status: 'terminated', allowed_actions: [], can_edit: false }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('contracts.notices.actions.terminate', {
      code: 'CT-0001',
    });
    expect(el.querySelector('[data-testid="contract-status"]')?.textContent).toContain(
      'Terminated',
    );
  });

  it('shows a coded error when the contract cannot be loaded', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http
      .expectOne(kitUrl('contracts/c-1'))
      .flush({ detail: 'Contract not found' }, { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(el.textContent).toContain('contracts.errors.notFound');
  });
});
