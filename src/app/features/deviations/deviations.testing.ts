import globalEn from '../../../assets/i18n/en.json';
import globalNb from '../../../assets/i18n/nb.json';
import scopedEn from '../../../assets/i18n/deviations/en.json';
import scopedNb from '../../../assets/i18n/deviations/nb.json';

type Tree = Record<string, unknown>;

function isTree(value: unknown): value is Tree {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Deep merge (b wins), like Transloco merging a loaded scope into the global language. */
export function mergeTranslations(a: Tree, b: Tree): Tree {
  const out: Tree = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = isTree(out[key]) && isTree(value) ? mergeTranslations(out[key], value) : value;
  }
  return out;
}

/**
 * A test language: the global translations plus the `deviations` scope merged
 * under its alias, as the running app has them once the scope is loaded.
 */
export function deviationsLang(lang: 'en' | 'nb'): Tree {
  const global = (lang === 'nb' ? globalNb : globalEn) as Tree;
  const scoped = (lang === 'nb' ? scopedNb : scopedEn) as Tree;
  return mergeTranslations(global, { deviations: scoped });
}
