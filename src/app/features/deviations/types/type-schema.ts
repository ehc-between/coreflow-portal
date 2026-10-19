import { FieldDef, FieldType, FieldWidth } from '../../../core/deviations/deviation.models';
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
  width: FieldWidth;
  /** Section this field belongs to; `null`/empty is the default section. */
  section: string | null;
}

/** A draft field plus editor-only bookkeeping (whether its key was hand-edited). */
export type DraftFieldState = DraftField & { keyTouched?: boolean };

/** A titled group of draft fields in the sectioned builder UI. */
export interface DraftSection {
  /** Display title; empty string is the default (untitled) section. */
  title: string;
  fields: DraftFieldState[];
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
export function emptyDraftField(section: string | null = null): DraftField {
  return {
    key: '',
    label: '',
    type: 'text',
    required: false,
    options: [],
    help: '',
    placeholder: '',
    width: 'full',
    section,
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
    width: def.width ?? 'full',
    section: def.section ?? null,
  };
}

/**
 * Maps a `FieldDef` (e.g. from an AI-drafted schema) into an editor field row,
 * marking the key as hand-set so it isn't re-derived from the label. Round-trip
 * safe with {@link toFieldDef}.
 */
export function fromFieldDef(def: FieldDef): DraftFieldState {
  return { ...toDraftField(def), keyTouched: true };
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
  const section = draft.section?.trim() ?? '';
  return {
    ...base,
    ...(fieldTypeHasOptions(draft.type)
      ? { options: draft.options.map((o) => o.trim()).filter((o) => o !== '') }
      : {}),
    ...(help ? { help } : {}),
    ...(placeholder ? { placeholder } : {}),
    width: draft.width,
    ...(section ? { section } : { section: null }),
  };
}

/**
 * Groups ordered draft fields into sections in list order: a field's `section`
 * starts (or continues) a section keyed by its trimmed title; `null`/empty maps
 * to the default first section, which is always present (given `defaultTitle`)
 * so the builder has somewhere to drop fields. Section order follows first
 * appearance; within a section, fields keep their relative order.
 */
export function groupIntoSections(
  fields: readonly DraftFieldState[],
  defaultTitle: string,
): DraftSection[] {
  const sections: DraftSection[] = [{ title: '', fields: [] }];
  const byTitle = new Map<string, DraftSection>([['', sections[0]]]);
  for (const field of fields) {
    const title = field.section?.trim() ? field.section.trim() : '';
    let section = byTitle.get(title);
    if (!section) {
      section = { title, fields: [] };
      byTitle.set(title, section);
      sections.push(section);
    }
    section.fields.push(field);
  }
  if (sections[0].title === '') {
    sections[0].title = defaultTitle;
  }
  return sections;
}

/** A titled group of stored schema fields, for rendering the deviation form. */
export interface FieldSection {
  /** Display title; the default first section carries `defaultTitle`. */
  readonly title: string;
  /** Whether this is the default (first, originally untitled) section. */
  readonly isDefault: boolean;
  readonly fields: readonly FieldDef[];
}

/**
 * Groups a stored `FieldDef[]` schema into render sections in list order,
 * mirroring {@link groupIntoSections}: a `null`/empty `section` maps to the
 * default first section (flagged `isDefault`), other sections appear in
 * first-appearance order; within a section fields keep their relative order.
 * The default section is only included when it actually holds fields.
 */
export function groupFieldsIntoSections(
  fields: readonly FieldDef[],
  defaultTitle: string,
): FieldSection[] {
  const defaultSection = { title: defaultTitle, isDefault: true, fields: [] as FieldDef[] };
  const sections: { title: string; isDefault: boolean; fields: FieldDef[] }[] = [defaultSection];
  const byTitle = new Map<string, (typeof sections)[number]>([['', defaultSection]]);
  for (const field of fields) {
    const title = field.section?.trim() ? field.section.trim() : '';
    let section = byTitle.get(title);
    if (!section) {
      section = { title, isDefault: false, fields: [] };
      byTitle.set(title, section);
      sections.push(section);
    }
    section.fields.push(field);
  }
  return sections.filter((section) => section.fields.length > 0);
}

/**
 * Flattens sectioned draft fields back into an ordered list, stamping each
 * field with its section's title (the first/default section flattens to
 * `null`). Inverse of {@link groupIntoSections} for save / validation.
 */
export function flattenSections(sections: readonly DraftSection[]): DraftFieldState[] {
  return sections.flatMap((section, index) => {
    const title = index === 0 ? null : section.title.trim() || null;
    return section.fields.map((field) => ({ ...field, section: title }));
  });
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
