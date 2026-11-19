import { HttpErrorResponse } from '@angular/common/http';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { httpErrorMessageKey } from '../../../core/http/error.interceptor';
import { CustomerRef, CustomerStatus } from '../../../shared/customers/customer.models';
import { StatusLineTone } from '../../../shared/kit/record-sections';
import { pluralKey } from '../../../shared/i18n/plural';
import { OverviewFacts, RegistryLookup, RegistrySnapshot } from './customer.models';

/** Codes the customer endpoints return in a 4xx `detail: {code}`; each has `customers.errors.<code>`. */
export const CUSTOMER_ERROR_CODES = [
  'customer_org_number_taken',
  'invalid_orgnr',
  'orgnr_not_found',
  'registry_unavailable',
  'invalid_status',
  'invalid_user',
  'name_required',
  'invalid_customer',
  'merge_into_self',
  'match_not_pending',
] as const;

export type CustomerErrorCode = (typeof CUSTOMER_ERROR_CODES)[number];

/** The translation key for a failed customer request (the backend's English text is never shown). */
export function customerErrorKey(error: unknown): string {
  const detail = codedErrorDetail(error);
  if (detail && (CUSTOMER_ERROR_CODES as readonly string[]).includes(detail.code)) {
    return `customers.errors.${detail.code}`;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'customers.errors.forbidden';
    }
    if (error.status === 422) {
      return 'customers.errors.invalid';
    }
    return httpErrorMessageKey(error.status);
  }
  return 'customers.errors.generic';
}

/** The existing customer of a 409 `customer_org_number_taken`, or null. */
export function takenBy(error: unknown): CustomerRef | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return null;
  }
  const detail = (error.error as { detail?: { code?: unknown; customer?: unknown } } | null)
    ?.detail;
  const c = detail?.customer as Partial<CustomerRef> | undefined;
  return detail?.code === 'customer_org_number_taken' && c?.id && c.name
    ? {
        id: c.id,
        code: c.code ?? '',
        name: c.name,
        status: c.status ?? 'active',
        deleted: !!c.deleted,
      }
    : null;
}

/** Digits of a Norwegian org. number (9 digits after dropping spaces, `NO`, `MVA`), else null. */
export function norwegianOrgNumber(raw: string | null | undefined): string | null {
  const value = (raw ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^NO/, '')
    .replace(/MVA$/, '');
  return /^\d{9}$/.test(value.replace(/[.-]/g, '')) ? value.replace(/[.-]/g, '') : null;
}

const MOD11_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

/** Whether a 9-digit Norwegian org. number passes the mod-11 check (a warning only, D4). */
export function orgNumberChecksumOk(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) {
    return false;
  }
  const sum = MOD11_WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const rest = 11 - (sum % 11);
  const check = rest === 11 ? 0 : rest;
  return check !== 10 && check === Number(digits[8]);
}

/** "912 345 678" for display. */
export function formatOrgNumber(value: string | null | undefined): string {
  const v = value ?? '';
  return /^\d{9}$/.test(v) ? `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}` : v;
}

/** One part of the status sentence: a `customers` key and its params. */
export interface SentencePart {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

export interface StatusSentence {
  readonly tone: StatusLineTone;
  /** "Aktiv kunde" / "Prospekt" / "Tidligere kunde". */
  readonly leadKey: string;
  /** At most three parts, joined with " · " after a dash; empty → `restKey`. */
  readonly parts: readonly SentencePart[];
  /** The tail when there are no parts ("ingen åpne saker"), or null. */
  readonly restKey: string | null;
}

const RENEWAL_WINDOW_DAYS = 120;
const NOTICE_WINDOW_DAYS = 60;

function daysUntil(day: string, today: Date): number {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const target = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

/**
 * The customer card's status sentence (docs/customer-register-design.md §5):
 * "Aktiv kunde – 2 åpne reklamasjoner · kontrakt fornyes om 45 dager". Parts in
 * order: open claims, open breaches, the next renewal (≤ 120 days, or the notice
 * date when it is within 60 days), open customer requirements, falling
 * satisfaction; at most three. Any part is a to-do (`warn`); with none an active
 * customer is `pass` ("ingen åpne saker"), prospect and former are `neutral`.
 */
export function statusSentence(
  status: CustomerStatus,
  facts: OverviewFacts | null | undefined,
  today: Date = new Date(),
): StatusSentence {
  const f = facts ?? {};
  const parts: SentencePart[] = [];
  const count = (key: string, n: number | undefined) => {
    if (n && n > 0) {
      parts.push({ key: pluralKey(`customers.sentence.${key}`, n), params: { count: n } });
    }
  };
  count('claims', f.open_claims);
  count('breaches', f.open_breaches);
  const renewal = f.next_renewal;
  if (renewal) {
    const notice = renewal.notice_by ? daysUntil(renewal.notice_by, today) : null;
    if (notice !== null && notice >= 0 && notice <= NOTICE_WINDOW_DAYS) {
      parts.push({ key: 'customers.sentence.noticeBy', params: { date: renewal.notice_by } });
    } else if (renewal.days >= 0 && renewal.days <= RENEWAL_WINDOW_DAYS) {
      parts.push({
        key: pluralKey('customers.sentence.renewal', renewal.days),
        params: { count: renewal.days },
      });
    }
  }
  count('requirements', f.open_requirements);
  if (f.satisfaction?.trend === 'down') {
    parts.push({ key: 'customers.sentence.satisfactionDown' });
  }
  const shown = parts.slice(0, 3);
  const tone: StatusLineTone = shown.length ? 'warn' : status === 'active' ? 'pass' : 'neutral';
  return {
    tone,
    leadKey: `customers.sentence.status.${status}`,
    parts: shown,
    restKey: shown.length ? null : `customers.sentence.rest.${status}`,
  };
}

/** Warning keys for a Brønnøysund snapshot (bankrupt, under liquidation, deleted). */
export function registryWarnings(registry: RegistrySnapshot | null | undefined): string[] {
  if (!registry) {
    return [];
  }
  const out: string[] = [];
  if (registry.bankrupt) {
    out.push('customers.registry.bankrupt');
  }
  if (registry.under_liquidation) {
    out.push('customers.registry.underLiquidation');
  }
  if (registry.deleted_on) {
    out.push('customers.registry.deleted');
  }
  return out;
}

/** The form fields a Brønnøysund lookup can fill. */
export const LOOKUP_FIELDS = [
  'name',
  'legal_name',
  'org_form',
  'address_line',
  'postal_code',
  'city',
  'country',
  'industry_code',
  'industry_label',
  'website',
] as const;
export type LookupField = (typeof LOOKUP_FIELDS)[number];

/**
 * Fill the empty fields of a draft from a lookup; typed values are never
 * overwritten. Returns the new values and which fields were filled.
 */
export function fillFromLookup<T extends Record<LookupField, string>>(
  draft: T,
  lookup: RegistryLookup,
): { readonly draft: T; readonly filled: readonly LookupField[] } {
  const next = { ...draft };
  const filled: LookupField[] = [];
  for (const field of LOOKUP_FIELDS) {
    const value = lookup[field];
    if (!draft[field].trim() && typeof value === 'string' && value.trim()) {
      (next as Record<LookupField, string>)[field] = value.trim();
      filled.push(field);
    }
  }
  return { draft: next, filled };
}

/** Plain words for why a mention was not linked automatically. */
export function matchReasonKey(reason: string): string {
  return ['same_core_name', 'similar_name', 'ambiguous'].includes(reason)
    ? `customers.matches.reason.${reason}`
    : 'customers.matches.reason.similar_name';
}
