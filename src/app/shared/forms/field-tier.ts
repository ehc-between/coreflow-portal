import { localize } from '../../core/records/localized';
import { FieldSpec, FieldTier, LayoutSection, RecordData } from '../../core/records/record.models';
import { isEmptyValue, isVisible, resolveSections } from '../records/form-model';

/**
 * Field tiers (U31, mirrors coreflow-core `FieldTier`): `quick` is on the quick
 * create (3-5 fields), `audit_relevant` on the full form's first screen and in the
 * record's "Fullfør posten" checklist, `advanced` folded under "Flere felt".
 */
export type { FieldTier };

/** A field's effective tier: unset counts as `audit_relevant`; a required field is never folded. */
export function fieldTier(field: Pick<FieldSpec, 'tier' | 'required'>): FieldTier {
  const tier = field.tier ?? 'audit_relevant';
  return tier === 'advanced' && field.required ? 'audit_relevant' : tier;
}

/** Whether the full form folds the field under "Flere felt". */
export function isAdvanced(field: Pick<FieldSpec, 'tier' | 'required'>): boolean {
  return fieldTier(field) === 'advanced';
}

/** Whether a checklist item counts as filled in (a checkbox answered "no" counts too). */
export function isFilled(value: unknown, type?: string): boolean {
  if (type === 'checkbox') {
    return value === true || value === false;
  }
  return !isEmptyValue(value);
}

/** One line of the "Fullfør posten" checklist. */
export interface CompleteItem {
  readonly key: string;
  /** i18n key of the label, or `label` as plain (already localized) text. */
  readonly labelKey?: string;
  readonly label?: string;
  readonly done: boolean;
}

/** One section of the checklist, with why it matters. */
export interface CompleteGroup {
  readonly key: string;
  readonly titleKey?: string;
  readonly title?: string;
  readonly reasonKey: string;
  readonly items: readonly CompleteItem[];
}

/**
 * Checklist groups for a record type's fields: one per layout section, with the
 * `quick` and `audit_relevant` fields that apply to the data (`visible_if`).
 * Advanced and calculated fields are left out; empty sections are dropped.
 */
export function fieldSpecGroups(
  fields: readonly FieldSpec[],
  layout: readonly LayoutSection[] | null | undefined,
  data: RecordData,
  lang: string,
): CompleteGroup[] {
  const groups: CompleteGroup[] = [];
  for (const section of resolveSections(fields, layout)) {
    const asked = section.fields.filter(
      (field) => field.type !== 'calculated' && !isAdvanced(field) && isVisible(field, data),
    );
    if (asked.length === 0) {
      continue;
    }
    const title = section.label ? localize(section.label, lang) : '';
    groups.push({
      key: section.key,
      title: title || undefined,
      titleKey: title ? undefined : 'forms.complete.otherSection',
      reasonKey: asked.some((field) => fieldTier(field) === 'audit_relevant')
        ? 'forms.complete.reason.audit'
        : 'forms.complete.reason.quick',
      items: asked.map((field) => ({
        key: field.key,
        label: localize(field.label, lang),
        done: isFilled(data[field.key], field.type),
      })),
    });
  }
  return groups;
}
