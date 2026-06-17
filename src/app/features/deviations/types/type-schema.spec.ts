import { emptyDraftField, slugify, toFieldDef, validateType } from './type-schema';

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
    });
  });

  it('omits options for non-option field types', () => {
    const draft = { ...emptyDraftField(), key: 'note', label: 'Note', type: 'text' as const };
    expect(toFieldDef(draft)).toEqual({
      key: 'note',
      label: 'Note',
      type: 'text',
      required: false,
    });
  });
});
