import globalEn from '../../../assets/i18n/en.json';
import globalNb from '../../../assets/i18n/nb.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import kitNb from '../../../assets/i18n/kit/nb.json';
import en from '../../../assets/i18n/customers/en.json';
import nb from '../../../assets/i18n/customers/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { CUSTOMER_STATUSES } from '../../shared/customers/customer.models';
import { CUSTOMER_FIELD_LABELS } from './customer-detail';
import { CUSTOMER_ERROR_CODES } from './data/customer-display';
import { MATCH_REASONS, SECTION_KEYS } from './data/customer.models';

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

/** Create flows of the lanes (docs/customer-register-design.md §4.3). */
const FLOWS = [
  'to_project',
  'to_contract',
  'to_dpa',
  'to_claim',
  'to_deviation',
  'to_feedback',
  'to_audit',
  'to_requirement',
  'to_processing',
  'to_property',
  'to_document',
];

describe('customers i18n', () => {
  it('keeps the scoped translations at full en/nb parity without empty strings', () => {
    expectKeyParity(en, nb);
    for (const file of [en, nb]) {
      expect(strings(file).filter((s) => !s.trim())).toEqual([]);
    }
  });

  it('names no vendor or model in user-facing text', () => {
    for (const s of [...strings(en), ...strings(nb)]) {
      expect(s).not.toMatch(/claude|anthropic|gpt|openai/i);
    }
  });

  it.each([
    ['status', CUSTOMER_STATUSES],
    ['sentence.status', CUSTOMER_STATUSES],
    ['sentence.rest', CUSTOMER_STATUSES],
    ['errors', CUSTOMER_ERROR_CODES],
    ['matches.reason', MATCH_REASONS],
  ])('has a %s key for every value', (prefix, values) => {
    for (const lang of [en, nb]) {
      for (const value of values) {
        expect(lookup(lang, `${prefix}.${value}`), `${prefix}.${value}`).toEqual(
          expect.any(String),
        );
      }
    }
  });

  it('has a title and a "new" label for every card section', () => {
    for (const lang of [en, nb]) {
      for (const key of [...SECTION_KEYS, 'other']) {
        expect(lookup(lang, `sections.${key}.title`)).toEqual(expect.any(String));
        expect(lookup(lang, `sections.${key}.new`)).toEqual(expect.any(String));
      }
    }
  });

  it('labels every revision field', () => {
    for (const key of Object.values(CUSTOMER_FIELD_LABELS)) {
      expect(lookup(en, key.replace(/^customers\./, '')), key).toEqual(expect.any(String));
    }
  });

  it('adds the module, entity and create-flow keys in every language', () => {
    for (const lang of [globalEn, globalNb]) {
      expect(lookup(lang, 'modules.names.customers')).toEqual(expect.any(String));
      expect(lookup(lang, 'modules.descriptions.customers')).toEqual(expect.any(String));
      expect(lookup(lang, 'modules.entities.customer')).toEqual(expect.any(String));
      expect(lookup(lang, 'modules.entities.customer_contact')).toEqual(expect.any(String));
    }
    expect(lookup(globalNb, 'modules.names.customers')).toBe('Kunder');
    for (const lang of [kitEn, kitNb]) {
      for (const flow of FLOWS) {
        expect(lookup(lang, `flows.customer.${flow}`), flow).toEqual(expect.any(String));
      }
      expect(lookup(lang, 'flows.supplier.to_customer')).toEqual(expect.any(String));
    }
  });
});
