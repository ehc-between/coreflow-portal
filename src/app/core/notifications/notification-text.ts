import { UserNotification } from './user-notification.models';

/** The i18n key + params to render a notification's title. */
export interface NotificationText {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Lookups the caller provides so the function stays pure. In the app these
 * are backed by `LanguageService.translate` (signal-tracked), so a computed
 * re-resolves once a scope file or the language file has loaded.
 */
export interface NotificationTextOptions {
  /** Whether `key` (flattened, e.g. `risk.notifications.x`) has a translation. */
  readonly has?: (key: string) => boolean;
  /** Translate `key` (used for the entity label of reminder kinds). */
  readonly translate?: (key: string) => string;
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

/**
 * Generic due-date reminders from the platform scan (`reminder.*` kinds). Params:
 * `{title, code, due_date, days, module, entity_label_key, url, entity_type}`.
 */
const REMINDER_KEYS = new Set([
  'notifications.reminderDueSoon',
  'notifications.reminderOverdue',
  'notifications.reminderEscalated',
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
  ...REMINDER_KEYS,
]);

/** Fallback title for keys introduced by a newer backend. */
export const NOTIFICATION_FALLBACK_KEY = 'notifications.fallback';

/** Entity label used when a reminder's `entity_label_key` has no translation. */
export const REMINDER_ENTITY_FALLBACK_KEY = 'notifications.reminderEntityFallback';

/** A scoped title key `"<scope>:<path>"` split into its parts. */
export interface ScopedKey {
  readonly scope: string;
  readonly path: string;
}

/** Parse `"risk:notifications.treatmentAssigned"`; null for a global key. */
export function parseScopedKey(key: string): ScopedKey | null {
  const match = /^([a-z][a-z0-9_/-]*):(.+)$/.exec(key);
  return match ? { scope: match[1], path: match[2] } : null;
}

/**
 * The prefix Transloco gives a scope's keys once it is loaded (`ai-governance`
 * -> `aiGovernance`). Mirrors Transloco's default `toCamelCase` scope mapping.
 */
export function scopeAlias(scope: string): string {
  return scope
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index: number) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase(),
    )
    .replace(/\s+|_|-|\//g, '');
}

/** The flattened key a scoped key translates as (`risk:a.b` -> `risk.a.b`). */
export function flattenScopedKey(key: string): string {
  const scoped = parseScopedKey(key);
  return scoped ? `${scopeAlias(scoped.scope)}.${scoped.path}` : key;
}

/**
 * Resolve the translation key for a notification. The backend's `title_key`
 * is refined into a wording variant where a single sentence would read badly:
 * due today / tomorrow, one day overdue, assignments without an actor, and
 * records without a code (`NoCode`). A `due_date` param is formatted for
 * `lang` (the active UI language) when given.
 *
 * Scoped keys (`"<scope>:<path>"`) resolve to the scope's flattened key once
 * `options.has` reports it translated (the caller loads the scope); until
 * then, and for unknown global keys, the generic fallback is shown.
 */
export function notificationText(
  notification: UserNotification,
  lang?: string,
  options: NotificationTextOptions = {},
): NotificationText {
  const { title_key } = notification;
  const params = withLocalDueDate(withDescriptionFallback(notification.params), lang);
  if (parseScopedKey(title_key)) {
    const flat = flattenScopedKey(title_key);
    return { key: options.has?.(flat) ? flat : NOTIFICATION_FALLBACK_KEY, params };
  }
  if (!KNOWN_KEYS.has(title_key)) {
    return { key: NOTIFICATION_FALLBACK_KEY, params };
  }
  const key = variantKey(title_key, params);
  if (REMINDER_KEYS.has(title_key)) {
    const withEntity = { ...params, entity: entityLabel(params, options) };
    return { key: hasCode(params, 'code') ? key : `${key}NoCode`, params: withEntity };
  }
  if (DOCUMENT_KEYS.has(title_key) && !hasCode(params, 'doc_code')) {
    return { key: `${key}NoCode`, params };
  }
  return { key, params };
}

function hasCode(params: Readonly<Record<string, unknown>>, name: string): boolean {
  return String(params[name] ?? '').trim() !== '';
}

/** The reminder's entity type label (`modules.entities.<type>`), else a neutral word. */
function entityLabel(
  params: Readonly<Record<string, unknown>>,
  { has, translate }: NotificationTextOptions,
): string {
  if (!translate) {
    return '';
  }
  const labelKey = params['entity_label_key'];
  if (typeof labelKey === 'string' && labelKey) {
    const flat = flattenScopedKey(labelKey);
    if (has ? has(flat) : true) {
      return translate(flat);
    }
  }
  return translate(REMINDER_ENTITY_FALLBACK_KEY);
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
  // Overdue and escalated.
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

/** Known entity types whose portal route is `/<path>/<id>`. */
const ENTITY_ROUTES: Readonly<Record<string, string>> = {
  deviation: '/deviations',
  document: '/documents',
  task: '/tasks',
};

/**
 * Portal route a notification links to: its deviation or its document, an
 * in-app `url` param from the event, else the entity type's detail route.
 */
export function notificationLink(notification: UserNotification): string[] | null {
  const deviationId = notification.params['deviation_id'];
  if (typeof deviationId === 'string' && deviationId) {
    return ['/deviations', deviationId];
  }
  const documentId = notification.params['document_id'];
  if (typeof documentId === 'string' && documentId) {
    return ['/documents', documentId];
  }
  const url = notification.params['url'];
  if (typeof url === 'string' && /^\/[^/\\]/.test(url)) {
    return [url];
  }
  const base = ENTITY_ROUTES[notification.entity_type];
  return base ? [base, notification.entity_id] : null;
}

/** Scopes a list of notifications needs loaded to render their titles. */
export function scopesFor(notifications: readonly UserNotification[]): readonly string[] {
  const scopes = new Set<string>();
  for (const n of notifications) {
    const title = parseScopedKey(n.title_key);
    if (title) scopes.add(title.scope);
    const label = n.params['entity_label_key'];
    const entity = typeof label === 'string' ? parseScopedKey(label) : null;
    if (entity) scopes.add(entity.scope);
  }
  return [...scopes];
}
