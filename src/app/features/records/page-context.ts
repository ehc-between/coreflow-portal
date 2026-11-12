import { DestroyRef, Injectable, Signal, effect, inject, signal } from '@angular/core';

/*
 * Assistant page context for the record designer, with the exact shape and
 * signature of the platform contract (8.6, `core/ai/page-context.ts`, owned by
 * F5). Until F5 is on main this local stand-in holds the context; afterwards
 * the integrator points the imports at `core/ai/page-context` and deletes this
 * file (no call site changes).
 */

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

export interface PageSelection {
  readonly text?: string;
  readonly field?: string;
  readonly ids?: readonly string[];
}

export interface PageContext {
  readonly module: string | null;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly view: PageView;
  readonly title?: string | null;
  readonly selection?: PageSelection | null;
}

@Injectable({ providedIn: 'root' })
export class PageContextService {
  private readonly _current = signal<PageContext | null>(null);
  private owner: object | null = null;

  readonly current: Signal<PageContext | null> = this._current.asReadonly();

  set(owner: object, ctx: PageContext | null): void {
    this.owner = owner;
    this._current.set(ctx);
  }

  clear(owner: object): void {
    if (this.owner === owner) {
      this.owner = null;
      this._current.set(null);
    }
  }

  setSelection(selection: PageSelection | null): void {
    const current = this._current();
    if (current) {
      this._current.set({ ...current, selection });
    }
  }
}

/** Call in a component constructor; tracks the signal, clears on destroy. */
export function providePageContext(ctx: () => PageContext | null): void {
  const service = inject(PageContextService);
  const owner = {};
  effect(() => service.set(owner, ctx()));
  inject(DestroyRef).onDestroy(() => service.clear(owner));
}
