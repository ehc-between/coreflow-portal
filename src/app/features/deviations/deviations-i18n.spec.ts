import guideEn from '../../../assets/guidance/en/deviations.json';
import guideNb from '../../../assets/guidance/nb/deviations.json';
import globalEn from '../../../assets/i18n/en.json';
import en from '../../../assets/i18n/deviations/en.json';
import nb from '../../../assets/i18n/deviations/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { M03_ERROR_CODES } from '../../core/deviations/deviation-errors';
import {
  FISHBONE_CATEGORIES,
  ROOT_CAUSE_ANALYSIS_METHODS,
} from '../../core/deviations/deviation.models';
import { INTAKE_MODES, INTAKE_STATUSES } from '../../core/deviations/intake.models';
import { STATUS_CATEGORIES } from './deviation-status';

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

function leafPaths(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Tree).flatMap(([k, v]) =>
      leafPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

/** Event names the backend registers (`deviations:notifications.<name>` / `deviations:timeline.<name>`). */
const EVENT_NAMES = [
  'created',
  'updated',
  'statusChanged',
  'ownerChanged',
  'rootCauseRecorded',
  'deleted',
  'actionCreated',
  'actionStatusChanged',
  'intakeReceived',
  'intakeConverted',
  'intakeDismissed',
];

const GUIDED_PAGES = [
  'list',
  'new',
  'detail',
  'types',
  'templates',
  'intakeSettings',
  'intakeInbox',
  'intakeReport',
];

const LESSONS = [
  'deviations-basics',
  'root-cause-analysis',
  'good-deviation-report',
  'designing-your-process',
  'speaking-up',
];

describe('deviations i18n and guidance', () => {
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

  it('never overrides a global deviations.* translation from the scope', () => {
    const global = (globalEn as Tree)['deviations'];
    const clashes = leafPaths(en).filter((path) => lookup(global, path) !== undefined);
    expect(clashes).toEqual([]);
  });

  it.each([
    ['apiErrors', M03_ERROR_CODES],
    ['category', STATUS_CATEGORIES],
    ['rootCauses.methods', ROOT_CAUSE_ANALYSIS_METHODS],
    ['rootCauses.categories', FISHBONE_CATEGORIES],
    ['intake.modes', INTAKE_MODES],
    ['intake.modeHelp', INTAKE_MODES],
    ['intake.status', INTAKE_STATUSES],
    ['publicReport.title', INTAKE_MODES],
    ['publicReport.intro', INTAKE_MODES],
    ['publicReport.privacy', INTAKE_MODES],
    ['publicReport.status.states', INTAKE_STATUSES],
    ['standards', ['iso42001', 'eu_ai_act', 'nis2']],
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

  it('has the lessons the pages open, with valid quizzes', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const key of LESSONS) {
        const lesson = lookup(guide, `lessons.${key}`) as {
          sections: unknown[];
          quiz?: { options: unknown[]; answer: number }[];
        };
        expect(lesson, key).toBeTruthy();
        expect(lesson.sections.length).toBeGreaterThan(0);
        for (const q of lesson.quiz ?? []) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
    }
  });

  it('has tours for the list, the form and the detail page', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const tour of ['list', 'new', 'detail']) {
        expect((lookup(guide, `tours.${tour}`) as unknown[]).length, tour).toBeGreaterThan(0);
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
