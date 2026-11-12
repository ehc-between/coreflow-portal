/**
 * DTOs for platform events (F3): watchers, notification rules, reminder and
 * escalation settings, department leads, and the current user's category
 * preferences and quiet hours. Mirror `app/platform/events/schemas.py`.
 */

// --- watchers ------------------------------------------------------------------------

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

/** `GET`/`PUT`/`DELETE v1/orgs/{org}/watchers?entity_type&entity_id`. */
export interface WatchersRead {
  readonly watching: boolean;
  readonly count: number;
  readonly users: readonly UserRef[];
}

// --- notification rules ----------------------------------------------------------------

export const RECIPIENT_TYPES = [
  'owner',
  'assignee',
  'watchers',
  'department_lead',
  'role',
  'department',
  'user',
] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

/** Recipient types that need a `value` (a role key, department id or user id). */
export const VALUE_RECIPIENT_TYPES: readonly RecipientType[] = ['role', 'department', 'user'];

export const CHANNELS = ['in_app', 'email', 'digest'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface RecipientSpec {
  readonly type: RecipientType;
  readonly value?: string | null;
}

/** One registered event kind with the org's effective rule (or the kind's default). */
export interface NotificationRule {
  readonly event_kind: string;
  readonly module: string;
  readonly category: string;
  readonly title_key: string;
  /** False for timeline-only kinds (e.g. `module.enabled`): no rule can be set. */
  readonly notify: boolean;
  readonly recipients: readonly RecipientSpec[];
  readonly channels: readonly Channel[];
  readonly enabled: boolean;
  readonly is_default: boolean;
}

/** `PUT v1/orgs/{org}/notification-rules/{event_kind}`. */
export interface NotificationRuleUpdate {
  readonly recipients: readonly RecipientSpec[];
  readonly channels: readonly Channel[];
  readonly enabled: boolean;
}

// --- reminder / escalation settings --------------------------------------------------

/** `GET`/`PUT v1/orgs/{org}/notification-settings`. */
export interface NotificationSettings {
  /** Days before the due date a reminder is sent (0..90). */
  readonly reminder_days: number;
  /** Days overdue per escalation level (1..365). */
  readonly escalation_days: number;
  readonly escalation_role_key: string | null;
  readonly escalate_to_department_lead: boolean;
}

export const REMINDER_DAYS_MAX = 90;
export const ESCALATION_DAYS_MIN = 1;
export const ESCALATION_DAYS_MAX = 365;

// --- department leads ------------------------------------------------------------------

/** `GET v1/orgs/{org}/department-leads` item and `PUT …/departments/{id}/lead` response. */
export interface DepartmentLead {
  readonly department_id: string;
  readonly name: string;
  readonly lead_user_id: string | null;
  readonly lead_name: string | null;
}

// --- current user's preferences --------------------------------------------------------

export const EMAIL_MODES = ['immediate', 'digest', 'off'] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];

/** Built-in preference categories; modules may add their own (their module key). */
export const BUILTIN_CATEGORIES = [
  'assignments',
  'reminders',
  'workflow',
  'mentions',
  'comments',
  'system',
] as const;

/** `GET`/`PUT v1/me/notification-categories?org_id=` item. */
export interface CategoryPref {
  readonly category: string;
  readonly in_app: boolean;
  readonly email: EmailMode;
}

/** `GET`/`PUT v1/me/notification-schedule`. Times are `HH:MM:SS` wall-clock in `timezone`. */
export interface NotificationSchedule {
  readonly quiet_start: string | null;
  readonly quiet_end: string | null;
  readonly timezone: string;
}

export const DEFAULT_TIMEZONE = 'Europe/Oslo';
