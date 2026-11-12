import { dateInputToIso, isoToDateInput } from '../data/process-display';
import {
  CreateProcessRequest,
  Kpi,
  ProcessCategory,
  ProcessDetail,
  TURTLE_LIST_FIELDS,
  TurtleDraft,
  TurtleListField,
  UpdateProcessRequest,
} from '../data/process.models';

/** The editable state of the create / edit form (plain values, '' for "none"). */
export interface ProcessFormValue {
  readonly title: string;
  readonly code: string;
  readonly category: ProcessCategory;
  readonly purpose: string;
  readonly scope: string;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly parent_id: string;
  /** '' or a whole number 1-60, as typed. */
  readonly review_interval_months: string;
  /** `yyyy-mm-dd` or ''. */
  readonly next_review_at: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly resources: readonly string[];
  readonly competence: readonly string[];
  readonly methods: readonly string[];
  readonly risks: readonly string[];
  readonly kpis: readonly Kpi[];
}

export function emptyForm(ownerUserId = ''): ProcessFormValue {
  return {
    title: '',
    code: '',
    category: 'core',
    purpose: '',
    scope: '',
    owner_user_id: ownerUserId,
    department_id: '',
    parent_id: '',
    review_interval_months: '12',
    next_review_at: '',
    inputs: [],
    outputs: [],
    resources: [],
    competence: [],
    methods: [],
    risks: [],
    kpis: [],
  };
}

export function formFromDetail(p: ProcessDetail): ProcessFormValue {
  return {
    title: p.title,
    code: p.code,
    category: p.category,
    purpose: p.purpose ?? '',
    scope: p.scope ?? '',
    owner_user_id: p.owner?.id ?? '',
    department_id: p.department?.id ?? '',
    parent_id: p.parent?.id ?? '',
    review_interval_months: p.review_interval_months ? String(p.review_interval_months) : '',
    next_review_at: isoToDateInput(p.next_review_at),
    inputs: p.inputs,
    outputs: p.outputs,
    resources: p.resources,
    competence: p.competence,
    methods: p.methods,
    risks: p.risks,
    kpis: p.kpis,
  };
}

/** Parsed review interval: a whole number 1-60, null for empty, NaN when invalid. */
export function parseInterval(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : Number.NaN;
}

/** Client-side validation; returns i18n keys of the problems (empty when valid). */
export function validateForm(form: ProcessFormValue): string[] {
  const problems: string[] = [];
  if (!form.title.trim()) {
    problems.push('processes.form.errors.titleRequired');
  }
  if (Number.isNaN(parseInterval(form.review_interval_months))) {
    problems.push('processes.form.errors.interval');
  }
  if (form.kpis.some((k) => !k.name.trim())) {
    problems.push('processes.form.errors.kpiName');
  }
  return problems;
}

function cleanKpis(kpis: readonly Kpi[]): Kpi[] {
  return kpis
    .filter((k) => k.name.trim())
    .map((k) => ({
      name: k.name.trim(),
      target: k.target?.trim() || null,
      unit: k.unit?.trim() || null,
      frequency: k.frequency?.trim() || null,
    }));
}

const orNull = (value: string): string | null => value.trim() || null;

export function toCreateRequest(form: ProcessFormValue): CreateProcessRequest {
  const interval = parseInterval(form.review_interval_months);
  return {
    title: form.title.trim(),
    code: orNull(form.code),
    category: form.category,
    purpose: orNull(form.purpose),
    scope: orNull(form.scope),
    owner_user_id: orNull(form.owner_user_id),
    department_id: orNull(form.department_id),
    parent_id: orNull(form.parent_id),
    review_interval_months: Number.isNaN(interval) ? null : interval,
    next_review_at: dateInputToIso(form.next_review_at),
    inputs: form.inputs,
    outputs: form.outputs,
    resources: form.resources,
    competence: form.competence,
    methods: form.methods,
    risks: form.risks,
    kpis: cleanKpis(form.kpis),
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Only the fields that differ from the loaded process (the API is a partial PATCH). */
export function toUpdateRequest(
  form: ProcessFormValue,
  original: ProcessDetail,
  changeReason: string,
): UpdateProcessRequest {
  const next = toCreateRequest(form);
  const before = toCreateRequest(formFromDetail(original));
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof CreateProcessRequest)[]) {
    if (!same(next[key], before[key])) {
      patch[key] = next[key];
    }
  }
  // The code cannot be cleared (the server keeps one); an emptied field is ignored.
  if (patch['code'] === null) {
    delete patch['code'];
  }
  if (Object.keys(patch).length > 0 && changeReason.trim()) {
    patch['change_reason'] = changeReason.trim();
  }
  return patch as UpdateProcessRequest;
}

/**
 * Merges an assistant turtle draft into the form: fills an empty purpose and adds
 * suggested list items and KPIs that are not there yet (never removes anything).
 */
export function mergeTurtleDraft(form: ProcessFormValue, draft: TurtleDraft): ProcessFormValue {
  const lists = {} as Record<TurtleListField, readonly string[]>;
  for (const field of TURTLE_LIST_FIELDS) {
    const current = form[field];
    const seen = new Set(current.map((s) => s.toLowerCase()));
    const additions = (Array.isArray(draft[field]) ? draft[field] : [])
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      .map((s) => s.trim())
      .filter((s) => !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true));
    lists[field] = [...current, ...additions].slice(0, 50);
  }
  const kpiNames = new Set(form.kpis.map((k) => k.name.toLowerCase()));
  const kpis = [
    ...form.kpis,
    ...(Array.isArray(draft.kpis) ? draft.kpis : []).filter(
      (k) =>
        k && typeof k.name === 'string' && k.name.trim() && !kpiNames.has(k.name.toLowerCase()),
    ),
  ].slice(0, 50);
  return {
    ...form,
    ...lists,
    kpis,
    purpose: form.purpose.trim() ? form.purpose : (draft.purpose ?? '').trim(),
  };
}
