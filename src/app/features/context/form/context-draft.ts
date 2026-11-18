import {
  AddressedStatus,
  AnalysisItem,
  AnalysisMethod,
  ContextAnalysis,
  ContextKind,
  ContextRecord,
  EntityRef,
  InterestedParty,
  Level,
  PartyCategory,
  PartyType,
  Policy,
  PolicyKind,
  RaciAssignment,
  Responsibility,
  ScopeExclusion,
  ScopeStatement,
  SimpleStatus,
} from '../data/context.models';
import { dayOf, dayToWire, linesOf } from '../context-kinds';
import { PickedRecord } from '../ui/record-search';

/** An analysis item being edited (always has a local id for tracking). */
export interface DraftItem extends AnalysisItem {
  readonly id: string;
}

/** A document picked to carry a policy. */
export type DraftDocument = PickedRecord;

/** An excluded requirement being edited (`clause` is a canonical ref, or '' while unpicked). */
export interface DraftExclusion {
  readonly clause: string;
  readonly justification: string;
}

/**
 * The editable state of any M01 record. One flat shape for all five kinds keeps
 * the form shell generic; each kind's field component reads and patches the
 * fields it owns, and {@link createBody} / {@link updateBody} pick per kind.
 */
export interface ContextDraft {
  /** `title`, or the party's `name`. */
  readonly title: string;
  // analysis
  readonly method: AnalysisMethod;
  readonly framework: string;
  readonly summary: string;
  readonly items: readonly DraftItem[];
  // interested party
  readonly category: PartyCategory;
  readonly party_type: PartyType;
  readonly description: string;
  readonly needs: string;
  readonly expectations: string;
  readonly requirements: string;
  readonly is_compliance_obligation: boolean;
  readonly addressed_status: AddressedStatus;
  readonly how_addressed: string;
  readonly monitoring: string;
  readonly influence: Level;
  readonly interest: Level;
  readonly frameworks: readonly string[];
  // scope
  readonly statement: string;
  readonly boundaries: string;
  readonly products_services: string;
  /** One site per line. */
  readonly sites: string;
  readonly exclusions: readonly DraftExclusion[];
  readonly processes: readonly PickedRecord[];
  // policy
  readonly kind: PolicyKind;
  /** A document to link on save (create and edit). */
  readonly document: DraftDocument | null;
  readonly available_to_interested_parties: boolean;
  // responsibility
  readonly area: string;
  readonly process: PickedRecord | null;
  readonly authorities: string;
  readonly assignments: readonly RaciAssignment[];
  // common
  readonly owner_user_id: string;
  /** '' = not set; else 1..60. */
  readonly review_interval_months: string;
  /** `YYYY-MM-DD` or ''. */
  readonly next_review_day: string;
  readonly status: SimpleStatus;
  readonly change_reason: string;
}

let nextLocalId = 0;
/** A local id for a new analysis item (the server keeps it, max 36 chars). */
export function localItemId(): string {
  nextLocalId += 1;
  return `n${Date.now().toString(36)}${nextLocalId.toString(36)}`.slice(0, 36);
}

/** The review interval a new record starts with (months). */
export const DEFAULT_INTERVAL = '12';

/** A blank draft (the same shape for every kind; each kind reads its own fields). */
export function emptyDraft(): ContextDraft {
  return {
    title: '',
    method: 'swot',
    framework: '',
    summary: '',
    items: [],
    category: 'customer',
    party_type: 'external',
    description: '',
    needs: '',
    expectations: '',
    requirements: '',
    is_compliance_obligation: false,
    addressed_status: 'not_addressed',
    how_addressed: '',
    monitoring: '',
    influence: 'medium',
    interest: 'medium',
    frameworks: [],
    statement: '',
    boundaries: '',
    products_services: '',
    sites: '',
    exclusions: [],
    processes: [],
    kind: 'quality',
    document: null,
    available_to_interested_parties: false,
    area: '',
    process: null,
    authorities: '',
    assignments: [],
    owner_user_id: '',
    review_interval_months: DEFAULT_INTERVAL,
    next_review_day: '',
    status: 'active',
    change_reason: '',
  };
}

function picked(ref: EntityRef): PickedRecord {
  return { id: ref.entity_id, title: ref.title, code: ref.code };
}

