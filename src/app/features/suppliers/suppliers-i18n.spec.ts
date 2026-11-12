import guideEn from '../../../assets/guidance/en/suppliers.json';
import guideNb from '../../../assets/guidance/nb/suppliers.json';
import en from '../../../assets/i18n/suppliers/en.json';
import nb from '../../../assets/i18n/suppliers/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { SUPPLIER_ERROR_CODES } from './data/supplier-errors';
import {
  CRITICALITIES,
  DECISIONS,
  EVALUATION_DUE_FILTERS,
  EVALUATION_KINDS,
  EVALUATION_STATUSES,
  PERFORMANCE_KINDS,
  QUESTION_TYPES,
  RECOMMENDATIONS,
  SUPPLIER_CATEGORIES,
  SUPPLIER_FLAGS,
  SUPPLIER_SORTS,
  SUPPLIER_STATUSES,
} from './data/supplier.models';
import { SUPPLIER_FIELD_LABELS } from './supplier-detail';
import { EVALUATION_FIELD_LABELS } from './evaluations/evaluation-detail';

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

/** The backend's event kinds (app/modules/suppliers/events.py) by scoped key name. */
const EVENT_NAMES = [
  'created',
  'updated',
  'ownerChanged',
  'statusChanged',
  'deleted',
  'performanceLogged',
  'evaluationCreated',
  'evaluationAssigned',
  'evaluationSubmitted',
  'evaluationReopened',
  'evaluationDecided',
  'evaluationCancelled',
];

describe('suppliers i18n and guidance', () => {
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
    ['category', SUPPLIER_CATEGORIES],
    ['criticality', CRITICALITIES],
    ['status', SUPPLIER_STATUSES],
    ['statusHelp', SUPPLIER_STATUSES],
    ['flags', SUPPLIER_FLAGS],
    ['flagsShort', SUPPLIER_FLAGS],
    ['filters.sorts', SUPPLIER_SORTS],
    ['filters.due', EVALUATION_DUE_FILTERS],
    ['evaluationKind', EVALUATION_KINDS],
    ['evaluationStatus', EVALUATION_STATUSES],
    ['decision', DECISIONS],
    ['recommendation', RECOMMENDATIONS],
    ['questionType', QUESTION_TYPES],
    ['performanceKind', PERFORMANCE_KINDS],
    ['errors', SUPPLIER_ERROR_CODES],
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

  it('labels every revision field with an existing key', () => {
    for (const key of [
      ...Object.values(SUPPLIER_FIELD_LABELS),
      ...Object.values(EVALUATION_FIELD_LABELS),
    ]) {
      expect(typeof lookup(en, key.replace(/^suppliers\./, '')), key).toBe('string');
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    const pages = [
      'list',
      'form',
      'detail',
      'evaluations',
      'evaluation',
      'questionnaires',
      'questionnaire',
      'performance',
    ];
    for (const guide of [guideEn, guideNb]) {
      for (const page of pages) {
        const p = lookup(guide, `pages.${page}`) as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect((lookup(p, 'why.clauses') as string[]).length, page).toBeGreaterThan(0);
      }
      expect(lookup(guide, 'pages.list.empty.cta')).toBeTruthy();
      expect(lookup(guide, 'pages.evaluations.empty.cta')).toBeTruthy();
      for (const lesson of Object.values(guide.lessons)) {
        expect(lesson.sections.length).toBeGreaterThan(0);
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(guide.tours.list.length).toBeGreaterThan(0);
    }
  });

  it('has field help for the fields the pages reference', () => {
    const fields: Record<string, string[]> = {
      form: [
        'category',
        'criticality',
        'owner',
        ...SUPPLIER_FLAGS,
        'data_locations',
        'certifications',
        'evaluation_interval_months',
      ],
      evaluation: ['kind', 'score', 'decision', 'summary'],
      questionnaire: ['pass_score'],
      performance: ['rating'],
    };
    for (const guide of [guideEn, guideNb]) {
      for (const [page, names] of Object.entries(fields)) {
        for (const name of names) {
          expect(
            lookup(guide, `pages.${page}.fields.${name}.help`),
            `${page}.${name}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral|copilot)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});
