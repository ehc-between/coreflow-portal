import {
  Aspect,
  AspectCreate,
  AspectUpdate,
  Condition,
  ControlLevel,
  DrillCreate,
  DrillKind,
  DrillOutcome,
  EmergencyContact,
  EmergencyPlan,
  GhgScope,
  ImpactType,
  LifecycleStage,
  MeasurementCreate,
  Metric,
  MetricCategory,
  MetricCreate,
  MetricStatus,
  MetricUpdate,
  PlanCreate,
  PlanUpdate,
  RecordStatus,
  SuggestedAspect,
} from './environment.models';
import { dayToDatetime, localDay, localToUtc, toDay } from './environment-display';

/** Validation errors: field -> i18n key. */
export type FormErrors = Readonly<Record<string, string>>;

const REQUIRED = 'environment.form.errors.required';

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** The keys of `next` whose JSON differs from `original` (for a PATCH body). */
function changed<T extends object>(original: T, next: T): (keyof T)[] {
  return (Object.keys(next) as (keyof T)[]).filter(
    (key) => JSON.stringify(original[key]) !== JSON.stringify(next[key]),
  );
}

function pick<T extends object>(source: T, keys: readonly (keyof T)[]): Partial<T> {
  return Object.fromEntries(keys.map((k) => [k, source[k]])) as Partial<T>;
}

// --- aspects ------------------------------------------------------------------------

export type OverrideChoice = '' | 'significant' | 'not_significant';

export interface AspectFormValue {
  readonly activity: string;
  readonly aspect: string;
  readonly impact: string;
  readonly impact_type: ImpactType;
  readonly condition: Condition;
  readonly lifecycle_stages: readonly LifecycleStage[];
  readonly control_level: ControlLevel;
  readonly site: string;
  readonly scores: Readonly<Record<string, number | null>>;
  readonly override: OverrideChoice;
  readonly override_reason: string;
  readonly legal_requirement: boolean;
  readonly operational_controls: string;
  readonly status: RecordStatus;
  readonly owner_user_id: string;
  readonly department_id: string;
  /** `YYYY-MM-DD` or '' (the backend then defaults to a year ahead). */
  readonly review_due: string;
}

export function emptyAspectForm(patch: Partial<AspectFormValue> = {}): AspectFormValue {
  return {
    activity: '',
    aspect: '',
    impact: '',
    impact_type: 'other',
    condition: 'normal',
    lifecycle_stages: [],
    control_level: 'direct',
    site: '',
    scores: {},
    override: '',
    override_reason: '',
    legal_requirement: false,
    operational_controls: '',
    status: 'active',
    owner_user_id: '',
    department_id: '',
    review_due: '',
    ...patch,
  };
}

export function aspectFormFrom(a: Aspect): AspectFormValue {
  return {
    activity: a.activity,
    aspect: a.aspect,
    impact: a.impact ?? '',
    impact_type: a.impact_type,
    condition: a.condition,
    lifecycle_stages: [...a.lifecycle_stages],
    control_level: a.control_level,
    site: a.site ?? '',
    scores: { ...a.scores },
    override:
      a.significance_override === null
        ? ''
        : a.significance_override
          ? 'significant'
          : 'not_significant',
    override_reason: a.override_reason ?? '',
    legal_requirement: a.legal_requirement,
    operational_controls: a.operational_controls ?? '',
    status: a.status,
    owner_user_id: a.owner_user_id ?? '',
    department_id: a.department_id ?? '',
    review_due: toDay(a.review_due_at),
  };
}

/** A form seeded from an AI suggestion (always a draft for the user to check). */
export function aspectFormFromSuggestion(
  activity: string,
  site: string,
  s: SuggestedAspect,
): AspectFormValue {
  return emptyAspectForm({
    activity,
    site,
    aspect: s.aspect,
    impact: s.impact,
    impact_type: s.impact_type,
    condition: s.condition,
    lifecycle_stages: [...s.lifecycle_stages],
    operational_controls: s.suggested_controls,
    status: 'draft',
  });
}

export function validateAspectForm(v: AspectFormValue): FormErrors {
  const errors: Record<string, string> = {};
  if (!v.activity.trim()) {
    errors['activity'] = REQUIRED;
  }
  if (!v.aspect.trim()) {
    errors['aspect'] = REQUIRED;
  }
  if (v.override && !v.override_reason.trim()) {
    errors['override_reason'] = 'environment.form.errors.overrideReason';
  }
  return errors;
}

