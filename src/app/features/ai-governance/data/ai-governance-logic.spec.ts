import { HttpErrorResponse } from '@angular/common/http';
import { asClassificationResult } from '../assessments/assessment-detail';
import { mergeDraft } from '../assessments/assessment-edit';
import { isOverdue, isReviewOverdue } from '../assessments/assessments-list';
import { hasAnswers } from '../classification/classification-wizard';
import { filterPeople } from '../literacy/literacy-page';
import { attentionItems } from '../overview/ai-governance-overview';
import { clampMonths } from '../settings/ai-governance-settings';
import { emptySystemForm, formToRequest, systemToForm } from '../systems/system-form';
import { parseNumber } from '../systems/system-monitoring';
import { toneFor } from '../../../shared/ui/tones';
import { aiGovernanceErrorKey, isDowngradeRefusal, missingSections } from './ai-governance-errors';
import {
  assessmentStatusValue,
  attentionTextKey,
  countKey,
  emptyAnswers,
  monitoringValue,
  normalizeAnswers,
  obligationProgress,
  obligationValue,
  parseTags,
  reasonText,
  riskValue,
  sectionAnswers,
  splitUrl,
  systemStatusValue,
  toggleIn,
} from './ai-governance-display';
import { AiGovernanceOverview, AiSystem, AssessmentSummary } from './ai-governance.models';

const httpError = (status: number, detail: unknown) =>
  new HttpErrorResponse({ status, error: { detail } });

