import {
  DeviationDetail,
  RootCauseMethod,
  Severity,
  Source,
  UpdateDeviationRequest,
} from '../../core/deviations/deviation.models';
import {
  clauseRefsOf,
  clausesFromRefs,
  localToUtc,
  sameClauses,
  utcToLocal,
} from './deviation-display';

/** The deviation edit form's current values. */
export interface DeviationEditForm {
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly source: Source;
  /** `YYYY-MM-DD`, or empty for no due date. */
  readonly dueAt: string;
  /** `datetime-local` values (local time), or empty. */
  readonly occurredAt: string;
  readonly detectedAt: string;
  readonly location: string;
  readonly immediateAction: string;
  readonly rootCause: string;
  /** A root-cause method, or empty for none. */
  readonly rootCauseMethod: RootCauseMethod | '';
  /** Canonical clause refs of the requirements the deviation affects. */
  readonly refs: readonly string[];
  readonly tags: readonly string[];
  /** Department id, or empty for none. */
  readonly departmentId: string;
  /** The Kunde field (customer register), or empty for none. */
  readonly customerId?: string;
  readonly data: Record<string, unknown>;
}

/** The edit form's starting values for a deviation. */
export function editFormFrom(dev: DeviationDetail): DeviationEditForm {
  return {
    title: dev.title,
    description: dev.description ?? '',
    severity: dev.severity,
    source: dev.source,
    dueAt: dev.due_at ? dev.due_at.slice(0, 10) : '',
    occurredAt: utcToLocal(dev.occurred_at),
    detectedAt: utcToLocal(dev.detected_at),
    location: dev.location ?? '',
    immediateAction: dev.immediate_action ?? '',
    rootCause: dev.root_cause ?? '',
    rootCauseMethod: dev.root_cause_method ?? '',
    refs: clauseRefsOf(dev.clauses),
    tags: [...dev.tags],
    departmentId: dev.department_id ?? '',
    customerId: dev.customer_id ?? '',
    data: { ...dev.data },
  };
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Same instant at minute precision (the input has no seconds). */
function sameMinute(local: string, stored: string | null | undefined): boolean {
  return local === utcToLocal(stored);
}

/**
 * Only the fields that changed. `data` is sent whole if any key differs; a
 * cleared department, due date or event fact is sent as `null`. The standards are
 * not edited here: they follow from the cited clauses (and the type).
 */
export function buildDeviationPatch(
  dev: DeviationDetail,
  form: DeviationEditForm,
): UpdateDeviationRequest {
  const patch: Record<string, unknown> = {};
  const title = form.title.trim();
  if (title !== dev.title) {
    patch['title'] = title;
  }
  const description = form.description.trim();
  if (description !== (dev.description ?? '')) {
    patch['description'] = description;
  }
  if (form.severity !== dev.severity) {
    patch['severity'] = form.severity;
  }
  if (form.source !== dev.source) {
    patch['source'] = form.source;
  }
  const currentDue = dev.due_at ? dev.due_at.slice(0, 10) : '';
  if (form.dueAt !== currentDue) {
    patch['due_at'] = form.dueAt || null;
  }
  if (!sameMinute(form.occurredAt, dev.occurred_at)) {
    patch['occurred_at'] = localToUtc(form.occurredAt);
  }
  if (!sameMinute(form.detectedAt, dev.detected_at)) {
    patch['detected_at'] = localToUtc(form.detectedAt);
  }
  const location = form.location.trim();
  if (location !== (dev.location ?? '')) {
    patch['location'] = location || null;
  }
  const immediate = form.immediateAction.trim();
  if (immediate !== (dev.immediate_action ?? '')) {
    patch['immediate_action'] = immediate || null;
  }
  const rootCause = form.rootCause.trim();
  if (rootCause !== (dev.root_cause ?? '')) {
    patch['root_cause'] = rootCause;
  }
  if (form.rootCauseMethod !== (dev.root_cause_method ?? '')) {
    patch['root_cause_method'] = form.rootCauseMethod || null;
  }
  const clauses = clausesFromRefs(form.refs);
  if (!sameClauses(clauses, dev.clauses)) {
    patch['clauses'] = clauses;
  }
  if (!sameList(form.tags, dev.tags)) {
    patch['tags'] = [...form.tags];
  }
  if (form.departmentId !== (dev.department_id ?? '')) {
    patch['department_id'] = form.departmentId || null;
  }
  if (form.customerId !== undefined && form.customerId !== (dev.customer_id ?? '')) {
    patch['customer_id'] = form.customerId || null;
  }
  if (JSON.stringify(dev.data) !== JSON.stringify(form.data)) {
    patch['data'] = form.data;
  }
  return patch as UpdateDeviationRequest;
}
