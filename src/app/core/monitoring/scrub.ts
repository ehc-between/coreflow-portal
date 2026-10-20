/**
 * Pure helpers that redact secrets (password-reset / invitation tokens and the
 * like) from URLs and free text before anything is handed to error reporting.
 * No Sentry import here, so the logic is trivially unit-testable.
 */

/** Replacement value for redacted secrets (Sentry's own convention). */
export const FILTERED = '[Filtered]';

/**
 * Query-param names treated as secret, case-insensitive: `token`, `code`,
 * `secret`, `password`, optionally prefixed with `xxx_` / `xxx-` (so
 * `access_token`, `reset-token`, `auth_code` match, but `postcode` does not).
 * Also the signing params of presigned S3 URLs, `X-Amz-Signature` and
 * `X-Amz-Credential` (`X-Amz-Security-Token` is already covered by `token`).
 */
const SECRET_PARAM =
  /^(?:(?:.*[_-])?(?:token|code|secret|password)|x-amz-(?:signature|credential))$/i;

/**
 * API paths that carry a secret as a path segment: the public invitation
 * preview is `GET …/invitations/{token}` (the `accept` endpoint is not secret).
 */
const SECRET_PATH = /(\/invitations\/)(?!accept(?:[/?#;:,)\s]|$))[^/?#\s"':;,)]+/gi;

/** Same idea as {@link SECRET_PARAM}, for params embedded in arbitrary text. */
const SECRET_PARAM_IN_TEXT =
  /((?:^|[?&#;])(?:(?:[\w.-]*[_-])?(?:token|code|secret|password)|x-amz-(?:signature|credential))=)[^&#\s"']*/gi;

/** Whether a (possibly percent-encoded) param name is a secret one. */
export function isSecretParam(name: string): boolean {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name.replace(/\+/g, ' '));
  } catch {
    // Malformed escape: judge the raw name.
  }
  return SECRET_PARAM.test(decoded.trim());
}

/**
 * Redact secret params in a `a=1&b=2` style string (no leading `?`). Returns
 * the input unchanged (same string) when nothing is secret.
 */
export function scrubQuery(query: string): string {
  if (!query) {
    return query;
  }
  let changed = false;
  const parts = query.split('&').map((part) => {
    const eq = part.indexOf('=');
    const name = eq === -1 ? part : part.slice(0, eq);
    if (eq === -1 || !isSecretParam(name)) {
      return part;
    }
    changed = true;
    return `${name}=${FILTERED}`;
  });
  return changed ? parts.join('&') : query;
}

/**
 * Redact secrets from a URL of any shape: absolute, protocol-relative,
 * root-relative, bare path, or just `?query` / `#fragment`. Secret query params
 * get their value replaced with `[Filtered]`; a fragment that itself looks like
 * a query (`#token=…` or `#/path?token=…`) is scrubbed the same way; secret
 * path segments (invitation tokens) are replaced too. Everything else,
 * including encoding and param order, is preserved byte-for-byte.
 */
export function scrubUrl(url: string): string {
  if (!url) {
    return url;
  }

  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? null : url.slice(hashAt + 1);

  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? null : beforeHash.slice(queryAt + 1);

  let result = path.replace(SECRET_PATH, `$1${FILTERED}`);
  if (query !== null) {
    result += `?${scrubQuery(query)}`;
  }
  if (fragment !== null) {
    result += `#${scrubFragment(fragment)}`;
  }
  return result;
}

function scrubFragment(fragment: string): string {
  const queryAt = fragment.indexOf('?');
  if (queryAt !== -1) {
    // Hash-routing style: `#/reset-password?token=…`.
    return `${fragment.slice(0, queryAt)}?${scrubQuery(fragment.slice(queryAt + 1))}`;
  }
  return fragment.includes('=') ? scrubQuery(fragment) : fragment;
}

/** Whether {@link scrubUrl} would redact anything in this URL. */
export function hasSecrets(url: string): boolean {
  return scrubUrl(url) !== url;
}

/**
 * Redact secrets from arbitrary text that may embed URLs (error messages such
 * as "Http failure response for …/invitations/<token>: 500", log lines, span
 * descriptions like "GET /x?token=…").
 */
export function scrubText(text: string): string {
  if (!text) {
    return text;
  }
  return scrubUrl(text)
    .replace(SECRET_PARAM_IN_TEXT, `$1${FILTERED}`)
    .replace(SECRET_PATH, `$1${FILTERED}`);
}

const MAX_DEPTH = 10;

/**
 * Deep-copy a JSON-like value, applying {@link scrubText} to every string.
 * Plain objects and arrays are walked; anything else is returned as-is.
 */
export function scrubDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') {
    return scrubText(value) as T;
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => scrubDeep(item, depth + 1)) as T;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = scrubDeep(item, depth + 1);
  }
  return out as T;
}

/** Event sections that can carry URLs or user-visible text. */
const EVENT_KEYS = [
  'request',
  'transaction',
  'message',
  'logentry',
  'exception',
  'breadcrumbs',
  'spans',
  'contexts',
  'tags',
  'extra',
  // Replay events list the visited page URLs.
  'urls',
] as const;

/**
 * Scrub a Sentry event (error, transaction or replay event) in place and return
 * it: request URL/query string/headers (e.g. Referer), transaction name,
 * messages and exception values, breadcrumbs, spans, contexts, tags, extra and
 * replay URLs. Stack frames are left alone.
 */
export function scrubEvent<T extends object>(event: T): T {
  const record = event as Record<string, unknown>;
  for (const key of EVENT_KEYS) {
    if (record[key] !== undefined) {
      record[key] = scrubDeep(record[key]);
    }
  }
  const request = record['request'] as Record<string, unknown> | undefined;
  if (request && request['query_string'] !== undefined) {
    request['query_string'] = scrubQueryString(request['query_string']);
  }
  return event;
}

/**
 * Scrub a Sentry `request.query_string`, which may be a string (with or
 * without a leading `?`), a list of `[name, value]` pairs or a name→value map.
 */
export function scrubQueryString(queryString: unknown): unknown {
  if (typeof queryString === 'string') {
    return queryString.startsWith('?')
      ? `?${scrubQuery(queryString.slice(1))}`
      : scrubQuery(queryString);
  }
  if (Array.isArray(queryString)) {
    return queryString.map((pair: unknown) =>
      Array.isArray(pair) && typeof pair[0] === 'string' && isSecretParam(pair[0])
        ? [pair[0], FILTERED]
        : pair,
    );
  }
  if (queryString && typeof queryString === 'object') {
    return Object.fromEntries(
      Object.entries(queryString).map(([name, value]) => [
        name,
        isSecretParam(name) ? FILTERED : value,
      ]),
    );
  }
  return queryString;
}

/** Scrub a breadcrumb (navigation from/to, fetch/xhr url, message). */
export function scrubBreadcrumb<T extends object>(breadcrumb: T): T {
  return scrubDeep(breadcrumb);
}

/**
 * Scrub a custom Replay recording event (breadcrumb and performance-span
 * frames, e.g. `navigation.push` whose description is the URL).
 */
export function scrubRecordingEvent<T extends object>(event: T): T {
  return scrubDeep(event);
}
