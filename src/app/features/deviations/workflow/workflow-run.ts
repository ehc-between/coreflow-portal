import { UpdateDeviationRequest } from '../../../core/deviations/deviation.models';
import { FieldSpec } from '../../../core/records/record.models';
import { ROOT_CAUSE_METHOD_OPTIONS, SEVERITY_OPTIONS, SOURCE_OPTIONS } from '../deviation-enums';

/**
 * Core deviation columns a workflow may name in `required_fields` (next to the
 * record type's own data fields). They are saved as top-level deviation fields,
 * not inside `data` (coreflow-core `CORE_DATA_FIELDS`).
 */
export const CORE_FIELD_KEYS = [
  'title',
  'severity',
  'source',
  'owner_user_id',
  'department_id',
  'due_at',
  'root_cause',
  'root_cause_method',
] as const;

export type CoreFieldKey = (typeof CORE_FIELD_KEYS)[number];

export function isCoreField(key: string): key is CoreFieldKey {
  return (CORE_FIELD_KEYS as readonly string[]).includes(key);
}

/** Translate function shape (key + params -> text). */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * Field specs for the core columns, so a missing required core field can be
 * filled in place with the shared dynamic form. Labels are already translated.
 */
export function coreFieldSpecs(t: Translate): readonly FieldSpec[] {
  const options = (values: readonly string[], prefix: string) =>
    values.map((value) => ({ value, label: t(`${prefix}.${value}`) }));
  return [
    { key: 'title', label: t('deviations.create.fields.title'), type: 'text' },
    {
      key: 'severity',
      label: t('deviations.create.fields.severity'),
      type: 'select',
      options: options(SEVERITY_OPTIONS, 'deviations.severity'),
    },
    {
      key: 'source',
      label: t('deviations.create.fields.source'),
      type: 'select',
      options: options(SOURCE_OPTIONS, 'deviations.source'),
    },
    { key: 'owner_user_id', label: t('deviations.detail.owner'), type: 'user' },
    { key: 'department_id', label: t('deviations.create.fields.department'), type: 'department' },
    { key: 'due_at', label: t('deviations.create.fields.due'), type: 'date' },
    { key: 'root_cause', label: t('deviations.create.fields.rootCause'), type: 'textarea' },
    {
      key: 'root_cause_method',
      label: t('deviations.create.fields.rootCauseMethod'),
      type: 'select',
      options: options(ROOT_CAUSE_METHOD_OPTIONS, 'deviations.rootCauseMethod'),
    },
  ];
}

/**
 * The specs of the fields a transition still needs: the record type's own field
 * when it defines the key (a record type may override a core key), else the core
 * spec. Unknown keys are dropped (the caller lists them as text instead).
 */
export function missingFieldSpecs(
  missing: readonly string[],
  recordFields: readonly FieldSpec[],
  coreSpecs: readonly FieldSpec[],
): readonly FieldSpec[] {
  const out: FieldSpec[] = [];
  for (const key of missing) {
    const spec =
      recordFields.find((field) => field.key === key) ??
      coreSpecs.find((field) => field.key === key);
    if (spec) {
      out.push({ ...spec, required: true, visible_if: null });
    }
  }
  return out;
}

/** Missing keys with no field definition to render (shown as a plain list). */
export function unrenderableFields(
  missing: readonly string[],
  specs: readonly FieldSpec[],
): readonly string[] {
  const known = new Set(specs.map((spec) => spec.key));
  return missing.filter((key) => !known.has(key));
}

/**
 * The deviation patch that stores values entered for missing fields before a
 * transition runs (the transition endpoint reads the saved record). Keys the
 * record type defines go into `data` (merged over the current data); other core
 * keys are top-level columns. Empty values are skipped. Null when nothing to save.
 */
export function missingFieldsPatch(
  values: Readonly<Record<string, unknown>>,
  currentData: Readonly<Record<string, unknown>>,
  recordFields: readonly FieldSpec[],
): UpdateDeviationRequest | null {
  const recordKeys = new Set(recordFields.map((field) => field.key));
  const patch: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    if (recordKeys.has(key) || !isCoreField(key)) {
      data[key] = value;
    } else {
      patch[key] = typeof value === 'string' ? value.trim() : value;
    }
  }
  if (Object.keys(data).length) {
    patch['data'] = { ...currentData, ...data };
  }
  return Object.keys(patch).length ? (patch as UpdateDeviationRequest) : null;
}
