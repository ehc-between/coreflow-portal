/**
 * DTOs for the org-level click-source counters (`app/platform/ux_metrics` in
 * coreflow-core). Only route templates and daily counts are sent: no user id,
 * no search text, no query string.
 */

/** Where a navigation started. Mirrors the backend's `UxEventSource` enum. */
export type UxEventSource = 'nav' | 'search' | 'palette' | 'register' | 'tile' | 'page_view';

/** The sources in the order the backend reports them. */
export const UX_EVENT_SOURCES: readonly UxEventSource[] = [
  'nav',
  'search',
  'palette',
  'register',
  'tile',
  'page_view',
];

/** One counter increment. `from_path` is ignored for `page_view`. */
export interface UxEventIn {
  readonly source: UxEventSource;
  /** Route template the user went to or was shown (1-500 chars), e.g. `/risk/risks/:id`. */
  readonly target: string;
  /** Route template the user clicked from (≤500 chars), or null. */
  readonly from_path: string | null;
  /** 1-100. */
  readonly count: number;
}

/** POST /v1/orgs/{org_id}/ux-events body: 1-200 events. Extra keys are rejected (422). */
export interface UxEventBatchIn {
  readonly events: readonly UxEventIn[];
}

/** 202 response. `enabled: false` means the server drops counters (UX_METRICS_ENABLED=false). */
export interface UxEventBatchOut {
  readonly accepted: number;
  readonly enabled: boolean;
}

export interface UxSourceCount {
  readonly source: UxEventSource;
  readonly count: number;
}

export interface UxDayCount {
  /** YYYY-MM-DD (UTC). */
  readonly day: string;
  readonly count: number;
}

export interface UxTopRow {
  readonly source: UxEventSource;
  readonly from_path: string | null;
  readonly target: string;
  readonly count: number;
}

/** GET /v1/orgs/{org_id}/ux-events/summary (permission `org:manage`). */
export interface UxSummaryOut {
  readonly from_day: string;
  readonly to_day: string;
  readonly days: number;
  readonly total: number;
  /** All six sources, zeros included, in {@link UX_EVENT_SOURCES} order. */
  readonly by_source: readonly UxSourceCount[];
  /** Only days with events, ascending. */
  readonly by_day: readonly UxDayCount[];
  /** Sorted by count desc, then source / from_path / target. */
  readonly top: readonly UxTopRow[];
}
