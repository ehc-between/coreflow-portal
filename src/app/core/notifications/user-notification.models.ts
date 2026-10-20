/** DTOs for the current user's notification inbox (`v1/me/notifications*`). */

export type UserNotificationKind =
  | 'deviation_assigned'
  | 'action_assigned'
  | 'deviation_due_soon'
  | 'deviation_overdue'
  | 'action_due_soon'
  | 'action_overdue';

export type UserNotificationEntityType = 'deviation' | 'deviation_action';

/**
 * One inbox entry. The backend sends no rendered text: `title_key` is an i18n
 * key under `notifications.*` and `params` holds its interpolation values
 * (always including `deviation_id`).
 */
export interface UserNotification {
  readonly id: string;
  readonly org_id: string;
  readonly kind: UserNotificationKind;
  readonly entity_type: UserNotificationEntityType;
  readonly entity_id: string;
  readonly title_key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly read_at: string | null;
  readonly is_read: boolean;
}

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
}

/** `GET v1/me/notifications/unread-count`. */
export interface UnreadCountResponse {
  readonly count: number;
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
