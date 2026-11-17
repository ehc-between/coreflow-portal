import {
  CONTRACT_TYPES,
  Contract,
  ContractCreate,
  ContractExtraction,
  ContractType,
  ContractUpdate,
  PARTY_ROLES,
  PERSONAL_DATA_ROLES,
  PartyIn,
  PartyRole,
  PersonalDataRole,
  TRANSFER_BASES,
  TransferBasis,
  VALUE_PERIODS,
  ValuePeriod,
} from './contract.models';

/** A party row in the form (strings for the inputs). */
export interface PartyDraft {
  readonly name: string;
  /** '' = let the server pick the role from the contract type. */
  readonly role: PartyRole | '';
  /** The supplier-register record the party is linked to. */
  readonly supplier_id: string | null;
  readonly supplier_label: string | null;
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
  readonly personal_data_role: PersonalDataRole;
  readonly transfer_basis: TransferBasis | '';
  readonly transfer_countries: string;
  readonly ict_critical: boolean;
  readonly involves_ai_system: boolean;
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
  /** Create-from-supplier flow: link the counterparty to this supplier. */
  readonly supplier_id: string;
}

export const MAX_PARTIES = 20;

export function emptyParty(overrides: Partial<PartyDraft> = {}): PartyDraft {
  return {
    name: '',
    role: '',
    supplier_id: null,
    supplier_label: null,
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
    personal_data_role: 'none',
    transfer_basis: '',
    transfer_countries: '',
    ict_critical: false,
    involves_ai_system: false,
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
    supplier_id: '',
  };
}

/** The GDPR role of a contract, reading the legacy flag when the server sent no role. */
export function roleOf(c: {
  readonly personal_data_role?: PersonalDataRole | null;
  readonly processes_personal_data: boolean;
}): PersonalDataRole {
  return c.personal_data_role ?? (c.processes_personal_data ? 'they_process' : 'none');
}