export function toAspectCreate(v: AspectFormValue): AspectCreate {
  return {
    activity: v.activity.trim(),
    aspect: v.aspect.trim(),
    impact: text(v.impact),
    impact_type: v.impact_type,
    condition: v.condition,
    lifecycle_stages: v.lifecycle_stages,
    control_level: v.control_level,
    site: text(v.site),
    scores: Object.fromEntries(Object.entries(v.scores).filter(([, s]) => s !== null)),
    significance_override: v.override === '' ? null : v.override === 'significant',
    override_reason: v.override ? text(v.override_reason) : null,
    legal_requirement: v.legal_requirement,
    operational_controls: text(v.operational_controls),
    status: v.status,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    review_due_at: dayToDatetime(v.review_due),
  };
}

/** Only the changed fields (plus the change reason); `scores` sends changed criteria only. */
export function toAspectUpdate(
  original: AspectFormValue,
  next: AspectFormValue,
  changeReason: string,
): AspectUpdate {
  const a = toAspectCreate(original);
  const b = toAspectCreate(next);
  const keys = changed(a, b).filter((k) => k !== 'scores');
  const body: Record<string, unknown> = pick(b, keys);
  const scores: Record<string, number | null> = {};
  const allKeys = new Set([...Object.keys(original.scores), ...Object.keys(next.scores)]);
  for (const key of allKeys) {
    const before = original.scores[key] ?? null;
    const after = next.scores[key] ?? null;
    if (before !== after) {
      scores[key] = after;
    }
  }
  if (Object.keys(scores).length) {
    body['scores'] = scores;
  }
  if ('significance_override' in body && b.significance_override !== null) {
    body['override_reason'] = b.override_reason;
  }
  if (Object.keys(body).length && changeReason.trim()) {
    body['change_reason'] = changeReason.trim();
  }
  return body as AspectUpdate;
}

// --- emergency plans ----------------------------------------------------------------

export interface ContactDraft {
  readonly name: string;
  readonly role: string;
  readonly phone: string;
  readonly email: string;
}

export const MAX_CONTACTS = 50;

export interface PlanFormValue {
  readonly title: string;
  readonly scenario: string;
  readonly potential_impact: string;
  readonly response_procedure: string;
  readonly resources: string;
  readonly contacts: readonly ContactDraft[];
  readonly site: string;
  readonly status: RecordStatus;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly drill_enabled: boolean;
  readonly drill_rrule: string;
  /** `YYYY-MM-DD`: the first drill due date. */
  readonly drill_start: string;
  readonly review_due: string;
}

export function emptyContact(): ContactDraft {
  return { name: '', role: '', phone: '', email: '' };
}

export function emptyPlanForm(patch: Partial<PlanFormValue> = {}): PlanFormValue {
  return {
    title: '',
    scenario: '',
    potential_impact: '',
    response_procedure: '',
    resources: '',
    contacts: [],
    site: '',
    status: 'draft',
    owner_user_id: '',
    department_id: '',
    drill_enabled: false,
    drill_rrule: 'FREQ=YEARLY',
    drill_start: '',
    review_due: '',
    ...patch,
  };
}

export function planFormFrom(p: EmergencyPlan): PlanFormValue {
  return {
    title: p.title,
    scenario: p.scenario ?? '',
    potential_impact: p.potential_impact ?? '',
    response_procedure: p.response_procedure ?? '',
    resources: p.resources ?? '',
    contacts: p.contacts.map((c) => ({
      name: c.name,
      role: c.role ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
    })),
    site: p.site ?? '',
    status: p.status,
    owner_user_id: p.owner_user_id ?? '',
    department_id: p.department_id ?? '',
    drill_enabled: !!p.drill_rrule,
    drill_rrule: p.drill_rrule ?? 'FREQ=YEARLY',
    drill_start: toDay(p.next_drill_due_at),
    review_due: toDay(p.review_due_at),
  };
}

export function validatePlanForm(v: PlanFormValue): FormErrors {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) {
    errors['title'] = REQUIRED;
  }
  v.contacts.forEach((c, i) => {
    const filled = c.role.trim() || c.phone.trim() || c.email.trim();
    if (filled && !c.name.trim()) {
      errors[`contacts.${i}`] = 'environment.form.errors.contactName';
    }
  });
  return errors;
}

