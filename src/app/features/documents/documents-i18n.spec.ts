import guideEn from '../../../assets/guidance/en/documents.json';
import guideNb from '../../../assets/guidance/nb/documents.json';
import en from '../../../assets/i18n/documents/en.json';
import nb from '../../../assets/i18n/documents/nb.json';
import globalEn from '../../../assets/i18n/en.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { CAMPAIGN_STATUS_FILTERS } from './campaigns/campaign-list';
import { RECIPIENT_FILTERS } from './campaigns/campaign-detail';
import { DOCUMENT_CONTROL_ERROR_CODES } from './data/document-control-errors';
import {
  AUDIENCE_TYPES,
  CAMPAIGN_SORTS,
  CAMPAIGN_STATUSES,
  EXTERNAL_SORTS,
  EXTERNAL_STATUSES,
  REGISTER_SORTS,
  RETENTION_APPLIES_TO,
  RETENTION_DISPOSITIONS,
  RETENTION_TRIGGERS,
} from './data/document-control.models';
import { EXTERNAL_STATUS_FILTERS } from './external/external-list';
import { REGISTER_STATUS_FILTERS } from './register/document-register';
import { DUE_WINDOWS } from './retention/retention-list';
import { DOCUMENTS_SUBNAV } from './shared/documents-subnav';

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

/** Event names the backend registers (`documents:notifications.<x>` / `documents:timeline.<x>`). */
const EVENT_NAMES = [
  'documentCreated',
  'documentRevised',
  'documentSubmitted',
  'documentChangesRequested',
  'documentApproved',
  'documentObsoleted',
  'documentAcknowledged',
  ...['type', 'template', 'retentionRule', 'external'].flatMap((p) =>
    ['Created', 'Updated', 'Deleted'].map((v) => `${p}${v}`),
  ),
  'externalReviewed',
  'campaignCreated',
  'campaignUpdated',
  'campaignDeleted',
  'campaignLaunched',
  'campaignReminder',
  'campaignReminded',
  'campaignAcknowledged',
  'campaignCompleted',
  'campaignClosed',
];

const GUIDED_PAGES = [
  'register',
  'campaigns',
  'campaignForm',
  'campaignDetail',
  'external',
  'externalForm',
  'externalDetail',
  'types',
  'typeForm',
  'templates',
  'templateForm',
  'retention',
  'retentionForm',
  'compare',
  'newDocument',
  'draft',
];

const EMPTY_PAGES = ['register', 'campaigns', 'external', 'types', 'templates', 'retention'];

const LESSONS = [
  'master-list',
  'read-and-acknowledge',
  'external-documents',
  'numbering-and-types',
  'retention-basics',
  'comparing-revisions',
];

describe('documents i18n and guidance', () => {
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
    ['nav', [...DOCUMENTS_SUBNAV.map((i) => i.key), 'label']],
    ['errors', [...DOCUMENT_CONTROL_ERROR_CODES, 'forbidden', 'notFound', 'invalid']],
    ['filters.sorts', [...REGISTER_SORTS, ...CAMPAIGN_SORTS, ...EXTERNAL_SORTS]],
    ['register.status', REGISTER_STATUS_FILTERS.map((s) => s || 'all')],
    ['campaigns.status', CAMPAIGN_STATUSES],
    ['campaigns.statusFilters', CAMPAIGN_STATUS_FILTERS],
    ['campaigns.recipientFilters', RECIPIENT_FILTERS],
    ['campaigns.audience.types', AUDIENCE_TYPES],
    ['campaigns.audience.chip', ['user', 'role', 'department']],
    ['external.status', EXTERNAL_STATUSES],
    ['external.statusFilters', EXTERNAL_STATUS_FILTERS],
    ['retention.appliesTo', RETENTION_APPLIES_TO],
    ['retention.triggers', RETENTION_TRIGGERS],
    ['retention.dispositions', RETENTION_DISPOSITIONS],
    ['retention.windows', DUE_WINDOWS.map(String)],
  ])('translates every control.%s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        const node = lookup(lang, `control.${prefix}`) as Tree | undefined;
        expect(typeof node?.[value], `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('defines the scoped event texts the backend emits', () => {
    for (const lang of [en, nb]) {
      for (const name of EVENT_NAMES) {
        expect(typeof lookup(lang, `notifications.${name}`), name).toBe('string');
        expect(typeof lookup(lang, `timeline.${name}`), name).toBe('string');
      }
    }
  });

  it('does not shadow the global documents keys', () => {
    const globalDocuments = (globalEn as Tree)['documents'] as Tree;
    for (const key of Object.keys(en)) {
      expect(globalDocuments[key], key).toBeUndefined();
    }
  });

  it('labels every M24 entity type globally', () => {
    const entities = ((globalEn as Tree)['modules'] as Tree)['entities'] as Tree;
    for (const type of [
      'document_type',
      'document_template',
      'external_document',
      'distribution_campaign',
      'retention_rule',
    ]) {
      expect(typeof entities[type], type).toBe('string');
    }
  });

  it('gives every guided page an intro and a why note with clauses', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of GUIDED_PAGES) {
        const p = lookup(guide, `pages.${page}`) as Tree;
        expect(p['intro'], page).toBeTruthy();
        expect((lookup(p, 'why.clauses') as string[]).length, page).toBeGreaterThan(0);
      }
      for (const page of EMPTY_PAGES) {
        expect(lookup(guide, `pages.${page}.empty.cta`), page).toBeTruthy();
      }
    }
  });

  it('has the referenced lessons with valid quizzes', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const key of LESSONS) {
        expect(guide.lessons[key as keyof typeof guide.lessons], key).toBeTruthy();
      }
      for (const lesson of Object.values(guide.lessons)) {
        for (const q of lesson.quiz) {
          expect(q.answer).toBeLessThan(q.options.length);
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
