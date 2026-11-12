import {
  CONTRACT_TYPES,
  Contract,
  ContractCreate,
  ContractExtraction,
  ContractType,
  ContractUpdate,
  PARTY_ROLES,
  PartyIn,
  PartyRole,
  VALUE_PERIODS,
  ValuePeriod,
} from './contract.models';

/** A party row in the form (strings for the inputs). */
export interface PartyDraft {
  readonly name: string;
  readonly role: PartyRole;
  readonly is_internal: boolean;
  readonly org_number: string;
  readonly contact_name: string;
  readonly contact_email: string;
}

/**
 * The contract form state: plain strings and booleans bound to the inputs. Empty
 * strings mean "not set" and go to the API as null.
 */
export interface ContractFormValue {
  readonly title: string;
  readonly contract_type: ContractType;
  readonly description: string;
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly confidential: boolean;
  readonly processes_personal_data: boolean;
  readonly value_amount: string;
  readonly currency: string;
  readonly value_period: ValuePeriod | '';
  readonly start_date: string;
  readonly end_date: string;
  readonly signed_date: string;
  readonly review_date: string;
  readonly notice_period_days: string;
  readonly auto_renew: boolean;
  readonly renewal_term_months: string;
  readonly renewal_notes: string;
  readonly governing_law: string;
  readonly parties: readonly PartyDraft[];
}

export const MAX_PARTIES = 20;

export function emptyParty(overrides: Partial<PartyDraft> = {}): PartyDraft {
  return {
    name: '',
    role: 'other',
    is_internal: false,
    org_number: '',
    contact_name: '',
    contact_email: '',
    ...overrides,
  };
}

export function emptyContractForm(ownerUserId = ''): ContractFormValue {
  return {
    title: '',
    contract_type: 'customer',
    description: '',
    owner_user_id: ownerUserId,
    department_id: '',
    confidential: false,
    processes_personal_data: false,
    value_amount: '',
    currency: '',
    value_period: '',
    start_date: '',
    end_date: '',
    signed_date: '',
    review_date: '',
    notice_period_days: '',
    auto_renew: false,
    renewal_term_months: '',
    renewal_notes: '',
    governing_law: '',
    parties: [],
  };
}

export function formFromContract(c: Contract): ContractFormValue {
  return {
    title: c.title,
    contract_type: c.contract_type,
    description: c.description ?? '',
    owner_user_id: c.owner?.id ?? '',
    department_id: c.department_id ?? '',
    confidential: c.confidential,
    processes_personal_data: c.processes_personal_data,
    value_amount: c.value_amount ?? '',
    currency: c.currency ?? '',
    value_period: c.value_period ?? '',
    start_date: c.start_date ?? '',
    end_date: c.end_date ?? '',
    signed_date: c.signed_date ?? '',
    review_date: c.review_date ?? '',
    notice_period_days: c.notice_period_days === null ? '' : String(c.notice_period_days),
    auto_renew: c.auto_renew,
    renewal_term_months: c.renewal_term_months === null ? '' : String(c.renewal_term_months),
    renewal_notes: c.renewal_notes ?? '',
    governing_law: c.governing_law ?? '',
    parties: [],
  };
}

const text = (value: string): string | null => value.trim() || null;

function int(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : null;
}

/** A decimal amount as the API expects it (`"1234.5"`), or null. Accepts a comma. */
export function normaliseAmount(value: string): string | null {
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? cleaned : null;
}

function fields(v: ContractFormValue) {
  return {
    description: text(v.description),
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    confidential: v.confidential,
    processes_personal_data: v.processes_personal_data,
    value_amount: normaliseAmount(v.value_amount),
    currency: text(v.currency)?.toUpperCase() ?? null,
    value_period: v.value_period || null,
    start_date: v.start_date || null,
    end_date: v.end_date || null,
    signed_date: v.signed_date || null,
    review_date: v.review_date || null,
    notice_period_days: int(v.notice_period_days),
    auto_renew: v.auto_renew,
    renewal_term_months: int(v.renewal_term_months),
    renewal_notes: text(v.renewal_notes),
    governing_law: text(v.governing_law),
  };
}

function partyIn(p: PartyDraft): PartyIn {
  return {
    name: p.name.trim(),
    role: p.role,
    is_internal: p.is_internal,
    org_number: text(p.org_number),
    contact_name: text(p.contact_name),
    contact_email: text(p.contact_email),
  };
}

export function toCreateRequest(v: ContractFormValue): ContractCreate {
  const body: ContractCreate = {
    title: v.title.trim(),
    contract_type: v.contract_type,
    ...fields(v),
    parties: v.parties.filter((p) => p.name.trim()).map(partyIn),
  };
  // Without an owner the backend defaults to the caller.
  return body.owner_user_id ? body : { ...body, owner_user_id: undefined };
}

