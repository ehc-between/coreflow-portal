import { HttpErrorResponse } from '@angular/common/http';
import { applyBiaSuggestion, biaDraft, biaFields, biaProblems } from '../bias/bia-form';
import { applyScenario, exerciseDraft, exercisePlanning } from '../exercises/exercise-form';
import { applyPlanDraft, planDraft, planFields, planProblems } from '../plans/plan-form';
import { contactDraft, contactFields, isReachable } from '../shared/contacts-panel';
import {
  changedFields,
  durationLabel,
  orderedActions,
  splitDuration,
  telHref,
  toMinutes,
} from './continuity-display';
import { continuityErrorKey } from './continuity-errors';

describe('continuity display helpers', () => {
  it('splits minutes into the largest whole unit', () => {
    expect(splitDuration(2880)).toEqual({ value: 2, unit: 'days' });
    expect(splitDuration(120)).toEqual({ value: 2, unit: 'hours' });
    expect(splitDuration(90)).toEqual({ value: 90, unit: 'minutes' });
    expect(splitDuration(0)).toEqual({ value: 0, unit: 'minutes' });
  });

  it('converts a value and unit to whole minutes', () => {
    expect(toMinutes('4', 'hours')).toBe(240);
    expect(toMinutes('1,5', 'days')).toBe(2160);
    expect(toMinutes('', 'hours')).toBeNull();
    expect(toMinutes('-1', 'hours')).toBeNull();
    expect(toMinutes('abc', 'minutes')).toBeNull();
  });

  it('labels durations', () => {
    expect(durationLabel(null)).toEqual({ key: 'continuity.duration.notSet', params: {} });
    expect(durationLabel(1440)).toEqual({ key: 'continuity.duration.days', params: { count: 1 } });
  });

  it('orders workflow actions consistently', () => {
    expect(orderedActions(['retire', 'reject', 'approve', 'unknown'])).toEqual([
      'approve',
      'reject',
      'retire',
    ]);
  });

  it('builds tel links only for plausible numbers', () => {
    expect(telHref('+47 22 33 44 55')).toBe('tel:+4722334455');
    expect(telHref('ab')).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it('reports only changed fields', () => {
    expect(changedFields({ a: 1, b: [1, 2] }, { a: 1, b: [1, 3] })).toEqual({ b: [1, 3] });
  });

  it('maps coded API errors to scoped keys', () => {
    const coded = new HttpErrorResponse({
      status: 422,
      error: { detail: { code: 'rto_exceeds_mtpd' } },
    });
    expect(continuityErrorKey(coded)).toBe('continuity.errors.rto_exceeds_mtpd');
    expect(continuityErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'continuity.errors.forbidden',
    );
    expect(continuityErrorKey(new HttpErrorResponse({ status: 422 }))).toBe(
      'continuity.errors.invalid',
    );
    expect(continuityErrorKey(new Error('x'))).toBe('continuity.errors.generic');
  });
});

describe('BIA form helpers', () => {
  it('validates the title, RTO within MTPD, the interval and dependency names', () => {
    const d = {
      ...biaDraft(null),
      rto_minutes: 600,
      mtpd_minutes: 60,
      review_interval_months: '0',
    };
    d.dependencies = [{ kind: 'site', name: '', notes: '', ict_system_id: '' }];
    expect(biaProblems(d)).toEqual([
      'titleRequired',
      'rtoExceedsMtpd',
      'interval',
      'dependencyName',
    ]);
    const ok = { ...biaDraft(null), title: 'Payroll' };
    ok.dependencies = [{ kind: 'ict', name: '', notes: '', ict_system_id: 'i-1' }];
    expect(biaProblems(ok)).toEqual([]);
  });

  it('builds the API fields and drops the ICT link from non-ICT dependencies', () => {
    const d = { ...biaDraft(null), title: ' Payroll ', criticality: 'high' as const };
    d.dependencies = [{ kind: 'site', name: 'Office', notes: '', ict_system_id: 'i-1' }];
    const f = biaFields(d);
    expect(f.title).toBe('Payroll');
    expect(f.criticality).toBe('high');
    expect(f.review_interval_months).toBe(12);
    expect(f.dependencies).toEqual([
      { kind: 'site', name: 'Office', notes: null, ict_system_id: null },
    ]);
  });

  it('applies the suggested values and keeps the rest', () => {
    const d = { ...biaDraft(null), title: 'Payroll', mbco: 'Pay urgent salaries' };
    const next = applyBiaSuggestion(d, {
      criticality: 'critical',
      impacts: { financial: 4, customer: 9 },
      rto_minutes: 1440,
      mbco: 'Other',
      dependencies: [{ kind: 'supplier', name: 'Bank' }, { name: '' }],
    });
    expect(next.criticality).toBe('critical');
    expect(next.impacts.financial).toBe(4);
    expect(next.impacts.customer).toBeNull();
    expect(next.rto_minutes).toBe(1440);
    expect(next.mbco).toBe('Other');
    expect(next.dependencies).toEqual([
      { kind: 'supplier', name: 'Bank', notes: '', ict_system_id: '' },
    ]);
  });
});

describe('plan form helpers', () => {
  it('preselects BIAs on a new plan and sorts them for comparison', () => {
    const d = planDraft(null, ['b-2', 'b-1']);
    expect(planFields({ ...d, title: 'BCP' }).bia_ids).toEqual(['b-1', 'b-2']);
  });

  it('requires a title and step titles', () => {
    const d = planDraft(null);
    d.steps = [
      { phase: 'response', title: '', description: '', owner_role: '', target_minutes: null },
    ];
    expect(planProblems(d)).toEqual(['titleRequired', 'stepTitle']);
  });

  it('fills empty sections from a draft and appends steps', () => {
    const d = planDraft(null);
    d.texts.scope = 'Our scope';
    const next = applyPlanDraft(d, {
      title: 'ERP outage',
      plan_type: 'disaster_recovery',
      scope: 'Ignored',
      objectives: 'Meet the RTO',
      steps: [{ phase: 'recovery', title: 'Restore', target_minutes: 240 }, { title: '' }],
    });
    expect(next.title).toBe('ERP outage');
    expect(next.plan_type).toBe('disaster_recovery');
    expect(next.texts.scope).toBe('Our scope');
    expect(next.texts.objectives).toBe('Meet the RTO');
    expect(next.steps).toHaveLength(1);
    expect(next.steps[0]).toMatchObject({
      phase: 'recovery',
      title: 'Restore',
      target_minutes: 240,
    });
  });
});

describe('exercise form helpers', () => {
  it('presets an ICT recovery test from the query', () => {
    const d = exerciseDraft(null, { ictId: 'i-1' });
    expect(d.exercise_type).toBe('ict_recovery');
    expect(exercisePlanning({ ...d, title: 'Restore ERP' })).toMatchObject({
      ict_system_id: 'i-1',
      plan_id: null,
    });
  });

  it('writes injects and success criteria into the scenario and objectives', () => {
    const d = exerciseDraft(null, { planId: 'p-1' });
    const next = applyScenario(
      d,
      {
        title: 'Flood',
        scenario: 'The office floods.',
        injects: [{ at_minutes: 30, description: 'Phones down' }],
        success_criteria: ['Crisis team assembled in 30 min'],
        participants: ['Crisis lead', 'IT'],
      },
      { injects: 'Injects:', successCriteria: 'Criteria:', atMinutes: (n) => `+${n}` },
    );
    expect(next.title).toBe('Flood');
    expect(next.scenario).toContain('- +30: Phones down');
    expect(next.objectives).toContain('Crisis team assembled');
    expect(next.participants).toBe('Crisis lead, IT');
  });
});

describe('contact helpers', () => {
  it('needs a phone, an e-mail or a linked member', () => {
    expect(isReachable(contactDraft(null))).toBe(false);
    expect(isReachable({ ...contactDraft(null), email: 'a@b.no' })).toBe(true);
    expect(isReachable({ ...contactDraft(null), user_id: 'u-1' })).toBe(true);
  });

  it('builds the API fields', () => {
    const f = contactFields({ ...contactDraft(null), name: ' Kari ', phone: '123', position: '2' });
    expect(f).toMatchObject({ name: 'Kari', phone: '123', position: 2, email: null });
  });
});
