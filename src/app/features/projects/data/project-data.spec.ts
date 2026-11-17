import { HttpErrorResponse } from '@angular/common/http';
import { canReopen, percentExplanation, purposeLinks } from '../project-detail';
import { parseRiskPrompts, riskOverlay } from '../project-ai-panel';
import { boardColumns } from '../project-board';
import { canSubmitClose, closeBody, closeChecklist } from '../project-closeout';
import { emptyLessonDraft } from '../project-lessons';
import { groupMilestones, milestoneBody, emptyMilestoneDraft } from '../project-milestones';
import { reviewBody, reviewNeedsDate, emptyReviewDraft } from '../project-reviews';
import { isAtRisk, projectRows, statusesForFilter } from '../projects-list';
import { makeMilestone, makePlanItem, makeProject, makeProjectDetail } from '../projects.testing';
import { dayNumber, ganttLayout, planRows, routerTarget } from './gantt';
import { healthBadge, outcomeBadge, projectStatusBadge } from './project-display';
import { openItemsOf, projectErrorKey } from './project-errors';
import { levelOnScale } from './projects-api';
import {
  dedupeMembers,
  emptyProjectForm,
  formFromProject,
  plansChange,
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
    ).toEqual({
      open_milestones: 2,
      pending_design_reviews: 1,
      open_tasks: 0,
      open_review_actions: 0,
    });
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
    expect(reviewBody(draft)).toMatchObject({
      title: 'R',
      participant_ids: ['u-1'],
      input_documents: [],
    });
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

