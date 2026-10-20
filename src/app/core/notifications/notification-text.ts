import { UserNotification } from './user-notification.models';

/** The i18n key + params to render a notification's title. */
export interface NotificationText {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Document workflow keys worded around the acting user (`actor_name`, may be null). */
const DOCUMENT_ACTOR_KEYS = new Set([
  'notifications.documentSubmitted',
  'notifications.documentChangesRequested',
]);

/** Document-control title keys. Review reminders follow the due-soon / overdue variants. */
const DOCUMENT_KEYS = new Set([
  'notifications.documentReviewDue',
  'notifications.documentReviewOverdue',
  ...DOCUMENT_ACTOR_KEYS,
]);

/** Title keys the portal knows how to translate. */
const KNOWN_KEYS = new Set([
  'notifications.deviationAssigned',
  'notifications.actionAssigned',
  'notifications.deviationDueSoon',
  'notifications.deviationOverdue',
  'notifications.actionDueSoon',
  'notifications.actionOverdue',
  ...DOCUMENT_KEYS,
]);

/** Fallback title for keys introduced by a newer backend. */
export const NOTIFICATION_FALLBACK_KEY = 'notifications.fallback';

/**
 * Resolve the translation key for a notification. The backend's `title_key`
 * is refined into a wording variant where a single sentence would read badly:
 * due today / tomorrow, one day overdue, assignments without an actor, and
 * documents without a code (`NoCode`). A `due_date` param is formatted for
 * `lang` (the active UI language) when given.
 */
export function notificationText(notification: UserNotification, lang?: string): NotificationText {
  const { title_key } = notification;
  const params = withLocalDueDate(withDescriptionFallback(notification.params), lang);
  if (!KNOWN_KEYS.has(title_key)) {
    return { key: NOTIFICATION_FALLBACK_KEY, params };
  }
  const key = variantKey(title_key, params);
  if (DOCUMENT_KEYS.has(title_key) && !String(params['doc_code'] ?? '').trim()) {
    return { key: `${key}NoCode`, params };
  }
  return { key, params };
}

function variantKey(key: string, params: Readonly<Record<string, unknown>>): string {
  if (key.endsWith('Assigned') || DOCUMENT_ACTOR_KEYS.has(key)) {
    return params['actor_name'] ? key : `${key}NoActor`;
  }
  const days = Number(params['days']);
  if (key.endsWith('DueSoon') || key === 'notifications.documentReviewDue') {
    if (days <= 0) return `${key}Today`;
    if (days === 1) return `${key}Tomorrow`;
    return key;
  }
  // Overdue.
  return days === 1 ? `${key}One` : key;
}

/**
 * `due_date` arrives as an ISO calendar day (`YYYY-MM-DD`); show it in the
 * UI language's date format. Formatted in UTC so the day never shifts.
 */
function withLocalDueDate(
  params: Readonly<Record<string, unknown>>,
  lang: string | undefined,
): Readonly<Record<string, unknown>> {
  const raw = params['due_date'];
  const match = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(raw) : null;
  if (!lang || !match) {
    return params;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  try {
    const formatted = new Intl.DateTimeFormat(lang, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(date);
    return { ...params, due_date: formatted };
  } catch {
    return params;
  }
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

/** Portal route a notification links to: its deviation or its document. */
export function notificationLink(notification: UserNotification): string[] | null {
  const deviationId = notification.params['deviation_id'];
  if (typeof deviationId === 'string' && deviationId) {
    return ['/deviations', deviationId];
  }
  const documentId = notification.params['document_id'];
  if (typeof documentId === 'string' && documentId) {
    return ['/documents', documentId];
  }
  if (notification.entity_type === 'deviation') {
    return ['/deviations', notification.entity_id];
  }
  return notification.entity_type === 'document' ? ['/documents', notification.entity_id] : null;
}
