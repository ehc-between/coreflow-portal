import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { BadgeTone } from '../../../shared/ui/badge/badge';
import {
  AssignmentStatus,
  CellStatus,
  CourseStatus,
  Effectiveness,
  TrainingRecord,
} from './training.models';

/** Backend module key (permission prefix, page-context `module`). */
export const TRAINING_MODULE = 'training';
/** Portal path, Transloco scope and guidance file name. */
export const TRAINING_SCOPE = 'training';

/** Error codes the training API returns in `{"detail": {"code"}}`, each with a message key. */
export const TRAINING_ERROR_CODES = [
  'document_required',
  'invalid_owner',
  'course_archived',
  'unknown_lesson',
  'lessons_required',
  'already_published',
  'course_not_published',
  'external_course',
  'no_approved_revision',
  'acknowledgement_required',
  'invalid_target',
  'assignment_closed',
  'invalid_user',
  'completed_in_future',
  'no_certificate',
  'module_disabled',
] as const;

const KNOWN_CODES = new Set<string>(TRAINING_ERROR_CODES);

/** i18n key (scope `training`) for a failed training request. */
export function trainingErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail = (error.error as { detail?: unknown } | null)?.detail;
    const code =
      detail && typeof detail === 'object' ? (detail as { code?: unknown }).code : undefined;
    if (typeof code === 'string' && KNOWN_CODES.has(code)) {
      return `training.errors.${code}`;
    }
    if (error.status === 403) {
      return 'training.errors.forbidden';
    }
    if (error.status === 404) {
      return 'training.errors.notFound';
    }
    if (error.status === 409) {
      return 'training.errors.conflict';
    }
    if (error.status === 422) {
      return 'training.errors.invalid';
    }
  }
  return 'training.errors.generic';
}

export function courseStatusTone(status: CourseStatus | string): BadgeTone {
  switch (status) {
    case 'published':
      return 'pass';
    case 'archived':
      return 'neutral';
    default:
      return 'info';
  }
}

export function assignmentTone(status: AssignmentStatus | string, overdue = false): BadgeTone {
  if (overdue && (status === 'assigned' || status === 'in_progress')) {
    return 'fail';
  }
  switch (status) {
    case 'completed':
      return 'pass';
    case 'in_progress':
      return 'accent';
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

export function cellTone(status: CellStatus | string): BadgeTone {
  switch (status) {
    case 'compliant':
      return 'pass';
    case 'expiring':
      return 'warn';
    case 'expired':
    case 'overdue':
      return 'fail';
    case 'assigned':
      return 'info';
    default:
      return 'neutral';
  }
}

export function effectivenessTone(value: Effectiveness | string | null): BadgeTone {
  switch (value) {
    case 'effective':
      return 'pass';
    case 'partially_effective':
      return 'warn';
    case 'not_effective':
      return 'fail';
    default:
      return 'neutral';
  }
}

/** Badge tone of a record's validity: expired, expiring within 30 days, or valid. */
export function recordValidityTone(record: TrainingRecord, now = new Date()): BadgeTone {
  if (!record.passed || record.expired) {
    return 'fail';
  }
  if (record.expires_at) {
    const days = (Date.parse(`${record.expires_at.slice(0, 19)}Z`) - now.getTime()) / 86_400_000;
    if (days <= 30) {
      return 'warn';
    }
  }
  return 'pass';
}

/** `YYYY-MM-DD` of a naive UTC date-time ('' when empty), for `<input type="date">`. */
export function toDateInput(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/**
 * A date picked in `<input type="date">` as the naive UTC date-time the API
 * expects (end of that day for due dates, start of the day otherwise); null when empty.
 */
export function fromDateInput(value: string, endOfDay = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`;
}

/** Today as `YYYY-MM-DD` (local calendar day). */
export function todayInput(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` `days` after `from` (local calendar). */
export function addDaysInput(days: number, from = new Date()): string {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return todayInput(next);
}

/**
 * The current user's training permissions in the selected org, as signals.
 * "Oversee" (report, assign or manage) unlocks everyone's assignments and records.
 */
@Injectable({ providedIn: 'root' })
export class TrainingAccess {
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly permissions = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );

  readonly canRead = computed(() => this.permissions().has('training:read'));
  readonly canWrite = computed(() => this.permissions().has('training:write'));
  readonly canAssign = computed(() => this.permissions().has('training:assign'));
  readonly canReport = computed(() => this.permissions().has('training:report'));
  readonly canManage = computed(() => this.permissions().has('training:manage'));
  readonly canOversee = computed(() => this.canReport() || this.canAssign() || this.canManage());
  readonly canSeeAudit = computed(() => this.permissions().has('audit:read'));
}
