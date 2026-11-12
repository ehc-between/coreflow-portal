import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { ChecklistDetailPage } from './checklist-detail';
import { EmployeeDetail } from './employee-detail';
import { EmployeesList } from './employees-list';
import { PositionDetailPage } from './position-detail';
import { makeChecklist, makeEmployee, makeHeld, makePosition } from './people.testing';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function toasts() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

const people = (path: string) => kitUrl(`people/${path}`);

/** Answer the shared option lists (positions, competences) the pages load. */
function flushLookups(http: HttpTestingController) {
  for (const req of http.match((r) => r.url === people('positions'))) {
    req.flush({ items: [makePosition()], total: 1 });
  }
  for (const req of http.match((r) => r.url === people('competences'))) {
    req.flush({ items: [], total: 0 });
  }
}

describe('EmployeesList', () => {
  function setup(permissions: readonly string[] = ['people:read', 'people:write']) {
    const { http } = configureKit(EmployeesList, {
      permissions,
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(EmployeesList);
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  function flushSummary(http: HttpTestingController) {
    for (const req of http.match(people('summary'))) {
      req.flush({
        employees_by_status: { onboarding: 1, active: 3, on_leave: 0, offboarding: 0, former: 2 },
        positions: 2,
        competences: 4,
        open_checklists: 1,
        overdue_checklists: 0,
        gaps: 2,
        expiring_soon: 0,
        missing_confidentiality: 1,
      });
    }
  }

  it('loads current employees and renders rows and headline numbers', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    flushSummary(http);
    flushLookups(http);
    const req = http.expectOne((r) => r.url === people('employees'));
    expect(req.request.params.get('status')).toBe('onboarding,active,on_leave,offboarding');
    expect(req.request.params.get('sort')).toBe('name');
    req.flush({ items: [makeEmployee()], total: 1 });
    await render(fixture);
    const rows = el.querySelector('[data-testid="employee-rows"]');
    expect(rows?.textContent).toContain('EMP-0001');
    expect(rows?.textContent).toContain('Ada Lovelace');
    expect(el.querySelector('[data-testid="people-summary"]')?.textContent).toContain('4');
    expect(el.querySelector('[data-testid="new-employee"]')).toBeTruthy();
  });

  it('re-queries when the position filter changes', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    flushSummary(http);
    flushLookups(http);
    http.expectOne((r) => r.url === people('employees')).flush({ items: [], total: 0 });
    await render(fixture);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-position"]')!;
    select.value = 'p-1';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne((r) => r.url === people('employees'));
    expect(req.request.params.get('position_id')).toBe('p-1');
    req.flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="no-match"]')).toBeTruthy();
  });

  it('shows the teaching empty state and hides "new" without write', async () => {
    const { http, fixture, el } = setup(['people:read']);
    await render(fixture);
    flushSummary(http);
    flushLookups(http);
    http.expectOne((r) => r.url === people('employees')).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="employee-rows"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-match"]')).toBeNull();
    expect(el.querySelector('[data-testid="new-employee"]')).toBeNull();
  });
});