function contactsOut(contacts: readonly ContactDraft[]): EmergencyContact[] {
  return contacts
    .filter((c) => c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      role: text(c.role),
      phone: text(c.phone),
      email: text(c.email),
    }));
}

export function toPlanCreate(v: PlanFormValue): PlanCreate {
  return {
    title: v.title.trim(),
    scenario: text(v.scenario),
    potential_impact: text(v.potential_impact),
    response_procedure: text(v.response_procedure),
    resources: text(v.resources),
    contacts: contactsOut(v.contacts),
    site: text(v.site),
    status: v.status,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    drill_rrule: v.drill_enabled ? v.drill_rrule : null,
    drill_start: v.drill_enabled ? dayToDatetime(v.drill_start) : null,
    review_due_at: dayToDatetime(v.review_due),
  };
}

/**
 * Changed fields only. The drill schedule is sent as a pair: changing the rule or
 * its start replaces the schedule; turning it off sends `drill_rrule: null`.
 */
export function toPlanUpdate(
  original: PlanFormValue,
  next: PlanFormValue,
  changeReason: string,
): PlanUpdate {
  const a = toPlanCreate(original);
  const b = toPlanCreate(next);
  const keys = changed(a, b);
  const body: Record<string, unknown> = pick(b, keys);
  if ('drill_start' in body || 'drill_rrule' in body) {
    body['drill_rrule'] = b.drill_rrule;
    if (b.drill_rrule) {
      body['drill_start'] = b.drill_start;
    } else {
      delete body['drill_start'];
    }
  }
  if (Object.keys(body).length && changeReason.trim()) {
    body['change_reason'] = changeReason.trim();
  }
  return body as PlanUpdate;
}

// --- metrics ------------------------------------------------------------------------

export interface MetricFormValue {
  readonly name: string;
  readonly category: MetricCategory;
  readonly unit: string;
  readonly ghg_scope: GhgScope | '';
  /** Decimal text (kg CO2e per unit) or ''. */
  readonly emission_factor: string;
  readonly description: string;
  readonly site: string;
  readonly status: MetricStatus;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly collection_enabled: boolean;
  readonly collection_rrule: string;
  readonly collection_start: string;
}

export function emptyMetricForm(patch: Partial<MetricFormValue> = {}): MetricFormValue {
  return {
    name: '',
    category: 'energy',
    unit: '',
    ghg_scope: '',
    emission_factor: '',
    description: '',
    site: '',
    status: 'active',
    owner_user_id: '',
    department_id: '',
    collection_enabled: false,
    collection_rrule: 'FREQ=MONTHLY',
    collection_start: '',
    ...patch,
  };
}

export function metricFormFrom(m: Metric): MetricFormValue {
  return {
    name: m.name,
    category: m.category,
    unit: m.unit,
    ghg_scope: m.ghg_scope ?? '',
    emission_factor: m.emission_factor === null ? '' : String(m.emission_factor),
    description: m.description ?? '',
    site: m.site ?? '',
    status: m.status,
    owner_user_id: m.owner_user_id ?? '',
    department_id: m.department_id ?? '',
    collection_enabled: !!m.collection_rrule,
    collection_rrule: m.collection_rrule ?? 'FREQ=MONTHLY',
    collection_start: '',
  };
}

/** Parse a decimal typed with a comma or a dot; NaN when not a number. */
export function parseDecimal(value: string): number {
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  return cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned) ? NaN : Number(cleaned);
}

export function validateMetricForm(v: MetricFormValue): FormErrors {
  const errors: Record<string, string> = {};
  if (!v.name.trim()) {
    errors['name'] = REQUIRED;
  }
  if (!v.unit.trim()) {
    errors['unit'] = REQUIRED;
  }
  if (v.emission_factor.trim()) {
    const n = parseDecimal(v.emission_factor);
    if (!Number.isFinite(n) || n < 0) {
      errors['emission_factor'] = 'environment.form.errors.nonNegative';
    }
  }
  return errors;
}

