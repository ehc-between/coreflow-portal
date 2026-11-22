import en from '../../../assets/i18n/contacts/en.json';
import nb from '../../../assets/i18n/contacts/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import {
  CONTACT_NEXT_KEYS,
  CONTACT_ROLES,
  CONTACT_SENTENCE_KEYS,
  CONTACT_STATUS_KEYS,
  CONTACT_TABS,
} from './data/contacts.models';

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

describe('contacts i18n', () => {
  it('keeps en/nb at full parity without empty strings or vendor names', () => {
    expectKeyParity(en, nb);
    for (const file of [en, nb]) {
      const all = strings(file);
      expect(all.filter((s) => !s.trim())).toEqual([]);
      expect(all.filter((s) => /claude|anthropic|openai|gpt/i.test(s))).toEqual([]);
    }
  });

  it('has a label for every role, tab, status, next action and sentence', () => {
    const keys = [
      ...CONTACT_ROLES.map((r) => `roles.${r}`),
      ...CONTACT_TABS.map((t) => `tabs.${t}`),
      ...CONTACT_STATUS_KEYS.map((s) => `status.${s}`),
      ...CONTACT_NEXT_KEYS.map((n) => `next.${n}`),
      ...CONTACT_SENTENCE_KEYS.map((s) => `card.sentence.${s}`),
    ];
    for (const file of [en, nb]) {
      expect(keys.filter((k) => typeof lookup(file, k) !== 'string')).toEqual([]);
    }
  });

  it('uses the prototype wording in nb', () => {
    expect(nb.title).toBe('Kontakter');
    expect(nb.intro).toContain('Én bedrift er ett kort');
    expect(nb.new.label).toBe('Ny kontakt');
    expect(nb.status.missing_dpa).toBe('Mangler avtale');
    expect(nb.card.personalData.title).toBe('Personopplysninger de behandler');
  });
});
