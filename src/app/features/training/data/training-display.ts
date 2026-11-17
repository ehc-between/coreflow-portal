import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { ToneMeaning } from '../../../shared/ui/tones';
import { Assignment, CellStatus, CompletionRule, Course, TrainingRecord } from './training.models';

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
  'duplicate_rule',
  'recently_reminded',
  'invalid_clause_ref',
  'invalid_competence',
  'invalid_supplier',
  'expires_before_completed',
  'rate_limited',
] as const;

const KNOWN_CODES = new Set<string>(TRAINING_ERROR_CODES);

/** The `{"detail": {"code"}}` of a failed request, if any. */
export function trainingErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  const code =
    detail && typeof detail === 'object' ? (detail as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
}

/** i18n key (scope `training`) for a failed training request. */
export function trainingErrorKey(error: unknown): string {
  const code = trainingErrorCode(error);
  if (code && KNOWN_CODES.has(code)) {
    return `training.errors.${code}`;
  }
  if (error instanceof HttpErrorResponse) {
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

/** What an `app-status-badge` needs: the tone meaning, the tone value and the label. */
export interface BadgeView {
  readonly meaning: ToneMeaning;
  readonly value: string;
  readonly labelKey: string;
  readonly labelParams?: Record<string, unknown>;
}

/** Whether an assignment is still open (assigned or in progress). */
export function isOpenAssignment(a: Pick<Assignment, 'status'>): boolean {
  return a.status === 'assigned' || a.status === 'in_progress';
}

/** Status badge of an assignment; an open one past its due date reads "Forfalt". */
export function assignmentBadge(a: Pick<Assignment, 'status' | 'overdue'>): BadgeView {
  const status = a.overdue && isOpenAssignment(a) ? 'overdue' : a.status;
  // "assigned" is an open to-do (info), like "open" in the tone map.
  return {
    meaning: 'lifecycle',
    value: status === 'assigned' ? 'open' : status,
    labelKey: `training.assignmentStatus.${status}`,
  };
}

/** Status badge of a course (draft · published · archived). */
export function courseBadge(status: string): BadgeView {
  return { meaning: 'lifecycle', value: status, labelKey: `training.status.${status}` };
}

/**
 * Status badge of a matrix cell / training need. Valid training is done (green); an
 * expired certificate is a real gap (red); overdue and expiring are to-dos (amber).
 */
export function cellBadge(status: CellStatus | string): BadgeView {
  const value: Record<string, string> = {
    compliant: 'compliant',
    expiring: 'expiring',
    expired: 'non_compliant',
    overdue: 'overdue',
    assigned: 'open',
    missing: 'not_assessed',
  };
  return {
    meaning:
      status === 'expiring' || status === 'overdue' || status === 'assigned'
        ? 'lifecycle'
        : 'compliance',
    value: value[status] ?? 'not_assessed',
    labelKey: `training.cell.${status}`,
  };
}

/** Badge of a course-level or per-record effectiveness result. */
export function effectivenessBadge(value: string | null | undefined): BadgeView {
  const map: Record<string, string> = {
    effective: 'compliant',
    partially_effective: 'partial',
    not_effective: 'non_compliant',
  };
  return {
    meaning: 'compliance',
    value: (value && map[value]) || 'not_assessed',
    labelKey: value ? `training.effectiveness.${value}` : 'training.effectiveness.pending',
  };
}

/** Days from now until a naive UTC date-time (negative when past). */
export function daysUntil(value: string | null | undefined, now = new Date()): number | null {
  if (!value) {
    return null;
  }
  const at = Date.parse(`${value.slice(0, 19)}Z`);
  return Number.isNaN(at) ? null : (at - now.getTime()) / 86_400_000;
}

/** Whether a record is valid now but expires within `days` (default 30). */
export function isExpiringSoon(record: TrainingRecord, now = new Date(), days = 30): boolean {
  const left = daysUntil(record.expires_at, now);
  return record.passed && !record.expired && left !== null && left <= days;
}

/** Validity badge of a record: not passed, expired, expires soon, valid until … or valid. */
export function recordBadge(record: TrainingRecord, now = new Date()): BadgeView {
  if (!record.passed) {
    return { meaning: 'lifecycle', value: 'failed', labelKey: 'training.records.notPassed' };
  }
  if (record.expired) {
    return { meaning: 'compliance', value: 'non_compliant', labelKey: 'training.records.expired' };
  }
  if (isExpiringSoon(record, now)) {
    return { meaning: 'lifecycle', value: 'expiring', labelKey: 'training.records.expiringSoon' };
  }
  return { meaning: 'compliance', value: 'compliant', labelKey: 'training.records.valid' };
}

/**
 * How a learner completes the course. Older backends do not send
 * `completion_rule`; derive it from the kind and the number of quiz questions.
 */
export function completionRuleOf(
  course: Pick<Course, 'kind' | 'quiz_count'> & { readonly completion_rule?: CompletionRule },
): CompletionRule {
  if (course.completion_rule) {
    return course.completion_rule;
  }
  if (course.kind === 'external') {
    return 'external';
  }
  if (course.kind === 'read_and_understood') {
    return 'read_ack';
  }
  return course.quiz_count > 0 ? 'quiz' : 'lessons';
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
 * `YYYY-MM-DD` `months` after a `YYYY-MM-DD` date (end-of-month safe: 31 Jan + 1 month
 * = 28/29 Feb), or '' when the input is not a date.
 */
export function addMonthsInput(date: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !Number.isInteger(months)) {
    return '';
  }
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const target = new Date(y, m + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return todayInput(new Date(target.getFullYear(), target.getMonth(), Math.min(d, lastDay)));
}

/** The browser download file name of a CSV export (`training-records-2026-11-17.csv`). */
export function exportFileName(kind: string, now = new Date()): string {
  return `training-${kind}-${todayInput(now)}.csv`;
}

/** Trigger a browser download of a Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  readonly canWriteTasks = computed(() => this.permissions().has('tasks:write'));
  readonly canReadPeople = computed(() => this.permissions().has('people:read'));
  readonly canReadSuppliers = computed(() => this.permissions().has('suppliers:read'));

  /**
   * The module's sub-navigation (`app-module-nav`): everyone sees their own training,
   * the catalogue, assignments, records and plan; the matrix is for people who
   * oversee training.
   */
  readonly navItems = computed<readonly ModuleNavItem[]>(() => {
    const items: ModuleNavItem[] = [
      { labelKey: 'training.nav.mine', link: '/training', exact: true, testId: 'nav-mine' },
      { labelKey: 'training.nav.courses', link: '/training/courses', testId: 'nav-courses' },
      {
        labelKey: 'training.nav.assignments',
        link: '/training/assignments',
        testId: 'nav-assignments',
      },
      { labelKey: 'training.nav.records', link: '/training/records', testId: 'nav-records' },
      { labelKey: 'training.nav.plan', link: '/training/plan', testId: 'nav-plan' },
    ];
    if (this.canOversee()) {
      items.push({
        labelKey: 'training.nav.matrix',
        link: '/training/matrix',
        testId: 'nav-matrix',
      });
    }
    return items;
  });
}
