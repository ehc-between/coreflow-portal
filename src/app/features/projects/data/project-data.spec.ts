import { HttpErrorResponse } from '@angular/common/http';
import { canReopen } from '../project-detail';
import { parseRiskPrompts } from '../project-ai-panel';
import { boardColumns } from '../project-board';
import { canSubmitClose, closeBody } from '../project-closeout';
import { emptyLessonDraft } from '../project-lessons';
import { groupMilestones, milestoneBody, emptyMilestoneDraft } from '../project-milestones';
import { reviewBody, reviewNeedsDate, emptyReviewDraft } from '../project-reviews';
import { projectRows, statusesForFilter } from '../projects-list';
import { makeMilestone, makePlanItem, makeProject, makeProjectDetail } from '../projects.testing';
import { dayNumber, ganttLayout, planRows, routerTarget } from './gantt';
import { openItemsOf, projectErrorKey } from './project-errors';
import {
  dedupeMembers,
  emptyProjectForm,
  formFromProject,
  toCreateRequest,
  toUpdateRequest,
  validateProjectForm,
  withMember,
} from './project-form-model';

function coded(status: number, detail: unknown) {
  return new HttpErrorResponse({ status, error: { detail } });
}

describe('project form model', () => {
  it('requires a title and an end date on or after the start', () => {
    expect(validateProjectForm(emptyProjectForm())).toEqual({
      title: 'projects.form.errors.titleRequired',
    });
    const v = emptyProjectForm({ title: 'X', start_date: '2026-03-02', due_date: '2026-03-01' });
    expect(validateProjectForm(v)).toEqual({ due_date: 'projects.form.errors.dueBeforeStart' });
    expect(validateProjectForm({ ...v, start_date: '2026-13' })).toEqual({
      start_date: 'projects.form.errors.invalidDate',
    });
  });

  it('builds a create request: trimmed text, nulls, owner only when chosen, owner not in the team', () => {
    const body = toCreateRequest(
      emptyProjectForm({
        title: '  Portal  ',
        objective: '  Faster orders ',
        owner_user_id: 'u-1',
        security_relevant: false,
        security_requirements: 'ignored',
        members: [
          { user_id: 'u-1', role: 'member' },
          { user_id: 'u-2', role: 'reviewer' },
          { user_id: 'u-2', role: 'member' },
        ],
      }),
    );
    expect(body.title).toBe('Portal');
    expect(body.objective).toBe('Faster orders');
    expect(body.scope).toBeNull();
    expect(body.owner_user_id).toBe('u-1');
    expect(body.security_requirements).toBeNull();
    expect(body.members).toEqual([{ user_id: 'u-2', role: 'reviewer' }]);
    expect('owner_user_id' in toCreateRequest(emptyProjectForm({ title: 'X' }))).toBe(false);
  });

  it('sends only changed fields on update, nulls to clear, and the reason with changes', () => {
    const before = formFromProject(makeProjectDetail());
    const after = { ...before, health: '' as const, due_date: '2026-04-01', owner_user_id: '' };
    expect(toUpdateRequest(before, after, ' Scope grew ')).toEqual({
      health: null,
      due_date: '2026-04-01',
      change_reason: 'Scope grew',
    });
    expect(toUpdateRequest(before, before, 'why')).toEqual({});
    expect(toUpdateRequest(before, { ...before, owner_user_id: 'u-9' }, '')).toEqual({
      owner_user_id: 'u-9',
    });
  });

  it('maps a closed project back to an open status for the form', () => {
    expect(formFromProject(makeProjectDetail({ status: 'completed' })).status).toBe('active');
  });

  it('keeps one entry per member and changes roles in place', () => {
    const members = withMember([{ user_id: 'a', role: 'member' }], 'b', 'reviewer');
    expect(withMember(members, 'a', 'manager')).toEqual([
      { user_id: 'a', role: 'manager' },
      { user_id: 'b', role: 'reviewer' },
    ]);
    expect(dedupeMembers([{ user_id: '', role: 'member' }], '')).toEqual([]);
  });
});

