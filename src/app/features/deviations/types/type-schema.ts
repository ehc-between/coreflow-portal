import { FieldDef, FieldType } from '../../../core/deviations/deviation.models';
import { fieldTypeHasOptions } from '../deviation-enums';

/** A draft schema field row in the type editor (mutable, pre-validation). */
export interface DraftField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  help: string;
  placeholder: string;
}

/** Per-field validation messages, keyed by the field's draft id (its index). */
export interface FieldErrors {
  readonly key?: string;
  readonly label?: string;
  readonly options?: string;
}

/** Validation outcome for a whole type form. */
export interface TypeValidation {
  readonly valid: boolean;
  /** i18n key for the type-level error (name/prefix), or null. */
  readonly nameError: string | null;
  readonly prefixError: string | null;
  /** Per-field errors, parallel to the field rows. */
  readonly fields: readonly FieldErrors[];
}

/**
 * Lower-cased, hyphen-separated slug derived from free text — used to
 * auto-suggest a type `key` from its name and a field `key` from its label.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A fresh, empty draft field (added when the user inserts a row). */
export function emptyDraftField(): DraftField {
  return {
    key: '',
    label: '',
    type: 'text',
    required: false,
    options: [],
    help: '',
    placeholder: '',
  };
}

/** Maps a stored `FieldDef` into an editable draft row. */
export function toDraftField(def: FieldDef): DraftField {
  return {
    key: def.key,
    label: def.label,
    type: def.type,
    required: def.required,
    options: [...(def.options ?? [])],
    help: def.help ?? '',
    placeholder: def.placeholder ?? '',
  };
}

/** Serialises a draft row into the `FieldDef` the API expects. */
export function toFieldDef(draft: DraftField): FieldDef {
  const base = {
    key: draft.key.trim(),
    label: draft.label.trim(),
    type: draft.type,
    required: draft.required,
  };
  const help = draft.help.trim();
  const placeholder = draft.placeholder.trim();
  return {
    ...base,
    ...(fieldTypeHasOptions(draft.type)
      ? { options: draft.options.map((o) => o.trim()).filter((o) => o !== '') }
      : {}),
    ...(help ? { help } : {}),
    ...(placeholder ? { placeholder } : {}),
  };
}

/**
 * Validates the type form: name + code_prefix must be present; every field
 * needs a key and label; keys must be unique within the type; select /
 * multiselect fields need at least one non-empty option. Pure — returns the
 * structured result so the component can render messages and gate save.
 */
export function validateType(
  name: string,
  codePrefix: string,
  fields: readonly DraftField[],
): TypeValidation {
  const nameError = name.trim() === '' ? 'deviations.types.editor.errors.nameRequired' : null;
  const prefixError =
    codePrefix.trim() === '' ? 'deviations.types.editor.errors.prefixRequired' : null;

  const seen = new Set<string>();
  const fieldErrors: FieldErrors[] = fields.map((field) => {
    const errors: { key?: string; label?: string; options?: string } = {};
    const key = field.key.trim();
    if (key === '') {
      errors.key = 'deviations.types.editor.errors.fieldKeyRequired';
    } else if (seen.has(key)) {
      errors.key = 'deviations.types.editor.errors.fieldKeyDuplicate';
    }
    if (key !== '') {
      seen.add(key);
    }
    if (field.label.trim() === '') {
      errors.label = 'deviations.types.editor.errors.fieldLabelRequired';
    }
    if (
      fieldTypeHasOptions(field.type) &&
      field.options.filter((o) => o.trim() !== '').length === 0
    ) {
      errors.options = 'deviations.types.editor.errors.fieldOptionsRequired';
    }
    return errors;
  });

  const valid =
    nameError === null &&
    prefixError === null &&
    fieldErrors.every((e) => !e.key && !e.label && !e.options);

  return { valid, nameError, prefixError, fields: fieldErrors };
}
