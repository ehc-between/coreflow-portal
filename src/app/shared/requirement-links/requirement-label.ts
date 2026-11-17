import { RequirementLabel, RequirementLink } from '../../core/standards/standards.models';

/**
 * Display helpers for requirements (plan 2.1): a requirement is shown as
 * "<short> · <number>" (e.g. "ISO 9001 · 8.4.1"), with its clause title as
 * subtitle / tooltip and "(krav 2 av 3)" when the clause has several. The raw
 * `.rN` ref is never shown, and the Harmonised Structure is "Felles ISO-krav",
 * never "ISO HS". Pure functions, so they are trivially unit-testable.
 */

/** Short names by framework key; `eu_ai_act` and `hs` are translated (see `shortNameKey`). */
const SHORT_NAMES: Readonly<Record<string, string>> = {
  iso9001: 'ISO 9001',
  iso27001: 'ISO 27001',
  iso14001: 'ISO 14001',
  iso42001: 'ISO 42001',
  iso45001: 'ISO 45001',
  iso19011: 'ISO 19011',
  iso22301: 'ISO 22301',
  gdpr: 'GDPR',
  nis2: 'NIS2',
};

/** Frameworks whose short name differs per language (`standards.reqs.short.<key>`). */
const TRANSLATED_SHORT = new Set(['eu_ai_act', 'hs']);

/**
 * Framework key of a catalogue standard key: `iso27001-2022` -> `iso27001`,
 * `eu-ai-act-2024` -> `eu_ai_act`, `gdpr-2016` -> `gdpr`. A bare framework key
 * (`iso27001`, `hs`) is returned as is.
 */
export function frameworkOf(standardKey: string): string {
  const base = standardKey.replace(/-\d{4}$/, '');
  return base.replace(/-/g, '_');
}

/** i18n key of a translated short name, or null when the name is fixed (ISO numbers). */
export function shortNameKey(framework: string): string | null {
  return TRANSLATED_SHORT.has(framework) ? `standards.reqs.short.${framework}` : null;
}

/** Fixed short name of a framework ("ISO 27001"), or null when it is translated / unknown. */
export function fixedShortName(framework: string): string | null {
  return SHORT_NAMES[framework] ?? null;
}

/** The requirement's position in its clause from its ref (`…:8.4.1.r2` -> 2), or null. */
export function reqIndexOf(ref: string): number | null {
  const match = /\.r(\d+)$/.exec(ref);
  return match ? Number(match[1]) : null;
}

/**
 * A label for a link whose backend label is missing (create / confirm responses,
 * older backends): the clause number and the standard's short name. The clause
 * title and the "krav N av M" position are unknown here, so they stay empty.
 */
export function fallbackLabel(
  link: Pick<RequirementLink, 'requirement_ref' | 'standard_key' | 'clause_number'>,
  short: string,
): RequirementLabel {
  return {
    ref: link.requirement_ref,
    short,
    number: link.clause_number,
    title: '',
    text: '',
    standard_key: link.standard_key,
    framework: frameworkOf(link.standard_key),
    req_index: reqIndexOf(link.requirement_ref) ?? 1,
    req_count: 1,
  };
}

/** Router link + query of a requirement inside its standard's workspace. */
export function requirementRoute(
  label: Pick<RequirementLabel, 'standard_key' | 'number' | 'ref'>,
): {
  readonly commands: readonly string[];
  readonly queryParams: { readonly req: string };
} {
  return {
    commands: ['/standards', label.standard_key, label.number],
    queryParams: { req: label.ref },
  };
}

/** "ISO 27001 · A.8.13" (the short name is passed in, already translated). */
export function labelText(short: string, number: string): string {
  return `${short} · ${number}`;
}

/** Whether to show "(krav 2 av 3)": only for clauses with several requirements. */
export function showsPosition(label: Pick<RequirementLabel, 'req_count'>): boolean {
  return label.req_count > 1;
}

/**
 * "(krav 2 av 3)", "(krav 1 og 2 av 3)" or "(alle 3 krav)" for the linked positions of a
 * clause; null when the clause has a single requirement.
 */
export function positionText(
  label: Pick<RequirementLabel, 'req_count'>,
  positions: readonly number[],
): { readonly key: string; readonly params: Record<string, unknown> } | null {
  const count = label.req_count;
  if (count <= 1 || positions.length === 0) {
    return null;
  }
  if (positions.length >= count) {
    return { key: 'standards.reqs.positionAll', params: { count } };
  }
  if (positions.length > 1) {
    const sorted = [...positions].sort((a, b) => a - b);
    return {
      key: 'standards.reqs.positionMany',
      params: { first: sorted.slice(0, -1).join(', '), last: sorted[sorted.length - 1], count },
    };
  }
  return { key: 'standards.reqs.position', params: { index: positions[0], count } };
}

/** Group labels by standard (insertion order kept), for "grouped by standard" lists. */
export function groupByStandard<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): readonly { readonly key: string; readonly items: readonly T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return [...groups].map(([key, list]) => ({ key, items: list }));
}

/** Natural ordering of clause numbers ("A.8.2" before "A.8.13"). */
export function compareNumbers(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}
