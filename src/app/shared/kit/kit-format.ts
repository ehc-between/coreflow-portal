import { humanize } from '../../core/kit/entity-types.service';
import { LINK_TYPES } from '../../core/kit/kit.models';

/** How a snapshot / audit value is shown: a single line, or a pre-formatted block. */
export interface DisplayValue {
  readonly text: string;
  /** Multi-line or structured content (render with `whitespace-pre-wrap`). */
  readonly block: boolean;
  /** Null / empty string / empty list: render the translated "(empty)" label. */
  readonly empty: boolean;
}

/**
 * Format a value from a revision snapshot or an audit change for display.
 * Booleans become the given yes/no words, lists are comma-joined when flat,
 * objects are pretty-printed JSON.
 */
export function displayValue(value: unknown, yes = 'Yes', no = 'No'): DisplayValue {
  if (value === null || value === undefined || value === '') {
    return { text: '', block: false, empty: true };
  }
  if (typeof value === 'boolean') {
    return { text: value ? yes : no, block: false, empty: false };
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return { text: String(value), block: false, empty: false };
  }
  if (typeof value === 'string') {
    return { text: value, block: value.includes('\n') || value.length > 120, empty: false };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { text: '', block: false, empty: true };
    }
    if (value.every((v) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) {
      return { text: value.map((v) => String(v ?? '')).join(', '), block: false, empty: false };
    }
  }
  try {
    return { text: JSON.stringify(value, null, 2), block: true, empty: false };
  } catch {
    return { text: String(value), block: false, empty: false };
  }
}

/** A short single-line rendering, for inline "before → after" texts. */
export function inlineValue(value: unknown, empty: string, yes = 'Yes', no = 'No'): string {
  const shown = displayValue(value, yes, no);
  if (shown.empty) {
    return empty;
  }
  const text = shown.text.replace(/\s+/g, ' ');
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/**
 * Field label: the caller's i18n key for the field (translated by `translate`)
 * when given and translated, else the humanized field name.
 */
export function fieldLabel(
  field: string,
  labels: Readonly<Record<string, string>> | null | undefined,
  translate: (key: string) => string,
): string {
  const key = labels?.[field];
  if (key) {
    const text = translate(key);
    if (text && text !== key) {
      return text;
    }
  }
  return humanize(field);
}

/**
 * `kit` i18n key of a link type's wording: its `name`, or its label seen from
 * the source (`outgoing`) or the target (`incoming`). Unknown types (added by a
 * newer backend) use the generic "Linked" wording.
 */
export function linkTypeKey(type: string, form: 'name' | 'outgoing' | 'incoming'): string {
  const known = (LINK_TYPES as readonly string[]).includes(type) ? type : 'other';
  return `kit.linkTypes.${known}.${form}`;
}