/** The draft for editing an existing record. */
export function draftFrom(kind: ContextKind, record: ContextRecord): ContextDraft {
  const base = emptyDraft();
  const withInterval = record as { review_interval_months?: number | null };
  const common = {
    owner_user_id: record.owner?.id ?? '',
    next_review_day: dayOf((record as { next_review_at?: string | null }).next_review_at),
    review_interval_months: intervalText(withInterval.review_interval_months),
  };
  switch (kind) {
    case 'analysis': {
      const r = record as ContextAnalysis;
      return {
        ...base,
        ...common,
        title: r.title,
        method: r.method,
        framework: r.framework ?? '',
        summary: r.summary ?? '',
        items: r.items.map((item) => ({
          id: item.id || localItemId(),
          category: item.category,
          text: item.text,
          impact: item.impact,
        })),
      };
    }
    case 'party': {
      const r = record as InterestedParty;
      return {
        ...base,
        ...common,
        title: r.name,
        category: r.category,
        party_type: r.party_type,
        description: r.description ?? '',
        needs: r.needs ?? '',
        expectations: r.expectations ?? '',
        requirements: r.requirements ?? '',
        is_compliance_obligation: r.is_compliance_obligation,
        addressed_status: r.addressed_status,
        how_addressed: r.how_addressed ?? '',
        monitoring: r.monitoring ?? '',
        influence: r.influence,
        interest: r.interest,
        frameworks: r.frameworks,
        status: r.status,
      };
    }
    case 'scope': {
      const r = record as ScopeStatement;
      return {
        ...base,
        ...common,
        title: r.title,
        framework: r.framework,
        statement: r.statement ?? '',
        boundaries: r.boundaries ?? '',
        products_services: r.products_services ?? '',
        sites: r.sites.join('\n'),
        exclusions: r.exclusions.map((e: ScopeExclusion) => ({
          clause: canonicalClause(e.clause, r.framework),
          justification: e.justification,
        })),
        processes: (r.processes ?? []).map(picked),
      };
    }
    case 'policy': {
      const r = record as Policy;
      return {
        ...base,
        ...common,
        title: r.title,
        kind: r.kind,
        statement: r.statement ?? '',
        frameworks: r.frameworks,
        available_to_interested_parties: !!r.available_to_interested_parties,
      };
    }
    case 'responsibility': {
      const r = record as Responsibility;
      return {
        ...base,
        ...common,
        title: r.title,
        area: r.process ? '' : (r.area ?? ''),
        process: r.process ? picked(r.process) : null,
        description: r.description ?? '',
        authorities: r.authorities ?? '',
        frameworks: r.frameworks,
        assignments: r.assignments,
        status: r.status,
      };
    }
  }
}

/** A clause as a canonical ref: `8.3` on an ISO 9001 scope becomes `iso9001:8.3`. */
export function canonicalClause(clause: string, framework: string): string {
  const value = clause.trim();
  if (!value || value.includes(':') || !framework) {
    return value;
  }
  return `${framework}:${value}`;
}

