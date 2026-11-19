import { SuggestedField } from '../../core/ai/form-suggest-api';
import { AcceptedSuggestion, FormSuggestFieldDef } from '../../shared/ask/form-suggest';
import { SuggestTranslate } from '../../shared/ask/form-suggest-map';
import { FieldDef, FormValues, RegisterDef, fieldLabelKey } from './data/privacy-registers';

/** The privacy registers with a whole-form suggestion (server keys). */
const SUGGEST_KEYS: Readonly<Partial<Record<string, string>>> = {
  ropa: 'privacy.ropa',
  dpia: 'privacy.dpia',
};

/** The field kinds the suggestion fills (dates, countries and links are left to the user). */
const SUGGESTED_KINDS = new Set([
  'text',
  'textarea',
  'select',
  'boolean',
  'tags',
  'owner',
  'department',
  'ref',
  'refs',
  'screening',
  'risks',
]);

export function privacySuggestKey(register: RegisterDef): string | null {
  return SUGGEST_KEYS[register.key] ?? null;
}

function suggested(register: RegisterDef): readonly FieldDef[] {
  return register.fields.filter((f) => SUGGESTED_KINDS.has(f.kind) && !f.editOnly);
}

/** The review panel's field definitions, from the register descriptor. */
export function privacySuggestFields(
  register: RegisterDef,
  t: SuggestTranslate,
): readonly FormSuggestFieldDef[] {
  return suggested(register).map((f) => ({
    name: f.key,
    labelKey: fieldLabelKey(f),
    long: f.kind === 'textarea',
    format: formatter(f, t),
  }));
}

function formatter(
  f: FieldDef,
  t: SuggestTranslate,
): ((value: unknown, field: SuggestedField) => string) | undefined {
  switch (f.kind) {
    case 'select':
      return (value) => (value ? t(`privacy.options.${f.optionSet}.${String(value)}`) : '');
    case 'boolean':
      return (value) => t(value ? 'ask.formSuggest.yes' : 'ask.formSuggest.no');
    case 'screening':
      return (value) =>
        (Array.isArray(value) ? value : [])
          .map((key) => t(`privacy.criteria.${String(key)}.label`))
          .join(', ');
    case 'risks':
      return (value) =>
        (Array.isArray(value) ? value : [])
          .map((r) => String((r as { description?: unknown }).description ?? ''))
          .join(' · ');
    case 'owner':
    case 'department':
    case 'ref':
      return (value, field) => (typeof field.display === 'string' ? field.display : '');
    case 'refs':
      return (value, field) => (Array.isArray(field.display) ? field.display.join(', ') : '');
    default:
      return undefined;
  }
}

/** The form's values as the suggestion's current values (screening as the true keys). */
export function privacySuggestValues(
  register: RegisterDef,
  values: FormValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of suggested(register)) {
    const value = values[f.key];
    if (f.kind === 'screening') {
      const checks = (value ?? {}) as Readonly<Record<string, boolean>>;
      out[f.key] = Object.keys(checks).filter((key) => checks[key]);
    } else {
      out[f.key] = value === '' || value === undefined ? null : value;
    }
  }
  return out;
}

/** The form change for the accepted suggestions (invalid values are skipped). */
export function privacySuggestPatch(
  register: RegisterDef,
  accepted: AcceptedSuggestion,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of suggested(register)) {
    const field = accepted[f.key];
    if (!field) {
      continue;
    }
    const value = field.value;
    switch (f.kind) {
      case 'text':
      case 'textarea':
        if (typeof value === 'string') {
          patch[f.key] = f.maxLength ? value.slice(0, f.maxLength) : value;
        }
        break;
      case 'select':
        if (typeof value === 'string' && (!f.options || f.options.includes(value))) {
          patch[f.key] = value;
        }
        break;
      case 'boolean':
        if (typeof value === 'boolean') {
          patch[f.key] = value;
        }
        break;
      case 'owner':
      case 'department':
      case 'ref':
        if (typeof value === 'string') {
          patch[f.key] = value;
        }
        break;
      case 'tags':
      case 'refs':
        if (Array.isArray(value)) {
          patch[f.key] = value.filter((v): v is string => typeof v === 'string');
        }
        break;
      case 'screening':
        if (Array.isArray(value)) {
          patch[f.key] = Object.fromEntries(value.map((key) => [String(key), true]));
        }
        break;
      case 'risks':
        if (Array.isArray(value)) {
          patch[f.key] = value.filter(
            (r) => !!r && typeof (r as { description?: unknown }).description === 'string',
          );
        }
        break;
    }
  }
  return patch;
}
