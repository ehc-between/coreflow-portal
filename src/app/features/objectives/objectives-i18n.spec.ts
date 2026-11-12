import guideEn from '../../../assets/guidance/en/objectives.json';
import guideNb from '../../../assets/guidance/nb/objectives.json';
import en from '../../../assets/i18n/objectives/en.json';
import nb from '../../../assets/i18n/objectives/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { KNOWN_FRAMEWORKS } from '../../core/guidance/clause-ref';
import { GuidanceFile } from '../../core/guidance/guidance.models';
import { OBJECTIVES_ERROR_CODES } from './data/objectives-errors';
import {
  KPI_DIRECTIONS,
  KPI_FREQUENCIES,
  KPI_HEALTH_FILTERS,
  KPI_SORTS,
  KPI_STATUSES,
  MANAGEMENT_SYSTEMS,
  OBJECTIVE_SORTS,
  OBJECTIVE_STATUSES,
  TRENDS,
} from './data/objectives.models';
import { KPI_STATUS_FILTERS } from './kpis-list';
import { OBJECTIVE_STATUS_FILTERS } from './objectives-list';

type Tree = Record<string, unknown>;

function lookup(tree: Tree, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value as Tree).flatMap(strings);
  return [];
}

/** Event kinds the backend registers (title keys `objectives:notifications.<name>`, timeline `objectives:timeline.<name>`). */
const EVENT_NAMES = [
  'objectiveCreated',
  'objectiveUpdated',
  'objectiveOwnerChanged',
  'objectiveStatusChanged',
  'objectiveDeleted',
  'kpiCreated',
  'kpiUpdated',
  'kpiOwnerChanged',
  'kpiMeasured',
  'kpiMeasurementCorrected',
  'kpiMeasurementDeleted',
  'kpiThresholdBreached',
  'kpiBackOnTrack',
  'kpiDeleted',
];

describe('objectives i18n and guidance', () => {
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
    ['objectiveStatus', OBJECTIVE_STATUSES],
    ['kpiStatus', KPI_STATUSES],
    ['health', KPI_HEALTH_FILTERS],
    ['trend', TRENDS],
    ['direction', KPI_DIRECTIONS],
    ['frequency', KPI_FREQUENCIES],
    ['managementSystems', MANAGEMENT_SYSTEMS],
    ['errors', OBJECTIVES_ERROR_CODES],
    ['filters.statusOptions', OBJECTIVE_STATUS_FILTERS],
    ['filters.kpiStatusOptions', KPI_STATUS_FILTERS],
    ['filters.objectiveSorts', OBJECTIVE_SORTS],
    ['filters.kpiSorts', KPI_SORTS],
    ['notifications', EVENT_NAMES],
    ['timeline', EVENT_NAMES],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb] as Tree[]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with known clauses', () => {
    for (const guide of [guideEn, guideNb] as GuidanceFile[]) {
      for (const page of ['list', 'kpis', 'detail', 'kpiDetail', 'form', 'kpiForm']) {
        const p = guide.pages?.[page];
        expect(p?.intro?.title, page).toBeTruthy();
        expect(p?.why?.clauses?.length, page).toBeGreaterThan(0);
        for (const ref of p?.why?.clauses ?? []) {
          expect(KNOWN_FRAMEWORKS.has(ref.split(':')[0]), ref).toBe(true);
        }
      }
      expect(guide.pages?.['list']?.empty?.cta).toBeTruthy();
      expect(guide.pages?.['kpis']?.empty?.cta).toBeTruthy();
      expect(guide.tours?.['list']?.length).toBeGreaterThan(0);
      expect(guide.tours?.['kpis']?.length).toBeGreaterThan(0);
    }
  });

  it('ships valid lessons with the same answers in both languages', () => {
    const answers = (f: GuidanceFile) =>
      Object.values(f.lessons ?? {}).flatMap((l) => (l.quiz ?? []).map((q) => q.answer));
    for (const guide of [guideEn, guideNb] as GuidanceFile[]) {
      expect(Object.keys(guide.lessons ?? {})).toEqual(['smart-objectives', 'good-kpis']);
      for (const lesson of Object.values(guide.lessons ?? {})) {
        expect(lesson.sections.length).toBeGreaterThan(0);
        for (const q of lesson.quiz ?? []) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
    }
    expect(answers(guideEn as GuidanceFile)).toEqual(answers(guideNb as GuidanceFile));
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|chatgpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});
