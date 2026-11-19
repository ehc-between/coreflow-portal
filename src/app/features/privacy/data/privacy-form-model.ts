import { DpiaRisk, LiaDraft, PrivacyRecord, RopaDraft } from './privacy.models';
import { fromDateInput, fromDateTimeInput, toDateInput, toDateTimeInput } from './privacy-dates';
import { FieldDef, FormValues, RegisterDef } from './privacy-registers';

export type FormMode = 'create' | 'edit';

/** Whether the caller holds a permission (defaults to "yes" for the PATCH diff). */
export type PermissionCheck = (permission: string) => boolean;

/**
 * The fields of a register shown in a mode (create-only / edit-only respected).
 * On edit, a field with `editPermission` is left out unless `can` grants it.
 */
export function fieldsFor(
  register: RegisterDef,
  mode: FormMode,
  can: PermissionCheck = () => true,
): readonly FieldDef[] {
  return register.fields.filter((f) =>
    mode === 'create' ? !f.editOnly : !f.createOnly && (!f.editPermission || can(f.editPermission)),
  );
}

/** Clock skew allowed before a `notFuture` date-time counts as in the future (the backend's). */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** The fields with `reasonOnChange` whose value differs from the stored one. */
export function changedReasonFields(
  register: RegisterDef,
  original: FormValues,
  values: FormValues,
): readonly FieldDef[] {
  return register.fields.filter(
    (f) =>
      f.reasonOnChange && !sameValue(wireValue(f, original[f.key]), wireValue(f, values[f.key])),
  );
}

/** Extra input to `validate` on edit: the stored values and the change reason. */
export interface ValidateContext {
  readonly original?: FormValues;
  readonly changeReason?: string;
  readonly can?: PermissionCheck;
  readonly now?: Date;
}

/** Form error key of a missing change reason (`validate` reports it under `reason`). */
export const REASON_ERROR_FIELD = 'reason';

/** Whether a field is visible for the current values. */
export function isVisible(field: FieldDef, values: FormValues): boolean {
  return field.showIf ? field.showIf(values) : true;
}

/** Kinds whose value is a list. */
const LIST_KINDS = new Set(['tags', 'multi', 'refs', 'entities', 'countries', 'customers']);

/**
 * Processing for a customer is processing as processor (the customer is the
 * controller): a ROPA entry opened for a customer starts with the processor role.
 */
export function withCustomerRole(register: RegisterDef, values: FormValues): FormValues {
  return register.key === 'ropa' && values['customer_id'] && values['role'] !== 'processor'
    ? { ...values, role: 'processor' }
    : values;
}

function emptyValue(field: FieldDef): unknown {
  switch (field.kind) {
    case 'tags':
    case 'multi':
    case 'refs':
    case 'entities':
    case 'countries':
    case 'customers':
    case 'risks':
      return [];
    case 'boolean':
      return false;
    case 'tristate':
      return null;
    case 'screening':
      return {};
    default:
      return '';
  }
}

/** Defaults for a new record (the backend fills in the rest). */
export function emptyValues(register: RegisterDef): FormValues {
  const out: Record<string, unknown> = {};
  for (const f of register.fields) {
    out[f.key] = emptyValue(f);
  }
  const first = (key: string) => register.fields.find((f) => f.key === key)?.options?.[0];
  for (const f of register.fields) {
    if (f.kind === 'select' && !f.required && DEFAULTED.has(`${register.key}.${f.key}`)) {
      out[f.key] = first(f.key) ?? '';
    }
  }
  return out;
}

/** Selects whose backend default is the first option, pre-filled on create. */
const DEFAULTED = new Set([
  'ropa.role',
  'dsr.channel',
  'processor.dpa_status',
  'retention.disposal_method',
  'consent.method',
]);

