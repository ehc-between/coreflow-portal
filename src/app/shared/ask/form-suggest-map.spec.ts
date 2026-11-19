import { SuggestedField } from '../../core/ai/form-suggest-api';
import { emptyDraft } from '../../features/context/form/context-draft';
import {
  contextSuggestPatch,
  contextSuggestValues,
} from '../../features/context/form/context-suggest';
import { privacySuggestPatch, privacySuggestValues } from '../../features/privacy/privacy-suggest';
import { REGISTERS } from '../../features/privacy/data/privacy-registers';
import { processSuggestPatch } from '../../features/processes/form/process-suggest';
import { AcceptedSuggestion } from './form-suggest';
import { SuggestFieldSpec, suggestDefs, suggestPatch, suggestValues } from './form-suggest-map';

function field(name: string, value: unknown, display: SuggestedField['display'] = null) {
  return { name, value, rationale: null, changed: true, display };
}

function accepted(...fields: SuggestedField[]): AcceptedSuggestion {
  return Object.fromEntries(fields.map((f) => [f.name, f]));
}

const SPECS: readonly SuggestFieldSpec[] = [
  { name: 'title', labelKey: 't', type: 'text' },
  { name: 'kind', labelKey: 'k', type: 'enum', options: ['a', 'b'], enumPrefix: 'x.kinds.' },
  { name: 'interval', labelKey: 'i', type: 'int', asString: true, min: 1, max: 60 },
  { name: 'owner_user_id', labelKey: 'o', type: 'ref', draftKey: 'ownerId' },
  { name: 'flag', labelKey: 'f', type: 'bool' },
];

describe('form suggest mapping', () => {
  it('patches only valid values, under the form key', () => {
    const patch = suggestPatch(
      SPECS,
      accepted(
        field('title', 'Kvalitetsmål 2027'),
        field('kind', 'zzz'),
        field('interval', 99),
        field('owner_user_id', 'u-1', 'Kari'),
        field('flag', true),
      ),
    );
    expect(patch).toEqual({ title: 'Kvalitetsmål 2027', ownerId: 'u-1', flag: true });
    const ok = suggestPatch(SPECS, accepted(field('interval', 12), field('kind', 'b')));
    expect(ok).toEqual({ interval: '12', kind: 'b' });
  });

  it('reads current values by server name and previews enums and picks', () => {
    expect(
      suggestValues(SPECS, { title: 'T', kind: 'a', interval: '', ownerId: '', flag: false }),
    ).toEqual({ title: 'T', kind: 'a', interval: null, owner_user_id: null, flag: false });
    const defs = suggestDefs(SPECS, (key) => `<${key}>`);
    const kind = defs.find((d) => d.name === 'kind')!;
    expect(kind.format!('b', field('kind', 'b'))).toBe('<x.kinds.b>');
    const owner = defs.find((d) => d.name === 'owner_user_id')!;
    expect(owner.format!('u-1', field('owner_user_id', 'u-1', 'Kari'))).toBe('Kari');
  });

  it('maps a suggested RACI onto the responsibility draft (exactly the server rows)', () => {
    const draft = { ...emptyDraft(), title: 'Handling information security incidents' };
    expect(contextSuggestValues('responsibility', draft)['assignments']).toEqual([]);
    const patch = contextSuggestPatch(
      'responsibility',
      accepted(
        field('process_id', 'p-1', 'Hendelseshåndtering'),
        field(
          'assignments',
          [
            { assignee: 'user:u-1', raci: 'A' },
            { assignee: 'department:d-1', raci: 'R' },
            { assignee: 'bogus', raci: 'C' },
          ],
          ['Kari Nordmann - A', 'IT - R', 'x - C'],
        ),
      ),
      draft,
    );
    expect(patch.process).toEqual({ id: 'p-1', title: 'Hendelseshåndtering', code: null });
    expect(patch.area).toBe('');
    expect(patch.assignments).toEqual([
      { type: 'user', value: 'u-1', raci: 'A', name: 'Kari Nordmann' },
      { type: 'department', value: 'd-1', raci: 'R', name: 'IT' },
    ]);
  });

  it('keeps only analysis items of the chosen method', () => {
    const patch = contextSuggestPatch(
      'analysis',
      accepted(
        field('items', [
          { category: 'strength', text: 'Erfarne folk', impact: 'high' },
          { category: 'political', text: 'Nye krav', impact: 'low' },
        ]),
      ),
      emptyDraft(),
    );
    expect(patch.items?.map((i) => i.text)).toEqual(['Erfarne folk']);
  });

  it('maps process KPIs and turtle lists', () => {
    const patch = processSuggestPatch(
      accepted(
        field('inputs', ['Bestilling', 3]),
        field('kpis', [{ name: 'Leveringspresisjon', target: '95', unit: '%' }, { x: 1 }]),
        field('review_interval_months', 12),
      ),
    );
    expect(patch.inputs).toEqual(['Bestilling']);
    expect(patch.kpis).toEqual([{ name: 'Leveringspresisjon', target: '95', unit: '%' }]);
    expect(patch.review_interval_months).toBe('12');
  });

  it('maps the DPIA screening between checks and the true keys', () => {
    const dpia = REGISTERS.dpia;
    expect(
      privacySuggestValues(dpia, { screening: { large_scale: true, sensitive_data: false } })[
        'screening'
      ],
    ).toEqual(['large_scale']);
    const patch = privacySuggestPatch(
      dpia,
      accepted(
        field('screening', ['large_scale', 'sensitive_data']),
        field('residual_risk', 'nope'),
        field('owner_user_id', 'u-1', 'Kari'),
      ),
    );
    expect(patch).toEqual({
      screening: { large_scale: true, sensitive_data: true },
      owner_user_id: 'u-1',
    });
  });
});
