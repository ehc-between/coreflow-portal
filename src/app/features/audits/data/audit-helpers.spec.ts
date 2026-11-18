import { HttpErrorResponse } from '@angular/common/http';
import { profileFormToInput, profileState } from '../auditors/auditor-register';
import { certificationFormToInput } from '../certifications/certification-form';
import {
  certificationTitle,
  expiresSoon,
  surveillanceSoon,
} from '../certifications/certification-list';
import { canRespond, isNonconformity, splitFindingActions } from '../findings/finding-detail';
import { findingFormToInput, parseDraftFinding } from '../findings/finding-form';
import { findingStatusParam, parseFindingStatusFilter } from '../findings/finding-list';
import { setupSteps } from '../overview/audits-overview';
import { nextEvidenceRefs, parseDraftQuestions } from '../plans/plan-checklist';
import { planLesson, splitPlanActions } from '../plans/plan-detail';
import {
  clauseOfRequirement,
  emptyPlanForm,
  planFormToInput,
  planPrefill,
} from '../plans/plan-form';
import { planStatusParam } from '../plans/plan-list';
import { reportFileName } from '../plans/plan-report';
import { cellState } from '../programmes/programme-coverage';
import { suggestedRiskBasis } from '../programmes/programme-form';
import { toggleChoice } from '../shared/choice-checkboxes';
import {
  checklistProgress,
  checklistResultBadge,
  findingStatusBadge,
  findingTypeBadge,
  frameworksOfClauses,
  fromDateInput,
  leadAuditorName,
  listParam,
  planPrefillParams,
  planStatusBadge,
  riskBadge,
  sumCounts,
  textOrNull,
  toDateInput,
} from './audit-display';
import { auditErrorKey, auditorCheckIssues } from './audit-errors';
import { frameworkOptions } from './audit-frameworks';
import { EntityRef, FindingDetail } from './audit.models';

function httpError(status: number, detail: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { detail } });
}

function ref(entityType: string, id: string, title = id): EntityRef {
  return {
    entity_type: entityType,
    entity_id: id,
    title,
    code: null,
    url: null,
    status: null,
    module: null,
    label_key: null,
  };
}

