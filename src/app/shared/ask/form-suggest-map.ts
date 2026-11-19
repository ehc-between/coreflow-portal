import { SuggestedField } from '../../core/ai/form-suggest-api';
import { AcceptedSuggestion, FormSuggestFieldDef } from './form-suggest';

/** Translate in the host's scope (`LanguageService.translate`). */
export type SuggestTranslate = (key: string, params?: Record<string, unknown>) => string;

/**
 * How one form field maps to the server's suggestion (`<app-form-suggest>`):
 *
 * - `text` / `long` (long text: preview as markdown, "Skriv om" is offered);
 * - `enum` / `multi` (validated against `options`; previewed as `enumPrefix + value`);
 * - `bool`, `int` (`asString` for forms that keep numbers as text);
 * - `ref` / `refs`: picked record ids (previewed with the server's `display`);
 * - `items`: a list of small records (RACI rows, questions); the host converts them.
 *
 * `draftKey` is the form's own property when it differs from the server name.
 */
export interface SuggestFieldSpec {
  readonly name: string;
  readonly labelKey: string;
  readonly type: 'text' | 'long' | 'enum' | 'multi' | 'bool' | 'int' | 'ref' | 'refs' | 'items';
  readonly draftKey?: string;
  readonly options?: readonly string[];
  readonly enumPrefix?: string;
  /** Appended to `enumPrefix + value` (e.g. `.label`). */
  readonly enumSuffix?: string;
  readonly asString?: boolean;
  readonly min?: number;
  readonly max?: number;
}

/** The field definitions `<app-form-suggest [fields]>` takes. */
export function suggestDefs(
  specs: readonly SuggestFieldSpec[],
  t: SuggestTranslate,
): readonly FormSuggestFieldDef[] {
  return specs.map((spec) => ({
    name: spec.name,
    labelKey: spec.labelKey,
    long: spec.type === 'long',
    format: formatter(spec, t),
  }));
}

/** Only the long text fields, for the per-field "Skriv om". */
export function longDefs(
  specs: readonly SuggestFieldSpec[],
  t: SuggestTranslate,
  names: readonly string[],
): readonly FormSuggestFieldDef[] {
  return suggestDefs(
    specs.filter((spec) => names.includes(spec.name)),
    t,
  );
}

function formatter(
  spec: SuggestFieldSpec,
  t: SuggestTranslate,
): ((value: unknown, field: SuggestedField) => string) | undefined {
  const label = (value: unknown): string =>
    spec.enumPrefix
      ? t(`${spec.enumPrefix}${String(value)}${spec.enumSuffix ?? ''}`)
      : String(value);
  switch (spec.type) {
    case 'enum':
      return (value) => (value === null || value === undefined || value === '' ? '' : label(value));
    case 'multi':
      return (value) => (Array.isArray(value) ? value.map(label).join(', ') : '');
    case 'bool':
      return (value) => t(value ? 'ask.formSuggest.yes' : 'ask.formSuggest.no');
    case 'ref':
      return (value, field) =>
        typeof field.display === 'string' ? field.display : value ? '…' : '';
    case 'refs':
    case 'items':
      return (value, field) =>
        Array.isArray(field.display)
          ? field.display.join(spec.type === 'items' ? ' · ' : ', ')
          : Array.isArray(value)
            ? value.every((v) => typeof v === 'string')
              ? value.join(spec.type === 'items' ? ' · ' : ', ')
              : String(value.length)
            : '';
    default:
      return undefined;
  }
}

/** One accepted value, validated for its field (undefined: skip it). */
export function acceptedValue(spec: SuggestFieldSpec, field: SuggestedField | undefined): unknown {
  if (!field) {
    return undefined;
  }
  const value = field.value;
  switch (spec.type) {
    case 'text':
    case 'long':
      return typeof value === 'string' ? value : undefined;
    case 'enum':
      return typeof value === 'string' && (!spec.options || spec.options.includes(value))
        ? value
        : undefined;
    case 'multi':
      return Array.isArray(value)
        ? value.filter(
            (v): v is string =>
              typeof v === 'string' && (!spec.options || spec.options.includes(v)),
          )
        : undefined;
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
      }
      if (
        (spec.min !== undefined && value < spec.min) ||
        (spec.max !== undefined && value > spec.max)
      ) {
        return undefined;
      }
      return spec.asString ? String(value) : value;
    }
    case 'ref':
      return typeof value === 'string' ? value : undefined;
    case 'refs':
      return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string')
        : undefined;
    case 'items':
      return Array.isArray(value) ? value : undefined;
  }
}

/**
 * The form change for the accepted suggestions: `{ [draftKey ?? name]: value }` for
 * every accepted, valid value (`items` and refs that need labels are converted by the
 * host with {@link acceptedValue} / `display`).
 */
export function suggestPatch(
  specs: readonly SuggestFieldSpec[],
  accepted: AcceptedSuggestion,
  skip: readonly string[] = [],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const spec of specs) {
    if (skip.includes(spec.name)) {
      continue;
    }
    const value = acceptedValue(spec, accepted[spec.name]);
    if (value !== undefined) {
      patch[spec.draftKey ?? spec.name] = value;
    }
  }
  return patch;
}

/** The label the server gave a picked record (`ref`), or the id. */
export function displayOf(field: SuggestedField | undefined, index?: number): string {
  if (!field) {
    return '';
  }
  const display = field.display;
  if (index !== undefined) {
    return Array.isArray(display) ? String(display[index] ?? '') : '';
  }
  return typeof display === 'string' ? display : String(field.value ?? '');
}

/** The form's current values by server field name (`draftKey ?? name`). */
export function suggestValues(
  specs: readonly SuggestFieldSpec[],
  draft: object,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const source = draft as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const spec of specs) {
    const raw = source[spec.draftKey ?? spec.name];
    if (spec.type === 'int' && typeof raw === 'string') {
      values[spec.name] = raw.trim() ? Number(raw) : null;
    } else if (spec.type === 'ref' && raw === '') {
      values[spec.name] = null;
    } else {
      values[spec.name] = raw ?? null;
    }
  }
  return { ...values, ...overrides };
}
