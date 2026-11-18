import { formatNumber } from '@angular/common';
import { ButtonVariant } from '../../../shared/ui/button/button';
import {
  CLOSED_STATUSES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  CONTRACT_WARNINGS,
  ContractAction,
  DEADLINE_KINDS,
  DpaState,
  PERSONAL_DATA_ROLES,
  REVIEW_ITEM_KEYS,
  TRANSFER_BASES,
} from './contract.models';

/*
 * Labels and display values of the contract register. Colours come from the shared
 * tone map (`app-status-badge` / `toneFor`): a contract status is a `lifecycle`
 * value, the DPA status is mapped onto `compliance` values below.
 */

export function contractStatusKey(status: string | null | undefined): string {
  return (CONTRACT_STATUSES as readonly string[]).includes(status ?? '')
    ? `contracts.status.${status}`
    : 'contracts.status.unknown';
}

export function contractTypeKey(type: string | null | undefined): string {
  return (CONTRACT_TYPES as readonly string[]).includes(type ?? '')
    ? `contracts.types.${type}`
    : 'contracts.types.other';
}

/** The review date and review key dates are one kind ("review"); old servers sent `review_date`. */
export function deadlineKindKey(kind: string | null | undefined): string {
  const k = kind === 'review_date' ? 'review' : kind;
  return DEADLINE_KINDS.includes(k ?? '')
    ? `contracts.deadlineKinds.${k}`
    : 'contracts.deadlineKinds.other';
}

/** The DPA status as a `compliance` tone value (covered → pass, missing → gap …). */
export function dpaComplianceValue(state: DpaState | null | undefined): string {
  switch (state) {
    case 'covered':
      return 'covered';
    case 'incomplete':
      return 'partial';
    case 'missing':
      return 'gap';
    default:
      return 'not_applicable';
  }
}

export function warningKey(warning: string): string {
  return (CONTRACT_WARNINGS as readonly string[]).includes(warning)
    ? `contracts.warnings.${warning}.label`
    : 'contracts.warnings.other';
}

export function personalDataRoleKey(role: string | null | undefined): string {
  return (PERSONAL_DATA_ROLES as readonly string[]).includes(role ?? '')
    ? `contracts.personalDataRoles.${role}.label`
    : 'contracts.personalDataRoles.none.label';
}

export function transferBasisKey(basis: string | null | undefined): string {
  return (TRANSFER_BASES as readonly string[]).includes(basis ?? '')
    ? `contracts.transferBases.${basis}`
    : 'contracts.transferBases.none';
}

export function reviewItemKey(key: string): string {
  return REVIEW_ITEM_KEYS.includes(key)
    ? `contracts.reviewItems.${key}`
    : 'contracts.reviewItems.unknown';
}

export function isClosedContract(status: string | null | undefined): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(status ?? '');
}

/** Button style of a workflow action: the forward step is primary, exits are danger. */
export function actionVariant(action: ContractAction): ButtonVariant {
  switch (action) {
    case 'submit':
    case 'approve':
    case 'activate':
    case 'renew':
      return 'primary';
    case 'terminate':
      return 'danger';
    default:
      return 'secondary';
  }
}

/** Whole days from `today` to an ISO day (negative when past). */
export function daysUntil(day: string | null | undefined, today: Date = new Date()): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) {
    return null;
  }
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** Today as `YYYY-MM-DD` in the viewer's timezone. */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** An ISO day plus whole months, clamped to the month's last day ("2026-01-31" + 1 → "2026-02-28"). */
export function addMonthsIso(day: string, months: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** A decimal amount in the UI locale ("850000.00" → "850 000" in nb), or the raw text. */
export function formatAmount(value: string | number | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? formatNumber(n, locale, '1.0-2') : String(value);
}

/** Save a downloaded file (CSV export, calendar file) under `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
