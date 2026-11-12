import { Provider, inject } from '@angular/core';
import { TRANSLOCO_SCOPE, TranslocoScope } from '@jsverse/transloco';

/**
 * Transloco scope provider for a reusable component that sits inside module
 * pages (kit, guidance, tasks, records…): it *adds* the component's own
 * scope(s) to the scope(s) it inherits instead of replacing them.
 *
 * A plain `provideTranslocoScope('kit')` hides the module's route scope from
 * every pipe beneath the component, so caller-supplied keys (`newKey`, filter
 * options, slot content) translate before the module file has loaded and stay
 * raw. Even with `viewProviders`, Angular lets embedded views of projected
 * content (`@if` / `@for` inside the slot) see the component's view providers.
 * With the merged list a pipe waits for every scope in the chain, so both the
 * component's own keys and the caller's keys resolve.
 *
 * Use it in `viewProviders`; route-level scopes stay `provideTranslocoScope`.
 */
export function provideSharedScope(...scopes: string[]): Provider {
  return {
    provide: TRANSLOCO_SCOPE,
    useFactory: (): TranslocoScope[] => {
      const inherited = inject<TranslocoScope | TranslocoScope[] | null>(TRANSLOCO_SCOPE, {
        skipSelf: true,
        optional: true,
      });
      return mergeScopes(inherited, scopes);
    },
  };
}

/** Inherited scopes first, then `own`, without duplicates or empty entries. */
export function mergeScopes(
  inherited: TranslocoScope | TranslocoScope[] | null | undefined,
  own: readonly TranslocoScope[],
): TranslocoScope[] {
  const all = [...(Array.isArray(inherited) ? inherited : [inherited]), ...own];
  const seen = new Set<string>();
  const merged: TranslocoScope[] = [];
  for (const scope of all) {
    if (!scope) {
      continue;
    }
    const id = typeof scope === 'string' ? scope : `${scope.scope}:${scope.alias ?? ''}`;
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(scope);
    }
  }
  return merged;
}
