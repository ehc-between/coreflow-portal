import {
  DEFAULT_LEAD_DAYS,
  DutyIn,
  FRAMEWORKS,
  FrameworkKey,
  MAX_CLAUSE_REFS,
  MAX_RENEWAL_LEAD_DAYS,
  MAX_REQUIREMENTS,
  MAX_REQUIREMENT_CHARS,
  OBLIGATION_TYPES,
  Obligation,
  ObligationCreate,
  ObligationStatus,
  ObligationType,
  ObligationUpdate,
  RequirementProposal,
} from './obligation.models';

/** One duty row of the form. `key` tracks the row; `id` is set for saved duties. */
export interface DutyDraft {
  readonly key: string;
  readonly id: string | null;
  readonly title: string;
  readonly owner_user_id: string;
  readonly clause_refs: readonly string[];
}

/**
 * The obligation form state: plain strings, booleans and lists bound to the inputs.
 * Empty strings mean "not set" and go to the API as null.
 */
export interface ObligationFormValue {
  readonly title: string;
  readonly obligation_type: ObligationType;
  readonly status: ObligationStatus;
  readonly description: string;
  readonly applicability: string;
  readonly duties: readonly DutyDraft[];
  readonly frameworks: readonly FrameworkKey[];
  readonly clause_refs: readonly string[];
  readonly jurisdiction: string;
  readonly issuer: string;
  readonly reference: string;
  readonly source_url: string;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly valid_from: string;
  readonly valid_until: string;
  /** Days before the end the renewal task is due; empty = the default (90). */
  readonly renewal_lead_days: string;
  /** Whether a periodic compliance evaluation is scheduled. */
  readonly evaluate: boolean;
  readonly evaluation_rrule: string;
  readonly evaluation_start: string;
  readonly evaluation_lead_days: string;
}

export const DEFAULT_EVALUATION_RRULE = 'FREQ=YEARLY';

let nextKey = 0;

/** A new, empty or pre-filled duty row. */
export function newDuty(title = '', patch: Partial<DutyDraft> = {}): DutyDraft {
  return { key: `d${++nextKey}`, id: null, title, owner_user_id: '', clause_refs: [], ...patch };
}

/**
 * A new obligation starts active with a yearly evaluation: an obligation without a
 * planned evaluation is the most common audit finding (ISO 14001/45001 9.1.2).
 */
export function emptyObligationForm(): ObligationFormValue {
  return {
    title: '',
    obligation_type: 'law',
    status: 'active',
    description: '',
    applicability: '',
    duties: [],
    frameworks: [],
    clause_refs: [],
    jurisdiction: 'NO',
    issuer: '',
    reference: '',
    source_url: '',
    owner_user_id: '',
    department_id: '',
    valid_from: '',
    valid_until: '',
    renewal_lead_days: '',
    evaluate: true,
    evaluation_rrule: DEFAULT_EVALUATION_RRULE,
    evaluation_start: '',
    evaluation_lead_days: String(DEFAULT_LEAD_DAYS),
  };
}

export function isFramework(value: string): value is FrameworkKey {
  return (FRAMEWORKS as readonly string[]).includes(value);
}

export function isObligationType(value: string | null | undefined): value is ObligationType {
  return (OBLIGATION_TYPES as readonly string[]).includes(value ?? '');
}

/** The framework key of a canonical clause ref (`gdpr:30` -> `gdpr`), or null. */
export function frameworkOfRef(ref: string): FrameworkKey | null {
  const at = ref.indexOf(':');
  const key =
    at > 0
      ? ref
          .slice(0, at)
          .replace(/-\d{4}$/, '')
          .replace(/-/g, '_')
      : '';
  return isFramework(key) ? key : null;
}

export function formFromObligation(o: Obligation): ObligationFormValue {
  const duties = o.duties?.length
    ? o.duties.map((d) =>
        newDuty(d.title, {
          id: d.id,
          owner_user_id: d.owner?.id ?? '',
          clause_refs: [...d.clause_refs],
        }),
      )
    : (o.requirements ?? []).map((r) => newDuty(r));
  return {
    title: o.title,
    obligation_type: o.obligation_type,
    status: o.status,
    description: o.description ?? '',
    applicability: o.applicability ?? '',
    duties,
    frameworks: o.frameworks.filter(isFramework),
    clause_refs: [...(o.clause_refs ?? [])],
    jurisdiction: o.jurisdiction ?? '',
    issuer: o.issuer ?? '',
    reference: o.reference ?? '',
    source_url: o.source_url ?? '',
    owner_user_id: o.owner?.id ?? '',
    department_id: o.department_id ?? '',
    valid_from: o.valid_from ?? '',
    valid_until: o.valid_until ?? '',
    renewal_lead_days: o.renewal_lead_days == null ? '' : String(o.renewal_lead_days),
    evaluate: !!o.evaluation_rrule,
    evaluation_rrule: o.evaluation_rrule ?? DEFAULT_EVALUATION_RRULE,
    evaluation_start: o.evaluation_start ?? '',
    evaluation_lead_days: String(o.evaluation_lead_days ?? DEFAULT_LEAD_DAYS),
  };
}