describe('audit display helpers', () => {
  it('converts between date inputs and naive UTC datetimes', () => {
    expect(toDateInput('2026-11-12T00:00:00')).toBe('2026-11-12');
    expect(toDateInput(null)).toBe('');
    expect(fromDateInput('2026-11-12')).toBe('2026-11-12T00:00:00');
    expect(fromDateInput('')).toBeNull();
    expect(fromDateInput('12.11.2026')).toBeNull();
  });

  it('reads frameworks from clause refs and comma lists from the query', () => {
    expect(
      frameworksOfClauses(['iso9001:8.4', 'hs:9.2', 'iso27001:A.5.35', 'iso9001:7.5']),
    ).toEqual(['iso9001', 'iso27001']);
    expect(listParam(' a, b,,a ')).toEqual(['a', 'b']);
    expect(listParam(null)).toEqual([]);
  });

  it('computes checklist progress and sums counts', () => {
    expect(checklistProgress(1, 3)).toBe(33);
    expect(checklistProgress(0, 0)).toBe(0);
    expect(sumCounts({ planned: 2, in_progress: 1, closed: 4 })).toBe(7);
    expect(sumCounts({ planned: 2, in_progress: 1 }, ['in_progress', 'reporting'])).toBe(1);
  });

  it('maps audit values to the shared tone vocabulary with module labels', () => {
    expect(planStatusBadge('report_review')).toEqual({
      meaning: 'lifecycle',
      value: 'pending_approval',
      labelKey: 'audits.planStatus.report_review',
    });
    expect(planStatusBadge('reporting').value).toBe('in_progress');
    expect(findingTypeBadge('major_nc')).toMatchObject({ meaning: 'severity', value: 'major' });
    expect(findingTypeBadge('ofi').value).toBe('opportunity');
    expect(findingStatusBadge('pending_verification').value).toBe('pending');
    expect(checklistResultBadge('nonconforming')).toMatchObject({
      meaning: 'compliance',
      value: 'non_compliant',
    });
    expect(checklistResultBadge('observation').meaning).toBe('severity');
    expect(riskBadge('high')).toMatchObject({ meaning: 'severity', value: 'high' });
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' x ')).toBe('x');
  });

  it('names the lead auditor, also when the lead is external', () => {
    expect(leadAuditorName({ lead_auditor: { name: 'Ingrid' } })).toBe('Ingrid');
    expect(leadAuditorName({ lead_auditor: null, lead_auditor_name: 'DNV lead' })).toBe('DNV lead');
    expect(
      leadAuditorName({
        lead_auditor: null,
        auditors: [{ role: 'lead', user: null, external_name: 'Lead auditor, DNV' }],
      }),
    ).toBe('Lead auditor, DNV');
    expect(leadAuditorName({ lead_auditor: null })).toBeNull();
  });

  it('builds the prefill of a coverage gap', () => {
    expect(
      planPrefillParams({ frameworks: ['iso9001'], clause_refs: ['iso9001:8.4', 'hs:9.2'] }, 'p-1'),
    ).toEqual({ programme: 'p-1', frameworks: 'iso9001', clauses: 'iso9001:8.4,hs:9.2' });
    expect(planPrefillParams({ process_ids: ['x'] }, null)).toEqual({ processes: 'x' });
  });

  it('offers the enabled standards plus stored values, and only ISO for certificates', () => {
    expect(frameworkOptions(['iso27001', 'gdpr'], ['iso9001'])).toEqual([
      'iso9001',
      'iso27001',
      'gdpr',
    ]);
    expect(frameworkOptions(null)).toHaveLength(8);
    expect(frameworkOptions(['iso27001', 'gdpr'], [], ['iso9001', 'iso27001'])).toEqual([
      'iso27001',
    ]);
  });

  it('toggles multi-value choices', () => {
    expect(toggleChoice(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleChoice(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('audit form mapping', () => {
  it('clears external-only fields on an internal audit and sends the picked clauses', () => {
    const body = planFormToInput(
      {
        ...emptyPlanForm(),
        title: '  Purchasing ',
        kind: 'internal',
        partyType: 'customer',
        partyName: 'Acme',
        certificationId: 'c-1',
        clauseRefs: ['iso9001:8.4', 'hs:9.2', 'iso9001:8.4'],
        processes: [ref('process', 'pr-1', 'Purchasing')],
        auditees: ['u-1'],
        location: ' Oslo ',
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
    expect(body.process_ids).toEqual(['pr-1']);
    expect(body.auditee_user_ids).toEqual(['u-1']);
    expect(body.location).toBe('Oslo');
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

  it('pre-fills a new audit from the query and from a requirement', () => {
    const q = new Map<string, string>([
      ['programme', 'p-1'],
      ['clauses', 'iso27001:A.8.13'],
      ['processes', 'pr-1'],
      ['processTitle', 'Backup'],
    ]);
    const prefill = planPrefill({ get: (k) => q.get(k) ?? null }, 'iso9001-2026:8.4.1.r2');
    expect(prefill.programmeId).toBe('p-1');
    expect(prefill.clauseRefs).toEqual(['iso27001:A.8.13', 'iso9001:8.4.1']);
    expect(prefill.frameworks).toEqual(['iso27001', 'iso9001']);
    expect(prefill.processes?.[0]).toMatchObject({ entity_id: 'pr-1', title: 'Backup' });
    expect(prefill.kind).toBe('internal');
    expect(clauseOfRequirement('eu-ai-act-2024:26.r1')).toBe('eu_ai_act:26');
    expect(clauseOfRequirement('nonsense')).toBeNull();
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

  it('keeps "all open findings" apart from the single status "open"', () => {
    expect(findingStatusParam('unresolved')).toBe('unresolved');
    expect(findingStatusParam('open')).toBe('open');
    expect(findingStatusParam('closed')).toBe('closed');
    expect(findingStatusParam('all')).toBeUndefined();
    expect(findingStatusParam('bogus')).toBeUndefined();
    expect(parseFindingStatusFilter(null)).toBe('unresolved');
    expect(parseFindingStatusFilter('open')).toBe('open');
    expect(parseFindingStatusFilter('junk')).toBe('unresolved');
    expect(planStatusParam('unresolved')).toBe('planned,in_progress,reporting,report_review');
    expect(planStatusParam('all')).toBeUndefined();
    expect(planStatusParam('closed')).toBe('closed');
  });

  it('maps a certificate with a supplier as the body, and the auditor courses', () => {
    const cert = certificationFormToInput(
      {
        framework: 'iso9001',
        supplier: ref('supplier', 's-1', 'DNV'),
        body: '',
        number: '',
        status: 'certified',
        scope: '',
        notes: '',
        issued: '',
        expires: '2027-01-01',
        surveillance: '',
        ownerId: '',
        changeReason: '',
      },
      false,
    );
    expect(cert).toMatchObject({
      supplier_id: 's-1',
      certification_body: null,
      expires_at: '2027-01-01T00:00:00',
    });
    const profile = profileFormToInput(
      {
        userId: 'u-1',
        frameworks: ['iso9001'],
        lead: true,
        qualifications: '',
        trained: '',
        validUntil: '',
        courses: [ref('course', 'c-1')],
        active: true,
      },
      false,
    );
    expect(profile.course_ids).toEqual(['c-1']);
    expect(profile.user_id).toBe('u-1');
  });

  it('reads the assistant drafts of a finding and a programme', () => {
    expect(
      parseDraftFinding({
        title: ' Supplier not evaluated ',
        finding_type: 'minor_nc',
        clause_ref: 'iso9001:8.4.1',
        bogus: 1,
      }),
    ).toEqual({ title: 'Supplier not evaluated', type: 'minor_nc', clauseRef: 'iso9001:8.4.1' });
    expect(parseDraftFinding({ finding_type: 'nonsense' })).toEqual({});
    const t = (k: string, p?: Record<string, unknown>) =>
      k.endsWith('quarter') ? `Q${String(p?.['q'])}` : 'Proposed:';
    expect(
      suggestedRiskBasis(
        {
          risk_basis: 'Purchasing has most complaints.',
          audits: [{ title: 'Purchasing', quarter: 2 }],
        },
        t,
      ),
    ).toBe('Purchasing has most complaints.\n\nProposed:\n- Purchasing (Q2)');
    expect(suggestedRiskBasis(null, t)).toBeNull();
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

  it('flags certificates that expire within 90 days or have a surveillance audit within 30', () => {
    expect(expiresSoon({ days_to_expiry: 30 })).toBe(true);
    expect(expiresSoon({ days_to_expiry: 200 })).toBe(false);
    expect(expiresSoon({ days_to_expiry: null })).toBe(false);
    expect(surveillanceSoon({ days_to_surveillance: 12 })).toBe(true);
    expect(surveillanceSoon({ days_to_surveillance: 60 })).toBe(false);
    expect(surveillanceSoon({})).toBe(false);
    const t = (k: string) => k;
    expect(
      certificationTitle(
        { title: 'ISO 9001 (DNV)', framework: 'iso9001', certification_body: 'DNV' },
        t,
      ),
    ).toBe('ISO 9001 (DNV)');
    expect(certificationTitle({ framework: 'iso9001', certification_body: 'DNV' }, t)).toBe(
      'audits.certification.titleFallback',
    );
  });

  it('gives one primary next step and puts the rest in the menu', () => {
    expect(splitPlanActions(['cancel', 'start'])).toEqual({ primary: 'start', rest: ['cancel'] });
    expect(splitPlanActions(['reopen'])).toEqual({ primary: null, rest: ['reopen'] });
    expect(splitFindingActions(['start', 'submit', 'close', 'cancel'])).toEqual({
      primary: 'start',
      rest: ['submit', 'close', 'cancel'],
    });
    expect(planLesson('planned')).toBe('audit-team');
    expect(planLesson('closed')).toBe('findings-and-capa');
    expect(planLesson('in_progress')).toBe('internal-audits');
  });

  it('treats only nonconformities as needing root cause and verification', () => {
    expect(isNonconformity({ finding_type: 'minor_nc' })).toBe(true);
    expect(isNonconformity({ finding_type: 'ofi' })).toBe(false);
    expect(isNonconformity({ finding_type: 'ofi', is_nonconformity: true })).toBe(true);
  });

  it('adds and removes checklist evidence without duplicates', () => {
    const item = { evidence_refs: [{ entity_type: 'document', entity_id: 'd-1' }] };
    expect(nextEvidenceRefs(item, { add: ref('document', 'd-1') })).toEqual([
      { entity_type: 'document', entity_id: 'd-1' },
    ]);
    expect(nextEvidenceRefs(item, { add: ref('risk', 'r-1') })).toHaveLength(2);
    expect(nextEvidenceRefs(item, { remove: 'd-1' })).toEqual([]);
  });

  it('builds the getting-started steps, the coverage cells and the report file name', () => {
    const steps = setupSteps(
      { programmes: 1, auditors: 0, audits: 2, audits_closed: 0, certifications: 0 },
      { write: true, manage: false },
    );
    expect(steps.map((s) => [s.key, s.done, s.allowed])).toEqual([
      ['programme', true, true],
      ['auditors', false, false],
      ['audit', true, true],
      ['closed', false, true],
      ['certification', false, false],
    ]);
    expect(cellState(undefined)).toBe('none');
    expect(cellState({ planned: 1, done: 0, findings: 0, nonconformities: 0, plans: [] })).toBe(
      'planned',
    );
    expect(cellState({ planned: 1, done: 1, findings: 2, nonconformities: 1, plans: [] })).toBe(
      'done',
    );
    expect(profileState({ expired: true, active: true } as never)).toBe('expired');
    expect(profileState({ expired: false, active: false } as never)).toBe('inactive');
    expect(reportFileName('AUD-2026/002', 'audit-report')).toBe('AUD-2026-002-audit-report.pdf');
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
    expect(auditErrorKey(httpError(422, { code: 'framework_not_certifiable' }))).toBe(
      'audits.errors.framework_not_certifiable',
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