describe('A16 polish helpers', () => {
  it('places assistant ratings on the org matrix', () => {
    expect(levelOnScale('low', [1, 2, 3, 4, 5])).toBe(1);
    expect(levelOnScale('medium', [1, 2, 3, 4, 5])).toBe(3);
    expect(levelOnScale('high', [1, 2, 3, 4, 5])).toBe(4);
    expect(levelOnScale('high', [1, 2, 3])).toBe(3);
    expect(levelOnScale('medium', [])).toBeNull();
    expect(
      riskOverlay(
        {
          title: 'Supplier late',
          description: 'Delivery slips',
          category: 'schedule',
          likelihood: 'high',
          impact: 'low',
          mitigation: 'Weekly check-in',
        },
        { likelihood: [1, 2, 3, 4, 5], consequence: [1, 2, 3, 4, 5] },
        'Tiltak',
      ),
    ).toEqual({
      title: 'Supplier late',
      description: 'Delivery slips\n\nTiltak: Weekly check-in',
      treatment_notes: 'Weekly check-in',
      inherent_likelihood: 4,
      inherent_consequence: 1,
    });
    expect(
      riskOverlay(
        {
          title: 'X',
          description: '',
          category: 'general',
          likelihood: 'low',
          impact: 'low',
          mitigation: '',
        },
        null,
        'Tiltak',
      ),
    ).toEqual({ title: 'X' });
  });

  it('lists what blocks a completed close-out, review actions separately', () => {
    const p = makeProjectDetail({
      open_items: {
        open_milestones: 0,
        pending_design_reviews: 1,
        open_tasks: 3,
        open_review_actions: 2,
      },
    });
    expect(closeChecklist(p)).toEqual([
      { key: 'milestones', open: 0 },
      { key: 'reviews', open: 1 },
      { key: 'reviewActions', open: 2 },
      { key: 'tasks', open: 1 },
    ]);
  });

  it('sends the objective check only when completing', () => {
    const objective = { met: 'partial' as const, evidence: ' 0.6 % errors ', approverId: 'u-2' };
    expect(closeBody('completed', 'Done', [], objective)).toEqual({
      outcome: 'completed',
      closeout_summary: 'Done',
      lessons: [],
      objective_met: 'partial',
      objective_evidence: '0.6 % errors',
      approver_user_id: 'u-2',
    });
    expect(closeBody('cancelled', '', [], objective)).toEqual({
      outcome: 'cancelled',
      closeout_summary: null,
      lessons: [],
      approver_user_id: 'u-2',
    });
    expect(canSubmitClose('completed', 'Done', null)).toBe(false);
    expect(canSubmitClose(null, 'Done', 'yes')).toBe(false);
  });

  it('explains how the percentage is computed', () => {
    const progress = makeProjectDetail().progress;
    expect(percentExplanation({ ...progress, percent_basis: 'tasks' })).toBe(
      'projects.progress.basis.tasks',
    );
    expect(percentExplanation(progress)).toBe('projects.progress.basis.milestones');
  });

  it('sorts linked records into affected work and objectives', () => {
    const ref = (entity_type: string, entity_id: string) => ({
      entity_type,
      entity_id,
      title: entity_id,
      code: null,
      url: null,
      status: null,
      module: null,
      label_key: null,
    });
    const link = (entity_type: string, id: string, link_type = 'relates_to') => ({
      id: `l-${id}`,
      link_type,
      direction: 'outgoing' as const,
      other: ref(entity_type, id),
      created_at: '2026-01-01T00:00:00',
      created_by: null,
    });
    const out = purposeLinks([
      link('process', 'pr-1'),
      link('document', 'd-1'),
      link('document', 'd-out', 'derived_from'),
      link('objective', 'o-1', 'implements'),
      link('risk', 'r-1'),
      link('process', 'pr-1'),
    ]);
    expect(out.affected.map((r) => r.entity_id)).toEqual(['pr-1', 'd-1']);
    expect(out.objectives.map((r) => r.entity_id)).toEqual(['o-1']);
  });

  it('flags at-risk projects like the overview does', () => {
    expect(isAtRisk(makeProject({ health: 'amber' }))).toBe(true);
    expect(isAtRisk(makeProject({ health: 'green', is_overdue: true }))).toBe(true);
    expect(isAtRisk(makeProject({ health: 'green' }))).toBe(false);
    expect(isAtRisk(makeProject({ health: 'red', status: 'completed' }))).toBe(false);
  });

  it('sends change planning and related records on create', () => {
    expect(plansChange('improvement')).toBe(true);
    expect(plansChange('general')).toBe(false);
    const ref = { entity_type: 'process', entity_id: 'pr-1', title: 'Sales' };
    const body = toCreateRequest(
      emptyProjectForm({
        title: 'X',
        change_consequences: ' Downtime ',
        related: [
          { ref, group: 'affected', link_type: 'relates_to' },
          { ref, group: 'affected', link_type: 'relates_to' },
        ],
      }),
    );
    expect(body.change_consequences).toBe('Downtime');
    expect(body.change_resources).toBeNull();
    expect(body.related).toEqual([
      { entity_type: 'process', entity_id: 'pr-1', link_type: 'relates_to' },
    ]);
  });

  it('pins review documents and leaves the stage alone', () => {
    const body = reviewBody(
      emptyReviewDraft({
        title: 'R',
        kind: 'change',
        input_documents: [
          {
            document_id: 'd-1',
            revision: null,
            ref: null,
            current_revision: null,
            outdated: false,
          },
          { document_id: 'd-2', revision: 'B', ref: null, current_revision: 'C', outdated: true },
        ],
      }),
    );
    expect(body.kind).toBe('change');
    expect(body.input_documents).toEqual([
      { document_id: 'd-1' },
      { document_id: 'd-2', revision: 'B' },
    ]);
    expect('stage' in body).toBe(false);
  });

  it('maps project vocabularies onto the shared tone map', () => {
    expect(projectStatusBadge('proposed')).toEqual({
      meaning: 'lifecycle',
      value: 'draft',
      labelKey: 'projects.status.proposed',
    });
    expect(healthBadge('red').value).toBe('non_compliant');
    expect(outcomeBadge('passed_with_actions')).toMatchObject({ meaning: 'compliance' });
  });
});
