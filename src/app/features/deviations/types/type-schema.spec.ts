import {
  DraftSection,
  emptyDraftField,
  flattenSections,
  fromFieldDef,
  groupFieldsIntoSections,
  groupIntoSections,
  slugify,
  toFieldDef,
  validateType,
} from './type-schema';
import { FieldDef } from '../../../core/deviations/deviation.models';

describe('type-schema', () => {
  it('slugifies free text to a lower_snake key', () => {
    expect(slugify('Root Cause')).toBe('root_cause');
    expect(slugify('  Affected Area!! ')).toBe('affected_area');
    expect(slugify('Críticité')).toBe('criticite');
  });

  it('requires a name and a code prefix', () => {
    const result = validateType('', '', []);
    expect(result.valid).toBe(false);
    expect(result.nameError).toBe('deviations.types.editor.errors.nameRequired');
    expect(result.prefixError).toBe('deviations.types.editor.errors.prefixRequired');
  });

  it('passes a minimal valid type with no fields', () => {
    const result = validateType('Nonconformity', 'NC', []);
    expect(result.valid).toBe(true);
    expect(result.nameError).toBeNull();
    expect(result.prefixError).toBeNull();
  });

  it('requires a key and label on every field', () => {
    const field = { ...emptyDraftField() };
    const result = validateType('NC', 'NC', [field]);
    expect(result.valid).toBe(false);
    expect(result.fields[0].key).toBe('deviations.types.editor.errors.fieldKeyRequired');
    expect(result.fields[0].label).toBe('deviations.types.editor.errors.fieldLabelRequired');
  });

  it('flags duplicate field keys', () => {
    const a = { ...emptyDraftField(), key: 'area', label: 'Area' };
    const b = { ...emptyDraftField(), key: 'area', label: 'Area 2' };
    const result = validateType('NC', 'NC', [a, b]);
    expect(result.valid).toBe(false);
    expect(result.fields[0].key).toBeUndefined();
    expect(result.fields[1].key).toBe('deviations.types.editor.errors.fieldKeyDuplicate');
  });

  it('requires at least one option for select / multiselect', () => {
    const select = { ...emptyDraftField(), key: 'sev', label: 'Severity', type: 'select' as const };
    const result = validateType('NC', 'NC', [select]);
    expect(result.fields[0].options).toBe('deviations.types.editor.errors.fieldOptionsRequired');

    const filled = { ...select, options: ['Low', 'High'] };
    expect(validateType('NC', 'NC', [filled]).valid).toBe(true);
  });

  it('serialises a draft into a FieldDef, dropping empty extras', () => {
    const draft = {
      ...emptyDraftField(),
      key: ' area ',
      label: ' Area ',
      type: 'select' as const,
      options: [' Low ', '', 'High'],
      help: '',
      placeholder: ' pick ',
    };
    expect(toFieldDef(draft)).toEqual({
      key: 'area',
      label: 'Area',
      type: 'select',
      required: false,
      options: ['Low', 'High'],
      placeholder: 'pick',
      width: 'full',
      section: null,
    });
  });

  it('omits options for non-option field types', () => {
    const draft = { ...emptyDraftField(), key: 'note', label: 'Note', type: 'text' as const };
    expect(toFieldDef(draft)).toEqual({
      key: 'note',
      label: 'Note',
      type: 'text',
      required: false,
      width: 'full',
      section: null,
    });
  });

  it('maps a FieldDef into an editable draft with the key marked hand-set', () => {
    const def: FieldDef = {
      key: 'severity',
      label: 'Severity',
      type: 'select',
      required: true,
      options: ['Low', 'High'],
      help: 'Pick one',
      placeholder: 'Choose',
      width: 'full',
    };
    expect(fromFieldDef(def)).toEqual({
      key: 'severity',
      label: 'Severity',
      type: 'select',
      required: true,
      options: ['Low', 'High'],
      help: 'Pick one',
      placeholder: 'Choose',
      width: 'full',
      section: null,
      keyTouched: true,
    });
  });

  it('round-trips a FieldDef through fromFieldDef and toFieldDef', () => {
    const def: FieldDef = {
      key: 'area',
      label: 'Affected area',
      type: 'multiselect',
      required: false,
      options: ['Plant A', 'Plant B'],
      help: 'Where it happened',
      width: 'half',
      section: 'Context',
    };
    expect(toFieldDef(fromFieldDef(def))).toEqual(def);
  });

  it('fromFieldDef defaults a width/section absent from backend data', () => {
    // Stored types predating layout may omit width/section; default defensively.
    const def = { key: 'note', label: 'Note', type: 'text', required: false } as FieldDef;
    const draft = fromFieldDef(def);
    expect(draft.width).toBe('full');
    expect(draft.section).toBeNull();
  });

  it('fromFieldDef defaults missing options/help/placeholder', () => {
    const def: FieldDef = {
      key: 'note',
      label: 'Note',
      type: 'text',
      required: false,
      width: 'full',
    };
    const draft = fromFieldDef(def);
    expect(draft.options).toEqual([]);
    expect(draft.help).toBe('');
    expect(draft.placeholder).toBe('');
    expect(toFieldDef(draft)).toEqual({ ...def, section: null });
  });

  it('carries width and section through to/from a FieldDef', () => {
    const def: FieldDef = {
      key: 'sev',
      label: 'Severity',
      type: 'select',
      required: true,
      options: ['Low', 'High'],
      width: 'half',
      section: 'Assessment',
    };
    const draft = fromFieldDef(def);
    expect(draft.width).toBe('half');
    expect(draft.section).toBe('Assessment');
    expect(toFieldDef(draft)).toEqual(def);
  });

  it('groups fields into sections in list order, default section first', () => {
    const a = {
      ...fromFieldDef({ key: 'a', label: 'A', type: 'text', required: false, width: 'full' }),
    };
    const b = {
      ...fromFieldDef({
        key: 'b',
        label: 'B',
        type: 'text',
        required: false,
        width: 'full',
        section: 'Context',
      }),
    };
    const c = {
      ...fromFieldDef({
        key: 'c',
        label: 'C',
        type: 'text',
        required: false,
        width: 'full',
        section: 'Context',
      }),
    };
    const sections = groupIntoSections([a, b, c], 'Details');
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('Details');
    expect(sections[0].fields.map((f) => f.key)).toEqual(['a']);
    expect(sections[1].title).toBe('Context');
    expect(sections[1].fields.map((f) => f.key)).toEqual(['b', 'c']);
  });

  it('always yields a default first section even with no ungrouped fields', () => {
    const a = {
      ...fromFieldDef({
        key: 'a',
        label: 'A',
        type: 'text',
        required: false,
        width: 'full',
        section: 'Context',
      }),
    };
    const sections = groupIntoSections([a], 'Details');
    expect(sections[0].title).toBe('Details');
    expect(sections[0].fields).toEqual([]);
    expect(sections[1].title).toBe('Context');
  });

  it('flattens sections back into ordered fields, stamping the section title', () => {
    const sections: DraftSection[] = [
      {
        title: 'Details',
        fields: [
          { ...emptyDraftField(), key: 'a', label: 'A' },
          { ...emptyDraftField(), key: 'b', label: 'B' },
        ],
      },
      { title: 'Context', fields: [{ ...emptyDraftField(), key: 'c', label: 'C' }] },
    ];
    const flat = flattenSections(sections);
    expect(flat.map((f) => [f.key, f.section])).toEqual([
      ['a', null],
      ['b', null],
      ['c', 'Context'],
    ]);
  });

  it('round-trips sectioned fields through group and flatten', () => {
    const fields = [
      { ...fromFieldDef({ key: 'a', label: 'A', type: 'text', required: false, width: 'full' }) },
      {
        ...fromFieldDef({
          key: 'b',
          label: 'B',
          type: 'text',
          required: false,
          width: 'full',
          section: 'Context',
        }),
      },
    ];
    const flat = flattenSections(groupIntoSections(fields, 'Details'));
    expect(flat.map((f) => [f.key, f.section])).toEqual([
      ['a', null],
      ['b', 'Context'],
    ]);
  });

  it('groups stored fields into render sections, flagging the default', () => {
    const fields: FieldDef[] = [
      { key: 'a', label: 'A', type: 'text', required: false, width: 'full' },
      { key: 'b', label: 'B', type: 'text', required: false, width: 'half', section: 'Context' },
      { key: 'c', label: 'C', type: 'text', required: false, width: 'half', section: 'Context' },
    ];
    const sections = groupFieldsIntoSections(fields, 'Details');
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ title: 'Details', isDefault: true });
    expect(sections[0].fields.map((f) => f.key)).toEqual(['a']);
    expect(sections[1]).toMatchObject({ title: 'Context', isDefault: false });
    expect(sections[1].fields.map((f) => f.key)).toEqual(['b', 'c']);
  });

  it('omits the default section when every field is sectioned', () => {
    const fields: FieldDef[] = [
      { key: 'a', label: 'A', type: 'text', required: false, width: 'full', section: 'Context' },
    ];
    const sections = groupFieldsIntoSections(fields, 'Details');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ title: 'Context', isDefault: false });
  });
});
