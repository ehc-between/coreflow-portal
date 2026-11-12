import guideEn from '../../../assets/guidance/en/inspections.json';
import guideNb from '../../../assets/guidance/nb/inspections.json';
import en from '../../../assets/i18n/inspections/en.json';
import nb from '../../../assets/i18n/inspections/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { GuidanceFile } from '../../core/guidance/guidance.models';
import { FRAMEWORK_KEYS } from '../../core/standards/frameworks-data';
import { INSPECTION_ERROR_CODES } from './data/inspection-errors';
import {
  FINDING_STATUSES,
  INSPECTION_RESULTS,
  INSPECTION_STATUSES,
  QUESTION_TYPES,
  SEVERITIES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUSES,
} from './data/inspection.models';
import { FINDING_SORT_KEYS } from './findings/findings-list';
import { INSPECTION_FIELD_LABELS } from './inspections/inspection-detail';
import { INSPECTION_SORT_KEYS } from './list/inspections-list';
import { TEMPLATE_FIELD_LABELS } from './templates/template-detail';
import { TEMPLATE_SORT_KEYS } from './templates/templates-list';

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

/** Event-kind name keys the backend emits (`inspections:notifications.*` / `inspections:timeline.*`). */
const EVENT_KEYS = [
  'templateCreated',
  'templateUpdated',
  'templatePublished',
  'templateArchived',
  'templateDeleted',
  'scheduled',
  'assigned',
  'started',
  'completed',
  'cancelled',
  'deleted',
  'findingRaised',
  'findingAssigned',
  'findingEscalated',
  'findingClosed',
  'findingReopened',
];

describe('inspections i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => {
    expectKeyParity(en, nb);
  });

  it('keeps the guidance files at full en/nb parity', () => {
    expectKeyParity(guideEn, guideNb);
  });

  it('has no empty strings and no vendor names', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      const all = strings(file);
      expect(all.filter((s) => !s.trim())).toEqual([]);
      expect(all.filter((s) => /claude|anthropic|openai|gpt/i.test(s))).toEqual([]);
    }
  });

  it('defines every dynamic key the pages build', () => {
    for (const lang of [en, nb]) {
      const has = (key: string) => expect(typeof lookup(lang, key), key).toBe('string');
      INSPECTION_STATUSES.forEach((s) => has(`status.${s}`));
      TEMPLATE_STATUSES.forEach((s) => has(`templateStatus.${s}`));
      INSPECTION_RESULTS.forEach((r) => has(`result.${r}`));
      SEVERITIES.forEach((s) => has(`severity.${s}`));
      FINDING_STATUSES.forEach((s) => has(`findingStatus.${s}`));
      QUESTION_TYPES.forEach((t) => has(`questionTypes.${t}`));
      TEMPLATE_CATEGORIES.forEach((c) => has(`category.${c}`));
      FRAMEWORK_KEYS.forEach((f) => has(`frameworks.${f}`));
      INSPECTION_ERROR_CODES.forEach((c) => has(`errors.${c}`));
      ['yes', 'no', 'na'].forEach((a) => has(`answers.${a}`));
      ['auto', 'manual'].forEach((s) => has(`findings.source.${s}`));
      ['inspections', 'findings', 'templates', 'schedules'].forEach((s) => has(`sections.${s}`));
      for (const keys of [INSPECTION_SORT_KEYS, FINDING_SORT_KEYS, TEMPLATE_SORT_KEYS]) {
        Object.values(keys).forEach((k) => has(`sort.${k}`));
      }
      for (const labels of [INSPECTION_FIELD_LABELS, TEMPLATE_FIELD_LABELS]) {
        Object.values(labels).forEach((k) => has(k.replace(/^inspections\./, '')));
      }
      for (const action of ['publish', 'archive']) {
        has(`templates.${action}`);
        has(`templates.${action}Title`);
        has(`templates.${action}Message`);
      }
      [
        'textRequired',
        'textTooLong',
        'weight',
        'scale',
        'passScore',
        'range',
        'id',
        'server',
      ].forEach((p) => has(`builder.problems.${p}`));
      EVENT_KEYS.forEach((k) => {
        has(`notifications.${k}`);
        has(`timeline.${k}`);
      });
    }
  });

  it('ships guidance for every page, a micro-lesson and the tours', () => {
    const file = guideEn as GuidanceFile;
    const pages = [
      'list',
      'findings',
      'templates',
      'library',
      'templateDetail',
      'builder',
      'form',
      'detail',
      'run',
      'schedules',
    ];
    for (const page of pages) {
      expect(file.pages?.[page]?.intro?.title, page).toBeTruthy();
      expect(file.pages?.[page]?.why?.clauses?.length, page).toBeGreaterThan(0);
    }
    for (const page of ['list', 'findings', 'templates', 'schedules']) {
      expect(file.pages?.[page]?.empty?.cta, page).toBeTruthy();
    }
    const fields: Record<string, string[]> = {
      builder: ['title', 'passThreshold', 'autoDeviation', 'questionType', 'weight'],
      form: ['template', 'location', 'inspector', 'owner'],
      detail: ['score', 'findings', 'finding', 'severity'],
      run: ['signature'],
      templateDetail: ['version'],
      schedules: ['leadDays'],
    };
    for (const [page, names] of Object.entries(fields)) {
      for (const name of names) {
        expect(file.pages?.[page]?.fields?.[name]?.help, `${page}.${name}`).toBeTruthy();
      }
    }
    const lesson = file.lessons?.['inspection-basics'];
    expect(lesson?.sections.length).toBeGreaterThanOrEqual(3);
    for (const q of lesson?.quiz ?? []) {
      expect(q.answer).toBeLessThan(q.options.length);
    }
    for (const tour of ['list', 'templates', 'builder']) {
      expect(file.tours?.[tour]?.length, tour).toBeGreaterThan(0);
    }
  });
});
