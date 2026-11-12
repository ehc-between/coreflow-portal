import guideEn from '../../../assets/guidance/en/reports.json';
import guideNb from '../../../assets/guidance/nb/reports.json';
import en from '../../../assets/i18n/reports/en.json';
import nb from '../../../assets/i18n/reports/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { CALENDAR_VIEWS } from './calendar/org-calendar';
import { REPORT_ERROR_CODES } from './data/report-errors';
import {
  COMPLIANCE_AUDIENCES,
  EXPORT_FORMATS,
  FRAMEWORK_KEYS,
  REPORT_LANGS,
  WIDGET_SIZES,
} from './data/reports.models';
import { OWNER_FILTERS } from './definitions/definitions-list';
import { SUMMARY_FIELDS } from './audit-packs/audit-pack-detail';

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

/** Event kinds the backend emits (`reports:notifications.<x>` / `reports:timeline.<x>`). */
const EVENT_KEYS = [
  'definitionCreated',
  'definitionUpdated',
  'definitionDeleted',
  'definitionExported',
  'definitionScheduled',
  'definitionOwnerChanged',
  'auditPackGenerated',
  'auditPackDeleted',
  'dashboardUpdated',
  'dashboardReset',
];

/** Built-in widget title keys (`reports:widgets.<name>.title|description`). */
const WIDGET_NAMES = [
  'readiness',
  'openFindings',
  'overdueActions',
  'overdueTasks',
  'documentReviews',
  'overdueItems',
  'upcoming',
  'auditPacks',
];

/** Register status values the built-in registers accept. */
const REGISTER_STATUSES = [
  'open',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
  'investigating',
  'action',
  'verification',
  'closed',
  'verified',
  'draft',
  'in_review',
  'approved',
  'obsolete',
  'covered',
  'partial',
  'not_started',
  'not_applicable',
  'confirmed',
  'suggested',
];

const GUIDED_PAGES = [
  'overview',
  'calendar',
  'registers',
  'definitions',
  'definitionForm',
  'definitionDetail',
  'auditPacks',
  'auditPackDetail',
  'dashboards',
];

describe('reports i18n and guidance', () => {
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
    ['errors', REPORT_ERROR_CODES],
    ['frameworks', FRAMEWORK_KEYS],
    ['formats', EXPORT_FORMATS],
    ['langs', REPORT_LANGS],
    ['designer.sizes', WIDGET_SIZES],
    ['narrative.audiences', COMPLIANCE_AUDIENCES],
    ['calendar.views', CALENDAR_VIEWS],
    ['calendar.kinds', ['due', 'review', 'action']],
    ['definitions.owners', OWNER_FILTERS],
    ['definitions.sorts', ['name', 'updated', 'created', 'register']],
    ['packs.summary', SUMMARY_FIELDS],
    ['statuses', REGISTER_STATUSES],
    ['notifications', EVENT_KEYS],
    ['timeline', EVENT_KEYS],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('defines every built-in widget title and description', () => {
    for (const lang of [en, nb]) {
      for (const name of WIDGET_NAMES) {
        expect(typeof lookup(lang, `widgets.${name}.title`), name).toBe('string');
        expect(typeof lookup(lang, `widgets.${name}.description`), name).toBe('string');
      }
    }
  });

  it('gives every page an intro and a why note with clauses, and lessons a valid quiz', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of GUIDED_PAGES) {
        const p = lookup(guide, `pages.${page}`) as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect((lookup(p, 'why.clauses') as string[]).length, page).toBeGreaterThan(0);
      }
      const lessons = Object.values(guide.lessons);
      expect(lessons.length).toBeGreaterThanOrEqual(1);
      for (const lesson of lessons) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(Object.keys(guide.tours).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});
