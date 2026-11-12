import guideEn from '../../../assets/guidance/en/obligations.json';
import guideNb from '../../../assets/guidance/nb/obligations.json';
import en from '../../../assets/i18n/obligations/en.json';
import nb from '../../../assets/i18n/obligations/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { OBLIGATION_ERROR_CODES } from './data/obligation-errors';
import {
  CHANGE_STATUSES,
  COMPLIANCE_STATUSES,
  EVALUATION_RESULTS,
  FRAMEWORKS,
  IMPACTS,
  OBLIGATION_SORTS,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
} from './data/obligation.models';
import { sortKey } from './obligations-list';

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

/** Event keys the backend emits (obligations:notifications.<key> / obligations:timeline.<key>). */
const EVENT_KEYS = [
  'created',
  'updated',
  'ownerChanged',
  'statusChanged',
  'scheduleChanged',
  'evaluated',
  'nonCompliant',
  'evaluationRemoved',
  'actionAdded',
  'changeNoted',
  'changeUpdated',
  'changeRemoved',
  'deleted',
];

/** Clauses the backend module declares (F7), plus the shared structure. */
const DECLARED_CLAUSES = new Set([
  'hs:4.2',
  'iso14001:6.1.3',
  'iso14001:9.1.2',
  'iso45001:6.1.3',
  'iso45001:9.1.2',
  'iso27001:A.5.31',
  'gdpr:24',
  'eu_ai_act:26',
]);

describe('obligations i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['status', OBLIGATION_STATUSES],
    ['types', OBLIGATION_TYPES],
    ['compliance', COMPLIANCE_STATUSES],
    ['compliance', EVALUATION_RESULTS],
    ['impacts', IMPACTS],
    ['changeStatus', CHANGE_STATUSES],
    ['frameworks', FRAMEWORKS],
    ['errors', OBLIGATION_ERROR_CODES],
    ['notifications', EVENT_KEYS],
    ['timeline', EVENT_KEYS],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('translates every status filter and sort option', () => {
    for (const lang of [en, nb]) {
      for (const f of ['current', 'all']) {
        expect(typeof lookup(lang, `filters.statusOptions.${f}`)).toBe('string');
      }
      for (const s of OBLIGATION_SORTS) {
        expect(typeof lookup(lang, `sorts.${sortKey(s)}`), s).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of ['list', 'form', 'detail']) {
        const p = (guide.pages as Tree)[page] as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect(((p['why'] as Tree)['clauses'] as string[]).length, page).toBeGreaterThan(0);
      }
      expect(guide.pages.list.empty.cta).toBeTruthy();
      expect(Object.keys(guide.lessons).length).toBeGreaterThanOrEqual(1);
      for (const lesson of Object.values(guide.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(guide.tours.list.length).toBeGreaterThan(0);
    }
  });

  it('only references clauses the module declares', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of Object.values(guide.pages as Tree)) {
        const why = (page as Tree)['why'] as Tree | undefined;
        for (const ref of (why?.['clauses'] as string[] | undefined) ?? []) {
          expect(DECLARED_CLAUSES.has(ref), ref).toBe(true);
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