/** Trimmed, de-duplicated texts without blanks. */
export function cleanRequirements(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/** The duties as the API takes them: blank rows dropped, texts trimmed, order kept. */
export function cleanDuties(duties: readonly DutyDraft[]): DutyIn[] {
  return duties
    .filter((d) => d.title.trim())
    .map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      title: d.title.trim(),
      owner_user_id: d.owner_user_id || null,
      clause_refs: [...d.clause_refs],
    }));
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function leadDays(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : DEFAULT_LEAD_DAYS;
}

function renewalDays(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/** Every writable field as the API expects it. */
function toFields(v: ObligationFormValue): Record<string, unknown> {
  return {
    title: v.title.trim(),
    obligation_type: v.obligation_type,
    status: v.status,
    description: text(v.description),
    applicability: text(v.applicability),
    duties: cleanDuties(v.duties),
    frameworks: [...v.frameworks],
    clause_refs: [...v.clause_refs],
    jurisdiction: text(v.jurisdiction),
    issuer: text(v.issuer),
    reference: text(v.reference),
    source_url: text(v.source_url),
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    valid_from: v.valid_from || null,
    valid_until: v.valid_until || null,
    renewal_lead_days: renewalDays(v.renewal_lead_days),
    evaluation_rrule: v.evaluate ? text(v.evaluation_rrule) : null,
    evaluation_start: v.evaluate ? v.evaluation_start || null : null,
    evaluation_lead_days: leadDays(v.evaluation_lead_days),
  };
}

/** The create body; unset values are left out so the backend defaults apply. */
export function toCreateRequest(v: ObligationFormValue): ObligationCreate {
  const fields = toFields(v);
  const body: Record<string, unknown> = { title: v.title.trim() };
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'title' || value === null) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    body[key] = value;
  }
  if (!v.evaluate) {
    delete body['evaluation_lead_days'];
  }
  return body as unknown as ObligationCreate;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Only the fields that changed (plus the change reason when given). */
export function toUpdateRequest(
  original: ObligationFormValue,
  next: ObligationFormValue,
  changeReason: string,
): ObligationUpdate {
  const before = toFields(original);
  const after = toFields(next);
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (!same(before[key], after[key])) {
      body[key] = after[key];
    }
  }
  if (!next.evaluate && !original.evaluate) {
    delete body['evaluation_lead_days'];
  }
  if (Object.keys(body).length > 0 && changeReason.trim()) {
    body['change_reason'] = changeReason.trim().slice(0, 1000);
  }
  return body as ObligationUpdate;
}

/** Field -> i18n error key; empty when the form can be submitted. */
export function validateObligationForm(v: ObligationFormValue): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) {
    errors['title'] = 'obligations.form.errors.titleRequired';
  }
  if (v.valid_from && v.valid_until && v.valid_until < v.valid_from) {
    errors['valid_until'] = 'obligations.errors.invalid_dates';
  }
  const duties = cleanDuties(v.duties);
  if (duties.length > MAX_REQUIREMENTS) {
    errors['duties'] = 'obligations.errors.too_many_requirements';
  } else if (duties.some((d) => d.title.length > MAX_REQUIREMENT_CHARS)) {
    errors['duties'] = 'obligations.errors.requirement_too_long';
  }
  if (v.clause_refs.length > MAX_CLAUSE_REFS) {
    errors['clause_refs'] = 'obligations.errors.too_many_clause_refs';
  }
  if (v.renewal_lead_days.trim()) {
    const days = Number(v.renewal_lead_days);
    if (!Number.isInteger(days) || days < 0 || days > MAX_RENEWAL_LEAD_DAYS) {
      errors['renewal_lead_days'] = 'obligations.form.errors.renewalLeadDays';
    }
  }
  if (v.evaluate) {
    const lead = Number(v.evaluation_lead_days);
    if (!Number.isInteger(lead) || lead < 0 || lead > 366) {
      errors['evaluation_lead_days'] = 'obligations.errors.invalid_lead_days';
    }
    if (!v.evaluation_rrule.trim()) {
      errors['evaluation_rrule'] = 'obligations.errors.invalid_rrule';
    }
  }
  return errors;
}

/** Add refs that are not there yet (order kept, max {@link MAX_CLAUSE_REFS}). */
export function mergeRefs(current: readonly string[], add: readonly string[]): string[] {
  const out = [...current];
  for (const ref of add) {
    if (!out.includes(ref) && out.length < MAX_CLAUSE_REFS) {
      out.push(ref);
    }
  }
  return out;
}

