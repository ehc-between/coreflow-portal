import guideEn from '../../../assets/guidance/en/people.json';
import guideNb from '../../../assets/guidance/nb/people.json';
import en from '../../../assets/i18n/people/en.json';
import nb from '../../../assets/i18n/people/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { PEOPLE_ERROR_CODES } from './data/people-errors';
import {
  ACTION_KEYS,
  ASSESSMENT_METHODS,
  AWARENESS_KINDS,
  CELL_STATUSES,
  CHECKLIST_KINDS,
  CHECKLIST_STATUSES,
  COMPETENCE_CATEGORIES,
  COMPETENCE_LEVELS,
  DISCIPLINARY_STATUSES,
  DISCIPLINARY_TYPES,
  EMPLOYEE_SORTS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  EMPLOYEE_FLAGS,
  GAP_ACTION_KINDS,
  GAP_ACTION_STATUSES,
  COMPLIANCE_KEYS,
  ITEM_CATEGORIES,
  RECORD_STATUSES,
  RISK_LEVELS,
  SCREENING_SCOPES,
  SCREENING_STATUSES,
} from './data/people.models';
import { sortKey } from './data/people-display';
import { PEOPLE_NAV } from './ui/people-nav';

/** The sub-area keys of `people.sections.<key>`. */
const PEOPLE_SECTIONS = PEOPLE_NAV.map((item) => item.labelKey.replace('people.sections.', ''));

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

/** The `x` of the backend's `people:notifications.<x>` / `people:timeline.<x>` keys. */
const EVENT_KEYS = [
  'employeeCreated',
  'employeeUpdated',
  'employeeStatusChanged',
  'employeeDeleted',
  'competenceAssessed',
  'competenceRemoved',
  'awarenessRecorded',
  'positionCreated',
  'positionUpdated',
  'requirementsChanged',
  'positionDeleted',
  'competenceCreated',
  'competenceUpdated',
  'competenceDeleted',
  'checklistCreated',
  'checklistItemChecked',
  'checklistCompleted',
  'checklistCancelled',
  'disciplinaryOpened',
  'disciplinaryClosed',
  'accessRevoked',
  'competenceActionCreated',
  'competenceActionEvaluated',
  'positionReviewed',
];

/** The `x` of the backend's `people:next.<x>.title` / `.why` next-action keys. */
const NEXT_KEYS = [
  'checklistOverdue',
  'screeningMissing',
  'competencesExpiring',
  'positionReview',
  'membersWithoutEmployee',
];

/** Entity types whose label keys point at this scope (`people:entities.<type>`). */
const ENTITY_TYPES = ['people_checklist', 'people_awareness', 'people_disciplinary'];

/** Guidance pages the components reference. */
const GUIDED_PAGES = [
  'list',
  'form',
  'detail',
  'positions',
  'positionForm',
  'positionDetail',
  'competences',
  'competenceForm',
  'competenceDetail',
  'matrix',
  'checklists',
  'checklistDetail',
  'checklistOnboarding',
  'checklistOffboarding',
  'settings',
];

/** The clauses the backend declares for the module (manifest `clauses`). */
const DECLARED = new Set([
  'hs:5.3',
  'iso9001:7.1.2',
  'hs:7.2',
  'hs:7.3',
  'iso27001:A.6.1',
  'iso27001:A.6.2',
  'iso27001:A.6.3',
  'iso27001:A.6.4',
  'iso27001:A.6.5',
  'iso27001:A.6.6',
  'iso27001:A.5.11',
  'iso27001:A.5.18',
  'nis2:21.2.g',
  'nis2:21.2.i',
  'eu_ai_act:4',
  'gdpr:32',
  'gdpr:39',
]);

describe('people i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['status', EMPLOYEE_STATUSES],
    ['employmentTypes', EMPLOYMENT_TYPES],
    ['screening', SCREENING_STATUSES],
    ['riskLevels', RISK_LEVELS],
    ['recordStatus', RECORD_STATUSES],
    ['categories', COMPETENCE_CATEGORIES],
    ['levels', COMPETENCE_LEVELS.map(String)],
    ['cellStatus', CELL_STATUSES],
    ['checklistKinds', CHECKLIST_KINDS],
    ['checklistStatus', CHECKLIST_STATUSES],
    ['checklists.start', CHECKLIST_KINDS],
    ['itemCategories', ITEM_CATEGORIES],
    ['awarenessKinds', AWARENESS_KINDS],
    ['disciplinaryTypes', DISCIPLINARY_TYPES],
    ['disciplinaryStatus', DISCIPLINARY_STATUSES],
    ['sections', PEOPLE_SECTIONS],
    ['errors', PEOPLE_ERROR_CODES],
    ['sorts', EMPLOYEE_SORTS.map(sortKey)],
    ['notifications', EVENT_KEYS],
    ['timeline', EVENT_KEYS],
    ['entities', ENTITY_TYPES],
    ['matrix.views', ['matrix', 'gaps']],
    ['filters.statusOptions', ['current', 'all']],
    ['flags', EMPLOYEE_FLAGS],
    ['screeningScopes', SCREENING_SCOPES],
    ['methods', ASSESSMENT_METHODS],
    ['gapActions.kinds', GAP_ACTION_KINDS],
    ['gapActions.save', GAP_ACTION_KINDS],
    ['gapActionStatus', GAP_ACTION_STATUSES],
    ['compliance.keys', COMPLIANCE_KEYS],
    ['compliance.status', ['ok', 'missing', 'due', 'pending', 'not_required']],
    ['checklists.actions', ACTION_KEYS],
    ['settings.actions', ACTION_KEYS],
    ['notices.gapAction', GAP_ACTION_KINDS],
    ['next', NEXT_KEYS.flatMap((k) => [`${k}.title`, `${k}.why`])],
    ['next.positionReview', ['titleOne', 'whyOne']],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values as readonly string[]) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of GUIDED_PAGES) {
        const p = (guide.pages as Tree)[page] as Tree;
        expect(p?.['intro'], page).toBeTruthy();
        expect(((p['why'] as Tree)['clauses'] as string[]).length, page).toBeGreaterThan(0);
      }
      expect(Object.keys(guide.lessons).length).toBeGreaterThanOrEqual(3);
      for (const lesson of Object.values(guide.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(guide.tours.list.length).toBeGreaterThan(0);
      expect(guide.tours.matrix.length).toBeGreaterThan(0);
    }
  });

  it('only references clauses the module declares', () => {
    for (const guide of [guideEn, guideNb]) {
      const refs = [
        ...Object.values(guide.pages as Tree).flatMap(
          (page) => (((page as Tree)['why'] as Tree | undefined)?.['clauses'] as string[]) ?? [],
        ),
        ...Object.values(guide.glossary).flatMap((g) => g.clauses ?? []),
      ];
      for (const ref of refs) {
        expect(DECLARED.has(ref), ref).toBe(true);
      }
    }
  });

  it('names every clause the module declares in plain words, never "ISO HS"', () => {
    for (const lang of [en, nb]) {
      for (const ref of DECLARED) {
        const [framework, number] = ref.split(':');
        const key = `clauses.${framework}_${number.replace(/\./g, '_')}`;
        expect(typeof lookup(lang, key), key).toBe('string');
      }
      expect(strings(lang).filter((s) => /ISO HS/.test(s))).toEqual([]);
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});