export function toMetricCreate(v: MetricFormValue): MetricCreate {
  const factor = v.emission_factor.trim() ? parseDecimal(v.emission_factor) : null;
  return {
    name: v.name.trim(),
    category: v.category,
    unit: v.unit.trim(),
    ghg_scope: v.ghg_scope || null,
    emission_factor: factor,
    description: text(v.description),
    site: text(v.site),
    status: v.status,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    collection_rrule: v.collection_enabled ? v.collection_rrule : null,
    collection_start: v.collection_enabled ? dayToDatetime(v.collection_start) : null,
  };
}

export function toMetricUpdate(original: MetricFormValue, next: MetricFormValue): MetricUpdate {
  const a = toMetricCreate(original);
  const b = toMetricCreate(next);
  const body: Record<string, unknown> = pick(b, changed(a, b));
  if ('collection_start' in body || 'collection_rrule' in body) {
    body['collection_rrule'] = b.collection_rrule;
    if (b.collection_rrule && b.collection_start) {
      body['collection_start'] = b.collection_start;
    } else {
      delete body['collection_start'];
    }
  }
  return body as MetricUpdate;
}

// --- measurements and drills --------------------------------------------------------

export interface MeasurementFormValue {
  readonly period_start: string;
  readonly period_end: string;
  readonly value: string;
  readonly site: string;
  readonly note: string;
}

/** A new measurement for last calendar month (the most common reporting period). */
export function emptyMeasurementForm(now = new Date()): MeasurementFormValue {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    period_start: localDay(0, first),
    period_end: localDay(0, last),
    value: '',
    site: '',
    note: '',
  };
}

/** Longest period the backend accepts (days, inclusive). */
export const MAX_PERIOD_DAYS = 366;

export function validateMeasurementForm(v: MeasurementFormValue): FormErrors {
  const errors: Record<string, string> = {};
  if (!v.period_start) {
    errors['period_start'] = REQUIRED;
  }
  if (v.period_start && v.period_end) {
    if (v.period_end < v.period_start) {
      errors['period_end'] = 'environment.errors.invalid_period';
    } else {
      const days =
        (Date.parse(`${v.period_end}T00:00:00Z`) - Date.parse(`${v.period_start}T00:00:00Z`)) /
          86_400_000 +
        1;
      if (days > MAX_PERIOD_DAYS) {
        errors['period_end'] = 'environment.errors.period_too_long';
      }
    }
  }
  if (!v.value.trim()) {
    errors['value'] = REQUIRED;
  } else {
    const n = parseDecimal(v.value);
    if (!Number.isFinite(n) || n < 0) {
      errors['value'] = 'environment.form.errors.nonNegative';
    }
  }
  return errors;
}

export function toMeasurementCreate(v: MeasurementFormValue): MeasurementCreate {
  return {
    period_start: v.period_start,
    period_end: v.period_end || null,
    value: parseDecimal(v.value),
    site: text(v.site),
    note: text(v.note),
  };
}

export interface DrillFormValue {
  /** `datetime-local` value. */
  readonly held_at: string;
  readonly kind: DrillKind;
  readonly outcome: DrillOutcome | '';
  readonly participants: string;
  readonly findings: string;
  readonly lessons_learned: string;
  readonly plan_revision_needed: boolean;
}

export function emptyDrillForm(heldAt = ''): DrillFormValue {
  return {
    held_at: heldAt,
    kind: 'drill',
    outcome: '',
    participants: '',
    findings: '',
    lessons_learned: '',
    plan_revision_needed: false,
  };
}

export function validateDrillForm(v: DrillFormValue, now = new Date()): FormErrors {
  const errors: Record<string, string> = {};
  const held = localToUtc(v.held_at);
  if (!held) {
    errors['held_at'] = REQUIRED;
  } else if (new Date(`${held}Z`).getTime() > now.getTime() + 60_000) {
    errors['held_at'] = 'environment.errors.drill_in_future';
  }
  if (!v.outcome) {
    errors['outcome'] = REQUIRED;
  }
  if (v.participants.trim() && !/^\d+$/.test(v.participants.trim())) {
    errors['participants'] = 'environment.form.errors.wholeNumber';
  }
  return errors;
}

export function toDrillCreate(v: DrillFormValue): DrillCreate {
  return {
    held_at: localToUtc(v.held_at) ?? '',
    kind: v.kind,
    outcome: v.outcome as DrillOutcome,
    participants: v.participants.trim() ? Number(v.participants.trim()) : null,
    findings: text(v.findings),
    lessons_learned: text(v.lessons_learned),
    plan_revision_needed: v.plan_revision_needed,
  };
}