/** Only the changed fields (PATCH applies the keys present), plus the change reason. */
export function toUpdateRequest(
  original: ContractFormValue,
  v: ContractFormValue,
  changeReason: string,
): ContractUpdate {
  const before: Record<string, unknown> = {
    title: original.title.trim(),
    contract_type: original.contract_type,
    ...fields(original),
  };
  const after: Record<string, unknown> = {
    title: v.title.trim(),
    contract_type: v.contract_type,
    ...fields(v),
  };
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (value !== before[key]) {
      changed[key] = value;
    }
  }
  const reason = changeReason.trim();
  return { ...changed, ...(reason ? { change_reason: reason } : {}) } as ContractUpdate;
}

/** Field-level problems the form flags before submitting (i18n keys under `contracts.form.invalid`). */
export function validateContractForm(v: ContractFormValue): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) {
    errors['title'] = 'contracts.form.invalid.titleRequired';
  }
  if (v.start_date && v.end_date && v.end_date < v.start_date) {
    errors['end_date'] = 'contracts.form.invalid.endBeforeStart';
  }
  if (v.value_amount.trim() && normaliseAmount(v.value_amount) === null) {
    errors['value_amount'] = 'contracts.form.invalid.amount';
  }
  if (v.currency.trim() && !/^[A-Za-z]{3}$/.test(v.currency.trim())) {
    errors['currency'] = 'contracts.form.invalid.currency';
  }
  const notice = v.notice_period_days.trim();
  if (notice && (int(notice) === null || (int(notice) ?? 0) < 0)) {
    errors['notice_period_days'] = 'contracts.form.invalid.wholeNumber';
  }
  const term = v.renewal_term_months.trim();
  if (term && (int(term) === null || (int(term) ?? 0) < 1)) {
    errors['renewal_term_months'] = 'contracts.form.invalid.wholeNumber';
  }
  if (v.parties.length > MAX_PARTIES) {
    errors['parties'] = 'contracts.errors.too_many_parties';
  }
  return errors;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: string | null | undefined): string | null =>
  value && ISO_DAY.test(value.trim()) ? value.trim() : null;

function asType(value: string | null | undefined): ContractType | null {
  return (CONTRACT_TYPES as readonly string[]).includes(value ?? '')
    ? (value as ContractType)
    : null;
}

function asRole(value: string | null | undefined): PartyRole {
  return (PARTY_ROLES as readonly string[]).includes(value ?? '') ? (value as PartyRole) : 'other';
}

/**
 * Fill the form from an extraction result. Only values the extraction found are
 * taken; fields the user already filled are kept unless `overwrite` is set. Parties
 * are appended unless one with the same name is already listed.
 */
export function applyExtraction(
  v: ContractFormValue,
  x: ContractExtraction,
  overwrite = false,
): ContractFormValue {
  const pick = (current: string, found: string | null | undefined): string =>
    found && (overwrite || !current.trim()) ? found : current;
  const known = new Set(v.parties.map((p) => p.name.trim().toLowerCase()));
  const parties = [...v.parties];
  for (const p of x.parties ?? []) {
    const name = p.name?.trim();
    if (name && !known.has(name.toLowerCase()) && parties.length < MAX_PARTIES) {
      known.add(name.toLowerCase());
      parties.push(emptyParty({ name, role: asRole(p.role), org_number: p.org_number ?? '' }));
    }
  }
  const type = asType(x.contract_type);
  const currency = x.currency && /^[A-Za-z]{3}$/.test(x.currency) ? x.currency.toUpperCase() : null;
  return {
    ...v,
    title: pick(v.title, x.title?.trim()),
    contract_type: type && (overwrite || !v.title.trim()) ? type : v.contract_type,
    start_date: pick(v.start_date, day(x.start_date)),
    end_date: pick(v.end_date, day(x.end_date)),
    signed_date: pick(v.signed_date, day(x.signed_date)),
    notice_period_days: pick(
      v.notice_period_days,
      x.notice_period_days != null && x.notice_period_days >= 0
        ? String(x.notice_period_days)
        : null,
    ),
    renewal_term_months: pick(
      v.renewal_term_months,
      x.renewal_term_months != null && x.renewal_term_months >= 1
        ? String(x.renewal_term_months)
        : null,
    ),
    renewal_notes: pick(v.renewal_notes, x.renewal_terms?.trim()),
    value_amount: pick(
      v.value_amount,
      x.value_amount != null && x.value_amount >= 0 ? String(x.value_amount) : null,
    ),
    currency: pick(v.currency, currency),
    governing_law: pick(v.governing_law, x.governing_law?.trim()),
    auto_renew: x.auto_renew ?? v.auto_renew,
    processes_personal_data: x.processes_personal_data ?? v.processes_personal_data,
    parties,
  };
}

export function isValuePeriod(value: string): value is ValuePeriod {
  return (VALUE_PERIODS as readonly string[]).includes(value);
}
