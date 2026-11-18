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
  LinkedRecord,
  MeasurementCreate,
  MeasurementSource,
  Metric,
  MetricCategory,
  MetricCreate,
  MetricDirection,
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

/** A picked record of another module (obligation, process, aspect) shown as a chip. */
export interface PickedRecord {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly url?: string | null;
}

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

function picked(records: readonly LinkedRecord[] | null | undefined): PickedRecord[] {
  return (records ?? []).map((r) => ({ id: r.id, code: r.code, title: r.title, url: r.url }));
}

/** Parse a decimal typed with a comma or a dot (spaces as thousand separators); NaN when not a number. */
export function parseDecimal(value: string): number {
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
  return cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned) ? NaN : Number(cleaned);
}

function decimalOrNull(value: string): number | null {
  return value.trim() ? parseDecimal(value) : null;
}

function yearOrNull(value: string): number | null {
  return /^\d{4}$/.test(value.trim()) ? Number(value.trim()) : null;
}

function checkDecimal(errors: Record<string, string>, key: string, value: string): void {
  if (value.trim()) {
    const n = parseDecimal(value);
    if (!Number.isFinite(n) || n < 0) {
      errors[key] = 'environment.form.errors.nonNegative';
    }
  }
}

function checkYear(errors: Record<string, string>, key: string, value: string): void {
  const v = value.trim();
  if (v && (!/^\d{4}$/.test(v) || Number(v) < 1990 || Number(v) > 2100)) {
    errors[key] = 'environment.form.errors.year';
  }
}

// --- aspects ------------------------------------------------------------------------

export type OverrideChoice = '' | 'significant' | 'not_significant';

export interface AspectFormValue {
  readonly activity: string;
  /** The process the activity belongs to (Processes), or null. */
  readonly process: PickedRecord | null;
  readonly aspect: string;
  readonly impact: string;
  /** '' until the user picks one ("Velg …"; required). */
  readonly impact_type: ImpactType | '';
  readonly condition: Condition;
  readonly lifecycle_stages: readonly LifecycleStage[];
  readonly control_level: ControlLevel;
  readonly site: string;
  readonly scores: Readonly<Record<string, number | null>>;
  readonly override: OverrideChoice;
  readonly override_reason: string;
  /** Obligations from "Lover og forskrifter" that apply (6.1.3). */
  readonly obligations: readonly PickedRecord[];
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
    process: null,
    aspect: '',
    impact: '',
    impact_type: '',
    condition: 'normal',
    lifecycle_stages: [],
    control_level: 'direct',
    site: '',
    scores: {},
    override: '',
    override_reason: '',
    obligations: [],
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
    process: a.process ? picked([a.process])[0] : null,
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
    obligations: picked(a.obligations),
    operational_controls: a.operational_controls ?? '',
    status: a.status,
    owner_user_id: a.owner_user_id ?? '',
    department_id: a.department_id ?? '',
    review_due: toDay(a.review_due_at),
  };
}

/** A form seeded from an AI suggestion (always a draft for the user to check). */
export function aspectFormFromSuggestion(
  base: AspectFormValue,
  s: SuggestedAspect,
): AspectFormValue {
  return {
    ...base,
    aspect: s.aspect,
    impact: s.impact,
    impact_type: s.impact_type,
    condition: s.condition,
    lifecycle_stages: [...s.lifecycle_stages],
    operational_controls: s.suggested_controls,
    status: 'draft',
  };
}

