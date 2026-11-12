import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { ProjectDetail } from './data/project.models';
import { ProjectDetailPage } from './project-detail';
import { ProjectsList } from './projects-list';
import { makeMilestone, makePlanItem, makeProject, makeProjectDetail } from './projects.testing';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

function toasts() {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
}

const authStub = {
  user: signal({ id: 'u-1', email: 'ada@example.com', full_name: 'Ada' }).asReadonly(),
  isAuthenticated: signal(true).asReadonly(),
};

/** Answer every side request a page or its kit components may make. */
function flushSides(http: HttpTestingController) {
  for (const req of http.match(() => true)) {
    if (req.cancelled) {
      continue;
    }
    const u = req.request.url;
    if (u.endsWith('/plan')) {
      req.flush({ project_id: 'p-1', start: null, end: null, items: [] });
    } else if (u.endsWith('/summary')) {
      req.flush({
        project_id: 'p-1',
        code: 'PRJ-001',
        title: 'New order system',
        status: 'active',
        health: null,
        progress: makeProjectDetail().progress,
        next_milestone: makeMilestone(),
        overdue_milestones: [],
        open_design_reviews: [],
        days_to_due: 12,
        facts: {},
      });
    } else if (/\/(milestones|design-reviews|lessons|members)$/.test(u)) {
      req.flush({ items: [] });
    } else if (u.endsWith('/watchers/me') || u.includes('watch')) {
      req.flush({ watching: false });
    } else {
      req.flush({ items: [], total: 0 });
    }
  }
}

describe('ProjectsList', () => {
  function setup(permissions: readonly string[] = ['projects:read', 'projects:write']) {
    const { http } = configureKit(ProjectsList, {
      permissions,
      providers: [...provideFakeGuidance().providers],
    });
    const fixture = TestBed.createComponent(ProjectsList);
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  const listUrl = kitUrl('projects');

  it('loads open projects and renders the rows', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('status')).toBe('proposed,planned,active,on_hold');
    expect(req.request.params.get('sort')).toBe('-updated_at');
    req.flush({ items: [makeProject()], total: 1 });
    await render(fixture);
    const rows = el.querySelector('[data-testid="project-rows"]');
    expect(rows?.textContent).toContain('PRJ-001');
    expect(rows?.textContent).toContain('New order system');
    expect(el.querySelector('[data-testid="new-project"]')).toBeTruthy();
  });

  it('re-queries for my projects and switches to the timeline', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http.expectOne((r) => r.url === listUrl).flush({ items: [makeProject()], total: 1 });
    await render(fixture);
    const select = el.querySelector<HTMLSelectElement>('[data-testid="filter-people"]')!;
    select.value = 'member';
    select.dispatchEvent(new Event('change'));
    await render(fixture);
    const req = http.expectOne((r) => r.url === listUrl);
    expect(req.request.params.get('member')).toBe('me');
    expect(req.request.params.get('owner')).toBeNull();
    req.flush({ items: [makeProject()], total: 1 });
    await render(fixture);
    el.querySelector<HTMLButtonElement>('[data-testid="view-timeline"]')!.click();
    await render(fixture);
    expect(el.querySelector('[data-testid="gantt"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="project-rows"]')).toBeNull();
  });

  it('shows the teaching empty state for an empty register and hides "new" without write', async () => {
    const { http, fixture, el } = setup(['projects:read']);
    await render(fixture);
    http.expectOne((r) => r.url === listUrl).flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="project-rows"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-match"]')).toBeNull();
    expect(el.querySelector('[data-testid="new-project"]')).toBeNull();
  });
});

