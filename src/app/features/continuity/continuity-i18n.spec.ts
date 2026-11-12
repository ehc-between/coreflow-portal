import guideEn from '../../../assets/guidance/en/continuity.json';
import guideNb from '../../../assets/guidance/nb/continuity.json';
import en from '../../../assets/i18n/continuity/en.json';
import nb from '../../../assets/i18n/continuity/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { BIA_FIELD_LABELS } from './bias/bia-detail';
import { CONTINUITY_ERROR_CODES } from './data/continuity-errors';
import {
  ATTENTION_GROUPS,
  BIA_SORTS,
  CONTACT_TYPES,
  CONTROLLED_ACTIONS,
  CONTROLLED_STATUSES,
  CRITICALITIES,
  DEPENDENCY_KINDS,
  EXERCISE_SORTS,
  EXERCISE_STATUSES,
  EXERCISE_TYPES,
  ICT_STATUSES,
  IMPACT_CATEGORIES,
  OUTCOMES,
  PLAN_SORTS,
  PLAN_TEXT_FIELDS,
  PLAN_TYPES,
  READINESS_ISSUES,
  READINESS_STATES,
  REVIEW_STATES,
  STEP_PHASES,
} from './data/continuity.models';
import { EXERCISE_FIELD_LABELS } from './exercises/exercise-detail';
import { PLAN_FIELD_LABELS } from './plans/plan-detail';
import { TASK_STATUSES } from '../../core/tasks/task.models';

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

/** The backend's event kinds (app/modules/continuity/events.py): group -> scoped key names. */
const CONTROLLED_EVENTS = [
  'created',
  'updated',
  'ownerChanged',
  'submitted',
  'approved',
  'rejected',
  'reviewed',
  'retired',
  'restored',
  'deleted',
];
const EVENTS: Record<string, readonly string[]> = {
  bia: CONTROLLED_EVENTS,
  plan: [...CONTROLLED_EVENTS, 'exercised', 'exerciseScheduled'],
  exercise: [
    'created',
    'updated',
    'ownerChanged',
    'completed',
    'cancelled',
    'reopened',
    'deleted',
    'actionAdded',
  ],
  ict: ['created', 'updated', 'tested', 'deleted'],
  contact: ['created', 'updated', 'deleted'],
};

describe('continuity i18n and guidance', () => {
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
    ['status', CONTROLLED_STATUSES],
    ['statusHelp', CONTROLLED_STATUSES],
    ['actions', CONTROLLED_ACTIONS],
    ['actionHelp', CONTROLLED_ACTIONS],
    ['actionDone', CONTROLLED_ACTIONS],
    ['reviewState', REVIEW_STATES],
    ['criticality', CRITICALITIES],
    ['impacts', IMPACT_CATEGORIES],
    ['impactLevel', ['0', '1', '2', '3', '4', '5']],
    ['dependencyKind', DEPENDENCY_KINDS],
    ['planType', PLAN_TYPES],
    ['planText', PLAN_TEXT_FIELDS],
    ['phase', STEP_PHASES],
    ['exerciseType', EXERCISE_TYPES],
    ['exerciseStatus', EXERCISE_STATUSES],
    ['outcome', OUTCOMES],
    ['ictStatus', ICT_STATUSES],
    ['readiness', READINESS_STATES],
    ['readinessIssue', READINESS_ISSUES],
    ['readinessIssueHelp', READINESS_ISSUES],
    ['contactType', CONTACT_TYPES],
    ['taskStatus', TASK_STATUSES],
    ['overview.groups', ATTENTION_GROUPS],
    ['filters.sorts', [...BIA_SORTS, ...PLAN_SORTS, ...EXERCISE_SORTS]],
    ['errors', CONTINUITY_ERROR_CODES],
    ['duration.units', ['minutes', 'hours', 'days']],
    ['exercises.done', ['complete', 'cancel', 'reopen']],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('defines the scoped event texts the backend emits', () => {
    for (const lang of [en, nb]) {
      for (const [group, names] of Object.entries(EVENTS)) {
        for (const name of names) {
          expect(typeof lookup(lang, `notifications.${group}.${name}`), name).toBe('string');
          expect(typeof lookup(lang, `timeline.${group}.${name}`), name).toBe('string');
        }
      }
    }
  });

  it('labels every revision field with an existing key', () => {
    for (const key of [
      ...Object.values(BIA_FIELD_LABELS),
      ...Object.values(PLAN_FIELD_LABELS),
      ...Object.values(EXERCISE_FIELD_LABELS),
    ]) {
      expect(typeof lookup(en, key.replace(/^continuity\./, '')), key).toBe('string');
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    const pages = [
      'overview',
      'bias',
      'biaForm',
      'biaDetail',
      'plans',
      'planForm',
      'planDetail',
      'exercises',
      'exerciseForm',
      'exerciseDetail',
      'ict',
      'ictForm',
      'ictDetail',
      'contacts',
    ];
    for (const guide of [guideEn, guideNb]) {
      for (const page of pages) {
        const p = lookup(guide, `pages.${page}`) as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect((lookup(p, 'why.clauses') as string[]).length, page).toBeGreaterThan(0);
      }
      for (const page of ['bias', 'plans', 'exercises', 'ict']) {
        expect(lookup(guide, `pages.${page}.empty.cta`), page).toBeTruthy();
      }
      for (const lesson of Object.values(guide.lessons)) {
        expect(lesson.sections.length).toBeGreaterThan(0);
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      for (const tour of ['overview', 'bias', 'plans', 'exercises', 'ict', 'contacts']) {
        expect((lookup(guide, `tours.${tour}`) as unknown[]).length, tour).toBeGreaterThan(0);
      }
    }
  });

  it('has the lessons the pages reference', () => {
    const lessons = [
      'continuity-basics',
      'running-a-bia',
      'recovery-targets',
      'writing-a-plan',
      'exercising-plans',
      'ict-readiness',
      'crisis-contacts',
    ];
    for (const guide of [guideEn, guideNb]) {
      for (const lesson of lessons) {
        expect(lookup(guide, `lessons.${lesson}.title`), lesson).toBeTruthy();
      }
    }
  });

  it('has field help for the fields the pages reference', () => {
    const fields: Record<string, readonly string[]> = {
      biaForm: [
        'criticality',
        'impacts',
        'mtpd_minutes',
        'rto_minutes',
        'rpo_minutes',
        'mbco',
        'dependencies',
      ],
      planForm: ['plan_type', 'bia_ids', 'steps', ...PLAN_TEXT_FIELDS],
      planDetail: ['exercise_schedule'],
      exerciseForm: ['exercise_type', 'ict_system_id', 'scenario'],
      exerciseDetail: ['achieved_recovery_minutes', 'lessons_learned', 'follow_ups'],
      ictForm: [
        'achievable_rto_minutes',
        'achievable_rpo_minutes',
        'backup_strategy',
        'test_interval_months',
      ],
      contacts: ['crisis_role', 'verified_on'],
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
