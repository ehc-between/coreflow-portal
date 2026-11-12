import { Injectable, inject, signal } from '@angular/core';
import { DefaultTranspiler, TranspileParams, Translation } from '@jsverse/transloco';
import { TermOverrides } from './module.models';

/** The F1 base term keys; modules may add more (they come back in `term_keys`). */
export const TERM_KEYS = [
  'deviation',
  'document',
  'risk',
  'audit',
  'finding',
  'process',
  'task',
  'objective',
  'incident',
  'supplier',
  'employee',
] as const;

/** The param name for the plural form of a term key (`process` -> `processes`). */
export function pluralParamName(key: string): string {
  return /(s|x|z|ch|sh)$/.test(key) ? `${key}es` : `${key}s`;
}

function capitalise(value: string, lang: string): string {
  return value ? value.charAt(0).toLocaleUpperCase(lang) + value.slice(1) : value;
}

/**
 * Holds the selected org's terminology overrides. Deliberately dependency-free:
 * the transpiler (which Transloco itself injects) reads it, so it must not
 * inject Transloco back.
 */
@Injectable({ providedIn: 'root' })
export class TerminologyStore {
  private readonly _overrides = signal<TermOverrides>({});
  private readonly _keys = signal<readonly string[]>(TERM_KEYS);

  readonly overrides = this._overrides.asReadonly();
  readonly keys = this._keys.asReadonly();

  set(overrides: TermOverrides, keys?: readonly string[]): void {
    this._overrides.set(overrides);
    if (keys?.length) {
      this._keys.set(keys);
    }
  }
}

/**
 * Builds the `term` param for a language: for each term key the org override
 * (when set for `lang`), else the global default `terms.<key>.one|other` from the
 * translation, as `{deviation, deviations, Deviation, Deviations}`. Terms with
 * neither an override nor a default are left out.
 */
export function buildTermParams(
  keys: readonly string[],
  overrides: TermOverrides,
  translation: Translation,
  lang: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const override = overrides[key]?.[lang as 'en' | 'nb'];
    const one = override?.one ?? (translation[`terms.${key}.one`] as string | undefined);
    const other = override?.other ?? (translation[`terms.${key}.other`] as string | undefined);
    if (typeof one === 'string' && one) {
      result[key] = one;
      result[capitalise(key, 'en')] = capitalise(one, lang);
    }
    if (typeof other === 'string' && other) {
      const plural = pluralParamName(key);
      result[plural] = other;
      result[capitalise(plural, 'en')] = capitalise(other, lang);
    }
  }
  return result;
}

/**
 * Transloco transpiler that injects a `term` param into every translation, so
 * any string can say `{{ term.deviation }}` / `{{ term.Deviations }}` and follow
 * the organisation's own wording. Explicit params win over `term`.
 */
@Injectable()
export class TerminologyTranspiler extends DefaultTranspiler {
  private readonly store = inject(TerminologyStore);
  private lang: string = this.config.defaultLang;

  private cache: {
    readonly lang: string;
    readonly translation: Translation;
    readonly overrides: TermOverrides;
    readonly keys: readonly string[];
    readonly terms: Record<string, string>;
  } | null = null;

  onLangChanged(lang: string): void {
    this.lang = lang;
  }

  override transpile(params: TranspileParams): unknown {
    const { value, translation } = params;
    if (typeof value !== 'string' || !value.includes('term.')) {
      return super.transpile(params);
    }
    const terms = this.termsFor(translation);
    const merged: Record<string, unknown> = { term: terms, ...(params.params ?? {}) };
    return super.transpile({ ...params, params: merged });
  }

  private termsFor(translation: Translation): Record<string, string> {
    const overrides = this.store.overrides();
    const keys = this.store.keys();
    const lang = this.lang.split('/').pop() ?? this.lang;
    const cache = this.cache;
    if (
      cache &&
      cache.lang === lang &&
      cache.translation === translation &&
      cache.overrides === overrides &&
      cache.keys === keys
    ) {
      return cache.terms;
    }
    const terms = buildTermParams(keys, overrides, translation, lang);
    this.cache = { lang, translation, overrides, keys, terms };
    return terms;
  }
}
