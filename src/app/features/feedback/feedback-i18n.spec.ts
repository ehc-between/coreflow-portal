import guideEn from '../../../assets/guidance/en/feedback.json';
import guideNb from '../../../assets/guidance/nb/feedback.json';
import en from '../../../assets/i18n/feedback/en.json';
import nb from '../../../assets/i18n/feedback/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { sortKey } from './data/feedback-display';
import { FEEDBACK_ERROR_CODES } from './data/feedback-errors';
import {
  FEEDBACK_ACTIONS,
  FEEDBACK_CHANNELS,
  FEEDBACK_KINDS,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_SORTS,
  FEEDBACK_STATUSES,
  QUESTION_TYPES,
  SURVEY_ACTIONS,
  SURVEY_SORTS,
  SURVEY_STATUSES,
} from './data/feedback.models';
import { STATUS_FILTERS } from './items/feedback-list';

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

/** The scoped keys the backend's event kinds use (feedback:notifications.* / feedback:timeline.*). */
const EVENT_KEYS = [
  'feedbackCreated',
  'complaintReceived',
  'feedbackUpdated',
  'feedbackOwnerChanged',
  'feedbackAcknowledged',
  'feedbackStarted',
  'feedbackResolved',
  'feedbackClosed',
  'feedbackReopened',
  'feedbackDeleted',
  'deviationLinked',
  'deviationUnlinked',
  'feedbackTaskAdded',
  'surveyCreated',
  'surveyUpdated',
  'surveyPublished',
  'surveyClosed',
  'surveyReopened',
  'surveyLinkRegenerated',
  'surveyDeleted',
  'surveyResponseReceived',
  'surveyResponseDeleted',
  'surveyLowScore',
];

describe('feedback i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['kinds', FEEDBACK_KINDS],
    ['channels', FEEDBACK_CHANNELS],
    ['status', FEEDBACK_STATUSES],
    ['severities', FEEDBACK_SEVERITIES],
    ['sentiments', FEEDBACK_SENTIMENTS],
    ['actions', FEEDBACK_ACTIONS],
    ['actionDialog.titles', FEEDBACK_ACTIONS],
    ['actionDialog.messages', FEEDBACK_ACTIONS],
    ['notices.actions', FEEDBACK_ACTIONS],
    ['workflow.hint', FEEDBACK_STATUSES],
    ['surveyStatus', SURVEY_STATUSES],
    ['surveyActions', SURVEY_ACTIONS],
    ['surveyActionDialog.titles', SURVEY_ACTIONS],
    ['surveyActionDialog.messages', SURVEY_ACTIONS],
    ['notices.surveyActions', SURVEY_ACTIONS],
    ['surveyWorkflow.hint', SURVEY_STATUSES],
    ['questionTypes', QUESTION_TYPES],
    ['errors', FEEDBACK_ERROR_CODES],
    ['notifications', EVENT_KEYS],
    ['timeline', EVENT_KEYS],
    ['form.scoreOption', ['1', '2', '3', '4', '5']],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('translates every status filter and sort option', () => {
    for (const lang of [en, nb]) {
      for (const f of STATUS_FILTERS.filter((s) => s === 'open' || s === 'all')) {
        expect(typeof lookup(lang, `filters.statusOptions.${f}`)).toBe('string');
      }
      for (const s of [...FEEDBACK_SORTS, ...SURVEY_SORTS]) {
        expect(typeof lookup(lang, `sorts.${sortKey(s)}`), s).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    const pages = ['list', 'form', 'detail', 'surveys', 'surveyForm', 'surveyDetail', 'insights'];
    for (const guide of [guideEn, guideNb]) {
      for (const page of pages) {
        const p = (guide.pages as Tree)[page] as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect(((p['why'] as Tree)['clauses'] as string[]).length, page).toBeGreaterThan(0);
      }
      expect(Object.keys(guide.lessons).length).toBeGreaterThan(0);
      for (const lesson of Object.values(guide.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(guide.tours.list.length).toBeGreaterThan(0);
      expect(guide.tours.surveys.length).toBeGreaterThan(0);
    }
  });

  it('only references the clauses the module declares', () => {
    const declared = new Set(['iso9001:9.1.2', 'iso9001:8.2.1']);
    for (const guide of [guideEn, guideNb]) {
      for (const page of Object.values(guide.pages as Tree)) {
        for (const ref of ((page as Tree)['why'] as Tree)['clauses'] as string[]) {
          expect(declared.has(ref), ref).toBe(true);
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
