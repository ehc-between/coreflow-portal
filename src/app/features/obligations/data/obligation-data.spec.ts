import { HttpErrorResponse } from '@angular/common/http';
import { makeChange, makeEvaluation, makeObligation } from '../obligations.testing';
import { preparesTask, sortChanges } from '../obligation-changes';
import { evaluationProblems, needsFollowUp, overallResult } from '../obligation-evaluations';
import { taskKindKey } from '../obligation-actions';
import { jurisdictionChoice } from '../obligation-form';
import { compliancesForFilter } from '../obligations-list';
import { normaliseProposal } from '../requirement-proposal';
import {
  addDaysIso,
  clauseLabel,
  complianceKey,
  daysUntil,
  exportFileName,
  frameworkKey,
  jurisdictionKey,
  nextSteps,
  obligationStatusKey,
  obligationTypeKey,
  safeUrl,
} from './obligation-display';
import { obligationErrorKey } from './obligation-errors';
import {
  applyProposal,
  applySeed,
  cleanDuties,
  cleanRequirements,
  emptyObligationForm,
  formFromObligation,
  frameworkOfRef,
  mergeRefs,
  newDuty,
  proposalText,
  seedFromPrefill,
  toCreateRequest,
  toUpdateRequest,
  validateObligationForm,
} from './obligation-form-model';
import { OBLIGATION_LIBRARY, libraryKey } from './obligation-library';

function coded(status: number, code: string) {
  return new HttpErrorResponse({ status, error: { detail: { code } } });
}

