import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';

/**
 * Page context for the assistant, in the exact shape of the platform protocol
 * (contracts 8.6, `core/ai/page-context.ts`, owned by F5).
 *
 * Interim, feature-local stand-in until F5 is on main: pages register their context
 * here, and the task AI buttons read it to phrase their requests. The integrator
 * replaces `provideTasksPageContext` with F5's `providePageContext` (same signature)
 * and deletes this file, after which the Ask panel sends the context itself.
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
export class TasksPageContext {
  private readonly _current = signal<PageContext | null>(null);
  private owner: object | null = null;

  readonly current = this._current.asReadonly();

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
}

/** Call in a page constructor: tracks `ctx` reactively and clears it on destroy. */
export function provideTasksPageContext(ctx: () => PageContext | null): void {
  const store = inject(TasksPageContext);
  const owner = {};
  effect(() => store.set(owner, ctx()));
  inject(DestroyRef).onDestroy(() => store.clear(owner));
}