/** Form values from a stored record (dates converted for the inputs). */
export function valuesFromRecord(register: RegisterDef, record: PrivacyRecord): FormValues {
  const source = record as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of register.fields) {
    const raw = source[f.key];
    switch (f.kind) {
      case 'date':
        out[f.key] = toDateInput(raw);
        break;
      case 'datetime':
        out[f.key] = toDateTimeInput(raw);
        break;
      case 'tags':
      case 'multi':
      case 'refs':
      case 'entities':
      case 'countries':
      case 'customers':
        out[f.key] = Array.isArray(raw) ? [...raw] : [];
        break;
      case 'risks':
        out[f.key] = Array.isArray(raw) ? (raw as DpiaRisk[]).map((r) => ({ ...r })) : [];
        break;
      case 'boolean':
        out[f.key] = raw === true;
        break;
      case 'tristate':
        out[f.key] = typeof raw === 'boolean' ? raw : null;
        break;
      case 'screening':
        out[f.key] = raw && typeof raw === 'object' ? { ...(raw as object) } : {};
        break;
      case 'number':
        out[f.key] = typeof raw === 'number' ? String(raw) : '';
        break;
      default:
        out[f.key] = raw === null || raw === undefined ? '' : String(raw);
    }
  }
  return out;
}

/** The wire value of one field (null = cleared). */
export function wireValue(field: FieldDef, value: unknown): unknown {
  switch (field.kind) {
    case 'date':
      return fromDateInput(String(value ?? ''));
    case 'datetime':
      return fromDateTimeInput(String(value ?? ''));
    case 'number': {
      const text = String(value ?? '').trim();
      if (!text) {
        return null;
      }
      const n = Number(text);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'tags':
    case 'multi':
    case 'refs':
    case 'entities':
    case 'countries':
    case 'customers':
      return Array.isArray(value) ? value : [];
    case 'risks':
      return (Array.isArray(value) ? (value as DpiaRisk[]) : [])
        .filter((r) => r.description?.trim())
        .map((r) => ({
          description: r.description.trim(),
          likelihood: r.likelihood,
          severity: r.severity,
          mitigation: r.mitigation?.trim() || null,
          residual: r.residual || null,
        }));
    case 'boolean':
      return value === true;
    case 'tristate':
      return typeof value === 'boolean' ? value : null;
    case 'screening':
      return value && typeof value === 'object' ? value : {};
    case 'textarea':
      return String(value ?? '').trim() ? String(value) : null;
    default: {
      const text = String(value ?? '').trim();
      return text ? text : null;
    }
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The create body: every visible field with a value (empty ones are left to the
 * backend defaults; an empty owner means "me").
 */
export function createBody(register: RegisterDef, values: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fieldsFor(register, 'create')) {
    if (!isVisible(f, values)) {
      continue;
    }
    const v = wireValue(f, values[f.key]);
    if (v === null || (Array.isArray(v) && v.length === 0)) {
      continue;
    }
    if (f.kind === 'boolean' && v === false) {
      continue;
    }
    body[f.key] = v;
  }
  return body;
}

/** The PATCH body: only the fields that changed against the stored record. */
export function updateBody(
  register: RegisterDef,
  original: FormValues,
  values: FormValues,
  changeReason: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fieldsFor(register, 'edit')) {
    const before = wireValue(f, original[f.key]);
    const after = wireValue(f, values[f.key]);
    if (!sameValue(before, after)) {
      if (f.kind === 'owner' && after === null) {
        continue; // the owner cannot be cleared from the form
      }
      body[f.key] = after;
    }
  }
  if (Object.keys(body).length && changeReason.trim()) {
    body['change_reason'] = changeReason.trim().slice(0, 500);
  }
  return body;
}

/** Client-side checks: required fields; returns field key -> i18n key. */
export function validate(
  register: RegisterDef,
  values: FormValues,
  mode: FormMode,
  context: ValidateContext = {},
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  const now = (context.now ?? new Date()).getTime();
  for (const f of fieldsFor(register, mode, context.can)) {
    if (!isVisible(f, values)) {
      continue;
    }
    const v = wireValue(f, values[f.key]);
    if (f.required && (v === null || (Array.isArray(v) && v.length === 0))) {
      errors[f.key] = 'privacy.form.required';
    } else if (f.notFuture && typeof v === 'string' && Date.parse(`${v}Z`) > now + FUTURE_SKEW_MS) {
      errors[f.key] = 'privacy.form.notInFuture';
    }
  }
  // A retention rule needs its period: in months, or in words ("5 years after …").
  if (
    register.key === 'retention' &&
    wireValue(
      { key: 'retention_months', kind: 'number', section: 'rule' },
      values['retention_months'],
    ) === null &&
    !String(values['retention_period'] ?? '').trim()
  ) {
    errors['retention_months'] = 'privacy.form.periodRequired';
  }
  if (
    mode === 'edit' &&
    context.original &&
    !context.changeReason?.trim() &&
    changedReasonFields(register, context.original, values).length
  ) {
    errors[REASON_ERROR_FIELD] = 'privacy.form.changeReasonNeeded';
  }
  return errors;
}

/** Merge an assistant ROPA draft into the form (only fields the draft fills). */
export function mergeRopaDraft(values: FormValues, draft: RopaDraft): FormValues {
  const out: Record<string, unknown> = { ...values };
  const setText = (key: keyof RopaDraft) => {
    const v = draft[key];
    if (typeof v === 'string' && v.trim()) {
      out[key] = v.trim();
    }
  };
  const setList = (key: keyof RopaDraft) => {
    const v = draft[key];
    if (Array.isArray(v) && v.length) {
      out[key] = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim());
    }
  };
  if (!String(values['title'] ?? '').trim()) {
    setText('title');
  }
  setText('role');
  setText('purposes');
  setText('legal_basis');
  setText('retention_period');
  setText('security_measures');
  setList('data_subject_categories');
  setList('data_categories');
  setList('special_categories');
  setList('recipients');
  setList('systems');
  // Countries are stored as ISO codes; a draft naming a country in words is left out.
  if (Array.isArray(draft.transfer_countries)) {
    const codes = draft.transfer_countries
      .map((c) => String(c).trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));
    if (codes.length) {
      out['transfer_countries'] = codes;
    }
  }
  if (typeof draft.international_transfers === 'boolean') {
    out['international_transfers'] = draft.international_transfers;
  }
  return out;
}