describe('obligation display helpers', () => {
  it('maps known values to keys and unknown values to a fallback', () => {
    expect(obligationStatusKey('active')).toBe('obligations.status.active');
    expect(obligationStatusKey('weird')).toBe('obligations.status.unknown');
    expect(obligationTypeKey('permit')).toBe('obligations.types.permit');
    expect(obligationTypeKey(null)).toBe('obligations.types.other');
    expect(complianceKey('non_compliant')).toBe('obligations.compliance.non_compliant');
    expect(frameworkKey('gdpr')).toBe('obligations.frameworks.gdpr');
    expect(frameworkKey('iso22301')).toBe('obligations.frameworks.unknown');
    expect(jurisdictionKey('NO')).toBe('obligations.jurisdictions.NO');
    expect(jurisdictionKey('Oslo kommune')).toBeNull();
  });

  it('labels clause refs as "<standard> · <number>" without raw keys', () => {
    const t = (key: string) => (key === 'standards.reqs.short.eu_ai_act' ? 'KI-forordningen' : key);
    expect(clauseLabel('gdpr:30', t)).toBe('GDPR · 30');
    expect(clauseLabel('iso14001:6.1.3', t)).toBe('ISO 14001 · 6.1.3');
    expect(clauseLabel('eu_ai_act:26', t)).toBe('KI-forordningen · 26');
  });

  it('counts whole days to a date and adds days', () => {
    const today = new Date(2026, 10, 12);
    expect(daysUntil('2026-11-22', today)).toBe(10);
    expect(daysUntil('2026-11-02', today)).toBe(-10);
    expect(daysUntil(null, today)).toBeNull();
    expect(addDaysIso(30, today)).toBe('2026-12-12');
  });

  it('only links http(s) sources', () => {
    expect(safeUrl(' https://lovdata.no/x ')).toBe('https://lovdata.no/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });

  it('names the export after the language', () => {
    expect(exportFileName('xlsx', 'nb')).toBe('lovregister.xlsx');
    expect(exportFileName('pdf', 'en')).toBe('obligations-register.pdf');
  });
});

describe('next steps of an obligation', () => {
  const today = new Date(2026, 10, 17);

  it('asks for the first evaluation, a plan and a follow-up, most urgent first', () => {
    const steps = nextSteps(
      makeObligation({
        evaluation_count: 0,
        next_evaluation: null,
        needs_schedule: true,
        evaluation_rrule: null,
        latest_evaluation: null,
      }),
      today,
    );
    expect(steps.map((s) => s.kind)).toEqual(['firstEvaluation', 'noSchedule']);
    const failing = nextSteps(
      makeObligation({
        latest_evaluation: makeEvaluation({ result: 'partially_compliant' }),
        next_evaluation: { task_id: 't', due_at: '2026-10-01T00:00:00', overdue: true },
      }),
      today,
    );
    expect(failing.map((s) => s.kind)).toEqual(['overdue', 'noFollowUp']);
  });

  it('does not ask for a follow-up when a deviation or task exists', () => {
    const steps = nextSteps(
      makeObligation({
        latest_evaluation: makeEvaluation({ result: 'non_compliant', deviation_id: 'dev-1' }),
      }),
      today,
    );
    expect(steps.map((s) => s.kind)).toEqual(['ok']);
  });

  it('flags renewal, expiry, changes, drafts and retired obligations', () => {
    expect(
      nextSteps(makeObligation({ renewal_due: true, renewal_due_on: '2026-12-01' }), today)[0],
    ).toEqual({ kind: 'renewal', tone: 'warn', params: { date: '2026-12-01' } });
    expect(nextSteps(makeObligation({ valid_until: '2026-01-01' }), today)[0].kind).toBe('expired');
    expect(nextSteps(makeObligation({ open_changes: 2 }), today)[0]).toEqual({
      kind: 'changes',
      tone: 'info',
      params: { count: 2 },
    });
    expect(nextSteps(makeObligation({ status: 'draft' }), today)[0].kind).toBe('draft');
    expect(nextSteps(makeObligation({ status: 'retired', needs_schedule: true }), today)).toEqual([
      { kind: 'retired', tone: 'info', params: {} },
    ]);
  });
});

describe('obligationErrorKey', () => {
  it('translates coded errors and falls back by status', () => {
    expect(obligationErrorKey(coded(409, 'obligation_retired'))).toBe(
      'obligations.errors.obligation_retired',
    );
    expect(obligationErrorKey(coded(422, 'follow_up_required'))).toBe(
      'obligations.errors.follow_up_required',
    );
    expect(obligationErrorKey(coded(422, 'invalid_clause_ref'))).toBe(
      'obligations.errors.invalid_clause_ref',
    );
    expect(obligationErrorKey(new HttpErrorResponse({ status: 403 }))).toBe(
      'obligations.errors.forbidden',
    );
    expect(obligationErrorKey(new HttpErrorResponse({ status: 404 }))).toBe(
      'obligations.errors.notFound',
    );
    expect(obligationErrorKey(new Error('x'))).toBe('errors.generic');
  });
});

describe('obligation form model', () => {
  it('cleans texts and duties: trims, drops blanks, keeps ids and clauses', () => {
    expect(cleanRequirements([' a ', '', 'b', 'a', '  '])).toEqual(['a', 'b']);
    expect(
      cleanDuties([
        newDuty(' Risk assessment ', { id: 'd-1', clause_refs: ['iso45001:6.1.2'] }),
        newDuty('  '),
        newDuty('Safety representative', { owner_user_id: 'u-2' }),
      ]),
    ).toEqual([
      {
        id: 'd-1',
        title: 'Risk assessment',
        owner_user_id: null,
        clause_refs: ['iso45001:6.1.2'],
      },
      { title: 'Safety representative', owner_user_id: 'u-2', clause_refs: [] },
    ]);
  });

  it('starts new obligations active, in Norway, with a yearly evaluation', () => {
    const form = emptyObligationForm();
    expect(form.status).toBe('active');
    expect(form.jurisdiction).toBe('NO');
    expect(form.evaluate).toBe(true);
    expect(form.evaluation_rrule).toBe('FREQ=YEARLY');
  });

  it('builds a create body with duties and clauses, without unset values', () => {
    const body = toCreateRequest({
      ...emptyObligationForm(),
      title: '  Working Environment Act ',
      duties: [newDuty('Risk assessment'), newDuty(' ')],
      frameworks: ['iso45001'],
      clause_refs: ['iso45001:6.1.3'],
      evaluate: false,
    });
    expect(body).toEqual({
      title: 'Working Environment Act',
      obligation_type: 'law',
      status: 'active',
      duties: [{ title: 'Risk assessment', owner_user_id: null, clause_refs: [] }],
      frameworks: ['iso45001'],
      clause_refs: ['iso45001:6.1.3'],
      jurisdiction: 'NO',
    });
  });

  it('includes the schedule and renewal lead when set', () => {
    const body = toCreateRequest({
      ...emptyObligationForm(),
      title: 'Permit',
      obligation_type: 'permit',
      evaluation_rrule: 'FREQ=MONTHLY;INTERVAL=3',
      evaluation_start: '2026-12-01',
      evaluation_lead_days: '7',
      renewal_lead_days: '180',
    });
    expect(body.evaluation_rrule).toBe('FREQ=MONTHLY;INTERVAL=3');
    expect(body.evaluation_start).toBe('2026-12-01');
    expect(body.evaluation_lead_days).toBe(7);
    expect(body.renewal_lead_days).toBe(180);
  });

  it('sends only changed fields plus the change reason on update', () => {
    const original = formFromObligation(makeObligation());
    expect(original.duties.map((d) => d.id)).toEqual(['d-1', 'd-2']);
    expect(toUpdateRequest(original, original, 'nothing')).toEqual({});
    const body = toUpdateRequest(
      original,
      { ...original, title: 'Renamed', duties: [...original.duties, newDuty('New duty')] },
      ' amended ',
    );
    expect(body).toEqual({
      title: 'Renamed',
      duties: [
        {
          id: 'd-1',
          title: 'Measure noise every quarter',
          owner_user_id: null,
          clause_refs: ['iso14001:9.1.2'],
        },
        { id: 'd-2', title: 'Report emissions by 1 March', owner_user_id: null, clause_refs: [] },
        { title: 'New duty', owner_user_id: null, clause_refs: [] },
      ],
      change_reason: 'amended',
    });
  });

  it('clears the schedule when evaluation is turned off', () => {
    const original = formFromObligation(makeObligation());
    const body = toUpdateRequest(original, { ...original, evaluate: false }, '');
    expect(body).toEqual({ evaluation_rrule: null, evaluation_start: null });
  });

  it('validates the title, dates, lead days and renewal days', () => {
    const errors = validateObligationForm({
      ...emptyObligationForm(),
      valid_from: '2026-05-01',
      valid_until: '2026-01-01',
      evaluate: true,
      evaluation_lead_days: '400',
      renewal_lead_days: '900',
    });
    expect(errors['title']).toBe('obligations.form.errors.titleRequired');
    expect(errors['valid_until']).toBe('obligations.errors.invalid_dates');
    expect(errors['evaluation_lead_days']).toBe('obligations.errors.invalid_lead_days');
    expect(errors['renewal_lead_days']).toBe('obligations.form.errors.renewalLeadDays');
    expect(validateObligationForm({ ...emptyObligationForm(), title: 'Ok' })).toEqual({});
  });

  it('merges an accepted proposal without overwriting what the user set', () => {
    const form = {
      ...emptyObligationForm(),
      title: 'GDPR',
      applicability: 'All customer data',
      duties: [newDuty('Keep a record of processing')],
      frameworks: ['gdpr' as const],
    };
    const next = applyProposal(
      form,
      {
        obligation_type: 'regulation',
        applicability: 'Ignored',
        frameworks: ['gdpr', 'iso27001', 'bogus'],
        evaluation_rrule: 'FREQ=MONTHLY',
        requirements: [{ text: 'Keep a record of processing' }, { text: 'Report breaches' }],
      },
      ['Keep a record of processing', 'Report breaches'],
      true,
    );
    expect(next.obligation_type).toBe('regulation');
    expect(next.applicability).toBe('All customer data');
    expect(next.duties.map((d) => d.title)).toEqual([
      'Keep a record of processing',
      'Report breaches',
    ]);
    expect(next.frameworks).toEqual(['gdpr', 'iso27001']);
    expect(next.evaluate).toBe(true);
    expect(next.evaluation_rrule).toBe('FREQ=MONTHLY');
  });

  it('fills the form from a create-from-here flow without overwriting typed text', () => {
    const seed = seedFromPrefill({
      title: 'Solvent emissions',
      obligation_type: 'permit',
      frameworks: ['iso14001', 7],
      clause_refs: ['iso14001:6.1.3', 'iso14001:9.1.2'],
      from: { entity_type: 'env_aspect' },
    });
    const next = applySeed({ ...emptyObligationForm(), issuer: 'Statsforvalteren' }, seed);
    expect(next.title).toBe('Solvent emissions');
    expect(next.issuer).toBe('Statsforvalteren');
    expect(next.obligation_type).toBe('permit');
    expect(next.frameworks).toEqual(['iso14001']);
    expect(next.clause_refs).toEqual(['iso14001:6.1.3', 'iso14001:9.1.2']);
  });

  it('merges clause refs and reads their framework', () => {
    expect(mergeRefs(['gdpr:5'], ['gdpr:5', 'gdpr:24'])).toEqual(['gdpr:5', 'gdpr:24']);
    expect(frameworkOfRef('iso27001-2022:A.5.31')).toBe('iso27001');
    expect(frameworkOfRef('hs:4.2')).toBeNull();
  });

  it('builds the proposal text from the filled-in fields', () => {
    expect(
      proposalText({ ...emptyObligationForm(), jurisdiction: '', title: 'A', description: ' B ' }),
    ).toBe('A\n\nB');
  });
});

describe('the obligation library', () => {
  it('has unique keys, canonical clause refs and duties', () => {
    const keys = OBLIGATION_LIBRARY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of OBLIGATION_LIBRARY) {
      expect(e.duties.length).toBeGreaterThan(0);
      expect(e.source_url).toMatch(/^https:\/\//);
      for (const ref of [...e.clause_refs, ...e.duties.flatMap((d) => d.clause_refs)]) {
        expect(ref).toMatch(/^[a-z0-9_]+:[A-Z0-9.]+$/);
      }
    }
    expect(libraryKey('arbeidsmiljoloven', 'duties.d1')).toBe(
      'obligations.library.entries.arbeidsmiljoloven.duties.d1',
    );
  });
});

describe('normaliseProposal', () => {
  it('keeps only well-formed parts of the assist result', () => {
    expect(normaliseProposal(null)).toBeNull();
    const p = normaliseProposal({
      summary: ' S ',
      obligation_type: 'nonsense',
      frameworks: ['gdpr', 'x', 3],
      requirements: [{ text: 'R1', rationale: 'because' }, { text: '' }, 'R2', 5],
      evidence: ['E', ''],
      evaluation_rrule: 'FREQ=YEARLY',
    });
    expect(p).toEqual({
      summary: 'S',
      obligation_type: null,
      applicability: null,
      frameworks: ['gdpr'],
      requirements: [
        { text: 'R1', rationale: 'because' },
        { text: 'R2', rationale: null },
      ],
      evidence: ['E'],
      evaluation_rrule: 'FREQ=YEARLY',
    });
  });
});

describe('module rules', () => {
  it('asks for a follow-up only for gaps', () => {
    expect(needsFollowUp('non_compliant')).toBe(true);
    expect(needsFollowUp('partially_compliant')).toBe(true);
    expect(needsFollowUp('compliant')).toBe(false);
    expect(needsFollowUp('not_applicable')).toBe(false);
  });

  it('derives the overall result from the duties like the backend', () => {
    expect(overallResult([])).toBeNull();
    expect(overallResult(['compliant', 'not_applicable'])).toBe('compliant');
    expect(overallResult(['non_compliant', 'non_compliant'])).toBe('non_compliant');
    expect(overallResult(['compliant', 'non_compliant'])).toBe('partially_compliant');
    expect(overallResult(['not_applicable'])).toBe('not_applicable');
  });

  it('requires findings and a way forward for a gap', () => {
    const base = {
      result: 'partially_compliant' as const,
      evaluatedOn: '2026-11-17',
      today: '2026-11-17',
      notes: '',
      resolution: 'task' as const,
      taskTitle: '',
      deviation: null,
      justification: '',
    };
    expect(evaluationProblems(base)).toEqual([
      'obligations.evaluations.problems.findings',
      'obligations.evaluations.problems.task',
    ]);
    expect(evaluationProblems({ ...base, notes: 'x', resolution: 'deviation_new' })).toEqual([]);
    expect(evaluationProblems({ ...base, result: null })).toEqual([
      'obligations.evaluations.problems.result',
    ]);
    expect(evaluationProblems({ ...base, result: 'compliant' })).toEqual([]);
  });

  it('maps the filters, task kinds and jurisdiction choice', () => {
    expect(compliancesForFilter('not_fully')).toEqual(['partially_compliant', 'non_compliant']);
    expect(compliancesForFilter('')).toBeUndefined();
    expect(taskKindKey('obligation_renewal', false)).toBe('obligations.actions.kinds.renewal');
    expect(taskKindKey('obligation_action', true)).toBe('obligations.actions.kinds.dutyAction');
    expect(jurisdictionChoice('EU')).toBe('EU');
    expect(jurisdictionChoice('Oslo kommune')).toBe('other');
    expect(jurisdictionChoice('')).toBe('');
  });

  it('plans a change task only for medium or high impact with a date', () => {
    expect(preparesTask({ impact: 'high', effective_on: '2027-01-01' })).toBe(true);
    expect(preparesTask({ impact: 'low', effective_on: '2027-01-01' })).toBe(false);
    expect(preparesTask({ impact: 'medium', effective_on: null })).toBe(false);
  });

  it('sorts open change notes first by effective date, then assessed ones newest first', () => {
    const sorted = sortChanges([
      makeChange({ id: 'a', status: 'assessed', noted_on: '2026-01-01' }),
      makeChange({ id: 'b', status: 'open', effective_on: null }),
      makeChange({ id: 'c', status: 'open', effective_on: '2027-01-01' }),
      makeChange({ id: 'd', status: 'assessed', noted_on: '2026-06-01' }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});
