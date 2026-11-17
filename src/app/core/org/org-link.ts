/**
 * Query parameter that carries the organisation of a deep link. The backend
 * puts it on every link it generates (emails, digests, calendar feeds):
 * `<APP_BASE_URL><portal path>?org=<org uuid>`, so a link opens in the org the
 * record belongs to, whichever org the user last had selected.
 */
export const ORG_QUERY_PARAM = 'org';

/** Where a user lands when a deep link points at an org they don't belong to. */
export const NO_ORG_ACCESS_PATH = '/no-access';

/** Dummy origin used only to parse relative portal paths with `URL`. */
const PARSE_BASE = 'http://portal.invalid';

/**
 * Whether `value` is an internal portal path (`/x...`). Protocol-relative
 * (`//host`), backslash and absolute URLs are rejected, so a stored link can
 * never send the user off-site. Mirrors the backend's `is_portal_path`.
 */
export function isPortalPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && !value.includes('\\');
}

/**
 * Sets `?org=<orgId>` on a portal path, keeping any other query parameters and
 * the fragment. An `org` already on the path is replaced: the link always
 * belongs to the org it is given. Returns null for a non-portal path.
 */
export function withOrg(path: string, orgId: string): string | null {
  if (!isPortalPath(path)) {
    return null;
  }
  const url = new URL(path, PARSE_BASE);
  if (url.origin !== PARSE_BASE) {
    return null;
  }
  url.searchParams.set(ORG_QUERY_PARAM, orgId);
  return `${url.pathname}${url.search}${url.hash}`;
}
