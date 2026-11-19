import {
  ADDRESSED_STATUSES,
  ANALYSIS_METHODS,
  ContextKind,
  ContextListQuery,
  FRAMEWORK_KEYS,
  LIST_SORTS,
  PARTY_CATEGORIES,
  PARTY_TYPES,
  POLICY_KINDS,
} from '../data/context.models';
import { statusesFor } from '../context-kinds';
import { FilterOption } from '../ui/filter-select';

/** One list filter (`key` is the filter-state key and the query param). */
export interface ListFilterDef {
  readonly key: string;
  readonly labelKey: string;
  readonly allKey: string;
  readonly options: readonly FilterOption[];
}

const opts = (prefix: string, values: readonly string[]): FilterOption[] =>
  values.map((value) => ({ value, label: `${prefix}.${value}` }));

/** Per-kind filters beyond status / owner / framework / review due. */
const EXTRA_FILTERS: Readonly<Record<ContextKind, readonly ListFilterDef[]>> = {
  analysis: [
    {
      key: 'method',
      labelKey: 'context.filters.method',
      allKey: 'context.filters.allMethods',
      options: opts('context.methods', ANALYSIS_METHODS),
    },
  ],
  party: [
    {
      key: 'addressed_status',
      labelKey: 'context.filters.addressed',
      allKey: 'context.filters.allAddressed',
      options: opts('context.addressed', ADDRESSED_STATUSES),
    },
    {
      key: 'category',
      labelKey: 'context.filters.category',
      allKey: 'context.filters.allCategories',
      options: opts('context.partyCategories', PARTY_CATEGORIES),
    },
    {
      key: 'party_type',
      labelKey: 'context.filters.partyType',
      allKey: 'context.filters.allPartyTypes',
      options: opts('context.partyTypes', PARTY_TYPES),
    },
  ],
  scope: [],
  policy: [
    {
      key: 'kind',
      labelKey: 'context.filters.policyKind',
      allKey: 'context.filters.allPolicyKinds',
      options: opts('context.policyKinds', POLICY_KINDS),
    },
  ],
  responsibility: [],
};

/** How many filters sit in the toolbar next to search (U30: two); the rest go behind "Flere filtre". */
export const VISIBLE_FILTERS = 2;

/** Framework options with the organisation's adopted standards first. */
export function frameworkOptions(ordered: readonly string[] = FRAMEWORK_KEYS): FilterOption[] {
  return opts('context.frameworks', ordered);
}

/** Every filter the list of `kind` offers, in display order. */
export function listFilters(
  kind: ContextKind,
  frameworks: readonly string[] = FRAMEWORK_KEYS,
): ListFilterDef[] {
  return [
    {
      key: 'status',
      labelKey: 'context.filters.status',
      allKey: 'context.filters.allStatuses',
      options: opts('context.status', statusesFor(kind)),
    },
    ...EXTRA_FILTERS[kind],
    {
      key: 'framework',
      labelKey: 'context.filters.framework',
      allKey: 'context.filters.allFrameworks',
      options: frameworkOptions(frameworks),
    },
    {
      key: 'owner',
      labelKey: 'context.filters.owner',
      allKey: 'context.filters.anyOwner',
      options: [{ value: 'me', label: 'context.filters.ownerMe' }],
    },
    {
      key: 'review_due',
      labelKey: 'context.filters.review',
      allKey: 'context.filters.anyReview',
      options: [{ value: 'true', label: 'context.filters.reviewDue' }],
    },
  ];
}

/** The toolbar filters and the ones behind "Flere filtre". */
export function splitFilters(defs: readonly ListFilterDef[]): {
  visible: ListFilterDef[];
  more: ListFilterDef[];
} {
  return { visible: defs.slice(0, VISIBLE_FILTERS), more: defs.slice(VISIBLE_FILTERS) };
}

/** Every filter-state key a list of `kind` understands (for restoring URL params / views). */
export function filterKeys(kind: ContextKind): string[] {
  return [...listFilters(kind).map((f) => f.key), 'sort'];
}

export const SORT_OPTIONS: readonly FilterOption[] = LIST_SORTS.map((value) => ({
  value,
  label: `context.sort.${value.replace('-', 'desc_')}`,
}));

/** The default sort (most recently updated first). */
export const DEFAULT_SORT = '-updated_at';

/** How many of the "Flere filtre" values (and a non-default sort) are set. */
export function moreFiltersActive(
  more: readonly ListFilterDef[],
  filters: Readonly<Record<string, string>>,
): number {
  const set = more.filter((def) => !!filters[def.key]).length;
  return set + (filters['sort'] && filters['sort'] !== DEFAULT_SORT ? 1 : 0);
}

/** Filter state -> the API list query. */
export function toListQuery(
  kind: ContextKind,
  q: string,
  filters: Readonly<Record<string, string>>,
  offset: number,
  limit: number,
): ContextListQuery {
  const extra: Record<string, string | undefined> = {};
  for (const def of EXTRA_FILTERS[kind]) {
    extra[def.key] = filters[def.key] || undefined;
  }
  return {
    q,
    status: filters['status'] ? [filters['status']] : undefined,
    owner: filters['owner'] || undefined,
    framework: filters['framework'] || undefined,
    review_due: filters['review_due'] === 'true',
    sort: filters['sort'] || DEFAULT_SORT,
    limit,
    offset,
    extra,
  };
}

/** Keep only known, non-empty filter values (e.g. from the URL or a saved view). */
export function cleanFilters(
  kind: ContextKind,
  source: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const allowed = new Set(filterKeys(kind));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowed.has(key) && typeof value === 'string' && value) {
      out[key] = value;
    }
  }
  return out;
}
