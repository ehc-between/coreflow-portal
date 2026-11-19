import { AcceptedSuggestion } from '../../../shared/ask/form-suggest';
import {
  SuggestFieldSpec,
  acceptedValue,
  suggestPatch,
  suggestValues,
} from '../../../shared/ask/form-suggest-map';
import {
  ADDRESSED_STATUSES,
  ANALYSIS_METHODS,
  ASSIGNEE_TYPES,
  AnalysisCategory,
  AssigneeType,
  ContextKind,
  FRAMEWORK_KEYS,
  LEVELS,
  Level,
  PARTY_CATEGORIES,
  PARTY_TYPES,
  PESTLE_CATEGORIES,
  RACI_ROLES,
  Raci,
  RaciAssignment,
  SWOT_CATEGORIES,
} from '../data/context.models';
import { ContextDraft, DraftItem, localItemId } from './context-draft';

const FW: SuggestFieldSpec = {
  name: 'frameworks',
  labelKey: 'context.fields.frameworks',
  type: 'multi',
  options: FRAMEWORK_KEYS,
  enumPrefix: 'context.frameworks.',
};
const OWNER: SuggestFieldSpec = {
  name: 'owner_user_id',
  labelKey: 'context.fields.owner',
  type: 'ref',
};
const LEVEL = (name: 'influence' | 'interest', labelKey: string): SuggestFieldSpec => ({
  name,
  labelKey,
  type: 'enum',
  options: LEVELS,
  enumPrefix: 'context.levels.',
});

/**
 * The whole-form suggestion of the M01 kinds other than policies (`policy-suggest.ts`):
 * server keys `context.<kind>` and how their fields map onto the flat draft.
 */
export const CONTEXT_SUGGEST_FIELDS: Readonly<
  Record<Exclude<ContextKind, 'policy'>, readonly SuggestFieldSpec[]>
> = {
  scope: [
    { name: 'title', labelKey: 'context.fields.title', type: 'text' },
    {
      name: 'framework',
      labelKey: 'context.fields.framework',
      type: 'enum',
      options: FRAMEWORK_KEYS,
      enumPrefix: 'context.frameworks.',
    },
    { name: 'statement', labelKey: 'context.fields.statement', type: 'long' },
    { name: 'boundaries', labelKey: 'context.fields.boundaries', type: 'long' },
    { name: 'products_services', labelKey: 'context.fields.productsServices', type: 'long' },
    { name: 'sites', labelKey: 'context.fields.sites', type: 'long' },
    { name: 'processes', labelKey: 'context.fields.processes', type: 'refs' },
  ],
  analysis: [
    { name: 'title', labelKey: 'context.fields.title', type: 'text' },
    {
      name: 'method',
      labelKey: 'context.fields.method',
      type: 'enum',
      options: ANALYSIS_METHODS,
      enumPrefix: 'context.methods.',
    },
    {
      name: 'framework',
      labelKey: 'context.fields.framework',
      type: 'enum',
      options: FRAMEWORK_KEYS,
      enumPrefix: 'context.frameworks.',
    },
    { name: 'summary', labelKey: 'context.fields.summary', type: 'long' },
    { name: 'items', labelKey: 'context.fields.items', type: 'items' },
  ],
  party: [
    { name: 'title', labelKey: 'context.fields.name', type: 'text' },
    {
      name: 'category',
      labelKey: 'context.fields.category',
      type: 'enum',
      options: PARTY_CATEGORIES,
      enumPrefix: 'context.partyCategories.',
    },
    {
      name: 'party_type',
      labelKey: 'context.fields.partyType',
      type: 'enum',
      options: PARTY_TYPES,
      enumPrefix: 'context.partyTypes.',
    },
    { name: 'description', labelKey: 'context.fields.description', type: 'long' },
    { name: 'needs', labelKey: 'context.fields.needs', type: 'long' },
    { name: 'expectations', labelKey: 'context.fields.expectations', type: 'long' },
    { name: 'requirements', labelKey: 'context.fields.requirements', type: 'long' },
    {
      name: 'is_compliance_obligation',
      labelKey: 'context.fields.isComplianceObligation',
      type: 'bool',
    },
    {
      name: 'addressed_status',
      labelKey: 'context.fields.addressedStatus',
      type: 'enum',
      options: ADDRESSED_STATUSES,
      enumPrefix: 'context.addressed.',
    },
    { name: 'how_addressed', labelKey: 'context.fields.howAddressed', type: 'long' },
    { name: 'monitoring', labelKey: 'context.fields.monitoring', type: 'long' },
    LEVEL('influence', 'context.fields.influence'),
    LEVEL('interest', 'context.fields.interest'),
    FW,
    OWNER,
  ],
  responsibility: [
    { name: 'title', labelKey: 'context.fields.title', type: 'text' },
    { name: 'process_id', labelKey: 'context.fields.process', type: 'ref' },
    { name: 'area', labelKey: 'context.fields.area', type: 'text' },
    { name: 'description', labelKey: 'context.fields.description', type: 'long' },
    { name: 'assignments', labelKey: 'context.fields.assignments', type: 'items' },
    { name: 'authorities', labelKey: 'context.fields.authorities', type: 'long' },
    FW,
    OWNER,
  ],
};