export function formFromContract(c: Contract): ContractFormValue {
  return {
    title: c.title,
    contract_type: c.contract_type,
    description: c.description ?? '',
    owner_user_id: c.owner?.id ?? '',
    department_id: c.department_id ?? '',
    confidential: c.confidential,
    personal_data_role: roleOf(c),
    transfer_basis: c.transfer_basis ?? '',
    transfer_countries: c.transfer_countries ?? '',
    ict_critical: !!c.ict_critical,
    involves_ai_system: !!c.involves_ai_system,
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
    supplier_id: '',
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

/**
 * A decimal amount as the API expects it (`"1234.5"`), or null. Tolerant of how
 * people type money: spaces, no-break spaces and apostrophes as thousand separators,
 * a comma or a point as the decimal mark ("850 000,50", "850,000.50", "850.000,50").
 */
export function normaliseAmount(value: string): string | null {
  let cleaned = value.replace(/[\s\u00a0\u202f']/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // The later mark is the decimal mark; the other one groups thousands.
    const decimal = lastComma > lastDot ? ',' : '.';
    const group = decimal === ',' ? '.' : ',';
    cleaned = cleaned.split(group).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    // "850,000" (thousands) vs "850,5" (decimals): three digits after one comma = grouping.
    const parts = cleaned.split(',');
    cleaned =
      parts.length > 2 || (parts.length === 2 && parts[1].length === 3)
        ? parts.join('')
        : cleaned.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts.join('');
    }
  }
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? cleaned : null;
}

/** The amount as people read it in the UI language ("850 000" in nb, "850,000" in en). */
export function displayAmount(value: string, locale: string): string {
  const normal = normaliseAmount(value);
  if (normal === null) {
    return value;
  }
  const n = Number(normal);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: normal.includes('.') && !normal.endsWith('.00') ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function fields(v: ContractFormValue) {
  return {
    description: text(v.description),
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    confidential: v.confidential,
    personal_data_role: v.personal_data_role,
    processes_personal_data: v.personal_data_role !== 'none',
    transfer_basis:
      v.personal_data_role === 'none' && v.contract_type !== 'dpa'
        ? null
        : v.transfer_basis || null,
    transfer_countries:
      v.transfer_basis && v.transfer_basis !== 'none' ? text(v.transfer_countries) : null,
    ict_critical: v.ict_critical,
    involves_ai_system: v.involves_ai_system,
    value_amount: normaliseAmount(v.value_amount),
    currency: text(v.currency)?.toUpperCase() ?? null,
    value_period: v.value_period || null,
    start_date: v.start_date || null,
    end_date: v.end_date || null,
    signed_date: v.signed_date || null,
    review_date: v.review_date || null,
    notice_period_days: int(v.notice_period_days),
    auto_renew: v.auto_renew,
    // The renewal term only means something for contracts that renew by themselves.
    renewal_term_months: v.auto_renew ? int(v.renewal_term_months) : null,
    renewal_notes: text(v.renewal_notes),
    governing_law: text(v.governing_law),
  };
}

export function partyIn(p: PartyDraft): PartyIn {
  return {
    name: p.name.trim(),
    ...(p.role ? { role: p.role } : {}),
    ...(p.supplier_id && !p.is_internal ? { supplier_id: p.supplier_id } : {}),
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
    ...(v.supplier_id ? { supplier_id: v.supplier_id } : {}),
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
  const term = v.auto_renew ? v.renewal_term_months.trim() : '';
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

function asRole(value: string | null | undefined): PartyRole | '' {
  return (PARTY_ROLES as readonly string[]).includes(value ?? '') ? (value as PartyRole) : '';
}

function asPersonalDataRole(value: unknown): PersonalDataRole | null {
  return (PERSONAL_DATA_ROLES as readonly string[]).includes(String(value))
    ? (value as PersonalDataRole)
    : null;
}

function asTransferBasis(value: unknown): TransferBasis | '' {
  return (TRANSFER_BASES as readonly string[]).includes(String(value))
    ? (value as TransferBasis)
    : '';
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Seed the new-contract form from a create-from-here prefill (supplier → contract,
 * contract → data processing agreement). Unknown keys are ignored.
 */
export function formFromPrefill(
  base: ContractFormValue,
  prefill: Readonly<Record<string, unknown>>,
): ContractFormValue {
  const type = asType(str(prefill['contract_type']));
  const role =
    asPersonalDataRole(prefill['personal_data_role']) ??
    (prefill['processes_personal_data'] === true ? 'they_process' : null);
  const rawParties: unknown[] = Array.isArray(prefill['parties']) ? prefill['parties'] : [];
  const parties: PartyDraft[] = rawParties
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) => str(p['name']).trim())
    .slice(0, MAX_PARTIES)
    .map((p) =>
      emptyParty({
        name: str(p['name']),
        role: asRole(str(p['role'])),
        is_internal: p['is_internal'] === true,
        org_number: str(p['org_number']),
        supplier_id: str(p['supplier_id']) || null,
        supplier_label: str(p['supplier_id']) ? str(p['name']) : null,
      }),
    );
  return {
    ...base,
    title: str(prefill['title']) || base.title,
    contract_type: type ?? base.contract_type,
    description: str(prefill['description']) || base.description,
    personal_data_role: role ?? base.personal_data_role,
    transfer_basis: asTransferBasis(prefill['transfer_basis']) || base.transfer_basis,
    transfer_countries: str(prefill['transfer_countries']) || base.transfer_countries,
    start_date: day(str(prefill['start_date'])) ?? base.start_date,
    parties: parties.length ? parties : base.parties,
    supplier_id: str(prefill['supplier_id']) || base.supplier_id,
  };
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
    personal_data_role:
      x.processes_personal_data === true && v.personal_data_role === 'none'
        ? 'they_process'
        : v.personal_data_role,
    parties,
  };
}

export function isValuePeriod(value: string): value is ValuePeriod {
  return (VALUE_PERIODS as readonly string[]).includes(value);
}
