import { HttpErrorResponse } from '@angular/common/http';
import { makeChange, makeObligation } from '../obligations.testing';
import { sortChanges } from '../obligation-changes';
import { needsFollowUp } from '../obligation-evaluations';
import { normaliseProposal } from '../requirement-proposal';
import {
  complianceKey,
  complianceTone,
  daysUntil,
  frameworkKey,
  obligationStatusKey,
  obligationTypeKey,
  safeUrl,
} from './obligation-display';
import { obligationErrorKey } from './obligation-errors';
import {
  applyProposal,
  cleanRequirements,
  emptyObligationForm,
  formFromObligation,
  proposalText,
  toCreateRequest,
  toUpdateRequest,
  validateObligationForm,
} from './obligation-form-model';

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
    expect(complianceTone('non_compliant')).toBe('fail');
    expect(complianceTone('partially_compliant')).toBe('warn');
    expect(frameworkKey('gdpr')).toBe('obligations.frameworks.gdpr');
    expect(frameworkKey('iso22301')).toBe('obligations.frameworks.unknown');
  });

  it('counts whole days to a date', () => {
    const today = new Date(2026, 10, 12);
    expect(daysUntil('2026-11-22', today)).toBe(10);
    expect(daysUntil('2026-11-02', today)).toBe(-10);
    expect(daysUntil(null, today)).toBeNull();
  });

  it('only links http(s) sources', () => {
    expect(safeUrl(' https://lovdata.no/x ')).toBe('https://lovdata.no/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });
});

describe('obligationErrorKey', () => {
  it('translates coded errors and falls back by status', () => {
    expect(obligationErrorKey(coded(409, 'obligation_retired'))).toBe(
      'obligations.errors.obligation_retired',
    );
    expect(obligationErrorKey(coded(422, 'invalid_rrule'))).toBe(
      'obligations.errors.invalid_rrule',
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
  it('cleans requirements: trims, drops blanks and duplicates', () => {
    expect(cleanRequirements([' a ', '', 'b', 'a', '  '])).toEqual(['a', 'b']);
  });

  it('builds a create body without unset values and without a schedule when off', () => {
    const body = toCreateRequest({
      ...emptyObligationForm(),
      title: '  Working Environment Act ',
      requirements: ['Risk assessment', ' '],
      frameworks: ['iso45001'],
    });
    expect(body).toEqual({
      title: 'Working Environment Act',
      obligation_type: 'law',
      status: 'draft',
      requirements: ['Risk assessment'],
      frameworks: ['iso45001'],
    });
  });

  it('includes the schedule when evaluation is on', () => {
    const body = toCreateRequest({
      ...emptyObligationForm(),
      title: 'Permit',
      evaluate: true,
      evaluation_rrule: 'FREQ=MONTHLY;INTERVAL=3',
      evaluation_start: '2026-12-01',
      evaluation_lead_days: '7',
    });
    expect(body.evaluation_rrule).toBe('FREQ=MONTHLY;INTERVAL=3');
    expect(body.evaluation_start).toBe('2026-12-01');
    expect(body.evaluation_lead_days).toBe(7);
  });

  it('sends only changed fields plus the change reason on update', () => {
    const original = formFromObligation(makeObligation());
    expect(toUpdateRequest(original, original, 'nothing')).toEqual({});
    const body = toUpdateRequest(
      original,
      { ...original, title: 'Renamed', requirements: [...original.requirements, 'New duty'] },
      ' amended ',
    );
    expect(body).toEqual({
      title: 'Renamed',
      requirements: ['Measure noise every quarter', 'Report emissions by 1 March', 'New duty'],
      change_reason: 'amended',
    });
  });

  it('clears the schedule when evaluation is turned off', () => {
    const original = formFromObligation(makeObligation());
    const body = toUpdateRequest(original, { ...original, evaluate: false }, '');
    expect(body).toEqual({ evaluation_rrule: null, evaluation_start: null });
  });

  it('validates the title, dates and lead days', () => {
    const errors = validateObligationForm({
      ...emptyObligationForm(),
      valid_from: '2026-05-01',
      valid_until: '2026-01-01',
      evaluate: true,
      evaluation_lead_days: '400',
    });
    expect(errors['title']).toBe('obligations.form.errors.titleRequired');
    expect(errors['valid_until']).toBe('obligations.errors.invalid_dates');
    expect(errors['evaluation_lead_days']).toBe('obligations.errors.invalid_lead_days');
    expect(validateObligationForm({ ...emptyObligationForm(), title: 'Ok' })).toEqual({});
  });

  it('merges an accepted proposal without overwriting what the user set', () => {
    const form = {
      ...emptyObligationForm(),
      title: 'GDPR',
      applicability: 'All customer data',
      requirements: ['Keep a record of processing'],
      frameworks: ['gdpr' as const],
    };
    const next = applyProposal(
      form,
      {
        obligation_type: 'regulation',
        applicability: 'Ignored',
        frameworks: ['gdpr', 'iso27001', 'bogus'],
        evaluation_rrule: 'FREQ=YEARLY',
        requirements: [{ text: 'Keep a record of processing' }, { text: 'Report breaches' }],
      },
      ['Keep a record of processing', 'Report breaches'],
      true,
    );
    expect(next.obligation_type).toBe('regulation');
    expect(next.applicability).toBe('All customer data');
    expect(next.requirements).toEqual(['Keep a record of processing', 'Report breaches']);
    expect(next.frameworks).toEqual(['gdpr', 'iso27001']);
    expect(next.evaluate).toBe(true);
    expect(next.evaluation_rrule).toBe('FREQ=YEARLY');
  });

  it('builds the proposal text from the filled-in fields', () => {
    expect(proposalText({ ...emptyObligationForm(), title: 'A', description: ' B ' })).toBe(
      'A\n\nB',
    );
    expect(proposalText(emptyObligationForm())).toBe('');
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
