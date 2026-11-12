import { DpiaRisk, PrivacyRecord, RopaDraft } from './privacy.models';
import { fromDateInput, fromDateTimeInput, toDateInput, toDateTimeInput } from './privacy-dates';
import { FieldDef, FormValues, RegisterDef } from './privacy-registers';

export type FormMode = 'create' | 'edit';

/** The fields of a register shown in a mode (create-only / edit-only respected). */
export function fieldsFor(register: RegisterDef, mode: FormMode): readonly FieldDef[] {
  return register.fields.filter((f) => (mode === 'create' ? !f.editOnly : !f.createOnly));
}

/** Whether a field is visible for the current values. */
export function isVisible(field: FieldDef, values: FormValues): boolean {
  return field.showIf ? field.showIf(values) : true;
}

function emptyValue(field: FieldDef): unknown {
  switch (field.kind) {
    case 'tags':
    case 'multi':
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
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const f of fieldsFor(register, mode)) {
    if (!f.required || !isVisible(f, values)) {
      continue;
    }
    const v = wireValue(f, values[f.key]);
    if (v === null || (Array.isArray(v) && v.length === 0)) {
      errors[f.key] = 'privacy.form.required';
    }
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
  setList('transfer_countries');
  if (typeof draft.international_transfers === 'boolean') {
    out['international_transfers'] = draft.international_transfers;
  }
  return out;
}
