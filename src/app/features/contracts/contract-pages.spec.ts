import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { ContractDetail } from './contract-detail';
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

  it('loads open contracts and renders each row with its next deadline', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('status')).toBe('draft,in_review,approved,active');
    expect(req.request.params.get('sort')).toBe('-updated_at');
    req.flush({ items: [makeContractItem()], total: 1 });
    await render(fixture);
    const rows = el.querySelector('[data-testid="contract-rows"]');
    expect(rows?.textContent).toContain('CT-0001');
    expect(rows?.textContent).toContain('Hosting agreement');
    expect(rows?.textContent).toContain('Cloudy AS');
    expect(el.querySelector('[data-testid="new-contract"]')).toBeTruthy();
  });

  it('re-queries when a filter changes', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http.expectOne((r) => r.url === listUrl).flush({ items: [makeContractItem()], total: 1 });
    await render(fixture);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-type"]')!;
    select.value = 'dpa';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('type')).toBe('dpa');
    req.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();
  });

  it('shows the teaching empty state for an empty register and hides "new" without write', async () => {
    const { http, fixture, el } = setup(['contracts:read']);
    await render(fixture);
    http.expectOne((r) => r.url === listUrl).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="contract-rows"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-match"]')).toBeNull();
    expect(el.querySelector('[data-testid="new-contract"]')).toBeNull();
  });
});

describe('ContractDetail', () => {
  function setup(contract = makeContract()) {
    const notify = toasts();
    const { http } = configureKit(ContractDetail, {
      permissions: ['contracts:read', 'contracts:write'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(ContractDetail);
    fixture.componentRef.setInput('id', contract.id);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  async function loaded(contract = makeContract()) {
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
    await render(ctx.fixture);
    return ctx;
  }

  it('renders the contract, its parties and the DPA status', async () => {
    const { el } = await loaded();
    expect(el.querySelector('[data-testid="contract-heading"]')?.textContent).toContain(
      'Hosting agreement',
    );
    expect(el.textContent).toContain('Cloudy AS');
    expect(el.querySelector('[data-testid="dpa-status"]')?.textContent).toContain(
      'contracts.dpa.status.missing',
    );
    expect(el.querySelector('[data-testid="action-renew"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="action-approve"]')).toBeNull();
  });

  it('terminates only with a reason and posts the action', async () => {
    const { el, http, fixture, notify } = await loaded();
    el.querySelector<HTMLElement>('[data-testid="action-terminate"] button')!.click();
    await render(fixture);
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]') ?? el;
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('contracts.actions.terminate'),
    )!;
    expect(confirm.disabled).toBe(true);
    const note = dialog.querySelector<HTMLTextAreaElement>('[data-testid="action-note"]')!;
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
      'contracts.status.terminated',
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