function intervalText(value: number | null | undefined): string {
  return value ? String(value) : '';
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function interval(value: string): number | null {
  const n = Number(value);
  return value.trim() && Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
}

/** Fields that do not change content (no new version, no change reason). */
const ADMIN_FIELDS = new Set([
  'owner_user_id',
  'review_interval_months',
  'next_review_at',
  'document_id',
]);

/** The full wire payload of the editable fields of a kind (create shape, no change reason). */
export function payloadOf(kind: ContextKind, d: ContextDraft): Record<string, unknown> {
  const owner = { owner_user_id: d.owner_user_id || null };
  const review = {
    review_interval_months: interval(d.review_interval_months),
    next_review_at: dayToWire(d.next_review_day),
  };
  switch (kind) {
    case 'analysis':
      return {
        title: d.title.trim(),
        method: d.method,
        framework: d.framework || null,
        summary: text(d.summary),
        items: d.items
          .filter((item) => item.text.trim())
          .map((item) => ({
            id: item.id,
            category: item.category,
            text: item.text.trim(),
            impact: item.impact,
          })),
        ...owner,
        ...review,
      };
    case 'party':
      return {
        name: d.title.trim(),
        category: d.category,
        party_type: d.party_type,
        description: text(d.description),
        needs: text(d.needs),
        expectations: text(d.expectations),
        requirements: text(d.requirements),
        is_compliance_obligation: d.is_compliance_obligation,
        addressed_status: d.addressed_status,
        how_addressed: text(d.how_addressed),
        monitoring: text(d.monitoring),
        influence: d.influence,
        interest: d.interest,
        frameworks: [...d.frameworks],
        ...owner,
        ...review,
      };
    case 'scope':
      return {
        framework: d.framework,
        title: d.title.trim(),
        statement: text(d.statement),
        boundaries: text(d.boundaries),
        products_services: text(d.products_services),
        sites: linesOf(d.sites),
        exclusions: d.exclusions
          .filter((e) => e.clause.trim() && e.justification.trim())
          .map((e) => ({
            clause: canonicalClause(e.clause, d.framework),
            justification: e.justification.trim(),
          })),
        process_ids: d.processes.map((p) => p.id),
        ...owner,
        ...review,
      };
    case 'policy':
      return {
        kind: d.kind,
        title: d.title.trim(),
        statement: text(d.statement),
        frameworks: [...d.frameworks],
        available_to_interested_parties: d.available_to_interested_parties,
        ...owner,
        ...review,
      };
    case 'responsibility':
      return {
        title: d.title.trim(),
        area: text(d.area),
        process_id: d.process?.id ?? null,
        description: text(d.description),
        authorities: text(d.authorities),
        frameworks: [...d.frameworks],
        assignments: d.assignments.map((a) => ({ type: a.type, value: a.value, raci: a.raci })),
        ...owner,
        ...review,
      };
  }
}

/** Fields a create leaves out while they hold their "nothing" value (keeps bodies small). */
const OPTIONAL_EMPTY = [
  'monitoring',
  'process_ids',
  'process_id',
  'available_to_interested_parties',
] as const;

/** POST body for a new record. */
export function createBody(kind: ContextKind, d: ContextDraft): Record<string, unknown> {
  const body = payloadOf(kind, d);
  for (const key of OPTIONAL_EMPTY) {
    const value = body[key];
    if (value === null || value === false || (Array.isArray(value) && value.length === 0)) {
      delete body[key];
    }
  }
  if (kind === 'policy' && d.document) {
    body['document_id'] = d.document.id;
  }
  return body;
}

/** Fields set on create that the PATCH schemas reject (method, scope framework). */
const CREATE_ONLY: Readonly<Record<ContextKind, readonly string[]>> = {
  analysis: ['method'],
  party: [],
  scope: ['framework'],
  policy: [],
  responsibility: [],
};

/** Whether a field can no longer change once the record exists. */
export function isCreateOnly(kind: ContextKind, field: string): boolean {
  return CREATE_ONLY[kind].includes(field);
}

/** The changed fields between two drafts (only these are PATCHed). */
export function changedFields(
  kind: ContextKind,
  original: ContextDraft,
  current: ContextDraft,
): Record<string, unknown> {
  const before = payloadOf(kind, original);
  const after = payloadOf(kind, current);
  const changes: Record<string, unknown> = {};
  const fixed = CREATE_ONLY[kind];
  for (const [key, value] of Object.entries(after)) {
    if (fixed.includes(key)) {
      continue;
    }
    if (JSON.stringify(value) !== JSON.stringify(before[key])) {
      changes[key] = value;
    }
  }
  if ((kind === 'party' || kind === 'responsibility') && current.status !== original.status) {
    changes['status'] = current.status;
  }
  if (kind === 'policy' && current.document && current.document.id !== original.document?.id) {
    changes['document_id'] = current.document.id;
  }
  return changes;
}

/** Whether the changes touch content (not only owner / review settings / a linked document). */
export function changesContent(changes: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(changes).some((key) => !ADMIN_FIELDS.has(key));
}

/** PATCH body: the changed fields, plus the change reason when one is given. */
export function updateBody(
  kind: ContextKind,
  original: ContextDraft,
  current: ContextDraft,
): Record<string, unknown> {
  const changes = changedFields(kind, original, current);
  const reason = current.change_reason.trim();
  if (reason && Object.keys(changes).length > 0) {
    changes['change_reason'] = reason;
  }
  return changes;
}

/** The i18n keys of problems that block saving (client-side checks). */
export function draftProblems(kind: ContextKind, d: ContextDraft): string[] {
  const problems: string[] = [];
  if (!d.title.trim()) {
    problems.push(kind === 'party' ? 'context.form.problems.name' : 'context.form.problems.title');
  }
  if (kind === 'scope' && !d.framework) {
    problems.push('context.form.problems.framework');
  }
  if (d.review_interval_months.trim() && interval(d.review_interval_months) === null) {
    problems.push('context.form.problems.interval');
  }
  if (kind === 'responsibility') {
    if (d.assignments.filter((a) => a.raci === 'A').length > 1) {
      problems.push('context.errors.multiple_accountable');
    }
    const keys = d.assignments.map((a) => `${a.type}:${a.value}`);
    if (new Set(keys).size !== keys.length) {
      problems.push('context.errors.duplicate_assignment');
    }
  }
  if (kind === 'scope' && d.exclusions.some((e) => !e.clause.trim() !== !e.justification.trim())) {
    problems.push('context.form.problems.exclusion');
  }
  return problems;
}

/**
 * Prefill from a "create from here" flow: only empty fields are filled, in the
 * kind's own field names (`title` -> the party's name, `description` -> a policy
 * or scope statement, an analysis summary).
 */
export function draftFromPrefill(
  kind: ContextKind,
  draft: ContextDraft,
  prefill: Readonly<Record<string, unknown>>,
): ContextDraft {
  const str = (key: string): string => {
    const value = prefill[key];
    return typeof value === 'string' ? value : '';
  };
  const list = (key: string): string[] => {
    const value = prefill[key];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  };
  const next: Record<string, unknown> = { ...draft };
  const fill = (field: keyof ContextDraft, value: string) => {
    if (value && !String(draft[field] ?? '').trim()) {
      next[field] = value;
    }
  };
  fill('title', str('title') || str('name'));
  const body = str('statement') || str('description');
  switch (kind) {
    case 'analysis':
      fill('summary', str('summary') || body);
      fill('framework', str('framework'));
      break;
    case 'party':
      fill('description', str('description'));
      fill('needs', str('needs'));
      break;
    case 'scope':
      fill('statement', body);
      fill('framework', str('framework'));
      break;
    case 'policy':
      fill('statement', body);
      if (str('kind')) {
        next['kind'] = str('kind');
      }
      break;
    case 'responsibility':
      fill('description', str('description'));
      fill('area', str('area'));
      break;
  }
  const frameworks = list('frameworks');
  if (frameworks.length && draft.frameworks.length === 0) {
    next['frameworks'] = frameworks;
  }
  return next as unknown as ContextDraft;
}
