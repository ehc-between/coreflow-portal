import guideEn from '../../../assets/guidance/en/risk.json';
import guideNb from '../../../assets/guidance/nb/risk.json';
import en from '../../../assets/i18n/risk/en.json';
import nb from '../../../assets/i18n/risk/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { RISK_ERROR_CODES } from './data/risk-errors';
import { TEMPLATE_BAND_KEYS, TEMPLATE_LEVEL_KEYS } from './data/risk-display';
import {
  CIA_PROPERTIES,
  HEATMAP_BASES,
  IMPLEMENTATION_STATUSES,
  INCLUSION_REASONS,
  MATRIX_TEMPLATES,
  OPPORTUNITY_SORTS,
  OPPORTUNITY_STATUSES,
  RISK_CATEGORIES,
  RISK_SORTS,
  RISK_STATUSES,
  SOURCE_TYPES,
  STRATEGIES,
  TREATMENT_STATUSES,
} from './data/risk.models';
import { OPPORTUNITY_STATUS_FILTERS } from './opportunities/opportunity-list';
import { RISK_STATUS_FILTERS } from './risks/risk-list';

type Tree = Record<string, unknown>;

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Tree).flatMap(strings);
  }
  return [];
}

/** Event names the backend registers (`risk:notifications.<name>` / `risk:timeline.<name>`). */
const EVENT_NAMES = [
  'riskCreated',
  'riskUpdated',
  'riskAssessed',
  'riskOwnerChanged',
  'riskStatusChanged',
  'riskAccepted',
  'riskAcceptanceRevoked',
  'riskReviewed',
  'riskDeleted',
  'treatmentAdded',
  'treatmentCompleted',
  'treatmentCancelled',
  'opportunityCreated',
  'opportunityUpdated',
  'opportunityOwnerChanged',
  'opportunityStatusChanged',
  'soaEntryUpdated',
];

const GUIDED_PAGES = [
  'overview',
  'risks',
  'form',
  'detail',
  'opportunities',
  'opportunityForm',
  'opportunityDetail',
  'soa',
  'soaView',
  'registers',
  'matrices',
  'matrixEditor',
];

describe('risk i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => {
    expectKeyParity(en, nb);
  });

  it('keeps the guidance files at full en/nb parity', () => {
    expectKeyParity(guideEn, guideNb);
  });

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['categories', RISK_CATEGORIES],
    ['sourceTypes', SOURCE_TYPES],
    ['properties', CIA_PROPERTIES],
    ['strategies', STRATEGIES],
    ['status', RISK_STATUSES],
    ['filters.statusOptions', RISK_STATUS_FILTERS],
    ['filters.sorts', RISK_SORTS],
    ['filters.sorts', OPPORTUNITY_SORTS],
    ['treatments.status', TREATMENT_STATUSES],
    ['treatments.taskStatus', ['open', 'in_progress', 'blocked', 'done', 'cancelled']],
    ['opportunities.status', OPPORTUNITY_STATUSES],
    ['opportunities.statusFilters', OPPORTUNITY_STATUS_FILTERS],
    ['opportunities.scale', ['1', '2', '3', '4', '5']],
    ['soa.implementation', IMPLEMENTATION_STATUSES],
    ['soa.reasons', INCLUSION_REASONS],
    ['soa.applicableFilters', ['all', 'yes', 'no', 'missing']],
    ['heatmap.bases', HEATMAP_BASES],
    ['matrices.templates', MATRIX_TEMPLATES],
    ['matrix.bands', TEMPLATE_BAND_KEYS],
    ['matrix.levels', TEMPLATE_LEVEL_KEYS],
    ['errors', RISK_ERROR_CODES],
    ['nav', ['overview', 'risks', 'opportunities', 'soa', 'registers', 'matrices']],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('defines the scoped event texts the backend emits', () => {
    for (const lang of [en, nb]) {
      for (const name of EVENT_NAMES) {
        expect(typeof lookup(lang, `notifications.${name}`), name).toBe('string');
        expect(typeof lookup(lang, `timeline.${name}`), name).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of GUIDED_PAGES) {
        const p = lookup(guide, `pages.${page}`) as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect((lookup(p, 'why.clauses') as string[]).length, page).toBeGreaterThan(0);
      }
    }
  });

  it('has lessons with valid quizzes and a first-risk-assessment lesson', () => {
    for (const guide of [guideEn, guideNb]) {
      expect(guide.lessons['first-risk-assessment']).toBeTruthy();
      for (const lesson of Object.values(guide.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});
