import { DestroyRef, effect, inject, untracked } from '@angular/core';
import { PageContextService } from '../../core/ai/page-context';

/**
 * Tell the assistant which requirements the current page fulfils (design 6.3),
 * so "hva oppfyller denne siden?" or "hva mangler her?" needs no arguments. The
 * refs are added to whichever page context the page registered (they never
 * replace it) and removed when the calling component is destroyed. Call in a
 * constructor; `refs` is tracked as a signal computation.
 */
export function provideLocationContext(refs: () => readonly string[] | null): void {
  const service = inject(PageContextService);
  const owner = {};
  effect(() => {
    const value = refs();
    untracked(() => service.supplement(owner, value));
  });
  inject(DestroyRef).onDestroy(() => service.supplement(owner, null));
}
