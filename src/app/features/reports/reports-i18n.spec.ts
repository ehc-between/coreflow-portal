import guideEn from '../../../assets/guidance/en/reports.json';
import guideNb from '../../../assets/guidance/nb/reports.json';
import en from '../../../assets/i18n/reports/en.json';
import nb from '../../../assets/i18n/reports/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { CALENDAR_VIEWS, OWNER_CHOICES } from './calendar/org-calendar';
import { DATE_FIELDS } from './components/register-filters';
import { REPORT_ERROR_CODES } from './data/report-errors';
import {
  CALENDAR_STATES,
  COMPLIANCE_AUDIENCES,
  EXPORT_FORMATS,
  FRAMEWORK_KEYS,
  REPORT_LANGS,
  WIDGET_SIZES,
} from './data/reports.models';
import { OWNER_FILTERS } from './definitions/definitions-list';

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

/** Widget title keys (`reports:widgets.<name>.title|description`): built in, then module metrics. */
const WIDGET_NAMES = [
  'readiness',
  'openFindings',
  'overdueActions',
  'overdueTasks',
  'documentReviews',
  'overdueItems',
  'upcoming',
  'auditPacks',
  'heatMap',
  'risksAboveAppetite',
  'trainingCompliance',
  'competenceGaps',
  'obligationEvaluations',
  'kpisOffTrack',
  'supplierEvaluations',
  'privacyDeadlines',
  'aiAssessments',
  'auditFindings',
  'inspectionFindings',
  'hseFollowUp',
  'environmentalAspects',
  'continuityReadiness',
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

/** Audit pack file kinds (`AuditPackFile.kind`). */
const PACK_KINDS = [
  'index',
  'soa',
  'evidence',
  'readiness',
  'policy',
  'policy_index',
  'registers',
  'manifest',
];

/** Keys read through `pluralKey()`: each needs its `One` variant. */
const PLURAL_KEYS = [
  'runs.rows',
  'definitions.runCount',
  'overview.kpi.dueSoon',
  'overview.overdue.areaLink',
  'packs.notApplicable',
  'packs.evidenceLinks',
  'calendar.dayWithItems',
  'trends.upCount',
  'trends.downCount',
  'trends.upPoints',
  'trends.downPoints',
];

/** Words the nb glossary rules out (docs/ux-guide.md section 7). */
const NB_BANNED =
  /(^|[^a-zæøå])(modenhet|rammeverk|dashbord|widget|minikurs|støtter krav|iso hs|bevis)/i;

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

/** Form fields whose help says which requirements they document (at least three per form). */
const FIELDS_WITH_REQUIREMENTS = [
  'definitionForm.fields.register',
  'definitionForm.fields.format',
  'definitionForm.fields.changeReason',
  'auditPacks.fields.standard',
  'auditPacks.fields.audit',
  'auditPacks.fields.period',
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
    ['calendar.states', CALENDAR_STATES],
    ['calendar.owners', OWNER_CHOICES],
    ['definitions.owners', OWNER_FILTERS],
    ['definitions.sorts', ['name', 'updated', 'created', 'register']],
    ['packs.summary', ['requirements', 'applicable', 'covered', 'evidence_links', 'policies']],
    ['packs.kinds', PACK_KINDS],
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

  it('labels both ends of every date filter', () => {
    for (const lang of [en, nb]) {
      for (const field of DATE_FIELDS) {
        expect(typeof lookup(lang, `filters.dates.${field}.from`), field).toBe('string');
        expect(typeof lookup(lang, `filters.dates.${field}.to`), field).toBe('string');
      }
    }
  });

  it('has a singular variant for every counted text', () => {
    for (const lang of [en, nb]) {
      for (const key of PLURAL_KEYS) {
        expect(typeof lookup(lang, key), key).toBe('string');
        expect(typeof lookup(lang, `${key}One`), `${key}One`).toBe('string');
      }
    }
  });

  it('names the scheduled task in both languages', () => {
    expect(lookup(nb, 'tasks.runReport')).toContain('{{ name }}');
    expect(lookup(en, 'tasks.runReport')).toContain('{{ name }}');
  });

  it('follows the nb glossary (kravdekning, standard, oversikt, kort)', () => {
    for (const file of [nb, guideNb]) {
      expect(strings(file).filter((s) => NB_BANNED.test(s))).toEqual([]);
    }
  });

  it('defines every widget title and description', () => {
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

  it('says which requirements the key form fields document', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const field of FIELDS_WITH_REQUIREMENTS) {
        const refs = lookup(guide, `pages.${field}.requirements`) as string[] | undefined;
        expect(refs?.length, field).toBeGreaterThan(0);
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
