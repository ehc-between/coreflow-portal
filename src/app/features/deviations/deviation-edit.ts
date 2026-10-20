import {
  ClauseRef,
  DeviationDetail,
  Severity,
  Source,
  Standard,
  UpdateDeviationRequest,
} from '../../core/deviations/deviation.models';

/** A clause row being edited (standard + free-text clause, possibly blank). */
export interface ClauseRow {
  standard: Standard;
  clause: string;
}

/** The deviation edit form's current values. */
export interface DeviationEditForm {
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly source: Source;
  /** `YYYY-MM-DD`, or empty for no due date. */
  readonly dueAt: string;
  readonly rootCause: string;
  readonly rootCauseMethod: string;
  readonly standards: readonly Standard[];
  readonly clauses: readonly ClauseRow[];
  readonly tags: readonly string[];
  /** Department id, or empty for none. */
  readonly departmentId: string;
  readonly data: Record<string, unknown>;
}

/** Clause rows → API clause refs, dropping blank rows and trimming values. */
export function toClauseRefs(rows: readonly ClauseRow[]): ClauseRef[] {
  return rows
    .filter((row) => row.clause.trim() !== '')
    .map((row) => ({ standard: row.standard, clause: row.clause.trim() }));
}

/** The edit form's starting values for a deviation. */
export function editFormFrom(dev: DeviationDetail): DeviationEditForm {
  return {
    title: dev.title,
    description: dev.description ?? '',
    severity: dev.severity,
    source: dev.source,
    dueAt: dev.due_at ? dev.due_at.slice(0, 10) : '',
    rootCause: dev.root_cause ?? '',
    rootCauseMethod: dev.root_cause_method ?? '',
    standards: [...dev.standards],
    clauses: dev.clauses.map((c) => ({ standard: c.standard, clause: c.clause })),
    tags: [...dev.tags],
    departmentId: dev.department_id ?? '',
    data: { ...dev.data },
  };
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameClauses(a: readonly ClauseRef[], b: readonly ClauseRef[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c.standard === b[i].standard && c.clause === b[i].clause)
  );
}

/**
 * Only the fields that changed. `data` is sent whole if any key differs;
 * a cleared department is sent as `null`.
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
  const rootCause = form.rootCause.trim();
  if (rootCause !== (dev.root_cause ?? '')) {
    patch['root_cause'] = rootCause;
  }
  const rootCauseMethod = form.rootCauseMethod.trim();
  if (rootCauseMethod !== (dev.root_cause_method ?? '')) {
    patch['root_cause_method'] = rootCauseMethod;
  }
  if (!sameList(form.standards, dev.standards)) {
    patch['standards'] = [...form.standards];
  }
  const clauses = toClauseRefs(form.clauses);
  if (!sameClauses(clauses, dev.clauses)) {
    patch['clauses'] = clauses;
  }
  if (!sameList(form.tags, dev.tags)) {
    patch['tags'] = [...form.tags];
  }
  if (form.departmentId !== (dev.department_id ?? '')) {
    patch['department_id'] = form.departmentId || null;
  }
  if (JSON.stringify(dev.data) !== JSON.stringify(form.data)) {
    patch['data'] = form.data;
  }
  return patch as UpdateDeviationRequest;
}
