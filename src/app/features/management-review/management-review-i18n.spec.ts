import guideEn from '../../../assets/guidance/en/management-review.json';
import guideNb from '../../../assets/guidance/nb/management-review.json';
import en from '../../../assets/i18n/management-review/en.json';
import nb from '../../../assets/i18n/management-review/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { KNOWN_FRAMEWORKS } from '../../core/guidance/clause-ref';
import { GuidanceFile } from '../../core/guidance/guidance.models';
import { STANDARD_AGENDA } from './review-editor';
import { MR_ERROR_CODES } from './data/management-review-errors';
import {
  ASSESSMENTS,
  ATTENDANCES,
  ATTENDEE_ROLES,
  DECISION_CATEGORIES,
  FRAMEWORKS,
  INPUT_CATEGORIES,
  INPUT_METRICS,
  MEETING_KINDS,
  MEETING_SORTS,
  MEETING_STATUSES,
  MINUTES_STATUSES,
  REVIEW_ACTIONS,
  REVIEW_SORTS,
  REVIEW_STATUSES,
  SUBMIT_REQUIREMENTS,
} from './data/management-review.models';
import { BREAKDOWN_VALUES } from './management-review-display';
import { REVIEW_STATUS_FILTERS } from './reviews-list';

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

/** Event kinds the backend registers (title keys `management-review:notifications.<name>`). */
const EVENT_NAMES = [
  'reviewCreated',
  'reviewUpdated',
  'inputsCompiled',
  'reviewStarted',
  'reviewSubmitted',
  'reviewReturned',
  'reviewSigned',
  'reviewCancelled',
  'reviewDeleted',
  'meetingCreated',
  'meetingUpdated',
  'meetingInvited',
  'meetingRescheduled',
  'meetingStatusChanged',
  'meetingCompleted',
  'meetingCancelled',
  'minutesApproved',
  'minutesReopened',
  'decisionRecorded',
  'meetingDeleted',
];

describe('management review i18n and guidance', () => {
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
    ['reviewStatus', REVIEW_STATUSES],
    ['meetingStatus', MEETING_STATUSES],
    ['minutesStatus', MINUTES_STATUSES],
    ['meetingKind', MEETING_KINDS],
    ['frameworks', FRAMEWORKS],
    ['assessment', ASSESSMENTS],
    ['attendeeRole', ATTENDEE_ROLES],
    ['attendance', ATTENDANCES],
    ['decisionCategory', DECISION_CATEGORIES],
    ['reviewActions', REVIEW_ACTIONS],
    ['missing', SUBMIT_REQUIREMENTS],
    ['metrics', INPUT_METRICS],
    ['values', BREAKDOWN_VALUES],
    ['errors', MR_ERROR_CODES],
    ['standardAgenda', STANDARD_AGENDA],
    ['filters.statusOptions', REVIEW_STATUS_FILTERS],
    ['filters.reviewSorts', REVIEW_SORTS],
    ['filters.meetingSorts', MEETING_SORTS],
    ['notifications', EVENT_NAMES],
    ['timeline', EVENT_NAMES],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb] as Tree[]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('names and explains every input category', () => {
    for (const lang of [en, nb] as Tree[]) {
      for (const c of INPUT_CATEGORIES) {
        expect(typeof lookup(lang, `inputCategories.${c}.title`), c).toBe('string');
        expect(typeof lookup(lang, `inputCategories.${c}.hint`), c).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with known clauses', () => {
    for (const guide of [guideEn, guideNb] as GuidanceFile[]) {
      for (const page of [
        'list',
        'meetings',
        'detail',
        'meetingDetail',
        'form',
        'meetingForm',
        'report',
      ]) {
        const p = guide.pages?.[page];
        expect(p?.intro?.title, page).toBeTruthy();
        expect(p?.why?.clauses?.length, page).toBeGreaterThan(0);
        for (const ref of p?.why?.clauses ?? []) {
          expect(KNOWN_FRAMEWORKS.has(ref.split(':')[0]), ref).toBe(true);
        }
      }
      expect(guide.pages?.['list']?.empty?.cta).toBeTruthy();
      expect(guide.pages?.['meetings']?.empty?.cta).toBeTruthy();
      for (const tour of ['list', 'meetings', 'detail', 'meetingDetail']) {
        expect(guide.tours?.[tour]?.length, tour).toBeGreaterThan(0);
      }
    }
  });

  it('ships valid lessons with the same answers in both languages', () => {
    const answers = (f: GuidanceFile) =>
      Object.values(f.lessons ?? {}).flatMap((l) => (l.quiz ?? []).map((q) => q.answer));
    for (const guide of [guideEn, guideNb] as GuidanceFile[]) {
      expect(Object.keys(guide.lessons ?? {})).toEqual(['effective-review', 'good-minutes']);
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