/** A duty to add: its text, optionally with the clauses it documents. */
export type DutySeed =
  | string
  | { readonly title: string; readonly clause_refs?: readonly string[] };

/** Append duties whose text is not there yet (max {@link MAX_REQUIREMENTS}). */
export function appendDuties(
  duties: readonly DutyDraft[],
  add: readonly DutySeed[],
): readonly DutyDraft[] {
  const seen = new Set(duties.map((d) => d.title.trim()));
  const kept = duties.filter((d) => d.title.trim());
  const out = [...kept];
  for (const raw of add) {
    const t = (typeof raw === 'string' ? raw : raw.title).trim();
    if (t && !seen.has(t) && out.length < MAX_REQUIREMENTS) {
      seen.add(t);
      const refs = typeof raw === 'string' ? [] : [...(raw.clause_refs ?? [])];
      out.push(newDuty(t, { clause_refs: refs }));
    }
  }
  return out;
}

/**
 * Merge an accepted AI proposal into the form: the chosen duties are appended
 * (duplicates dropped), frameworks are unioned, and the type, applicability and
 * evaluation frequency are only filled in when the user has not set them.
 */
export function applyProposal(
  v: ObligationFormValue,
  proposal: RequirementProposal,
  chosen: readonly string[],
  isNew: boolean,
): ObligationFormValue {
  const frameworks = [...v.frameworks];
  for (const f of proposal.frameworks ?? []) {
    if (isFramework(f) && !frameworks.includes(f)) {
      frameworks.push(f);
    }
  }
  const type =
    isNew && isObligationType(proposal.obligation_type) && v.obligation_type === 'law'
      ? proposal.obligation_type
      : v.obligation_type;
  const rrule = proposal.evaluation_rrule?.trim();
  return {
    ...v,
    obligation_type: type,
    applicability: v.applicability.trim() ? v.applicability : (proposal.applicability ?? ''),
    duties: appendDuties(v.duties, chosen),
    frameworks,
    ...(rrule && (!v.evaluate || isNew) ? { evaluate: true, evaluation_rrule: rrule } : {}),
  };
}

/** Values a create-from-here flow or a library entry can fill in. */
export interface ObligationSeed {
  readonly title?: string | null;
  readonly description?: string | null;
  readonly obligation_type?: string | null;
  readonly frameworks?: readonly string[] | null;
  readonly clause_refs?: readonly string[] | null;
  readonly issuer?: string | null;
  readonly reference?: string | null;
  readonly jurisdiction?: string | null;
  readonly source_url?: string | null;
  readonly applicability?: string | null;
  readonly duties?: readonly DutySeed[] | null;
  readonly evaluation_rrule?: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Read the seed fields out of a flow's prefill values (unknown shape). */
export function seedFromPrefill(prefill: Readonly<Record<string, unknown>>): ObligationSeed {
  return {
    title: str(prefill['title']),
    description: str(prefill['description']),
    obligation_type: str(prefill['obligation_type']),
    frameworks: strings(prefill['frameworks']),
    clause_refs: strings(prefill['clause_refs']),
    issuer: str(prefill['issuer']),
    reference: str(prefill['reference']),
    jurisdiction: str(prefill['jurisdiction']),
    source_url: str(prefill['source_url']),
  };
}

/**
 * Fill the form from a seed: text fields only where the user has typed nothing yet;
 * frameworks, clauses and duties are merged.
 */
export function applySeed(v: ObligationFormValue, seed: ObligationSeed): ObligationFormValue {
  const keep = (current: string, next: string | null | undefined) =>
    current.trim() ? current : (next?.trim() ?? current);
  const frameworks = [...v.frameworks];
  for (const f of seed.frameworks ?? []) {
    if (isFramework(f) && !frameworks.includes(f)) {
      frameworks.push(f);
    }
  }
  const rrule = seed.evaluation_rrule?.trim();
  return {
    ...v,
    title: keep(v.title, seed.title),
    description: keep(v.description, seed.description),
    applicability: keep(v.applicability, seed.applicability),
    issuer: keep(v.issuer, seed.issuer),
    reference: keep(v.reference, seed.reference),
    source_url: keep(v.source_url, seed.source_url),
    jurisdiction: seed.jurisdiction?.trim() || v.jurisdiction,
    obligation_type: isObligationType(seed.obligation_type)
      ? seed.obligation_type
      : v.obligation_type,
    frameworks,
    clause_refs: mergeRefs(v.clause_refs, seed.clause_refs ?? []),
    duties: appendDuties(v.duties, seed.duties ?? []),
    ...(rrule ? { evaluate: true, evaluation_rrule: rrule } : {}),
  };
}

/** The text sent to the proposal assist from an unsaved form. */
export function proposalText(v: ObligationFormValue): string {
  return [v.title, v.issuer, v.reference, v.jurisdiction, v.description, v.applicability]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}