describe('AI governance display helpers', () => {
  it('maps classification reasons to translation keys', () => {
    expect(reasonText({ code: 'prohibited.social_scoring', ref: 'Art. 5(1)(c)' })).toEqual({
      key: 'aiGovernance.reasons.prohibited',
      params: { ref: 'Art. 5(1)(c)' },
      itemKey: 'aiGovernance.prohibited.social_scoring',
    });
    expect(reasonText({ code: 'high.employment', ref: 'Annex III(4)' }).itemKey).toBe(
      'aiGovernance.annexIii.employment',
    );
    expect(reasonText({ code: 'high.annex_i', ref: 'Art. 6(1)' }).key).toBe(
      'aiGovernance.reasons.high_annex_i',
    );
    expect(reasonText({ code: 'high.profiling', ref: 'Art. 6(3)' }).key).toBe(
      'aiGovernance.reasons.high_profiling',
    );
    expect(reasonText({ code: 'gpai.systemic', ref: 'Art. 51' }).key).toBe(
      'aiGovernance.reasons.gpai_systemic',
    );
    expect(reasonText({ code: 'minimal.none', ref: 'Art. 95' }).key).toBe(
      'aiGovernance.reasons.minimal',
    );
    expect(reasonText({ code: 'new.thing', ref: 'X' })).toEqual({
      key: 'aiGovernance.reasons.other',
      params: { ref: 'X', code: 'new.thing' },
      itemKey: null,
    });
  });

  it('normalises untrusted wizard answers', () => {
    const answers = normalizeAnswers(
      {
        role: 'provider',
        prohibited_practices: ['social_scoring', 'made_up', 7],
        annex_iii_areas: ['employment', 'employment'],
        gpai: false,
        gpai_systemic_risk: true,
        profiling: 'yes',
        extra: 1,
      },
      { prohibited_practices: ['social_scoring'] },
    );
    expect(answers.role).toBe('provider');
    expect(answers.prohibited_practices).toEqual(['social_scoring']);
    expect(answers.annex_iii_areas).toEqual(['employment']);
    expect(answers.gpai_systemic_risk).toBe(false);
    expect(answers.profiling).toBe(false);
    expect('extra' in answers).toBe(false);
    expect(normalizeAnswers(null)).toEqual(emptyAnswers());
  });

  it('toggles list values and parses tags', () => {
    expect(toggleIn(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(toggleIn(['a'], 'a', true)).toEqual(['a']);
    expect(parseTags(' LLM, classifier,\nLLM ,, ')).toEqual(['LLM', 'classifier']);
  });

  it('keeps only text section answers and maps values onto the shared tone map', () => {
    expect(sectionAnswers({ a: 'x', b: 2, c: null })).toEqual({ a: 'x' });
    expect(toneFor('severity', riskValue('prohibited'))).toBe('fail');
    expect(toneFor('severity', riskValue('high'))).toBe('fail');
    expect(toneFor('severity', riskValue('limited'))).toBe('warn');
    expect(toneFor('severity', riskValue('minimal'))).toBe('neutral');
    expect(toneFor('severity', riskValue('unclassified'))).toBe('neutral');
    expect(toneFor('lifecycle', systemStatusValue('in_use'))).toBe('accent');
    expect(toneFor('lifecycle', systemStatusValue('suspended'))).toBe('warn');
    expect(toneFor('lifecycle', assessmentStatusValue('completed'))).toBe('accent');
    expect(toneFor('lifecycle', assessmentStatusValue('approved'))).toBe('pass');
    expect(toneFor('compliance', monitoringValue('fail'))).toBe('fail');
    expect(toneFor('compliance', monitoringValue('info'))).toBe('neutral');
    expect(toneFor('compliance', obligationValue('met'))).toBe('pass');
    expect(toneFor('compliance', obligationValue('not_relevant'))).toBe('neutral');
    expect(toneFor('compliance', obligationValue(undefined))).toBe('neutral');
  });

  it('counts obligations without the not-relevant ones and picks count keys', () => {
    expect(
      obligationProgress({
        total: 6,
        not_started: 2,
        in_progress: 1,
        met: 2,
        not_relevant: 1,
        without_task: 3,
      }),
    ).toEqual({ met: 2, total: 5 });
    expect(obligationProgress(undefined)).toEqual({ met: 0, total: 0 });
    expect(countKey('a.b', 1)).toBe('a.bOne');
    expect(countKey('a.b', 3)).toBe('a.b');
  });

  it('splits deep links and names attention items', () => {
    expect(splitUrl('/ai-governance/systems?risk_class=high')).toEqual({
      path: '/ai-governance/systems',
      query: { risk_class: 'high' },
    });
    expect(splitUrl('/ai-governance/settings')).toEqual({
      path: '/ai-governance/settings',
      query: null,
    });
    expect(attentionTextKey({ key: 'fria_missing', count: 1, params: { name: 'X' } })).toBe(
      'aiGovernance.attention.fria_missing.named',
    );
    expect(attentionTextKey({ key: 'unclassified', count: 1 })).toBe(
      'aiGovernance.attention.unclassified.one',
    );
    expect(attentionTextKey({ key: 'unclassified', count: 4 })).toBe(
      'aiGovernance.attention.unclassified.many',
    );
  });
});

describe('AI governance errors', () => {
  it('maps coded errors, 403 and unknown codes', () => {
    expect(aiGovernanceErrorKey(httpError(409, { code: 'self_approval_not_allowed' }))).toBe(
      'aiGovernance.errors.self_approval_not_allowed',
    );
    expect(aiGovernanceErrorKey(httpError(403, { code: 'whatever' }))).toBe(
      'aiGovernance.errors.forbidden',
    );
    expect(aiGovernanceErrorKey(httpError(422, { code: 'brand_new' }))).toBe(
      'aiGovernance.errors.invalid',
    );
    expect(aiGovernanceErrorKey(httpError(500, null))).toBe('errors.server');
    expect(aiGovernanceErrorKey(new Error('x'))).toBe('errors.generic');
  });

  it('reads the missing sections of an incomplete assessment', () => {
    expect(
      missingSections(
        httpError(422, { code: 'assessment_incomplete', missing: ['mitigations', 3] }),
      ),
    ).toEqual(['mitigations']);
    expect(missingSections(httpError(409, { code: 'assessment_locked' }))).toEqual([]);
  });

  it('recognises a refused downgrade', () => {
    const err = httpError(409, { code: 'classification_downgrade', from: 'high', to: 'minimal' });
    expect(isDowngradeRefusal(err)).toBe(true);
    expect(aiGovernanceErrorKey(err)).toBe('aiGovernance.errors.classification_downgrade');
    expect(isDowngradeRefusal(httpError(409, { code: 'assessment_locked' }))).toBe(false);
  });
});

describe('AI governance page logic', () => {
  it('round-trips a system through the form', () => {
    const system = {
      name: 'Bot',
      description: null,
      intended_purpose: 'Answers questions',
      ai_act_role: 'deployer',
      status: 'in_use',
      provider_name: 'Vendor',
      models: ['m1', 'm2'],
      data_categories: [],
      uses_personal_data: true,
      owner: { id: 'u-1', name: 'Ada' },
      department_id: null,
      next_review_at: '2027-01-31T23:59:59',
      supplier_id: 'sup-1',
      supplier: { entity_type: 'supplier', entity_id: 'sup-1', title: 'Vendor AS' },
      processing_activity_id: 'ropa-1',
      processing_activity: { entity_type: 'ropa_entry', entity_id: 'ropa-1', title: 'HR' },
      overseers: [{ id: 'u-2', name: 'Bo', literacy_valid: false }],
      monitoring_metrics: [
        { key: 'acc', metric: 'Accuracy', kind: 'accuracy', threshold: 0.9, direction: 'min' },
      ],
    } as unknown as AiSystem;
    const form = systemToForm(system);
    expect(form.models).toBe('m1, m2');
    expect(form.next_review).toBe('2027-01-31');
    expect(form.supplier?.entity_id).toBe('sup-1');
    expect(form.overseer_user_ids).toEqual(['u-2']);
    expect(form.metrics[0].threshold).toBe('0.9');
    const body = formToRequest({
      ...form,
      description: '  ',
      metrics: [...form.metrics, { ...form.metrics[0], key: null, metric: ' ', threshold: '' }],
    });
    expect(body).toMatchObject({
      name: 'Bot',
      description: null,
      models: ['m1', 'm2'],
      owner_user_id: 'u-1',
      next_review_at: '2027-01-31T23:59:59',
      supplier_id: 'sup-1',
      processing_activity_id: 'ropa-1',
      overseer_user_ids: ['u-2'],
    });
    expect(body.monitoring_metrics).toEqual([
      {
        key: 'acc',
        metric: 'Accuracy',
        kind: 'accuracy',
        threshold: 0.9,
        direction: 'min',
        unit: null,
      },
    ]);
    // No personal data: no processing activity is sent.
    expect(formToRequest({ ...form, uses_personal_data: false }).processing_activity_id).toBeNull();
    expect(formToRequest(emptySystemForm()).next_review_at).toBeNull();
  });

  it('fills only empty sections from an assistant draft', () => {
    const { sections, filled } = mergeDraft(
      { intended_use: 'Mine' },
      { sections: { intended_use: 'Theirs', mitigations: ' Oversight ', unknown: 'x' } },
      ['intended_use', 'mitigations'],
    );
    expect(sections).toEqual({ intended_use: 'Mine', mitigations: 'Oversight' });
    expect(filled).toBe(1);
    expect(mergeDraft({}, null, ['a']).filled).toBe(0);
  });

  it('accepts only well-formed stored classification results', () => {
    expect(asClassificationResult(null)).toBeNull();
    expect(asClassificationResult({ risk_class: 'high' })).toBeNull();
    const result = asClassificationResult({
      risk_class: 'limited',
      obligations: [
        { key: 'inform_interaction', ref: 'eu_ai_act:50', article: 'Art. 50(1)', title: 'Tell' },
        null,
      ],
    });
    expect(result?.obligations.length).toBe(1);
    expect(result?.reasons).toEqual([]);
  });

  it('flags overdue drafts only', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    const base = { status: 'draft', due_at: '2026-11-10T23:59:59' } as AssessmentSummary;
    expect(isOverdue(base, now)).toBe(true);
    expect(isOverdue({ ...base, status: 'completed' }, now)).toBe(false);
    expect(isOverdue({ ...base, due_at: null }, now)).toBe(false);
    const done = { status: 'approved', next_review_at: '2026-11-01T00:00:00' } as AssessmentSummary;
    expect(isReviewOverdue(done, now)).toBe(true);
    expect(isReviewOverdue({ ...done, status: 'draft' }, now)).toBe(false);
  });

  it('treats a draft with stored answers as prefilled and searches people', () => {
    expect(hasAnswers({ role: 'deployer' })).toBe(true);
    expect(hasAnswers({})).toBe(false);
    expect(hasAnswers(null)).toBe(false);
    const people = [
      { id: '1', name: 'Kari Nordmann', department: 'HR' },
      { id: '2', name: 'Lars Olsen', department: null },
    ];
    expect(filterPeople(people, 'hr').map((p) => p.id)).toEqual(['1']);
    expect(filterPeople(people, ' lars ').map((p) => p.id)).toEqual(['2']);
    expect(filterPeople(people, '').length).toBe(2);
  });

  it('lists only overview items that need attention', () => {
    const overview: AiGovernanceOverview = {
      systems_total: 4,
      by_risk_class: { high: 1 },
      by_status: {},
      unclassified: 2,
      high_risk: 1,
      assessments_open: 1,
      assessments_overdue: 0,
      reviews_overdue: 1,
      monitoring_failures_30d: 0,
      literacy_coverage: 50,
      has_policy: false,
    };
    // Older payloads without attention: derived from the counts.
    expect(attentionItems(overview).map((i) => i.key)).toEqual(['unclassified', 'no_policy']);
    // The server's ranked list, with deep links and the system named when there is one.
    const items = attentionItems({
      ...overview,
      attention: [
        {
          key: 'fria_missing',
          count: 1,
          severity: 'high',
          url: '/ai-governance/systems/s-4',
          params: { code: 'AIS-004', name: 'Ranking' },
        },
        {
          key: 'awaiting_approval',
          count: 4,
          severity: 'medium',
          url: '/ai-governance/assessments?status=completed',
        },
        { key: 'draft_assessments', count: 0, severity: 'low', url: '/x' },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(['fria_missing', 'awaiting_approval']);
    expect(items[0]).toMatchObject({
      textKey: 'aiGovernance.attention.fria_missing.named',
      path: '/ai-governance/systems/s-4',
      query: null,
      params: { code: 'AIS-004', name: 'Ranking', count: 1 },
    });
    expect(items[1]).toMatchObject({
      textKey: 'aiGovernance.attention.awaiting_approval.many',
      path: '/ai-governance/assessments',
      query: { status: 'completed' },
    });
  });

  it('clamps months and parses numbers', () => {
    expect(clampMonths('200', 1, 120, 24)).toBe(120);
    expect(clampMonths('0', 1, 120, 24)).toBe(1);
    expect(clampMonths('abc', 1, 120, 24)).toBe(24);
    expect(parseNumber(' 0,95 ')).toBe(0.95);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('x')).toBeNull();
  });
});
