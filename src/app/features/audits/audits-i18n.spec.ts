import guideEn from '../../../assets/guidance/en/audits.json';
import guideNb from '../../../assets/guidance/nb/audits.json';
import en from '../../../assets/i18n/audits/en.json';
import nb from '../../../assets/i18n/audits/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { TASK_STATUSES } from '../../core/tasks/task.models';
import { AUDIT_ERROR_CODES } from './data/audit-errors';
import {
  AUDITOR_ISSUES,
  AUDITOR_ROLES,
  CERTIFICATION_STATUSES,
  CHECKLIST_RESULTS,
  CHECKLIST_SOURCES,
  EXTERNAL_PARTY_TYPES,
  FINDING_ACTIONS,
  FINDING_SORTS,
  FINDING_STATUSES,
  FINDING_TYPES,
  FRAMEWORKS,
  PLAN_ACTIONS,
  PLAN_KINDS,
  PLAN_SORTS,
  PLAN_STATUSES,
  PROGRAMME_ACTIONS,
  PROGRAMME_STATUSES,
  RISK_LEVELS,
} from './data/audit.models';
import { AUDIT_SECTIONS } from './shared/audits-nav';

type Tree = Record<string, unknown>;

function lookup(tree: Tree, key: string): unknown {
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

/** The event names the backend registers (title `audits:notifications.<name>`, timeline `audits:timeline.<name>`). */
const EVENT_NAMES = [
  'programmeCreated',
  'programmeUpdated',
  'programmeStatusChanged',
  'planCreated',
  'planUpdated',
  'planStatusChanged',
  'auditorAssigned',
  'checklistGenerated',
  'reportSubmitted',
  'reportApproved',
  'reportRejected',
  'findingRaised',
  'findingUpdated',
  'findingAssigned',
  'findingStatusChanged',
  'findingActionCreated',
  'certificationCreated',
  'certificationUpdated',
  'certificationStatusChanged',
];

const GUIDED_PAGES = [
  'overview',
  'plans',
  'programmes',
  'findings',
  'certifications',
  'auditors',
  'planForm',
  'planDetail',
  'programmeForm',
  'programmeDetail',
  'findingForm',
  'findingDetail',
  'certificationForm',
  'certificationDetail',
];

describe('audits i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['nav', AUDIT_SECTIONS.map((s) => s.key)],
    ['frameworks', FRAMEWORKS],
    ['kind', PLAN_KINDS],
    ['partyType', EXTERNAL_PARTY_TYPES],
    ['risk', RISK_LEVELS],
    ['programmeStatus', PROGRAMME_STATUSES],
    ['programmeAction', PROGRAMME_ACTIONS],
    ['planStatus', PLAN_STATUSES],
    ['planAction', PLAN_ACTIONS],
    ['plans.sorts', PLAN_SORTS],
    ['auditorRole', AUDITOR_ROLES],
    ['auditorIssue', AUDITOR_ISSUES],
    ['checklistResult', CHECKLIST_RESULTS],
    ['checklistSource', CHECKLIST_SOURCES],
    ['findingType', FINDING_TYPES],
    ['findingTypeHelp', FINDING_TYPES],
    ['findingStatus', FINDING_STATUSES],
    ['findingAction', FINDING_ACTIONS],
    ['findings.sorts', FINDING_SORTS],
    ['certificationStatus', CERTIFICATION_STATUSES],
    ['taskStatus', TASK_STATUSES],
    ['errors', AUDIT_ERROR_CODES],
    ['notifications', EVENT_NAMES],
    ['timeline', EVENT_NAMES],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb] as Tree[]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses', () => {
    for (const guide of [guideEn, guideNb]) {
      const pages = guide.pages as Tree;
      for (const page of GUIDED_PAGES) {
        const p = pages[page] as Tree;
        expect(p?.['intro'], page).toBeTruthy();
        expect(((p['why'] as Tree)['clauses'] as string[]).length, page).toBeGreaterThan(0);
      }
      for (const page of ['plans', 'programmes', 'findings', 'certifications', 'auditors']) {
        expect((pages[page] as Tree)['empty'], page).toBeTruthy();
      }
    }
  });

  it('has valid lesson quizzes and an overview tour', () => {
    for (const guide of [guideEn, guideNb]) {
      expect(Object.keys(guide.lessons).length).toBeGreaterThanOrEqual(1);
      for (const lesson of Object.values(guide.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(guide.tours.overview.length).toBeGreaterThan(0);
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});
