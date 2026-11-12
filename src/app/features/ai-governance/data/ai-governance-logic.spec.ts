import { HttpErrorResponse } from '@angular/common/http';
import { asClassificationResult } from '../assessments/assessment-detail';
import { mergeDraft } from '../assessments/assessment-edit';
import { isOverdue } from '../assessments/assessments-list';
import { attentionItems } from '../overview/ai-governance-overview';
import { clampMonths } from '../settings/ai-governance-settings';
import { emptySystemForm, formToRequest, systemToForm } from '../systems/system-form';
import { parseNumber } from '../systems/system-monitoring';
import { aiGovernanceErrorKey, missingSections } from './ai-governance-errors';
import {
  emptyAnswers,
  normalizeAnswers,
  parseTags,
  reasonText,
  riskTone,
  sectionAnswers,
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

  it('keeps only text section answers and picks risk tones', () => {
    expect(sectionAnswers({ a: 'x', b: 2, c: null })).toEqual({ a: 'x' });
    expect(riskTone('prohibited')).toBe('fail');
    expect(riskTone('high')).toBe('warn');
    expect(riskTone('minimal')).toBe('pass');
    expect(riskTone('unclassified')).toBe('neutral');
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
    } as unknown as AiSystem;
    const form = systemToForm(system);
    expect(form.models).toBe('m1, m2');
    expect(form.next_review).toBe('2027-01-31');
    const body = formToRequest({ ...form, description: '  ' });
    expect(body).toMatchObject({
      name: 'Bot',
      description: null,
      models: ['m1', 'm2'],
      owner_user_id: 'u-1',
      next_review_at: '2027-01-31T23:59:59',
    });
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
    expect(attentionItems(overview).map((i) => i.key)).toEqual([
      'unclassified',
      'reviewsOverdue',
      'noPolicy',
    ]);
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