/** The long text fields that get a per-field "Skriv om". */
export const CONTEXT_REWRITE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  scope: ['statement'],
  analysis: ['summary'],
  party: ['needs', 'expectations'],
  responsibility: ['description'],
};

/** The draft as the suggestion's current values (server names). */
export function contextSuggestValues(
  kind: Exclude<ContextKind, 'policy'>,
  draft: ContextDraft,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  if (kind === 'scope') {
    overrides['processes'] = draft.processes.map((p) => p.id);
  } else if (kind === 'analysis') {
    overrides['items'] = draft.items.map(({ category, text, impact }) => ({
      category,
      text,
      impact,
    }));
  } else if (kind === 'responsibility') {
    overrides['process_id'] = draft.process?.id ?? null;
    overrides['assignments'] = draft.assignments.map((a) => ({
      assignee: `${a.type}:${a.value}`,
      raci: a.raci,
    }));
  }
  return suggestValues(CONTEXT_SUGGEST_FIELDS[kind], draft, overrides);
}

const CATEGORIES: readonly string[] = [...SWOT_CATEGORIES, ...PESTLE_CATEGORIES];

/** The draft change for accepted suggestions (invalid values are skipped). */
export function contextSuggestPatch(
  kind: Exclude<ContextKind, 'policy'>,
  accepted: AcceptedSuggestion,
  draft: ContextDraft,
): Partial<ContextDraft> {
  const specs = CONTEXT_SUGGEST_FIELDS[kind];
  const patch = suggestPatch(specs, accepted, [
    'processes',
    'items',
    'process_id',
    'assignments',
  ]) as { -readonly [K in keyof ContextDraft]?: ContextDraft[K] } & Record<string, unknown>;
  const spec = (name: string): SuggestFieldSpec => specs.find((s) => s.name === name)!;

  if (kind === 'scope' && accepted['processes']) {
    const ids = acceptedValue(spec('processes'), accepted['processes']) as string[] | undefined;
    const labels = accepted['processes'].display;
    if (ids) {
      patch.processes = ids.map((id, i) => ({
        id,
        title: Array.isArray(labels) ? String(labels[i] ?? id) : id,
        code: null,
      }));
    }
  }
  if (kind === 'analysis') {
    const method = (patch.method as string | undefined) ?? draft.method;
    const allowed: readonly string[] = method === 'pestle' ? PESTLE_CATEGORIES : SWOT_CATEGORIES;
    const items = acceptedValue(spec('items'), accepted['items']) as unknown[] | undefined;
    if (items) {
      patch.items = items.flatMap((raw): DraftItem[] => {
        const item = raw as { category?: unknown; text?: unknown; impact?: unknown };
        const category = String(item.category ?? '');
        if (!CATEGORIES.includes(category) || !allowed.includes(category)) {
          return [];
        }
        return [
          {
            id: localItemId(),
            category: category as AnalysisCategory,
            text: String(item.text ?? ''),
            impact: ((LEVELS as readonly string[]).includes(String(item.impact))
              ? item.impact
              : 'medium') as Level,
          },
        ];
      });
    }
  }
  if (kind === 'responsibility') {
    const processId = acceptedValue(spec('process_id'), accepted['process_id']);
    if (typeof processId === 'string') {
      const display = accepted['process_id']?.display;
      patch.process = {
        id: processId,
        title: typeof display === 'string' ? display : processId,
        code: null,
      };
      patch.area = '';
    }
    const rows = acceptedValue(spec('assignments'), accepted['assignments']) as
      | unknown[]
      | undefined;
    if (rows) {
      const labels = accepted['assignments']?.display;
      patch.assignments = rows.flatMap((raw, i): RaciAssignment[] => {
        const row = raw as { assignee?: unknown; raci?: unknown };
        const [type, ...rest] = String(row.assignee ?? '').split(':');
        const value = rest.join(':');
        if (
          !(ASSIGNEE_TYPES as readonly string[]).includes(type) ||
          !value ||
          !(RACI_ROLES as readonly string[]).includes(String(row.raci))
        ) {
          return [];
        }
        // The server's line is "<name> - <raci>".
        const line = Array.isArray(labels) ? String(labels[i] ?? '') : '';
        const name = line.replace(/ - [RACI]$/, '') || null;
        return [{ type: type as AssigneeType, value, raci: row.raci as Raci, name }];
      });
    }
  }
  return patch;
}
