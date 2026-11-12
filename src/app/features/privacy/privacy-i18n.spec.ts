import guideEn from '../../../assets/guidance/en/privacy.json';
import guideNb from '../../../assets/guidance/nb/privacy.json';
import en from '../../../assets/i18n/privacy/en.json';
import nb from '../../../assets/i18n/privacy/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { CLOCK_STATUSES, PRIVACY_SORTS, SCREENING_CRITERIA } from './data/privacy.models';
import { PRIVACY_ERROR_CODES } from './data/privacy-errors';
import { FIELD_SECTIONS, REGISTER_LIST, optionSets } from './data/privacy-registers';
import { OVERVIEW_LESSONS } from './privacy-overview';
import { REGISTER_LESSONS } from './register-list';

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

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const pascal = (s: string) => camel(s).replace(/^./, (c) => c.toUpperCase());

/** Event kinds the backend emits (privacy:notifications.<key> / privacy:timeline.<key>). */
const EVENT_KEYS = [
  ...REGISTER_LIST.flatMap((r) =>
    ['created', 'updated', 'status_changed', 'owner_changed', 'deleted'].map(
      (verb) => camel(r.entityType) + pascal(verb),
    ),
  ),
  'dataSubjectRequestExtended',
  'dataBreachAuthorityNotified',
  'dataBreachSubjectsNotified',
  'consentRecordWithdrawn',
  'dpiaDecided',
  'legalBasisAssessmentDecided',
];

/** Clauses the backend module declares (manifest), plus none other. */
const DECLARED = new Set([
  'gdpr:5',
  'gdpr:6',
  'gdpr:7',
  'gdpr:9',
  'gdpr:12',
  'gdpr:15',
  'gdpr:16',
  'gdpr:17',
  'gdpr:18',
  'gdpr:20',
  'gdpr:21',
  'gdpr:22',
  'gdpr:24',
  'gdpr:28',
  'gdpr:30',
  'gdpr:32',
  'gdpr:33',
  'gdpr:34',
  'gdpr:35',
  'gdpr:36',
  'gdpr:44',
  'gdpr:45',
  'gdpr:46',
  'gdpr:49',
  'iso27001:A.5.20',
  'iso27001:A.5.33',
  'iso27001:A.5.34',
]);

describe('privacy i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it('names every register, status, field, section and option', () => {
    for (const lang of [en, nb]) {
      const expectKey = (key: string) => expect(typeof lookup(lang, key), key).toBe('string');
      for (const r of REGISTER_LIST) {
        for (const part of ['name', 'plural', 'description', 'new']) {
          expectKey(`registers.${r.key}.${part}`);
        }
        r.statuses.forEach((s) => expectKey(`status.${s}`));
        r.fields.forEach((f) => expectKey((f.labelKey ?? `privacy.fields.${f.key}`).slice(8)));
        r.facts.forEach((f) => expectKey(`fields.${f.key}`));
        r.filters.forEach((f) => expectKey(`fields.${f.param}`));
        expectKey(`detail.statusHint.${r.key}`);
      }
      FIELD_SECTIONS.forEach((s) => expectKey(`form.sections.${s}`));
      ['facts', 'screening'].forEach((s) => expectKey(`form.sections.${s}`));
      for (const [set, values] of Object.entries(optionSets())) {
        values.forEach((v) => expectKey(`options.${set}.${v}`));
      }
      SCREENING_CRITERIA.forEach((c) => {
        expectKey(`criteria.${c}.label`);
        expectKey(`criteria.${c}.hint`);
      });
      CLOCK_STATUSES.forEach((c) => expectKey(`breach.clock.${c}`));
      PRIVACY_ERROR_CODES.forEach((c) => expectKey(`errors.${c}`));
      ['forbidden', 'notFound'].forEach((c) => expectKey(`errors.${c}`));
      EVENT_KEYS.forEach((k) => {
        expectKey(`notifications.${k}`);
        expectKey(`timeline.${k}`);
      });
      PRIVACY_SORTS.forEach((s) =>
        expectKey(`sorts.${s.startsWith('-') ? `${s.slice(1)}Desc` : s}`),
      );
    }
  });

  it('keeps personal data out of request and consent notifications', () => {
    for (const lang of [en, nb]) {
      for (const [key, text] of Object.entries(lang.notifications)) {
        if (key.startsWith('dataSubjectRequest') || key.startsWith('consentRecord')) {
          expect(text, key).not.toContain('title');
        }
      }
    }
  });

  it('gives every guided page an intro, and every register a why note, empty state and field help', () => {
    for (const guide of [guideEn, guideNb]) {
      const pages = guide.pages as Tree;
      for (const page of ['overview', 'form', 'detail', ...REGISTER_LIST.map((r) => r.key)]) {
        expect((pages[page] as Tree)['intro'], page).toBeTruthy();
      }
      for (const r of REGISTER_LIST) {
        const p = pages[r.key] as Tree;
        expect(((p['why'] as Tree)['clauses'] as string[]).length, r.key).toBeGreaterThan(0);
        expect(p['empty'], r.key).toBeTruthy();
        const fields = Object.keys(p['fields'] as Tree);
        expect(fields.length, r.key).toBeGreaterThan(0);
        const keys = new Set(r.fields.map((f) => f.key));
        fields.forEach((f) => expect(keys.has(f), `${r.key}.${f}`).toBe(true));
      }
    }
  });

  it('has every lesson the pages link to, with a valid quiz, and the overview tour', () => {
    for (const guide of [guideEn, guideNb]) {
      const lessons = guide.lessons as Record<
        string,
        { quiz: { answer: number; options: string[] }[] }
      >;
      for (const key of [...OVERVIEW_LESSONS, ...Object.values(REGISTER_LESSONS)]) {
        expect(lessons[key], key).toBeTruthy();
      }
      for (const lesson of Object.values(lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
        }
      }
      expect(guide.tours.overview.length).toBeGreaterThan(0);
    }
  });

  it('only references clauses the module declares', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of Object.values(guide.pages as Tree)) {
        const why = (page as Tree)['why'] as Tree | undefined;
        for (const ref of (why?.['clauses'] as string[] | undefined) ?? []) {
          expect(DECLARED.has(ref), ref).toBe(true);
        }
      }
    }
    for (const r of REGISTER_LIST) {
      r.clauses.forEach((c) => expect(DECLARED.has(c), c).toBe(true));
    }
  });

  it('never names a vendor or model in user-facing text', () => {
    const banned = /\b(claude|anthropic|openai|gpt|gemini|llama|mistral)\b/i;
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => banned.test(s))).toEqual([]);
    }
  });
});
