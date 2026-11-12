import guideEn from '../../../assets/guidance/en/projects.json';
import guideNb from '../../../assets/guidance/nb/projects.json';
import en from '../../../assets/i18n/projects/en.json';
import nb from '../../../assets/i18n/projects/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { PROJECT_ERROR_CODES } from './data/project-errors';
import {
  CLOSE_OUTCOMES,
  LESSON_CATEGORIES,
  MEMBER_ROLES,
  MILESTONE_KINDS,
  MILESTONE_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_KINDS,
  PROJECT_PRIORITIES,
  PROJECT_SORTS,
  PROJECT_STATUSES,
  REVIEW_KINDS,
  REVIEW_OUTCOMES,
  RISK_LEVELS,
} from './data/project.models';
import { BOARD_COLUMNS, PROJECT_FIELD_LABELS } from './data/project-display';
import { PLAN_VIEWS } from './project-detail';
import { LIST_VIEWS, PEOPLE_FILTERS } from './projects-list';

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

/** Event kinds the backend emits (projects:notifications.<key> / projects:timeline.<key>). */
const EVENT_NAMES = [
  'created',
  'updated',
  'statusChanged',
  'ownerChanged',
  'memberAdded',
  'memberRemoved',
  'milestoneAdded',
  'lessonAdded',
  'closed',
  'reopened',
  'deleted',
  'milestoneCreated',
  'milestoneUpdated',
  'milestoneCompleted',
  'milestoneReopened',
  'milestoneDeleted',
  'designReviewCreated',
  'designReviewUpdated',
  'designReviewDecided',
  'designReviewDeleted',
];

/** Clauses the backend declares for the projects module. */
const DECLARED_CLAUSES = new Set(['iso9001:6.3', 'iso9001:8.3', 'iso27001:A.5.8', 'hs:8.1']);

/** Lessons referenced from the pages. */
const LESSONS = ['project-basics', 'design-control', 'security-in-projects', 'closing-a-project'];

describe('projects i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['status', PROJECT_STATUSES],
    ['kinds', PROJECT_KINDS],
    ['priorities', PROJECT_PRIORITIES],
    ['healths', PROJECT_HEALTHS],
    ['roles', MEMBER_ROLES],
    ['milestoneStatus', MILESTONE_STATUSES],
    ['milestones.new', MILESTONE_KINDS],
    ['milestones.edit', MILESTONE_KINDS],
    ['plan.kinds', [...MILESTONE_KINDS, 'task', 'project']],
    ['plan.views', PLAN_VIEWS],
    ['list.views', LIST_VIEWS],
    ['reviewKinds', REVIEW_KINDS],
    ['outcomes', REVIEW_OUTCOMES],
    ['lessonCategories', LESSON_CATEGORIES],
    ['riskLevels', RISK_LEVELS],
    ['board.columns', BOARD_COLUMNS],
    ['closeout.outcomes', CLOSE_OUTCOMES],
    ['closeout.outcomeHints', CLOSE_OUTCOMES],
    ['closeout.submit', CLOSE_OUTCOMES],
    ['notices.closed', CLOSE_OUTCOMES],
    ['filters.peopleOptions', PEOPLE_FILTERS.map((p) => p || 'anyone')],
    ['filters.statusOptions', ['open', 'all']],
    ['errors', PROJECT_ERROR_CODES],
    ['notifications', EVENT_NAMES],
    ['timeline', EVENT_NAMES],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('translates every sort option and revision field label', () => {
    for (const lang of [en, nb]) {
      for (const s of PROJECT_SORTS) {
        const key = s.startsWith('-') ? `${s.slice(1)}Desc` : s;
        expect(typeof lookup(lang, `sorts.${key}`), key).toBe('string');
      }
      for (const key of Object.values(PROJECT_FIELD_LABELS)) {
        expect(typeof lookup(lang, key.replace(/^projects\./, '')), key).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of ['list', 'form', 'detail', 'closeout']) {
        const p = (guide.pages as Tree)[page] as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect(((p['why'] as Tree)['clauses'] as string[]).length, page).toBeGreaterThan(0);
      }
      expect((guide.pages.list as Tree)['empty']).toBeTruthy();
      for (const key of LESSONS) {
        const lesson = (
          guide.lessons as Record<string, { quiz: { answer: number; options: string[] }[] }>
        )[key];
        expect(lesson, key).toBeTruthy();
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(guide.tours.list.map((s) => s.target)).toEqual([
        'projects-new',
        'projects-filters',
        'projects-views',
      ]);
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