/**
 * Prefill values for a new record from the route's query string (the gap fixes link to
 * `/privacy/<segment>/new?ropa_entry_id=…&legal_basis=…`) or from a create-from-here flow:
 * only fields of the register, converted to the form's value types. Unknown keys and
 * invalid option values are dropped.
 */
export function prefillValues(
  register: RegisterDef,
  source: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fieldsFor(register, 'create')) {
    const raw = source[f.key];
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    if (LIST_KINDS.has(f.kind)) {
      const list = (Array.isArray(raw) ? raw : String(raw).split(','))
        .map((v) => String(v).trim())
        .filter(Boolean);
      const allowed = f.options ? list.filter((v) => f.options!.includes(v)) : list;
      if (allowed.length) {
        out[f.key] = f.kind === 'countries' ? allowed.map((c) => c.toUpperCase()) : allowed;
      }
      continue;
    }
    switch (f.kind) {
      case 'boolean':
        out[f.key] = raw === true || raw === 'true' || raw === '1';
        break;
      case 'tristate':
        out[f.key] =
          raw === true || raw === 'true' ? true : raw === false || raw === 'false' ? false : null;
        break;
      case 'select':
        if (f.options?.includes(String(raw))) {
          out[f.key] = String(raw);
        }
        break;
      case 'number':
        if (Number.isFinite(Number(raw))) {
          out[f.key] = String(Math.trunc(Number(raw)));
        }
        break;
      case 'date':
        out[f.key] = toDateInput(String(raw));
        break;
      case 'datetime':
        out[f.key] = toDateTimeInput(String(raw));
        break;
      case 'country':
        out[f.key] = String(raw).trim().toUpperCase();
        break;
      case 'screening':
      case 'risks':
        break;
      default:
        out[f.key] = String(raw).slice(0, f.maxLength ?? 10000);
    }
  }
  return out;
}

/** Merge an assistant legitimate-interest draft into the form (empty fields only). */
export function mergeLiaDraft(values: FormValues, draft: LiaDraft): FormValues {
  const out: Record<string, unknown> = { ...values };
  for (const key of ['purpose_test', 'necessity_test', 'balancing_test', 'safeguards'] as const) {
    const v = draft[key];
    if (typeof v === 'string' && v.trim() && !String(values[key] ?? '').trim()) {
      out[key] = v.trim().slice(0, 10000);
    }
  }
  return out;
}
