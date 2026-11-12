/** A portal path split for `[routerLink]` + `[queryParams]`. */
export interface InternalLink {
  readonly path: string;
  readonly queryParams: Readonly<Record<string, string>> | null;
}

/**
 * Turn a record URL from the API (`/documents/<id>`,
 * `/deviations/<id>?action=<id>`, `/standards/iso9001?req=iso9001:6.1`) into
 * router-link parts. Only in-app absolute paths are accepted: anything else
 * (an external URL, `//host`, `javascript:`) yields null so it is never linked.
 */
export function internalLink(url: string | null | undefined): InternalLink | null {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) {
    return null;
  }
  const withoutHash = url.split('#')[0];
  const queryIndex = withoutHash.indexOf('?');
  const path = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  if (!path) {
    return null;
  }
  if (queryIndex === -1) {
    return { path, queryParams: null };
  }
  const params = new URLSearchParams(withoutHash.slice(queryIndex + 1));
  const queryParams: Record<string, string> = {};
  params.forEach((value, key) => {
    queryParams[key] = value;
  });
  return { path, queryParams: Object.keys(queryParams).length ? queryParams : null };
}
