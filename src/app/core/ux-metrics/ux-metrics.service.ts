import { DestroyRef, Injectable, inject } from '@angular/core';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  Router,
} from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { routeTemplate } from './route-template';
import { UX_MAX_BATCH, UxMetricsApi } from './ux-metrics-api';
import { UX_EVENT_SOURCES, UxEventIn, UxEventSource } from './ux-metrics.models';

/** A source a click can carry (page views are recorded by the service itself). */
export type UxClickSource = Exclude<UxEventSource, 'page_view'>;

/** Attribute that tags a container (or a single control) with its click source. */
export const UX_SOURCE_ATTR = 'data-ux-source';

/** A click only counts when the navigation it started ends within this window. */
const PENDING_TTL_MS = 10_000;
/** Buffered counters are sent at most this long after the first one. */
export const UX_FLUSH_DELAY_MS = 30_000;
/** ...or as soon as this many distinct counters are buffered. */
const FLUSH_SIZE = 50;
/** The backend's per-event count ceiling. */
const MAX_COUNT = 100;

interface Pending {
  readonly source: UxClickSource;
  readonly from: string | null;
  readonly at: number;
}

interface Counter {
  readonly source: UxEventSource;
  readonly from_path: string | null;
  readonly target: string;
  count: number;
}

/**
 * Privacy-safe, org-level click-source counters (simplify U02, IA phase 0):
 * which door people use (side nav, search, palette, Registrer, stat tiles) and
 * which pages are shown, so "simpler" can be measured instead of guessed.
 *
 * What is sent: the source, the route *template* clicked from and landed on
 * (`/risk/risks/:id`, built from the route config, never the URL, so ids,
 * query strings and search text never leave the browser) and a count. No user
 * id and no timestamps; the server stores daily totals per org. Nothing is
 * recorded when the browser sends Do Not Track / Global Privacy Control or no
 * org is selected, and nothing more is sent this session once the server
 * reports the feature switched off.
 *
 * How a click is attributed: one capture-phase listener on the document looks
 * at the clicked link or button. The closest `data-ux-source="…"` wins;
 * without one, links inside `app-side-nav` count as `nav` and links that are
 * (or wrap) an `app-kpi-tile` as `tile`. Code that navigates programmatically
 * calls {@link markNext} first (the command palette does). A click becomes a
 * counter only when the navigation it starts ends, with the landed template
 * as the target.
 */
