import guideEn from '../../../assets/guidance/en/environment.json';
import guideNb from '../../../assets/guidance/nb/environment.json';
import en from '../../../assets/i18n/environment/en.json';
import nb from '../../../assets/i18n/environment/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { SIGNIFICANCE_FILTERS, STATUS_FILTERS } from './aspects-list';
import { ENVIRONMENT_ERROR_CODES } from './data/environment-errors';
import {
  ASPECT_SORTS,
  CONDITIONS,
  CONTROL_LEVELS,
  DRILL_KINDS,
  DRILL_OUTCOMES,
  GHG_SCOPES,
  IMPACT_TYPES,
  LIFECYCLE_STAGES,
  METRIC_CATEGORIES,
  METRIC_SORTS,
  PLAN_SORTS,
  RECORD_STATUSES,
  SCORING_METHODS,
  SIGNIFICANCE_REASONS,
  TREND_BUCKETS,
} from './data/environment.models';
import { sortKey } from './data/environment-display';
import { METRIC_STATUS_FILTERS } from './metrics-list';

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

/** Event keys the backend emits (environment:notifications.<key> / environment:timeline.<key>). */
const EVENT_KEYS = [
  'aspectOwnerAssigned',
  'aspectSignificanceChanged',
  'planOwnerAssigned',
  'drillRecorded',
  'metricOwnerAssigned',
  'aspectCreated',
  'aspectUpdated',
  'aspectReviewed',
  'aspectDeleted',
  'planCreated',
  'planUpdated',
  'planReviewed',
  'planDeleted',
  'drillDeleted',
  'metricCreated',
  'metricUpdated',
  'metricDeleted',
  'measurementRecorded',
  'measurementUpdated',
  'measurementDeleted',
];

/** Clauses the backend module declares (F7). */
const DECLARED = new Set([
  'iso14001:6.1.2',
  'iso14001:6.1.4',
  'iso14001:8.1',
  'iso14001:8.2',
  'iso45001:8.2',
  'iso14001:9.1.1',
]);

describe('environment i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['status', RECORD_STATUSES],
    ['impactTypes', IMPACT_TYPES],
    ['conditions', CONDITIONS],
    ['stages', LIFECYCLE_STAGES],
    ['controlLevels', CONTROL_LEVELS],
    ['drillKinds', DRILL_KINDS],
    ['outcomes', DRILL_OUTCOMES],
    ['categories', METRIC_CATEGORIES],
    ['scopes', GHG_SCOPES],
    ['scopeHelp', GHG_SCOPES],
    ['buckets', TREND_BUCKETS],
    ['reasons', SIGNIFICANCE_REASONS],
    ['scoring.methods', SCORING_METHODS],
    ['aspect.methodSummary', SCORING_METHODS],
    ['filters.statusOptions', [...STATUS_FILTERS, ...METRIC_STATUS_FILTERS]],
    ['filters.significanceOptions', SIGNIFICANCE_FILTERS.map((s) => s || 'any')],
    ['overrides', ['none', 'significant', 'not_significant']],
    ['sorts', [...ASPECT_SORTS, ...PLAN_SORTS, ...METRIC_SORTS].map(sortKey)],
    ['tabs', ['overview', 'aspects', 'plans', 'metrics', 'emissions', 'scoring']],
    ['errors', ENVIRONMENT_ERROR_CODES],
    ['notifications', EVENT_KEYS],
    ['timeline', EVENT_KEYS],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    const pages = [
      'overview',
      'aspects',
      'aspectForm',
      'aspectDetail',
      'plans',
      'planForm',
      'planDetail',
      'metrics',
      'metricForm',
      'metricDetail',
      'emissions',
      'scoring',
    ];
    for (const guide of [guideEn, guideNb]) {
      for (const page of pages) {
        const p = (guide.pages as Tree)[page] as Tree;
        expect(p?.['intro'], page).toBeTruthy();
        expect(((p['why'] as Tree)['clauses'] as string[]).length, page).toBeGreaterThan(0);
      }
      for (const page of ['aspects', 'plans', 'metrics', 'emissions']) {
        expect(((guide.pages as Tree)[page] as Tree)['empty'], page).toBeTruthy();
      }
      expect(Object.keys(guide.lessons).length).toBeGreaterThanOrEqual(4);
      for (const lesson of Object.values(guide.lessons)) {
        expect(lesson.quiz.length).toBeGreaterThan(0);
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      for (const tour of ['aspects', 'plans', 'metrics']) {
        expect((guide.tours as Tree)[tour], tour).toBeTruthy();
      }
    }
  });

  it('only references clauses the module declares', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of Object.values(guide.pages as Tree)) {
        const why = (page as Tree)['why'] as Tree | undefined;
        for (const ref of (why?.['clauses'] as string[] | undefined) ?? []) {
          expect(DECLARED.has(ref), ref).toBe(true);
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
