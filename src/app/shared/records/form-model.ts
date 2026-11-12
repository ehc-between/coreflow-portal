import { evaluateFormula } from '../../core/records/formula';
import { localize } from '../../core/records/localized';
import {
  DATA_ERROR_CODES,
  FieldSpec,
  LayoutSection,
  LocalizedText,
  RecordData,
} from '../../core/records/record.models';

/** A section resolved for rendering: its fields in order. */
export interface ResolvedSection {
  readonly key: string;
  readonly label: LocalizedText | null;
  readonly columns: 1 | 2;
  readonly fields: readonly FieldSpec[];
}

/** A pickable id + name (an org member, a department, an attachment). */
export interface PickOption {
  readonly id: string;
  readonly name: string;
}

/** A select option ready for display. */
export interface DisplayOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The sections to render. With a layout: its sections in order, plus a trailing
 * section for any field the layout leaves out (so nothing is ever hidden by
 * mistake). Without one: one section per distinct `section` hint, in field
 * order (the backend's `default_layout`).
 */
export function resolveSections(
  fields: readonly FieldSpec[],
  layout: readonly LayoutSection[] | null | undefined,
): ResolvedSection[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  if (layout && layout.length > 0) {
    const placed = new Set<string>();
    const sections: ResolvedSection[] = layout.map((section) => {
      const sectionFields = section.fields
        .map((key) => byKey.get(key))
        .filter((field): field is FieldSpec => !!field && !placed.has(field.key));
      sectionFields.forEach((field) => placed.add(field.key));
      return {
        key: section.key,
        label: section.label ?? null,
        columns: section.columns === 2 ? 2 : 1,
        fields: sectionFields,
      };
    });
    const rest = fields.filter((field) => !placed.has(field.key));
    if (rest.length > 0) {
      sections.push({ key: '__other', label: null, columns: 1, fields: rest });
    }
    return sections.filter((section) => section.fields.length > 0);
  }
  const sections = new Map<string, { label: string; columns: 1 | 2; fields: FieldSpec[] }>();
  for (const field of fields) {
    const label = field.section || 'details';
    const entry = sections.get(label) ?? { label, columns: 1 as 1 | 2, fields: [] };
    entry.fields.push(field);
    if (field.width === 'half') {
      entry.columns = 2;
    }
    sections.set(label, entry);
  }
  return [...sections.entries()].map(([key, entry]) => ({
    key,
    label: entry.label === 'details' ? null : entry.label,
    columns: entry.columns,
    fields: entry.fields,
  }));
}

/** Whether a field is shown for the current data (`visible_if`). */
export function isVisible(field: FieldSpec, data: RecordData): boolean {
  const cond = field.visible_if;
  if (!cond) {
    return true;
  }
  const actual = data[cond.field];
  if (Array.isArray(actual)) {
    return actual.includes(cond.equals);
  }
  return actual === cond.equals;
}

/** A select / multiselect field's options with display labels. */
export function optionList(field: FieldSpec, lang: string): DisplayOption[] {
  return (field.options ?? []).map((option) =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value, label: localize(option.label, lang) || option.value },
  );
}

/** Whether a value counts as empty (the backend's `_is_empty`). */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0)
  );
}

/** Data with every calculated field (re)computed for a live preview. */
export function withCalculated(
  fields: readonly FieldSpec[],
  data: RecordData,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const field of fields) {
    if (field.type === 'calculated' && field.formula) {
      out[field.key] = evaluateFormula(field.formula, out);
    }
  }
  return out;
}

/**
 * Client-side hints before a save: `required` for empty visible required fields,
 * `too_small` / `too_large` for numbers and text lengths. The server still
 * validates everything (and its codes win).
 */
export function clientErrors(
  fields: readonly FieldSpec[],
  data: RecordData,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === 'calculated' || !isVisible(field, data)) {
      continue;
    }
    const value = data[field.key];
    if (isEmptyValue(value) || (field.type === 'checkbox' && field.required && value !== true)) {
      if (field.required) {
        errors[field.key] = 'required';
      }
      continue;
    }
    const measure =
      field.type === 'number' && typeof value === 'number'
        ? value
        : typeof value === 'string' && ['text', 'textarea', 'richtext'].includes(field.type)
          ? value.length
          : null;
    if (measure !== null) {
      if (field.min !== null && field.min !== undefined && measure < field.min) {
        errors[field.key] = 'too_small';
      } else if (field.max !== null && field.max !== undefined && measure > field.max) {
        errors[field.key] = 'too_large';
      }
    }
  }
  return errors;
}

/** i18n key for a per-field validation code (unknown codes fall back to `invalid_type`). */
export function dataErrorKey(code: string): string {
  return (DATA_ERROR_CODES as readonly string[]).includes(code)
    ? `records.form.errors.${code}`
    : 'records.form.errors.invalid_type';
}

/** Initial data for a new record: each field's `default`, when set. */
export function defaultData(fields: readonly FieldSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined && field.default !== null && field.type !== 'calculated') {
      out[field.key] = field.default;
    }
  }
  return out;
}
