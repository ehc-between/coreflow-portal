import { FieldSpec } from '../../core/records/record.models';
import {
  clientErrors,
  dataErrorKey,
  defaultData,
  isVisible,
  optionList,
  resolveSections,
  withCalculated,
} from './form-model';

const f = (key: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label: key,
  type: 'text',
  ...extra,
});

describe('form model', () => {
  it('follows the layout and appends fields it leaves out', () => {
    const sections = resolveSections(
      [f('a'), f('b'), f('c')],
      [{ key: 'main', label: 'Main', fields: ['b', 'a', 'zzz'], columns: 2 }],
    );
    expect(sections.map((s) => s.key)).toEqual(['main', '__other']);
    expect(sections[0].fields.map((x) => x.key)).toEqual(['b', 'a']);
    expect(sections[0].columns).toBe(2);
    expect(sections[1].fields.map((x) => x.key)).toEqual(['c']);
  });

  it('derives sections from field hints without a layout', () => {
    const sections = resolveSections(
      [f('a'), f('b', { section: 'Risk', width: 'half' }), f('c')],
      [],
    );
    expect(sections.map((s) => [s.key, s.fields.length, s.columns])).toEqual([
      ['details', 2, 1],
      ['Risk', 1, 2],
    ]);
  });

  it('evaluates visible_if for scalars and lists', () => {
    const field = f('x', { visible_if: { field: 'kind', equals: 'incident' } });
    expect(isVisible(field, { kind: 'incident' })).toBe(true);
    expect(isVisible(field, { kind: 'other' })).toBe(false);
    expect(isVisible(field, { kind: ['incident', 'other'] })).toBe(true);
    expect(isVisible(f('y'), {})).toBe(true);
  });

  it('localizes option labels', () => {
    const field = f('s', {
      type: 'select',
      options: ['plain', { value: 'v', label: { en: 'Value', nb: 'Verdi' } }],
    });
    expect(optionList(field, 'nb')).toEqual([
      { value: 'plain', label: 'plain' },
      { value: 'v', label: 'Verdi' },
    ]);
  });

  it('computes calculated fields', () => {
    const fields = [
      f('l', { type: 'number' }),
      f('c', { type: 'number' }),
      f('score', { type: 'calculated', formula: 'l * c' }),
    ];
    expect(withCalculated(fields, { l: 2, c: 5 })['score']).toBe(10);
    expect(withCalculated(fields, { l: 2 })['score']).toBeNull();
  });

  it('flags required, ranges, and skips hidden and calculated fields', () => {
    const fields = [
      f('name', { required: true }),
      f('n', { type: 'number', min: 1, max: 5 }),
      f('t', { max: 3 }),
      f('hidden', { required: true, visible_if: { field: 'name', equals: 'x' } }),
      f('ok', { type: 'checkbox', required: true }),
      f('calc', { type: 'calculated', formula: '1', required: true }),
    ];
    expect(clientErrors(fields, { n: 9, t: 'abcd', ok: false })).toEqual({
      name: 'required',
      n: 'too_large',
      t: 'too_large',
      ok: 'required',
    });
  });

  it('maps error codes and reads defaults', () => {
    expect(dataErrorKey('required')).toBe('records.form.errors.required');
    expect(dataErrorKey('weird')).toBe('records.form.errors.invalid_type');
    expect(
      defaultData([f('a', { default: 'x' }), f('b'), f('c', { type: 'calculated', default: 1 })]),
    ).toEqual({
      a: 'x',
    });
  });
});
