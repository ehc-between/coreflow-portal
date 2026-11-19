/** DTOs for the current user's notification inbox (`v1/me/notifications*`). */

/** Notification kinds that predate platform events. */
export type LegacyNotificationKind =
  | 'deviation_assigned'
  | 'action_assigned'
  | 'deviation_due_soon'
  | 'deviation_overdue'
  | 'action_due_soon'
  | 'action_overdue'
  | 'document_review_due'
  | 'document_review_overdue'
  | 'document_submitted'
  | 'document_changes_requested';

/**
 * Since platform events (F3) any registered event kind (`reminder.due_soon`,
 * `risk.created`, …) passes through, so the kind is a plain string.
 */
export type UserNotificationKind = LegacyNotificationKind | (string & {});

/** Any registered entity type (`deviation`, `document`, `task`, `risk`, …). */
export type UserNotificationEntityType = string;

/**
 * One inbox entry. The backend sends no rendered text: `title_key` is an i18n
 * key — global (`notifications.*`) or scoped (`"<scope>:<path>"`) — and
 * `params` holds its interpolation values (including `deviation_id` for
 * deviation kinds, `document_id` for document kinds).
 */
export interface UserNotification {
  readonly id: string;
  readonly org_id: string;
  readonly kind: UserNotificationKind;
  readonly entity_type: UserNotificationEntityType;
  readonly entity_id: string;
  readonly title_key: string;
  /** Preference category (`assignments`, `reminders`, …); null for legacy kinds. */
  readonly category?: string | null;
  readonly params: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly read_at: string | null;
  readonly is_read: boolean;
  /** U08: `todo` when it points at an item in My Work; the bell lists `news` only. */
  readonly feed?: NotificationFeed;
}

/**
 * U08: which notifications a call covers. `news` leaves out the to-dos that already
 * live in My Work (assignments, reminders, approvals); `todo` keeps only those.
 */
export type NotificationFeed = 'all' | 'news' | 'todo';

/** The bell shows news only: everything to do is in My Work. */
export const BELL_FEED: NotificationFeed = 'news';

/** `GET v1/me/notifications` — unread first, then newest. */
export interface UserNotificationList {
  readonly items: readonly UserNotification[];
  readonly total: number;
  readonly unread_count: number;
  readonly limit: number;
  readonly offset: number;
}

export interface UserNotificationListQuery {
  readonly org_id?: string | null;
  readonly unread_only?: boolean;
  readonly limit?: number;
  readonly offset?: number;
  /** Defaults to the bell's feed (`news`). */
  readonly feed?: NotificationFeed;
}

/** `GET v1/me/notifications/unread-count`. */
export interface UnreadCountResponse {
  readonly count: number;
}

/** One org's entry in {@link UnreadCountsByOrgResponse}. */
export interface OrgUnreadCount {
  readonly org_id: string;
  readonly count: number;
}

/**
 * `GET v1/me/notifications/unread-counts`: one entry per org in the caller's
 * access token (0 when nothing is unread), plus the sum across them.
 */
export interface UnreadCountsByOrgResponse {
  readonly items: readonly OrgUnreadCount[];
  readonly total: number;
}

/** `POST v1/me/notifications/read-all`. */
export interface MarkAllReadResponse {
  readonly updated: number;
}

/** Email-digest preference for one org the user belongs to. */
export interface NotificationPreference {
  readonly org_id: string;
  readonly org_name: string;
  readonly email_digest: boolean;
}

/** `GET`/`PUT v1/me/notification-preferences`. */
export interface NotificationPreferencesResponse {
  readonly items: readonly NotificationPreference[];
}

export interface UpdateNotificationPreferenceRequest {
  readonly org_id: string;
  readonly email_digest: boolean;
}