describe('EmployeeDetail', () => {
  function setup(permissions: readonly string[]) {
    const notify = toasts();
    const { http } = configureKit(EmployeeDetail, {
      permissions,
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(EmployeeDetail);
    fixture.componentRef.setInput('id', 'e-1');
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  async function loaded(permissions: readonly string[]) {
    const ctx = setup(permissions);
    await render(ctx.fixture);
    ctx.http.expectOne(people('employees/e-1')).flush(makeEmployee());
    await render(ctx.fixture);
    flushLookups(ctx.http);
    ctx.http.expectOne(people('employees/e-1/competences')).flush(makeHeld());
    ctx.http.expectOne((r) => r.url === people('checklists')).flush({ items: [], total: 0 });
    ctx.http.expectOne(people('employees/e-1/awareness')).flush({ items: [], total: 0 });
    await render(ctx.fixture);
    return ctx;
  }

  it('renders the employee, the security terms and the competence gap', async () => {
    const { el, http } = await loaded(['people:read', 'people:write']);
    expect(el.querySelector('[data-testid="employee-heading"]')?.textContent).toContain(
      'Ada Lovelace',
    );
    expect(el.querySelector('[data-testid="confidentiality"]')?.textContent).toContain(
      'people.detail.notSigned',
    );
    expect(el.querySelector('[data-testid="held-rows"]')?.textContent).toContain(
      'people.cellStatus.gap',
    );
    expect(el.querySelector('[data-testid="employee-edit"]')).toBeTruthy();
    // No disciplinary permission: the restricted section is not rendered or requested.
    expect(el.querySelector('#disciplinary')).toBeNull();
    http.expectNone(people('employees/e-1/disciplinary'));
  });

  it('shows disciplinary records to people:disciplinary holders', async () => {
    const { el, http, fixture } = await loaded([
      'people:read',
      'people:write',
      'people:disciplinary',
    ]);
    http.expectOne(people('employees/e-1/disciplinary')).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('#disciplinary')).toBeTruthy();
  });

  it('records an assessment and refreshes the list', async () => {
    const { el, http, fixture, notify } = await loaded(['people:read', 'people:write']);
    el.querySelector<HTMLElement>('[data-testid="assess-c-1"] button')!.click();
    await render(fixture);
    const level = document.querySelector<HTMLSelectElement>('[data-testid="assess-level"]')!;
    level.value = '3';
    level.dispatchEvent(new Event('change'));
    await render(fixture);
    const dialog = document.querySelector('[role="alertdialog"]')!;
    // The confirm button is the dialog's last button.
    const buttons = Array.from(dialog.querySelectorAll('button'));
    buttons[buttons.length - 1].click();
    await render(fixture);
    const req = http.expectOne(people('employees/e-1/competences/c-1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.level).toBe(3);
    expect(req.request.body.assessed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush(makeHeld({ gap_count: 0 }));
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('people.notices.assessed');
  });

  it('shows a coded error when the employee cannot be loaded', async () => {
    const { http, fixture, el } = setup(['people:read']);
    await render(fixture);
    http
      .expectOne(people('employees/e-1'))
      .flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(el.textContent).toContain('people.errors.notFound');
  });
});

describe('ChecklistDetailPage', () => {
  async function loaded(checklist = makeChecklist()) {
    const notify = toasts();
    const { http } = configureKit(ChecklistDetailPage, {
      permissions: ['people:read', 'people:write'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(ChecklistDetailPage);
    fixture.componentRef.setInput('id', checklist.id);
    await render(fixture);
    http.expectOne(people(`checklists/${checklist.id}`)).flush(checklist);
    await render(fixture);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  it('ticks an item off with a PATCH', async () => {
    const { el, http, fixture } = await loaded();
    const box = el.querySelector<HTMLInputElement>('[data-testid="item-i-1"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne(people('checklists/cl-1/items/i-1'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ done: true });
    req.flush(makeChecklist({ items_done: 2, required_open: 0 }));
    await render(fixture);
    expect(el.querySelector('[data-testid="checklist-progress"]')?.textContent).toContain(
      'people.checklists.progress',
    );
  });

  it('explains why it cannot be completed while required items are open', async () => {
    const { el, http, fixture } = await loaded();
    el.querySelector<HTMLElement>('[data-testid="checklist-complete"] button')!.click();
    await render(fixture);
    http
      .expectOne(people('checklists/cl-1/complete'))
      .flush(
        { detail: { code: 'checklist_incomplete', open_required: 1 } },
        { status: 409, statusText: 'Conflict' },
      );
    await render(fixture);
    expect(el.textContent).toContain('people.errors.checklist_incomplete');
  });

  it('is read-only once completed', async () => {
    const { el } = await loaded(makeChecklist({ status: 'completed' }));
    expect(el.querySelector('[data-testid="checklist-complete"]')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('[data-testid="item-i-1"]')?.disabled).toBe(true);
  });
});

describe('PositionDetailPage', () => {
  it('edits and saves the competence requirements', async () => {
    const notify = toasts();
    const { http } = configureKit(PositionDetailPage, {
      permissions: ['people:read', 'people:write', 'people:manage'],
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
      ],
    });
    const fixture = TestBed.createComponent(PositionDetailPage);
    fixture.componentRef.setInput('id', 'p-1');
    await render(fixture);
    http.expectOne(people('positions/p-1')).flush(makePosition());
    http
      .expectOne((r) => r.url === people('employees'))
      .flush({ items: [makeEmployee()], total: 1 });
    await render(fixture);
    flushLookups(http);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="position-heading"]')?.textContent).toContain(
      'Service technician',
    );
    expect(el.querySelector('[data-testid="position-holders"]')?.textContent).toContain(
      'Ada Lovelace',
    );
    el.querySelector<HTMLElement>('[data-testid="requirements-edit"] button')!.click();
    await render(fixture);
    el.querySelector<HTMLElement>('[data-testid="requirements-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(people('positions/p-1/requirements'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.requirements).toEqual([
      { competence_id: 'c-1', required_level: 3, mandatory: true, note: null },
    ]);
    req.flush(makePosition());
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('people.notices.requirementsSaved');
  });
});