describe('project errors', () => {
  it('translates known codes, 403 and 404, never the backend message', () => {
    expect(projectErrorKey(coded(409, { code: 'project_closed', message: 'x' }))).toBe(
      'projects.errors.project_closed',
    );
    expect(projectErrorKey(coded(403, 'Insufficient permissions'))).toBe(
      'projects.errors.forbidden',
    );
    expect(projectErrorKey(coded(404, 'Not found'))).toBe('projects.errors.notFound');
    expect(projectErrorKey(new Error('x'))).toBe('errors.generic');
  });

  it('reads the open-item counts of a refused close-out', () => {
    expect(
      openItemsOf(
        coded(409, {
          code: 'project_has_open_items',
          open_milestones: 2,
          pending_design_reviews: 1,
          open_tasks: 0,
        }),
      ),
    ).toEqual({ open_milestones: 2, pending_design_reviews: 1, open_tasks: 0 });
    expect(openItemsOf(coded(409, { code: 'project_closed' }))).toBeNull();
  });
});

describe('gantt', () => {
  it('orders phases, their milestones and tasks, then loose items', () => {
    const rows = planRows([
      makePlanItem({ id: 't-loose' }),
      makePlanItem({ kind: 'milestone', id: 'm-loose', parent_id: null }),
      makePlanItem({ kind: 'task', id: 't-in-m', parent_id: 'm-1' }),
      makePlanItem({ kind: 'milestone', id: 'm-1', parent_id: 'ph-1' }),
      makePlanItem({ kind: 'phase', id: 'ph-1', start: '2026-01-01', end: '2026-01-31' }),
    ]);
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['ph-1', 0],
      ['m-1', 1],
      ['t-in-m', 2],
      ['m-loose', 0],
      ['t-loose', 0],
    ]);
  });

  it('positions spans and points on a padded day axis with month ticks', () => {
    const rows = planRows([
      makePlanItem({ kind: 'phase', id: 'ph', start: '2026-01-01', end: '2026-01-31' }),
      makePlanItem({ kind: 'milestone', id: 'm', start: null, end: '2026-02-15' }),
      makePlanItem({ kind: 'task', id: 'u', start: null, end: null }),
    ]);
    const layout = ganttLayout(rows, { today: '2026-01-10' })!;
    expect(layout.start).toBe('2025-12-29');
    expect(layout.end).toBe('2026-02-18');
    const [phase, milestone, undated] = layout.bars;
    expect(phase.point).toBe(false);
    expect(phase.width).toBeCloseTo((31 / layout.days) * 100);
    expect(milestone.point).toBe(true);
    expect(undated.left).toBeNull();
    expect(layout.ticks.map((t) => t.date)).toEqual(['2026-01-01', '2026-02-01']);
    expect(layout.today).not.toBeNull();
    expect(ganttLayout([], {})).toBeNull();
    expect(ganttLayout(rows, { today: '2027-01-01' })!.today).toBeNull();
  });

  it('reads dates and router targets', () => {
    expect(dayNumber('2026-01-02T10:00:00')! - dayNumber('2026-01-01')!).toBe(1);
    expect(dayNumber('soon')).toBeNull();
    expect(routerTarget('/projects/p-1?milestone=m-1')).toEqual({
      path: '/projects/p-1',
      query: { milestone: 'm-1' },
    });
    expect(routerTarget('/tasks/t-1')).toEqual({ path: '/tasks/t-1', query: {} });
  });

  it('draws projects on the portfolio timeline', () => {
    const [row] = projectRows([makeProject({ is_overdue: true })]);
    expect(row).toMatchObject({
      kind: 'project',
      title: 'PRJ-001 New order system',
      start: '2026-01-05',
      end: '2026-03-01',
      overdue: true,
      url: '/projects/p-1',
    });
  });
});