@Injectable({ providedIn: 'root' })
export class UxMetricsService {
  private readonly router = inject(Router);
  private readonly api = inject(UxMetricsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly destroyRef = inject(DestroyRef);

  private started = false;
  /** Set once the server answers `enabled: false`. */
  private disabled = false;
  private current: string | null = null;
  private pending: Pending | null = null;
  private readonly buffer = new Map<string, Counter>();
  private bufferOrg: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Start listening (idempotent). Called once at bootstrap. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.onNavigationEnd();
      } else if (
        event instanceof NavigationError ||
        (event instanceof NavigationCancel && event.code !== NavigationCancellationCode.Redirect)
      ) {
        this.pending = null;
      }
    });

    const doc = globalThis.document as Document | undefined;
    const onClick = (event: MouseEvent) => this.onClick(event);
    const onVisibility = () => {
      if (doc?.visibilityState === 'hidden') {
        this.flush();
      }
    };
    doc?.addEventListener('click', onClick, true);
    doc?.addEventListener('visibilitychange', onVisibility);

    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      doc?.removeEventListener('click', onClick, true);
      doc?.removeEventListener('visibilitychange', onVisibility);
      this.clearTimer();
    });
  }

  /** Attribute the next navigation to `source` (for code that calls `router.navigate`). */
  markNext(source: UxClickSource): void {
    this.pending = { source, from: this.current, at: Date.now() };
  }

  /** Send the buffered counters now. */
  flush(): void {
    this.clearTimer();
    const orgId = this.bufferOrg;
    const counters = [...this.buffer.values()];
    this.buffer.clear();
    this.bufferOrg = null;
    if (!orgId || counters.length === 0 || this.disabled || !this.auth.isAuthenticated()) {
      return;
    }
    const events = counters.flatMap(splitCount);
    for (let i = 0; i < events.length; i += UX_MAX_BATCH) {
      this.api.record(orgId, events.slice(i, i + UX_MAX_BATCH)).subscribe({
        next: (response) => {
          if (!response.enabled) {
            this.disabled = true;
          }
        },
        // Counters are best-effort: a failed batch is simply lost.
        error: () => undefined,
      });
    }
  }

  private onClick(event: MouseEvent): void {
    // Only plain primary clicks navigate this tab.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest('a[href], button, [role="link"]') ?? null;
    if (!control || (control instanceof HTMLAnchorElement && !isInternal(control))) {
      return;
    }
    // A click with no countable source still ends any earlier, unfinished one.
    const source = clickSource(control);
    if (source) {
      this.markNext(source);
    } else {
      this.pending = null;
    }
  }

  private onNavigationEnd(): void {
    const template = routeTemplate(this.router.routerState.snapshot.root);
    const from = this.current;
    const pending = this.pending;
    this.pending = null;
    this.current = template;
    if (pending && Date.now() - pending.at <= PENDING_TTL_MS) {
      this.add(pending.source, pending.from, template);
    }
    // Query-only changes (filters, tabs kept in the URL) stay the same page.
    if (template !== from) {
      this.add('page_view', null, template);
    }
  }

  private add(source: UxEventSource, from: string | null, target: string): void {
    if (this.disabled || privacySignal()) {
      return;
    }
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    if (this.bufferOrg && this.bufferOrg !== orgId) {
      this.flush();
    }
    this.bufferOrg = orgId;
    const fromPath = source === 'page_view' ? null : from;
    const key = [source, fromPath ?? '', target].join('|');
    const counter = this.buffer.get(key);
    if (counter) {
      counter.count += 1;
    } else {
      this.buffer.set(key, { source, from_path: fromPath, target, count: 1 });
    }
    if (this.buffer.size >= FLUSH_SIZE) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), UX_FLUSH_DELAY_MS);
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * The click source of a link or button, or null when it is not one we count.
 * A `data-ux-source` tag counts for links and buttons; the implicit top-menu
 * and stat-tile rules count links only (the nav's own toggles do not navigate).
 */
export function clickSource(control: Element): UxClickSource | null {
  const tagged = control.closest(`[${UX_SOURCE_ATTR}]`)?.getAttribute(UX_SOURCE_ATTR);
  if (tagged) {
    return isClickSource(tagged) ? tagged : null;
  }
  if (control.tagName !== 'A') {
    return null;
  }
  // The top menu (IA v2) and its dropdowns; app-side-nav kept for old markup in tests.
  if (control.closest('app-top-menu, app-side-nav')) {
    return 'nav';
  }
  if (control.closest('app-kpi-tile') || control.querySelector('app-kpi-tile')) {
    return 'tile';
  }
  return null;
}

function isClickSource(value: string): value is UxClickSource {
  return value !== 'page_view' && (UX_EVENT_SOURCES as readonly string[]).includes(value);
}

function isInternal(anchor: HTMLAnchorElement): boolean {
  if (anchor.target && anchor.target !== '_self') {
    return false;
  }
  try {
    const here = globalThis.location?.href;
    return !!here && new URL(anchor.href, here).origin === new URL(here).origin;
  } catch {
    return false;
  }
}

/** Do Not Track or Global Privacy Control: record nothing. */
function privacySignal(): boolean {
  const nav = globalThis.navigator as (Navigator & { globalPrivacyControl?: boolean }) | undefined;
  return nav?.doNotTrack === '1' || nav?.globalPrivacyControl === true;
}

/** The backend accepts 1-100 per event; larger counts are split. */
function splitCount(counter: Counter): UxEventIn[] {
  const events: UxEventIn[] = [];
  for (let left = counter.count; left > 0; left -= MAX_COUNT) {
    events.push({
      source: counter.source,
      target: counter.target,
      from_path: counter.from_path,
      count: Math.min(left, MAX_COUNT),
    });
  }
  return events;
}
