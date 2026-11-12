import { HttpErrorResponse } from '@angular/common/http';
import { expiresSoon } from '../certifications/certification-list';
import { canRespond } from '../findings/finding-detail';
import { findingFormToInput } from '../findings/finding-form';
import { findingStatusParam } from '../findings/finding-list';
import { parseDraftQuestions } from '../plans/plan-checklist';
import { emptyPlanForm, planFormToInput } from '../plans/plan-form';
import { toggleChoice } from '../shared/choice-checkboxes';
import {
  checklistProgress,
  fromDateInput,
  parseClauseRefs,
  planStatusTone,
  sumCounts,
  textOrNull,
  toDateInput,
} from './audit-display';
import { auditErrorKey, auditorCheckIssues } from './audit-errors';
import { FindingDetail } from './audit.models';

function httpError(status: number, detail: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { detail } });
}

describe('audit display helpers', () => {
  it('converts between date inputs and naive UTC datetimes', () => {
    expect(toDateInput('2026-11-12T00:00:00')).toBe('2026-11-12');
    expect(toDateInput(null)).toBe('');
    expect(fromDateInput('2026-11-12')).toBe('2026-11-12T00:00:00');
    expect(fromDateInput('')).toBeNull();
    expect(fromDateInput('12.11.2026')).toBeNull();
  });

  it('parses clause references from free text, dropping junk and duplicates', () => {
    expect(parseClauseRefs('iso9001:8.4, hs:9.2\niso27001:A.5.35; iso9001:8.4 nonsense')).toEqual([
      'iso9001:8.4',
      'hs:9.2',
      'iso27001:A.5.35',
    ]);
    expect(parseClauseRefs('')).toEqual([]);
  });

  it('computes checklist progress and sums counts', () => {
    expect(checklistProgress(1, 3)).toBe(33);
    expect(checklistProgress(0, 0)).toBe(0);
    expect(sumCounts({ planned: 2, in_progress: 1, closed: 4 })).toBe(7);
    expect(sumCounts({ planned: 2, in_progress: 1 }, ['in_progress', 'reporting'])).toBe(1);
  });

  it('maps statuses to badge tones and trims optional text', () => {
    expect(planStatusTone('closed')).toBe('pass');
    expect(planStatusTone('report_review')).toBe('warn');
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' x ')).toBe('x');
  });

  it('toggles multi-value choices', () => {
    expect(toggleChoice(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleChoice(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('audit form mapping', () => {
  it('clears external-only fields on an internal audit and parses clauses', () => {
    const body = planFormToInput(
      {
        ...emptyPlanForm(),
        title: '  Purchasing ',
        kind: 'internal',
        partyType: 'customer',
        partyName: 'Acme',
        certificationId: 'c-1',
        clauseRefs: 'iso9001:8.4, hs:9.2',
        start: '2026-03-01',
        end: '',
      },
      false,
    );
    expect(body.title).toBe('Purchasing');
    expect(body.external_party_type).toBeNull();
    expect(body.external_party_name).toBeNull();
    expect(body.certification_id).toBeNull();
    expect(body.clause_refs).toEqual(['iso9001:8.4', 'hs:9.2']);
    expect(body.planned_start).toBe('2026-03-01T00:00:00');
    expect(body.planned_end).toBeNull();
    expect('change_reason' in body).toBe(false);
  });

  it('keeps external fields and sends the change reason when editing', () => {
    const body = planFormToInput(
      {
        ...emptyPlanForm(),
        title: 'Cert',
        kind: 'external',
        partyType: 'certification_body',
        certificationId: 'c-1',
        changeReason: 'Moved',
      },
      true,
    );
    expect(body.external_party_type).toBe('certification_body');
    expect(body.certification_id).toBe('c-1');
    expect(body.change_reason).toBe('Moved');
  });

  it('links a new finding to its checklist item, but not on edit', () => {
    const value = {
      title: 'Gap',
      type: 'minor_nc' as const,
      description: '',
      evidence: 'Register',
      clauseRef: 'iso9001:8.4',
      checklistItemId: 'i-1',
      ownerId: 'u-2',
      departmentId: '',
      due: '2026-12-01',
      changeReason: '',
    };
    expect(findingFormToInput(value, false)).toMatchObject({
      checklist_item_id: 'i-1',
      owner_user_id: 'u-2',
      department_id: null,
      description: null,
      response_due_at: '2026-12-01T00:00:00',
    });
    expect('checklist_item_id' in findingFormToInput(value, true)).toBe(false);
  });

  it('builds the findings status filter', () => {
    expect(findingStatusParam('open')).toBe('open,in_progress,pending_verification');
    expect(findingStatusParam('closed')).toBe('closed');
    expect(findingStatusParam('')).toBeUndefined();
    expect(findingStatusParam('bogus')).toBeUndefined();
  });
});

describe('audit rules in the portal', () => {
  const finding = { status: 'open', owner: { id: 'u-2', name: 'Ola' } } as unknown as FindingDetail;

  it('lets the finding owner respond without write access, while the finding is open', () => {
    expect(canRespond(finding, 'u-2', false)).toBe(true);
    expect(canRespond(finding, 'u-3', false)).toBe(false);
    expect(canRespond(finding, 'u-3', true)).toBe(true);
    expect(canRespond({ ...finding, status: 'pending_verification' }, 'u-2', true)).toBe(false);
  });

  it('flags certificates that expire within 90 days', () => {
    expect(expiresSoon({ days_to_expiry: 30 })).toBe(true);
    expect(expiresSoon({ days_to_expiry: 200 })).toBe(false);
    expect(expiresSoon({ days_to_expiry: null })).toBe(false);
  });

  it('keeps only well-formed drafted questions from the assistant', () => {
    expect(
      parseDraftQuestions({
        questions: [
          {
            clause_ref: 'iso9001:8.4',
            question: ' How are suppliers evaluated? ',
            evidence_request: 'Evaluations',
          },
          { question: '' },
          { clause_ref: 3, question: 'Who approves?', evidence_request: null },
          'junk',
        ],
      }),
    ).toEqual([
      {
        clause_ref: 'iso9001:8.4',
        question: 'How are suppliers evaluated?',
        evidence_request: 'Evaluations',
      },
      { clause_ref: null, question: 'Who approves?', evidence_request: null },
    ]);
    expect(parseDraftQuestions(null)).toEqual([]);
    expect(parseDraftQuestions({ questions: 'no' })).toEqual([]);
  });
});

describe('audit errors', () => {
  it('maps coded errors to scoped keys and falls back to neutral messages', () => {
    expect(auditErrorKey(httpError(409, { code: 'segregation_of_duties' }))).toBe(
      'audits.errors.segregation_of_duties',
    );
    expect(auditErrorKey(httpError(403, 'Insufficient permissions'))).toBe(
      'audits.errors.forbidden',
    );
    expect(auditErrorKey(httpError(409, { code: 'something_new' }))).toBe('errors.generic');
    expect(auditErrorKey(httpError(500, null))).toBe('errors.server');
    expect(auditErrorKey(new Error('x'))).toBe('errors.generic');
  });

  it('reads the issues of a failed auditor check', () => {
    expect(
      auditorCheckIssues(
        httpError(409, { code: 'auditor_check_failed', issues: ['competence_expired', 7] }),
      ),
    ).toEqual(['competence_expired']);
    expect(auditorCheckIssues(httpError(409, { code: 'auditor_exists' }))).toEqual([]);
  });
});
