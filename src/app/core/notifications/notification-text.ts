import { UserNotification } from './user-notification.models';

/** The i18n key + params to render a notification's title. */
export interface NotificationText {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Title keys the portal knows how to translate. */
const KNOWN_KEYS = new Set([
  'notifications.deviationAssigned',
  'notifications.actionAssigned',
  'notifications.deviationDueSoon',
  'notifications.deviationOverdue',
  'notifications.actionDueSoon',
  'notifications.actionOverdue',
]);

/** Fallback title for keys introduced by a newer backend. */
export const NOTIFICATION_FALLBACK_KEY = 'notifications.fallback';

/**
 * Resolve the translation key for a notification. The backend's `title_key`
 * is refined into a wording variant where a single sentence would read badly:
 * due today / tomorrow, one day overdue, and assignments without an actor.
 */
export function notificationText(notification: UserNotification): NotificationText {
  const { title_key: key } = notification;
  const params = withDescriptionFallback(notification.params);
  if (!KNOWN_KEYS.has(key)) {
    return { key: NOTIFICATION_FALLBACK_KEY, params };
  }
  if (key.endsWith('Assigned')) {
    return { key: params['actor_name'] ? key : `${key}NoActor`, params };
  }
  const days = Number(params['days']);
  if (key.endsWith('DueSoon')) {
    if (days <= 0) return { key: `${key}Today`, params };
    if (days === 1) return { key: `${key}Tomorrow`, params };
    return { key, params };
  }
  // Overdue.
  return { key: days === 1 ? `${key}One` : key, params };
}

/**
 * Action titles end in ": {{description}}". Descriptions are optional, so fall
 * back to the deviation's title rather than render a dangling ": ".
 */
function withDescriptionFallback(
  params: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!('description' in params) || String(params['description'] ?? '').trim()) {
    return params;
  }
  return { ...params, description: params['deviation_title'] ?? '' };
}

/** Portal route a notification links to (every kind belongs to a deviation). */
export function notificationLink(notification: UserNotification): string[] | null {
  const deviationId = notification.params['deviation_id'];
  if (typeof deviationId === 'string' && deviationId) {
    return ['/deviations', deviationId];
  }
  return notification.entity_type === 'deviation' ? ['/deviations', notification.entity_id] : null;
}
