import {
  DestroyRef,
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

/** What kind of page the user is on (mirrors the backend `PageView` literal). */
export type PageView =
  | 'list'
  | 'detail'
  | 'edit'
  | 'new'
  | 'board'
  | 'calendar'
  | 'dashboard'
  | 'settings'
  | 'other';

/** What the user has selected on the page: some text, a field, or record ids. */
export interface PageSelection {
  readonly text?: string;
  readonly field?: string;
  readonly ids?: readonly string[];
}

/**
 * The page-context protocol (platform contracts 8.6): each page tells the
 * assistant what it shows, so "this risk" or "this audit" resolves to a record.
 * `module` is the backend module key (snake_case), `entityType` the polymorphic
 * record name (e.g. `document`).
 */
export interface PageContext {
  readonly module: string | null;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly view: PageView;
  readonly title?: string | null;
  readonly selection?: PageSelection | null;
}

/** The wire shape of {@link PageContext} (`AskRequest.page_context`, snake_case). */
export interface PageContextDto {
  readonly module: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly view: PageView;
  readonly route: string | null;
  readonly title: string | null;
  readonly selection: {
    readonly text: string | null;
    readonly field: string | null;
    readonly ids: readonly string[];
  } | null;
}

interface Entry {
  readonly owner: object;
  readonly ctx: PageContext | null;
}

/**
 * Holds the page context registered by the pages currently on screen. Several
 * owners may register at once (a list page and an open detail pane); the most
 * recently registered non-null context wins. The selection is kept separately
 * so a page can update it without re-registering, and it is cleared whenever the
 * owning page goes away.
 */
@Injectable({ providedIn: 'root' })
export class PageContextService {
  private readonly entries = signal<readonly Entry[]>([]);
  private readonly selection = signal<PageSelection | null>(null);

  /** The active page context (with the live selection merged in), or null. */
  readonly current: Signal<PageContext | null> = computed(() => {
    const entries = this.entries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const ctx = entries[i].ctx;
      if (ctx) {
        const selection = this.selection() ?? ctx.selection ?? null;
        return selection === (ctx.selection ?? null) ? ctx : { ...ctx, selection };
      }
    }
    return null;
  });

  /** Register (or replace) the context for `owner`. */
  set(owner: object, ctx: PageContext | null): void {
    this.entries.update((entries) => {
      const index = entries.findIndex((entry) => entry.owner === owner);
      if (index === -1) {
        return [...entries, { owner, ctx }];
      }
      const next = [...entries];
      next[index] = { owner, ctx };
      return next;
    });
  }

  /** Drop `owner`'s context (e.g. on destroy). Also clears the selection. */
  clear(owner: object): void {
    const had = this.entries().some((entry) => entry.owner === owner);
    if (!had) {
      return;
    }
    this.entries.update((entries) => entries.filter((entry) => entry.owner !== owner));
    this.selection.set(null);
  }

  /** Set what the user has selected on the current page (null clears it). */
  setSelection(selection: PageSelection | null): void {
    this.selection.set(selection);
  }
}

/**
 * Register page context for the calling component. Call in a constructor (an
 * injection context): the function is tracked as a signal computation, so the
 * context follows the page's signals (e.g. once the record has loaded), and it
 * is cleared when the component is destroyed.
 *
 *   constructor() {
 *     providePageContext(() => ({ module: 'risk', entityType: 'risk', entityId: this.id(), view: 'detail' }));
 *   }
 */
export function providePageContext(ctx: () => PageContext | null): void {
  const service = inject(PageContextService);
  const owner = {};
  effect(() => {
    const value = ctx();
    untracked(() => service.set(owner, value));
  });
  inject(DestroyRef).onDestroy(() => service.clear(owner));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Portal top-level segments that are app pages rather than modules. */
const NON_MODULE_SEGMENTS: Readonly<Record<string, PageView>> = {
  dashboard: 'dashboard',
  settings: 'settings',
  account: 'settings',
  admin: 'settings',
  review: 'list',
  'my-work': 'list',
};

/**
 * Build the `page_context` wire payload from the registered context (or, when no
 * page registered any, a minimal one derived from the URL so the assistant still
 * knows roughly where the user is). Values are clipped to the backend's limits and
 * ids that are not UUIDs are dropped, so a page can never make Ask fail with a 422.
 */
export function toPageContextDto(ctx: PageContext | null, url: string): PageContextDto | null {
  const route = clip(url.split('#')[0], 300);
  const base = ctx ?? fallbackContext(url);
  if (!base) {
    return null;
  }
  const entityId = base.entityId && UUID_RE.test(base.entityId) ? base.entityId : null;
  const selection = base.selection ?? null;
  return {
    module: clip(base.module, 32),
    entity_type: clip(base.entityType ?? null, 32),
    entity_id: entityId,
    view: base.view,
    route,
    title: clip(base.title ?? null, 200),
    selection: selection
      ? {
          text: clip(selection.text ?? null, 2000),
          field: clip(selection.field ?? null, 64),
          ids: (selection.ids ?? []).filter((id) => UUID_RE.test(id)).slice(0, 50),
        }
      : null,
  };
}

/** A URL-derived context: the first path segment as the module (kebab → snake). */
export function fallbackContext(url: string): PageContext | null {
  const path = url.split(/[?#]/)[0];
  const segment = path.split('/').filter(Boolean)[0];
  if (!segment) {
    return null;
  }
  const nonModule = NON_MODULE_SEGMENTS[segment];
  if (nonModule) {
    return { module: null, view: nonModule };
  }
  return { module: segment.replace(/-/g, '_'), view: 'other' };
}

function clip(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}
