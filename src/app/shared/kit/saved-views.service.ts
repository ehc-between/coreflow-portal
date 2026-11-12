import { Injectable, Signal, computed, signal } from '@angular/core';

/** A named list state (search text + filter values) a user saved for quick return. */
export interface SavedView {
  readonly id: string;
  readonly name: string;
  readonly query: string;
  readonly filters: Readonly<Record<string, string>>;
}

/** At most this many views are kept per list page. */
export const MAX_SAVED_VIEWS = 20;

/** localStorage key of the saved views of one list page. */
export function savedViewsKey(scope: string, page: string): string {
  return `coreflow.views.${scope}.${page}`;
}

function isView(value: unknown): value is SavedView {
  const v = value as SavedView | null;
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.query === 'string' &&
    !!v.filters &&
    typeof v.filters === 'object'
  );
}

/**
 * Saved list views per `<scope>.<page>`, kept in this browser's localStorage
 * (`coreflow.views.<scope>.<page>`). Reading is reactive: `views()` updates
 * after `save` / `remove`. Storage failures (private mode, quota) are ignored.
 */
@Injectable({ providedIn: 'root' })
export class SavedViewsService {
  private readonly version = signal(0);

  views(scope: string, page: string): Signal<readonly SavedView[]> {
    return computed(() => {
      this.version();
      return this.read(scope, page);
    });
  }

  list(scope: string, page: string): readonly SavedView[] {
    return this.read(scope, page);
  }

  /** Save a view (a view with the same name is replaced). Returns the stored view. */
  save(scope: string, page: string, view: Omit<SavedView, 'id'>): SavedView {
    const name = view.name.trim();
    const stored: SavedView = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name,
      query: view.query,
      filters: { ...view.filters },
    };
    const others = this.read(scope, page).filter(
      (v) => v.name.toLowerCase() !== name.toLowerCase(),
    );
    this.write(scope, page, [...others, stored].slice(-MAX_SAVED_VIEWS));
    return stored;
  }

  remove(scope: string, page: string, id: string): void {
    this.write(
      scope,
      page,
      this.read(scope, page).filter((v) => v.id !== id),
    );
  }

  private read(scope: string, page: string): readonly SavedView[] {
    try {
      const raw = globalThis.localStorage?.getItem(savedViewsKey(scope, page));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isView) : [];
    } catch {
      return [];
    }
  }

  private write(scope: string, page: string, views: readonly SavedView[]): void {
    try {
      globalThis.localStorage?.setItem(savedViewsKey(scope, page), JSON.stringify(views));
    } catch {
      // Best-effort persistence.
    }
    this.version.update((n) => n + 1);
  }
}
