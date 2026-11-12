import en from '../../../assets/i18n/training/en.json';
import nb from '../../../assets/i18n/training/nb.json';
import guidanceEn from '../../../assets/guidance/en/training.json';
import guidanceNb from '../../../assets/guidance/nb/training.json';
import globalEn from '../../../assets/i18n/en.json';
import globalNb from '../../../assets/i18n/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { TRAINING_ERROR_CODES } from './data/training-display';
import {
  ASSIGNMENT_REASONS,
  ASSIGNMENT_STATUSES,
  CELL_STATUSES,
  COURSE_CATEGORIES,
  COURSE_KINDS,
  COURSE_STATUSES,
  EFFECTIVENESS,
  RECORD_METHODS,
  RULE_TARGETS,
} from './data/training.models';
import { VALIDITY_FILTERS } from './records/record-list';
import { COURSE_FIELD_LABELS } from './courses/course-detail';

type Dict = Record<string, unknown>;

function lookup(dict: unknown, path: string): unknown {
  // Keys may contain dots only as separators; sort keys like "-updated_at" are single segments.
  return path.split('.').reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);
}

function leaves(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') {
    return [[prefix, value]];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => leaves(v, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Dict).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

const params = (text: string) =>
  [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();

const EVENT_NAMES = [
  'courseCreated',
  'courseUpdated',
  'coursePublished',
  'courseArchived',
  'courseDeleted',
  'assigned',
  'dueChanged',
  'assignmentCancelled',
  'assignmentCompleted',
  'failedAttempt',
  'recordRecorded',
  'recordEvaluated',
  'feedbackGiven',
  'recordDeleted',
];

const SORTS = [
  'title',
  'code',
  '-updated_at',
  '-created_at',
  'due_at',
  '-due_at',
  '-completed_at',
  'completed_at',
  'expires_at',
];

describe('training i18n', () => {
  it('keeps the scoped translations at en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance content at en/nb parity', () => expectKeyParity(guidanceEn, guidanceNb));

  it('uses the same interpolation params in every language', () => {
    const nbLeaves = new Map(leaves(nb));
    for (const [path, text] of leaves(en)) {
      expect(params(nbLeaves.get(path) ?? ''), path).toEqual(params(text));
    }
  });

  it('labels every enum value the API returns', () => {
    for (const lang of [en, nb]) {
      const groups: [string, readonly string[]][] = [
        ['category', COURSE_CATEGORIES],
        ['kind', COURSE_KINDS],
        ['status', COURSE_STATUSES],
        ['assignmentStatus', [...ASSIGNMENT_STATUSES, 'overdue']],
        ['reason', ASSIGNMENT_REASONS],
        ['method', RECORD_METHODS],
        ['effectiveness', EFFECTIVENESS],
        ['cell', CELL_STATUSES],
        ['ruleTarget', RULE_TARGETS],
        ['errors', TRAINING_ERROR_CODES],
        ['sort', SORTS],
        ['validity', VALIDITY_FILTERS.map((v) => v || 'all')],
        ['player.state', ['done', 'seen', 'new']],
      ];
      for (const [group, values] of groups) {
        for (const value of values) {
          const node = lookup(lookup(lang, group), value);
          expect(node, `${group}.${value}`).toBeTypeOf('string');
        }
      }
    }
  });

  it('has the notification and timeline keys the backend event kinds reference', () => {
    for (const lang of [en, nb]) {
      for (const name of EVENT_NAMES) {
        expect(lookup(lang, `notifications.${name}`), name).toBeTypeOf('string');
        expect(lookup(lang, `timeline.${name}`), name).toBeTypeOf('string');
      }
    }
  });

  it('labels every revision field', () => {
    for (const key of Object.values(COURSE_FIELD_LABELS)) {
      expect(lookup(en, key.replace(/^training\./, '')), key).toBeTypeOf('string');
    }
  });

  it('relies on the global module labels F1 provides', () => {
    for (const lang of [globalEn, globalNb]) {
      for (const key of [
        'modules.names.training',
        'modules.descriptions.training',
        'modules.entities.course',
        'modules.entities.training_assignment',
        'modules.entities.training_record',
        'nav.training',
      ]) {
        expect(lookup(lang, key), key).toBeTypeOf('string');
      }
    }
  });

  it('gives every guidance page used by the module an intro, and lists teach empty states', () => {
    const pages = (guidanceEn as { pages: Dict }).pages;
    for (const page of [
      'home',
      'courses',
      'detail',
      'form',
      'player',
      'assessment',
      'assignments',
      'assignment',
      'records',
      'record',
      'matrix',
    ]) {
      expect(lookup(pages, `${page}.intro.title`), page).toBeTypeOf('string');
    }
    for (const page of ['home', 'courses', 'assignments', 'records']) {
      expect(lookup(pages, `${page}.empty.cta`), page).toBeTypeOf('string');
    }
    const lessons = (guidanceEn as { lessons: Dict }).lessons;
    expect(Object.keys(lessons)).toEqual(
      expect.arrayContaining(['competence-and-awareness', 'evaluating-effectiveness']),
    );
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llm)\b/i;
    for (const file of [en, nb, guidanceEn, guidanceNb]) {
      for (const [path, text] of leaves(file)) {
        expect(banned.test(text), path).toBe(false);
      }
    }
  });
});
