import { describe, expect, it, vi } from 'vitest';
import { projectLeadStatus, projectMissing } from './project-detail';
import { makeProjectDetail } from './projects.testing';

const EDIT = ['/projects', 'p-1', 'edit'];

describe('projectLeadStatus', () => {
  it('says how an open project is going and how far it has come', () => {
    const s = projectLeadStatus(makeProjectDetail({ is_overdue: false }));
    expect(s.tone).toBe('warn');
    expect(s.statusKey).toBe('projects.healths.amber');
    expect(s.meaningKey).toBe('projects.detail.lead.meaning.milestones');
    expect(s.meaningParams).toEqual({ done: 1, total: 2 });
  });

  it('puts a passed deadline first', () => {
    const s = projectLeadStatus(makeProjectDetail({ is_overdue: true, health: 'green' }));
    expect(s.statusKey).toBe('projects.detail.lead.overdue');
    expect(s.tone).toBe('warn');
  });

  it('falls back to the status word when there is no traffic light', () => {
    const p = makeProjectDetail({ health: null, is_overdue: false, status: 'planned' });
    const s = projectLeadStatus({
      ...p,
      progress: { ...p.progress, percent_basis: 'none' },
    });
    expect(s.statusKey).toBe('projects.status.planned');
    expect(s.meaningKey).toBe('projects.detail.lead.meaning.none');
    expect(s.tone).toBe('info');
  });

  it('says how a closed project ended', () => {
    const done = projectLeadStatus(
      makeProjectDetail({ status: 'completed', objective_met: 'yes' }),
    );
    expect(done).toMatchObject({
      tone: 'pass',
      meaningKey: 'projects.detail.lead.meaning.met.yes',
    });
    const missed = projectLeadStatus(
      makeProjectDetail({ status: 'completed', objective_met: 'no' }),
    );
    expect(missed.tone).toBe('warn');
    const stopped = projectLeadStatus(makeProjectDetail({ status: 'cancelled' }));
    expect(stopped).toMatchObject({
      tone: 'neutral',
      meaningKey: 'projects.detail.lead.meaning.cancelled',
    });
  });
});

describe('projectMissing', () => {
  it('lists open work and empty key fields with where to go', () => {
    const go = vi.fn();
    const p = makeProjectDetail({ objective: null, owner: null, due_date: null });
    const items = projectMissing(
      { ...p, progress: { ...p.progress, milestones_overdue: 2, review_actions_open: 1 } },
      EDIT,
      go,
    );
    const keys = items.map((i) => i.key);
    expect(keys).toEqual(['overdue', 'reviews', 'actions', 'objective', 'owner', 'due']);
    expect(items[0].params).toEqual({ count: 2 });
    items[0].action!();
    expect(go).toHaveBeenCalledWith('overdue');
    expect(items.find((i) => i.key === 'objective')?.link).toBe(EDIT);
  });

  it('leaves out edit lines without edit rights, and asks for a plan when nothing is planned', () => {
    const p = makeProjectDetail({ objective: null });
    const items = projectMissing(
      {
        ...p,
        progress: { ...p.progress, milestones_total: 0, tasks_total: 0, design_reviews_pending: 0 },
      },
      null,
      () => undefined,
    );
    expect(items.map((i) => i.key)).toEqual(['plan']);
  });

  it('counts open security checks and needs nothing once closed', () => {
    const p = makeProjectDetail({
      security_relevant: true,
      security_checklist: [
        { key: 'risk_assessment', done: true, count: 1, items: [] },
        { key: 'dpia', done: false, count: 0, items: [] },
      ],
    });
    expect(
      projectMissing(p, EDIT, () => undefined).find((i) => i.key === 'security')?.params,
    ).toEqual({ count: 1 });
    expect(projectMissing({ ...p, status: 'completed' }, EDIT, () => undefined)).toEqual([]);
  });
});
