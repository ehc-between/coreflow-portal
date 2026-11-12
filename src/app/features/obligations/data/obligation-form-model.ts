import {
  DEFAULT_LEAD_DAYS,
  FRAMEWORKS,
  FrameworkKey,
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
  readonly requirements: readonly string[];
  readonly frameworks: readonly FrameworkKey[];
  readonly jurisdiction: string;
  readonly issuer: string;
  readonly reference: string;
  readonly source_url: string;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly valid_from: string;
  readonly valid_until: string;
  /** Whether a periodic compliance evaluation is scheduled. */
  readonly evaluate: boolean;
  readonly evaluation_rrule: string;
  readonly evaluation_start: string;
  readonly evaluation_lead_days: string;
}

export const DEFAULT_EVALUATION_RRULE = 'FREQ=YEARLY';

export function emptyObligationForm(): ObligationFormValue {
  return {
    title: '',
    obligation_type: 'law',
    status: 'draft',
    description: '',
    applicability: '',
    requirements: [],
    frameworks: [],
    jurisdiction: '',
    issuer: '',
    reference: '',
    source_url: '',
    owner_user_id: '',
    department_id: '',
    valid_from: '',
    valid_until: '',
    evaluate: false,
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

export function formFromObligation(o: Obligation): ObligationFormValue {
  return {
    title: o.title,
    obligation_type: o.obligation_type,
    status: o.status,
    description: o.description ?? '',
    applicability: o.applicability ?? '',
    requirements: [...o.requirements],
    frameworks: o.frameworks.filter(isFramework),
    jurisdiction: o.jurisdiction ?? '',
    issuer: o.issuer ?? '',
    reference: o.reference ?? '',
    source_url: o.source_url ?? '',
    owner_user_id: o.owner?.id ?? '',
    department_id: o.department_id ?? '',
    valid_from: o.valid_from ?? '',
    valid_until: o.valid_until ?? '',
    evaluate: !!o.evaluation_rrule,
    evaluation_rrule: o.evaluation_rrule ?? DEFAULT_EVALUATION_RRULE,
    evaluation_start: o.evaluation_start ?? '',
    evaluation_lead_days: String(o.evaluation_lead_days ?? DEFAULT_LEAD_DAYS),
  };
}

/** Trimmed, de-duplicated requirements without blanks (what the backend stores). */
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

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function leadDays(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : DEFAULT_LEAD_DAYS;
}

/** Every writable field as the API expects it. */
function toFields(v: ObligationFormValue): Record<string, unknown> {
  return {
    title: v.title.trim(),
    obligation_type: v.obligation_type,
    status: v.status,
    description: text(v.description),
    applicability: text(v.applicability),
    requirements: cleanRequirements(v.requirements),
    frameworks: [...v.frameworks],
    jurisdiction: text(v.jurisdiction),
    issuer: text(v.issuer),
    reference: text(v.reference),
    source_url: text(v.source_url),
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    valid_from: v.valid_from || null,
    valid_until: v.valid_until || null,
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
  const requirements = cleanRequirements(v.requirements);
  if (requirements.length > MAX_REQUIREMENTS) {
    errors['requirements'] = 'obligations.errors.too_many_requirements';
  } else if (requirements.some((r) => r.length > MAX_REQUIREMENT_CHARS)) {
    errors['requirements'] = 'obligations.errors.requirement_too_long';
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

/**
 * Merge an accepted AI proposal into the form: the chosen requirements are appended
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
    requirements: cleanRequirements([...v.requirements, ...chosen]).slice(0, MAX_REQUIREMENTS),
    frameworks,
    ...(rrule && !v.evaluate ? { evaluate: true, evaluation_rrule: rrule } : {}),
  };
}

/** The text sent to the proposal assist from an unsaved form. */
export function proposalText(v: ObligationFormValue): string {
  return [v.title, v.issuer, v.reference, v.jurisdiction, v.description, v.applicability]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}