describe('ProjectDetailPage', () => {
  function setup(permissions: readonly string[] = ['projects:read', 'projects:write']) {
    const notify = toasts();
    const { http } = configureKit(ProjectDetailPage, {
      permissions,
      providers: [
        ...provideFakeGuidance().providers,
        { provide: NotificationService, useValue: notify },
        { provide: AuthService, useValue: authStub },
      ],
    });
    const fixture = TestBed.createComponent(ProjectDetailPage);
    fixture.componentRef.setInput('id', 'p-1');
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  async function loaded(
    project: ProjectDetail = makeProjectDetail(),
    permissions?: readonly string[],
  ) {
    const ctx = setup(permissions);
    await render(ctx.fixture);
    ctx.http.expectOne(kitUrl('projects/p-1')).flush(project);
    await render(ctx.fixture);
    for (let i = 0; i < 3; i++) {
      flushSides(ctx.http);
      await render(ctx.fixture);
    }
    return ctx;
  }

  it('renders the project, its progress and next milestone', async () => {
    const { el } = await loaded();
    expect(el.querySelector('[data-testid="project-heading"]')?.textContent).toContain(
      'New order system',
    );
    expect(el.querySelector('[data-testid="project-status"]')?.textContent).toContain(
      'projects.status.active',
    );
    expect(el.querySelector('[data-testid="security-requirements"]')?.textContent).toContain(
      'Data stored in the EU.',
    );
    expect(el.querySelector('[data-testid="next-milestone"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="project-close"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="project-reopen"]')).toBeNull();
  });

  it('shows the open-item counts when completing is refused', async () => {
    const { el, http, fixture } = await loaded();
    el.querySelector<HTMLElement>('[data-testid="project-close"] button')!.click();
    await render(fixture);
    const panel = document.body;
    const submit = panel.querySelector<HTMLElement>('[data-testid="closeout-submit"] button')!;
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    const summary = panel.querySelector<HTMLTextAreaElement>('[data-testid="closeout-summary"]')!;
    summary.value = 'Objective reached.';
    summary.dispatchEvent(new Event('input'));
    await render(fixture);
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    submit.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('projects/p-1/close'));
    expect(req.request.body).toEqual({
      outcome: 'completed',
      closeout_summary: 'Objective reached.',
      lessons: [],
    });
    req.flush(
      {
        detail: {
          code: 'project_has_open_items',
          open_milestones: 1,
          pending_design_reviews: 1,
          open_tasks: 2,
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await render(fixture);
    expect(panel.querySelector('[data-testid="closeout-open-items"]')).toBeTruthy();
  });

  it('offers reopening a closed project to its owner and posts the reason', async () => {
    const closed = makeProjectDetail({
      status: 'completed',
      closed_at: '2026-03-01T10:00:00',
      closed_by: { id: 'u-1', name: 'Ada' },
      closeout_summary: 'All done.',
    });
    const { el, http, fixture, notify } = await loaded(closed);
    expect(el.querySelector('[data-testid="closed-notice"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="project-close"]')).toBeNull();
    expect(el.querySelector('[data-testid="project-edit"]')).toBeNull();
    el.querySelector<HTMLElement>('[data-testid="project-reopen"] button')!.click();
    await render(fixture);
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')!;
    const textarea = dialog.querySelector('textarea')!;
    textarea.value = 'Second pilot needed';
    textarea.dispatchEvent(new Event('input'));
    await render(fixture);
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('projects.reopen.action'),
    )!;
    confirm.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('projects/p-1/reopen'));
    expect(req.request.body).toEqual({ reason: 'Second pilot needed' });
    req.flush(makeProjectDetail());
    await render(fixture);
    flushSides(http);
    await render(fixture);
    expect(notify.success).toHaveBeenCalledWith('projects.notices.reopened', { code: 'PRJ-001' });
  });

  it('draws the plan as a Gantt chart and a board', async () => {
    const { el, http, fixture } = setup();
    await render(fixture);
    http.expectOne(kitUrl('projects/p-1')).flush(makeProjectDetail());
    await render(fixture);
    http.expectOne(kitUrl('projects/p-1/plan')).flush({
      project_id: 'p-1',
      start: '2026-01-05',
      end: '2026-03-01',
      items: [
        makePlanItem({
          kind: 'phase',
          id: 'ph',
          title: 'Build',
          start: '2026-01-05',
          end: '2026-02-01',
          url: '/projects/p-1?milestone=ph',
        }),
        makePlanItem({ id: 't-1', title: 'Write test plan', status: 'in_progress' }),
      ],
    });
    for (let i = 0; i < 3; i++) {
      flushSides(http);
      await render(fixture);
    }
    expect(el.querySelector('[data-testid="gantt"]')?.textContent).toContain('Build');
    el.querySelector<HTMLButtonElement>('[data-testid="plan-view-board"]')!.click();
    await render(fixture);
    expect(el.querySelector('[data-testid="board-col-in_progress"]')?.textContent).toContain(
      'Write test plan',
    );
  });

  it('shows a coded error when the project cannot be loaded', async () => {
    const { http, fixture, el } = setup();
    await render(fixture);
    http
      .expectOne(kitUrl('projects/p-1'))
      .flush({ detail: 'Project not found' }, { status: 404, statusText: 'Not Found' });
    await render(fixture);
    expect(el.textContent).toContain('projects.errors.notFound');
  });
});
