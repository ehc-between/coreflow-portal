import starterEn from '../../../assets/i18n/starter/en.json';
import starterNb from '../../../assets/i18n/starter/nb.json';
import { STARTER_PROVIDERS } from '../../features/context/list/context-list';
import { StarterResult, providerI18nKey } from './starter-setup.models';
import {
  groupRows,
  missingRequired,
  parseTags,
  raciHints,
  selectedItems,
  setField,
  setRaciAssignee,
  setRaciLetter,
  toRows,
  updateRow,
} from './starter-setup.state';

function keys(value: unknown, path = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      keys(v, path ? `${path}.${k}` : k),
    );
  }
  return [path];
}

const RESULT: StarterResult = {
  provider: 'context.interested_parties',
  entity_type: 'interested_party',
  mode: 'records',
  group_set: 'party_category',
  title_field: 'name',
  fields: [
    { name: 'name', kind: 'text', options: [], option_set: null, required: true },
    { name: 'needs', kind: 'textarea', options: [], option_set: null, required: false },
  ],
  ai_available: false,
  source: 'template',
  fallback: 'ai_unavailable',
  header: null,
  items: [
    { key: 'i1', group: 'customer', why: 'w', fields: { name: 'Kunder', needs: 'x' } },
    { key: 'i2', group: 'employee', why: '', fields: { name: 'Ansatte' } },
    { key: 'i3', group: 'customer', why: '', fields: { name: 'Offentlige kunder' } },
  ],
  skipped: [],
  context: { industry: null, size_band: null, frameworks: [], sites: 0, registers: {} },
};

describe('starter setup', () => {
  it('has the same keys in en and nb', () => {
    expect(keys(starterNb).sort()).toEqual(keys(starterEn).sort());
  });

  it('has texts for every context provider', () => {
    const providers = (starterEn as { providers: Record<string, unknown> }).providers;
    for (const key of Object.values(STARTER_PROVIDERS)) {
      expect(providers[providerI18nKey(key!)]).toBeTruthy();
    }
  });

  it('has texts and labels for the risk, law, process and objective providers', () => {
    const en = starterEn as unknown as {
      providers: Record<string, Record<string, string>>;
      options: Record<string, Record<string, string>>;
      fields: Record<string, string>;
    };
    for (const key of [
      'risk.risks',
      'obligations.laws',
      'processes.map',
      'objectives.objectives',
    ]) {
      const texts = en.providers[providerI18nKey(key)];
      for (const part of ['title', 'whatTitle', 'intro', 'promptTitle', 'promptBody']) {
        expect(texts?.[part], `${key}.${part}`).toBeTruthy();
      }
    }
    for (const set of ['risk_category', 'likelihood', 'consequence', 'obligation_type']) {
      expect(en.options[set], set).toBeTruthy();
    }
    expect(Object.keys(en.options['obligation_area'])).toHaveLength(7);
    expect(Object.keys(en.options['process_category'])).toEqual(['management', 'core', 'support']);
    for (const field of ['threat', 'likelihood', 'subject', 'requirements', 'purpose', 'target']) {
      expect(en.fields[field], field).toBeTruthy();
    }
  });

  it('starts with every row selected, grouped in first-seen order', () => {
    const rows = toRows(RESULT.items);
    expect(rows.every((r) => r.selected && !r.expanded)).toBe(true);
    expect(groupRows(rows).map((g) => [g.group, g.rows.length])).toEqual([
      ['customer', 2],
      ['employee', 1],
    ]);
  });

  it('sends only the selected (edited) rows and checks required fields', () => {
    let rows = toRows(RESULT.items);
    rows = updateRow(rows, 'i2', (r) => ({ ...r, selected: false }));
    rows = updateRow(rows, 'i1', (r) => setField(r, 'name', 'Bedriftskunder'));
    expect(selectedItems(rows).map((i) => i.fields['name'])).toEqual([
      'Bedriftskunder',
      'Offentlige kunder',
    ]);
    const blank = setField(rows[0], 'name', '  ');
    expect(missingRequired(blank, RESULT)).toEqual(['name']);
    // The original item is not mutated by edits.
    expect(RESULT.items[0].fields['name']).toBe('Kunder');
  });

  it('keeps exactly one A in a RACI row', () => {
    const slots = [
      { type: 'user', value: 'u1', raci: 'A' },
      { type: 'role', value: 'quality', raci: 'R' },
    ] as const;
    const next = setRaciLetter(slots, 1, 'A');
    expect(next.map((s) => s.raci)).toEqual(['R', 'A']);
    expect(raciHints(next)).toEqual([]);
    expect(raciHints([])).toEqual(['no_accountable', 'no_responsible']);
    expect(setRaciAssignee(next, 0, 'department:d-1')[0]).toEqual({
      type: 'department',
      value: 'd-1',
      raci: 'R',
    });
  });

  it('parses one tag per line', () => {
    expect(parseTags(' Oslo (Oslo, NO)\n\n Bergen ')).toEqual(['Oslo (Oslo, NO)', 'Bergen']);
  });
});
