import { internalLink } from '../../core/search/internal-link';

/** Query parameter a location link carries back to the requirement it came from. */
export const FROM_REQUIREMENT_PARAM = 'fromRequirement';

/** A router link: path plus query params (null when the URL is not a portal path). */
export interface LocationLink {
  readonly path: string;
  readonly queryParams: Readonly<Record<string, string>> | null;
}

/**
 * Router link of a portal URL from the API (`url`, `create_url`, sample urls),
 * optionally tagged with the requirement the user came from, so the target page
 * can show "Du kom hit fra …". Absolute or protocol-relative URLs give null.
 */
export function locationLink(
  url: string | null | undefined,
  fromRef?: string,
): LocationLink | null {
  const link = internalLink(url);
  if (!link) {
    return null;
  }
  if (!fromRef) {
    return link;
  }
  return {
    path: link.path,
    queryParams: { ...(link.queryParams ?? {}), [FROM_REQUIREMENT_PARAM]: fromRef },
  };
}

/**
 * The place's own name without its module prefix, for buttons ("Kontekst og
 * ledelse: interessenter" -> "Interessenter"). Labels without a prefix are kept.
 */
export function placeName(label: string): string {
  const index = label.indexOf(': ');
  const name = index === -1 ? label : label.slice(index + 2);
  return name ? name.charAt(0).toLocaleUpperCase() + name.slice(1) : label;
}

/** Link styled as the primary button (router links cannot be `app-button`s). */
export const PRIMARY_LINK =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-tile border border-transparent bg-accent px-3 text-ui font-semibold whitespace-nowrap text-white transition-colors hover:bg-accent-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none';

/** Link styled as the secondary button. */
export const SECONDARY_LINK =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold whitespace-nowrap text-fg transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none';

/** Inline text link. */
export const TEXT_LINK =
  'font-semibold text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none';
