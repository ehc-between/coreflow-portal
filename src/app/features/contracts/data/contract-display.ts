import { BadgeTone } from '../../../shared/ui/badge/badge';
import { ButtonVariant } from '../../../shared/ui/button/button';
import {
  CLOSED_STATUSES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  ContractAction,
  ContractStatus,
  DEADLINE_KINDS,
  DpaState,
} from './contract.models';

const STATUS_TONES: Readonly<Record<ContractStatus, BadgeTone>> = {
  draft: 'neutral',
  in_review: 'info',
  approved: 'accent',
  active: 'pass',
  expired: 'warn',
  terminated: 'fail',
};

export function contractStatusTone(status: string | null | undefined): BadgeTone {
  return STATUS_TONES[status as ContractStatus] ?? 'neutral';
}

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

export function deadlineKindKey(kind: string | null | undefined): string {
  return DEADLINE_KINDS.includes(kind ?? '')
    ? `contracts.deadlineKinds.${kind}`
    : 'contracts.deadlineKinds.other';
}

export function dpaTone(state: DpaState | null | undefined): BadgeTone {
  switch (state) {
    case 'covered':
      return 'pass';
    case 'missing':
      return 'fail';
    default:
      return 'neutral';
  }
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
      return 'primary';
    case 'reject':
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