export function validateAspectForm(v: AspectFormValue): FormErrors {
  const errors: Record<string, string> = {};
  if (!v.activity.trim()) {
    errors['activity'] = REQUIRED;
  }
  if (!v.aspect.trim()) {
    errors['aspect'] = REQUIRED;
  }
  if (!v.impact_type) {
    errors['impact_type'] = 'environment.form.errors.chooseOne';
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
    impact_type: v.impact_type || 'other',
    condition: v.condition,
    lifecycle_stages: v.lifecycle_stages,
    control_level: v.control_level,
    site: text(v.site),
    scores: Object.fromEntries(Object.entries(v.scores).filter(([, s]) => s !== null)),
    significance_override: v.override === '' ? null : v.override === 'significant',
    override_reason: v.override ? text(v.override_reason) : null,
    operational_controls: text(v.operational_controls),
    status: v.status,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    review_due_at: dayToDatetime(v.review_due),
    process_id: v.process?.id ?? null,
    obligation_ids: v.obligations.map((o) => o.id),
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

/** One contact row: a member of the organisation (`user_id`) or an external contact. */
export interface ContactDraft {
  readonly kind: 'member' | 'external';
  readonly user_id: string;
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
  /** The aspects (abnormal or emergency situations) the plan covers. */
  readonly aspects: readonly PickedRecord[];
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

export function emptyContact(kind: ContactDraft['kind'] = 'member'): ContactDraft {
  return { kind, user_id: '', name: '', role: '', phone: '', email: '' };
}

export function emptyPlanForm(patch: Partial<PlanFormValue> = {}): PlanFormValue {
  return {
    title: '',
    scenario: '',
    potential_impact: '',
    response_procedure: '',
    resources: '',
    contacts: [],
    aspects: [],
    site: '',
    status: 'active',
    owner_user_id: '',
    department_id: '',
    drill_enabled: true,
    drill_rrule: 'FREQ=YEARLY',
    drill_start: '',
    review_due: '',
    ...patch,
  };
}

export function contactDraftFrom(c: EmergencyContact): ContactDraft {
  return {
    kind: c.user_id ? 'member' : 'external',
    user_id: c.user_id ?? '',
    name: c.name ?? '',
    role: c.role ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
  };
}

export function planFormFrom(p: EmergencyPlan): PlanFormValue {
  return {
    title: p.title,
    scenario: p.scenario ?? '',
    potential_impact: p.potential_impact ?? '',
    response_procedure: p.response_procedure ?? '',
    resources: p.resources ?? '',
    contacts: p.contacts.map(contactDraftFrom),
    aspects: picked(p.aspects),
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

function contactFilled(c: ContactDraft): boolean {
  return c.kind === 'member'
    ? !!c.user_id
    : !!(c.name.trim() || c.role.trim() || c.phone.trim() || c.email.trim());
}

export function validatePlanForm(v: PlanFormValue): FormErrors {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) {
    errors['title'] = REQUIRED;
  }
  v.contacts.forEach((c, i) => {
    if (c.kind === 'external' && contactFilled(c) && !c.name.trim()) {
      errors[`contacts.${i}`] = 'environment.form.errors.contactName';
    }
  });
  return errors;
}

function contactsOut(contacts: readonly ContactDraft[]): EmergencyContact[] {
  return contacts.filter(contactFilled).map((c) =>
    c.kind === 'member'
      ? {
          user_id: c.user_id,
          role: text(c.role),
          phone: text(c.phone),
          email: text(c.email),
        }
      : {
          name: c.name.trim(),
          role: text(c.role),
          phone: text(c.phone),
          email: text(c.email),
        },
  );
}

export function toPlanCreate(v: PlanFormValue): PlanCreate {
  return {
    title: v.title.trim(),
    scenario: text(v.scenario),
    potential_impact: text(v.potential_impact),
    response_procedure: text(v.response_procedure),
    resources: text(v.resources),
    contacts: contactsOut(v.contacts),
    aspect_ids: v.aspects.map((a) => a.id),
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
  readonly direction: MetricDirection;
  /** Decimal text or ''. */
  readonly target_value: string;
  readonly target_year: string;
  readonly baseline_value: string;
  readonly baseline_year: string;
  readonly measurement_method: string;
  readonly ghg_scope: GhgScope | '';
  /** Decimal text (kg CO2e per unit) or ''. */
  readonly emission_factor: string;
  readonly factor_source: string;
  readonly factor_year: string;
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
    direction: 'decrease',
    target_value: '',
    target_year: '',
    baseline_value: '',
    baseline_year: '',
    measurement_method: '',
    ghg_scope: '',
    emission_factor: '',
    factor_source: '',
    factor_year: '',
    description: '',
    site: '',
    status: 'active',
    owner_user_id: '',
    department_id: '',
    collection_enabled: true,
    collection_rrule: 'FREQ=MONTHLY',
    collection_start: '',
    ...patch,
  };
}

function numText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function metricFormFrom(m: Metric): MetricFormValue {
  return {
    name: m.name,
    category: m.category,
    unit: m.unit,
    direction: m.direction ?? 'decrease',
    target_value: numText(m.target_value),
    target_year: numText(m.target_year),
    baseline_value: numText(m.baseline_value),
    baseline_year: numText(m.baseline_year),
    measurement_method: m.measurement_method ?? '',
    ghg_scope: m.ghg_scope ?? '',
    emission_factor: numText(m.emission_factor),
    factor_source: m.factor_source ?? '',
    factor_year: numText(m.factor_year),
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

export function validateMetricForm(v: MetricFormValue): FormErrors {
  const errors: Record<string, string> = {};
  if (!v.name.trim()) {
    errors['name'] = REQUIRED;
  }
  if (!v.unit.trim()) {
    errors['unit'] = REQUIRED;
  }
  checkDecimal(errors, 'emission_factor', v.emission_factor);
  checkDecimal(errors, 'target_value', v.target_value);
  checkDecimal(errors, 'baseline_value', v.baseline_value);
  checkYear(errors, 'target_year', v.target_year);
  checkYear(errors, 'baseline_year', v.baseline_year);
  checkYear(errors, 'factor_year', v.factor_year);
  if (v.target_value.trim() && !v.target_year.trim() && !errors['target_year']) {
    errors['target_year'] = 'environment.form.errors.targetYear';
  }
  return errors;
}

export function toMetricCreate(v: MetricFormValue): MetricCreate {
  return {
    name: v.name.trim(),
    category: v.category,
    unit: v.unit.trim(),
    direction: v.direction,
    target_value: decimalOrNull(v.target_value),
    target_year: yearOrNull(v.target_year),
    baseline_value: decimalOrNull(v.baseline_value),
    baseline_year: yearOrNull(v.baseline_year),
    measurement_method: text(v.measurement_method),
    ghg_scope: v.ghg_scope || null,
    emission_factor: decimalOrNull(v.emission_factor),
    factor_source: text(v.factor_source),
    factor_year: yearOrNull(v.factor_year),
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
  readonly source: MeasurementSource | '';
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
    source: '',
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
    source: v.source || null,
    site: text(v.site),
    note: text(v.note),
  };
}

export interface DrillFormValue {
  /** `datetime-local` value. */
  readonly held_at: string;
  readonly kind: DrillKind;
  readonly outcome: DrillOutcome | '';
  /** Org members who took part. */
  readonly participant_user_ids: readonly string[];
  /** Everyone else (contractors, visitors), as a number on top of the members. */
  readonly others: string;
  readonly findings: string;
  readonly lessons_learned: string;
  readonly plan_revision_needed: boolean;
}

export function emptyDrillForm(heldAt = ''): DrillFormValue {
  return {
    held_at: heldAt,
    kind: 'drill',
    outcome: '',
    participant_user_ids: [],
    others: '',
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
  if (v.others.trim() && !/^\d+$/.test(v.others.trim())) {
    errors['others'] = 'environment.form.errors.wholeNumber';
  }
  return errors;
}

/** The total head count: picked members plus the number of others (null when neither). */
export function drillHeadCount(v: DrillFormValue): number | null {
  const others = /^\d+$/.test(v.others.trim()) ? Number(v.others.trim()) : 0;
  const total = v.participant_user_ids.length + others;
  return total > 0 ? total : null;
}

export function toDrillCreate(v: DrillFormValue): DrillCreate {
  return {
    held_at: localToUtc(v.held_at) ?? '',
    kind: v.kind,
    outcome: v.outcome as DrillOutcome,
    participants: drillHeadCount(v),
    participant_user_ids: v.participant_user_ids,
    findings: text(v.findings),
    lessons_learned: text(v.lessons_learned),
    plan_revision_needed: v.plan_revision_needed,
  };
}