describe('list filters', () => {
  it('expands "open" to the open statuses', () => {
    expect(statusesForFilter('open')).toEqual(['proposed', 'planned', 'active', 'on_hold']);
    expect(statusesForFilter('all')).toEqual([]);
    expect(statusesForFilter('completed')).toEqual(['completed']);
    expect(statusesForFilter('nonsense')).toEqual([]);
  });
});

describe('board', () => {
  it('groups tasks by status and leaves out other kinds and cancelled tasks', () => {
    const cols = boardColumns([
      makePlanItem({ id: 'a', status: 'open' }),
      makePlanItem({ id: 'b', status: 'done' }),
      makePlanItem({ id: 'c', status: 'cancelled' }),
      makePlanItem({ id: 'm', kind: 'milestone', status: 'planned' }),
    ]);
    expect(cols.map((c) => [c.status, c.tasks.map((t) => t.id)])).toEqual([
      ['open', ['a']],
      ['in_progress', []],
      ['blocked', []],
      ['done', ['b']],
    ]);
  });
});

describe('milestones and reviews', () => {
  it('groups milestones under their phases', () => {
    const g = groupMilestones([
      makeMilestone({ id: 'ph', kind: 'phase' }),
      makeMilestone({ id: 'a', phase_id: 'ph' }),
      makeMilestone({ id: 'b', phase_id: null }),
      makeMilestone({ id: 'c', phase_id: 'gone' }),
    ]);
    expect(g.phases.map((p) => [p.phase.id, p.milestones.map((m) => m.id)])).toEqual([
      ['ph', ['a']],
    ]);
    expect(g.loose.map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('builds milestone and review bodies', () => {
    expect(
      milestoneBody(emptyMilestoneDraft({ kind: 'phase', title: ' P ', phase_id: 'x' })),
    ).toMatchObject({ kind: 'phase', title: 'P', phase_id: null, due_date: null });
    const draft = emptyReviewDraft({ title: 'R', outcome: 'passed', participant_ids: ['u-1'] });
    expect(reviewNeedsDate(draft)).toBe(true);
    expect(reviewNeedsDate({ ...draft, held_on: '2026-01-10' })).toBe(false);
    expect(reviewBody(draft)).toMatchObject({ title: 'R', participant_ids: ['u-1'], stage: null });
  });
});

describe('close-out and reopen', () => {
  it('needs a summary to complete, drops untitled lessons', () => {
    expect(canSubmitClose('completed', '  ')).toBe(false);
    expect(canSubmitClose('cancelled', '')).toBe(true);
    expect(
      closeBody('completed', ' Done ', [
        emptyLessonDraft({ title: 'Plan earlier' }),
        emptyLessonDraft(),
      ]),
    ).toEqual({
      outcome: 'completed',
      closeout_summary: 'Done',
      lessons: [
        { category: 'improve', title: 'Plan earlier', description: null, recommendation: null },
      ],
    });
  });

  it('lets managers, or the owner with write, reopen a closed project', () => {
    const closed = makeProjectDetail({ status: 'completed' });
    expect(canReopen(closed, 'u-1', ['projects:write'])).toBe(true);
    expect(canReopen(closed, 'u-2', ['projects:write'])).toBe(false);
    expect(canReopen(closed, 'u-1', ['projects:read'])).toBe(false);
    expect(canReopen({ ...closed, can_manage: true }, 'u-9', [])).toBe(true);
    expect(canReopen(makeProjectDetail(), 'u-1', ['projects:write'])).toBe(false);
  });
});

describe('risk prompts', () => {
  it('parses the assist result defensively', () => {
    expect(
      parseRiskPrompts({
        risks: [
          { title: 'Key person leaves', likelihood: 'high', impact: 'extreme', mitigation: 'Pair' },
          { title: '' },
          'nonsense',
        ],
      }),
    ).toEqual([
      {
        title: 'Key person leaves',
        description: '',
        category: 'general',
        likelihood: 'high',
        impact: 'medium',
        mitigation: 'Pair',
      },
    ]);
    expect(parseRiskPrompts(null)).toEqual([]);
  });
});
