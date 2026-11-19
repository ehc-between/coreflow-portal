import guideEn from '../../../assets/guidance/en/contracts.json';
import guideNb from '../../../assets/guidance/nb/contracts.json';
import en from '../../../assets/i18n/contracts/en.json';
import nb from '../../../assets/i18n/contracts/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { ATTENTION_FILTERS, STATUS_FILTERS } from './contracts-list';
import { CONTRACT_ERROR_CODES } from './data/contract-errors';
import {
  CONTRACT_ACTIONS,
  CONTRACT_SORTS,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  CONTRACT_WARNINGS,
  DEADLINE_KINDS,
  DPA_CLAUSE_KEYS,
  DPA_STATES,
  PARTY_ROLES,
  PERSONAL_DATA_ROLES,
  REVIEW_ANSWERS,
  REVIEW_ITEM_KEYS,
  TRANSFER_BASES,
  VALUE_PERIODS,
} from './data/contract.models';

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

/** Event kinds the backend emits (contracts:notifications.<key> / contracts:timeline.<key>). */
const NOTIFY_KINDS = [
  'ownerChanged',
  'submitted',
  'approved',
  'rejected',
  'activated',
  'renewed',
  'terminated',
  'expired',
  'versionAdded',
  'reviewed',
];
const TIMELINE_KINDS = [
  ...NOTIFY_KINDS,
  'created',
  'updated',
  'deleted',
  'partyAdded',
  'partyUpdated',
  'partyRemoved',
  'keyDateAdded',
  'keyDateUpdated',
  'keyDateCompleted',
  'keyDateRemoved',
  'versionUpdated',
  'obligationAdded',
];

describe('contracts i18n and guidance', () => {
  it('keeps the scoped translations at full en/nb parity', () => expectKeyParity(en, nb));

  it('keeps the guidance files at full en/nb parity', () => expectKeyParity(guideEn, guideNb));

  it('has no empty strings', () => {
    for (const file of [en, nb, guideEn, guideNb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it.each([
    ['status', CONTRACT_STATUSES],
    ['types', CONTRACT_TYPES],
    ['partyRoles', PARTY_ROLES],
    ['valuePeriods', VALUE_PERIODS],
    ['deadlineKinds', DEADLINE_KINDS],
    ['actions', CONTRACT_ACTIONS],
    ['actionDialog.titles', CONTRACT_ACTIONS],
    ['actionDialog.messages', CONTRACT_ACTIONS],
    ['notices.actions', CONTRACT_ACTIONS],
    ['workflow.hint', CONTRACT_STATUSES],
    ['detail.todo', [...CONTRACT_WARNINGS, 'counterparty']],
    ['dpa.status', DPA_STATES],
    ['dpa.explain', DPA_STATES],
    ['dpaClauses', DPA_CLAUSE_KEYS],
    ['errors', CONTRACT_ERROR_CODES],
    ['notifications', NOTIFY_KINDS],
    ['timeline', TIMELINE_KINDS],
    ['transferBases', TRANSFER_BASES],
    ['reviewItems', REVIEW_ITEM_KEYS],
    ['approve.answers', REVIEW_ANSWERS],
    ['dpa.match', ['supplier', 'org_number', 'name']],
    ['kpis', ['active', 'dpa_missing', 'notice_soon', 'review']],
  ])('translates every %s value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(typeof lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toBe('string');
      }
    }
  });

  it('labels, explains and filters every warning, and labels every GDPR role', () => {
    for (const lang of [en, nb]) {
      for (const w of CONTRACT_WARNINGS) {
        for (const part of ['label', 'fix', 'filter']) {
          expect(typeof lookup(lang, `warnings.${w}.${part}`), `${w}.${part}`).toBe('string');
        }
      }
      for (const role of PERSONAL_DATA_ROLES) {
        expect(typeof lookup(lang, `personalDataRoles.${role}.label`), role).toBe('string');
        expect(typeof lookup(lang, `personalDataRoles.${role}.hint`), role).toBe('string');
      }
      for (const a of ATTENTION_FILTERS.filter((f) => f === '' || f === 'any')) {
        expect(typeof lookup(lang, `filters.attentionOptions.${a || 'all'}`)).toBe('string');
      }
      for (const key of ['notice', 'reviewOverdue', 'deadlineOverdue', 'deadline']) {
        expect(typeof lookup(lang, `next.${key}.title`), key).toBe('string');
        expect(typeof lookup(lang, `next.${key}.why`), key).toBe('string');
      }
    }
  });

  it('translates every status filter and sort option', () => {
    for (const lang of [en, nb]) {
      for (const f of STATUS_FILTERS.filter((s) => s === 'open' || s === 'all')) {
        expect(typeof lookup(lang, `filters.statusOptions.${f}`)).toBe('string');
      }
      for (const s of CONTRACT_SORTS) {
        const key = s.startsWith('-') ? `${s.slice(1)}Desc` : s;
        expect(typeof lookup(lang, `sorts.${key}`), key).toBe('string');
      }
    }
  });

  it('gives every guided page an intro and a why note with clauses, and lessons a valid quiz', () => {
    for (const guide of [guideEn, guideNb]) {
      for (const page of ['list', 'form', 'detail', 'deadlines']) {
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
    }
  });

  it('only references clauses the module declares or the shared structure', () => {
    // The backend's clause declarations for contracts (A14).
    const declared = new Set([
      'iso9001:8.2.3',
      'iso9001:8.4.3',
      'iso27001:A.5.20',
      'iso27001:A.6.6',
      'gdpr:28',
      'nis2:21.2.d',
      'iso42001:A.10.3',
      'iso45001:8.1.4.3',
    ]);
    for (const guide of [guideEn, guideNb]) {
      for (const page of Object.values(guide.pages as Tree)) {
        const why = (page as Tree)['why'] as Tree | undefined;
        for (const ref of (why?.['clauses'] as string[] | undefined) ?? []) {
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
